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
  scriptHashToBech32,
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
/** The hash of a native script: blake2b-224 of its language 0 and its bytes */
const nativeHash = (hex: string) =>
  Crypto.blake2b.hash(HexBlob(`00${hex}`), 28).toString();

/**
 * A list and a constructor of indefinite length; the integer 1 in one, two, three, five and nine
 * bytes, and in a constructor of indefinite length
 */
const KEPT = [
  "9f0102ff",
  "d8799f0102ff",
  "01",
  "1801",
  "190001",
  "1a00000001",
  "1b0000000000000001",
  "d8799f1a00000001ff",
];
/** A native script that always passes, `all` of none, in three longer forms than the shortest */
const NATIVE = ["82019fff", "82019800", "82180180"];
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

    it("keeps a native script given as CBOR in a longer form byte for byte, its hash the hash of those bytes, as a spend, a mint and a withdrawal; Scalus takes it", async () => {
      const locked = NATIVE.map((script, i): Utxo => ({
        txHash: (i + 1).toString(16).repeat(64),
        outputIndex: 0,
        address: scriptHashToBech32(nativeHash(script), undefined, 0),
        value: { lovelace: 10_000_000n },
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
        accounts: NATIVE.map((script) => ({
          rewardAddress: scriptHashToRewardAddress(nativeHash(script), 0),
        })),
      });
      const builder = new TxBuilder({ network: "preprod", provider: emulator });
      for (const [i, script] of NATIVE.entries()) {
        const hash = nativeHash(script);
        const built = await builder.build(
          [
            spend.native({ utxo: locked[i]!, script }),
            mint.native({ script, assets: { "01": 1n } }),
            withdrawal.native({
              rewardAddress: scriptHashToRewardAddress(hash, 0),
              amount: 0n,
              script,
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
        const read = Transaction.fromCbor(TxCBOR(built.signedTx!));
        expect([
          script,
          (read.witnessSet().nativeScripts()?.values() ?? []).map((n) =>
            n.toCbor().toString(),
          ),
          [...(read.body().mint()?.keys() ?? [])].map((unit) =>
            unit.slice(0, 56),
          ),
        ]).toEqual([script, [script], [hash]]);
        if (validator === "scalus")
          expect(await emulator.submitTx(built.signedTx!)).toBe(built.txHash);
        // cquisitor takes the hash of a native script over the form it writes it in again, not
        // over its bytes as the ledger does, and finds the script missing
        else
          await expect(emulator.submitTx(built.signedTx!)).rejects.toThrow(
            `MissingScriptWitnesses: Missing required script witnesses: "${hash}"`,
          );
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

  it("says how many bytes follow its item", () => {
    for (const [data, words] of [
      ["d8798000", "1 byte follows its first item"],
      ["d879800000", "2 bytes follow its first item"],
    ])
      expect(() => PARTS[2]![1](data!)).toThrow(words);
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

describe("A native script given as CBOR that is not one item", () => {
  /** `sig` of a key, then a byte; then two bytes; cut short; nothing; not hex; upper case */
  const sig = `8200581c${keyHashHex(1)}`;
  const NOT_ONE_SCRIPT = [
    `${sig}00`,
    `${sig}0000`,
    "82019f",
    sig.slice(0, -2),
    "",
    "zz",
    `${sig}00`.toUpperCase(),
  ];
  /** The hash of a script that is hex of whole bytes, else of `sig` */
  const hashOf = (script: string) =>
    nativeHash(/^(?:[0-9a-f]{2})+$/i.test(script) ? script.toLowerCase() : sig);
  const stakeOf = (script: string) =>
    scriptHashToRewardAddress(hashOf(script), 0);
  /** Each part that takes a native script, and the script in it */
  const PARTS: [string, (script: string) => unknown][] = [
    [
      "spend.native",
      (script) =>
        spend.native({
          utxo: {
            txHash: "1".repeat(64),
            outputIndex: 0,
            address: scriptHashToBech32(hashOf(script), undefined, 0),
            value: { lovelace: 10_000_000n },
          },
          script,
        }),
    ],
    ["mint.native", (script) => mint.native({ script, assets: { "01": 1n } })],
    [
      "withdrawal.native",
      (script) =>
        withdrawal.native({
          rewardAddress: stakeOf(script),
          amount: 0n,
          script,
        }),
    ],
    [
      "a certificate's witness",
      (script) =>
        certificate.stakeDelegation({
          stake: stakeOf(script),
          pool: keyHashHex(2),
          witness: { native: script },
        }),
    ],
    [
      "a vote's witness",
      (script) =>
        vote({
          voter: { drep: { type: "SCRIPT", value: hashOf(script) } },
          votes: [
            { action: { txHash: "2".repeat(64), index: 0 }, vote: "yes" },
          ],
          witness: { native: script },
        }),
    ],
    [
      "a proposal's guardrail",
      (script) =>
        proposal.treasuryWithdrawals({
          rewardAccount: stakeOf(script),
          anchor: {
            url: "https://example.com/a.json",
            dataHash: "ab".repeat(32),
          },
          withdrawals: { [stakeOf(script)]: 1n },
          guardrail: { native: script },
        }),
    ],
  ];

  it("is refused as INVALID_SCRIPT at the part call, its message quoting none of the bytes, by every part", () => {
    for (const [what, make] of PARTS)
      for (const script of NOT_ONE_SCRIPT) {
        let error: unknown;
        try {
          make(script);
        } catch (e) {
          error = e;
        }
        expect([what, script, TxError.is(error, "INVALID_SCRIPT")]).toEqual([
          what,
          script,
          true,
        ]);
        const message = (error as Error).message.toLowerCase();
        if (script.length > 2)
          for (const quoted of [script, script.slice(0, 20), script.slice(-20)])
            expect([
              what,
              script,
              message.includes(quoted.toLowerCase()),
            ]).toEqual([what, script, false]);
      }
    expect(() => PARTS[1]![1](`${sig}00`)).toThrow(
      "invalid native script: the CBOR given is not one item: 1 byte follows its first item",
    );
    expect(() => PARTS[1]![1](`${sig}0000`)).toThrow(
      "2 bytes follow its first item",
    );
  });

  it("is kept as given when it is one item in a longer form, in each part", () => {
    for (const script of [sig, ...NATIVE])
      for (const [what, make] of PARTS) {
        const part = JSON.stringify(make(script), (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );
        expect([what, script, part.includes(`"${script}"`)]).toEqual([
          what,
          script,
          true,
        ]);
      }
  });
});
