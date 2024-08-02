import { TxCBOR } from "@cardano-sdk/core";
import { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { LanguageVersion, toBytes } from "@meshsdk/common";

import {
  Address,
  DatumHash,
  Ed25519KeyHash,
  NativeScript,
  PlutusData,
  PlutusV1Script,
  PlutusV2Script,
  PlutusV3Script,
  Script,
  ScriptHash,
  Transaction,
  TransactionId,
  TransactionUnspentOutput,
  Value,
} from "../types";

export const deserializeAddress = (address: string): Address => {
  const _address = Address.fromString(address);
  if (_address === null) throw new Error("Invalid address");
  return _address;
};

export const deserializeEd25519KeyHash = (ed25519KeyHash: string) =>
  Ed25519KeyHash.fromBytes(toBytes(ed25519KeyHash));

export const deserializeDataHash = (dataHash: string): DatumHash =>
  DatumHash.fromHexBlob(HexBlob(dataHash));

export const deserializePlutusData = (plutusData: string): PlutusData =>
  PlutusData.fromCbor(HexBlob(plutusData));

export const deserializePlutusScript = (
  plutusScript: string,
  version: LanguageVersion,
): PlutusV1Script | PlutusV2Script | PlutusV3Script => {
  switch (version) {
    case "V1":
      return PlutusV1Script.fromCbor(HexBlob(plutusScript));
    case "V2":
      return PlutusV2Script.fromCbor(HexBlob(plutusScript));
    case "V3":
      return PlutusV3Script.fromCbor(HexBlob(plutusScript));
    default:
      throw new Error("Invalid Plutus script version");
  }
};

export const deserializeNativeScript = (nativeScript: string): NativeScript =>
  NativeScript.fromCbor(HexBlob(nativeScript));

export const deserializeScriptHash = (scriptHash: string) =>
  ScriptHash.fromEd25519KeyHashHex(Ed25519KeyHashHex(scriptHash));

export const deserializeScriptRef = (scriptRef: string): Script =>
  Script.fromCbor(HexBlob(scriptRef));

export const deserializeTxUnspentOutput = (
  txUnspentOutput: string,
): TransactionUnspentOutput =>
  TransactionUnspentOutput.fromCbor(HexBlob(txUnspentOutput));

export const deserializeValue = (value: string): Value =>
  Value.fromCbor(HexBlob(value));

export const deserializeTx = (tx: string): Transaction =>
  Transaction.fromCbor(TxCBOR(tx));

export const deserializeTxHash = (txHash: string): TransactionId =>
  TransactionId.fromHexBlob(HexBlob(txHash));
