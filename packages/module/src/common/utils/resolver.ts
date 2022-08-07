import {
  fromBytes, toAddress, toBaseAddress, toEnterpriseAddress,
} from './converter';
import { deserializeAddress } from './deserializer';

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

export const resolveFingerprint = (policyId: string, assetName: string) => {
  return `${policyId}${assetName}`; // TODO: CIP 14 - User-Facing Asset Fingerprint
}

export const resolveScriptHash = (bech32: string) => {
  try {
    const enterpriseAddress = toEnterpriseAddress(bech32);
    const scriptHash = enterpriseAddress?.payment_cred().to_scripthash();

    if (scriptHash !== undefined)
      return fromBytes(scriptHash.to_bytes());

    throw new Error(`Couldn't resolve script hash from address: ${bech32}.`);
  } catch (error) {
    throw error
  }
}

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
