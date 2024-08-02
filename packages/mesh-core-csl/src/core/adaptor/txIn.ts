import { ScriptTxInParameter, TxIn, TxInParameter } from "@meshsdk/common";

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
      // Not implemented
      return {};
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
