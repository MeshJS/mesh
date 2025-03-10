import type {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
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
  fetchTxInfo(hash: string): Promise<TransactionInfo>;
  fetchUTxOs(hash: string, index?: number): Promise<UTxO[]>;
  fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo>;
  get(url: string): Promise<any>;
}
