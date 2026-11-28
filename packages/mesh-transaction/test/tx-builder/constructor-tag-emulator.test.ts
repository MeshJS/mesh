import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  resolvePlutusScriptAddress,
} from "@meshsdk/core";
import {
  Cardano,
  Crypto,
  HexBlob,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";

import {
  keySigner,
  output,
  requiredSigners,
  spend,
  TxBuilder,
  Utxo,
} from "../../src/tx-builder";
import { alwaysSucceedCbor } from "../test-util";

/*
 * A constructor whose tag is written in nine bytes, up to 2^64-1, is read as the value decoder of
 * the SDK reads it: past 1400, with the general form's alternative, 102. A transaction that holds
 * one as a datum or a redeemer is built, read, restored and signed, with its bytes as given and
 * no error, whatever the tag's value.
 */

const KEY = "11".repeat(32);
const cbor = (content: string) => ({ type: "CBOR" as const, content });
const blake = (hex: string) => Crypto.blake2b.hash(HexBlob(hex), 32).toString();

/** Tags of 2^64-1024 and above reach 2^64 as a JS number; 2^53+1 is the first that does not stay */
const LARGE = {
  "2^64-1": "dbffffffffffffffff",
  "2^64-1024": "dbfffffffffffffc00",
  "2^53+1": "db0020000000000001",
};

/** The constructor `head` gives, with `fields`, read as the general form's alternative */
const constr = (fields: unknown[]) => ({
  type: "MANUAL",
  data: { type: "CONSTR", alternative: 102n, fields },
});

let keyHash: string;
let address: string;
beforeAll(async () => {
  await Crypto.ready();
  keyHash = Crypto.Ed25519PrivateKey.fromNormalHex(KEY).toPublic().hash().hex();
  address = Cardano.EnterpriseAddress.fromCredentials(0, {
    type: Cardano.CredentialType.KeyHash,
    hash: keyHash as never,
  })
    .toAddress()
    .toBech32();
});

describe("a constructor tag up to 2^64-1", () => {
  it("as an inline datum on the emulator: built, read with its UTxOs and blind, its signers listed, signed and restored", async () => {
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
    emulator.fund(address, { lovelace: 100_000_000n });
    for (const datum of [
      "dbffffffffffffffff80",
      "dbfffffffffffff80080",
      "dbfffffffffffff7ff80",
      "db800000000000000080",
      "da0001000080",
      ...Object.values(LARGE).map((head) => `${head}8100`),
    ]) {
      const built = await builder.build(
        [
          output({
            address,
            value: { lovelace: 2_000_000n },
            datum: { type: "inline", data: cbor(datum) },
          }),
        ],
        { payer: address },
      );
      const known = emulator.utxos({ address });
      const read = await builder.fromCbor(built.tx, { knownUtxos: known });
      expect([datum, read.txHash]).toEqual([datum, built.txHash]);
      expect([datum, read.prototype.body.outputs[0]!.plutus_data]).toEqual([
        datum,
        {
          type: "DATA",
          value: constr(
            datum.endsWith("8100") ? [{ type: "INTEGER", value: 0n }] : [],
          ),
        },
      ]);
      const blind = await builder.fromCbor(built.tx, { blind: true });
      expect([datum, blind.txHash]).toEqual([datum, built.txHash]);
      expect([datum, requiredSigners(built.tx, known).keyHashes]).toEqual([
        datum,
        [keyHash],
      ]);
      const restored = await builder.restore(JSON.parse(JSON.stringify(built)));
      expect([datum, restored.txHash]).toEqual([datum, built.txHash]);
      await built.sign({ signers: keySigner(KEY) });
      await restored.sign({ signers: keySigner(KEY) });
      await read.sign({ signers: keySigner(KEY) });
      expect([datum, restored.signedTx, read.signedTx]).toEqual([
        datum,
        built.signedTx,
        built.signedTx,
      ]);
      const output0 = Transaction.fromCbor(TxCBOR(built.signedTx!))
        .body()
        .outputs()[0]!;
      expect(output0.datum()?.asInlineData()?.toCbor().toString()).toBe(datum);
    }
  }, 120_000);

  it("as a redeemer, a spend datum, an inline datum and a datum by hash: kept as given on every path", async () => {
    const script = { code: alwaysSucceedCbor, version: "V3" as const };
    const scriptAddress = resolvePlutusScriptAddress(script, 0);
    const builder = new TxBuilder({
      network: "preprod",
      params: DEFAULT_PROTOCOL_PARAMETERS,
      costModels: [
        DEFAULT_V1_COST_MODEL_LIST,
        DEFAULT_V2_COST_MODEL_LIST,
        DEFAULT_V3_COST_MODEL_LIST,
      ],
      evaluator: {
        evaluateTx: async (tx: string) =>
          (
            Transaction.fromCbor(TxCBOR(tx))
              .witnessSet()
              .redeemers()
              ?.values() ?? []
          ).map((r) => ({
            tag: ["SPEND", "MINT", "CERT", "REWARD", "VOTE", "PROPOSE"][
              r.tag()
            ],
            index: Number(r.index()),
            budget: { mem: 1000, steps: 2000 },
          })),
      } as unknown as IEvaluator,
    });
    const funds: Utxo = {
      txHash: "f".repeat(64),
      outputIndex: 0,
      address,
      value: { lovelace: 1_000_000_000n },
    };
    for (const [name, head] of Object.entries(LARGE)) {
      const data = `${head}8100`;
      const locked: Utxo = {
        txHash: "1".repeat(64),
        outputIndex: 0,
        address: scriptAddress,
        value: { lovelace: 10_000_000n },
        datum: { type: "hash", hash: blake(data) },
      };
      const known = [funds, locked];
      const built = await builder.build(
        [
          spend.plutus({
            utxo: locked,
            script,
            redeemer: { data: cbor(data) },
            datum: { data: cbor(data) },
          }),
          output({
            address,
            value: { lovelace: 2_000_000n },
            datum: { type: "inline", data: cbor(data) },
          }),
          output({
            address,
            value: { lovelace: 2_000_000n },
            datum: { type: "hash", data: cbor(data), embed: true },
          }),
        ],
        { payer: { changeAddress: address, utxos: [funds] } },
      );
      const read = await builder.fromCbor(built.tx, { knownUtxos: known });
      const field = [{ type: "INTEGER", value: 0n }];
      expect([name, read.txHash]).toEqual([name, built.txHash]);
      expect([name, read.prototype.body.outputs[0]!.plutus_data]).toEqual([
        name,
        { type: "DATA", value: constr(field) },
      ]);
      expect([name, read.prototype.witness_set.redeemers![0]!.data]).toEqual([
        name,
        constr(field),
      ]);
      expect([
        name,
        (await builder.fromCbor(built.tx, { blind: true })).txHash,
      ]).toEqual([name, built.txHash]);
      expect([name, requiredSigners(built.tx, known).keyHashes]).toEqual([
        name,
        [keyHash],
      ]);
      const restored = await builder.restore(JSON.parse(JSON.stringify(built)));
      await built.sign({ signers: keySigner(KEY) });
      await restored.sign({ signers: keySigner(KEY) });
      await read.sign({ signers: keySigner(KEY) });
      expect([name, restored.signedTx, read.signedTx]).toEqual([
        name,
        built.signedTx,
        built.signedTx,
      ]);
      const signed = Transaction.fromCbor(TxCBOR(built.signedTx!));
      const ws = signed.witnessSet();
      expect([
        name,
        ws
          .redeemers()!
          .values()
          .map((r) => r.data().toCbor().toString()),
        // The spend datum and the embedded one: the same bytes, written once or twice
        [
          ...new Set(
            ws
              .plutusData()!
              .values()
              .map((d) => d.toCbor().toString()),
          ),
        ],
        signed
          .body()
          .outputs()[0]!
          .datum()
          ?.asInlineData()
          ?.toCbor()
          .toString(),
        signed.body().outputs()[1]!.datum()?.asDataHash()?.toString(),
      ]).toEqual([name, [data], [data], data, blake(data)]);
    }
  });
});
