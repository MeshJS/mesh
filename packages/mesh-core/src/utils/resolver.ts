import {
  Data,
  LanguageVersion,
  NativeScript,
  PlutusScript,
} from "@meshsdk/common";

import { core } from "../core";

/**
 * Resolve the private key from mnemonic words
 *
 * Update pending to support resolving a tree of private key
 *
 * @param words The mnemonic words
 * @returns The private key
 */
export const resolvePrivateKey = (words: string[]) =>
  core.resolvePrivateKey(words);

/**
 * Resolve the transaction hash from transaction hex
 * @param txHex The transaction hex
 * @returns The transaction hash
 */
export const resolveTxHash = (txHex: string) => core.calculateTxHash(txHex);

/**
 * Hash Cardano data
 * @param data Cardano data in Mesh Data type
 * @returns Cardano data hash
 */
export const resolveDataHash = (data: Data) => core.resolveDataHash(data);

/**
 * Hash Cardano native script
 * @param script Cardano native script in Mesh NativeScript type
 * @returns Cardano native script hash
 */
export const resolveNativeScriptHash = (script: NativeScript) =>
  core.resolveNativeScriptHash(script);

/**
 * Converting script cbor hex to script hash
 * @param scriptCode The script cbor hex
 * @param version The language version of the plutus script, without providing indicates it is a native script
 * @returns The script hash
 */
export const resolveScriptHash = (
  scriptCode: string,
  version?: LanguageVersion,
): string => {
  if (!version) {
    return core.deserializeNativeScript(scriptCode).hash().to_hex();
  }
  return core.deserializePlutusScript(scriptCode, version).hash().to_hex();
};

/**
 * Resolve the Ed25519 key hash from bech32 address
 * @param bech32 The bech32 address
 * @returns The Ed25519 key hash
 */
export const resolveRewardAddress = (bech32: string) =>
  core.resolveRewardAddress(bech32);

/**
 * Resolve the stake key hash from bech32 address
 * @param bech32 The bech32 address, either in addrxxx or stakexxx
 * @returns The stake key hash
 */
export const resolveStakeKeyHash = (bech32: string) =>
  core.resolveStakeKeyHash(bech32);

/**
 *
 * @param scriptHash
 * @returns
 */
export const resolveScriptHashDRepId = (scriptHash: string) =>
  core.resolveScriptHashDRepId(scriptHash);

// ------------------- Deprecated zone ---------------------

/**
 * Deprecated - use `serializePlutusScript` instead
 */
export const resolvePlutusScriptAddress = (
  script: PlutusScript,
  networkId?: number,
) => core.resolvePlutusScriptAddress(script, networkId);

/**
 * Deprecated - use `serializeNativeScript` instead
 */
export const resolveNativeScriptAddress = (
  script: NativeScript,
  networkId?: number,
) => core.resolveNativeScriptAddress(script, networkId);

/**
 * Deprecated - use `serializeNativeScript` instead
 */
export const resolveNativeScriptHex = (script: NativeScript) =>
  core.toNativeScript(script).to_hex();

/**
 * Deprecated - use `deserializeAddress` instead
 */
export const resolvePaymentKeyHash = (bech32: string) =>
  core.deserializeBech32Address(bech32).pubKeyHash;

/**
 * Deprecated - use `deserializeAddress` instead
 */
export const resolvePlutusScriptHash = (bech32: string) =>
  core.deserializeBech32Address(bech32).scriptHash;

/**
 * Deprecated - this is more used with the low level process inside Mesh
 *
 * If you need this, please import @meshsdk/core-csl or @meshsdk/core-cst instead
 */
export const resolveScriptRef = (script: NativeScript | PlutusScript) =>
  core.resolveScriptRef(script);

/**
 * Deprecated - use `serializePoolId` instead
 */
export const resolvePoolId = (hash: string) => core.serializePoolId(hash);
