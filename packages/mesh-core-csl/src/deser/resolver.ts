import {
  Data,
  mnemonicToEntropy,
  NativeScript,
  PlutusScript,
} from "@meshsdk/common";

import {
  deserializePlutusScript,
  fromUTF8,
  toAddress,
  toBaseAddress,
  toBytes,
  toNativeScript,
  toPlutusData,
  toRewardAddress,
  toScriptRef,
} from ".";
import { csl } from "./csl";

export const resolveStakeKeyHash = (bech32: string) => {
  try {
    const stakeKeyHash = [
      toBaseAddress(bech32)?.stake_cred().to_keyhash(),
      toRewardAddress(bech32)?.payment_cred().to_keyhash(),
    ].find((kh) => kh !== undefined);

    if (stakeKeyHash !== undefined) return stakeKeyHash.to_hex();

    throw new Error(`Couldn't resolve stake key hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveStakeKeyHash: ${error}.`);
  }
};

export const resolvePrivateKey = (words: string[]) => {
  const buildBip32PrivateKey = (
    entropy: string,
    password = "",
  ): csl.Bip32PrivateKey => {
    return csl.Bip32PrivateKey.from_bip39_entropy(
      toBytes(entropy),
      toBytes(fromUTF8(password)),
    );
  };

  const entropy = mnemonicToEntropy(words.join(" "));
  const bip32PrivateKey = buildBip32PrivateKey(entropy);
  const bech32PrivateKey = bip32PrivateKey.to_bech32();

  bip32PrivateKey.free();

  return bech32PrivateKey;
};

export const resolveNativeScriptAddress = (
  script: NativeScript,
  networkId = 0,
) => {
  const nativeScript = toNativeScript(script);

  const enterpriseAddress = csl.EnterpriseAddress.new(
    networkId,
    csl.Credential.from_scripthash(nativeScript.hash()),
  );

  return enterpriseAddress.to_address().to_bech32();
};

export const resolvePlutusScriptAddress = (
  script: PlutusScript,
  networkId = 0,
) => {
  const plutusScript = deserializePlutusScript(script.code, script.version);

  const enterpriseAddress = csl.EnterpriseAddress.new(
    networkId,
    csl.Credential.from_scripthash(plutusScript.hash()),
  );

  return enterpriseAddress.to_address().to_bech32();
};

export const resolveNativeScriptHash = (script: NativeScript) => {
  return toNativeScript(script).hash().to_hex();
};

export const resolveScriptHashDRepId = (scriptHash: string) => {
  return csl.DRep.new_script_hash(
    csl.ScriptHash.from_hex(scriptHash),
  ).to_bech32();
};

export const resolveRewardAddress = (bech32: string) => {
  const buildRewardAddress = (
    networkId: number,
    stakeKeyHash: csl.Ed25519KeyHash,
  ): csl.RewardAddress => {
    return csl.RewardAddress.new(
      networkId,
      csl.Credential.from_keyhash(stakeKeyHash),
    );
  };

  try {
    const address = toAddress(bech32);
    const baseAddress = toBaseAddress(bech32);
    const stakeKeyHash = baseAddress?.stake_cred().to_keyhash();

    if (stakeKeyHash !== undefined)
      return buildRewardAddress(address.network_id(), stakeKeyHash)
        .to_address()
        .to_bech32();

    throw new Error(`Couldn't resolve reward address from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveRewardAddress: ${error}.`);
  }
};

export const resolveDataHash = (data: Data) => {
  const plutusData = toPlutusData(data);
  const dataHash = csl.hash_plutus_data(plutusData);
  return dataHash.to_hex();
};

export const resolveNativeScriptHex = (script: NativeScript) => {
  return toNativeScript(script).to_hex();
};

export const serializePoolId = (hash: string) => {
  return csl.Ed25519KeyHash.from_hex(hash).to_bech32("pool1");
};

export const resolveScriptRef = (script: PlutusScript | NativeScript) => {
  return toScriptRef(script).to_hex();
};

export const resolveEd25519KeyHash = (bech32: string) => {
  return csl.Ed25519KeyHash.from_bech32(bech32).to_hex();
};
