import { Asset, UTxO } from "@meshsdk/common";

/**
 * Convert UTxO to TxIn parameters in array for MeshTxBuilder
 * @param utxo UTxO
 * @returns [txHash, outputIndex, amount, address]
 */
export const utxoToTxIn = (utxo: UTxO): [string, number, Asset[], string] => {
  return [
    utxo.input.txHash,
    utxo.input.outputIndex,
    utxo.output.amount,
    utxo.output.address,
  ];
};
