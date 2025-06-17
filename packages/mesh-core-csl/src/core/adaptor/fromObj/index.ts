import {
  emptyTxBuilderBody,
  MeshTxBuilderBody,
  validityRangeFromObj,
} from "@meshsdk/common";

import { certificateFromObj } from "./certificate";
import { metadataFromObj } from "./metadata";
import { mintItemFromObj } from "./mint";
import { networkFromObj } from "./network";
import { outputFromObj } from "./output";
import { collateralTxInFromObj, txInFromObj } from "./txIn";
import { voteFromObj } from "./vote";
import { withdrawalFromObj } from "./withdrawal";

/**
 * Convert an object representation back to MeshTxBuilderBody
 * @param obj The object representation of the transaction body
 * @returns The MeshTxBuilderBody instance
 */
export const txBuilderBodyFromObj = (obj: any): MeshTxBuilderBody => {
  const txBuilderBody: MeshTxBuilderBody = emptyTxBuilderBody();

  // Convert inputs
  if (obj.inputs && Array.isArray(obj.inputs)) {
    txBuilderBody.inputs = obj.inputs.map(txInFromObj);
  }

  // Convert outputs
  if (obj.outputs && Array.isArray(obj.outputs)) {
    txBuilderBody.outputs = obj.outputs.map(outputFromObj);
  }

  // Convert fee
  if (obj.fee !== undefined) {
    txBuilderBody.fee = obj.fee.toString();
  }

  // Convert mint tokens
  if (obj.mints && Array.isArray(obj.mints)) {
    txBuilderBody.mints = obj.mints.map(mintItemFromObj);
  }

  // Convert withdrawals
  if (obj.withdrawals && Array.isArray(obj.withdrawals)) {
    txBuilderBody.withdrawals = obj.withdrawals.map(withdrawalFromObj);
  }

  // Convert certificates
  if (obj.certificates && Array.isArray(obj.certificates)) {
    txBuilderBody.certificates = obj.certificates.map(certificateFromObj);
  }

  // Convert votes
  if (obj.votes && Array.isArray(obj.votes)) {
    txBuilderBody.votes = obj.votes.map(voteFromObj);
  }

  // Convert validity range
  if (obj.validityRange) {
    txBuilderBody.validityRange = validityRangeFromObj(obj.validityRange);
  }

  // Convert metadata
  if (obj.metadata) {
    txBuilderBody.metadata = metadataFromObj(obj.metadata);
  }

  // Convert required signers
  if (obj.requiredSignatures && Array.isArray(obj.requiredSignatures)) {
    txBuilderBody.requiredSignatures = [...obj.requiredSignatures];
  }

  // Convert reference inputs
  if (obj.referenceInputs && Array.isArray(obj.referenceInputs)) {
    txBuilderBody.referenceInputs = [...obj.referenceInputs];
  }

  // Convert collaterals
  if (obj.collaterals && Array.isArray(obj.collaterals)) {
    txBuilderBody.collaterals = obj.collaterals.map(collateralTxInFromObj);
  }

  // Convert change address
  if (obj.changeAddress) {
    txBuilderBody.changeAddress = obj.changeAddress;
  }

  // Convert signing keys
  if (obj.signingKey && Array.isArray(obj.signingKey)) {
    txBuilderBody.signingKey = [...obj.signingKey];
  }

  // Convert network
  if (obj.network !== undefined) {
    txBuilderBody.network = networkFromObj(obj.network);
  }

  return txBuilderBody;
};

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
