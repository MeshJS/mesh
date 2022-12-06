import type {
  AccountInfo, AssetMetadata, Protocol, UTxO,
} from '@mesh/common/types';

export interface IFetcher {
  fetchAccountInfo(address: string): Promise<AccountInfo>;
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>;
  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;
  fetchHandleAddress(handle: string): Promise<string>;
  fetchProtocolParameters(epoch: number): Promise<Protocol>;
}
