import { UTxO } from "@meshsdk/common";

import { outputFromObj } from "./output";

export const utxoFromObj = (obj: any): UTxO => {
  return {
    input: {
      txHash: obj.input.txHash,
      outputIndex: obj.input.outputIndex,
    },
    output: outputFromObj(obj.output),
  };
};
