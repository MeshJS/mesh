import {
  Asset,
  BuilderData,
  DEFAULT_PROTOCOL_PARAMETERS,
  Output,
  PlutusScript,
  TxOutput,
  UTxO,
} from "@meshsdk/common";
import { deserializePlutusScript } from "@meshsdk/core-cst";

import { getOutputMinLovelace } from ".";

/**
 * Convert UTxO to TxIn parameters in array for MeshTxBuilder, e.g. `txIn(...utxoToTxIn(utxo))`.
 * Passing the reference script size too means the builder has all it needs and does not
 * fetch the UTxO again.
 * @param utxo UTxO
 * @returns [txHash, outputIndex, amount, address, scriptSize]
 */
export const utxoToTxIn = (
  utxo: UTxO,
): [string, number, Asset[], string, number] => {
  return [
    utxo.input.txHash,
    utxo.input.outputIndex,
    utxo.output.amount,
    utxo.output.address,
    utxo.output.scriptRef ? utxo.output.scriptRef.length / 2 : 0,
  ];
};

/**
 * Calculate minimum lovelace required for a UTxO output
 * @param utxo Output of utxo
 * @param coinsPerUtxoSize From protocol parameters
 * @returns Minimum lovelace required for the UTxO
 */
export const getUtxoMinLovelace = (
  utxo: TxOutput,
  coinsPerUtxoSize = DEFAULT_PROTOCOL_PARAMETERS.coinsPerUtxoSize,
): bigint => {
  const referenceScript: PlutusScript | undefined = utxo.scriptRef
    ? { code: utxo.scriptRef, version: "V3" } // Language version is not relevant in min utxo calculation
    : undefined;

  let datum:
    | {
        type: "Hash" | "Inline" | "Embedded";
        data: BuilderData;
      }
    | undefined;

  if (utxo.plutusData) {
    datum = {
      type: "Inline",
      data: {
        content: utxo.plutusData,
        type: "CBOR",
      },
    };
  } else if (utxo.dataHash) {
    datum = {
      type: "Hash",
      data: {
        content: utxo.dataHash, // usually this should be entire datum cbor, but irrelevant in min utxo calculation
        type: "CBOR",
      },
    };
  }

  const output: Output = {
    address: utxo.address,
    amount: utxo.amount,
    referenceScript,
    datum,
  };
  const minLovelace = getOutputMinLovelace(output, coinsPerUtxoSize);
  return minLovelace;
};
