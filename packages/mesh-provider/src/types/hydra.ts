export type HydraUTxOs = {
  [x: string]: HydraUTxO;
};

export type HydraUTxO = {
  address: string;
  value: HydraAssets;
  referenceScript?: HydraReferenceScript;
  datumhash?: string;
  inlineDatum?: object;
  inlineDatumhash?: string;
  datum?: string;
};

export type HydraAssets = {
  lovelace: number;
  [x: string]: number;
};

export type HydraReferenceScript = {
  scriptLanguage: string;
  script: {
    cborHex: string;
    description: string;
    type:
      | "SimpleScript"
      | "PlutusScriptV1"
      | "PlutusScriptV2"
      | "PlutusScriptV3";
  };
};
