import { NativeScript, PlutusScript } from "@meshsdk/common";

export type hReferenceScript = {
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

export type ScriptInfo = {
  scriptInstance:
  | PlutusScript
  | NativeScript
  | undefined;
  scriptType:
  | "PlutusScriptV1"
  | "PlutusScriptV2"
  | "PlutusScriptV3"
  | "SimpleScript"
  | "Unknown";
  scriptLanguage:
  | "PlutusV1"
  | "PlutusV2"
  | "PlutusV3"
  | "Native" | null;
}
