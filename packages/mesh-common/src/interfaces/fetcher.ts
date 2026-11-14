import type {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  CommitteeMemberState,
  ConstitutionState,
  DRepState,
  EnactedGovernanceAction,
  PoolState,
  Protocol,
  TransactionInfo,
  UTxO,
} from "../types";
import { GovernanceProposalInfo } from "../types/governance";

export type IFetcherOptions = {
  maxPage?: number;
  order?: "asc" | "desc";
  [key: string]: any;
};

export const DEFAULT_FETCHER_OPTIONS: IFetcherOptions = {
  maxPage: 20,
  order: "desc",
};

/**
 * Fetcher interface defines end points to query blockchain data.
 */
export interface IFetcher {
  fetchAccountInfo(address: string): Promise<AccountInfo>;
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>;
  fetchAddressTxs(
    address: string,
    options?: IFetcherOptions,
  ): Promise<TransactionInfo[]>;
  fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]>;
  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;
  fetchBlockInfo(hash: string): Promise<BlockInfo>;
  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }>;
  fetchProtocolParameters(epoch: number): Promise<Protocol>;
  fetchCostModels(epoch?: number): Promise<number[][]>;
  fetchTxInfo(hash: string): Promise<TransactionInfo>;
  fetchUTxOs(hash: string, index?: number): Promise<UTxO[]>;
  fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo>;
  get(url: string): Promise<any>;
}

/**
 * Governance state of the ledger: DReps, the constitutional committee, the last enacted action
 * of each purpose, the treasury and the constitution. A method throws when the provider cannot
 * answer it.
 */
export interface IGovernanceFetcher {
  /** A DRep's registration, by CIP-105 or CIP-129 id; an unknown DRep is not registered */
  fetchDRepState(drepId: string): Promise<DRepState>;
  /** The constitutional committee: its sitting members and those proposed to join it */
  fetchCommitteeState(): Promise<CommitteeMemberState[]>;
  /** The last enacted action of each governance purpose that has one */
  fetchLastEnactedGovernanceActions(): Promise<EnactedGovernanceAction[]>;
  /** The treasury, in lovelace */
  fetchTreasury(): Promise<string>;
  /** The constitution in force */
  fetchConstitution(): Promise<ConstitutionState>;
}

/** Stake pool registrations. A method throws when the provider cannot answer it. */
export interface IStakePoolFetcher {
  /** A stake pool's registration, by bech32 id or key hash; an unknown pool is not registered */
  fetchPoolState(poolId: string): Promise<PoolState>;
}
