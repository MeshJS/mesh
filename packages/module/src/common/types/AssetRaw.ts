import { Quantity } from './Asset';
import { AssetMetadata } from './AssetMetadata';

export type AssetRaw = {
  name: string;
  quantity: Quantity;
  metadata: AssetMetadata;
  label: '20' | '721';
};
