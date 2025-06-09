import {
  PlutusScript,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";

/**
 * Convert an object representation back to a ScriptSource
 * @param obj The object representation of a ScriptSource
 * @returns The ScriptSource instance
 */
export const scriptSourceFromObj = (obj: any): ScriptSource => {
  if ("providedScriptSource" in obj) {
    return {
      type: "Provided",
      script: {
        code: obj.providedScriptSource.scriptCbor,
        version: obj.providedScriptSource.languageVersion.toUpperCase() as
          | "V1"
          | "V2",
      } as PlutusScript,
    };
  }

  if ("inlineScriptSource" in obj) {
    return {
      type: "Inline",
      txHash: obj.inlineScriptSource.refTxIn.txHash,
      txIndex: obj.inlineScriptSource.refTxIn.txIndex,
      scriptHash: obj.inlineScriptSource.scriptHash || undefined,
      version: obj.inlineScriptSource.languageVersion.toUpperCase() as
        | "V1"
        | "V2",
      scriptSize: obj.inlineScriptSource.scriptSize.toString(),
    };
  }

  throw new Error(
    `scriptSourceFromObj: Unknown script source format: ${JSON.stringify(obj)}`,
  );
};

/**
 * Convert an object representation back to a SimpleScriptSourceInfo
 * @param obj The object representation of a SimpleScriptSourceInfo
 * @returns The SimpleScriptSourceInfo instance
 */
export const simpleScriptSourceFromObj = (obj: any): SimpleScriptSourceInfo => {
  if ("providedSimpleScriptSource" in obj) {
    return {
      type: "Provided",
      scriptCode: obj.providedSimpleScriptSource.scriptCbor,
    };
  }

  if ("inlineSimpleScriptSource" in obj) {
    return {
      type: "Inline",
      txHash: obj.inlineSimpleScriptSource.refTxIn.txHash,
      txIndex: obj.inlineSimpleScriptSource.refTxIn.txIndex,
      simpleScriptHash:
        obj.inlineSimpleScriptSource.simpleScriptHash || undefined,
    };
  }

  throw new Error(
    `simpleScriptSourceFromObj: Unknown simple script source format: ${JSON.stringify(obj)}`,
  );
};
