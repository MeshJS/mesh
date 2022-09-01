import { AssetFingerprint, csl } from '@mesh/core';
import {
  fromBytes, toAddress, toBytes, toBaseAddress,
  toRewardAddress, toEnterpriseAddress, toPlutusData,
} from './converter';
import { deserializeAddress, deserializeTxBody } from './deserializer';
import type { Data } from '@mesh/common/types';

export const resolveDataHash = (data: Data) => {
  const plutusData = toPlutusData(data);
  const dataHash = csl.hash_plutus_data(plutusData);
  return fromBytes(dataHash.to_bytes());
};

export const resolveFingerprint = (policyId: string, assetName: string) => {
  return AssetFingerprint.fromParts(
    toBytes(policyId),
    toBytes(assetName)
  ).fingerprint();
};

export const resolveKeyHash = (bech32: string) => {
  try {
    const keyHash = [
      toBaseAddress(bech32)?.payment_cred().to_keyhash(),
      toEnterpriseAddress(bech32)?.payment_cred().to_keyhash(),
      toRewardAddress(bech32)?.payment_cred().to_keyhash()
    ].find((kh) => kh !== undefined);

    if (keyHash !== undefined)
      return fromBytes(keyHash.to_bytes());

    throw new Error(`Couldn't resolve key hash from address: ${bech32}.`);
  } catch (error) {
    throw error;
  }
};

export const resolveScriptHash = (bech32: string) => {
  try {
    const enterpriseAddress = toEnterpriseAddress(bech32);
    const scriptHash = enterpriseAddress?.payment_cred()
      .to_scripthash();

    if (scriptHash !== undefined)
      return fromBytes(scriptHash.to_bytes());

    throw new Error(`Couldn't resolve script hash from address: ${bech32}.`);
  } catch (error) {
    throw error;
  }
};

export const resolveStakeKey = (bech32: string) => {
  try {
    const address = toAddress(bech32);
    const cborAddress = fromBytes(address.to_bytes());
    const cborStakeAddress = `e${address.network_id()}${cborAddress.slice(58)}`;

    return deserializeAddress(cborStakeAddress).to_bech32();
  } catch (error) {
    console.error(error);
    throw new Error(`Couldn't resolve stake key from address: ${bech32}.`);
  }
};

export const resolveTxHash = (cborTxBody: string) => {
  const txBody = deserializeTxBody(cborTxBody);
  const txHash = csl.hash_transaction(txBody);
  return fromBytes(txHash.to_bytes());
};
