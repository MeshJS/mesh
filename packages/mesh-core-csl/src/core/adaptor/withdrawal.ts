import { Withdrawal } from "@meshsdk/common";

import { redeemerToObj } from "./data";
import { scriptSourceToObj } from "./script";

export const withdrawalToObj = (withdrawal: Withdrawal): object => {
  if ("pubKeyWithdrawal" in withdrawal) {
    return {
      pubKeyWithdrawal: {
        address: withdrawal.pubKeyWithdrawal.address,
        coin: BigInt(withdrawal.pubKeyWithdrawal.coin),
      },
    };
  }

  if (!withdrawal.plutusScriptWithdrawal.scriptSource) {
    throw new Error(
      "withdrawalToObj: missing scriptSource in plutusScriptWithdrawal.",
    );
  }
  if (!withdrawal.plutusScriptWithdrawal.redeemer) {
    throw new Error(
      "withdrawalToObj: missing redeemer in plutusScriptWithdrawal.",
    );
  }

  return {
    plutusScriptWithdrawal: {
      address: withdrawal.plutusScriptWithdrawal.address,
      coin: BigInt(withdrawal.plutusScriptWithdrawal.coin),
      scriptSource: scriptSourceToObj(
        withdrawal.plutusScriptWithdrawal.scriptSource,
      ),
      redeemer: redeemerToObj(withdrawal.plutusScriptWithdrawal.redeemer),
    },
  };
};
