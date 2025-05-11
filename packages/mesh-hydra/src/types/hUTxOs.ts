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
  referenceScript: hReferenceScript | null;
  datum: string | null;
  datumhash: string | null;
  inlineDatum: object | null;
  inlineDatumhash: string | null;
};

export function hUTxO(utxo: UTxO): hUTxO {
  return {
    address: utxo.output.address,
    value: hAssets(utxo.output.amount),
    referenceScript: null,
    inlineDatum: utxo.output.plutusData ? JSON.parse(utxo.output.plutusData) : null,
    inlineDatumhash: utxo.output.dataHash ?? null,
    datum: utxo.output.plutusData ?? null,
    datumhash: utxo.output.dataHash ?? null,
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
      dataHash: hUTxO.datumhash ?? undefined,
      plutusData: hUTxO.inlineDatum?.toString(),
      scriptHash: hUTxO.referenceScript?.toString(),
    },
  };
}
