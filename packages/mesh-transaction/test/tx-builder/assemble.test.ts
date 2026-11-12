import {
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  mConStr0,
  NativeScript,
  resolveNativeScriptHash,
  resolveScriptHash,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  blake2b,
  keyHashToRewardAddress,
  resolvePlutusScriptAddress,
  scriptHashToRewardAddress,
  Transaction,
  transactionPrototypeFromHex,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  assembleTxPrototype,
  certificate,
  collateral,
  collateralReturn,
  donation,
  metadata,
  mint,
  networkId,
  output,
  proposal,
  referenceInput,
  requiredSigner,
  spend,
  treasuryValue,
  TxBuildError,
  TxPart,
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
const referenceScript = resolveScriptRef(plutusScript);

const utxo = (
  txHash: string,
  outputIndex: number,
  address = walletAddress,
  extra: Partial<UTxO["output"]> = {},
  lovelace = "5000000",
): UTxO => ({
  input: { txHash, outputIndex },
  output: {
    address,
    amount: [{ unit: "lovelace", quantity: lovelace }],
    ...extra,
  },
});

const scriptUtxo = (txHash: string, outputIndex: number) =>
  utxo(txHash, outputIndex, scriptAddress, { plutusData: "d87980" });

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
      scriptRef: referenceScript,
    });
    const spentReference = utxo("dd".repeat(32), 0, walletAddress, {
      scriptRef: referenceScript,
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

  it("returns what the collateral leaves above the total, tokens included", () => {
    const unit = `${"ab".repeat(28)}0102`;
    const held = utxo("cc".repeat(32), 0, walletAddress, {
      amount: [
        { unit: "lovelace", quantity: "7000000" },
        { unit, quantity: "5" },
      ],
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
      requiredSigner({ keyHash: keyHashHex(1) }),
      requiredSigner({ keyHash: keyHashHex(1) }),
      requiredSigner({ keyHash: keyHashHex(2) }),
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
      plutusData: "d87980",
      scriptRef: referenceScript,
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
