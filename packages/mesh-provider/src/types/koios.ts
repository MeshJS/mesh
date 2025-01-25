import { Asset } from "@meshsdk/common";

export type KoiosUTxO = {
  tx_index: number;
  amount: Array<Asset>;
  datum_hash?: string;
  inline_datum?: {
    bytes: string;
    value: KoiosValue;
  };
  reference_script?: KoiosReferenceScript;
  tx_hash: string;
  value: string;
  asset_list: Array<KoiosAsset>;
  block_height: number;
  block_time: number;
  payment_addr: { cred: string, bech32: string };
};

export type KoiosAsset = {
  policy_id: string;
  asset_name: string;
  quantity?: string;
  decimals: number;
  fingerprint: string;
  total_supply?: string;
};

export type KoiosValue = {
  constructor: number;
  fields: Array<KoiosValue>;
  bytes?: string;
};

export type KoiosReferenceScript = {
  bytes: string;
  hash: string;
  size: number;
  type: string;
  value?: KoiosValue;
};
