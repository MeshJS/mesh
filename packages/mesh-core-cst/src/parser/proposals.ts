import { Cardano, Serialization } from "@cardano-sdk/core";

import {
  Anchor,
  Constitution,
  GovernanceAction,
  LanguageVersion,
  GovernanceActionId as MeshGovernanceActionId,
  ParameterChangeAction,
  Proposal,
  ProposalType,
  ProtocolParamUpdate,
  Rational,
  ScriptHash,
  TreasuryWithdrawals,
} from "@meshsdk/common";

import {
  CredentialCore,
  CredentialType,
  Hash28ByteBase16,
  PlutusLanguageVersion,
  RedeemerTag,
} from "../types";
import { TxParserContext } from "./context";

const { GovernanceActionKind } = Serialization;

type ScriptProposal = Extract<Proposal, { type: "ScriptProposal" }>;
type SimpleScriptProposal = Extract<Proposal, { type: "SimpleScriptProposal" }>;

type MeshCredential =
  | { type: "ScriptHash"; scriptHash: string }
  | { type: "KeyHash"; keyHash: string };

const LANGUAGE_VERSIONS: Record<
  Cardano.PlutusLanguageVersion,
  LanguageVersion
> = {
  [PlutusLanguageVersion.V1]: "V1",
  [PlutusLanguageVersion.V2]: "V2",
  [PlutusLanguageVersion.V3]: "V3",
};

const toRational = (interval: Serialization.UnitInterval): Rational => ({
  numerator: interval.numerator().toString(),
  denominator: interval.denominator().toString(),
});

const toOptionalRational = (
  interval: Serialization.UnitInterval | undefined,
): Rational | undefined => (interval ? toRational(interval) : undefined);

const toOptionalString = (
  value: bigint | number | undefined,
): string | undefined => (value === undefined ? undefined : value.toString());

const toMeshAnchor = (anchor: Serialization.Anchor): Anchor => ({
  anchorUrl: anchor.url(),
  anchorDataHash: anchor.dataHash().toString(),
});

const toMeshGovernanceActionId = (
  id: Serialization.GovernanceActionId | undefined,
): MeshGovernanceActionId | undefined =>
  id
    ? {
        transactionId: id.transactionId().toString(),
        govActionIndex: Number(id.index()),
      }
    : undefined;

const toMeshCredential = (credential: CredentialCore): MeshCredential =>
  credential.type === CredentialType.ScriptHash
    ? { type: "ScriptHash", scriptHash: credential.hash.toString() }
    : { type: "KeyHash", keyHash: credential.hash.toString() };

const toScriptHash = (
  hash: { toString(): string } | undefined,
): ScriptHash | undefined => (hash ? { bytes: hash.toString() } : undefined);

/** Inverse of `toCardanoProtocolParamUpdate`, reading the exact fractions of the transaction */
export const fromCardanoProtocolParamUpdate = (
  update: Serialization.ProtocolParamUpdate,
): ProtocolParamUpdate => {
  const result: ProtocolParamUpdate = {};
  const set = <K extends keyof ProtocolParamUpdate>(
    key: K,
    value: ProtocolParamUpdate[K] | undefined,
  ) => {
    if (value !== undefined) result[key] = value;
  };

  set("minFeeA", toOptionalString(update.minFeeA()));
  set("minFeeB", toOptionalString(update.minFeeB()));
  set("maxBlockBodySize", update.maxBlockBodySize());
  set("maxTxSize", update.maxTxSize());
  set("maxBlockHeaderSize", update.maxBlockHeaderSize());
  set("keyDeposit", toOptionalString(update.keyDeposit()));
  set("poolDeposit", toOptionalString(update.poolDeposit()));
  set("maxEpoch", update.maxEpoch());
  set("nOpt", update.nOpt());
  set("poolPledgeInfluence", toOptionalRational(update.poolPledgeInfluence()));
  set("expansionRate", toOptionalRational(update.expansionRate()));
  set("treasuryGrowthRate", toOptionalRational(update.treasuryGrowthRate()));
  set("minPoolCost", toOptionalString(update.minPoolCost()));
  set("adaPerUtxoByte", toOptionalString(update.adaPerUtxoByte()));

  const costModels = update.costModels();
  if (costModels) {
    const models: Record<string, number[]> = {};
    for (const language of costModels.keys()) {
      models[LANGUAGE_VERSIONS[language]] = costModels.get(language)!.costs();
    }
    result.costModels = models;
  }

  const prices = update.executionCosts();
  if (prices) {
    result.executionCosts = {
      memPrice: toRational(prices.memPrice()),
      stepPrice: toRational(prices.stepsPrice()),
    };
  }
  const maxTxExUnits = update.maxTxExUnits();
  if (maxTxExUnits) {
    result.maxTxExUnits = {
      mem: maxTxExUnits.mem().toString(),
      steps: maxTxExUnits.steps().toString(),
    };
  }
  const maxBlockExUnits = update.maxBlockExUnits();
  if (maxBlockExUnits) {
    result.maxBlockExUnits = {
      mem: maxBlockExUnits.mem().toString(),
      steps: maxBlockExUnits.steps().toString(),
    };
  }

  set("maxValueSize", update.maxValueSize());
  set("collateralPercentage", update.collateralPercentage());
  set("maxCollateralInputs", update.maxCollateralInputs());

  const poolThresholds = update.poolVotingThresholds();
  if (poolThresholds) {
    result.poolVotingThresholds = {
      motionNoConfidence: toRational(poolThresholds.motionNoConfidence()),
      committeeNormal: toRational(poolThresholds.committeeNormal()),
      committeeNoConfidence: toRational(poolThresholds.committeeNoConfidence()),
      hardForkInitiation: toRational(poolThresholds.hardForkInitiation()),
      ppSecurityGroup: toRational(poolThresholds.securityRelevantParam()),
    };
  }
  const drepThresholds = update.drepVotingThresholds();
  if (drepThresholds) {
    result.drepVotingThresholds = {
      motionNoConfidence: toRational(drepThresholds.motionNoConfidence()),
      committeeNormal: toRational(drepThresholds.committeeNormal()),
      committeeNoConfidence: toRational(drepThresholds.committeeNoConfidence()),
      updateConstitution: toRational(drepThresholds.updateConstitution()),
      hardForkInitiation: toRational(drepThresholds.hardForkInitiation()),
      ppNetworkGroup: toRational(drepThresholds.ppNetworkGroup()),
      ppEconomicGroup: toRational(drepThresholds.ppEconomicGroup()),
      ppTechnicalGroup: toRational(drepThresholds.ppTechnicalGroup()),
      ppGovGroup: toRational(drepThresholds.ppGovernanceGroup()),
      treasuryWithdrawal: toRational(drepThresholds.treasuryWithdrawal()),
    };
  }

  set("minCommitteeSize", update.minCommitteeSize());
  set("committeeTermLimit", update.committeeTermLimit());
  set("govActionValidityPeriod", update.governanceActionValidityPeriod());
  set("govActionDeposit", toOptionalString(update.governanceActionDeposit()));
  set("drepDeposit", toOptionalString(update.drepDeposit()));
  set("drepInactivityPeriod", update.drepInactivityPeriod());
  set(
    "refScriptCostPerByte",
    toOptionalRational(update.minFeeRefScriptCostPerByte()),
  );

  return result;
};

/** Inverse of `toCardanoProposalProcedure` for the governance action itself */
export const fromCardanoGovernanceAction = (
  procedure: Serialization.ProposalProcedure,
): GovernanceAction => {
  switch (procedure.kind()) {
    case GovernanceActionKind.ParameterChange: {
      const source = procedure.getParameterChangeAction()!;
      const action: ParameterChangeAction = {
        protocolParamUpdates: fromCardanoProtocolParamUpdate(
          source.protocolParamUpdate(),
        ),
      };
      const govActionId = toMeshGovernanceActionId(source.govActionId());
      if (govActionId) action.govActionId = govActionId;
      const policyHash = toScriptHash(source.policyHash());
      if (policyHash) action.policyHash = policyHash;
      return { kind: "ParameterChangeAction", action };
    }
    case GovernanceActionKind.HardForkInitiation: {
      const source = procedure.getHardForkInitiationAction()!;
      const govActionId = toMeshGovernanceActionId(source.govActionId());
      return {
        kind: "HardForkInitiationAction",
        action: {
          ...(govActionId ? { govActionId } : {}),
          protocolVersion: {
            major: source.protocolVersion().major(),
            minor: source.protocolVersion().minor(),
          },
        },
      };
    }
    case GovernanceActionKind.TreasuryWithdrawals: {
      const source = procedure.getTreasuryWithdrawalsAction()!;
      const withdrawals: TreasuryWithdrawals = {};
      for (const [rewardAccount, coin] of source.withdrawals()) {
        withdrawals[rewardAccount.toString()] = coin.toString();
      }
      const policyHash = toScriptHash(source.policyHash());
      return {
        kind: "TreasuryWithdrawalsAction",
        action: { withdrawals, ...(policyHash ? { policyHash } : {}) },
      };
    }
    case GovernanceActionKind.NoConfidence: {
      const source = procedure.getNoConfidence()!;
      const govActionId = toMeshGovernanceActionId(source.govActionId());
      return {
        kind: "NoConfidenceAction",
        action: govActionId ? { govActionId } : {},
      };
    }
    case GovernanceActionKind.UpdateCommittee: {
      const source = procedure.getUpdateCommittee()!;
      const govActionId = toMeshGovernanceActionId(source.govActionId());
      return {
        kind: "UpdateCommitteeAction",
        action: {
          ...(govActionId ? { govActionId } : {}),
          committee: {
            members: source.membersToBeAdded().map(([credential, epoch]) => ({
              stakeCredential: toMeshCredential(credential),
              termLimit: epoch,
            })),
            quorumThreshold: toRational(source.newQuorum()),
          },
          membersToRemove: source.membersToBeRemoved().map(toMeshCredential),
        },
      };
    }
    case GovernanceActionKind.NewConstitution: {
      const source = procedure.getNewConstitution()!;
      const govActionId = toMeshGovernanceActionId(source.govActionId());
      const constitution: Constitution = {
        anchor: toMeshAnchor(source.constitution().anchor()),
      };
      const scriptHash = toScriptHash(source.constitution().scriptHash());
      if (scriptHash) constitution.scriptHash = scriptHash;
      return {
        kind: "NewConstitutionAction",
        action: { ...(govActionId ? { govActionId } : {}), constitution },
      };
    }
    case GovernanceActionKind.Info:
      return { kind: "InfoAction", action: {} };
    default:
      throw new Error(
        `Cannot parse transaction: governance action kind ${procedure.kind()} is not supported`,
      );
  }
};

/** The guardrails script a proposal has to be witnessed by, when it names one */
const policyHashOf = (action: GovernanceAction): string | undefined =>
  action.kind === "ParameterChangeAction" ||
  action.kind === "TreasuryWithdrawalsAction"
    ? action.action.policyHash?.bytes
    : undefined;

export const parseProposals = (ctx: TxParserContext): Proposal[] =>
  (ctx.body.proposalProcedures()?.values() ?? []).map((procedure, index) => {
    const governanceAction = fromCardanoGovernanceAction(procedure);
    const proposalType: ProposalType = {
      governanceAction,
      anchor: toMeshAnchor(procedure.anchor()),
      rewardAccount: procedure.rewardAccount().toString(),
      deposit: procedure.deposit().toString(),
    };

    const policyHash = policyHashOf(governanceAction);
    if (!policyHash) return { type: "BasicProposal", proposalType };

    // Proposing redeemer indexes refer to the position in the proposal list
    const witness = ctx.scriptWitnessFor(
      { type: CredentialType.ScriptHash, hash: Hash28ByteBase16(policyHash) },
      RedeemerTag.Proposing,
      index,
    );
    if (witness.redeemer || witness.plutusSource) {
      const proposal: ScriptProposal = { type: "ScriptProposal", proposalType };
      if (witness.redeemer) proposal.redeemer = witness.redeemer;
      if (witness.plutusSource) proposal.scriptSource = witness.plutusSource;
      return proposal;
    }
    if (witness.simpleSource) {
      const proposal: SimpleScriptProposal = {
        type: "SimpleScriptProposal",
        proposalType,
        simpleScriptSource: witness.simpleSource,
      };
      return proposal;
    }
    return { type: "BasicProposal", proposalType };
  });
