import { AssetMetadata } from './AssetMetadata';

export type AssetRaw = {
  name: string;
  quantity: string;
  metadata: AssetMetadata;
  label: '20' | '721';
};
