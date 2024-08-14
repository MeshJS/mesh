import {
  PlutusScript,
  ScriptSource,
  SimpleScriptSourceInfo,
} from "@meshsdk/common";

export const scriptSourceToObj = (scriptSource: ScriptSource): object => {
  if (scriptSource.type === "Provided") {
    return {
      providedScriptSource: {
        scriptCbor: scriptSource.script.code,
        languageVersion: (
          scriptSource.script as PlutusScript
        ).version!.toLocaleLowerCase(),
      },
    };
  }

  return {
    inlineScriptSource: {
      refTxIn: {
        txHash: scriptSource.txHash,
        txIndex: scriptSource.txIndex,
      },
      scriptHash: scriptSource.scriptHash ?? "",
      languageVersion: scriptSource.version!.toLocaleLowerCase(),
      scriptSize: BigInt(scriptSource.scriptSize ?? "0"),
    },
  };
};

export const simpleScriptSourceToObj = (
  scriptSource: SimpleScriptSourceInfo,
): object => {
  if (scriptSource.type === "Provided") {
    return {
      providedSimpleScriptSource: {
        scriptCbor: scriptSource.scriptCode,
      },
    };
  }

  return {
    inlineSimpleScriptSource: {
      refTxIn: {
        txHash: scriptSource.txHash,
        txIndex: scriptSource.txIndex,
      },
      simpleScriptHash: scriptSource.simpleScriptHash ?? "",
    },
  };
};
