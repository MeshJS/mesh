import type { IEvaluator, NativeScript, PoolParams } from "@meshsdk/core";
import {
  Action,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  mConStr,
  mConStr0,
  resolveDataHash,
  resolveNativeScriptAddress,
  resolveNativeScriptHash,
} from "@meshsdk/core";
import {
  Cardano,
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
  toNativeScript,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import type {
  BuiltTxData,
  OutputDatum,
  OutputScript,
  TxPart,
  TxPlanError,
  Utxo,
} from "../../../src/tx-builder";
import type { PlanRecord } from "../../../src/tx-builder/plan/core";
import {
  auxiliaryScript,
  certificate,
  collateral,
  collateralReturn,
  donation,
  guard,
  message,
  metadata,
  mint,
  networkId,
  output,
  proposal,
  referenceInput,
  spend,
  treasuryValue,
  TxBuilder,
  TxBuildError,
  TxError,
  validity,
  vote,
  withdrawal,
} from "../../../src/tx-builder";
import { NOT_UNPAID } from "../../../src/tx-builder/errors";
import { emptyPlan } from "../../../src/tx-builder/plan/core";
import {
  decodeParts,
  encodeParts,
  encodePlan,
  PLAN_RECORD_VERSION,
  readPlan,
  UnreadContent,
} from "../../../src/tx-builder/plan/json";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  drepBech32,
  keyHashHex,
  mockTokenUnit,
  rewardAddress,
} from "../../test-util";
import { hash } from "./plan-util";
import { accept } from "./state-util";

/* ---------------------------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------------------------- */

const wallet = baseAddress(1);
const recipient = baseAddress(2);
const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
const plutusAddress = resolvePlutusScriptAddress(plutus, 0);
const plutusStake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
/** A native script with a threshold, whose `n` is a bigint in its prototype */
const nOfK: NativeScript = {
  type: "atLeast",
  required: 1,
  scripts: [{ type: "sig", keyHash: keyHashHex(1) }],
};
const nOfKAddress = resolveNativeScriptAddress(nOfK, 0);
const nativeAll: NativeScript = { type: "all", scripts: [] };
const nativeStake = scriptHashToRewardAddress(
  resolveNativeScriptHash(nativeAll),
  0,
);
const keyStake = rewardAddress(1);
const keyStakeHash = Cardano.Address.fromBech32(keyStake)
  .asReward()!
  .getPaymentCredential()
  .hash.toString();
const poolHash = keyHashHex(7);
const poolId = Cardano.PoolId.fromKeyHash(poolHash as never).toString();
const drep = drepBech32(3);
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };
const action = { txHash: "a".repeat(64), index: 0 };
const common = { rewardAccount: keyStake, anchor };
const redeemer = { data: mConStr0([]) };
const plutusWitness = { plutus, redeemer };
/** Plutus data with an integer above 2^53 and a large constructor index */
const bigData = mConStr(123_456, [2n ** 70n, "cafe", [1, 2n ** 60n]]);
const bigDataHash = resolveDataHash(bigData);
const unit = `${"c".repeat(56)}0102`;

const utxoAt = (
  outputIndex: number,
  address: string,
  extra: Partial<Utxo> = {},
  txHash = "a".repeat(64),
): Utxo => ({
  txHash,
  outputIndex,
  address,
  value: { lovelace: 5_000_000n },
  ...extra,
});
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};
const plutusRef: OutputScript = {
  type: "plutus",
  version: "V3",
  code: alwaysSucceedCbor,
  hash: alwaysSucceedHash,
};
/** A native script as an output holds it for reference */
const nativeRefOf = (script: NativeScript): OutputScript => ({
  type: "native",
  cbor: toNativeScript(script).toCbor().toString(),
  hash: resolveNativeScriptHash(script),
});

const poolParams: PoolParams = {
  operator: poolId,
  vrfKeyHash: "cd".repeat(32),
  pledge: "1000000000",
  cost: "340000000",
  margin: [1, 100],
  owners: [keyStakeHash],
  rewardAddress: keyStake,
  relays: [
    { type: "SingleHostAddr", IPV4: "10.0.0.1", port: 3001 },
    { type: "SingleHostName", domainName: "relay.example.com", port: 3001 },
  ],
  metadata: { URL: "https://example.com/p.json", hash: "ef".repeat(32) },
};

/** A part with Plutus data in the tagged form, as no part builder makes it */
const taggedData = {
  kind: "output",
  output: {
    address: recipient,
    amount: { coin: "2000000" },
    plutus_data: {
      type: "DATA",
      value: {
        type: "MANUAL",
        data: {
          type: "CONSTR",
          alternative: 2n ** 64n - 1n,
          fields: [
            { type: "INTEGER", value: -(2n ** 70n) },
            { type: "BYTES", value: "cafe" },
            {
              type: "MAP",
              value: [
                [
                  { type: "INTEGER", value: 0n },
                  {
                    type: "LIST",
                    value: [{ type: "INTEGER", value: 2n ** 53n + 1n }],
                  },
                ],
              ],
            },
          ],
        },
      },
    },
  },
  label: "tagged",
} as unknown as TxPart;

/** One part of every kind and form */
const everyPart = (): TxPart[] => [
  spend.pubKey({ utxo: utxoAt(0, wallet), label: "key" }),
  spend.pubKey({ utxo: { txHash: "b".repeat(64), outputIndex: 3 } }),
  spend.native({ utxo: utxoAt(1, nOfKAddress), script: nOfK }),
  spend.native({
    utxo: { txHash: "b".repeat(64), outputIndex: 4 },
    script: {
      reference: utxoAt(9, wallet, { script: nativeRefOf(nOfK) }),
    },
  }),
  spend.plutus({
    utxo: utxoAt(2, plutusAddress, { datum: unitInline }),
    script: plutus,
    redeemer: { data: bigData, exUnits: { mem: 1000, steps: 2000 } },
  }),
  spend.plutus({
    utxo: utxoAt(3, plutusAddress, {
      datum: { type: "hash", hash: bigDataHash },
    }),
    script: plutus,
    redeemer,
    datum: { data: bigData },
  }),
  spend.plutus({
    utxo: utxoAt(4, plutusAddress),
    script: plutus,
    redeemer,
    datum: "none",
  }),
  spend.plutus({
    utxo: { txHash: "b".repeat(64), outputIndex: 5 },
    script: { reference: { txHash: "d".repeat(64), outputIndex: 0 } },
    redeemer,
  }),
  referenceInput({
    utxo: utxoAt(5, wallet, { script: plutusRef }),
  }),
  referenceInput({ utxo: { txHash: "b".repeat(64), outputIndex: 6 } }),
  collateral({ utxo: utxoAt(6, wallet), label: "collateral" }),
  collateralReturn({ address: wallet, totalCollateral: 5_000_000n }),
  collateralReturn({ address: wallet }),
  output({ address: recipient, value: { lovelace: 2_000_000n, [unit]: 5n } }),
  output({ address: recipient, value: { [unit]: 1n } }),
  output({
    address: plutusAddress,
    value: { lovelace: 2_000_000n },
    datum: { type: "inline", data: bigData },
  }),
  output({
    address: plutusAddress,
    value: { lovelace: 2_000_000n },
    datum: { type: "hash", data: bigData, embed: true },
  }),
  output({
    address: plutusAddress,
    value: { lovelace: 2_000_000n },
    datum: { type: "hash", hash: bigDataHash },
  }),
  output({
    address: wallet,
    value: { lovelace: 9_000_000n },
    scriptRef: plutus,
  }),
  output({ address: wallet, value: { lovelace: 9_000_000n }, scriptRef: nOfK }),
  taggedData,
  mint.native({ script: nOfK, assets: { "": 1n, abcd: -2n } }),
  mint.plutus({ script: plutus, redeemer, assets: { "01": 5n } }),
  withdrawal.pubKey({ rewardAddress: keyStake, amount: 0n }),
  withdrawal.pubKey({ rewardAddress: keyStake, amount: "all" }),
  withdrawal.plutus({ script: plutus, redeemer, amount: 1_000n }),
  withdrawal.native({ script: nativeAll, amount: "all" }),
  guard.pubKey({ keyHash: keyHashHex(1), label: "approver" }),
  message({ text: ["Invoice #42 paid", "Zahlung für Bestellung — 東京 ✓"] }),
  validity({ from: 1_700_000_000_000, until: 1_800_000_000_000 }),
  validity({ invalidBefore: 10n, invalidHereafter: 20n }),
  metadata({
    metadataLabel: 2n ** 63n,
    value: {
      big: 2n ** 60n,
      negative: -(2n ** 63n),
      bytes: new Uint8Array([0, 1, 254, 255]),
      list: [1, "a", [2]],
      map: new Map<bigint | string, string>([
        [2n ** 55n, "x"],
        ["k", "y"],
      ]),
    },
  }),
  auxiliaryScript({ script: nOfK }),
  auxiliaryScript({ script: plutus }),
  donation({ amount: 1_000_000n }),
  treasuryValue({ amount: 0n }),
  networkId({ network: "testnet" }),
  certificate.stakeRegistration({ stake: keyStake, deposit: 2_000_000n }),
  certificate.stakeRegistration({ stake: keyStake }),
  certificate.stakeRegistration({
    stake: plutusStake,
    deposit: 2_000_000n,
    witness: plutusWitness,
  }),
  certificate.legacyStakeRegistration({ stake: keyStake }),
  certificate.stakeDeregistration({ stake: keyStake, refund: 2_000_000n }),
  certificate.legacyStakeDeregistration({ stake: keyStake }),
  certificate.stakeDelegation({ stake: keyStake, pool: poolId }),
  certificate.stakeDelegation({
    stake: nativeStake,
    pool: poolId,
    witness: { native: nativeAll },
  }),
  certificate.voteDelegation({ stake: keyStake, drep }),
  certificate.stakeAndVoteDelegation({
    stake: keyStake,
    pool: poolId,
    drep: "alwaysAbstain",
  }),
  certificate.stakeRegistrationAndDelegation({
    stake: keyStake,
    pool: poolId,
    deposit: 2_000_000n,
  }),
  certificate.voteRegistrationAndDelegation({
    stake: keyStake,
    drep: "alwaysNoConfidence",
    deposit: 2_000_000n,
  }),
  certificate.stakeVoteRegistrationAndDelegation({
    stake: keyStake,
    pool: poolId,
    drep,
    deposit: 2_000_000n,
  }),
  certificate.poolRegistration({ params: poolParams }),
  certificate.poolRetirement({ pool: poolId, epoch: 2n ** 60n }),
  certificate.committeeHotAuth({ cold: keyStake, hot: keyStake }),
  certificate.committeeColdResign({ cold: keyStake, anchor }),
  certificate.drepRegistration({ drep, deposit: 500_000_000n, anchor }),
  certificate.drepRegistration({ drep }),
  certificate.drepDeregistration({ drep, refund: 500_000_000n }),
  certificate.drepUpdate({ drep }),
  vote({
    voter: { drep },
    votes: [
      { action, vote: "yes" },
      { action: { txHash: "b".repeat(64), index: 2 }, vote: "abstain", anchor },
    ],
    label: "ballot",
  }),
  vote({
    voter: { committee: { type: "SCRIPT", value: alwaysSucceedHash } },
    votes: [{ action, vote: "no" }],
    witness: plutusWitness,
  }),
  vote({ voter: { pool: poolHash }, votes: [{ action, vote: "yes" }] }),
  proposal.info(common),
  proposal.info({ ...common, deposit: 100_000_000_000n }),
  proposal.parameterChange({
    ...common,
    updates: {
      max_tx_size: 16384,
      key_deposit: "2000000",
      ref_script_coins_per_byte: { numerator: "15", denominator: "1" },
    },
    previous: action,
    guardrail: plutusWitness,
  }),
  proposal.treasuryWithdrawals({
    ...common,
    withdrawals: { [keyStake]: 1n },
    guardrail: { native: nativeAll },
  }),
  proposal.hardForkInitiation({
    ...common,
    protocolVersion: { major: 11, minor: 0 },
  }),
  proposal.noConfidence({ ...common, previous: action }),
  proposal.updateCommittee({
    ...common,
    remove: [{ type: "KEY", value: keyHashHex(1) }],
    add: [
      {
        credential: { type: "SCRIPT", value: alwaysSucceedHash },
        termLimit: 2n ** 60n,
      },
    ],
    quorum: { numerator: 2, denominator: 3 },
  }),
  proposal.newConstitution({
    ...common,
    constitution: { anchor, scriptHash: alwaysSucceedHash },
  }),
];

/* A builder over a fake fetcher and evaluator, for real built transactions */

const params = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];
const evaluator: IEvaluator = {
  evaluateTx: async (tx) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: TAGS[r.tag()]!,
      index: Number(r.index()),
      budget: { mem: 5000, steps: 7000 },
    })),
};
const builder = new TxBuilder({
  network: "preprod",
  params,
  costModels,
  evaluator,
});

const UNTIL = 1_800_000_000_000;
let nextHash = 0x500;
const funds = (lovelace: bigint) =>
  utxoAt(0, wallet, { value: { lovelace: lovelace } }, hash(++nextHash));

/** A Plutus spend and a native n-of-k spend, paid from `payer`: collateral, a native signer */
const scriptTx = (payer: Utxo) =>
  builder.build(
    [
      spend.plutus({
        utxo: utxoAt(0, plutusAddress, { datum: unitInline }, hash(0x400)),
        script: plutus,
        redeemer: { data: bigData },
        label: "unlock",
      }),
      spend.native({
        utxo: utxoAt(1, nOfKAddress, {}, hash(0x400)),
        script: nOfK,
      }),
      output({ address: recipient, value: { lovelace: 12_000_000n } }),
      validity({ until: UNTIL }),
    ],
    { payer: { changeAddress: wallet, utxos: [payer] } },
  );

const expectUnread = (run: () => unknown, message: RegExp) => {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(TxError.is(error, "INVALID_STATE")).toBe(true);
  const planError = error as TxPlanError<"INVALID_STATE">;
  expect(planError.details.reason).toBe("recordVersion");
  expect(planError.retryable).toBe(false);
  expect(planError.message).toMatch(message);
  expect(planError.message).toContain(NOT_UNPAID);
  return planError;
};

/* ---------------------------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------------------------- */

describe("the encoding of parts", () => {
  it("gives back every part kind and form, as plain JSON data", () => {
    const parts = everyPart();
    const kinds = new Set(parts.map((part) => part.kind));
    expect(kinds.size).toBe(17);
    const encoded = encodeParts(parts);
    // Plain JSON data: a JSON round trip changes nothing
    expect(JSON.parse(JSON.stringify(encoded))).toStrictEqual(encoded);
    const decoded = decodeParts(encoded);
    expect(decoded).toEqual(parts);
    // Encoding what was decoded gives the same data
    expect(encodeParts(decoded)).toStrictEqual(encoded);
    // Decoded parts are frozen, as the part builders make them
    expect(Object.isFrozen(decoded[0])).toBe(true);
    expect(Object.isFrozen((decoded[0] as { input: object }).input)).toBe(true);
  });

  it("writes each bigint as its decimal string at its own field, and reads it back as a bigint", () => {
    const [nativeSpend, retirement, committee, meta] = [
      spend.native({ utxo: utxoAt(1, nOfKAddress), script: nOfK }),
      certificate.poolRetirement({ pool: poolId, epoch: 2n ** 60n }),
      proposal.updateCommittee({
        ...common,
        remove: [],
        add: [
          {
            credential: { type: "KEY", value: keyHashHex(2) },
            termLimit: 2n ** 60n,
          },
        ],
        quorum: { numerator: 1, denominator: 2 },
      }),
      metadata({ metadataLabel: 1, value: [2n ** 60n] }),
    ];
    const encoded = encodeParts([
      nativeSpend,
      retirement,
      committee,
      meta,
      taggedData,
    ]) as any[];
    expect(encoded[0].witness.script.script.value.n).toBe("1");
    expect(encoded[1].certificate.value.epoch).toBe(String(2n ** 60n));
    expect(
      encoded[2].proposal.governance_action.value.committee.members[0]
        .term_limit,
    ).toBe(String(2n ** 60n));
    expect(encoded[3].value.value[0]).toEqual({
      type: "INT",
      value: String(2n ** 60n),
    });
    const data = encoded[4].output.plutus_data.value.data;
    expect(data.alternative).toBe(String(2n ** 64n - 1n));
    expect(data.fields[0].value).toBe(String(-(2n ** 70n)));
    expect(data.fields[2].value[0][1].value[0].value).toBe(
      String(2n ** 53n + 1n),
    );

    const decoded = decodeParts(encoded) as any[];
    expect(decoded[0].witness.script.script.value.n).toBe(1n);
    expect(decoded[1].certificate.value.epoch).toBe(2n ** 60n);
    expect(
      decoded[2].proposal.governance_action.value.committee.members[0]
        .term_limit,
    ).toBe(2n ** 60n);
    expect(decoded[3].value.value[0].value).toBe(2n ** 60n);
    expect(decoded[4].output.plutus_data.value.data.alternative).toBe(
      2n ** 64n - 1n,
    );
  });

  it("keeps a datum given in CBOR as the same hex", () => {
    const part = output({
      address: plutusAddress,
      value: { lovelace: 2_000_000n },
      datum: {
        type: "inline",
        data: { type: "CBOR", content: "d8799f1903e8ff" },
      },
    });
    const [encoded] = encodeParts([part]) as any[];
    expect(encoded.output.plutus_data.value).toEqual({
      type: "CBOR",
      hex: "d8799f1903e8ff",
    });
    expect(decodeParts([encoded])).toEqual([part]);
  });

  it("refuses a text that is not a decimal integer where a bigint stands", () => {
    const [encoded] = encodeParts([
      certificate.poolRetirement({ pool: poolId, epoch: 600 }),
    ]) as any[];
    for (const epoch of ["1.5", "0x10", "01", "", "-0", " 1", "1e3", 600])
      expect(() =>
        decodeParts([
          {
            ...encoded,
            certificate: {
              ...encoded.certificate,
              value: { ...encoded.certificate.value, epoch },
            },
          },
        ]),
      ).toThrow(UnreadContent);
    expect(() => decodeParts([encoded])).not.toThrow();
  });

  it("refuses a part kind, a member or a form it does not know, naming it", () => {
    const [out, plutusSpend] = encodeParts([
      output({ address: recipient, value: { lovelace: 2_000_000n } }),
      spend.plutus({
        utxo: utxoAt(2, plutusAddress, { datum: unitInline }),
        script: plutus,
        redeemer,
      }),
    ]) as any[];
    expect(() => decodeParts([{ ...out, kind: "split" }])).toThrow(
      /parts\[0\]: the part kind "split"/,
    );
    expect(() => decodeParts([{ ...out, change: true }])).toThrow(
      /parts\[0\]\.change, a member this library does not know/,
    );
    expect(() => decodeParts([{ kind: "output" }])).toThrow(
      /parts\[0\]\.output is missing/,
    );
    expect(() =>
      decodeParts([
        {
          ...plutusSpend,
          witness: {
            ...plutusSpend.witness,
            redeemer: { data: { type: "deferred" } },
          },
        },
      ]),
    ).toThrow(
      /parts\[0\]\.witness\.redeemer\.data: data of the form "deferred"/,
    );
    expect(() =>
      decodeParts([{ ...plutusSpend, witness: { type: "guardian" } }]),
    ).toThrow(/a witness of the type "guardian"/);
  });

  it("is NOT_SERIALIZABLE for a redeemer function, naming the part and its label", () => {
    const parts = [
      output({ address: recipient, value: { lovelace: 2_000_000n } }),
      spend.plutus({
        utxo: utxoAt(2, plutusAddress, { datum: unitInline }),
        script: plutus,
        redeemer: { data: (tx) => tx.self },
        label: "unlock",
      }),
    ];
    let error: unknown;
    try {
      encodeParts(parts);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TxBuildError);
    expect(TxError.is(error, "NOT_SERIALIZABLE")).toBe(true);
    expect((error as TxBuildError).part).toBe("spend");
    expect((error as TxBuildError).label).toBe("unlock");
    expect((error as TxBuildError).details).toBeUndefined();
    expect((error as Error).message).toMatch(/^spend "unlock": /);
    // Every kind that takes a Plutus witness
    for (const part of [
      mint.plutus({
        script: plutus,
        redeemer: { data: () => 0 },
        assets: { "01": 1n },
      }),
      withdrawal.plutus({
        script: plutus,
        redeemer: { data: () => 0 },
        amount: 0n,
      }),
      certificate.stakeRegistration({
        stake: plutusStake,
        deposit: 2_000_000n,
        witness: { plutus, redeemer: { data: () => 0 } },
      }),
      vote({
        voter: { committee: { type: "SCRIPT", value: alwaysSucceedHash } },
        votes: [{ action, vote: "no" }],
        witness: { plutus, redeemer: { data: () => 0 } },
      }),
      proposal.parameterChange({
        ...common,
        updates: { max_tx_size: 16384 },
        guardrail: { plutus, redeemer: { data: () => 0 } },
      }),
    ])
      expect(() => encodeParts([part])).toThrow(
        expect.objectContaining({ code: "NOT_SERIALIZABLE", part: part.kind }),
      );
  });
});

describe("the encoding of a built transaction", () => {
  it("gives back a BuiltTxData with a Plutus script, collateral and a native signer, bigints as bigints", async () => {
    const built = await scriptTx(funds(50_000_000n));
    expect(built.collateral).toBeDefined();
    expect(built.signers.nativeScripts).toHaveLength(1);
    expect(built.redeemers).toHaveLength(1);
    const record = recordWith([built]);
    const encoded = encodePlan(record) as any;
    const json = encoded.steps[0].tx.built;
    expect(json.fee).toBe(String(built.fee));
    expect(json.exUnits).toEqual({ mem: "5000", steps: "7000" });
    expect(json.redeemers[0].exUnits).toEqual({ mem: "5000", steps: "7000" });
    expect(json.collateral.total).toBe(String(built.collateral!.total));
    expect(json.signers.nativeScripts[0].value.n).toBe("1");
    expect(JSON.parse(JSON.stringify(encoded))).toStrictEqual(encoded);

    const read = readPlan(encoded).steps[0]!.built;
    expect(read).toEqual(built);
    expect(read.fee).toBe(built.fee);
    expect(read.exUnits.mem).toBe(5000n);
    expect(read.redeemers[0]!.exUnits.steps).toBe(7000n);
    expect(read.collateral!.total).toBe(built.collateral!.total);
    expect((read.signers.nativeScripts[0] as any).value.n).toBe(1n);
    // The bigints inside the prototype and the parts
    const witness = read.prototype.witness_set;
    expect((witness.native_scripts![0] as any).value.n).toBe(1n);
    const spent = read.parts.find(
      (part) => part.kind === "spend" && part.witness.type === "native",
    ) as any;
    expect(spent.witness.script.script.value.n).toBe(1n);
  });

  it("gives back the UTxOs of a BuiltTxData with tokens, datums and scripts, quantities as bigints", async () => {
    const unit = mockTokenUnit(1);
    const payer = utxoAt(
      0,
      wallet,
      { value: { lovelace: 80_000_000n, [unit]: 7n } },
      hash(++nextHash),
    );
    const built = await builder.build(
      [
        output({
          address: plutusAddress,
          value: { lovelace: 3_000_000n, [unit]: 2n },
          datum: { type: "inline", data: bigData },
        }),
        output({
          address: plutusAddress,
          value: { lovelace: 3_000_000n },
          datum: { type: "hash", data: bigData },
        }),
        output({
          address: recipient,
          value: { lovelace: 20_000_000n },
          scriptRef: plutus,
        }),
        output({
          address: recipient,
          value: { lovelace: 5_000_000n },
          scriptRef: nOfK,
        }),
        validity({ until: UNTIL }),
      ],
      { payer: { changeAddress: wallet, utxos: [payer] } },
    );
    expect(built.outputs.map((o) => o.datum?.type)).toEqual([
      "inline",
      "hash",
      undefined,
      undefined,
      undefined,
    ]);
    expect(built.outputs.map((o) => o.script?.type)).toEqual([
      undefined,
      undefined,
      "plutus",
      "native",
      undefined,
    ]);
    const encoded = encodePlan(recordWith([built])) as any;
    const json = encoded.steps[0].tx.built;
    expect(json.outputs[0].value).toEqual({
      lovelace: "3000000",
      [unit]: "2",
    });
    expect(JSON.parse(JSON.stringify(encoded))).toStrictEqual(encoded);

    const record = readPlan(encoded);
    const read = record.steps[0]!.built;
    expect(read).toEqual(built);
    expect(read.outputs).toEqual(built.outputs);
    expect(read.inputs).toEqual(built.inputs);
    expect(read.outputs[0]!.value[unit]).toBe(2n);
    expect(read.inputs[0]!.value.lovelace).toBe(80_000_000n);
    expect(read.inputs[0]!.value[unit]).toBe(7n);
    expect(read.change[0]!.value[unit]).toBe(5n);
    expect(read.change[0]!.change).toBe(true);
    expect((record.options as any).knownUtxos[0].value.lovelace).toBe(
      5_000_000n,
    );
  });
});

/* ---------------------------------------------------------------------------------------------
 * Records
 * ------------------------------------------------------------------------------------------- */

const PARTS = (): TxPart[] => [
  output({ address: recipient, value: { lovelace: 3_000_000n } }),
  metadata({ metadataLabel: 674, value: { n: 2n ** 60n } }),
];

/**
 * A plan of these transactions, each a step of its own given with the parts and two data options,
 * with the plan's data options
 */
const recordWith = (
  builts: readonly BuiltTxData[],
  network: PlanRecord["network"] = "preprod",
): PlanRecord =>
  accept(
    emptyPlan({
      id: "pay-1",
      network,
      deadlines: { ttlMs: 600_000, expiryMarginMs: 60_000, confirmations: 3 },
      options: {
        knownUtxos: [utxoAt(7, wallet)],
        registeredPools: [poolHash],
        extraKeyWitnesses: 1,
        topUpCollateral: false,
        collateralReturn: false,
        changeAddress: wallet,
      },
    }),
    {
      type: "steps",
      steps: builts.map((built, i) => ({
        name: `pay-${i + 1}`,
        // The data of the build, as a plan holds it
        built: { ...built },
        standsOn: [],
        given: {
          parts: PARTS(),
          options: { fee: 400_000n, sendAllTo: recipient },
        },
        extraKeyWitnesses: 1,
      })),
    },
  );

/** A plan of a Plutus and native spend and a plain payment, stopped before anything was sent */
const stoppedRecord = async () => {
  const script = await scriptTx(funds(50_000_000n));
  const plain = await builder.build(
    [output({ address: recipient, value: { lovelace: 2_000_000n } })],
    { payer: { changeAddress: wallet, utxos: [funds(10_000_000n)] } },
  );
  return accept(recordWith([script, plain]), { type: "stop" });
};

describe("the encoding of a record", () => {
  it("gives back a plan of a Plutus and native spend and a payment, its given parts and options, and the mark", async () => {
    const record = await stoppedRecord();
    expect(record.steps.map((step) => step.status)).toEqual(["built", "built"]);
    // Its steps may still be signed and sent by another party: it is stopping
    expect(record.status).toBe("stopping");
    const encoded = encodePlan(record);
    expect(encoded).toMatchObject({
      kind: "TxPlan",
      version: PLAN_RECORD_VERSION,
      rev: 2,
      stopped: true,
    });
    expect(PLAN_RECORD_VERSION).toBe(2);
    expect(encoded.options.topUpCollateral).toBe(false);
    expect(encoded.options.collateralReturn).toBe(false);
    expect(encoded.steps[0]!.given!.options!.fee).toBe("400000");
    expect(encoded.steps[0]!.tx.extraKeyWitnesses).toBe(1);
    expect(encoded.steps[0]!.tx.built.collateral).toBeDefined();
    expect(JSON.parse(JSON.stringify(encoded))).toStrictEqual(encoded);
    expect(readPlan(encoded)).toEqual(record);
    expect(readPlan(encoded, "pay-1")).toEqual(record);
    expect(encodePlan(readPlan(encoded))).toStrictEqual(encoded);
  });

  it("writes a custom network as its whole configuration", async () => {
    const network = {
      name: "devnet",
      networkId: 0 as const,
      slotConfig: {
        zeroTime: 1_700_000_000_000,
        zeroSlot: 0,
        slotLength: 1000,
        startEpoch: 0,
        epochLength: 500,
      },
    };
    const plain = await builder.build(
      [output({ address: recipient, value: { lovelace: 2_000_000n } })],
      { payer: { changeAddress: wallet, utxos: [funds(10_000_000n)] } },
    );
    const record = recordWith([plain], network);
    const encoded = encodePlan(record);
    expect(encoded.network).toEqual(network);
    expect(readPlan(encoded)).toEqual(record);
  });
});

/* ---------------------------------------------------------------------------------------------
 * The reader
 * ------------------------------------------------------------------------------------------- */

describe("readPlan", () => {
  let base: any;
  beforeAll(async () => {
    base = encodePlan(await stoppedRecord());
  });
  /** The base record with a change made to a copy of it */
  const changed = (change: (json: any) => void) => {
    const json = JSON.parse(JSON.stringify(base));
    change(json);
    return json;
  };

  it("refuses a version it does not read, naming the value", () => {
    for (const [version, shown] of [
      [3, "3"],
      [0, "0"],
      [1.5, "1\\.5"],
      ["2", '"2"'],
      [undefined, "none"],
    ] as const)
      expectUnread(
        () => readPlan(changed((json) => (json.version = version))),
        new RegExp(`the version ${shown}: this library reads version 2`),
      );
    expectUnread(
      () => readPlan(changed((json) => (json.version = 1))),
      /the version 1: a record of a plan of one payment built anew in attempts, a format this library does not read; it reads version 2/,
    );
    expect(base.version).toBe(2);
  });

  it("refuses another kind, a part kind and a status it does not know, naming them", () => {
    expectUnread(
      () => readPlan(changed((json) => (json.kind = "Other"))),
      /the kind "Other"/,
    );
    expectUnread(
      () =>
        readPlan(
          changed((json) => (json.steps[0].given.parts[0].kind = "split")),
        ),
      /steps\[0\]\.given\.parts\[0\]: the part kind "split"/,
    );
    expectUnread(
      () => readPlan(changed((json) => (json.steps[0].status = "pending"))),
      /steps\[0\]\.status: the step status "pending"/,
    );
    expectUnread(
      () => readPlan(changed((json) => (json.status = "paused"))),
      /status: the plan status "paused"/,
    );
    expectUnread(
      () => readPlan(changed((json) => (json.status = "final"))),
      /the plan status "final", which its steps and mark do not give/,
    );
    expectUnread(
      () =>
        readPlan(
          changed((json) => (json.steps[0].tx.built.parts[0].kind = "split")),
        ),
      /steps\[0\]\.tx\.built\.parts\[0\]: the part kind "split"/,
    );
    expectUnread(() => readPlan("text"), /the record is "text", not an object/);
    expectUnread(() => readPlan(null), /the record is null, not an object/);
  });

  it("refuses a broken shape, naming the member", () => {
    const cases: [(json: any) => void, RegExp][] = [
      [
        (json) => delete json.deadlines.ttlMs,
        /deadlines\.ttlMs is none, not a number/,
      ],
      [(json) => (json.rev = "3"), /rev is "3", not a whole number/],
      [
        (json) => delete json.steps[0].txHash,
        /steps\[0\]\.txHash is none, not a text/,
      ],
      [
        (json) => (json.steps[0].given.options.fee = "1.5"),
        /steps\[0\]\.given\.options\.fee is "1\.5", not a decimal integer/,
      ],
      [
        (json) => (json.options.topUpCollateral = "false"),
        /options\.topUpCollateral is "false", not true or false/,
      ],
      [
        (json) => (json.options.collateralReturn = 0),
        /options\.collateralReturn is 0, not true or false/,
      ],
      [
        (json) => delete json.steps[1].tx,
        /steps\[1\]\.tx is none, not an object/,
      ],
      [
        (json) => (json.steps[0].tx.built.fee = 7),
        /steps\[0\]\.tx\.built\.fee is 7, not a decimal integer/,
      ],
      // Members this library does not know
      [
        (json) => (json.storedAt = 1),
        /storedAt, a member this library does not know/,
      ],
      [
        (json) => (json.deadlines.graceMs = 1),
        /deadlines\.graceMs, a member this library does not know/,
      ],
      [
        (json) => (json.steps[0].level = 1),
        /steps\[0\]\.level, a member this library does not know/,
      ],
      [
        (json) => (json.steps[0].tx.built.level = "dijkstra"),
        /steps\[0\]\.tx\.built\.level, a member this library does not know/,
      ],
      [
        (json) => (json.options.changeSelection = { name: "x" }),
        /options\.changeSelection, a member this library does not know/,
      ],
      [
        (json) => (json.steps[0].given.parts[0].change = true),
        /steps\[0\]\.given\.parts\[0\]\.change, a member this library does not know/,
      ],
    ];
    for (const [change, message] of cases)
      expectUnread(() => readPlan(changed(change)), message);
    // An id other than the one asked for
    expectUnread(
      () => readPlan(base, "pay-2"),
      /id is "pay-1", where "pay-2" was asked for/,
    );
    expectUnread(
      () =>
        readPlan(
          changed((json) => delete json.id),
          "pay-1",
        ),
      /id is none, where "pay-1" was asked for/,
    );
    const error = expectUnread(
      () => readPlan(changed((json) => (json.version = 3))),
      /version 3/,
    );
    expect(error.planId).toBe("pay-1");
  });

  it("refuses required keys that are not those of keyHashes with known roles, naming the member", () => {
    const signers = (json: any) => json.steps[0].tx.built.signers;
    const [first] = signers(base).keys;
    expect(first.roles.length).toBeGreaterThan(0);
    const cases: [(json: any) => void, RegExp][] = [
      [
        (json) => delete signers(json).keys[0].roles,
        /signers\.keys\[0\]\.roles is none, not a list/,
      ],
      [
        (json) => (signers(json).keys[0].roles = "input"),
        /signers\.keys\[0\]\.roles is "input", not a list/,
      ],
      [
        (json) => (signers(json).keys[0].roles = ["payer"]),
        /signers\.keys\[0\]\.roles\[0\]: the signer role "payer"/,
      ],
      [
        (json) => (signers(json).keys[0].roles = ["toString"]),
        /signers\.keys\[0\]\.roles\[0\]: the signer role "toString"/,
      ],
      [
        (json) => (signers(json).keys[0] = first.keyHash),
        /signers\.keys\[0\] is "[0-9a-f]+", not an object/,
      ],
      [
        (json) => delete signers(json).keys[0].keyHash,
        /signers\.keys\[0\]\.keyHash is none, not a text/,
      ],
      [
        (json) => (signers(json).keys[0].neededBy = []),
        /signers\.keys\[0\]\.neededBy, a member this library does not know/,
      ],
      [
        (json) => (signers(json).keys[0].keyHash = "ab".repeat(28)),
        /signers\.keys does not name the keys of keyHashes/,
      ],
      [
        (json) => signers(json).keys.push({ ...first }),
        /signers\.keys does not name the keys of keyHashes/,
      ],
    ];
    for (const [change, message] of cases)
      expectUnread(() => readPlan(changed(change)), message);
  });

  it("refuses a UTxO of another shape wherever the record holds one", () => {
    // A UTxO in the Mesh form, which a record does not hold
    const mesh = {
      input: { txHash: hash(1), outputIndex: 0 },
      output: {
        address: wallet,
        amount: [{ unit: "lovelace", quantity: "5000000" }],
      },
    };
    const built = "steps\\[0\\]\\.tx\\.built";
    const cases: [(json: any) => void, RegExp][] = [
      [
        (json) => (json.options.knownUtxos = [mesh]),
        /options\.knownUtxos\[0\]\.input, a member this library does not know/,
      ],
      [
        (json) => (json.steps[0].tx.built.inputs[0] = mesh),
        new RegExp(`${built}\\.inputs\\[0\\]\\.input, a member`),
      ],
      [
        (json) => (json.steps[0].tx.built.outputs[0] = { ...mesh, label: "x" }),
        new RegExp(`${built}\\.outputs\\[0\\]\\.input, a member`),
      ],
      [
        (json) => (json.steps[0].tx.built.parts[0].utxo = mesh),
        new RegExp(`${built}\\.parts\\[0\\]\\.utxo\\.input, a member`),
      ],
      [
        (json) =>
          (json.steps[0].tx.built.collateral.return = {
            address: wallet,
            amount: { coin: "1000000" },
          }),
        new RegExp(`${built}\\.collateral\\.return\\.amount, a member`),
      ],
      // The marks of a built output belong to outputs only
      [
        (json) => (json.steps[0].tx.built.inputs[0].change = true),
        new RegExp(`${built}\\.inputs\\[0\\]\\.change, a member`),
      ],
      [
        (json) => (json.steps[0].tx.built.inputs[0].value.lovelace = 5),
        new RegExp(
          `${built}\\.inputs\\[0\\]\\.value\\.lovelace is 5, not a decimal integer`,
        ),
      ],
      [
        (json) => delete json.steps[0].tx.built.inputs[0].value.lovelace,
        new RegExp(`${built}\\.inputs\\[0\\]\\.value holds no lovelace`),
      ],
      [
        (json) =>
          (json.steps[0].tx.built.inputs[0].datum = {
            type: "inline",
            data: "d87980",
          }),
        new RegExp(
          `${built}\\.inputs\\[0\\]\\.datum\\.data is "d87980", not an object`,
        ),
      ],
      [
        (json) =>
          (json.steps[0].tx.built.inputs[0].script = {
            type: "plutus",
            version: "V4",
            code: "00",
            hash: "00",
          }),
        new RegExp(
          `${built}\\.inputs\\[0\\]\\.script\\.version: the Plutus version "V4"`,
        ),
      ],
      [
        (json) =>
          (json.steps[0].tx.built.inputs[0].script = {
            type: "bytes",
            cbor: "00",
          }),
        new RegExp(
          `${built}\\.inputs\\[0\\]\\.script: a script of the type "bytes"`,
        ),
      ],
    ];
    expect(base.steps[0].tx.built.collateral.return).toBeDefined();
    for (const [change, message] of cases)
      expectUnread(() => readPlan(changed(change)), message);
  });

  it("refuses a record that is not plain JSON data", () => {
    expectUnread(
      () =>
        readPlan(
          changed((json) => (json.steps[0].given.options.fee = 400_000n)),
        ),
      /the record is not JSON data/,
    );
  });
});
