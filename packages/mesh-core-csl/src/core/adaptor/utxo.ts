import { UTxO } from "@meshsdk/common";

export const utxoToObj = ({
  input: { outputIndex, txHash },
  output: { address, amount, dataHash, plutusData, scriptRef, scriptHash },
}: UTxO): object => {
  return {
    input: {
      outputIndex,
      txHash,
    },
    output: {
      address,
      amount,
      dataHash: dataHash ?? null,
      plutusData: plutusData ?? null,
      scriptRef: scriptRef ?? null,
      scriptHash: scriptHash ?? null,
    },
  };
};
