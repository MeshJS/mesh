// import { Vote } from "@meshsdk/common";

// import { redeemerFromObj } from "./data";
// import { scriptSourceFromObj } from "./script";

// export const voteFromObj = (obj: any): Vote => {
//   if ("pubKeyVote" in obj) {
//     const { voteCredential, votingPurpose, votingProcedure } = obj.pubKeyVote;

//     return {
//       type: "PubKeyVote",
//       voteCredential,
//       votingPurpose,
//       votingProcedure,
//     };
//   } else if ("plutusScriptVote" in obj) {
//     const {
//       voteCredential,
//       votingPurpose,
//       votingProcedure,
//       scriptSource,
//       redeemer,
//     } = obj.plutusScriptVote;

//     return {
//       type: "PlutusScriptVote",
//       voteCredential,
//       votingPurpose,
//       votingProcedure,
//       scriptSource: scriptSourceFromObj(scriptSource),
//       redeemer: redeemerFromObj(redeemer),
//     };
//   }

//   throw new Error(
//     `voteFromObj: Unknown vote type in object: ${JSON.stringify(obj)}`,
//   );
// };
