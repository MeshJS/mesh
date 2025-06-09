// import { emptyTxBuilderBody, MeshTxBuilderBody } from "@meshsdk/common";

// import { certificateFromObj } from "./certificate";
// import { metadataFromObj } from "./metadata";
// import { mintFromObj } from "./mint";
// import { networkFromObj } from "./network";
// import { outputFromObj } from "./output";
// import { txInFromObj } from "./txIn";
// import { voteFromObj } from "./vote";
// import { withdrawalFromObj } from "./withdrawal";

// /**
//  * Convert an object representation back to MeshTxBuilderBody
//  * @param obj The object representation of the transaction body
//  * @returns The MeshTxBuilderBody instance
//  */
// export const txBuilderBodyFromObj = (obj: any): MeshTxBuilderBody => {
//   const txBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();

//   // Convert inputs
//   if (obj.inputs && Array.isArray(obj.inputs)) {
//     txBuilderBody.inputs = obj.inputs.map(txInFromObj);
//   }

//   // Convert outputs
//   if (obj.outputs && Array.isArray(obj.outputs)) {
//     txBuilderBody.outputs = obj.outputs.map(outputFromObj);
//   }

//   // Convert fee
//   if (obj.fee !== undefined) {
//     txBuilderBody.fee = obj.fee.toString();
//   }

//   // Convert mint tokens
//   if (obj.mints && Array.isArray(obj.mints)) {
//     txBuilderBody.mints = obj.mints.map(mintFromObj);
//   }

//   // Convert withdrawals
//   if (obj.withdrawals && Array.isArray(obj.withdrawals)) {
//     txBuilderBody.withdrawals = obj.withdrawals.map(withdrawalFromObj);
//   }

//   // Convert certificates
//   if (obj.certificates && Array.isArray(obj.certificates)) {
//     txBuilderBody.certificates = obj.certificates.map(certificateFromObj);
//   }

//   // Convert votes
//   if (obj.votes && Array.isArray(obj.votes)) {
//     txBuilderBody.votes = obj.votes.map(voteFromObj);
//   }

//   // Convert validity range
//   if (obj.validityRange) {
//     txBuilderBody.validityRange = {};
//     if (obj.validityRange.invalidBefore !== undefined) {
//       txBuilderBody.validityRange.invalidBefore = Number(
//         obj.validityRange.invalidBefore,
//       );
//     }
//     if (obj.validityRange.invalidHereafter !== undefined) {
//       txBuilderBody.validityRange.invalidHereafter = Number(
//         obj.validityRange.invalidHereafter,
//       );
//     }
//   }

//   // Convert metadata
//   if (obj.metadata) {
//     txBuilderBody.metadata = metadataFromObj(obj.metadata);
//   }

//   // Convert required signers
//   if (obj.requiredSignatures && Array.isArray(obj.requiredSignatures)) {
//     txBuilderBody.requiredSignatures = [...obj.requiredSignatures];
//   }

//   // Convert network
//   if (obj.network !== undefined) {
//     txBuilderBody.network = networkFromObj(obj.network);
//   }

//   return txBuilderBody;
// };

// Re-export all conversion functions
export * from "./certificate";
export * from "./data";
export * from "./metadata";
export * from "./mint";
export * from "./network";
export * from "./output";
export * from "./script";
export * from "./txIn";
export * from "./utxo";
export * from "./vote";
export * from "./withdrawal";
