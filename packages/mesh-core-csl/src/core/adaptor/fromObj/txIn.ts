import { TxIn } from "@meshsdk/common";

import { redeemerFromObj } from "./data";

export const txInFromObj = (obj: any): TxIn => {
  const txIn: TxIn = {
    txHash: obj.txHash,
    outputIndex: obj.outputIndex,
  };

  if (obj.redeemer) {
    txIn.redeemer = redeemerFromObj(obj.redeemer);
  }

  return txIn;
};
