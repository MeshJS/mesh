import {
  DeserializedAddress,
  NativeScript,
  PlutusScript,
  PubKeyAddress,
  ScriptAddress,
} from "@meshsdk/common";

import { core } from "../core";

/**
 * Serialize Native script into bech32 address
 * @param script The native script object
 * @param networkId 0 (testnet) or 1 (mainnet). Default to be 0 (testnet).
 * @returns Bech32 address
 */
export const serializeNativeScript = (
  script: NativeScript,
  stakeCredentialHash?: string,
  networkId = 0,
  isScriptStakeCredential = false,
) => {
  const serializer = new core.CSLSerializer();
  const { scriptCbor, scriptHash } =
    serializer.deserializer.script.deserializeNativeScript(script);
  const deserializedAddress: Partial<DeserializedAddress> = {
    scriptHash: scriptHash,
  };
  if (isScriptStakeCredential) {
    deserializedAddress.stakeScriptCredentialHash = stakeCredentialHash;
  } else {
    deserializedAddress.stakeCredentialHash = stakeCredentialHash;
  }
  const address = serializer.serializeAddress(deserializedAddress, networkId);
  return { address, scriptCbor };
};

/**
 * Serialize Native script into bech32 address
 * @param script The native script object
 * @param networkId 0 (testnet) or 1 (mainnet). Default to be 0 (testnet).
 * @returns Bech32 address
 */
export const serializePlutusScript = (
  script: PlutusScript,
  stakeCredentialHash?: string,
  networkId = 0,
  isScriptStakeCredential = false,
) => {
  const scriptHash = core
    .deserializePlutusScript(script.code, script.version)
    .hash()
    .to_hex();
  const address = core.scriptHashToBech32(
    scriptHash,
    stakeCredentialHash,
    networkId,
    isScriptStakeCredential,
  );
  return { address };
};

/**
 * Serialize address in Cardano data JSON format into bech32 address
 * @param address The Cardano address in data JSON format
 * @param networkId 0 (testnet) or 1 (mainnet). Default to be 0 (testnet).
 * @returns Bech32 address
 */
export const serializeAddressObj = (
  address: PubKeyAddress | ScriptAddress,
  networkId = 0,
) => {
  return core.serializeAddressObj(address, networkId);
};

/**
 * Resolve the pool id from hash
 * @param hash The pool hash
 * @returns The pool id
 */
export const serializePoolId = (hash: string) => core.serializePoolId(hash);

/**
 * Serialize a script hash or key hash into bech32 reward address
 * @param hash The script hash or key hash
 * @param isScriptHash Whether the hash is a script hash
 * @param networkId 0 (testnet) or 1 (mainnet). Default to be 0 (testnet).
 * @returns Bech32 reward address
 */
export const serializeRewardAddress = (
  hash: string,
  isScriptHash = false,
  networkId: 0 | 1 = 0,
) => {
  return isScriptHash
    ? core.scriptHashToRewardAddress(hash, networkId)
    : core.keyHashToRewardAddress(hash, networkId);
};
