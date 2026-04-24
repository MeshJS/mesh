import { UTxO } from "@meshsdk/common";

import { TransactionUnspentOutput } from "../types";
import { fromTxUnspentOutput } from "./converter";
import { deserializeTx } from "./deserializer";

export const getTransactionInputs = (
  txHex: string,
): {
  txHash: string;
  outputIndex: number;
}[] => {
  const inputs: {
    txHash: string;
    outputIndex: number;
  }[] = [];

  const deserializedTx = deserializeTx(txHex);

  deserializedTx
    .body()
    .inputs()
    .values()
    .forEach((input) => {
      inputs.push({
        txHash: input.transactionId().toString(),
        outputIndex: Number(input.index()),
      });
    });

  deserializedTx
    .body()
    .collateral()
    ?.values()
    .forEach((input) => {
      inputs.push({
        txHash: input.transactionId().toString(),
        outputIndex: Number(input.index()),
      });
    });

  deserializedTx
    .body()
    .referenceInputs()
    ?.values()
    .forEach((input) => {
      inputs.push({
        txHash: input.transactionId().toString(),
        outputIndex: Number(input.index()),
      });
    });
  return inputs;
};

export const getTransactionOutputs = (txHex: string): UTxO[] => {
  const outputs: UTxO[] = [];

  const deserializedTx = deserializeTx(txHex);
  deserializedTx
    .body()
    .outputs()
    .values()
    .forEach((output, index) => {
      outputs.push(
        fromTxUnspentOutput(
          TransactionUnspentOutput.fromCore([
            {
              txId: deserializedTx.body().hash().toString(),
              index,
            },
            output.toCore(),
          ]),
        ),
      );
    });
  return outputs;
};
