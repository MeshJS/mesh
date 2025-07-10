import { Withdrawal } from "@meshsdk/common";

import { redeemerToObj } from "./data";
import { scriptSourceToObj, simpleScriptSourceToObj } from "./script";

export const withdrawalToObj = (withdrawal: Withdrawal): object => {
  if (withdrawal.type === "PubKeyWithdrawal") {
    return {
      pubKeyWithdrawal: {
        address: withdrawal.address,
        coin: BigInt(withdrawal.coin),
      },
    };
  } else if (withdrawal.type === "ScriptWithdrawal") {
    if (!withdrawal.scriptSource) {
      throw new Error(
        "withdrawalToObj: missing scriptSource in plutusScriptWithdrawal.",
      );
    }
    if (!withdrawal.redeemer) {
      throw new Error(
        "withdrawalToObj: missing redeemer in plutusScriptWithdrawal.",
      );
    }

    return {
      plutusScriptWithdrawal: {
        address: withdrawal.address,
        coin: BigInt(withdrawal.coin),
        scriptSource: scriptSourceToObj(withdrawal.scriptSource),
        redeemer: redeemerToObj(withdrawal.redeemer),
      },
    };
  } else {
    if (!withdrawal.scriptSource) {
      throw new Error(
        "withdrawalToObj: missing script source in simpleScriptWithdrawal",
      );
    }

    return {
      simpleScriptWithdrawal: {
        address: withdrawal.address,
        coin: BigInt(withdrawal.coin),
        scriptSource: simpleScriptSourceToObj(withdrawal.scriptSource),
      },
    };
  }
};
