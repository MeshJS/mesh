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
  scriptHashToRewardAddress,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import { MeshTxBuilder } from "../../src";
import {
  certificate,
  mint,
  output,
  proposal,
  spend,
  TxBuilder,
  TxError,
  TxErrorCode,
  Utxo,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, alwaysSucceedHash, keyHashHex } from "../test-util";

/*
 * Plutus data in the JSON form holds each `bytes` in hex of whole bytes, in either case: anything
 * else (an odd number of digits, a character outside hex) is refused wherever such data is taken,
 * its text quoted nowhere, never read up to its first bad digit or with its last digit dropped
 * (which would make of `abc` the bytes `ab`, and of `zz` no bytes).
 */

const keyHash = "5ae193abe694a607531e20f85d8358ade9a474a4f45ac4e15e962da1";
const address = Cardano.EnterpriseAddress.fromCredentials(0, {
  type: Cardano.CredentialType.KeyHash,
  hash: keyHash as Cardano.Credential["hash"],
})
  .toAddress()
  .toBech32();
const script = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(script, 0);
const scriptStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
const action = { txHash: "2".repeat(64), index: 0 };
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };
const blake = (hex: string) => Crypto.blake2b.hash(HexBlob(hex), 32).toString();
const unit = { type: "CBOR" as const, content: "d87980" };
const json = (content: object | string) => ({ type: "JSON" as const, content });

const funds: Utxo = {
  txHash: "f".repeat(64),
  outputIndex: 0,
  address,
  value: { lovelace: 1_000_000_000n },
};
const locked: Utxo = {
  txHash: "1".repeat(64),
  outputIndex: 0,
  address: scriptAddress,
  value: { lovelace: 10_000_000n },
  datum: { type: "hash", hash: blake("d87980") },
};

const MESSAGE =
  "invalid Plutus data: Malformed bytes field in Plutus data, expected hex of whole bytes";

/** `bytes` that are not hex of whole bytes, each with a run of it a message would show */
const BAD: [string, string][] = [
  ["abc", "abc"],
  ["zz", "zz"],
  ["abzz", "abzz"],
  ["zzab", "zzab"],
  ["0xab", "0xab"],
  [`d8799f${"01".repeat(40)}f`, "d8799f0101"],
];

/** Each alone and nested, as an object and as a JSON text */
const forms = (bytes: string) =>
  [
    { bytes },
    { constructor: 0, fields: [{ int: 1 }, { bytes }] },
    { list: [{ bytes }] },
    { map: [{ k: { bytes }, v: { int: 1 } }] },
    { map: [{ k: { int: 1 }, v: { bytes } }] },
  ].flatMap((content) => [json(content), json(JSON.stringify(content))]);

type Data = ReturnType<typeof json>;
/** Every part that takes data, and where */
const PARTS: [string, (data: Data) => unknown][] = [
  [
    "spend.plutus, its redeemer",
    (data) =>
      spend.plutus({
        utxo: locked,
        script,
        redeemer: { data },
        datum: { data: unit },
      }),
  ],
  [
    "spend.plutus, its datum",
    (data) =>
      spend.plutus({
        utxo: locked,
        script,
        redeemer: { data: unit },
        datum: { data },
      }),
  ],
  [
    "mint.plutus",
    (data) => mint.plutus({ script, redeemer: { data }, assets: { "01": 1n } }),
  ],
  [
    "withdrawal.plutus",
    (data) =>
      withdrawal.plutus({
        rewardAddress: scriptStake,
        amount: 0n,
        script,
        redeemer: { data },
      }),
  ],
  [
    "a certificate's witness",
    (data) =>
      certificate.stakeDelegation({
        stake: scriptStake,
        pool: keyHashHex(2),
        witness: { plutus: script, redeemer: { data } },
      }),
  ],
  [
    "a vote's witness",
    (data) =>
      vote({
        voter: { drep: { type: "SCRIPT", value: alwaysSucceedHash } },
        votes: [{ action, vote: "yes" }],
        witness: { plutus: script, redeemer: { data } },
      }),
  ],
  [
    "a proposal's guardrail",
    (data) =>
      proposal.treasuryWithdrawals({
        rewardAccount: scriptStake,
        anchor,
        withdrawals: { [scriptStake]: 1n },
        guardrail: { plutus: script, redeemer: { data } },
      }),
  ],
  [
    "an inline datum",
    (data) =>
      output({
        address,
        value: { lovelace: 2_000_000n },
        datum: { type: "inline", data },
      }),
  ],
  [
    "a datum by hash",
    (data) =>
      output({
        address,
        value: { lovelace: 2_000_000n },
        datum: { type: "hash", data, embed: true },
      }),
  ],
];

/** Prices every redeemer at fixed units */
const evaluator = {
  evaluateTx: async (tx: string) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: ["SPEND", "MINT", "CERT", "REWARD", "VOTE", "PROPOSE"][r.tag()],
      index: Number(r.index()),
      budget: { mem: 1000, steps: 2000 },
    })),
} as unknown as IEvaluator;
const builder = () =>
  new TxBuilder({
    network: "preprod",
    params: DEFAULT_PROTOCOL_PARAMETERS,
    costModels: [
      DEFAULT_V1_COST_MODEL_LIST,
      DEFAULT_V2_COST_MODEL_LIST,
      DEFAULT_V3_COST_MODEL_LIST,
    ],
    evaluator,
  });
const payer = { changeAddress: address, utxos: [funds] };

/** Refused with `code`, the message holding `words` and quoting `shown` nowhere */
const expectRefused = async (
  at: unknown[],
  run: () => unknown,
  code: TxErrorCode,
  words: string,
  shown: string,
) => {
  let error: unknown;
  try {
    await run();
  } catch (e) {
    error = e;
  }
  expect([at, TxError.is(error, code)]).toEqual([at, true]);
  const message = (error as Error).message;
  expect([at, message]).toEqual([at, expect.stringContaining(words)]);
  expect([at, message.toLowerCase().includes(shown.toLowerCase())]).toEqual([
    at,
    false,
  ]);
  return error as TxError;
};

describe("The bytes of Plutus data in the JSON form", () => {
  it("are refused when not hex of whole bytes, INVALID_DATA at the part call, by every part, alone and nested, quoting none of them", async () => {
    for (const [bytes, shown] of BAD)
      for (const data of forms(bytes))
        for (const [what, make] of PARTS)
          await expectRefused(
            [what, data],
            () => make(data),
            "INVALID_DATA",
            MESSAGE,
            shown,
          );
  });

  it("are refused at the build when a redeemer function answers them, INVALID_REDEEMER", async () => {
    for (const [bytes, shown] of BAD) {
      const error = await expectRefused(
        [bytes],
        () =>
          builder().build(
            [
              mint.plutus({
                script,
                redeemer: { data: () => json({ bytes }) },
                assets: { "01": 1n },
              }),
            ],
            { payer },
          ),
        "INVALID_REDEEMER",
        "Malformed bytes field in Plutus data, expected hex of whole bytes",
        shown,
      );
      expect(error).toMatchObject({ details: { reason: "invalidData" } });
    }
  });

  it("are refused by the old MeshTxBuilder, whose data goes through the parts", async () => {
    for (const [bytes, shown] of BAD)
      await expectRefused(
        [bytes],
        () =>
          new MeshTxBuilder({ params: DEFAULT_PROTOCOL_PARAMETERS })
            .txIn(
              funds.txHash,
              0,
              [{ unit: "lovelace", quantity: "1000000000" }],
              address,
            )
            .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
            .txOutInlineDatumValue({ bytes }, "JSON")
            .changeAddress(address)
            .complete(),
        "INVALID_DATA",
        MESSAGE,
        shown,
      );
  });

  it("are taken as before when hex of whole bytes, in either case or empty, by every part and in the transaction", async () => {
    for (const [bytes, hex] of [
      ["abcd", "42abcd"],
      ["ABCD", "42abcd"],
      ["aBcD", "42abcd"],
      ["", "40"],
    ])
      for (const data of [json({ bytes }), json(JSON.stringify({ bytes }))]) {
        // A spent datum is checked against the hash its UTxO holds
        const utxo = { ...locked, datum: { type: "hash", hash: blake(hex!) } };
        for (const [what, make] of PARTS)
          if (what === "spend.plutus, its datum")
            spend.plutus({
              utxo: utxo as Utxo,
              script,
              redeemer: { data: unit },
              datum: { data },
            });
          else make(data);
        expect(
          mint.plutus({ script, redeemer: { data }, assets: { "01": 1n } }),
        ).toMatchObject({
          witness: { redeemer: { data: { type: "CBOR", hex } } },
        });
        const built = await builder().build(
          [
            output({
              address,
              value: { lovelace: 2_000_000n },
              datum: { type: "inline", data },
            }),
          ],
          { payer },
        );
        expect(
          Transaction.fromCbor(TxCBOR(built.tx))
            .body()
            .outputs()
            .map((o) => o.datum()?.asInlineData()?.toCbor())
            .filter((datum) => datum !== undefined),
        ).toEqual([hex]);
      }
  });
});
