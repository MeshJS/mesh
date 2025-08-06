import { UTxO } from "@meshsdk/common";
import { hydraAssets } from "./hydraAssets";
import { hydraReferenceScript} from "./hydraReferenceScript";
import { parseDatumCbor } from "@meshsdk/core-cst";
import { resolveScriptHash } from "@meshsdk/core";

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
      outputIndex: Number(txIndex),
      txHash: txHash,
    },
    output: {
      address: hydraUTxO.address,
      amount: hydraAssets.toAssets(hydraUTxO.value),
      dataHash: hydraUTxO.inlineDatumhash ?? undefined,
      plutusData: hydraUTxO.inlineDatumRaw?.toString(),
      scriptHash: (() => {
        const scriptLanguage = hydraUTxO.referenceScript?.scriptLanguage;
        const version = scriptLanguage?.endsWith("V1")
          ? "V1"
          : scriptLanguage?.endsWith("V2")
            ? "V2"
            : scriptLanguage?.endsWith("V3")
              ? "V3"
              : undefined;
        return (
          hydraUTxO.referenceScript?.script.cborHex ??
          resolveScriptHash(
            hydraUTxO.referenceScript?.script.cborHex!,
            version as "V1" | "V2" | "V3" | undefined
          ).toString()
        );
      })(),
      scriptRef:
        hydraUTxO.referenceScript?.script.cborHex ??
        hydraUTxO.referenceScript?.script.cborHex.toString(),
    },
  };
};
