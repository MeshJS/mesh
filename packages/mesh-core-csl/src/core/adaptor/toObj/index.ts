import {
  MeshTxBuilderBody,
  MintParam,
  validityRangeToObj,
} from "@meshsdk/common";

import { certificateToObj } from "./certificate";
import { txMetadataToObj } from "./metadata";
import { mintItemToObj } from "./mint";
import { networkToObj } from "./network";
import { outputToObj } from "./output";
import { collateralTxInToObj, txInToObj } from "./txIn";
import { voteToObj } from "./vote";
import { withdrawalToObj } from "./withdrawal";

export const meshTxBuilderBodyToObj = ({
  inputs,
  outputs,
  collaterals,
  requiredSignatures,
  referenceInputs,
  mints,
  changeAddress,
  metadata,
  validityRange,
  certificates,
  signingKey,
  withdrawals,
  votes,
  fee,
  network,
}: MeshTxBuilderBody) => {
  let mintsObj: object[] = [];
  mints.forEach((mint: MintParam) => {
    mint.mintValue.forEach((mintValue) => {
      mintsObj.push(
        mintItemToObj({
          type: mint.type,
          policyId: mint.policyId,
          assetName: mintValue.assetName,
          amount: mintValue.amount,
          scriptSource: mint.scriptSource,
          redeemer: mint.redeemer,
        }),
      );
    });
  });
  return {
    inputs: inputs.map(txInToObj),
    outputs: outputs.map(outputToObj),
    collaterals: collaterals.map(collateralTxInToObj),
    requiredSignatures,
    referenceInputs: referenceInputs,
    mints: mintsObj,
    changeAddress,
    metadata: txMetadataToObj(metadata),
    validityRange: validityRangeToObj(validityRange),
    certificates: certificates.map(certificateToObj),
    signingKey: signingKey,
    withdrawals: withdrawals.map(withdrawalToObj),
    votes: votes.map(voteToObj),
    fee,
    network: networkToObj(network),
  };
};

export * from "./certificate";
export * from "./metadata";
export * from "./data";
export * from "./network";
export * from "./mint";
export * from "./output";
export * from "./script";
export * from "./txIn";
export * from "./vote";
export * from "./utxo";
export * from "./withdrawal";
