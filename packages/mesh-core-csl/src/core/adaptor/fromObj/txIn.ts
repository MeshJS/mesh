import {
  ScriptTxInParameter,
  SimpleScriptTxInParameter,
  TxIn,
  TxInParameter,
} from "@meshsdk/common";

import { cborToBuilderData, redeemerFromObj } from "./data";
import { scriptSourceFromObj } from "./script";

export const txInFromObj = (obj: any): TxIn => {
  if ("pubKeyTxIn" in obj) {
    return {
      type: "PubKey",
      txIn: txInParameterFromObj(obj.pubKeyTxIn.txIn),
    };
  }

  if ("scriptTxIn" in obj) {
    return {
      type: "Script",
      txIn: txInParameterFromObj(obj.scriptTxIn.txIn),
      scriptTxIn: scriptTxInParameterFromObj(obj.scriptTxIn.scriptTxIn),
    };
  }

  if ("simpleScriptTxIn" in obj) {
    return {
      type: "SimpleScript",
      txIn: txInParameterFromObj(obj.simpleScriptTxIn.txIn),
      simpleScriptTxIn: simpleScriptTxInParameterFromObj(
        obj.simpleScriptTxIn.simpleScriptTxIn,
      ),
    };
  }

  throw new Error("Invalid transaction input object format");
};

export const txInParameterFromObj = (obj: any): TxInParameter => {
  return {
    txHash: obj.txHash,
    txIndex: obj.txIndex,
    amount: obj.amount ?? undefined,
    address: obj.address ?? undefined,
  };
};

export const scriptTxInParameterFromObj = (obj: any): ScriptTxInParameter => {
  const result: ScriptTxInParameter = {};

  if (obj.scriptSource) {
    result.scriptSource = scriptSourceFromObj(obj.scriptSource);
  }

  if (obj.datumSource) {
    if ("providedDatumSource" in obj.datumSource) {
      result.datumSource = {
        type: "Provided",
        data: cborToBuilderData(obj.datumSource.providedDatumSource.data),
      };
    } else if ("inlineDatumSource" in obj.datumSource) {
      result.datumSource = {
        type: "Inline",
        txHash: obj.datumSource.inlineDatumSource.txHash,
        txIndex: obj.datumSource.inlineDatumSource.txIndex,
      };
    }
  }

  if (obj.redeemer) {
    result.redeemer = redeemerFromObj(obj.redeemer);
  }

  return result;
};

export const simpleScriptTxInParameterFromObj = (
  obj: any,
): SimpleScriptTxInParameter => {
  const result: SimpleScriptTxInParameter = {};

  if ("inlineSimpleScriptSource" in obj) {
    result.scriptSource = {
      type: "Inline",
      txHash: obj.inlineSimpleScriptSource.refTxIn.txHash,
      txIndex: obj.inlineSimpleScriptSource.refTxIn.txIndex,
      simpleScriptHash: obj.inlineSimpleScriptSource.simpleScriptHash,
      scriptSize: obj.inlineSimpleScriptSource.scriptSize.toString(),
    };
  } else if ("providedSimpleScriptSource" in obj) {
    result.scriptSource = {
      type: "Provided",
      scriptCode: obj.providedSimpleScriptSource.scriptCbor,
    };
  }

  return result;
};

export const collateralTxInFromObj = (obj: any): TxIn => {
  return {
    type: "PubKey",
    txIn: txInParameterFromObj(obj.txIn),
  };
};
