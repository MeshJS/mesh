import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  resolvePlutusScriptAddress,
} from "@meshsdk/core";
import {
  Crypto,
  HexBlob,
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import {
  certificate,
  mint,
  output,
  proposal,
  spend,
  TxBuilder,
  TxBuildError,
  TxError,
  Utxo,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, alwaysSucceedHash, keyHashHex } from "../test-util";
import { asMesh } from "./utxo-util";

/*
 * Plutus data an application gives as CBOR is one well-formed item, and its bytes reach the final
 * transaction as given: through the serializer, the rounds of the fee and of evaluation, and
 * signing; as a redeemer of every purpose, a spend datum, an inline datum and a datum by hash.
 */

const words = Array(24).fill("solution");
const script = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(script, 0);
const scriptStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const cbor = (content: string) => ({ type: "CBOR" as const, content });
const blake = (hex: string) => Crypto.blake2b.hash(HexBlob(hex), 32).toString();

/** A list and a constructor of indefinite length */
const KEPT = ["9f0102ff", "d8799f0102ff"];
/** Not one item: a byte after it, an item cut short, nothing */
const NOT_ONE = ["d8798000", "9f01", ""];

/** The data of a transaction's redeemers, its datums and its outputs' datums, each as written */
const dataOf = (tx: string) => {
  const read = Transaction.fromCbor(TxCBOR(tx));
  const ws = read.witnessSet();
  return {
    redeemers: (ws.redeemers()?.values() ?? []).map((r) =>
      r.data().toCbor().toString(),
    ),
    datums: (ws.plutusData()?.values() ?? []).map((d) => d.toCbor().toString()),
    outputs: read
      .body()
      .outputs()
      .map((o) => ({
        inline: o.datum()?.asInlineData()?.toCbor().toString(),
        hash: o.datum()?.asDataHash()?.toString(),
      })),
  };
};

let wallet: MeshWallet;
let address: string;
beforeAll(async () => {
  wallet = new MeshWallet({ networkId: 0, key: { type: "mnemonic", words } });
  await wallet.init();
  address = (await wallet.getChangeAddress())!;
});

describe.each(["scalus", "cquisitor"] as const)(
  "Plutus data given as CBOR in the final transaction (%s)",
  (validator) => {
    it("keeps each form byte for byte as the redeemer of a spend, a mint and a withdrawal, a spend datum, an inline datum and a datum by hash; the ledger takes each", async () => {
      // A UTxO locked by the datum hash of each form, and funds
      const locked = KEPT.map((data, i): Utxo => ({
        txHash: (i + 1).toString(16).repeat(64),
        outputIndex: 0,
        address: scriptAddress,
        value: { lovelace: 10_000_000n },
        datum: { type: "hash", hash: blake(data) },
      }));
      const funds: Utxo = {
        txHash: "f".repeat(64),
        outputIndex: 0,
        address,
        value: { lovelace: 1_000_000_000n },
      };
      const emulator = await TxEmulator.create({
        validator,
        network: "preprod",
        utxos: [...locked, funds].map(asMesh),
        accounts: [{ rewardAddress: scriptStake }],
      });
      const builder = new TxBuilder({
        network: "preprod",
        provider: emulator,
        evaluator: emulator,
      });
      for (const [i, data] of KEPT.entries()) {
        const built = await builder.build(
          [
            spend.plutus({
              utxo: locked[i]!,
              script,
              redeemer: { data: cbor(data) },
              datum: { data: cbor(data) },
            }),
            mint.plutus({
              script,
              redeemer: { data: cbor(data) },
              assets: { [i.toString(16).padStart(2, "0")]: 1n },
            }),
            withdrawal.plutus({
              rewardAddress: scriptStake,
              amount: 0n,
              script,
              redeemer: { data: cbor(data) },
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
          {
            payer: {
              changeAddress: address,
              utxos: emulator.utxos({ address }),
            },
          },
        );
        await built.sign({ signers: wallet });
        const signed = built.signedTx!;
        const read = dataOf(signed);
        expect([data, read.redeemers]).toEqual([data, [data, data, data]]);
        // The spend datum and the embedded one: the same bytes, written once or twice
        expect([data, [...new Set(read.datums)]]).toEqual([data, [data]]);
        expect([data, read.outputs.slice(0, 2)]).toEqual([
          data,
          [
            { inline: data, hash: undefined },
            { inline: undefined, hash: blake(data) },
          ],
        ]);
        expect(await emulator.submitTx(signed)).toBe(built.txHash);
      }
    }, 120_000);
  },
);

describe("Plutus data given as CBOR that is not one item", () => {
  const witness = (data: string) => ({
    plutus: script,
    redeemer: { data: cbor(data) },
  });
  /** A UTxO locked by the hash of a datum */
  const held = (datum: string): Utxo => ({
    txHash: "1".repeat(64),
    outputIndex: 0,
    address: scriptAddress,
    value: { lovelace: 10_000_000n },
    datum: { type: "hash", hash: blake(datum) },
  });
  const scriptDRep = { type: "SCRIPT" as const, value: alwaysSucceedHash };
  const action = { txHash: "2".repeat(64), index: 0 };
  const anchor = {
    url: "https://example.com/a.json",
    dataHash: "ab".repeat(32),
  };
  /** Each part that takes Plutus data, and the data in it */
  const PARTS: [string, (data: string) => unknown][] = [
    [
      "spend.plutus, its redeemer",
      (data) =>
        spend.plutus({
          utxo: held("d87980"),
          script,
          redeemer: { data: cbor(data) },
          datum: { data: cbor("d87980") },
        }),
    ],
    [
      "spend.plutus, its datum",
      (data) =>
        spend.plutus({
          utxo: held(data),
          script,
          redeemer: { data: cbor("d87980") },
          datum: { data: cbor(data) },
        }),
    ],
    [
      "mint.plutus",
      (data) =>
        mint.plutus({
          script,
          redeemer: { data: cbor(data) },
          assets: { "01": 1n },
        }),
    ],
    [
      "withdrawal.plutus",
      (data) =>
        withdrawal.plutus({
          rewardAddress: scriptStake,
          amount: 0n,
          script,
          redeemer: { data: cbor(data) },
        }),
    ],
    [
      "a certificate's witness",
      (data) =>
        certificate.stakeDelegation({
          stake: scriptStake,
          pool: keyHashHex(2),
          witness: witness(data),
        }),
    ],
    [
      "a vote's witness",
      (data) =>
        vote({
          voter: { drep: scriptDRep },
          votes: [{ action, vote: "yes" }],
          witness: witness(data),
        }),
    ],
    [
      "a proposal's guardrail",
      (data) =>
        proposal.treasuryWithdrawals({
          rewardAccount: scriptStake,
          anchor,
          withdrawals: { [scriptStake]: 1n },
          guardrail: witness(data),
        }),
    ],
    [
      "an inline datum",
      (data) =>
        output({
          address: scriptAddress,
          value: { lovelace: 2_000_000n },
          datum: { type: "inline", data: cbor(data) },
        }),
    ],
    [
      "a datum by hash",
      (data) =>
        output({
          address: scriptAddress,
          value: { lovelace: 2_000_000n },
          datum: { type: "hash", data: cbor(data), embed: true },
        }),
    ],
  ];

  it("is refused as INVALID_DATA at the part call, its message quoting none of the bytes, by every part", () => {
    for (const [what, make] of PARTS)
      for (const data of NOT_ONE) {
        let error: unknown;
        try {
          make(data);
        } catch (e) {
          error = e;
        }
        expect([what, data, TxError.is(error, "INVALID_DATA")]).toEqual([
          what,
          data,
          true,
        ]);
        if (data !== "") expect((error as Error).message).not.toContain(data);
      }
  });

  it("is refused at the build when a redeemer function answers it", async () => {
    const builder = new TxBuilder({
      network: "preprod",
      params: DEFAULT_PROTOCOL_PARAMETERS,
      costModels: [
        DEFAULT_V1_COST_MODEL_LIST,
        DEFAULT_V2_COST_MODEL_LIST,
        DEFAULT_V3_COST_MODEL_LIST,
      ],
      evaluator: {
        evaluateTx: async () => [],
      } as unknown as IEvaluator,
    });
    for (const data of NOT_ONE.slice(0, 2)) {
      let error: unknown;
      try {
        await builder.build(
          [
            mint.plutus({
              script,
              redeemer: { data: () => cbor(data) },
              assets: { "01": 1n },
            }),
          ],
          {
            payer: {
              changeAddress: address,
              utxos: [
                {
                  txHash: "3".repeat(64),
                  outputIndex: 0,
                  address,
                  value: { lovelace: 100_000_000n },
                },
              ],
            },
          },
        );
      } catch (e) {
        error = e;
      }
      expect([data, TxError.is(error, "INVALID_REDEEMER")]).toEqual([
        data,
        true,
      ]);
      expect((error as TxBuildError<"INVALID_REDEEMER">).details).toEqual({
        reason: "invalidData",
      });
      expect((error as Error).message).not.toContain(data);
    }
  });

  it("is kept byte for byte when it is one item, a list of indefinite length, in each part", () => {
    const list = "9f0102ff";
    for (const [what, make] of PARTS) {
      const part = JSON.stringify(make(list), (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
      expect([what, part.includes(`"${list}"`)]).toEqual([what, true]);
    }
  });

  it("reaches the signed transaction as given in the witness of a certificate, a vote and a proposal", async () => {
    const builder = new TxBuilder({
      network: "preprod",
      params: DEFAULT_PROTOCOL_PARAMETERS,
      costModels: [
        DEFAULT_V1_COST_MODEL_LIST,
        DEFAULT_V2_COST_MODEL_LIST,
        DEFAULT_V3_COST_MODEL_LIST,
      ],
      deposits: { govActionDeposit: 1_000_000_000n },
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
    for (const data of KEPT) {
      const built = await builder.build(
        [PARTS[4]![1](data), PARTS[5]![1](data), PARTS[6]![1](data)] as never,
        {
          payer: {
            changeAddress: address,
            utxos: [
              {
                txHash: "3".repeat(64),
                outputIndex: 0,
                address,
                value: { lovelace: 2_000_000_000n },
              },
            ],
          },
        },
      );
      await built.sign({ signers: wallet });
      expect([data, dataOf(built.signedTx!).redeemers]).toEqual([
        data,
        [data, data, data],
      ]);
    }
  });
});
