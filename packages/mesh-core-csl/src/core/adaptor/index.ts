import { MeshTxBuilderBody, validityRangeToObj } from "@meshsdk/common";

import { certificateToObj } from "./certificate";
import { mintItemToObj } from "./mint";
import { outputToObj } from "./output";
import { collateralTxInToObj, txInToObj } from "./txIn";
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
  network,
}: MeshTxBuilderBody) => {
  return {
    inputs: inputs.map(txInToObj),
    outputs: outputs.map(outputToObj),
    collaterals: collaterals.map(collateralTxInToObj),
    requiredSignatures,
    referenceInputs: referenceInputs,
    mints: mints.map((mint) => mintItemToObj(mint)),
    changeAddress,
    metadata: metadata,
    validityRange: validityRangeToObj(validityRange),
    certificates: certificates.map(certificateToObj),
    signingKey: signingKey,
    withdrawals: withdrawals.map(withdrawalToObj),
    network,
  };
};

export * from "./certificate";
export * from "./data";
export * from "./mint";
export * from "./output";
export * from "./script";
export * from "./txIn";
export * from "./utxo";
export * from "./withdrawal";
