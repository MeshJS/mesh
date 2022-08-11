import { AssetFingerprint, csl } from '@mesh/core';
import {
  fromBytes, toAddress, toBaseAddress,
  toBytes, toEnterpriseAddress, toPlutusData,
} from './converter';
import { deserializeAddress } from './deserializer';
import type { Data } from '@mesh/common/types';

export const resolveAddressKeyHash = (bech32: string) => {
  try {
    const baseAddress = toBaseAddress(bech32);
    const keyHash = baseAddress?.payment_cred().to_keyhash();

    if (keyHash !== undefined)
      return fromBytes(keyHash.to_bytes());

    throw new Error(`Couldn't resolve key hash from address: ${bech32}.`);
  } catch (error) {
    throw error;
  }
};

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

export const resolveScriptHash = (bech32: string) => {
  try {
    const enterpriseAddress = toEnterpriseAddress(bech32);
    const scriptHash = enterpriseAddress?.payment_cred().to_scripthash();

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

////

// const myascii = (s) => Buffer.from(s, 'ascii').toString('hex');
// const fromHex = (hex) => Buffer.from(hex, 'hex');
// const toHex = (bytes) => Buffer.from(bytes).toString('hex');
export const resolveDataHashDebug = (data: string) => {
  // const datum = csl.PlutusData.from_bytes(fromHex(data));
  // console.log(11, datum);
  // console.log(22, csl.hash_plutus_data(datum));

  // console.log(33, csl.hash_plutus_data(datum).to_bytes());
  // return toHex(csl.hash_plutus_data(datum).to_bytes());

  // const datum = csl.PlutusData.new_bytes(toBytes(data));
  // const datum = csl.new_integer
  // const dataHash = csl.hash_plutus_data(datum);
  // return fromBytes(dataHash.to_bytes());

  // console.log(111, fromASCII(data)); // 68656c6c6f20776f726c64
  // console.log(222, fromHex(fromASCII(data)));
  // const datum = csl.PlutusData.from_bytes(fromHex(fromASCII(data)));
  // // Uncaught (in promise) Deserialization failed in PlutusDataEnum.PlutusDataEnum because: No variant matched
  // // console.log("datum", datum);
  // return datum;


  const datum = csl.PlutusData.new_integer(
    csl.BigInt.from_str(data.toString())
  );
  const dataHash = csl.hash_plutus_data(datum);
  return fromBytes(dataHash.to_bytes());
};
