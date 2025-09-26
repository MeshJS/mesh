import { NativeScript, PlutusScript } from "@meshsdk/common";
import { getReferenceScriptInfo } from "../utils/hydraScriptRef";

export type hydraReferenceScript = {
  script: {
    cborHex: string;
    description: string;
    type:
    | "SimpleScript"
    | "PlutusScriptV1"
    | "PlutusScriptV2"
    | "PlutusScriptV3"
    | null
  };
  scriptLanguage: string;
} | null;

export type hydraScriptInfo = {
  scriptInstance: PlutusScript | NativeScript | undefined;
  scriptType:
    | "PlutusScriptV1"
    | "PlutusScriptV2"
    | "PlutusScriptV3"
    | "SimpleScript"
    | "Unknown";
  scriptLanguage:
    | "PlutusScriptLanguage PlutusScriptV1"
    | "PlutusScriptLanguage PlutusScriptV2"
    | "PlutusScriptLanguage PlutusScriptV3"
    | "NativeScriptLanguage SimpleScript"
    | null;
};

export async function hydraReferenceScript(
  scriptRef: string | null
): Promise<hydraReferenceScript> {
  const { scriptInstance, scriptLanguage, scriptType } =
    await getReferenceScriptInfo(scriptRef);

  if (!scriptRef || !scriptInstance || !scriptLanguage || !scriptType) {
    return null;
  }

  return {
    script: {
      cborHex: scriptRef,
      description: "",
      type: scriptType === "Unknown" ? null : scriptType,
    },
    scriptLanguage,
  }
}
