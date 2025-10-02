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

export type BlockfrostTxIn = {
  txId: string;
  index: number;
};

export type BlockfrostTxOutValue = {
  coins: number;
  [policyId: string]: { [assetName: string]: number } | number;
};

export type BlockfrostTxOut = {
  address: string;
  value: BlockfrostTxOutValue;
};

export type BlockfrostAdditionalUtxo = [BlockfrostTxIn, BlockfrostTxOut];

export type BlockfrostAdditionalUtxos = Array<BlockfrostAdditionalUtxo>;
