import { Quantity } from './Asset';
import { AssetMetadata } from './AssetMetadata';
import { Recipient } from './Recipient';

export type Mint = {
  assetName: string;
  assetQuantity: Quantity;
  metadata: AssetMetadata;
  recipient: Recipient;
  label: '20' | '721';
};
