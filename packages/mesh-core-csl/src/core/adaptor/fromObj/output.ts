import { Output, PlutusScript } from "@meshsdk/common";

import { cborToBuilderData } from "./data";

/**
 * Convert an object representation back to an Output
 * @param obj The object representation of an Output
 * @returns The Output instance
 */
export const outputFromObj = (obj: any): Output => {
  const output: Output = {
    address: obj.address,
    amount: obj.amount,
  };

  // Handle datum if present
  if (obj.datum) {
    if ("inline" in obj.datum) {
      output.datum = {
        type: "Inline",
        data: cborToBuilderData(obj.datum.inline),
      };
    } else if ("hash" in obj.datum) {
      output.datum = {
        type: "Hash",
        data: cborToBuilderData(obj.datum.hash),
      };
    } else if ("embedded" in obj.datum) {
      output.datum = {
        type: "Embedded",
        data: cborToBuilderData(obj.datum.embedded),
      };
    }
  }

  // Handle reference script if present
  if (obj.referenceScript) {
    const scriptSource = obj.referenceScript.providedScriptSource;
    output.referenceScript = {
      code: scriptSource.scriptCbor,
      version: scriptSource.languageVersion.toUpperCase(),
    } as PlutusScript;
  }

  return output;
};
