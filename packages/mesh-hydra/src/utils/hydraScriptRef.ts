import { NativeScript, PlutusScript } from "@meshsdk/common";
import { fromScriptRef } from "@meshsdk/core-cst";

import { hydraScriptInfo } from "../types";

/**
 * Determines the type and language of a script reference.
 * @param scriptRef - The script reference (e.g., CBOR hex string) from a UTxO.
 * @returns An object containing the script instance, type, and language.
 */
export async function getReferenceScriptInfo(
  scriptRef: string | null,
): Promise<hydraScriptInfo> {
  let scriptInstance: PlutusScript | NativeScript | undefined = undefined;
  let scriptType: hydraScriptInfo["scriptType"] = "Unknown";
  let scriptLanguage: hydraScriptInfo["scriptLanguage"] = null;

  if (scriptRef) {
    scriptInstance = fromScriptRef(scriptRef);
    if (scriptInstance) {
      if ("code" in scriptInstance) {
        switch (scriptInstance.version) {
          case "V1":
            scriptType = "PlutusScriptV1";
            scriptLanguage = "PlutusScriptLanguage PlutusScriptV1";
            break;
          case "V2":
            scriptType = "PlutusScriptV2";
            scriptLanguage = "PlutusScriptLanguage PlutusScriptV2";
            break;
          case "V3":
            scriptType = "PlutusScriptV3";
            scriptLanguage = "PlutusScriptLanguage PlutusScriptV3";
            break;
        }
      } else {
        scriptType = "SimpleScript";
        scriptLanguage = "NativeScriptLanguage SimpleScript";
      }
    }
  }

  return { scriptInstance, scriptType, scriptLanguage };
}
