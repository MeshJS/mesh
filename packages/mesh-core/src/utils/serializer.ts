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
 * @returns Bech32 address
 */
export const serializeAddressObj = (address: PubKeyAddress | ScriptAddress) => {
  return core.serializeAddressObj(address);
};

/**
 * Resolve the pool id from hash
 * @param hash The pool hash
 * @returns The pool id
 */
export const serializePoolId = (hash: string) => core.serializePoolId(hash);
