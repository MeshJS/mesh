import { UTxO } from "@meshsdk/common";
import { hAssets } from "./hAssets";
import { hReferenceScript } from "./hReferenceScript";

export type hUTxOs = {
  [txRef: string]: hUTxO;
};

export function hUTxOs(utxos: UTxO[]): hUTxOs {
  return Object.fromEntries(utxos.map(
    (utxo) => [utxo.input.txHash + "#" + utxo.input.outputIndex, hUTxO(utxo)]
  ));
}

export type hUTxO = {
  address: string;
  value: hAssets;
  referenceScript?: hReferenceScript;
  datum?: string;
  datumhash?: string;
  inlineDatum?: object;
  inlineDatumhash?: string;
};

export function hUTxO(utxo: UTxO): hUTxO {
  return {
    address: utxo.output.address,
    value: hAssets(utxo.output.amount),
    inlineDatum: utxo.output.plutusData ? JSON.parse(utxo.output.plutusData) : undefined,
    inlineDatumhash: utxo.output.dataHash,
    datum: utxo.output.plutusData,
    datumhash: utxo.output.dataHash,
  };
}

hUTxO.toUTxO = (hUTxO: hUTxO, txId: string): UTxO => {
  const [txHash, txIndex] = txId.split("#");
  if (!txHash || !txIndex) {
    throw new Error("Invalid txId format");
  }
  return {
    input: {
      outputIndex: Number(txIndex),
      txHash: txHash,
    },
    output: {
      address: hUTxO.address,
      amount: hAssets.toAssets(hUTxO.value),
      dataHash: hUTxO.datumhash,
      plutusData: hUTxO.inlineDatum?.toString(),
      scriptHash: hUTxO.referenceScript?.toString(),
    },
  };
}
