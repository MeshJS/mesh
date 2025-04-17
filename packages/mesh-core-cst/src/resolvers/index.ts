/*
This file is part of meshjs.dev.

This source code is licensed under the MIT license found in the
LICENSE file in the root directory of this source tree. See the
Apache-2.0 License for more details.
*/

import { Cardano } from "@cardano-sdk/core";
import { blake2b } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";
import base32 from "base32-encoding";
import { bech32 } from "bech32";

import {
  BuilderData,
  fromUTF8,
  mnemonicToEntropy,
  NativeScript,
  PlutusDataType,
  PlutusScript,
  toBytes,
} from "@meshsdk/common";

import {
  Bip32PrivateKey,
  DRepID,
  Ed25519KeyHashHex,
  EnterpriseAddress,
  Hash28ByteBase16,
  PoolId,
} from "../types";
import {
  deserializePlutusScript,
  deserializeTx,
  fromBuilderToPlutusData,
  toAddress,
  toBaseAddress,
  toEnterpriseAddress,
  toNativeScript,
  toRewardAddress,
  toScriptRef,
} from "../utils";
import { buildRewardAddress } from "../utils/builder";
import { hexToBytes } from "../utils/encoding";

export const resolveDataHash = (
  rawData: BuilderData["content"],
  type: PlutusDataType = "Mesh",
) => {
  const plutusData = fromBuilderToPlutusData({
    content: rawData,
    type,
  } as BuilderData);
  return plutusData.hash().toString();
};

export const resolveNativeScriptAddress = (
  script: NativeScript,
  networkId = 0,
) => {
  const nativeScript = toNativeScript(script);

  const enterpriseAddress = EnterpriseAddress.fromCredentials(networkId, {
    hash: nativeScript.hash(),
    type: Cardano.CredentialType.ScriptHash,
  });

  return enterpriseAddress.toAddress().toBech32().toString();
};

export const resolveNativeScriptHash = (script: NativeScript) => {
  return toNativeScript(script).hash().toString();
};

export const resolvePaymentKeyHash = (bech32: string) => {
  try {
    const paymentKeyHash = [
      toBaseAddress(bech32)?.getPaymentCredential().hash,
      toEnterpriseAddress(bech32)?.getPaymentCredential().hash,
    ].find((kh) => kh !== undefined);

    if (paymentKeyHash !== undefined) return paymentKeyHash.toString();

    throw new Error(
      `Couldn't resolve payment key hash from address: ${bech32}`,
    );
  } catch (error) {
    throw new Error(
      `An error occurred during resolvePaymentKeyHash: ${error}.`,
    );
  }
};

export const resolvePlutusScriptAddress = (
  script: PlutusScript,
  networkId = 0,
) => {
  const plutusScript = deserializePlutusScript(script.code, script.version);

  const enterpriseAddress = EnterpriseAddress.fromCredentials(networkId, {
    hash: plutusScript.hash(),
    type: Cardano.CredentialType.ScriptHash,
  });

  return enterpriseAddress.toAddress().toBech32().toString();
};

export const resolvePlutusScriptHash = (bech32: string) => {
  try {
    const enterpriseAddress = toEnterpriseAddress(bech32);
    const scriptHash = enterpriseAddress?.getPaymentCredential().hash;

    if (scriptHash !== undefined) return scriptHash.toString();

    throw new Error(`Couldn't resolve script hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveScriptHash: ${error}.`);
  }
};

export const resolvePoolId = (hash: string) => {
  return PoolId.fromKeyHash(Ed25519KeyHashHex(hash)).toString();
};

export const resolvePrivateKey = (words: string[]) => {
  const buildBip32PrivateKey = (
    entropy: string,
    password = "",
  ): Bip32PrivateKey => {
    return Bip32PrivateKey.fromBip39Entropy(
      Buffer.from(toBytes(entropy)),
      fromUTF8(password),
    );
  };

  const entropy = mnemonicToEntropy(words.join(" "));
  const bip32PrivateKey = buildBip32PrivateKey(entropy);
  const bytes = base32.encode(bip32PrivateKey.bytes());
  const bech32PrivateKey = bech32.encode("xprv", bytes, 1023);

  return bech32PrivateKey;
};

export const resolveScriptRef = (script: PlutusScript | NativeScript) => {
  return toScriptRef(script).toCbor().toString();
};

export const resolveRewardAddress = (bech32: string) => {
  try {
    const address = toAddress(bech32);
    const baseAddress = toBaseAddress(bech32);
    const stakeKeyHash = baseAddress?.getStakeCredential().hash;

    if (stakeKeyHash !== undefined)
      return buildRewardAddress(address.getNetworkId(), stakeKeyHash)
        .toAddress()
        .toBech32()
        .toString();

    throw new Error(`Couldn't resolve reward address from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveRewardAddress: ${error}.`);
  }
};

export const resolveStakeKeyHash = (bech32: string) => {
  try {
    const stakeKeyHash = [
      toBaseAddress(bech32)?.getStakeCredential().hash,
      toRewardAddress(bech32)?.getPaymentCredential().hash,
    ].find((kh) => kh !== undefined);

    if (stakeKeyHash !== undefined) return stakeKeyHash.toString();

    throw new Error(`Couldn't resolve stake key hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(`An error occurred during resolveStakeKeyHash: ${error}.`);
  }
};

export const resolveTxHash = (txHex: string) => {
  const txBody = deserializeTx(txHex).body();
  const hash = blake2b(blake2b.BYTES)
    .update(hexToBytes(txBody.toCbor()))
    .digest();
  return Cardano.TransactionId.fromHexBlob(HexBlob.fromBytes(hash)).toString();
};

export const resolveScriptHashDRepId = (scriptHash: string) => {
  return DRepID.cip129FromCredential({
    type: Cardano.CredentialType.ScriptHash,
    hash: Hash28ByteBase16(scriptHash),
  }).toString();
};

export const resolveEd25519KeyHash = (bech32: string) => {
  try {
    const keyHash = [
      toBaseAddress(bech32)?.getPaymentCredential().hash,
      toEnterpriseAddress(bech32)?.getPaymentCredential().hash,
    ].find((kh) => kh !== undefined);

    if (keyHash !== undefined) return keyHash.toString();

    throw new Error(`Couldn't resolve key hash from address: ${bech32}`);
  } catch (error) {
    throw new Error(
      `An error occurred during resolveEd25519KeyHash: ${error}.`,
    );
  }
};
