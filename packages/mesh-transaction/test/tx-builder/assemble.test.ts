import {
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  mConStr0,
  NativeScript,
  resolveNativeScriptHash,
  resolveScriptHash,
} from "@meshsdk/core";
import {
  Address,
  blake2b,
  keyHashToRewardAddress,
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
  toNativeScript,
  Transaction,
  transactionPrototypeFromHex,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  assembleTxPrototype,
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
  OutputDatum,
  OutputScript,
  proposal,
  RedeemerContext,
  referenceInput,
  spend,
  treasuryValue,
  TxBuildError,
  TxError,
  TxPart,
  Utxo,
  validity,
  vote,
  withdrawal,
} from "../../src/tx-builder";
import { voterKey } from "../../src/tx-builder/ordering";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  baseAddress,
  keyHashHex,
  mintParamCbor,
  spend42Cbor,
} from "../test-util";

const budget = { mem: 1000, steps: 2000 };
const redeemer = (n: number) => ({ data: mConStr0([n]), exUnits: budget });
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);
const walletAddress = baseAddress(1);
const nativeScript: NativeScript = { type: "all", scripts: [] };
const anchor = { url: "https://example.com/a.json", dataHash: "ab".repeat(32) };
/** The fee, and the cost models the script data hash of every Plutus version needs */
const options = {
  fee: 200000n,
  costModels: [
    DEFAULT_V1_COST_MODEL_LIST,
    DEFAULT_V2_COST_MODEL_LIST,
    DEFAULT_V3_COST_MODEL_LIST,
  ],
};
const plutusRef: OutputScript = {
  type: "plutus",
  version: "V3",
  code: alwaysSucceedCbor,
  hash: alwaysSucceedHash,
};
const nativeRef: OutputScript = {
  type: "native",
  cbor: toNativeScript(nativeScript).toCbor().toString(),
  hash: resolveNativeScriptHash(nativeScript),
};
/** A reference script that is not one: the bytes are not a script */
const unknownRef: OutputScript = { type: "unknown", scriptRef: "ff00" };
const unitInline: OutputDatum = {
  type: "inline",
  data: { type: "CBOR", content: "d87980" },
};

const utxo = (
  txHash: string,
  outputIndex: number,
  address = walletAddress,
  extra: Partial<Utxo> = {},
  lovelace = 5_000_000n,
): Utxo => ({
  txHash,
  outputIndex,
  address,
  value: { lovelace },
  ...extra,
});

const scriptUtxo = (txHash: string, outputIndex: number) =>
  utxo(txHash, outputIndex, scriptAddress, { datum: unitInline });

const keySpend = (txHash: string, outputIndex: number) =>
  spend.pubKey({ utxo: utxo(txHash, outputIndex) });

const scriptSpend = (txHash: string, outputIndex: number, n: number) =>
  spend.plutus({
    utxo: scriptUtxo(txHash, outputIndex),
    script: plutusScript,
    redeemer: redeemer(n),
    label: `spend ${n}`,
  });

const pay = output({ address: walletAddress, value: { lovelace: 2000000n } });

const expectBuildError = (build: () => unknown, code: string) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxBuildError);
    expect((error as TxBuildError).code).toBe(code);
    return error as TxBuildError;
  }
  throw new Error(`expected a ${code} error`);
};

/** The redeemer data's argument, which tells the test's redeemers apart */
const redeemerArgs = (parts: TxPart[]) =>
  assembleTxPrototype(parts, options).redeemers.map((r) => ({
    tag: r.tag,
    index: r.index,
    label: r.label,
  }));

describe("assembleTxPrototype: redeemer indices", () => {
  it("points spend redeemers at the inputs sorted by out ref", () => {
    const parts = [
      keySpend("ff".repeat(32), 0),
      scriptSpend("aa".repeat(32), 1, 1),
      keySpend("00".repeat(32), 3),
      scriptSpend("55".repeat(32), 7, 2),
      scriptSpend("aa".repeat(32), 0, 3),
      pay,
    ];
    const { prototype, redeemers } = assembleTxPrototype(parts, options);

    expect(
      prototype.body.inputs.map((i) => `${i.transaction_id[0]}#${i.index}`),
    ).toEqual(["0#3", "5#7", "a#0", "a#1", "f#0"]);
    expect(redeemers.map((r) => [r.tag, r.index, r.label])).toEqual([
      ["SPEND", 1, "spend 2"],
      ["SPEND", 2, "spend 3"],
      ["SPEND", 3, "spend 1"],
    ]);
    expect(
      prototype.witness_set.redeemers!.map((r) => [r.tag.type, r.index]),
    ).toEqual([
      ["SPEND", "1"],
      ["SPEND", "2"],
      ["SPEND", "3"],
    ]);
    // One script for all three inputs
    expect(prototype.witness_set.plutus_v3_scripts).toHaveLength(1);
  });

  it("sorts outref indices numerically, not as text", () => {
    const parts = [
      scriptSpend("aa".repeat(32), 10, 1),
      scriptSpend("aa".repeat(32), 9, 2),
    ];
    expect(redeemerArgs(parts)).toEqual([
      { tag: "SPEND", index: 0, label: "spend 2" },
      { tag: "SPEND", index: 1, label: "spend 1" },
    ]);
  });

  it("points mint redeemers at the policies sorted by id, native ones included", () => {
    const scripts = [1, 2, 3].map((nonce) => ({
      code: mintParamCbor(nonce),
      version: "V3" as const,
    }));
    const parts: TxPart[] = scripts.map((script, n) =>
      mint.plutus({
        script,
        redeemer: redeemer(n),
        assets: { "01": 1n },
        label: `policy ${n}`,
      }),
    );
    parts.push(mint.native({ script: nativeScript, assets: { "02": -1n } }));
    const policies = [
      ...scripts.map((s) => resolveScriptHash(s.code, "V3")),
      resolveNativeScriptHash(nativeScript),
    ];
    const sorted = [...policies].sort();

    const { prototype, redeemers } = assembleTxPrototype(parts, options);

    expect(Object.keys(prototype.body.mint!)).toEqual(sorted);
    for (const r of redeemers) {
      const n = Number(r.label!.split(" ")[1]);
      expect(r.tag).toBe("MINT");
      expect(r.index).toBe(sorted.indexOf(policies[n]!));
    }
    expect(prototype.witness_set.native_scripts).toHaveLength(1);
  });

  it("puts script reward accounts before key ones, whatever their hashes", () => {
    const scriptAccount = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const otherScript = resolveScriptHash(spend42Cbor, "V3");
    const otherAccount = scriptHashToRewardAddress(otherScript, 0);
    // The smallest possible key hash still sorts after every script hash
    const keyAccount = keyHashToRewardAddress("00".repeat(28), 0);
    const parts = [
      withdrawal.pubKey({ rewardAddress: keyAccount, amount: 0n }),
      withdrawal.plutus({
        rewardAddress: scriptAccount,
        amount: 0n,
        script: plutusScript,
        redeemer: redeemer(1),
        label: "always",
      }),
      withdrawal.plutus({
        rewardAddress: otherAccount,
        amount: 0n,
        script: { code: spend42Cbor, version: "V3" },
        redeemer: redeemer(2),
        label: "42",
      }),
    ];
    const { prototype, redeemers } = assembleTxPrototype(parts, options);

    const scriptsFirst = [
      [alwaysSucceedHash, "always"],
      [otherScript, "42"],
    ].sort(([a], [b]) => (a! < b! ? -1 : 1));
    expect(Object.keys(prototype.body.withdrawals!)).toEqual([
      ...scriptsFirst.map(([hash]) => scriptHashToRewardAddress(hash!, 0)),
      keyAccount,
    ]);
    expect(redeemers.map((r) => [r.tag, r.index, r.label])).toEqual(
      scriptsFirst.map(([, label], i) => ["REWARD", i, label]),
    );
  });

  it("keeps certificates and proposals in the order given", () => {
    const stake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const witness = { plutus: plutusScript, redeemer: redeemer(0) };
    const parts = [
      certificate.stakeRegistration({
        stake: keyHashToRewardAddress(keyHashHex(1), 0),
        deposit: 2000000n,
      }),
      certificate.stakeDelegation({
        stake,
        pool: keyHashHex(9),
        witness,
        label: "delegate",
      }),
      certificate.stakeDeregistration({
        stake,
        refund: 2000000n,
        witness,
        label: "deregister",
      }),
      proposal.info({
        rewardAccount: stake,
        anchor,
        deposit: 1000n,
      }),
      proposal.treasuryWithdrawals({
        rewardAccount: stake,
        anchor,
        deposit: 1000n,
        withdrawals: { [stake]: 5n },
        guardrail: { plutus: plutusScript, redeemer: redeemer(0) },
        label: "guarded",
      }),
    ];
    expect(redeemerArgs(parts)).toEqual([
      { tag: "CERT", index: 1, label: "delegate" },
      { tag: "CERT", index: 2, label: "deregister" },
      { tag: "VOTING_PROPOSAL", index: 1, label: "guarded" },
    ]);
  });

  it("orders voters: committee, DRep, pool; scripts before keys", () => {
    const action = { txHash: "a".repeat(64), index: 0 };
    const votes = [{ action, vote: "yes" as const }];
    const witness = { plutus: plutusScript, redeemer: redeemer(0) };
    const scriptCred = { type: "SCRIPT" as const, value: alwaysSucceedHash };
    const keyCred = { type: "KEY" as const, value: "00".repeat(28) };
    const parts = [
      vote({ voter: { pool: keyHashHex(1) }, votes }),
      vote({ voter: { drep: keyCred }, votes }),
      vote({ voter: { drep: scriptCred }, votes, witness, label: "drep" }),
      vote({ voter: { committee: keyCred }, votes }),
      vote({ voter: { committee: scriptCred }, votes, witness, label: "cc" }),
    ];
    const { prototype, redeemers } = assembleTxPrototype(parts, options);

    expect(
      prototype.body.voting_procedures!.map(
        ({ voter }) =>
          `${voter.type}:${typeof voter.value === "string" ? "" : voter.value.type}`,
      ),
    ).toEqual([
      "CONSTITUTIONAL_COMMITTEE_HOT_CRED:SCRIPT",
      "CONSTITUTIONAL_COMMITTEE_HOT_CRED:KEY",
      "DREP:SCRIPT",
      "DREP:KEY",
      "STAKING_POOL:",
    ]);
    expect(redeemers.map((r) => [r.tag, r.index, r.label])).toEqual([
      ["VOTE", 0, "cc"],
      ["VOTE", 2, "drep"],
    ]);
  });

  it("orders the witness set's redeemers by purpose, then index", () => {
    const parts = [
      mint.plutus({
        script: plutusScript,
        redeemer: redeemer(0),
        assets: { "": 1n },
      }),
      scriptSpend("bb".repeat(32), 0, 1),
      scriptSpend("aa".repeat(32), 0, 2),
    ];
    const { prototype } = assembleTxPrototype(parts, options);
    expect(
      prototype.witness_set.redeemers!.map((r) => `${r.tag.type}:${r.index}`),
    ).toEqual(["SPEND:0", "SPEND:1", "MINT:0"]);
  });
});

describe("assembleTxPrototype: transaction contents", () => {
  it("reads reference scripts from reference inputs, once, and not from spent ones", () => {
    const reference = utxo("cc".repeat(32), 0, walletAddress, {
      script: plutusRef,
    });
    const spentReference = utxo("dd".repeat(32), 0, walletAddress, {
      script: plutusRef,
    });
    const parts = [
      spend.plutus({
        utxo: scriptUtxo("aa".repeat(32), 0),
        script: { reference },
        redeemer: redeemer(1),
      }),
      spend.plutus({
        utxo: scriptUtxo("aa".repeat(32), 1),
        script: { reference },
        redeemer: redeemer(2),
      }),
      mint.plutus({
        script: { reference: spentReference },
        redeemer: redeemer(3),
        assets: { "": 1n },
      }),
      spend.pubKey({ utxo: spentReference }),
      referenceInput({ utxo: reference }),
      referenceInput({ utxo: utxo("ee".repeat(32), 4) }),
    ];
    const { prototype, languages } = assembleTxPrototype(parts, options);

    expect(prototype.body.reference_inputs).toEqual([
      { transaction_id: "cc".repeat(32), index: 0 },
      { transaction_id: "ee".repeat(32), index: 4 },
    ]);
    expect(prototype.witness_set.plutus_v3_scripts).toBeUndefined();
    expect(languages).toEqual(new Set(["V3"]));
    expect(prototype.body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("assembles a reference input given by out ref alone; a collateral needs its output", () => {
    const read = { txHash: "cc".repeat(32), outputIndex: 2 };
    const { prototype } = assembleTxPrototype(
      [
        keySpend("aa".repeat(32), 0),
        pay,
        referenceInput({ utxo: read, label: "oracle" }),
        referenceInput({ utxo: utxo("bb".repeat(32), 1) }),
      ],
      options,
    );
    expect(prototype.body.reference_inputs).toEqual([
      { transaction_id: "bb".repeat(32), index: 1 },
      { transaction_id: "cc".repeat(32), index: 2 },
    ]);

    const error = expectBuildError(
      () =>
        assembleTxPrototype(
          [
            keySpend("aa".repeat(32), 0),
            referenceInput({ utxo: read }),
            collateral({ utxo: read, label: "backing" }),
          ],
          options,
        ),
      "UNRESOLVED",
    );
    expect(error.details).toEqual([
      {
        kind: "collateral",
        label: "backing",
        gaps: [
          {
            type: "utxo",
            input: { transaction_id: "cc".repeat(32), index: 2 },
          },
        ],
      },
    ]);
  });

  it("returns what the collateral leaves above the total, tokens included", () => {
    const unit = `${"ab".repeat(28)}0102`;
    const held = utxo("cc".repeat(32), 0, walletAddress, {
      value: { lovelace: 7_000_000n, [unit]: 5n },
    });
    const parts = [
      scriptSpend("aa".repeat(32), 0, 0),
      collateral({ utxo: held }),
      collateral({ utxo: utxo("dd".repeat(32), 1) }),
      collateralReturn({ address: walletAddress, totalCollateral: 3000000n }),
    ];
    const { prototype } = assembleTxPrototype(parts, options);

    expect(prototype.body.collateral).toHaveLength(2);
    expect(prototype.body.total_collateral).toBe("3000000");
    expect(prototype.body.collateral_return).toEqual({
      address: walletAddress,
      amount: {
        coin: "9000000",
        multiasset: { ["ab".repeat(28)]: { "0102": "5" } },
      },
    });
  });

  it("leaves out an empty collateral return", () => {
    const parts = [
      collateral({ utxo: utxo("dd".repeat(32), 1) }),
      collateralReturn({ address: walletAddress, totalCollateral: 5000000n }),
    ];
    const { prototype } = assembleTxPrototype(parts, options);
    expect(prototype.body.total_collateral).toBe("5000000");
    expect(prototype.body.collateral_return).toBeUndefined();
  });

  it("rejects a total collateral above what the collateral holds", () => {
    expectBuildError(
      () =>
        assembleTxPrototype(
          [
            collateral({ utxo: utxo("dd".repeat(32), 1) }),
            collateralReturn({
              address: walletAddress,
              totalCollateral: 5000001n,
            }),
          ],
          options,
        ),
      "INVALID_COLLATERAL",
    );
  });

  it("collects scalars, metadata and datums", () => {
    const datumOutput = output({
      address: scriptAddress,
      value: { lovelace: 3000000n },
      datum: { type: "hash", data: mConStr0([7]), embed: true },
    });
    const parts = [
      keySpend("aa".repeat(32), 0),
      pay,
      datumOutput,
      guard.pubKey({ keyHash: keyHashHex(1) }),
      guard.pubKey({ keyHash: keyHashHex(1) }),
      guard.pubKey({ keyHash: keyHashHex(2) }),
      validity({ invalidBefore: 10, invalidHereafter: 20 }),
      networkId({ network: "testnet" }),
      donation({ amount: 1000n }),
      treasuryValue({ amount: 5n }),
      metadata({ metadataLabel: 674, value: { msg: ["hello"] } }),
      metadata({ metadataLabel: 1, value: 5 }),
    ];
    const { prototype } = assembleTxPrototype(parts, { fee: 123n });

    expect(prototype.body).toMatchObject({
      fee: "123",
      required_signers: [keyHashHex(1), keyHashHex(2)],
      validity_start_interval: "10",
      ttl: "20",
      network_id: { type: "TESTNET" },
      donation: "1000",
      current_treasury_value: "5",
    });
    expect(prototype.body.outputs).toEqual([pay.output, datumOutput.output]);
    expect(prototype.witness_set.plutus_data!.elems).toHaveLength(1);
    // Datums alone still need a script data hash
    expect(prototype.body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(prototype.auxiliary_data!.metadata!)).toEqual([
      "1",
      "674",
    ]);

    const tx = Transaction.fromCbor(
      TxCBOR(transactionPrototypeToHex(prototype)),
    );
    expect(prototype.body.auxiliary_data_hash).toBe(
      blake2b.hash(tx.auxiliaryData()!.toCbor(), 32).toString(),
    );
  });

  it("round-trips through the prototype decoder", () => {
    const parts = [
      scriptSpend("aa".repeat(32), 0, 0),
      keySpend("bb".repeat(32), 1),
      pay,
      mint.native({ script: nativeScript, assets: { "01": 5n } }),
      withdrawal.pubKey({
        rewardAddress: keyHashToRewardAddress(keyHashHex(3), 0),
        amount: 10n,
      }),
      collateral({ utxo: utxo("dd".repeat(32), 1) }),
    ];
    const { prototype } = assembleTxPrototype(parts, options);
    const decoded = transactionPrototypeFromHex(
      transactionPrototypeToHex(prototype),
    );
    expect(decoded.body).toEqual(prototype.body);
    expect(decoded.witness_set.redeemers).toEqual(
      prototype.witness_set.redeemers!.map((r) => ({
        ...r,
        data: expect.anything(),
      })),
    );
  });
});

describe("assembleTxPrototype: errors", () => {
  it("lists what incomplete parts leave open", () => {
    const error = expectBuildError(
      () =>
        assembleTxPrototype(
          [
            spend.pubKey({ utxo: { txHash: "aa".repeat(32), outputIndex: 0 } }),
            output({ address: walletAddress, value: [], label: "min" }),
            spend.plutus({
              utxo: scriptUtxo("bb".repeat(32), 0),
              script: plutusScript,
              redeemer: { data: mConStr0([]) },
            }),
          ],
          options,
        ),
      "UNRESOLVED",
    );
    expect(error.details).toEqual([
      {
        kind: "spend",
        gaps: [
          {
            type: "utxo",
            input: { transaction_id: "aa".repeat(32), index: 0 },
          },
        ],
      },
      { kind: "output", label: "min", gaps: [{ type: "minCoin" }] },
      { kind: "spend", gaps: [{ type: "exUnits" }] },
    ]);
    expect(error.message).toContain('output "min" (minCoin)');
  });

  it("converts no time bound: a validity part given a time is incomplete", () => {
    const error = expectBuildError(
      () =>
        assembleTxPrototype(
          [
            keySpend("aa".repeat(32), 0),
            pay,
            validity({ until: 1755683200000 }),
          ],
          options,
        ),
      "UNRESOLVED",
    );
    expect(error.details).toEqual([
      { kind: "validity", gaps: [{ type: "slot" }] },
    ]);
    expect(error.message).toContain("validity (slot)");
  });

  const action = { txHash: "a".repeat(64), index: 0 };
  const policyParts = [
    mint.native({ script: nativeScript, assets: { "01": 1n } }),
    mint.native({ script: nativeScript, assets: { "02": 1n } }),
  ];
  const voteParts = [
    vote({
      voter: { pool: keyHashHex(1) },
      votes: [{ action, vote: "yes" }],
    }),
    vote({
      voter: { pool: keyHashHex(1) },
      votes: [{ action: { ...action, index: 1 }, vote: "no" }],
    }),
  ];
  // The repeated key for the keyed kinds, the kind for those a transaction holds once
  const twice: [string, TxPart[], string][] = [
    [
      "an input",
      [keySpend("aa".repeat(32), 0), keySpend("aa".repeat(32), 0)],
      `${"aa".repeat(32)}#0`,
    ],
    ["a policy", policyParts, policyParts[0]!.policyId],
    [
      "a reward address",
      [
        withdrawal.pubKey({
          rewardAddress: keyHashToRewardAddress(keyHashHex(1), 0),
          amount: 1n,
        }),
        withdrawal.pubKey({
          rewardAddress: keyHashToRewardAddress(keyHashHex(1), 0),
          amount: 1n,
        }),
      ],
      keyHashToRewardAddress(keyHashHex(1), 0),
    ],
    ["a voter", voteParts, voterKey(voteParts[0]!.voter)],
    [
      "a collateral input",
      [
        collateral({ utxo: utxo("dd".repeat(32), 1) }),
        collateral({ utxo: utxo("dd".repeat(32), 1) }),
      ],
      `${"dd".repeat(32)}#1`,
    ],
    [
      "a validity interval",
      [validity({ invalidBefore: 1 }), validity({ invalidHereafter: 9 })],
      "validity",
    ],
    [
      "a donation",
      [donation({ amount: 1n }), donation({ amount: 2n })],
      "donation",
    ],
    [
      "a treasury value",
      [treasuryValue({ amount: 1n }), treasuryValue({ amount: 1n })],
      "treasuryValue",
    ],
    [
      "a network id",
      [networkId({ network: "testnet" }), networkId({ network: "testnet" })],
      "networkId",
    ],
    [
      "a collateral return",
      [
        collateralReturn({ address: walletAddress, totalCollateral: 1n }),
        collateralReturn({ address: walletAddress, totalCollateral: 1n }),
      ],
      "collateralReturn",
    ],
    [
      "a metadata label",
      [
        metadata({ metadataLabel: 1, value: 1 }),
        metadata({ metadataLabel: 1, value: 2 }),
      ],
      "1",
    ],
  ];
  it.each(twice)("rejects %s given twice", (_, parts, item) => {
    const error = expectBuildError(
      () => assembleTxPrototype(parts, options),
      "DUPLICATE_PART",
    );
    expect(error.details).toEqual({ item });
  });

  it("rejects a reference input the transaction also spends", () => {
    const spent = utxo("aa".repeat(32), 3);
    const read = referenceInput({ utxo: spent, label: "oracle" });
    for (const parts of [
      [spend.pubKey({ utxo: spent }), read],
      [read, spend.pubKey({ utxo: spent })],
    ]) {
      const error = expectBuildError(
        () => assembleTxPrototype(parts, options),
        "DUPLICATE_PART",
      );
      expect(error).toMatchObject({
        part: "referenceInput",
        label: "oracle",
        details: { item: `${"aa".repeat(32)}#3` },
      });
      expect(error.message).toContain(
        `${"aa".repeat(32)}#3 is also spent by this transaction`,
      );
    }
  });

  it("allows a script read from the output it spends, and collateral that is read", () => {
    const holder = utxo("aa".repeat(32), 0, scriptAddress, {
      datum: unitInline,
      script: plutusRef,
    });
    const self = assembleTxPrototype(
      [
        spend.plutus({
          utxo: holder,
          script: { reference: holder },
          redeemer: redeemer(1),
        }),
      ],
      options,
    );
    expect(self.prototype.body.reference_inputs).toBeUndefined();
    expect(self.prototype.body.inputs).toEqual([
      { transaction_id: "aa".repeat(32), index: 0 },
    ]);

    const put = utxo("cc".repeat(32), 1);
    const { prototype } = assembleTxPrototype(
      [
        keySpend("bb".repeat(32), 0),
        collateral({ utxo: put }),
        referenceInput({ utxo: put }),
      ],
      options,
    );
    const input = { transaction_id: "cc".repeat(32), index: 1 };
    expect(prototype.body.collateral).toEqual([input]);
    expect(prototype.body.reference_inputs).toEqual([input]);
  });

  it("rejects one reward account withdrawn twice, in two texts", () => {
    const account = keyHashToRewardAddress(keyHashHex(5), 0);
    const hex = Address.fromString(account)!.toBytes().toString();
    for (const [a, b] of [
      [account, hex],
      [account, account.toUpperCase()],
    ]) {
      expectBuildError(
        () =>
          assembleTxPrototype(
            [
              keySpend("aa".repeat(32), 0),
              withdrawal.pubKey({ rewardAddress: a!, amount: 0n }),
              withdrawal.pubKey({ rewardAddress: b!, amount: 0n }),
            ],
            options,
          ),
        "DUPLICATE_PART",
      );
    }
  });
});

/*
 * The ledger refuses a witness-set script the transaction also gets from the reference script of
 * an output it spends or reads: the attached copy is left out, and the script still counts.
 */
describe("assembleTxPrototype: scripts the transaction's outputs already hold", () => {
  const holder = utxo("cc".repeat(32), 0, walletAddress, { script: plutusRef });
  const policy = resolveScriptHash(alwaysSucceedCbor, "V3");
  const mintAttached = () =>
    mint.plutus({
      script: plutusScript,
      redeemer: redeemer(1),
      assets: { "01": 1n },
    });
  const hexOf = (parts: TxPart[]) =>
    transactionPrototypeToHex(assembleTxPrototype(parts, options).prototype);

  it("leaves out an attached script a spent output holds: the transaction is the reference form's", () => {
    const attached = assembleTxPrototype(
      [spend.pubKey({ utxo: holder }), mintAttached(), pay],
      options,
    );
    const { witness_set, body } = attached.prototype;
    expect(witness_set.plutus_v3_scripts).toBeUndefined();
    expect(attached.languages).toEqual(new Set(["V3"]));
    expect(body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.mint).toEqual({ [policy]: { "01": "1" } });
    expect(transactionPrototypeToHex(attached.prototype)).toBe(
      hexOf([
        spend.pubKey({ utxo: holder }),
        mint.plutus({
          script: { reference: holder },
          redeemer: redeemer(1),
          assets: { "01": 1n },
        }),
        pay,
      ]),
    );
  });

  it("leaves it out for a read output, and for a script spend of the output that holds it", () => {
    const read = assembleTxPrototype(
      [
        keySpend("aa".repeat(32), 0),
        referenceInput({ utxo: holder }),
        mintAttached(),
      ],
      options,
    ).prototype;
    expect(read.witness_set.plutus_v3_scripts).toBeUndefined();
    expect(read.body.reference_inputs).toEqual([
      { transaction_id: "cc".repeat(32), index: 0 },
    ]);
    expect(read.body.script_data_hash).toMatch(/^[0-9a-f]{64}$/);

    // A script output that holds its own validator as its reference script
    const own = utxo("dd".repeat(32), 1, scriptAddress, {
      datum: unitInline,
      script: plutusRef,
    });
    const self = assembleTxPrototype(
      [
        spend.plutus({
          utxo: own,
          script: plutusScript,
          redeemer: redeemer(2),
        }),
      ],
      options,
    ).prototype;
    expect(self.witness_set.plutus_v3_scripts).toBeUndefined();
    expect(self.body.reference_inputs).toBeUndefined();
    expect(transactionPrototypeToHex(self)).toBe(
      hexOf([
        spend.plutus({
          utxo: own,
          script: { reference: own },
          redeemer: redeemer(2),
        }),
      ]),
    );
  });

  it("leaves it out when another part reads the same script by reference", () => {
    const { prototype } = assembleTxPrototype(
      [
        spend.plutus({
          utxo: scriptUtxo("aa".repeat(32), 0),
          script: { reference: holder },
          redeemer: redeemer(1),
        }),
        spend.plutus({
          utxo: scriptUtxo("aa".repeat(32), 1),
          script: plutusScript,
          redeemer: redeemer(2),
        }),
      ],
      options,
    );
    expect(prototype.witness_set.plutus_v3_scripts).toBeUndefined();
    expect(prototype.body.reference_inputs).toEqual([
      { transaction_id: "cc".repeat(32), index: 0 },
    ]);
    expect(prototype.witness_set.redeemers).toHaveLength(2);
  });

  it("leaves out an attached native script a spent output holds", () => {
    const nativeHolder = utxo("cc".repeat(32), 1, walletAddress, {
      script: nativeRef,
    });
    const { prototype } = assembleTxPrototype(
      [
        spend.pubKey({ utxo: nativeHolder }),
        mint.native({ script: nativeScript, assets: { "01": 5n } }),
      ],
      options,
    );
    expect(prototype.witness_set.native_scripts).toBeUndefined();
    expect(prototype.body.mint).toEqual({
      [resolveNativeScriptHash(nativeScript)]: { "01": "5" },
    });
    expect(prototype.body.script_data_hash).toBeUndefined();
  });

  it("keeps the script when no spent or read output holds it: collateral, another script, no script", () => {
    const attachedV3 = (parts: TxPart[]) =>
      assembleTxPrototype([...parts, mintAttached()], options).prototype
        .witness_set.plutus_v3_scripts;
    const scripts = attachedV3([keySpend("aa".repeat(32), 0)]);
    expect(scripts).toHaveLength(1);
    // A collateral input's reference script is not visible to the transaction
    expect(
      attachedV3([keySpend("aa".repeat(32), 0), collateral({ utxo: holder })]),
    ).toEqual(scripts);
    // Outputs that hold another script, spent and read
    const other = (outputIndex: number) =>
      utxo("dd".repeat(32), outputIndex, walletAddress, {
        script: {
          type: "plutus",
          version: "V3",
          code: mintParamCbor(7),
          hash: resolveScriptHash(mintParamCbor(7), "V3"),
        },
      });
    expect(
      attachedV3([
        spend.pubKey({ utxo: other(0) }),
        referenceInput({ utxo: other(1) }),
      ]),
    ).toEqual(scripts);
    // A reference script the ledger could not read either
    const unreadable = utxo("ee".repeat(32), 0, walletAddress, {
      script: unknownRef,
    });
    expect(attachedV3([spend.pubKey({ utxo: unreadable })])).toEqual(scripts);
    // A reference input given by out ref alone
    expect(
      attachedV3([
        keySpend("aa".repeat(32), 0),
        referenceInput({ utxo: { txHash: "cc".repeat(32), outputIndex: 0 } }),
      ]),
    ).toEqual(scripts);
  });
});

describe("assembleTxPrototype: guards", () => {
  const nativeHash = resolveNativeScriptHash(nativeScript);
  const guardError = (parts: TxPart[]) =>
    expectBuildError(
      () => assembleTxPrototype(parts, options),
      "INVALID_GUARD",
    );

  it("refuses a key guard with the hash of a script a witness names", () => {
    const reference = utxo("cc".repeat(32), 0, walletAddress, {
      script: plutusRef,
    });
    const cases: [TxPart, string][] = [
      // The attached Plutus script of a spend
      [scriptSpend("aa".repeat(32), 0, 1), alwaysSucceedHash],
      // An attached native policy
      [mint.native({ script: nativeScript, assets: { "01": 1n } }), nativeHash],
      // A script held in a reference output given in full
      [
        spend.plutus({
          utxo: scriptUtxo("aa".repeat(32), 1),
          script: { reference },
          redeemer: redeemer(2),
        }),
        alwaysSucceedHash,
      ],
    ];
    for (const [witnessed, hash] of cases) {
      const error = guardError([
        keySpend("bb".repeat(32), 0),
        witnessed,
        guard.pubKey({ keyHash: hash, label: "approver" }),
      ]);
      expect(error.part).toBe("guard");
      expect(error.label).toBe("approver");
      if (!TxError.is(error, "INVALID_GUARD")) throw error;
      // Narrowed: the details are typed by the code
      const { reason, hash: found } = error.details;
      expect({ reason, hash: found }).toEqual({ reason: "scriptHash", hash });
    }
  });

  it("reports the first such guard in the order given", () => {
    const error = guardError([
      scriptSpend("aa".repeat(32), 0, 1),
      mint.native({ script: nativeScript, assets: { "01": 1n } }),
      guard.pubKey({ keyHash: keyHashHex(3) }),
      guard.pubKey({ keyHash: nativeHash, label: "first" }),
      guard.pubKey({ keyHash: alwaysSucceedHash, label: "second" }),
    ]);
    expect(error.label).toBe("first");
    expect(error.details).toEqual({ reason: "scriptHash", hash: nativeHash });
  });

  it("assembles key guards, and guards with the hash of a script only carried", () => {
    const carried = { code: spend42Cbor, version: "V3" as const };
    const carriedHash = resolveScriptHash(spend42Cbor, "V3");
    const { prototype } = assembleTxPrototype(
      [
        keySpend("aa".repeat(32), 0),
        scriptSpend("aa".repeat(32), 1, 1),
        output({
          address: walletAddress,
          value: { lovelace: 2000000n },
          scriptRef: carried,
        }),
        auxiliaryScript({ script: nativeScript }),
        // The payment key of the spent input, an unrelated key, and the two carried scripts
        guard.pubKey({ address: walletAddress }),
        guard.pubKey({ keyHash: keyHashHex(9) }),
        guard.pubKey({ keyHash: carriedHash }),
        guard.pubKey({ keyHash: nativeHash }),
      ],
      options,
    );
    expect(prototype.body.required_signers).toEqual([
      keyHashHex(1),
      keyHashHex(9),
      carriedHash,
      nativeHash,
    ]);
  });
});

describe("assembleTxPrototype: messages", () => {
  it("holds one entry under label 674: a second message or metadata 674 is a duplicate", () => {
    const first = message({ text: "one" });
    for (const second of [
      message({ text: "two", label: "again" }),
      metadata({ metadataLabel: 674, value: { msg: ["two"] }, label: "again" }),
    ]) {
      const error = expectBuildError(
        () =>
          assembleTxPrototype(
            [keySpend("aa".repeat(32), 0), first, second],
            options,
          ),
        "DUPLICATE_PART",
      );
      expect(error.label).toBe("again");
      expect(error.details).toEqual({ item: "674" });
    }
  });
});

describe("assembleTxPrototype: redeemer functions", () => {
  /** A redeemer that gives its own index, as an integer */
  const selfRedeemer = {
    data: (tx: RedeemerContext) => tx.self,
    exUnits: budget,
  };
  /** CBOR of a small unsigned integer */
  const smallInt = (n: number) => n.toString(16).padStart(2, "0");
  const dataOf = (parts: TxPart[]) =>
    assembleTxPrototype(parts, options).prototype.witness_set.redeemers!.map(
      (r) => [`${r.tag.type}:${r.index}`, r.data],
    );

  it("gives each redeemer the index of what it witnesses, for every purpose", () => {
    const action = { txHash: "a".repeat(64), index: 0 };
    const votes = [{ action, vote: "yes" as const }];
    const scriptCred = { type: "SCRIPT" as const, value: alwaysSucceedHash };
    const stake = scriptHashToRewardAddress(alwaysSucceedHash, 0);
    const otherStake = scriptHashToRewardAddress(
      resolveScriptHash(spend42Cbor, "V3"),
      0,
    );
    const witness = { plutus: plutusScript, redeemer: selfRedeemer };
    const parts: TxPart[] = [
      keySpend("00".repeat(32), 0),
      ...["bb", "aa", "cc"].map((h) =>
        spend.plutus({
          utxo: scriptUtxo(h.repeat(32), 0),
          script: plutusScript,
          redeemer: selfRedeemer,
        }),
      ),
      ...[1, 2, 3].map((nonce) =>
        mint.plutus({
          script: { code: mintParamCbor(nonce), version: "V3" },
          redeemer: selfRedeemer,
          assets: { "01": 1n },
        }),
      ),
      certificate.stakeRegistration({
        stake: keyHashToRewardAddress(keyHashHex(1), 0),
        deposit: 2000000n,
      }),
      certificate.stakeDelegation({ stake, pool: keyHashHex(9), witness }),
      certificate.stakeDeregistration({ stake, refund: 2000000n, witness }),
      withdrawal.pubKey({
        rewardAddress: keyHashToRewardAddress("00".repeat(28), 0),
        amount: 0n,
      }),
      withdrawal.plutus({
        rewardAddress: otherStake,
        amount: 0n,
        script: { code: spend42Cbor, version: "V3" },
        redeemer: selfRedeemer,
      }),
      withdrawal.plutus({
        rewardAddress: stake,
        amount: 0n,
        script: plutusScript,
        redeemer: selfRedeemer,
      }),
      vote({ voter: { drep: scriptCred }, votes, witness }),
      vote({ voter: { committee: scriptCred }, votes, witness }),
      proposal.info({ rewardAccount: stake, anchor, deposit: 1000n }),
      proposal.treasuryWithdrawals({
        rewardAccount: stake,
        anchor,
        deposit: 1000n,
        withdrawals: { [stake]: 5n },
        guardrail: witness,
      }),
    ];
    const { prototype } = assembleTxPrototype(parts, options);
    const redeemers = prototype.witness_set.redeemers!;

    expect(redeemers.map((r) => `${r.tag.type}:${r.index}`)).toEqual([
      "SPEND:1",
      "SPEND:2",
      "SPEND:3",
      "MINT:0",
      "MINT:1",
      "MINT:2",
      "CERT:1",
      "CERT:2",
      "REWARD:0",
      "REWARD:1",
      "VOTE:0",
      "VOTE:1",
      "VOTING_PROPOSAL:1",
    ]);
    for (const r of redeemers)
      expect(r.data).toEqual({ type: "CBOR", hex: smallInt(Number(r.index)) });
  });

  it("sees the final inputs, reference inputs and outputs, through bound functions", () => {
    const reference = utxo("cc".repeat(32), 0, walletAddress, {
      script: plutusRef,
    });
    const read = utxo("ee".repeat(32), 4);
    const spent = [
      utxo("dd".repeat(32), 1),
      utxo("dd".repeat(32), 0),
      utxo("11".repeat(32), 7),
    ];
    let seen: RedeemerContext | undefined;
    const parts = [
      ...spent.map((u) => spend.pubKey({ utxo: u })),
      spend.plutus({
        utxo: scriptUtxo("aa".repeat(32), 0),
        script: { reference },
        redeemer: {
          data: (tx) => {
            seen = tx;
            return 0;
          },
          exUnits: budget,
        },
      }),
      referenceInput({ utxo: read }),
      output({ address: walletAddress, value: { lovelace: 2000000n } }),
      output({
        address: walletAddress,
        value: { lovelace: 2000000n },
        label: "pay",
      }),
    ];
    const { prototype } = assembleTxPrototype(parts, options);
    const tx = seen!;
    const { input, referenceInput: refInput, output: out } = tx;

    expect(tx.inputs).toEqual(
      prototype.body.inputs.map((i) => ({
        txHash: i.transaction_id,
        outputIndex: i.index,
      })),
    );
    expect(Object.isFrozen(tx.inputs)).toBe(true);
    // An out ref, a full UTxO, an upper-case hash; detached and through `map`
    expect(input({ txHash: "dd".repeat(32), outputIndex: 0 })).toBe(2);
    expect(input(spent[0]!)).toBe(3);
    expect(input({ txHash: "DD".repeat(32), outputIndex: 1 })).toBe(3);
    expect(spent.map(tx.input)).toEqual([3, 2, 0]);
    expect(input(scriptUtxo("aa".repeat(32), 0))).toBe(1);
    expect(refInput(read)).toBe(1);
    expect([reference, read].map(tx.referenceInput)).toEqual([0, 1]);
    expect(out("pay")).toBe(1);
    expect(["pay"].map(tx.output)).toEqual([1]);
  });

  it("finds reference inputs among the sorted ones, reference scripts included, spent ones not", () => {
    const scriptHolder = utxo("dd".repeat(32), 0, walletAddress, {
      script: plutusRef,
    });
    const spentHolder = utxo("99".repeat(32), 0, walletAddress, {
      script: plutusRef,
    });
    const read = utxo("ee".repeat(32), 4);
    const asked: unknown[] = [];
    const parts = [
      spend.plutus({
        utxo: scriptUtxo("aa".repeat(32), 0),
        script: { reference: scriptHolder },
        redeemer: {
          data: (tx) => {
            asked.push(tx.referenceInput(scriptHolder));
            asked.push(tx.referenceInput(read));
            try {
              tx.referenceInput(spentHolder);
            } catch (error) {
              asked.push(error);
            }
            return 0;
          },
          exUnits: budget,
        },
      }),
      mint.plutus({
        script: { reference: spentHolder },
        redeemer: redeemer(1),
        assets: { "": 1n },
      }),
      spend.pubKey({ utxo: spentHolder }),
      referenceInput({ utxo: read }),
      referenceInput({ utxo: utxo("bb".repeat(32), 0) }),
    ];
    const { prototype } = assembleTxPrototype(parts, options);

    expect(
      prototype.body.reference_inputs!.map((r) => r.transaction_id),
    ).toEqual(["bb".repeat(32), "dd".repeat(32), "ee".repeat(32)]);
    expect(asked.slice(0, 2)).toEqual([1, 2]);
    expect(asked[2]).toBeInstanceOf(TxBuildError);
    expect((asked[2] as TxBuildError<"INVALID_REDEEMER">).details).toEqual({
      reason: "notAReferenceInput",
      ref: `${"99".repeat(32)}#0`,
    });
  });

  it("finds an output by the label of its output part, the first of two", () => {
    const parts = [
      spend.plutus({
        utxo: scriptUtxo("aa".repeat(32), 0),
        script: plutusScript,
        redeemer: {
          data: (tx) => [tx.output("b"), tx.output("twice")],
          exUnits: budget,
        },
        label: "twice",
      }),
      output({ address: walletAddress, value: { lovelace: 2000000n } }),
      output({
        address: walletAddress,
        value: { lovelace: 3000000n },
        label: "twice",
      }),
      output({
        address: walletAddress,
        value: { lovelace: 4000000n },
        label: "b",
      }),
      output({
        address: walletAddress,
        value: { lovelace: 5000000n },
        label: "twice",
      }),
    ];
    expect(dataOf(parts)).toEqual([
      ["SPEND:0", { type: "CBOR", hex: "9f0201ff" }],
    ]);

    // A label carried only by a part of another kind names no output
    const error = expectBuildError(
      () =>
        assembleTxPrototype(
          [
            spend.plutus({
              utxo: scriptUtxo("aa".repeat(32), 0),
              script: plutusScript,
              redeemer: { data: (tx) => tx.output("lock"), exUnits: budget },
              label: "lock",
            }),
            pay,
          ],
          options,
        ),
      "INVALID_REDEEMER",
    );
    expect(error.details).toEqual({ reason: "noSuchOutput" });
  });

  /** The error a redeemer function on the spend of `aa..aa#0` gets from assembly */
  const failing = (
    data: (tx: RedeemerContext) => unknown,
    extra: TxPart[] = [],
  ) =>
    expectBuildError(
      () =>
        assembleTxPrototype(
          [
            spend.plutus({
              utxo: scriptUtxo("aa".repeat(32), 0),
              script: plutusScript,
              redeemer: {
                data: data as (tx: RedeemerContext) => number,
                exUnits: budget,
              },
              label: "unlock",
            }),
            ...extra,
          ],
          options,
        ),
      "INVALID_REDEEMER",
    );

  it("refuses a lookup of what the transaction does not hold, with the part's label", () => {
    const labelled = (label: string) =>
      output({
        address: walletAddress,
        value: { lovelace: 2000000n },
        label,
      });
    const cases = [
      {
        error: failing((tx) =>
          tx.input({ txHash: "BB".repeat(32), outputIndex: 2 }),
        ),
        details: { reason: "notAnInput", ref: `${"bb".repeat(32)}#2` },
        names: `${"bb".repeat(32)}#2`,
      },
      {
        error: failing((tx) =>
          tx.referenceInput({ txHash: "aa".repeat(32), outputIndex: 0 }),
        ),
        details: { reason: "notAReferenceInput", ref: `${"aa".repeat(32)}#0` },
        names: `${"aa".repeat(32)}#0`,
      },
      {
        error: failing(
          (tx) => tx.output("missing"),
          [labelled("pay"), pay, labelled("fee"), labelled("pay")],
        ),
        details: { reason: "noSuchOutput" },
        names: '"missing"',
      },
    ];
    for (const { error, details, names } of cases) {
      expect(error.details).toEqual(details);
      expect(error.part).toBe("spend");
      expect(error.label).toBe("unlock");
      expect(error.cause).toBeUndefined();
      expect(error.retryable).toBe(false);
      expect(error.message).toMatch(/^spend "unlock": /);
      expect(error.message).toContain(names);
      if (TxError.is(error, "INVALID_REDEEMER"))
        expect(error.details.reason).toBe(details.reason);
      else throw new Error("expected INVALID_REDEEMER");
    }
    // The labels the output parts have, each once, in their order
    expect(cases[2]!.error.message).toContain('"pay", "fee"');
    expect(cases[2]!.error.message).not.toContain('"pay", "fee", "pay"');
  });

  it("reports what the function throws, with the thrown value as the cause", () => {
    const thrown = new Error("no datum");
    const error = failing(() => {
      throw thrown;
    });
    expect(error.details).toEqual({ reason: "threw" });
    expect(error.cause).toBe(thrown);
    expect(error.part).toBe("spend");
    expect(error.label).toBe("unlock");
    expect(error.message).toContain("no datum");
  });

  it("lets a lookup error through as it is, unless the function catches it", () => {
    let raised: unknown;
    const error = failing((tx) => {
      try {
        return tx.input({ txHash: "bb".repeat(32), outputIndex: 0 });
      } catch (e) {
        raised = e;
        throw e;
      }
    });
    expect(error).toBe(raised);
    expect(error.details).toMatchObject({ reason: "notAnInput" });
    expect(error.cause).toBeUndefined();

    // Caught, it stops nothing
    expect(
      dataOf([
        spend.plutus({
          utxo: scriptUtxo("aa".repeat(32), 0),
          script: plutusScript,
          redeemer: {
            data: (tx) => {
              try {
                return tx.output("none");
              } catch {
                return 7;
              }
            },
            exUnits: budget,
          },
        }),
      ]),
    ).toEqual([["SPEND:0", { type: "CBOR", hex: "07" }]]);

    // An error of the same code that the function made itself is its own failure
    const own = new TxBuildError("INVALID_REDEEMER", "made up", {
      details: { reason: "notAnInput" },
    });
    const wrapped = failing(() => {
      throw own;
    });
    expect(wrapped).not.toBe(own);
    expect(wrapped.details).toEqual({ reason: "threw" });
    expect(wrapped.cause).toBe(own);

    // A lookup error of another redeemer's context is this function's failure
    let stored: unknown;
    const rethrown = expectBuildError(
      () =>
        assembleTxPrototype(
          [
            spend.plutus({
              utxo: scriptUtxo("bb".repeat(32), 0),
              script: plutusScript,
              redeemer: {
                data: () => {
                  throw stored;
                },
                exUnits: budget,
              },
              label: "b",
            }),
            // Its input sorts first, so its function runs first
            spend.plutus({
              utxo: scriptUtxo("aa".repeat(32), 0),
              script: plutusScript,
              redeemer: {
                data: (tx) => {
                  try {
                    tx.input({ txHash: "cc".repeat(32), outputIndex: 0 });
                  } catch (e) {
                    stored = e;
                  }
                  return 0;
                },
                exUnits: budget,
              },
              label: "a",
            }),
          ],
          options,
        ),
      "INVALID_REDEEMER",
    );
    expect(stored).toBeInstanceOf(TxBuildError);
    expect((stored as TxBuildError).label).toBe("a");
    expect(rethrown).not.toBe(stored);
    expect(rethrown.details).toEqual({ reason: "threw" });
    expect(rethrown.label).toBe("b");
    expect(rethrown.cause).toBe(stored);
  });

  it("refuses what is not Plutus data: nothing, a promise", () => {
    for (const returned of [undefined, Promise.resolve(1), () => 1, null]) {
      const error = failing(() => returned);
      expect(error.details).toEqual({ reason: "invalidData" });
      expect(error.label).toBe("unlock");
    }
    // A conversion failure is the cause
    const error = failing(() => ({ type: "CBOR", content: "zz" }));
    expect(error.details).toEqual({ reason: "invalidData" });
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("takes no asynchronous function", () => {
    spend.plutus({
      utxo: scriptUtxo("aa".repeat(32), 0),
      script: plutusScript,
      // @ts-expect-error A redeemer function is synchronous
      redeemer: { data: async () => 1, exUnits: budget },
    });
  });

  it("encodes returned data as data given directly", () => {
    const value = mConStr0([1, "abcd", [2n]]);
    const given = dataOf([
      spend.plutus({
        utxo: scriptUtxo("aa".repeat(32), 0),
        script: plutusScript,
        redeemer: { data: value, exUnits: budget },
      }),
    ]);
    const cbor = (given[0]![1] as { hex: string }).hex;
    for (const returned of [
      value,
      { type: "Mesh" as const, content: value },
      { type: "CBOR" as const, content: cbor },
    ])
      expect(
        dataOf([
          spend.plutus({
            utxo: scriptUtxo("aa".repeat(32), 0),
            script: plutusScript,
            redeemer: { data: () => returned, exUnits: budget },
          }),
        ]),
      ).toEqual(given);
  });

  it("covers computed data with the script data hash", () => {
    const withData = (data: number | (() => number)) =>
      assembleTxPrototype(
        [
          spend.plutus({
            utxo: scriptUtxo("aa".repeat(32), 0),
            script: plutusScript,
            redeemer: { data, exUnits: budget },
          }),
        ],
        options,
      ).prototype;
    const direct = withData(5);
    const computed = withData(() => 5);
    expect(computed.body.script_data_hash).toBe(direct.body.script_data_hash);
    expect(withData(() => 6).body.script_data_hash).not.toBe(
      direct.body.script_data_hash,
    );
    expect(transactionPrototypeToHex(computed)).toBe(
      transactionPrototypeToHex(direct),
    );
  });

  it("refuses a withdrawal part whose reward address is not derived", () => {
    const error = expectBuildError(
      () =>
        assembleTxPrototype(
          [
            keySpend("aa".repeat(32), 0),
            withdrawal.native({
              amount: 0n,
              script: nativeScript,
              label: "own",
            }),
          ],
          options,
        ),
      "UNRESOLVED",
    );
    expect(error.details).toEqual([
      { kind: "withdrawal", label: "own", gaps: [{ type: "rewardAddress" }] },
    ]);
  });

  it("calls no redeemer function when an earlier check fails", () => {
    const account = keyHashToRewardAddress(keyHashHex(1), 0);
    const failures: [TxPart[], string][] = [
      [[withdrawal.native({ amount: 0n, script: nativeScript })], "UNRESOLVED"],
      [
        [
          withdrawal.pubKey({ rewardAddress: account, amount: 0n }),
          withdrawal.pubKey({ rewardAddress: account, amount: 0n }),
        ],
        "DUPLICATE_PART",
      ],
    ];
    for (const [others, code] of failures) {
      const data = jest.fn((tx: RedeemerContext) => tx.self);
      expectBuildError(
        () =>
          assembleTxPrototype(
            [
              spend.plutus({
                utxo: scriptUtxo("aa".repeat(32), 0),
                script: plutusScript,
                redeemer: { data, exUnits: budget },
              }),
              ...others,
            ],
            options,
          ),
        code,
      );
      expect(data).not.toHaveBeenCalled();
    }
  });
});
