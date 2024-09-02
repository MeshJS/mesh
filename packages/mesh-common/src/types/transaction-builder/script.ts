import { LanguageVersion, PlutusScript } from "..";

export type ScriptSource =
  | {
      type: "Provided";
      script: PlutusScript;
    }
  | {
      type: "Inline";
      txHash: string;
      txIndex: number;
      scriptHash?: string;
      scriptSize?: string;
      version?: LanguageVersion;
    };

export type SimpleScriptSourceInfo =
  | {
      type: "Provided";
      scriptCode: string;
    }
  | {
      type: "Inline";
      txHash: string;
      txIndex: number;
      simpleScriptHash?: string;
      scriptSize?: string;
    };
