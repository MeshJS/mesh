import type {
  AccountInfo,
  AccountState,
  Asset,
  AssetMetadata,
  BlockInfo,
  CommitteeMemberState,
  DRepState,
  GovernanceActionKind,
  GovernanceActionState,
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
 * A fetcher that may also report ledger state beyond UTxOs: stake addresses with their
 * delegations, pools, DReps, governance actions, the committee and the treasury. Every method
 * is optional, since providers differ in what they can query; callers check for a method
 * before using it.
 *
 * This is what a local ledger needs to check a transaction against the chain the way the chain
 * would.
 */
export interface IFetcherExtended extends IFetcher {
  /** The slot of the chain tip */
  fetchTipSlot?(): Promise<number>;
  /** A stake address: registration, deposit, rewards, and its pool and DRep delegations */
  fetchAccountState?(rewardAddress: string): Promise<AccountState>;
  /** A stake pool, by key hash: registration, deposit, pending retirement */
  fetchPoolState?(poolId: string): Promise<PoolState>;
  /** A DRep, by id: registration and deposit */
  fetchDRepState?(drepId: string): Promise<DRepState>;
  /** A governance action and whether it is still open for votes */
  fetchGovernanceActionState?(
    txHash: string,
    index: number,
  ): Promise<GovernanceActionState | undefined>;
  /** The last enacted governance action of each purpose that has one */
  fetchLastEnactedGovernanceActions?(): Promise<
    { txHash: string; index: number; kind: GovernanceActionKind }[]
  >;
  /** The constitutional committee: sitting members and those proposed */
  fetchCommitteeState?(): Promise<CommitteeMemberState[]>;
  /** The treasury, in lovelace */
  fetchTreasury?(): Promise<string>;
  /** The constitution: the hash of its guardrail script, if it has one */
  fetchConstitution?(): Promise<{ guardrailScriptHash?: string }>;
}
