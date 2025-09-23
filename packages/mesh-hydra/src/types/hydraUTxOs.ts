import { UTxO } from "@meshsdk/common";
import { HydraAssets, hydraAssets } from "./hydraAssets";
import { hydraReferenceScript } from "./hydraReferenceScript";
import { resolvePlutusData } from "../utils/resolveDatum";
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
  inlineDatum: object | null;
  inlineDatumRaw: string | null;
  inlineDatumhash: string | null;
  referenceScript: hydraReferenceScript | null;
  value: HydraAssets;
};

export async function hydraUTxO(utxo: UTxO): Promise<hydraUTxO> {
  return {
    address: utxo.output.address,
    datum: null,
    inlineDatum: utxo.output.plutusData
      ? (await resolvePlutusData(utxo.output.plutusData)).inlineDatum
      : null,
    inlineDatumRaw: utxo.output.plutusData ?? null,
    inlineDatumhash: utxo.output.dataHash ?? null,
    referenceScript: utxo.output.scriptRef
      ? await hydraReferenceScript(utxo.output.scriptRef)
      : null,
    value: hydraAssets(utxo.output.amount)
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
      plutusData: hydraUTxO.inlineDatumRaw?.toString() ?? undefined,
      scriptHash: (() => {
        const ref = hydraUTxO.referenceScript?.script;
        if (!ref?.cborHex || ref.type === "SimpleScript") return undefined;

        const match = /V(1|2|3)$/.exec(ref.type as string);
        const version = match
          ? (`V${match[1]}` as "V1" | "V2" | "V3")
          : undefined;

        return resolveScriptHash(ref.cborHex, version);
      })(),

      scriptRef: (() => {
        const cbor = hydraUTxO.referenceScript?.script?.cborHex;
        return cbor ? cbor.toString() : undefined;
      })(),
    },
  };
};