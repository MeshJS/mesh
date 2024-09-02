import {
  ScriptTxInParameter,
  SimpleScriptTxInParameter,
  TxIn,
  TxInParameter,
} from "@meshsdk/common";

import { builderDataToCbor, redeemerToObj } from "./data";
import { scriptSourceToObj } from "./script";

export const txInToObj = (txIn: TxIn): object => {
  switch (txIn.type) {
    case "PubKey":
      return {
        pubKeyTxIn: {
          txIn: txInParameterToObj(txIn.txIn),
        },
      };

    case "Script":
      return {
        scriptTxIn: {
          txIn: txInParameterToObj(txIn.txIn),
          scriptTxIn: scriptTxInParameterToObj(txIn.scriptTxIn),
        },
      };

    case "SimpleScript":
      return {
        simpleScriptTxIn: {
          txIn: txInParameterToObj(txIn.txIn),
          simpleScriptTxIn: simpleScriptTxInParameterToObj(
            txIn.simpleScriptTxIn,
          ),
        },
      };
  }
};

export const collateralTxInToObj = (txIn: TxIn): object => {
  return {
    txIn: txInParameterToObj(txIn.txIn),
  };
};

export const txInParameterToObj = (txInParameter: TxInParameter): object => {
  return {
    txHash: txInParameter.txHash,
    txIndex: txInParameter.txIndex,
    amount: txInParameter.amount ?? null,
    address: txInParameter.address ?? null,
  };
};

export const scriptTxInParameterToObj = (
  scriptTxInParameter: ScriptTxInParameter,
): object => {
  let scriptSource: object | null = null;
  let datumSource: object | null = null;

  if (scriptTxInParameter.scriptSource) {
    scriptSource = scriptSourceToObj(scriptTxInParameter.scriptSource);
  }

  if (scriptTxInParameter.datumSource) {
    switch (scriptTxInParameter.datumSource.type) {
      case "Provided":
        datumSource = {
          providedDatumSource: {
            data: builderDataToCbor(scriptTxInParameter.datumSource.data),
          },
        };
        break;
      case "Inline":
        datumSource = {
          inlineDatumSource: {
            txHash: scriptTxInParameter.datumSource.txHash,
            txIndex: scriptTxInParameter.datumSource.txIndex,
          },
        };
        break;
    }
  }

  return {
    scriptSource,
    datumSource,
    redeemer: scriptTxInParameter.redeemer
      ? redeemerToObj(scriptTxInParameter.redeemer)
      : null,
  };
};

export const simpleScriptTxInParameterToObj = (
  simpleScriptTxInParameter: SimpleScriptTxInParameter,
) => {
  if (simpleScriptTxInParameter.scriptSource) {
    let scriptSource: object | null = null;

    switch (simpleScriptTxInParameter.scriptSource.type) {
      case "Inline":
        scriptSource = {
          inlineSimpleScriptSource: {
            refTxIn: {
              txHash: simpleScriptTxInParameter.scriptSource.txHash,
              txIndex: simpleScriptTxInParameter.scriptSource.txIndex,
            },
            simpleScriptHash:
              simpleScriptTxInParameter.scriptSource.simpleScriptHash ?? "",
            scriptSize: BigInt(
              simpleScriptTxInParameter.scriptSource.scriptSize ?? "0",
            ),
          },
        };
        break;
      case "Provided":
        scriptSource = {
          providedSimpleScriptSource: {
            scriptCbor: simpleScriptTxInParameter.scriptSource.scriptCode,
          },
        };
        break;
    }
    return scriptSource;
  }
};
