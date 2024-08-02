import { Asset, Quantity, Unit } from "@meshsdk/common";

export type BlockfrostUTxO = {
  output_index: number;
  amount: Array<Asset>;
  address: string;
  data_hash?: string;
  inline_datum?: string;
  collateral?: boolean;
  reference_script_hash?: string;
  tx_hash: string;
};

export type BlockfrostAsset = {
  asset: Unit;
  quantity: Quantity;
};
