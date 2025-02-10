import { HYDRA_STATUS } from "../constants";

export type HydraStatus = (typeof HYDRA_STATUS)[keyof typeof HYDRA_STATUS];

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
} & {
  [x: string]:
    | {
        [y: string]: number;
      }
    | undefined;
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

export type HydraCommitTransaction = {
  cborHex: string;
  description: string;
  txId: string;
  type: string;
};
