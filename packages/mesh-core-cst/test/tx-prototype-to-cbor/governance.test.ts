import {
  voterPrototypeToMesh,
  votingProceduresPrototypeToCardano,
  votingProposalPrototypeToCardano,
} from "../../src/tx-prototype-to-cbor/governance";
import { toDRep } from "../../src/utils/converter";

const KEY_HASH = "aa".repeat(28);
const TX_HASH = "11".repeat(32);
const ANCHOR_HASH = "cc".repeat(32);
const REWARD_ACCOUNT = "stake_test1uqdgagy7x7mtcta2qyyg244efgtr57wg5mxa2wwnvrx845s4sa2vp";

describe("voterPrototypeToMesh", () => {
  it("converts a DRep voter to a CIP-105 drep id that decodes back to the same key hash", () => {
    const voter = voterPrototypeToMesh({ type: "DREP", value: { type: "KEY", value: KEY_HASH } });
    expect(voter.type).toEqual("DRep");
    const decoded = toDRep((voter as { drepId: string }).drepId);
    expect(decoded.toKeyHash()).toEqual(KEY_HASH);
  });

  it("passes through a StakingPool voter's key hash", () => {
    const voter = voterPrototypeToMesh({ type: "STAKING_POOL", value: KEY_HASH });
    expect(voter).toEqual({ type: "StakingPool", keyHash: KEY_HASH });
  });

  it("converts a ConstitutionalCommittee voter's hot credential", () => {
    const voter = voterPrototypeToMesh({
      type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
      value: { type: "KEY", value: KEY_HASH },
    });
    expect(voter).toEqual({
      type: "ConstitutionalCommittee",
      hotCred: { type: "KeyHash", keyHash: KEY_HASH },
    });
  });
});

describe("votingProceduresPrototypeToCardano", () => {
  it("inserts one vote per (voter, action) pair and preserves the vote kind", () => {
    const votingProcedures = votingProceduresPrototypeToCardano([
      {
        voter: { type: "STAKING_POOL", value: KEY_HASH },
        votes: [
          {
            action_id: { transaction_id: TX_HASH, index: 0 },
            voting_procedure: { vote: { type: "YES" } },
          },
        ],
      },
    ]);

    expect(votingProcedures.getVoters()).toHaveLength(1);
    const [voter] = votingProcedures.getVoters();
    const [actionId] = votingProcedures.getGovernanceActionIdsByVoter(voter!);
    expect(votingProcedures.get(voter!, actionId!)!.vote()).toEqual(1); // Yes
  });
});

describe("votingProposalPrototypeToCardano", () => {
  it("converts an INFO_ACTION proposal with anchor/reward account/deposit", () => {
    const proposal = votingProposalPrototypeToCardano({
      anchor: { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH },
      deposit: "100000000000",
      governance_action: { type: "INFO_ACTION" },
      reward_account: REWARD_ACCOUNT,
    });
    const core = proposal.toCore();
    expect(core.deposit).toEqual(100000000000n);
    expect(core.anchor.url).toEqual("https://example.com");
    expect(core.anchor.dataHash.toString()).toEqual(ANCHOR_HASH);
  });

  it("converts a TREASURY_WITHDRAWALS_ACTION with withdrawals", () => {
    const proposal = votingProposalPrototypeToCardano({
      anchor: { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH },
      deposit: "100000000000",
      governance_action: {
        type: "TREASURY_WITHDRAWALS_ACTION",
        value: { withdrawals: { [REWARD_ACCOUNT]: "5000000" } },
      },
      reward_account: REWARD_ACCOUNT,
    });
    const action = proposal.toCore().governanceAction as { withdrawals: Set<unknown> };
    expect(action.withdrawals.size).toEqual(1);
  });

  it("maps PARAMETER_CHANGE_ACTION cost_models keyed by \"PlutusV1\"/\"PlutusV2\"/\"PlutusV3\" (per whisky's real convert/governance.rs), skipping unrecognized keys", () => {
    const proposal = votingProposalPrototypeToCardano({
      anchor: { anchor_url: "https://example.com", anchor_data_hash: ANCHOR_HASH },
      deposit: "100000000000",
      governance_action: {
        type: "PARAMETER_CHANGE_ACTION",
        value: {
          protocol_param_updates: {
            cost_models: {
              PlutusV1: ["1", "2", "3"],
              PlutusV2: ["4", "5"],
              SomeFutureLanguage: ["999"], // must be silently skipped, not thrown on
            },
          },
        },
      },
      reward_account: REWARD_ACCOUNT,
    });
    const action = proposal.toCore().governanceAction as {
      protocolParamUpdate: { costModels?: Map<number, number[]> };
    };
    const costModels = action.protocolParamUpdate.costModels!;
    expect(costModels.size).toEqual(2); // PlutusV1 + PlutusV2 only
    expect([...costModels.values()]).toContainEqual([1, 2, 3]);
    expect([...costModels.values()]).toContainEqual([4, 5]);
  });
});
