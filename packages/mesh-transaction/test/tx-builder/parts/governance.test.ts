import {
  mConStr0,
  NativeScript,
  resolveNativeScriptHash,
  resolveScriptHash,
  TransactionPrototype,
} from "@meshsdk/core";
import {
  Cardano,
  transactionPrototypeFromHex,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import {
  proposal,
  ProposalPart,
  TxPartError,
  unresolved,
  vote,
  VotePart,
} from "../../../src/tx-builder";
import {
  alwaysSucceedCbor,
  alwaysSucceedHash,
  drepBech32,
  keyHashHex,
  rewardAddress,
} from "../../test-util";

const drep = drepBech32(3);
const drepHash = Cardano.DRepID.toCredential(
  Cardano.DRepID(drep),
).hash.toString();
const poolHash = keyHashHex(7);
const action = { txHash: "a".repeat(64), index: 0 };
const otherAction = { txHash: "b".repeat(64), index: 2 };
const anchor = { url: "https://example.com/r.json", dataHash: "cd".repeat(32) };
const plutusWitness = {
  plutus: { code: alwaysSucceedCbor, version: "V3" as const },
  redeemer: { data: mConStr0([]) },
};
const nativeScript: NativeScript = { type: "all", scripts: [] };
const returnAddress = rewardAddress(1);
const common = { rewardAccount: returnAddress, anchor };

const expectPartError = (build: () => unknown, code: string) => {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(TxPartError);
    expect((error as TxPartError).code).toBe(code);
    return;
  }
  throw new Error(`expected a ${code} error`);
};

describe("vote", () => {
  it("casts all of a DRep's votes in one part", () => {
    const part = vote({
      voter: { drep },
      votes: [
        { action, vote: "yes" },
        { action: otherAction, vote: "abstain", anchor },
      ],
      label: "ballot",
    });

    expect(part).toEqual({
      kind: "vote",
      voter: { type: "DREP", value: { type: "KEY", value: drepHash } },
      votes: [
        {
          action_id: { transaction_id: "a".repeat(64), index: 0 },
          voting_procedure: { vote: { type: "YES" } },
        },
        {
          action_id: { transaction_id: "b".repeat(64), index: 2 },
          voting_procedure: {
            vote: { type: "ABSTAIN" },
            anchor: {
              anchor_url: anchor.url,
              anchor_data_hash: anchor.dataHash,
            },
          },
        },
      ],
      witness: { type: "key" },
      label: "ballot",
    });
    expect(unresolved(part)).toEqual([]);
  });

  it("votes as a script committee member with a Plutus V3 witness", () => {
    const part = vote({
      voter: { committee: { type: "SCRIPT", value: alwaysSucceedHash } },
      votes: [{ action, vote: "no" }],
      witness: plutusWitness,
    });

    expect(part.voter).toEqual({
      type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
      value: { type: "SCRIPT", value: alwaysSucceedHash },
    });
    expect(unresolved(part)).toEqual([{ type: "exUnits" }]);

    const v2Hash = resolveScriptHash(alwaysSucceedCbor, "V2");
    expectPartError(
      () =>
        vote({
          voter: { committee: { type: "SCRIPT", value: v2Hash } },
          votes: [{ action, vote: "no" }],
          witness: {
            ...plutusWitness,
            plutus: { code: alwaysSucceedCbor, version: "V2" },
          },
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("votes as a stake pool with its key only", () => {
    const part = vote({
      voter: { pool: poolHash },
      votes: [{ action, vote: "yes" }],
    });
    expect(part.voter).toEqual({ type: "STAKING_POOL", value: poolHash });
    expect(part.witness).toEqual({ type: "key" });

    expectPartError(
      () =>
        vote({
          voter: { pool: poolHash },
          votes: [{ action, vote: "yes" }],
          witness: { native: nativeScript },
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("needs a witness for a script DRep", () => {
    expectPartError(
      () =>
        vote({
          voter: {
            drep: {
              type: "SCRIPT",
              value: resolveNativeScriptHash(nativeScript),
            },
          },
          votes: [{ action, vote: "yes" }],
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("rejects no votes, repeated actions and malformed ids", () => {
    expectPartError(() => vote({ voter: { drep }, votes: [] }), "INVALID_DATA");
    expectPartError(
      () =>
        vote({
          voter: { drep },
          votes: [
            { action, vote: "yes" },
            { action, vote: "no" },
          ],
        }),
      "INVALID_DATA",
    );
    expectPartError(
      () =>
        vote({
          voter: { drep },
          votes: [{ action: { txHash: "a", index: 0 }, vote: "yes" }],
        }),
      "INVALID_DATA",
    );
    expectPartError(
      () =>
        vote({
          voter: { drep },
          votes: [{ action, vote: "maybe" as "yes" }],
        }),
      "INVALID_DATA",
    );
  });
});

describe("proposal", () => {
  it("leaves the deposit to govActionDeposit unless given", () => {
    const pending = proposal.info(common);
    expect(pending.proposal).toEqual({
      governance_action: { type: "INFO_ACTION" },
      anchor: { anchor_url: anchor.url, anchor_data_hash: anchor.dataHash },
      reward_account: returnAddress,
    });
    expect(pending.witness).toEqual({ type: "none" });
    expect(unresolved(pending)).toEqual([
      { type: "deposit", parameter: "govActionDeposit" },
    ]);

    const stated = proposal.info({ ...common, deposit: 100_000_000_000n });
    expect(stated.proposal.deposit).toBe("100000000000");
    expect(unresolved(stated)).toEqual([]);
  });

  it("changes parameters, naming the guardrail it runs", () => {
    const part = proposal.parameterChange({
      ...common,
      updates: {
        max_tx_size: 16384,
        key_deposit: "2000000",
        ref_script_coins_per_byte: { numerator: "15", denominator: "1" },
      },
      previous: action,
      guardrail: plutusWitness,
    });

    expect(part.proposal.governance_action).toEqual({
      type: "PARAMETER_CHANGE_ACTION",
      value: {
        protocol_param_updates: {
          max_tx_size: 16384,
          key_deposit: "2000000",
          ref_script_coins_per_byte: { numerator: "15", denominator: "1" },
        },
        gov_action_id: { transaction_id: "a".repeat(64), index: 0 },
        policy_hash: alwaysSucceedHash,
      },
    });
    expect(part.witness).toMatchObject({ type: "plutus" });
  });

  it("rejects malformed parameter updates and a policy hash without guardrail", () => {
    expectPartError(
      () => proposal.parameterChange({ ...common, updates: {} }),
      "INVALID_DATA",
    );
    for (const updates of [
      { max_tx_size: -1 },
      { key_deposit: "1.5" },
      { treasury_growth_rate: { numerator: "1", denominator: "0" } },
    ]) {
      expectPartError(
        () => proposal.parameterChange({ ...common, updates }),
        "INVALID_VALUE",
      );
    }
    expectPartError(
      () =>
        proposal.parameterChange({
          ...common,
          updates: { max_tx_size: 1 },
          policyHash: alwaysSucceedHash,
        }),
      "WITNESS_MISMATCH",
    );
  });

  it("needs the policy hash of a guardrail referenced by out ref alone", () => {
    const guardrail = {
      native: { reference: { txHash: "c".repeat(64), outputIndex: 0 } },
    };
    expectPartError(
      () =>
        proposal.treasuryWithdrawals({
          ...common,
          withdrawals: { [returnAddress]: 1n },
          guardrail,
        }),
      "INVALID_SCRIPT",
    );

    const part = proposal.treasuryWithdrawals({
      ...common,
      withdrawals: { [returnAddress]: 1n },
      guardrail,
      policyHash: alwaysSucceedHash,
    });
    expect(part.proposal.governance_action).toEqual({
      type: "TREASURY_WITHDRAWALS_ACTION",
      value: {
        withdrawals: { [returnAddress]: "1" },
        policy_hash: alwaysSucceedHash,
      },
    });
    expect(part.witness).toMatchObject({
      type: "native",
      script: { type: "reference", scriptHash: alwaysSucceedHash },
    });
  });

  it("builds the remaining actions", () => {
    expect(
      proposal.hardForkInitiation({
        ...common,
        protocolVersion: { major: 11, minor: 0 },
      }).proposal.governance_action,
    ).toEqual({
      type: "HARD_FORK_INITIATION_ACTION",
      value: { protocol_version: { major: 11, minor: 0 } },
    });
    expect(
      proposal.noConfidence({ ...common, previous: action }).proposal
        .governance_action,
    ).toEqual({
      type: "NO_CONFIDENCE_ACTION",
      value: { gov_action_id: { transaction_id: "a".repeat(64), index: 0 } },
    });
    expect(
      proposal.updateCommittee({
        ...common,
        remove: [{ type: "KEY", value: keyHashHex(1) }],
        add: [
          {
            credential: { type: "SCRIPT", value: alwaysSucceedHash },
            termLimit: 700,
          },
        ],
        quorum: { numerator: 2, denominator: 3 },
      }).proposal.governance_action,
    ).toEqual({
      type: "UPDATE_COMMITTEE_ACTION",
      value: {
        committee: {
          members: [
            {
              stake_credential: { type: "SCRIPT", value: alwaysSucceedHash },
              term_limit: 700n,
            },
          ],
          quorum_threshold: { numerator: "2", denominator: "3" },
        },
        members_to_remove: [{ type: "KEY", value: keyHashHex(1) }],
      },
    });
    expect(
      proposal.newConstitution({
        ...common,
        constitution: { anchor, scriptHash: alwaysSucceedHash },
      }).proposal.governance_action,
    ).toEqual({
      type: "NEW_CONSTITUTION_ACTION",
      value: {
        constitution: {
          anchor: { anchor_url: anchor.url, anchor_data_hash: anchor.dataHash },
          script_hash: alwaysSucceedHash,
        },
      },
    });
  });

  it("rejects bad addresses, quorums and versions", () => {
    expectPartError(
      () => proposal.info({ ...common, rewardAccount: "stake1nope" }),
      "INVALID_ADDRESS",
    );
    expectPartError(
      () =>
        proposal.updateCommittee({
          ...common,
          quorum: { numerator: 4, denominator: 3 },
        }),
      "INVALID_VALUE",
    );
    expectPartError(
      () =>
        proposal.hardForkInitiation({
          ...common,
          protocolVersion: { major: -1, minor: 0 },
        }),
      "INVALID_DATA",
    );
    expectPartError(
      () => proposal.treasuryWithdrawals({ ...common, withdrawals: {} }),
      "INVALID_VALUE",
    );
  });
});

describe("governance parts as TransactionPrototype fragments", () => {
  const encode = (votes: VotePart[], proposals: ProposalPart[]) => {
    const proto: TransactionPrototype = {
      body: {
        inputs: [{ transaction_id: "a".repeat(64), index: 0 }],
        outputs: [],
        fee: "200000",
        voting_procedures: votes.map((part) => ({
          voter: part.voter,
          votes: [...part.votes],
        })),
        voting_proposals: proposals.map((part) => ({
          ...part.proposal,
          deposit: part.proposal.deposit ?? "100000000000",
        })),
      },
      witness_set: {},
      is_valid: true,
    };
    return { proto, hex: transactionPrototypeToHex(proto) };
  };

  it("survive encoding to CBOR and decoding back", () => {
    const { proto, hex } = encode(
      [
        vote({
          voter: { drep },
          votes: [
            { action, vote: "yes", anchor },
            { action: otherAction, vote: "no" },
          ],
        }),
        vote({
          voter: { pool: poolHash },
          votes: [{ action, vote: "abstain" }],
        }),
        vote({
          voter: { committee: { type: "KEY", value: keyHashHex(2) } },
          votes: [{ action, vote: "yes" }],
        }),
      ],
      [
        proposal.info(common),
        proposal.hardForkInitiation({
          ...common,
          protocolVersion: { major: 11, minor: 0 },
          previous: action,
        }),
        proposal.treasuryWithdrawals({
          ...common,
          withdrawals: { [returnAddress]: 5n },
        }),
        proposal.noConfidence(common),
        proposal.updateCommittee({
          ...common,
          remove: [{ type: "KEY", value: keyHashHex(1) }],
          add: [
            {
              credential: { type: "KEY", value: keyHashHex(3) },
              termLimit: 700,
            },
          ],
          quorum: { numerator: 2, denominator: 3 },
        }),
        proposal.newConstitution({ ...common, constitution: { anchor } }),
      ],
    );

    const decoded = transactionPrototypeFromHex(hex);
    const withoutNulls = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(withoutNulls)
        : value !== null && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => [k, withoutNulls(v)]),
            )
          : value;
    expect(withoutNulls(decoded.body.voting_procedures)).toEqual(
      withoutNulls(proto.body.voting_procedures),
    );
    expect(withoutNulls(decoded.body.voting_proposals)).toEqual(
      withoutNulls(proto.body.voting_proposals),
    );
  });

  it("encodes a parameter change", () => {
    // Parameter changes are encoded, but deliberately not decoded back
    expect(() =>
      encode(
        [],
        [
          proposal.parameterChange({
            ...common,
            updates: {
              max_tx_size: 16384,
              key_deposit: "2000000",
              ref_script_coins_per_byte: { numerator: "15", denominator: "1" },
            },
            guardrail: plutusWitness,
          }),
        ],
      ),
    ).not.toThrow();
  });
});
