import { Quantity, Unit } from "./asset";

export type AssetExtended = {
  unit: Unit;
  policyId: string;
  assetName: string;
  fingerprint: string;
  quantity: Quantity;
};
