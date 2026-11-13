import {
  mConStr0,
  resolvePlutusScriptAddress,
  resolveScriptHash,
  UTxO,
} from "@meshsdk/core";
import {
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  BuiltTx,
  mint,
  output,
  RedeemerContext,
  referenceInput,
  spend,
  TxBuilder,
  withdrawal,
} from "../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  mintParamCbor,
} from "../test-util";

const words = Array(24).fill("solution");
const script = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(script, 0);
const scriptRewardAddress = scriptHashToRewardAddress(alwaysSucceedHash, 0);

let wallet: MeshWallet;
let address: string;
beforeAll(async () => {
  wallet = new MeshWallet({ networkId: 0, key: { type: "mnemonic", words } });
  await wallet.init();
  address = (await wallet.getChangeAddress())!;
});

/** A UTxO `<digit * 64>#<index>` holding `lovelace` */
const at = (
  digit: string,
  outputIndex: number,
  address: string,
  lovelace: bigint,
  extra: Partial<UTxO["output"]> = {},
): UTxO => ({
  input: { txHash: digit.repeat(64), outputIndex },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace.toString() }],
    ...extra,
  },
});

/** A UTxO locked at the always-succeeding script, with an inline datum */
const locked = (digit: string) =>
  at(digit, 0, scriptAddress, 10_000_000n, { plutusData: "d87980" });

/** The redeemer data of a transaction's bytes, by `TAG:index` */
const redeemersOf = (tx: string) =>
  Object.fromEntries(
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => [`${r.tag()}:${r.index()}`, r.data().toCbor().toString()]),
  );

/*
 * Redeemer functions, computed from the final transaction, and checked by the emulator's ledger
 * under both validators.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "TxBuilder redeemer functions on TxEmulator (%s)",
  (validator) => {
    const setUp = async (utxos: UTxO[]) => {
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        utxos,
        accounts: [{ rewardAddress: scriptRewardAddress }],
      });
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      const submit = async (built: BuiltTx) =>
        expect(await emulator.submitTx(await wallet.signTx(built.tx))).toBe(
          built.txHash,
        );
      return { emulator, builder, submit };
    };

    it("gives redeemers the indices of the final order, balancing's inputs included", async () => {
      const scriptUtxos = [locked("1"), locked("3")];
      const funds = at("2", 0, address, 100_000_000n);
      const { builder, submit } = await setUp([...scriptUtxos, funds]);
      const ownIndex = (tx: RedeemerContext) =>
        mConStr0([tx.self, tx.output("pay")]);

      const built = await builder.build(
        [
          ...scriptUtxos.map((utxo) =>
            spend.plutus({
              utxo,
              script,
              redeemer: { data: ownIndex },
              label: "spend",
            }),
          ),
          withdrawal.plutus({
            amount: 0n,
            script,
            redeemer: { data: (tx) => mConStr0([scriptUtxos.map(tx.input)]) },
            label: "withdraw-zero",
          }),
          output({ address, value: { lovelace: 2_000_000n } }),
          output({ address, value: { lovelace: 25_000_000n }, label: "pay" }),
        ],
        { payer: { changeAddress: address, utxos: [funds] } },
      );

      expect(built.inputs.map((u) => u.txHash[0])).toEqual(["1", "2", "3"]);
      const expected = {
        "SPEND:0": "d8799f0001ff",
        "SPEND:2": "d8799f0201ff",
        "REWARD:0": "d8799f9f0002ffff",
      };
      expect(
        Object.fromEntries(
          built.redeemers.map((r) => [`${r.tag}:${r.index}`, r.data]),
        ),
      ).toEqual(expected);
      // The ledger's tag numbers: 0 spend, 3 reward
      expect(redeemersOf(built.tx)).toEqual({
        "0:0": expected["SPEND:0"],
        "0:2": expected["SPEND:2"],
        "3:0": expected["REWARD:0"],
      });
      expect(Object.keys(built.prototype.body.withdrawals!)).toEqual([
        scriptRewardAddress,
      ]);
      await submit(built);
    });

    it("settles a redeemer that lists every input, with many inputs selected", async () => {
      const funds = Array.from({ length: 30 }, (_, i) =>
        at("2", i, address, 1_500_000n),
      );
      const { builder, submit } = await setUp([locked("1"), ...funds]);

      const built = await builder.build(
        [
          spend.plutus({
            utxo: locked("1"),
            script,
            redeemer: { data: (tx) => tx.inputs.map((i) => i.txHash) },
          }),
          output({ address, value: { lovelace: 30_000_000n } }),
        ],
        { payer: { changeAddress: address, utxos: funds } },
      );

      expect(built.selectedInputs.length).toBeGreaterThan(10);
      expect(built.redeemers[0]!.data).toBe(
        `9f${built.inputs.map((u) => `5820${u.txHash}`).join("")}ff`,
      );
      await submit(built);
    });

    it("hands the ledger the indices a script checks", async () => {
      const spent = ["1", "3", "5"].map((d) => at(d, 0, address, 5_000_000n));
      const read = ["4", "6", "7"].map((d) => at(d, 0, address, 2_000_000n));
      const funds = at("f", 0, address, 100_000_000n);
      const { builder, submit } = await setUp([...spent, ...read, funds]);
      const policy = (param: number) => ({
        code: mintParamCbor(param),
        version: "V3" as const,
      });
      // Policies that take their parameter as redeemer, by their position among the policies
      const nonces = [10, 11, 12];
      const params = [...nonces, 0, 1, 2];
      const sortedParams = [...params].sort((a, b) =>
        resolveScriptHash(mintParamCbor(a), "V3") <
        resolveScriptHash(mintParamCbor(b), "V3")
          ? -1
          : 1,
      );
      const minting = (param: number, data: (tx: RedeemerContext) => number) =>
        mint.plutus({
          script: policy(param),
          redeemer: { data },
          assets: { "": 1n },
          label: `policy ${param}`,
        });

      const built = await builder.build(
        [
          ...spent.map((utxo) => spend.pubKey({ utxo })),
          ...read.map((utxo) => referenceInput({ utxo })),
          ...nonces.map((n) => minting(n, (tx) => sortedParams[tx.self]!)),
          // Each oracle passes only with its own parameter as redeemer
          minting(0, (tx) => tx.input(spent[0]!)),
          minting(1, (tx) => tx.output("pay")),
          minting(2, (tx) => tx.referenceInput(read[2]!)),
          output({ address, value: { lovelace: 2_000_000n } }),
          output({ address, value: { lovelace: 3_000_000n }, label: "pay" }),
        ],
        { payer: { changeAddress: address, utxos: [funds] } },
      );

      expect(built.redeemers.map((r) => r.data)).toEqual(
        sortedParams.map((p) => p.toString(16).padStart(2, "0")),
      );
      await submit(built);
    });
  },
);
