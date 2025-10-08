import { ScriptHash } from "../data";
import { Anchor } from "./transaction-builder/certificate";
import { Credential } from "./transaction-builder/credential";

export type GovernanceProposalInfo = {
  txHash: string;
  certIndex: number;
  governanceType: string;
  deposit: number;
  returnAddress: string;
  governanceDescription: string;
  ratifiedEpoch: number;
  enactedEpoch: number;
  droppedEpoch: number;
  expiredEpoch: number;
  expiration: number;
  metadata: object;
};

export type Rational = {
  numerator: string;
  denominator: string;
};

export type RewardAddress = string;

export type GovernanceActionId = {
  transactionId: string;
  govActionIndex: number;
};

export type ProtocolVersion = {
  major: number;
  minor: number;
};

export type ProtocolParamUpdate = {
  minFeeA?: string;
  minFeeB?: string;
  maxBlockBodySize?: number;
  maxTxSize?: number;
  maxBlockHeaderSize?: number;
  keyDeposit?: string;
  poolDeposit?: string;
  maxEpoch?: number;
  nOpt?: number;
  poolPledgeInfluence?: Rational;
  expansionRate?: Rational;
  treasuryGrowthRate?: Rational;
  minPoolCost?: string;
  adaPerUtxoByte?: string;
  costModels?: Record<string, number[]>;
  executionCosts?: {
    memPrice?: Rational;
    stepPrice?: Rational;
  };
  maxTxExUnits?: {
    mem: string;
    steps: string;
  };
  maxBlockExUnits?: {
    mem: string;
    steps: string;
  };
  maxValueSize?: number;
  collateralPercentage?: number;
  maxCollateralInputs?: number;
  poolVotingThresholds?: {
    motionNoConfidence?: Rational;
    committeeNormal?: Rational;
    committeeNoConfidence?: Rational;
    hardForkInitiation?: Rational;
    ppSecurityGroup?: Rational;
  };
  drepVotingThresholds?: {
    motionNoConfidence?: Rational;
    committeeNormal?: Rational;
    committeeNoConfidence?: Rational;
    updateConstitution?: Rational;
    hardForkInitiation?: Rational;
    ppNetworkGroup?: Rational;
    ppEconomicGroup?: Rational;
    ppTechnicalGroup?: Rational;
    ppGovGroup?: Rational;
    treasuryWithdrawal?: Rational;
  };
  minCommitteeSize?: number;
  committeeTermLimit?: number;
  govActionValidityPeriod?: number;
  govActionDeposit?: string;
  drepDeposit?: string;
  drepInactivityPeriod?: number;
  refScriptCostPerByte?: Rational;
};

export type CommitteeMember = {
  stakeCredential: Credential;
  termLimit: number;
};

export type Committee = {
  members: CommitteeMember[];
  quorumThreshold: Rational;
};

export type Constitution = {
  anchor: Anchor;
  scriptHash?: ScriptHash;
};

export type TreasuryWithdrawals = Record<RewardAddress, string>;

export type ParameterChangeAction = {
  govActionId?: GovernanceActionId;
  protocolParamUpdates: ProtocolParamUpdate;
  policyHash?: ScriptHash;
};

export type HardForkInitiationAction = {
  govActionId?: GovernanceActionId;
  protocolVersion: ProtocolVersion;
};

export type TreasuryWithdrawalsAction = {
  withdrawals: TreasuryWithdrawals;
  policyHash?: ScriptHash;
};

export type NoConfidenceAction = {
  govActionId?: GovernanceActionId;
};

export type UpdateCommitteeAction = {
  govActionId?: GovernanceActionId;
  committee: Committee;
  membersToRemove: Credential[];
};

export type NewConstitutionAction = {
  govActionId?: GovernanceActionId;
  constitution: Constitution;
};

export type InfoAction = {};

export enum GovernanceActionKind {
  ParameterChangeAction = "ParameterChangeAction",
  HardForkInitiationAction = "HardForkInitiationAction",
  TreasuryWithdrawalsAction = "TreasuryWithdrawalsAction",
  NoConfidenceAction = "NoConfidenceAction",
  UpdateCommitteeAction = "UpdateCommitteeAction",
  NewConstitutionAction = "NewConstitutionAction",
  InfoAction = "InfoAction",
}

export type GovernanceAction =
  | { kind: "ParameterChangeAction"; action: ParameterChangeAction }
  | { kind: "HardForkInitiationAction"; action: HardForkInitiationAction }
  | { kind: "TreasuryWithdrawalsAction"; action: TreasuryWithdrawalsAction }
  | { kind: "NoConfidenceAction"; action: NoConfidenceAction }
  | { kind: "UpdateCommitteeAction"; action: UpdateCommitteeAction }
  | { kind: "NewConstitutionAction"; action: NewConstitutionAction }
  | { kind: "InfoAction"; action: InfoAction };