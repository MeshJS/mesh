import { HexBlob } from "@cardano-sdk/util";

import type {
  TransactionInputPrototype,
  TransactionOutputPrototype,
} from "@meshsdk/common";

import {
  Datum,
  DatumHash,
  Script,
  TransactionId,
  TransactionInput,
  TransactionOutput,
} from "../types";
import { toCardanoAddress } from "../utils";
import { plutusDataVariantToCardano } from "./plutus-data";
import { valuePrototypeToCardano } from "./value";

export const transactionInputPrototypeToCardano = (
  input: TransactionInputPrototype,
): TransactionInput =>
  new TransactionInput(TransactionId(input.transaction_id), BigInt(input.index));

export const transactionOutputPrototypeToCardano = (
  output: TransactionOutputPrototype,
): TransactionOutput => {
  const cardanoOutput = new TransactionOutput(
    toCardanoAddress(output.address),
    valuePrototypeToCardano(output.amount),
  );

  if (output.plutus_data?.type === "DATA_HASH") {
    cardanoOutput.setDatum(Datum.newDataHash(DatumHash(output.plutus_data.value)));
  } else if (output.plutus_data?.type === "DATA") {
    cardanoOutput.setDatum(
      Datum.newInlineData(plutusDataVariantToCardano(output.plutus_data.value)),
    );
  }

  if (output.script_ref) {
    cardanoOutput.setScriptRef(Script.fromCbor(HexBlob(output.script_ref)));
  }

  return cardanoOutput;
};
