import { Serialization } from "@cardano-sdk/core";

import {
  scriptHash,
  type Committee,
  type Constitution,
  type GovernanceAction,
  type GovernanceActionId,
  type GovernanceActionIdPrototype,
  type GovernanceActionPrototype,
  type ProtocolParamUpdate,
  type ProtocolParamUpdatePrototype,
  type RefTxIn,
  type TreasuryWithdrawals,
  type Voter,
  type VoterPrototype,
  type VotingProceduresPrototype,
  type VotingProcedure,
  type VotingProcedurePrototype,
  type VotingProposalPrototype,
} from "@meshsdk/common";

import { toCardanoProposalProcedure } from "../utils/proposal";
// NOTE: `../utils/proposal.ts` also exports a function named `toCardanoGovernanceActionId` with
// a different signature (`GovernanceActionId | undefined` -> `Cardano.GovernanceActionId | null`,
// used internally by `toCardanoProposalProcedure`) — importing from "../utils" instead of
// "../utils/vote" here would silently resolve to that one instead and fail type-wise.
import { toCardanoGovernanceActionId, toCardanoVoter, toCardanoVotingProcedure } from "../utils/vote";
import { credentialPrototypeToDRepIdBech32, credentialPrototypeToMeshCredential } from "./primitives";

const governanceActionIdPrototypeToRefTxIn = (
  id: GovernanceActionIdPrototype,
): RefTxIn => ({ txHash: id.transaction_id, txIndex: id.index });

const governanceActionIdPrototypeToMesh = (
  id: GovernanceActionIdPrototype | null | undefined,
): GovernanceActionId | undefined =>
  id ? { transactionId: id.transaction_id, govActionIndex: id.index } : undefined;

export const voterPrototypeToMesh = (voter: VoterPrototype): Voter => {
  switch (voter.type) {
    case "CONSTITUTIONAL_COMMITTEE_HOT_CRED":
      return {
        type: "ConstitutionalCommittee",
        hotCred: credentialPrototypeToMeshCredential(voter.value),
      };
    case "DREP":
      return { type: "DRep", drepId: credentialPrototypeToDRepIdBech32(voter.value) };
    case "STAKING_POOL":
      return { type: "StakingPool", keyHash: voter.value };
  }
};

const votingProcedurePrototypeToMesh = (
  vp: VotingProcedurePrototype,
): VotingProcedure => ({
  voteKind: vp.vote.type === "YES" ? "Yes" : vp.vote.type === "NO" ? "No" : "Abstain",
  anchor: vp.anchor
    ? { anchorUrl: vp.anchor.anchor_url, anchorDataHash: vp.anchor.anchor_data_hash }
    : undefined,
});

export const votingProceduresPrototypeToCardano = (
  voterVotes: VotingProceduresPrototype,
): Serialization.VotingProcedures => {
  const votingProcedures = Serialization.VotingProcedures.fromCore([]);
  for (const entry of voterVotes) {
    const cardanoVoter = toCardanoVoter(voterPrototypeToMesh(entry.voter));
    for (const vote of entry.votes) {
      votingProcedures.insert(
        cardanoVoter,
        toCardanoGovernanceActionId(governanceActionIdPrototypeToRefTxIn(vote.action_id)),
        toCardanoVotingProcedure(votingProcedurePrototypeToMesh(vote.voting_procedure)),
      );
    }
  }
  return votingProcedures;
};

const rational = (r: { numerator: string; denominator: string }) => r;

/** Confirmed against whisky's own `convert/governance.rs` (`proto_to_protocol_param_update`):
 * cost-model map keys are the literal strings "PlutusV1"/"PlutusV2"/"PlutusV3" (matched via a
 * Rust `match lang_str.as_str()`, `_ => continue` for anything else) — not numeric "0"/"1"/"2" as
 * an earlier version of this function guessed. Mirrors that same silent-skip behavior for
 * unrecognized keys rather than guessing a language for them. */
const costModelKeyToLanguage = (key: string): "V1" | "V2" | "V3" | undefined => {
  switch (key) {
    case "PlutusV1":
      return "V1";
    case "PlutusV2":
      return "V2";
    case "PlutusV3":
      return "V3";
    default:
      return undefined;
  }
};

const protocolParamUpdatePrototypeToMesh = (
  u: ProtocolParamUpdatePrototype,
): ProtocolParamUpdate => {
  const result: ProtocolParamUpdate = {};
  if (u.minfee_a != null) result.minFeeA = u.minfee_a;
  if (u.minfee_b != null) result.minFeeB = u.minfee_b;
  if (u.max_block_body_size != null) result.maxBlockBodySize = u.max_block_body_size;
  if (u.max_tx_size != null) result.maxTxSize = u.max_tx_size;
  if (u.max_block_header_size != null) result.maxBlockHeaderSize = u.max_block_header_size;
  if (u.key_deposit != null) result.keyDeposit = u.key_deposit;
  if (u.pool_deposit != null) result.poolDeposit = u.pool_deposit;
  if (u.max_epoch != null) result.maxEpoch = u.max_epoch;
  if (u.n_opt != null) result.nOpt = u.n_opt;
  if (u.pool_pledge_influence) result.poolPledgeInfluence = rational(u.pool_pledge_influence);
  if (u.expansion_rate) result.expansionRate = rational(u.expansion_rate);
  if (u.treasury_growth_rate) result.treasuryGrowthRate = rational(u.treasury_growth_rate);
  if (u.min_pool_cost != null) result.minPoolCost = u.min_pool_cost;
  if (u.ada_per_utxo_byte != null) result.adaPerUtxoByte = u.ada_per_utxo_byte;
  if (u.cost_models) {
    const costModels: Record<string, number[]> = {};
    for (const [key, model] of Object.entries(u.cost_models)) {
      const language = costModelKeyToLanguage(key);
      if (!language) continue; // matches whisky's own `_ => continue` for unrecognized keys
      // `model` entries are whisky's own string-wrapped i128 (see CostModelPrototype) — `Number()`
      // here isn't this converter's choice, it's forced by Mesh's own `ProtocolParamUpdate.costModels:
      // Record<string, number[]>` (mesh-common/src/types/governance.ts), which has the same
      // number-vs-bigint gap as the one just fixed in PlutusDataPrototype, just not fixed there yet.
      costModels[language] = model.map(Number);
    }
    result.costModels = costModels;
  }
  if (u.execution_costs) {
    result.executionCosts = {
      memPrice: rational(u.execution_costs.mem_price),
      stepPrice: rational(u.execution_costs.step_price),
    };
  }
  if (u.max_tx_ex_units) {
    result.maxTxExUnits = { mem: u.max_tx_ex_units.mem, steps: u.max_tx_ex_units.steps };
  }
  if (u.max_block_ex_units) {
    result.maxBlockExUnits = { mem: u.max_block_ex_units.mem, steps: u.max_block_ex_units.steps };
  }
  if (u.max_value_size != null) result.maxValueSize = u.max_value_size;
  if (u.collateral_percentage != null) result.collateralPercentage = u.collateral_percentage;
  if (u.max_collateral_inputs != null) result.maxCollateralInputs = u.max_collateral_inputs;
  if (u.pool_voting_thresholds) {
    const t = u.pool_voting_thresholds;
    result.poolVotingThresholds = {
      motionNoConfidence: rational(t.motion_no_confidence),
      committeeNormal: rational(t.committee_normal),
      committeeNoConfidence: rational(t.committee_no_confidence),
      hardForkInitiation: rational(t.hard_fork_initiation),
      ppSecurityGroup: rational(t.security_relevant_threshold),
    };
  }
  if (u.drep_voting_thresholds) {
    const t = u.drep_voting_thresholds;
    result.drepVotingThresholds = {
      motionNoConfidence: rational(t.motion_no_confidence),
      committeeNormal: rational(t.committee_normal),
      committeeNoConfidence: rational(t.committee_no_confidence),
      updateConstitution: rational(t.update_constitution),
      hardForkInitiation: rational(t.hard_fork_initiation),
      ppNetworkGroup: rational(t.pp_network_group),
      ppEconomicGroup: rational(t.pp_economic_group),
      ppTechnicalGroup: rational(t.pp_technical_group),
      ppGovGroup: rational(t.pp_governance_group),
      treasuryWithdrawal: rational(t.treasury_withdrawal),
    };
  }
  if (u.min_committee_size != null) result.minCommitteeSize = u.min_committee_size;
  if (u.committee_term_limit != null) result.committeeTermLimit = u.committee_term_limit;
  if (u.governance_action_validity_period != null)
    result.govActionValidityPeriod = u.governance_action_validity_period;
  if (u.governance_action_deposit != null) result.govActionDeposit = u.governance_action_deposit;
  if (u.drep_deposit != null) result.drepDeposit = u.drep_deposit;
  if (u.drep_inactivity_period != null) result.drepInactivityPeriod = u.drep_inactivity_period;
  if (u.ref_script_coins_per_byte)
    result.refScriptCostPerByte = rational(u.ref_script_coins_per_byte);
  return result;
};

const governanceActionPrototypeToMesh = (
  action: GovernanceActionPrototype,
): GovernanceAction => {
  switch (action.type) {
    case "PARAMETER_CHANGE_ACTION":
      return {
        kind: "ParameterChangeAction",
        action: {
          govActionId: governanceActionIdPrototypeToMesh(action.value.gov_action_id),
          protocolParamUpdates: protocolParamUpdatePrototypeToMesh(
            action.value.protocol_param_updates,
          ),
          policyHash: action.value.policy_hash
            ? scriptHash(action.value.policy_hash)
            : undefined,
        },
      };
    case "HARD_FORK_INITIATION_ACTION":
      return {
        kind: "HardForkInitiationAction",
        action: {
          govActionId: governanceActionIdPrototypeToMesh(action.value.gov_action_id),
          protocolVersion: {
            major: action.value.protocol_version.major,
            minor: action.value.protocol_version.minor,
          },
        },
      };
    case "TREASURY_WITHDRAWALS_ACTION": {
      const withdrawals: TreasuryWithdrawals = {};
      for (const [address, amount] of Object.entries(action.value.withdrawals)) {
        withdrawals[address] = amount;
      }
      return {
        kind: "TreasuryWithdrawalsAction",
        action: {
          withdrawals,
          policyHash: action.value.policy_hash
            ? scriptHash(action.value.policy_hash)
            : undefined,
        },
      };
    }
    case "NO_CONFIDENCE_ACTION":
      return {
        kind: "NoConfidenceAction",
        action: { govActionId: governanceActionIdPrototypeToMesh(action.value.gov_action_id) },
      };
    case "UPDATE_COMMITTEE_ACTION": {
      const committee: Committee = {
        members: action.value.committee.members.map((m) => ({
          stakeCredential: credentialPrototypeToMeshCredential(m.stake_credential),
          // Narrowing boundary: prototype carries the CDDL `epoch = uint .size 8` range as
          // bigint (this is `update_committee`'s `=> epoch` map value); Mesh's own
          // `CommitteeMember.termLimit` is `number`. Lossy only above 2^53.
          termLimit: Number(m.term_limit),
        })),
        quorumThreshold: rational(action.value.committee.quorum_threshold),
      };
      return {
        kind: "UpdateCommitteeAction",
        action: {
          govActionId: governanceActionIdPrototypeToMesh(action.value.gov_action_id),
          committee,
          membersToRemove: action.value.members_to_remove.map(credentialPrototypeToMeshCredential),
        },
      };
    }
    case "NEW_CONSTITUTION_ACTION": {
      const constitution: Constitution = {
        anchor: {
          anchorUrl: action.value.constitution.anchor.anchor_url,
          anchorDataHash: action.value.constitution.anchor.anchor_data_hash,
        },
        scriptHash: action.value.constitution.script_hash
          ? scriptHash(action.value.constitution.script_hash)
          : undefined,
      };
      return {
        kind: "NewConstitutionAction",
        action: {
          govActionId: governanceActionIdPrototypeToMesh(action.value.gov_action_id),
          constitution,
        },
      };
    }
    case "INFO_ACTION":
      return { kind: "InfoAction", action: {} };
  }
};

export const votingProposalPrototypeToCardano = (
  proposal: VotingProposalPrototype,
): Serialization.ProposalProcedure =>
  toCardanoProposalProcedure(
    governanceActionPrototypeToMesh(proposal.governance_action),
    {
      anchorUrl: proposal.anchor.anchor_url,
      anchorDataHash: proposal.anchor.anchor_data_hash,
    },
    proposal.reward_account,
    BigInt(proposal.deposit),
  );
