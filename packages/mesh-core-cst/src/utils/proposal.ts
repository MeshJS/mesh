import { Cardano, Serialization } from "@cardano-sdk/core";

import {
  Anchor,
  Committee,
  Constitution,
  GovernanceAction,
  GovernanceActionId,
  LanguageVersion,
  ProtocolParamUpdate,
  TreasuryWithdrawals,
} from "@meshsdk/common";

import { Crypto } from "..";
import {
  AddressType,
  CredentialCore,
  CredentialType,
  Hash28ByteBase16,
  Hash32ByteBase16,
  PlutusLanguageVersion,
  RewardAccount,
} from "../types";
import { toAddress, toPlutusLanguageVersion } from "./converter";

type MeshCredential =
  | {
      type: "ScriptHash";
      scriptHash: string;
    }
  | {
      type: "KeyHash";
      keyHash: string;
    };

export const toCardanoAnchor = (anchor: Anchor): Cardano.Anchor => {
  return {
    url: anchor.anchorUrl,
    dataHash: Hash32ByteBase16(anchor.anchorDataHash),
  };
};

export const toCardanoGovernanceActionId = (
  govActionId?: GovernanceActionId,
): Cardano.GovernanceActionId | null => {
  if (!govActionId) return null;
  return {
    id: Cardano.TransactionId(govActionId.transactionId),
    actionIndex: govActionId.govActionIndex,
  };
};

const toCardanoCredential = (credential: MeshCredential): CredentialCore => {
  if (credential.type === "KeyHash") {
    return {
      type: CredentialType.KeyHash,
      hash: Hash28ByteBase16(credential.keyHash),
    };
  } else {
    return {
      type: CredentialType.ScriptHash,
      hash: Hash28ByteBase16(credential.scriptHash),
    };
  }
};

const toCardanoFraction = (interval: {
  numerator: string;
  denominator: string;
}): Cardano.Fraction => {
  return {
    numerator: Number(interval.numerator),
    denominator: Number(interval.denominator),
  };
};

const fractionToString = (interval: {
  numerator: string;
  denominator: string;
}): string => {
  return `${Number(interval.numerator)/Number(interval.denominator)}`;
};

const toCardanoCostModels = (
  costModels: Record<LanguageVersion, number[]>,
): Cardano.CostModels => {
  const costModelsMap = new Map<PlutusLanguageVersion, Cardano.CostModel>();
  for (const [lang, costs] of Object.entries(costModels)) {
    costModelsMap.set(toPlutusLanguageVersion(lang as LanguageVersion), costs);
  }
  return costModelsMap;
};

const toCardanoProtocolParamUpdate = (
  update: ProtocolParamUpdate,
): Cardano.ProtocolParametersUpdateConway => {
  const result: Cardano.ProtocolParametersUpdateConway = {};

  if (update.minFeeA !== undefined)
    result.minFeeCoefficient = Number(update.minFeeA);
  if (update.minFeeB !== undefined)
    result.minFeeConstant = Number(update.minFeeB);
  if (update.maxBlockBodySize !== undefined)
    result.maxBlockBodySize = Number(update.maxBlockBodySize);
  if (update.maxTxSize !== undefined)
    result.maxTxSize = Number(update.maxTxSize);
  if (update.maxBlockHeaderSize !== undefined)
    result.maxBlockHeaderSize = Number(update.maxBlockHeaderSize);
  if (update.keyDeposit !== undefined)
    result.stakeKeyDeposit = Number(update.keyDeposit);
  if (update.poolDeposit !== undefined)
    result.poolDeposit = Number(update.poolDeposit);
  if (update.maxEpoch !== undefined)
    result.poolRetirementEpochBound = Number(update.maxEpoch);
  if (update.nOpt !== undefined)
    result.desiredNumberOfPools = Number(update.nOpt);
  if (update.poolPledgeInfluence !== undefined)
    result.poolInfluence = fractionToString(update.poolPledgeInfluence);
  if (update.expansionRate !== undefined)
    result.monetaryExpansion = fractionToString(update.expansionRate);
  if (update.treasuryGrowthRate !== undefined)
    result.treasuryExpansion = fractionToString(update.treasuryGrowthRate);
  if (update.minPoolCost !== undefined)
    result.minPoolCost = Number(update.minPoolCost);
  if (update.adaPerUtxoByte !== undefined)
    result.coinsPerUtxoByte = Number(update.adaPerUtxoByte);
  if (update.costModels !== undefined) {
    result.costModels = toCardanoCostModels(update.costModels);
  }
  if (update.executionCosts !== undefined) {
    const memPrice = update.executionCosts.memPrice
      ? Number(update.executionCosts.memPrice.numerator) /
        Number(update.executionCosts.memPrice.denominator)
      : undefined;
    const stepPrice = update.executionCosts.stepPrice
      ? Number(update.executionCosts.stepPrice.numerator) /
        Number(update.executionCosts.stepPrice.denominator)
      : undefined;
    if (memPrice !== undefined || stepPrice !== undefined) {
      result.prices = {
        memory: memPrice!,
        steps: stepPrice!,
      };
    }
  }
  if (update.maxTxExUnits !== undefined) {
    result.maxExecutionUnitsPerTransaction = {
      memory: Number(update.maxTxExUnits.mem),
      steps: Number(update.maxTxExUnits.steps),
    };
  }
  if (update.maxBlockExUnits !== undefined) {
    result.maxExecutionUnitsPerBlock = {
      memory: Number(update.maxBlockExUnits.mem),
      steps: Number(update.maxBlockExUnits.steps),
    };
  }
  if (update.maxValueSize !== undefined)
    result.maxValueSize = Number(update.maxValueSize);
  if (update.collateralPercentage !== undefined)
    result.collateralPercentage = Number(update.collateralPercentage);
  if (update.maxCollateralInputs !== undefined)
    result.maxCollateralInputs = Number(update.maxCollateralInputs);
  if (update.poolVotingThresholds !== undefined) {
    const poolVotingThresholdsResult: Partial<Cardano.PoolVotingThresholds> =
      {};
    if (update.poolVotingThresholds.motionNoConfidence !== undefined) {
      poolVotingThresholdsResult.motionNoConfidence = toCardanoFraction(
        update.poolVotingThresholds.motionNoConfidence,
      );
    }
    if (update.poolVotingThresholds.committeeNormal !== undefined) {
      poolVotingThresholdsResult.committeeNormal = toCardanoFraction(
        update.poolVotingThresholds.committeeNormal,
      );
    }
    if (update.poolVotingThresholds.committeeNoConfidence !== undefined) {
      poolVotingThresholdsResult.committeeNoConfidence = toCardanoFraction(
        update.poolVotingThresholds.committeeNoConfidence,
      );
    }
    if (update.poolVotingThresholds.hardForkInitiation !== undefined) {
      poolVotingThresholdsResult.hardForkInitiation = toCardanoFraction(
        update.poolVotingThresholds.hardForkInitiation,
      );
    }
    if (update.poolVotingThresholds.ppSecurityGroup !== undefined) {
      poolVotingThresholdsResult.securityRelevantParamVotingThreshold =
        toCardanoFraction(update.poolVotingThresholds.ppSecurityGroup);
    }
    if (Object.keys(poolVotingThresholdsResult).length > 0) {
      result.poolVotingThresholds =
        poolVotingThresholdsResult as Cardano.PoolVotingThresholds;
    }
  }
  if (update.drepVotingThresholds !== undefined) {
    const dRepVotingThresholdsResult: Partial<Cardano.DelegateRepresentativeThresholds> =
      {};
    if (update.drepVotingThresholds.motionNoConfidence !== undefined) {
      dRepVotingThresholdsResult.motionNoConfidence = toCardanoFraction(
        update.drepVotingThresholds.motionNoConfidence,
      );
    }
    if (update.drepVotingThresholds.committeeNormal !== undefined) {
      dRepVotingThresholdsResult.committeeNormal = toCardanoFraction(
        update.drepVotingThresholds.committeeNormal,
      );
    }
    if (update.drepVotingThresholds.committeeNoConfidence !== undefined) {
      dRepVotingThresholdsResult.committeeNoConfidence = toCardanoFraction(
        update.drepVotingThresholds.committeeNoConfidence,
      );
    }
    if (update.drepVotingThresholds.updateConstitution !== undefined) {
      dRepVotingThresholdsResult.updateConstitution = toCardanoFraction(
        update.drepVotingThresholds.updateConstitution,
      );
    }
    if (update.drepVotingThresholds.hardForkInitiation !== undefined) {
      dRepVotingThresholdsResult.hardForkInitiation = toCardanoFraction(
        update.drepVotingThresholds.hardForkInitiation,
      );
    }
    if (update.drepVotingThresholds.ppNetworkGroup !== undefined) {
      dRepVotingThresholdsResult.ppNetworkGroup = toCardanoFraction(
        update.drepVotingThresholds.ppNetworkGroup,
      );
    }
    if (update.drepVotingThresholds.ppEconomicGroup !== undefined) {
      dRepVotingThresholdsResult.ppEconomicGroup = toCardanoFraction(
        update.drepVotingThresholds.ppEconomicGroup,
      );
    }
    if (update.drepVotingThresholds.ppTechnicalGroup !== undefined) {
      dRepVotingThresholdsResult.ppTechnicalGroup = toCardanoFraction(
        update.drepVotingThresholds.ppTechnicalGroup,
      );
    }
    if (update.drepVotingThresholds.ppGovGroup !== undefined) {
      dRepVotingThresholdsResult.ppGovernanceGroup = toCardanoFraction(
        update.drepVotingThresholds.ppGovGroup,
      );
    }
    if (update.drepVotingThresholds.treasuryWithdrawal !== undefined) {
      dRepVotingThresholdsResult.treasuryWithdrawal = toCardanoFraction(
        update.drepVotingThresholds.treasuryWithdrawal,
      );
    }
    if (Object.keys(dRepVotingThresholdsResult).length > 0) {
      result.dRepVotingThresholds =
        dRepVotingThresholdsResult as Cardano.DelegateRepresentativeThresholds;
    }
  }
  if (update.minCommitteeSize !== undefined)
    result.minCommitteeSize = Number(update.minCommitteeSize);
  if (update.committeeTermLimit !== undefined)
    result.committeeTermLimit = Cardano.EpochNo(update.committeeTermLimit);
  if (update.govActionValidityPeriod !== undefined)
    result.governanceActionValidityPeriod = Cardano.EpochNo(
      update.govActionValidityPeriod,
    );
  if (update.govActionDeposit !== undefined)
    result.governanceActionDeposit = Number(update.govActionDeposit);
  if (update.drepDeposit !== undefined)
    result.dRepDeposit = Number(update.drepDeposit);
  if (update.drepInactivityPeriod !== undefined)
    result.dRepInactivityPeriod = Cardano.EpochNo(update.drepInactivityPeriod);
  if (update.refScriptCostPerByte !== undefined)
    result.minFeeRefScriptCostPerByte = fractionToString(
      update.refScriptCostPerByte,
    );

  return result;
};

const toCardanoCommittee = (committee: Committee): Cardano.Committee => {
  const members: Cardano.CommitteeMember[] = [];
  for (const member of committee.members) {
    members.push({
      coldCredential: toCardanoCredential(member.stakeCredential),
      epoch: Cardano.EpochNo(member.termLimit),
    });
  }
  return {
    members,
    quorumThreshold: toCardanoFraction(committee.quorumThreshold),
  };
};

const toCardanoConstitution = (
  constitution: Constitution,
): Cardano.Constitution => {
  let scriptHash: Crypto.Hash28ByteBase16 | null = null;
  if (constitution.scriptHash) {
    scriptHash = Hash28ByteBase16(constitution.scriptHash.bytes);
  }
  return {
    anchor: toCardanoAnchor(constitution.anchor),
    scriptHash: scriptHash
  };
};

const toCardanoWithdrawals = (
  withdrawals: TreasuryWithdrawals,
): Set<{ rewardAccount: Cardano.RewardAccount; coin: Cardano.Lovelace }> => {
  const result = new Set<{
    rewardAccount: Cardano.RewardAccount;
    coin: Cardano.Lovelace;
  }>();
  for (const [address, amount] of Object.entries(withdrawals)) {
    const cardanoAddress = toAddress(address);
    if (!cardanoAddress) {
      throw new Error(`Invalid reward address: ${address}`);
    }
    const addressType = cardanoAddress.getType();
    if (!(addressType === AddressType.RewardKey || addressType === AddressType.RewardScript)) {
      throw new Error(`Address is not a reward address: ${address}`);
    }
    const amountLovelace = BigInt(amount);
    result.add({
      rewardAccount: RewardAccount(cardanoAddress.toBech32()),
      coin: amountLovelace,
    });
  }
  return result;
};

export const toCardanoProposalProcedure = (
  governanceAction: GovernanceAction,
  anchor: Anchor,
  rewardAccount: string,
  deposit: bigint,
): Serialization.ProposalProcedure => {
  const cardanoAddress = toAddress(rewardAccount);
  if (!cardanoAddress) {
    throw new Error(`Invalid reward account: ${rewardAccount}`);
  }
  const addressType = cardanoAddress.getType();
  if (!(addressType === AddressType.RewardKey || addressType === AddressType.RewardScript)) {
    throw new Error(`Address is not a reward address: ${rewardAccount}`);
  }

  const rewardAccountAddr = RewardAccount(cardanoAddress.toBech32());
  const cardanoAnchor = toCardanoAnchor(anchor);

  let coreProposal: Cardano.ProposalProcedure;

  switch (governanceAction.kind) {
    case "ParameterChangeAction": {
      const action = governanceAction.action;
      const parameterChangeAction: Cardano.ParameterChangeAction = {
        __typename: Cardano.GovernanceActionType.parameter_change_action,
        governanceActionId: toCardanoGovernanceActionId(action.govActionId),
        protocolParamUpdate: toCardanoProtocolParamUpdate(
          action.protocolParamUpdates,
        ),
        policyHash: action.policyHash
          ? Hash28ByteBase16(action.policyHash.bytes)
          : null,
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: parameterChangeAction,
      };
      break;
    }
    case "HardForkInitiationAction": {
      const action = governanceAction.action;
      const hardForkAction: Cardano.HardForkInitiationAction = {
        __typename: Cardano.GovernanceActionType.hard_fork_initiation_action,
        governanceActionId: toCardanoGovernanceActionId(action.govActionId),
        protocolVersion: {
          major: action.protocolVersion.major,
          minor: action.protocolVersion.minor,
        },
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: hardForkAction,
      };
      break;
    }
    case "TreasuryWithdrawalsAction": {
      const action = governanceAction.action;
      const treasuryAction: Cardano.TreasuryWithdrawalsAction = {
        __typename: Cardano.GovernanceActionType.treasury_withdrawals_action,
        withdrawals: toCardanoWithdrawals(action.withdrawals),
        policyHash: action.policyHash
          ? Hash28ByteBase16(action.policyHash.bytes)
          : null,
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: treasuryAction,
      };
      break;
    }
    case "NoConfidenceAction": {
      const action = governanceAction.action;
      const noConfidenceAction: Cardano.NoConfidence = {
        __typename: Cardano.GovernanceActionType.no_confidence,
        governanceActionId: toCardanoGovernanceActionId(action.govActionId),
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: noConfidenceAction,
      };
      break;
    }
    case "UpdateCommitteeAction": {
      const action = governanceAction.action;
      const membersToRemove = new Set<CredentialCore>();
      for (const cred of action.membersToRemove) {
        membersToRemove.add(toCardanoCredential(cred));
      }
      const committee = toCardanoCommittee(action.committee);
      const updateCommitteeAction: Cardano.UpdateCommittee = {
        __typename: Cardano.GovernanceActionType.update_committee,
        governanceActionId: toCardanoGovernanceActionId(action.govActionId),
        membersToBeRemoved: membersToRemove,
        membersToBeAdded: new Set(committee.members),
        newQuorumThreshold: committee.quorumThreshold,
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: updateCommitteeAction,
      };
      break;
    }
    case "NewConstitutionAction": {
      const action = governanceAction.action;
      const newConstitutionAction: Cardano.NewConstitution = {
        __typename: Cardano.GovernanceActionType.new_constitution,
        governanceActionId: toCardanoGovernanceActionId(action.govActionId),
        constitution: toCardanoConstitution(action.constitution),
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: newConstitutionAction,
      };
      break;
    }
    case "InfoAction": {
      const infoAction: Cardano.InfoAction = {
        __typename: Cardano.GovernanceActionType.info_action,
      };
      coreProposal = {
        anchor: cardanoAnchor,
        deposit: deposit,
        rewardAccount: rewardAccountAddr,
        governanceAction: infoAction,
      };
      break;
    }
  }

  return Serialization.ProposalProcedure.fromCore(coreProposal);
};
