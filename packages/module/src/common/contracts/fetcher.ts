import type { AssetMetadata, Protocol, UTxO } from '@mesh/common/types';

export interface IFetcher {
  fetchAssetMetadata(asset: string): Promise<AssetMetadata>;
  fetchAssetUtxosFromAddress(asset: string, address: string): Promise<UTxO[]>;
  fetchHandleAddress(handle: string): Promise<string>;
  fetchProtocolParameters(epoch: number): Promise<Protocol>;
}
