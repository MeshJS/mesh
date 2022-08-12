import type { Protocol, UTxO } from '@mesh/common/types';

export interface IFetcher {
  fetchAssetUtxosFromAddress(asset: string, address: string): Promise<UTxO[]>;
  fetchProtocolParameters(): Promise<Protocol>;
}
