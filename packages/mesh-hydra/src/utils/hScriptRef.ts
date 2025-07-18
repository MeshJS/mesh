import { PlutusScript, NativeScript } from "@meshsdk/common";
import { fromScriptRef } from "@meshsdk/core-cst";

import { ScriptInfo } from "../types";

/**
 * Determines the type and language of a script reference.
 * @param scriptRef - The script reference (e.g., CBOR hex string) from a UTxO.
 * @returns An object containing the script instance, type, and language.
 */
export function getReferenceScriptInfo(
  scriptRef: string | undefined
): ScriptInfo {
  let scriptInstance: PlutusScript | NativeScript | undefined = undefined;
  let scriptType: ScriptInfo["scriptType"] = "Unknown";
  let scriptLanguage: ScriptInfo["scriptLanguage"] = null;

  if (scriptRef) {
    scriptInstance = fromScriptRef(scriptRef);
    if (scriptInstance) {
      if ("code" in scriptInstance) {
        switch (scriptInstance.version) {
          case "V1":
            scriptType = "PlutusScriptV1";
            scriptLanguage = "PlutusV1";
            break;
          case "V2":
            scriptType = "PlutusScriptV2";
            scriptLanguage = "PlutusV2";
            break;
          case "V3":
            scriptType = "PlutusScriptV3";
            scriptLanguage = "PlutusV3";
            break;
        }
      } else {
        scriptType = "SimpleScript";
        scriptLanguage = "Native";
      }
    }
  }

  return { scriptInstance, scriptType, scriptLanguage };
}
