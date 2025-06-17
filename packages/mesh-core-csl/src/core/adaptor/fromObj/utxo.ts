import { UTxO } from "@meshsdk/common";

/**
 * Convert an object representation back to a UTxO
 * @param obj The object representation of the UTxO
 * @returns The UTxO instance
 */
export const utxoFromObj = (obj: any): UTxO => {
  return {
    input: {
      outputIndex: obj.input.outputIndex,
      txHash: obj.input.txHash,
    },
    output: {
      address: obj.output.address,
      amount: obj.output.amount,
      dataHash: obj.output.dataHash ?? undefined,
      plutusData: obj.output.plutusData ?? undefined,
      scriptRef: obj.output.scriptRef ?? undefined,
      scriptHash: obj.output.scriptHash ?? undefined,
    },
  };
};
