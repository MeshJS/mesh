import { validate_transaction_js } from "@sidan-lab/whisky-js-nodejs";

import { UTxO } from "@meshsdk/common";

export enum GovernanceActionType {
  ParameterChangeAction = "parameterChangeAction",
  HardForkInitiationAction = "hardForkInitiationAction",
  TreasuryWithdrawalsAction = "treasuryWithdrawalsAction",
  NoConfidenceAction = "noConfidenceAction",
  UpdateCommitteeAction = "updateCommitteeAction",
  NewConstitutionAction = "newConstitutionAction",
  InfoAction = "infoAction",
}

export enum NetworkType {
  Mainnet = "mainnet",
  Preview = "preview",
  Preprod = "preprod",
}

export type ActionId = {
  txHash: string;
  index: number;
};

export type GovActionInputContext = {
  actionId: ActionId;
  actionType: GovernanceActionType;
  isActive: boolean;
};

export type LocalCredential =
  | {
      keyHash: string;
    }
  | {
      scriptHash: string;
    };

export type CommitteeInputContext = {
  committeeMemberCold: LocalCredential;
  committeeMemberHot?: LocalCredential;
  isResigned: boolean;
};

export type ValidationContext = {
  utxoSet: { utxo: UTxO; isSpent: boolean }[];
  protocolParameters: {
    minFeeCoefficientA: number;
    minFeeConstantB: number;
    maxTxExecutionUnits: { mem: number; steps: number };
    maxBlockExecutionUnits: { mem: number; steps: number };
    maxValueSize: number;
    collateralPercentage: number;
    maxCollateralInputs: number;
    adaPerUtxoByte: number;
    costModels: {
      [key: string]: number[];
    };
    executionPrices: {
      memPrice: { numerator: number; denominator: number };
      stepPrice: { numerator: number; denominator: number };
    };
    maxTransactionSize: number;
    stakeKeyDeposit: number;
    stakePoolDeposit: number;
    drepDeposit: number;
    governanceActionDeposit: number;
    minPoolCost: number;
    maxEpochForPoolRetirement: number;
    protocolVersion: [number, number];
    referenceScriptCostPerByte: { numerator: number; denominator: number };
    maxBlockBodySize: number;
    maxBlockHeaderSize: number;
  };
  slot: number;
  accountContexts: {
    bech32Address: string;
    isRegistered: boolean;
    payedDeposit?: number;
    delegatedToDrep?: string;
    delegatedToPool?: string;
    balance?: number;
  }[];
  drepContexts: {
    bech32Drep: string;
    isRegistered: boolean;
    payedDeposit?: number;
  }[];
  poolContexts: {
    poolId: string;
    isRegistered: boolean;
    retirementEpoch?: number;
  }[];
  govActionContexts: GovActionInputContext[];
  lastEnactedGovAction: GovActionInputContext[];
  currentCommitteeMembers: CommitteeInputContext[];
  potentialCommitteeMembers: CommitteeInputContext[];
  treasuryValue: number;
  networkType: NetworkType;
};

export const validateTx = (
  txHex: string,
  validationContext: ValidationContext,
): string => {
  return validate_transaction_js(txHex, JSON.stringify(validationContext));
};
