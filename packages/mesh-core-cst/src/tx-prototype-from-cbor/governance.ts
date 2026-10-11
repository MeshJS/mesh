import { Cardano, Serialization } from "@cardano-sdk/core";

import type {
  GovernanceActionIdPrototype,
  GovernanceActionPrototype,
  VoterPrototype,
  VoterVotesPrototype,
  VotingProcedurePrototype,
  VotingProposalPrototype,
} from "@meshsdk/common";

import { anchorToPrototype, credentialToPrototype, fractionToPrototype } from "./primitives";

const { VoterKind } = Serialization;

const govActionIdToPrototype = (
  id: Cardano.GovernanceActionId,
): GovernanceActionIdPrototype => ({
  transaction_id: id.id.toString(),
  index: Number(id.actionIndex),
});

export const voterToPrototype = (voter: Serialization.Voter): VoterPrototype => {
  switch (voter.kind()) {
    case VoterKind.ConstitutionalCommitteeKeyHash:
    case VoterKind.ConstitutionalCommitteeScriptHash:
      return {
        type: "CONSTITUTIONAL_COMMITTEE_HOT_CRED",
        value: credentialToPrototype(voter.toConstitutionalCommitteeHotCred()!),
      };
    // Note the inconsistent casing in CST's own enum: `DrepKeyHash` but `DRepScriptHash`.
    case VoterKind.DrepKeyHash:
    case VoterKind.DRepScriptHash:
      return { type: "DREP", value: credentialToPrototype(voter.toDrepCred()!) };
    case VoterKind.StakePoolKeyHash:
      return { type: "STAKING_POOL", value: voter.toStakingPoolKeyHash()!.toString() };
    default:
      throw new Error(`Unsupported voter kind: ${voter.kind()}`);
  }
};

const votingProcedureToPrototype = (
  procedure: Serialization.VotingProcedure,
): VotingProcedurePrototype => {
  const vote = procedure.vote();
  const anchor = procedure.anchor();
  return {
    // Cardano.Vote: 0 = No, 1 = Yes, 2 = Abstain (see ../utils/vote.ts's toCardanoVoteKind).
    vote: vote === 1 ? { type: "YES" } : vote === 0 ? { type: "NO" } : { type: "ABSTAIN" },
    anchor: anchor ? anchorToPrototype(anchor.toCore()) : null,
  };
};

export const votingProceduresToPrototype = (
  procedures: Serialization.VotingProcedures,
): VoterVotesPrototype[] =>
  procedures.getVoters().map((voter) => ({
    voter: voterToPrototype(voter),
    votes: procedures.getGovernanceActionIdsByVoter(voter).map((actionId) => ({
      action_id: govActionIdToPrototype(actionId.toCore()),
      voting_procedure: votingProcedureToPrototype(procedures.get(voter, actionId)!),
    })),
  }));

/**
 * Only the governance actions the encoder can produce are decoded. `PARAMETER_CHANGE_ACTION` is
 * deliberately NOT implemented: `ProtocolParamUpdatePrototype` has ~34 fields whose CST core
 * counterparts use different names, units (fractions vs decimal strings) and optionality, so a
 * half-correct inverse would be worse than an explicit gap. Decode such a transaction with
 * `transactionPrototypeFromCardano` and it throws rather than silently dropping the update.
 */
const govActionToPrototype = (action: Cardano.GovernanceAction): GovernanceActionPrototype => {
  switch (action.__typename) {
    case Cardano.GovernanceActionType.info_action:
      return { type: "INFO_ACTION" };
    case Cardano.GovernanceActionType.no_confidence:
      return {
        type: "NO_CONFIDENCE_ACTION",
        value: {
          gov_action_id: action.governanceActionId
            ? govActionIdToPrototype(action.governanceActionId)
            : null,
        },
      };
    case Cardano.GovernanceActionType.hard_fork_initiation_action:
      return {
        type: "HARD_FORK_INITIATION_ACTION",
        value: {
          gov_action_id: action.governanceActionId
            ? govActionIdToPrototype(action.governanceActionId)
            : null,
          protocol_version: {
            major: Number(action.protocolVersion.major),
            minor: Number(action.protocolVersion.minor),
          },
        },
      };
    case Cardano.GovernanceActionType.treasury_withdrawals_action: {
      const withdrawals: Record<string, string> = {};
      for (const w of action.withdrawals) {
        withdrawals[w.rewardAccount.toString()] = w.coin.toString();
      }
      return {
        type: "TREASURY_WITHDRAWALS_ACTION",
        value: {
          withdrawals,
          policy_hash: action.policyHash ? action.policyHash.toString() : null,
        },
      };
    }
    case Cardano.GovernanceActionType.new_constitution:
      return {
        type: "NEW_CONSTITUTION_ACTION",
        value: {
          gov_action_id: action.governanceActionId
            ? govActionIdToPrototype(action.governanceActionId)
            : null,
          constitution: {
            anchor: anchorToPrototype(action.constitution.anchor),
            script_hash: action.constitution.scriptHash
              ? action.constitution.scriptHash.toString()
              : null,
          },
        },
      };
    case Cardano.GovernanceActionType.update_committee:
      return {
        type: "UPDATE_COMMITTEE_ACTION",
        value: {
          gov_action_id: action.governanceActionId
            ? govActionIdToPrototype(action.governanceActionId)
            : null,
          committee: {
            members: [...action.membersToBeAdded].map((m) => ({
              stake_credential: credentialToPrototype(m.coldCredential),
              term_limit: BigInt(m.epoch),
            })),
            quorum_threshold: fractionToPrototype(action.newQuorumThreshold),
          },
          members_to_remove: [...action.membersToBeRemoved].map(credentialToPrototype),
        },
      };
    default:
      throw new Error(
        `Governance action ${(action as { __typename: string }).__typename} is not supported by ` +
          `the TransactionPrototype decoder (see the note on PARAMETER_CHANGE_ACTION)`,
      );
  }
};

export const proposalProcedureToPrototype = (
  proposal: Serialization.ProposalProcedure,
): VotingProposalPrototype => {
  const core = proposal.toCore();
  return {
    deposit: core.deposit.toString(),
    reward_account: core.rewardAccount.toString(),
    governance_action: govActionToPrototype(core.governanceAction),
    anchor: anchorToPrototype(core.anchor),
  };
};
