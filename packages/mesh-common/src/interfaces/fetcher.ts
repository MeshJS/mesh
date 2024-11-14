import type {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  Protocol,
  TransactionInfo,
  UTxO,
} from "../types";

/**
 * Fetcher interface defines end points to query blockchain data.
 */
export interface IFetcher {
  fetchAccountInfo(address: string): Promise<AccountInfo>;
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>;
  fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]>;
  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;
  fetchBlockInfo(hash: string): Promise<BlockInfo>;
  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }>;
  fetchHandle(handle: string): Promise<object>;
  fetchHandleAddress(handle: string): Promise<string>;
  fetchProtocolParameters(epoch: number): Promise<Protocol>;
  fetchTxInfo(hash: string): Promise<TransactionInfo>;
  fetchUTxOs(hash: string, index?: number): Promise<UTxO[]>;
  get(url: string): Promise<any>;
}
