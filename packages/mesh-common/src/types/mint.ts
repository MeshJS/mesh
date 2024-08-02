import { Quantity } from "./asset";
import { AssetMetadata } from "./asset-metadata";
import { Recipient } from "./recipient";

export type Mint = {
  assetName: string;
  assetQuantity: Quantity;
  recipient?: Recipient;
  metadata?: AssetMetadata;
  label?: "20" | "721" | "777" | `${number}`;
  cip68ScriptAddress?: string;
};
