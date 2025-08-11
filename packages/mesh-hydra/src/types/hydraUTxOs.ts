import { UTxO } from "@meshsdk/common";
import { hydraAssets } from "./hydraAssets";
import { hydraReferenceScript } from "./hydraReferenceScript";
import { parseDatumCbor } from "@meshsdk/core-cst";

export type hydraUTxOs = {
  [txRef: string]: hydraUTxO;
};

export async function hydraUTxOs(utxos: UTxO[]): Promise<hydraUTxOs> {
  const entries = await Promise.all(
    utxos.map(async (utxo) => [
      utxo.input.txHash + "#" + utxo.input.outputIndex,
      await hydraUTxO(utxo),
    ])
  );
  return Object.fromEntries(entries);
}

export type hydraUTxO = {
  address: string;
  datum: string | null;
  datumhash: string | null;
  inlineDatum: object | null;
  inlineDatumRaw: string | null;
  inlineDatumhash: string | null;
  referenceScript: hydraReferenceScript | null;
  value: hydraAssets;
};

export async function hydraUTxO(utxo: UTxO): Promise<hydraUTxO> {
  return {
    address: utxo.output.address,
    datum: null,
    datumhash: null,
    inlineDatum: utxo.output.plutusData
      ? parseDatumCbor(utxo.output.plutusData)
      : null,
    inlineDatumRaw: utxo.output.plutusData ?? null,
    inlineDatumhash: utxo.output.dataHash ?? null,
    referenceScript: utxo.output.scriptRef
      ? await hydraReferenceScript(utxo.output.scriptRef)
      : null,
    value: hydraAssets(utxo.output.amount),
  };
}

hydraUTxO.toUTxO = (hydraUTxO: hydraUTxO, txId: string): UTxO => {
  const [txHash, txIndex] = txId.split("#");
  if (!txHash || !txIndex) {
    throw new Error("Invalid txId format");
  }
  return {
    input: {
      txHash: txHash,
      outputIndex: Number(txIndex),
    },
    output: {
      address: hydraUTxO.address,
      amount: hydraAssets.toAssets(hydraUTxO.value),
      dataHash: hydraUTxO.inlineDatumhash ?? undefined,
      plutusData: hydraUTxO.inlineDatumRaw?.toString(),
      scriptHash: hydraUTxO.referenceScript?.script.cborHex ?? undefined, //To do
      scriptRef:
        hydraUTxO.referenceScript?.script.cborHex ??
        hydraUTxO.referenceScript?.script.cborHex.toString(),
    },
  };
};
