import {
  DeserializedAddress,
  pubKeyAddress,
  PubKeyAddress,
  scriptAddress,
  ScriptAddress,
} from "@meshsdk/common";

import { csl } from "../deser";
import { getV2ScriptHash } from "./scripts";

export const serialzeAddress = (
  deserializedAddress: Partial<DeserializedAddress>,
  networkId = 0,
) => {
  const {
    pubKeyHash,
    scriptHash,
    stakeCredentialHash,
    stakeScriptCredentialHash,
  } = deserializedAddress;

  const isPaymentScript = !pubKeyHash;
  const isStakeScript = !stakeCredentialHash;

  const paymentHash = isPaymentScript ? scriptHash : pubKeyHash;

  const stakeHash = isStakeScript
    ? stakeScriptCredentialHash
    : stakeCredentialHash;

  if (!paymentHash)
    throw new Error(
      "Error: serializeAddress: Address must contain a payment part",
    );

  const addressObj = isPaymentScript
    ? scriptAddress(paymentHash, stakeHash, isStakeScript)
    : pubKeyAddress(paymentHash, stakeHash, isStakeScript);
  return serializeAddressObj(addressObj, networkId);
};

export const addrBech32ToHex = (bech32: string): string => {
  const hexAddress = csl.Address.from_bech32(bech32).to_hex();
  const cslAddress = csl.Address.from_hex(hexAddress);
  const hex = csl.PlutusData.from_address(cslAddress).to_hex();
  return hex;
};

export const addrBech32ToObj = <T>(bech32: string): T => {
  const hexAddress = csl.Address.from_bech32(bech32).to_hex();
  const cslAddress = csl.Address.from_hex(hexAddress);
  const json = JSON.parse(csl.PlutusData.from_address(cslAddress).to_json(1));
  return json;
};

export const serializeAddressObj = (
  plutusDataAddressObject: PubKeyAddress | ScriptAddress,
  networkId = 0,
) => {
  const bech32Addr = csl.parse_plutus_address_obj_to_bech32(
    JSON.stringify(plutusDataAddressObject),
    networkId,
  );
  return bech32Addr;
};

export const serializePlutusAddressToBech32 = (
  plutusHex: string,
  networkId = 0,
) => {
  const cslPlutusDataAddress = csl.PlutusData.from_hex(plutusHex);
  const plutusDataAddressObject = JSON.parse(
    cslPlutusDataAddress.to_json(csl.PlutusDatumSchema.DetailedSchema),
  );
  return serializeAddressObj(plutusDataAddressObject, networkId);
};

export const deserializeBech32Address = (
  bech32Addr: string,
): DeserializedAddress => {
  const deserializedAddress = csl.deserialize_bech32_address(bech32Addr);
  return {
    pubKeyHash: deserializedAddress.get_pub_key_hash(),
    scriptHash: deserializedAddress.get_script_hash(),
    stakeCredentialHash: deserializedAddress.get_stake_key_hash(),
    stakeScriptCredentialHash: deserializedAddress.get_stake_key_script_hash(),
  };
};

export const scriptHashToBech32 = (
  scriptHash: string,
  stakeCredentialHash?: string,
  networkId = 0,
  isScriptStakeCredentialHash = false,
) =>
  csl.wasm_script_to_address(
    networkId,
    scriptHash,
    stakeCredentialHash,
    isScriptStakeCredentialHash,
  );

export const v2ScriptToBech32 = (
  scriptCbor: string,
  stakeCredential?: string,
  networkId = 0,
  isScriptStakeCredential = false,
) =>
  scriptHashToBech32(
    getV2ScriptHash(scriptCbor),
    stakeCredential,
    networkId,
    isScriptStakeCredential,
  );
