// import {
//   Redeemer,
//   ScriptSource,
//   SimpleScriptSource,
//   Withdrawal,
// } from "@meshsdk/common";

// import { redeemerFromObj } from "./data";
// import { scriptSourceFromObj, simpleScriptSourceFromObj } from "./script";

// export const withdrawalFromObj = (obj: any): Withdrawal => {
//   if ("pubKeyWithdrawal" in obj) {
//     const { address, coin } = obj.pubKeyWithdrawal;
//     return {
//       type: "PubKeyWithdrawal",
//       address,
//       coin: coin.toString(),
//     };
//   } else if ("plutusScriptWithdrawal" in obj) {
//     const { address, coin, scriptSource, redeemer } =
//       obj.plutusScriptWithdrawal;

//     return {
//       type: "ScriptWithdrawal",
//       address,
//       coin: coin.toString(),
//       scriptSource: scriptSourceFromObj(scriptSource),
//       redeemer: redeemerFromObj(redeemer),
//     };
//   } else if ("simpleScriptWithdrawal" in obj) {
//     const { address, coin, scriptSource } = obj.simpleScriptWithdrawal;

//     return {
//       type: "SimpleScriptWithdrawal",
//       address,
//       coin: coin.toString(),
//       scriptSource: simpleScriptSourceFromObj(scriptSource),
//     };
//   }

//   throw new Error(
//     `withdrawalFromObj: Unknown withdrawal type in object: ${JSON.stringify(obj)}`,
//   );
// };
