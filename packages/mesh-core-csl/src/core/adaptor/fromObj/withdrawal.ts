import { Withdrawal } from "@meshsdk/common";

import { redeemerFromObj } from "./data";
import { scriptSourceFromObj, simpleScriptSourceFromObj } from "./script";

export const withdrawalFromObj = (obj: any): Withdrawal => {
  if ("pubKeyWithdrawal" in obj) {
    return {
      type: "PubKeyWithdrawal",
      address: obj.pubKeyWithdrawal.address,
      coin: obj.pubKeyWithdrawal.coin.toString(),
    };
  } else if ("plutusScriptWithdrawal" in obj) {
    return {
      type: "ScriptWithdrawal",
      address: obj.plutusScriptWithdrawal.address,
      coin: obj.plutusScriptWithdrawal.coin.toString(),
      scriptSource: obj.plutusScriptWithdrawal.scriptSource
        ? scriptSourceFromObj(obj.plutusScriptWithdrawal.scriptSource)
        : undefined,
      redeemer: obj.plutusScriptWithdrawal.redeemer
        ? redeemerFromObj(obj.plutusScriptWithdrawal.redeemer)
        : undefined,
    };
  } else if ("simpleScriptWithdrawal" in obj) {
    return {
      type: "SimpleScriptWithdrawal",
      address: obj.simpleScriptWithdrawal.address,
      coin: obj.simpleScriptWithdrawal.coin.toString(),
      scriptSource: obj.simpleScriptWithdrawal.scriptSource
        ? simpleScriptSourceFromObj(obj.simpleScriptWithdrawal.scriptSource)
        : undefined,
    };
  }

  throw new Error("withdrawalFromObj: Invalid withdrawal object format");
};
