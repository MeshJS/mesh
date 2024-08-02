type MaestroDatumOptionType = "hash" | "inline";

type MaestroDatumOption = {
  type: MaestroDatumOptionType;
  hash: string;
  bytes?: string;
  json?: Json;
};

type MaestroScriptType = "native" | "plutusv1" | "plutusv2";

type Json = any;

type MaestroScript = {
  hash: string;
  type: MaestroScriptType;
  bytes?: string;
  json?: Json;
};

type MaestroAsset = {
  unit: string;
  amount: string;
};

export type MaestroUTxO = {
  tx_hash: string;
  index: number;
  assets: Array<MaestroAsset>;
  address: string;
  datum?: MaestroDatumOption;
  reference_script?: MaestroScript;
};

export type MaestroAssetExtended = {
  asset_name: string;
  asset_name_ascii: string;
  fingerprint: string;
  total_supply: string;
  asset_standards: {
    cip25_metadata: {
      data: string[];
      idx: number;
      name: string;
      uid: string;
    };
  };
};
