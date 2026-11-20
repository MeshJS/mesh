import { deserializeAddress, mConStr0, UTxO } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTxData,
  guard,
  output,
  spend,
  TxBuilder,
  TxBuildError,
  TxPartError,
} from "../../src/tx-builder";
import { vestingCbor } from "../test-util";
import { mapPairs, topItems, uint } from "./cbor-util";

const words = Array(24).fill("solution");
const vesting = { code: vestingCbor, version: "V3" as const };

/** A preprod wallet of the fixture's seed, funded on the emulator with 100 and 5 ADA */
const fundedWallet = async (emulator: TxEmulator, accountIndex: number) => {
  const wallet = new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountIndex,
  });
  await wallet.init();
  const address = (await wallet.getChangeAddress())!;
  emulator.fund(address, { lovelace: 100_000_000n });
  emulator.fund(address, { lovelace: 5_000_000n });
  return {
    wallet,
    address,
    keyHash: deserializeAddress(address).pubKeyHash,
    payer: () => ({
      changeAddress: address,
      utxos: emulator.utxos({ address }),
    }),
  };
};

/** The datums of a transaction's witness set: none when it has no key 4 */
const witnessDatums = (tx: string) =>
  mapPairs(topItems(tx)[1]!).filter(([key]) => key === uint(4));

const caught = async (run: () => Promise<unknown>): Promise<any> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};

/*
 * A datum given as `{ data }` for an output that holds its datum inline: a check against the
 * UTxO, never put in the witness set, and the script is judged on the datum the UTxO holds. The
 * vesting validator lets its owner spend at any time: an inline datum that names the owner who
 * signs makes it pass, one that names another key makes it fail.
 */
describe("spend.plutus with { data } for an output that holds its datum inline, on TxEmulator", () => {
  it("checks the data against the UTxO, puts it in no witness set, and the evaluator is given the inline datum of the resolved UTxO: one that makes the script pass, one that makes it fail", async () => {
    const emulator = await TxEmulator.create({
      validator: "scalus",
      network: "preprod",
      slot: 100_000_000,
    });
    const builder = new TxBuilder({
      network: "preprod",
      provider: emulator,
      evaluator: emulator,
    });
    const owner = await fundedWallet(emulator, 0);
    const other = await fundedWallet(emulator, 1);
    const scriptAddress = builder.scriptAddress(vesting);
    const later = emulator.time + 3_600_000_000;
    const passing = mConStr0([later, owner.keyHash, other.keyHash]);
    const failing = mConStr0([later, other.keyHash, other.keyHash]);
    const lockOf = (data: ReturnType<typeof mConStr0>) =>
      output({
        address: scriptAddress,
        value: { lovelace: 20_000_000n },
        datum: { type: "inline", data },
      });
    const lock = await builder.build(
      [lockOf(passing), lockOf(failing), lockOf(passing)],
      { payer: owner.payer() },
    );
    await emulator.submitTx(await owner.wallet.signTx(lock.tx));
    const locked = (outputIndex: number): UTxO =>
      emulator
        .utxos({ address: scriptAddress })
        .find((u) => u.input.outputIndex === outputIndex)!;
    const [pass, fail, byRef] = [locked(0), locked(1), locked(2)];
    const passHex = pass.output.plutusData!;
    const failHex = fail.output.plutusData!;
    expect(passHex).not.toBe(failHex);

    const evaluate = jest.spyOn(emulator, "evaluateTx");
    /** The inline datum the evaluator was given for the UTxO of this out ref, last call */
    const evaluatedDatum = (utxo: UTxO) =>
      (evaluate.mock.calls.at(-1)![1] as UTxO[]).find(
        (each) =>
          each.input.txHash === utxo.input.txHash &&
          each.input.outputIndex === utxo.input.outputIndex,
      )?.output.plutusData;
    const unlock = (utxo: UTxO | UTxO["input"], data: string) =>
      builder.build(
        [
          spend.plutus({
            utxo,
            script: vesting,
            redeemer: { data: mConStr0([]) },
            datum: { data: { type: "CBOR", content: data } },
          }),
          guard.pubKey({ address: owner.address }),
        ],
        { payer: owner.payer() },
      );
    const submit = async (built: BuiltTxData) =>
      expect(await emulator.submitTx(await owner.wallet.signTx(built.tx))).toBe(
        built.txHash,
      );

    // The datum that names the owner: the script passes on the UTxO's datum, and none is carried
    const built = await unlock(pass, passHex);
    expect(evaluatedDatum(pass)).toBe(passHex);
    expect(witnessDatums(built.tx)).toEqual([]);
    await submit(built);

    // The datum that names another key: the script fails on it
    const failed = await caught(() => unlock(fail, failHex));
    expect(failed).toBeInstanceOf(TxBuildError);
    expect(failed.code).toBe("EVALUATION_FAILED");
    expect(evaluatedDatum(fail)).toBe(failHex);

    // Data that is not the UTxO's datum is refused before any evaluation, given in full or by its
    // out ref, which the build reads
    evaluate.mockClear();
    for (const utxo of [fail, fail.input]) {
      const mismatch = await caught(() => unlock(utxo, passHex));
      expect(mismatch).toBeInstanceOf(TxPartError);
      expect(mismatch.code).toBe("DATUM_MISMATCH");
      expect(mismatch.message).toContain(
        `${fail.input.txHash}#${fail.input.outputIndex} holds its datum inline`,
      );
      expect(mismatch.message.includes(passHex)).toBe(false);
    }
    expect(evaluate).not.toHaveBeenCalled();

    // By out ref: the UTxO read by the build is checked the same way, and its datum is judged
    const read = await unlock(byRef.input, passHex);
    expect(evaluatedDatum(byRef)).toBe(passHex);
    expect(witnessDatums(read.tx)).toEqual([]);
    await submit(read);
    expect(emulator.utxos({ address: scriptAddress })).toEqual([fail]);
  }, 60_000);
});
