import type { AssetMetadata, Protocol, UTxO } from '@mesh/common/types';

export interface IFetcher {
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>;
  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;
  fetchHandleAddress(handle: string): Promise<string>;
  fetchProtocolParameters(epoch: number): Promise<Protocol>;
}
