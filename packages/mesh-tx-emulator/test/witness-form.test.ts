import type { TransactionPrototype, UTxO } from "@meshsdk/common";
import {
  CborReader,
  HexBlob,
  Transaction,
  transactionPrototypeToHex,
  TransactionWitnessSet,
  TxCBOR,
} from "@meshsdk/core-cst";
import { AppWallet, BrowserWallet, MeshWallet } from "@meshsdk/wallet";

import { TxEmulator, TxResult, TxValidator } from "../src";

const SOLUTION = Array(24).fill("solution");
const FUNDS = 10_000_000_000n;
/** The bytes one vkey witness adds to a transaction that has none: its entry, with the tag or not */
const witnessBytes = (tagged: boolean) => 1 + (tagged ? 3 : 0) + 1 + 101;

/** The rule a fee below the minimum breaks, as each validator names it */
const FEE_RULE = { scalus: "FeesOk", cquisitor: "FeeTooSmallUTxO" };
const rules = (result: TxResult) =>
  result.accepted ? [] : result.errors.map((e) => e.rule);
const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
/** The items of a transaction, each as written */
const items = (txHex: string) => {
  const reader = new CborReader(HexBlob(txHex));
  const length = reader.readStartArray()!;
  return Array.from({ length }, () => hexOf(reader.readEncodedValue()));
};
const txId = (txHex: string) => Transaction.fromCbor(TxCBOR(txHex)).getId();

/** A CIP-30 extension over a Mesh wallet, answering its witnesses with the set tag always */
const extension = (wallet: MeshWallet) => ({
  name: "fake",
  icon: "",
  apiVersion: "1.0.0",
  enable: async () => ({
    signTx: async (txHex: string) => {
      const set = TransactionWitnessSet.fromCbor(
        HexBlob(await wallet.signTxWitnesses(txHex)),
      );
      return `a100d9010281${set.vkeys()!.values()[0]!.toCbor()}`;
    },
  }),
});

/*
 * A transaction written without tags and priced for witnesses without tags, as another library
 * writes and prices one, signed by the wallets of this one: they write the witnesses in its
 * form, and the fee priced for it is enough.
 */
describe.each(["scalus", "cquisitor"] as const)(
  "witnesses in the form of the transaction, on the %s emulator",
  (validator: TxValidator) => {
    const global = globalThis as { window?: unknown };
    let mesh: MeshWallet;
    let app: AppWallet;
    let browser: BrowserWallet;
    let address: string;
    let emulator: TxEmulator;
    let feeFor: (size: number) => bigint;

    beforeAll(async () => {
      mesh = new MeshWallet({
        networkId: 1,
        key: { type: "mnemonic", words: SOLUTION },
      });
      await mesh.init();
      app = new AppWallet({
        networkId: 1,
        key: { type: "mnemonic", words: SOLUTION },
      });
      await app.init();
      global.window = { cardano: { fake: extension(mesh) } };
      browser = await BrowserWallet.enable("fake");
      address = (await mesh.getChangeAddress())!;
      const funding: UTxO = {
        input: { txHash: "0".repeat(64), outputIndex: 0 },
        output: {
          address,
          amount: [{ unit: "lovelace", quantity: String(FUNDS) }],
        },
      };
      emulator = await TxEmulator.create({ validator, utxos: [funding] });
      const { minFeeA, minFeeB } = await emulator.fetchProtocolParameters();
      // The ledger prices a transaction without its validity flag, one byte
      feeFor = (size) => BigInt(minFeeA) * BigInt(size - 1) + BigInt(minFeeB);
    });
    afterAll(() => {
      delete global.window;
    });

    /** A payment of all the funds back to the wallet, less `fee`, its sets tagged or not */
    const payment = (fee: bigint, taggedSets: boolean) =>
      transactionPrototypeToHex(
        {
          body: {
            inputs: [{ transaction_id: "0".repeat(64), index: 0 }],
            outputs: [{ address, amount: { coin: String(FUNDS - fee) } }],
            fee: String(fee),
          },
          is_valid: true,
          witness_set: {},
        } as unknown as TransactionPrototype,
        { taggedSets },
      );
    /** The payment whose fee is exact for one witness written with the set tag or without */
    const exact = (taggedSets: boolean, witnessTagged = taggedSets) => {
      const size = payment(200_000n, taggedSets).length / 2;
      return payment(feeFor(size + witnessBytes(witnessTagged)), taggedSets);
    };
    const signers = () => [
      (tx: string) => mesh.signTx(tx),
      (tx: string) => app.signTx(tx),
      (tx: string) => browser.signTx(tx),
    ];

    it("accepts a payment whose body has no tags and whose fee is exact for witnesses without tags, signed by each wallet, its body and hash unchanged; one with tags priced for tagged witnesses too", async () => {
      for (const taggedSets of [false, true]) {
        const unsigned = exact(taggedSets);
        for (const sign of signers()) {
          const signed = await sign(unsigned);
          expect(rules(await emulator.simulate(signed))).toEqual([]);
          expect(items(signed)[0]).toBe(items(unsigned)[0]);
          expect(txId(signed)).toBe(txId(unsigned));
          expect(signed.length / 2 - unsigned.length / 2).toBe(
            witnessBytes(taggedSets),
          );
        }
        // The fee is exact: a lovelace less is too small
        const short = payment(
          feeFor(unsigned.length / 2 + witnessBytes(taggedSets)) - 1n,
          taggedSets,
        );
        expect(
          rules(await emulator.simulate(await mesh.signTx(short))),
        ).toEqual([FEE_RULE[validator]]);
      }
    });

    /** The transaction with a witness set holding only this vkey entry */
    const holding = (txHex: string, entry: string) => {
      const [body, , valid, aux] = items(txHex);
      return `84${body}a100${entry}${valid}${aux}`;
    };
    /** Empty vkey entries in forms other than the writer's, and the bytes a witness adds to each */
    const HELD: [string, string, number][] = [
      ["indefinite", "9fff", 101],
      ["tagged, indefinite", "d901029fff", 101],
      ["a tag in five bytes", "da0000010280", 101],
      ["a head in two bytes, written again in one", "9800", 100],
    ];
    /** The payment holding `entry`, its fee exact for one witness written into it */
    const exactHolding = (entry: string, adds: number) => {
      const size = holding(payment(200_000n, false), entry).length / 2;
      return (less = 0n) =>
        holding(payment(feeFor(size + adds) - less, false), entry);
    };

    it("keeps the form of a vkey entry the transaction holds when each wallet signs, and the fee priced for it is enough", async () => {
      for (const [what, entry, adds] of HELD) {
        const priced = exactHolding(entry, adds);
        for (const sign of signers()) {
          const signed = await sign(priced());
          expect([what, rules(await emulator.simulate(signed))]).toEqual([
            what,
            [],
          ]);
          expect([what, signed.length / 2 - priced().length / 2]).toEqual([
            what,
            adds,
          ]);
          expect(items(signed)[0]).toBe(items(priced())[0]);
        }
        expect([
          what,
          rules(await emulator.simulate(await mesh.signTx(priced(1n)))),
        ]).toEqual([what, [FEE_RULE[validator]]]);
      }
    });

    if (validator === "cquisitor")
      it("prices the signatures still to come in the form of a vkey entry the transaction holds", async () => {
        const unsigned = { requireSignatures: false };
        for (const [what, entry, adds] of HELD) {
          const priced = exactHolding(entry, adds);
          expect([
            what,
            rules(await emulator.simulate(priced(), unsigned)),
          ]).toEqual([what, []]);
          expect([
            what,
            rules(await emulator.simulate(priced(1n), unsigned)),
          ]).toEqual([what, ["FeeTooSmallUTxO"]]);
        }
      });

    if (validator === "cquisitor")
      it("prices the signatures an unsigned transaction is still to get in its form", async () => {
        const unsigned = { requireSignatures: false };
        expect(rules(await emulator.simulate(exact(false), unsigned))).toEqual(
          [],
        );
        expect(rules(await emulator.simulate(exact(true), unsigned))).toEqual(
          [],
        );
        // A body with tags priced for a witness without them is short of three bytes
        expect(
          rules(await emulator.simulate(exact(true, false), unsigned)),
        ).toEqual(["FeeTooSmallUTxO"]);
      });
  },
);
