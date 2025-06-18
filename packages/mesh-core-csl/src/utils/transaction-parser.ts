import { js_get_required_inputs_to_resolve } from "@sidan-lab/whisky-js-nodejs";

import { TxInput } from "@meshsdk/common";

export const getRequiredInputs = (transactionHex: string): TxInput[] => {
  const result = js_get_required_inputs_to_resolve(transactionHex);
  if (result.get_status() !== "success") {
    throw new Error(`Failed to get required inputs: ${result.get_error()}`);
  }
  const utxosStr: string[] = JSON.parse(result.get_data());

  return utxosStr.map((utxoStr) => {
    const parts = utxoStr.split("#");
    if (parts.length !== 2) {
      throw new Error(`Invalid UTxO format: ${utxoStr}`);
    }
    const [txHash, outputIndex] = parts;
    if (!txHash || !outputIndex) {
      throw new Error(
        `Invalid UTxO format: ${utxoStr}. Expected format is txHash#outputIndex`,
      );
    }
    return {
      txHash: txHash,
      outputIndex: parseInt(outputIndex),
    };
  });
};
