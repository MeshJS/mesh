import { js_validate_tx } from "@sidan-lab/whisky-js-nodejs";
import JSONBig from "json-bigint";

import { UTxO } from "@meshsdk/common";

export type GovernanceActionType =
  | "parameterChangeAction"
  | "hardForkInitiationAction"
  | "treasuryWithdrawalsAction"
  | "noConfidenceAction"
  | "updateCommitteeAction"
  | "newConstitutionAction"
  | "infoAction";

export type NetworkType = "mainnet" | "preview" | "preprod";

export type LocalCredential =
  | {
      keyHash: string;
    }
  | {
      scriptHash: string;
    };

export interface AccountInputContext {
  balance?: number | null;
  bech32Address: string;
  delegatedToDrep?: string | null;
  delegatedToPool?: string | null;
  isRegistered: boolean;
  payedDeposit?: number | null;
}

export interface CommitteeInputContext {
  committeeMemberCold: LocalCredential;
  committeeMemberHot?: LocalCredential | null;
  isResigned: boolean;
}

export interface DrepInputContext {
  bech32Drep: string;
  isRegistered: boolean;
  payedDeposit?: number | null;
}

export interface GovActionInputContext {
  actionId: GovernanceActionId;
  actionType: GovernanceActionType;
  isActive: boolean;
}

export interface GovernanceActionId {
  index: bigint;
  txHash: string;
}

export interface PoolInputContext {
  isRegistered: boolean;
  poolId: string;
  retirementEpoch?: number | null;
}

/**
 * Price of execution units for script execution
 */
export interface ExUnitPrices {
  memPrice: SubCoin;
  stepPrice: SubCoin;
}
export interface SubCoin {
  denominator: bigint;
  numerator: bigint;
}

export interface UtxoInputContext {
  isSpent: boolean;
  utxo: UTxO;
}

// The execution units object contains two numeric fields.
export type ExUnits = {
  steps: number;
  mem: number;
};

export interface CostModels {
  plutusV1?: number[];
  plutusV2?: number[];
  plutusV3?: number[];
}

export interface ProtocolParameters {
  /**
   * Cost per UTxO byte in lovelace
   */
  adaPerUtxoByte: bigint;
  /**
   * Percentage of transaction fee required as collateral
   */
  collateralPercentage: number;
  costModels: CostModels;
  /**
   * Deposit amount required for registering as a DRep
   */
  drepDeposit: bigint;
  executionPrices: ExUnitPrices;
  /**
   * Deposit amount required for submitting a governance action
   */
  governanceActionDeposit: bigint;
  /**
   * Maximum block body size in bytes
   */
  maxBlockBodySize: number;
  maxBlockExecutionUnits: ExUnits;
  /**
   * Maximum block header size in bytes
   */
  maxBlockHeaderSize: number;
  /**
   * Maximum number of collateral inputs
   */
  maxCollateralInputs: number;
  /**
   * Maximum number of epochs that can be used for pool retirement ahead
   */
  maxEpochForPoolRetirement: number;
  /**
   * Maximum transaction size in bytes
   */
  maxTransactionSize: number;
  maxTxExecutionUnits: ExUnits;
  /**
   * Maximum size of a Value in bytes
   */
  maxValueSize: number;
  /**
   * Linear factor for the minimum fee calculation formula
   */
  minFeeCoefficientA: bigint;
  /**
   * Constant factor for the minimum fee calculation formula
   */
  minFeeConstantB: bigint;
  /**
   * Minimum pool cost in lovelace
   */
  minPoolCost: bigint;
  /**
   * Protocol version (major, minor)
   *
   * @minItems 2
   * @maxItems 2
   */
  protocolVersion: [unknown, unknown];
  referenceScriptCostPerByte: SubCoin;
  /**
   * Deposit amount required for registering a stake key
   */
  stakeKeyDeposit: bigint;
  /**
   * Deposit amount required for registering a stake pool
   */
  stakePoolDeposit: bigint;
}

export interface ValidationInputContext {
  accountContexts: AccountInputContext[];
  currentCommitteeMembers: CommitteeInputContext[];
  drepContexts: DrepInputContext[];
  govActionContexts: GovActionInputContext[];
  lastEnactedGovAction: GovActionInputContext[];
  networkType: NetworkType;
  poolContexts: PoolInputContext[];
  potentialCommitteeMembers: CommitteeInputContext[];
  protocolParameters: ProtocolParameters;
  slot: bigint;
  treasuryValue: bigint;
  utxoSet: UtxoInputContext[];
}

export const validateTx = (
  txHex: string,
  validationContext: ValidationInputContext,
): string => {
  console.log(
    "Validation Context:",
    JSONBig.stringify(JSONBig.stringify(validationContext)),
  );
  return js_validate_tx(txHex, JSONBig.stringify(validationContext));
};
