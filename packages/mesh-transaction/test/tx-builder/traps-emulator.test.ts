import { mConStr0, resolveScriptRef, UTxO } from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTx,
  collateral,
  output,
  referenceInput,
  spend,
  TxBuilder,
  TxPart,
} from "../../src/tx-builder";
import { alwaysSucceedCbor } from "../test-util";

// The always-succeeding validator in each form its code may take
const double = alwaysSucceedCbor;
const single = double.slice(4);
const flat = single.slice(4);
const plutusScript = { code: double, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const lovelace = (n: number) => [
  { unit: "lovelace", quantity: String(BigInt(n) * 1_000_000n) },
];

/*
 * Transactions the builder used to get wrong without an error of its own, built against the
 * emulator, signed and submitted to it: its ledger rules check what the builder made of them.
 */
describe("TxBuilder's input traps on the emulator", () => {
  let wallet: MeshWallet;
  let address: string;

  beforeAll(async () => {
    wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words: Array(24).fill("solution") },
    });
    await wallet.init();
    address = (await wallet.getChangeAddress())!;
  });

  let next = 0;
  const at = (
    addr: string,
    ada: number,
    extra: Partial<UTxO["output"]> = {},
  ): UTxO => ({
    input: { txHash: (++next).toString(16).padStart(64, "0"), outputIndex: 0 },
    output: { address: addr, amount: lovelace(ada), ...extra },
  });
  const locked = (ada = 10) => at(scriptAddress, ada, { plutusData: "d87980" });
  const keyOf = (u: UTxO) => `${u.input.txHash}#${u.input.outputIndex}`;
  const outRefs = (
    inputs?: { transaction_id: string; index: number }[] | null,
  ) => (inputs ?? []).map((i) => `${i.transaction_id}#${i.index}`);

  const emulatorWith = (utxos: UTxO[]) => ScalusEmulator.create(utxos);
  const build = async (
    emulator: ScalusEmulator,
    parts: TxPart[],
    fee?: bigint,
  ) =>
    new TxBuilder({ fetcher: emulator, evaluator: emulator }).build({
      parts,
      changeAddress: address,
      utxos: await emulator.fetchAddressUTxOs(address),
      ...(fee !== undefined && { fee }),
    });
  // The ledger accepts the signed transaction under the hash the builder gave it
  const submit = async (emulator: ScalusEmulator, built: BuiltTx) =>
    expect(await emulator.submitTx(await wallet.signTx(built.tx))).toBe(
      built.txHash,
    );
  const unlock = (
    utxo: UTxO,
    script: Parameters<typeof spend.plutus>[0]["script"],
  ) => spend.plutus({ utxo, script, redeemer: { data: mConStr0([]) } });

  it.each([
    ["its single CBOR wrapping", single],
    ["the flat program", flat],
  ])(
    "spends an output locked by a blueprint's script given as %s",
    async (_, code) => {
      const lock = locked();
      const emulator = await emulatorWith([at(address, 100), lock]);
      const built = await build(emulator, [
        unlock(lock, { code, version: "V3" }),
      ]);

      await submit(emulator, built);
    },
  );

  it("neither spends nor puts up the UTxOs the parts read", async () => {
    const oracle = at(address, 1000);
    const holder = at(address, 20, {
      scriptRef: resolveScriptRef(plutusScript),
    });
    const lock = locked();
    const emulator = await emulatorWith([
      oracle,
      holder,
      at(address, 50),
      at(address, 5),
      lock,
    ]);
    const built = await build(emulator, [
      unlock(lock, { reference: holder }),
      referenceInput({ utxo: oracle }),
      output({ address, value: { lovelace: 30_000_000n } }),
    ]);

    const { body } = built.prototype;
    expect(outRefs(body.reference_inputs).sort()).toEqual(
      [keyOf(oracle), keyOf(holder)].sort(),
    );
    for (const read of [oracle, holder]) {
      expect(outRefs(body.inputs)).not.toContain(keyOf(read));
      expect(outRefs(body.collateral)).not.toContain(keyOf(read));
    }
    await submit(emulator, built);
  });

  it("spends a collateral part's UTxO only when a spend part names it too", async () => {
    const putUp = at(address, 50);
    const [first, second] = [locked(), locked()];
    const emulator = await emulatorWith([
      putUp,
      at(address, 40),
      first,
      second,
    ]);

    const kept = await build(emulator, [
      unlock(first, plutusScript),
      collateral({ utxo: putUp }),
      output({ address, value: { lovelace: 30_000_000n } }),
    ]);
    const { body } = kept.prototype;
    expect(outRefs(body.collateral)).toEqual([keyOf(putUp)]);
    expect(outRefs(body.inputs)).not.toContain(keyOf(putUp));
    await submit(emulator, kept);

    const spent = await build(emulator, [
      unlock(second, plutusScript),
      spend.pubKey({ utxo: putUp }),
      collateral({ utxo: putUp }),
    ]);
    expect(outRefs(spent.prototype.body.collateral)).toEqual([keyOf(putUp)]);
    expect(outRefs(spent.prototype.body.inputs)).toContain(keyOf(putUp));
    await submit(emulator, spent);
  });

  it("builds a script spend with a given fee the final transaction allows", async () => {
    const lock = locked();
    const emulator = await emulatorWith([at(address, 100), lock]);
    const built = await build(
      emulator,
      [unlock(lock, plutusScript)],
      1_000_000n,
    );

    expect(built.fee).toBe(1_000_000n);
    expect(built.prototype.body.fee).toBe("1000000");
    await submit(emulator, built);
  });
});
