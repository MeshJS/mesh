import type {
  AccountInfo, Asset,
  AssetMetadata, BlockInfo,
  Protocol, TransactionInfo, UTxO, TxUTxOs,
} from '@mesh/common/types';

export interface IFetcher {
  fetchAccountInfo(address: string): Promise<AccountInfo>;
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>;
  fetchTransactionUTxOs(hash: string): Promise<TxUTxOs>;
  fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]>;
  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;
  fetchBlockInfo(hash: string): Promise<BlockInfo>;
  fetchCollectionAssets(
    policyId: string, cursor?: number | string,
  ): Promise<{ assets: Asset[]; next: string | number | null }>;
  fetchHandleAddress(handle: string): Promise<string>;
  fetchProtocolParameters(epoch: number): Promise<Protocol>;
  fetchTxInfo(hash: string): Promise<TransactionInfo>;
}
