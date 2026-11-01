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

/**
 * The validity interval of a transaction, in slots: `invalidBefore` is the slot it is valid
 * from, `invalidHereafter` the slot it is valid until (its TTL). Either is left out when the
 * transaction does not set it.
 */
export const getTransactionValidityInterval = (
  txHex: string,
): { invalidBefore?: number; invalidHereafter?: number } => {
  const body = deserializeTx(txHex).body();
  const invalidBefore = body.validityStartInterval();
  const invalidHereafter = body.ttl();
  return {
    ...(invalidBefore !== undefined && { invalidBefore: Number(invalidBefore) }),
    ...(invalidHereafter !== undefined && {
      invalidHereafter: Number(invalidHereafter),
    }),
  };
};

export const getTransactionOutputs = (txHex: string): UTxO[] => {
  const outputs: UTxO[] = [];

  const deserializedTx = deserializeTx(txHex);
  deserializedTx
    .body()
    .outputs()
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
