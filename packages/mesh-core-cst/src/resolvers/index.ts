import { Cardano } from "@cardano-sdk/core";
import { blake2b } from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { Data, NativeScript, PlutusScript } from "@meshsdk/common";

import { Ed25519KeyHashHex, EnterpriseAddress } from "../types";
import {
  deserializePlutusScript,
  deserializeTx,
  toAddress,
  toBaseAddress,
  toEnterpriseAddress,
  toNativeScript,
  toPlutusData,
  toRewardAddress,
  toScriptRef,
} from "../utils";
import { buildRewardAddress } from "../utils/builder";
import { hexToBytes } from "../utils/encoding";

export const resolveDataHash = (data: Data) => {
  const plutusData = toPlutusData(data);
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

  return enterpriseAddress.toAddress().toBech32();
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

  return enterpriseAddress.toAddress().toBech32();
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
  return Ed25519KeyHashHex(hash).toString();
};

export const resolvePrivateKey = (words: string[]) => {
  return "not implemented";
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
        .toBech32();

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
  return Cardano.TransactionId.fromHexBlob(HexBlob.fromBytes(hash));
};
