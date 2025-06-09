// import { Mint } from "@meshsdk/common";

// import { redeemerFromObj } from "./data";
// import { scriptSourceFromObj } from "./script";

// export const mintFromObj = (obj: any): Mint => {
//   if ("plutusScriptMint" in obj) {
//     const { policyId, assetName, amount, scriptSource, redeemer } =
//       obj.plutusScriptMint;

//     return {
//       type: "PlutusScriptMint",
//       policyId,
//       assetName,
//       amount: amount.toString(),
//       scriptSource: scriptSourceFromObj(scriptSource),
//       redeemer: redeemerFromObj(redeemer),
//     };
//   } else if ("simpleScriptMint" in obj) {
//     const { policyId, assetName, amount, scriptSource } = obj.simpleScriptMint;

//     return {
//       type: "SimpleScriptMint",
//       policyId,
//       assetName,
//       amount: amount.toString(),
//       scriptSource: scriptSourceFromObj(scriptSource),
//     };
//   }

//   throw new Error(
//     `mintFromObj: Unknown mint type in object: ${JSON.stringify(obj)}`,
//   );
// };
