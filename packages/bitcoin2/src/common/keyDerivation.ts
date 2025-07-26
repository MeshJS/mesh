/* eslint-disable new-cap, no-magic-numbers, @typescript-eslint/explicit-module-boundary-types */
import { pbkdf2Sync } from 'pbkdf2';
import { HDKey } from '@scure/bip32';
import * as bitcoin from 'bitcoinjs-lib';
import { AddressType } from './address';
import { Network } from './network';
import { ExtendedAccountPublicKeys } from './info';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

const ADDRESS_TYPE_TO_PURPOSE: Record<AddressType, number> = {
  [AddressType.Legacy]: 44,
  [AddressType.SegWit]: 49,
  [AddressType.NativeSegWit]: 84,
  [AddressType.Taproot]: 86,
  [AddressType.ElectrumNativeSegWit]: 0
};

/**
 * Mapping from AddressType enum values to keys used in ExtendedAccountPublicKeys.
 *
 * This mapping handles differences in capitalization between the enum values and the keys in the structure.
 */
const ADDRESS_TYPE_TO_KEY: Record<AddressType, keyof ExtendedAccountPublicKeys> = {
  [AddressType.Legacy]: 'legacy',
  [AddressType.SegWit]: 'segWit',
  [AddressType.NativeSegWit]: 'nativeSegWit',
  [AddressType.Taproot]: 'taproot',
  [AddressType.ElectrumNativeSegWit]: 'electrumNativeSegWit'
};

/**
 * Enum representing the type of address chain in hierarchical deterministic wallets.
 *
 * HD wallets (BIP-32/44/49/84) organize keys into two types of chains:
 * - **External**: Used for receiving addresses (visible to others).
 * - **Internal**: Used for change addresses (to send transaction change back to the wallet).
 */
export enum ChainType {
  /**
   * External chain (receiving addresses).
   * Derivation Path: m / purpose' / coin_type' / account' / 0 / index
   */
  External = 'external',

  /**
   * Internal chain (change addresses).
   * Derivation Path: m / purpose' / coin_type' / account' / 1 / index
   */
  Internal = 'internal'
}

/**
 * Derives a BIP-39-compatible seed from the given mnemonic and optional passphrase.
 *
 * @param {string} mnemonic - The BIP-39 mnemonic phrase (12, 15, 18, 21, or 24 words).
 * @param {string} [passphrase=''] - An optional passphrase for seed derivation (default is an empty string).
 * @returns {Buffer} The derived 64-byte BIP-39-compatible seed.
 *
 * @example
 * const mnemonic = 'ranch someone rely gasp where sense plug trust salmon stand result parade';
 * const seed = deriveBip39Seed(mnemonic);
 * console.log(seed.toString('hex'));
 */
export const deriveBip39Seed = (mnemonic: string, passphrase = ''): Buffer => {
  const salt = `mnemonic${passphrase}`;
  return pbkdf2Sync(mnemonic, salt, 2048, 64, 'sha512');
};

/**
 * Derives the Electrum-compatible seed from the given mnemonic and optional password.
 *
 * Electrum predates the introduction of BIP-39 and uses a custom seed derivation method that differs
 * from the standard BIP-39 process.
 *
 * Instead of generating the seed using the BIP-39 standard, Electrum derives its seed using the
 * PBKDF2-SHA512 algorithm with 2048 iterations and a custom salt.
 *
 * @param {string} mnemonic - The Electrum-compatible mnemonic phrase (12 or more words).
 * @param {string} [password=''] - An optional password to strengthen the seed derivation (default is an empty string).
 * @returns {Buffer} The derived 64-byte Electrum-compatible seed.
 *
 * @example
 * const mnemonic = 'ranch someone rely gasp where sense plug trust salmon stand result parade';
 * const seed = deriveElectrumSeed(mnemonic);
 * console.log(seed.toString('hex'));
 */
export const deriveElectrumSeed = (mnemonic: string, password = ''): Buffer => {
  const salt = `electrum${password}`;
  return pbkdf2Sync(mnemonic, salt, 2048, 64, 'sha512');
};

/**
 * Represents a derived key pair consisting of a public key and a private key.
 */
export type KeyPair = {
  publicKey: Buffer;
  privateKey: Buffer;
};

/**
 * Derives the account-level (root) key pair from the given master seed.
 *
 * This function derives the account-level using the derivation path:
 *
 *    m / purpose' / coin_type' / account'
 *
 * where:
 * - `purpose` is determined by the address type (e.g., 84 for NativeSegWit, 49 for SegWit, 44 for Legacy, etc.)
 * - `coin_type` comes from the network object (0 for mainnet and 1 for testnet).
 * - `account` is the account index.
 *
 * For example, for a Native SegWit wallet on Bitcoin mainnet with account 0, the derivation path would be:
 *    m/84'/0'/0'
 *
 * @param {Buffer} seed - The master seed derived from the mnemonic.
 * @param {AddressType} addressType - The address type (e.g., Legacy, SegWit, NativeSegWit, Taproot, ElectrumNativeSegWit).
 * @param {Network} network - The network (mainnet or testnet).
 * @param {number} account - The account index.
 * @returns {{ pair: KeyPair, path: string }} An object containing the derived account-level key pair and the derivation path.
 * @throws {Error} If the account-level private or public key cannot be derived.
 */
export const deriveAccountRootKeyPair = (seed: Buffer, addressType: AddressType, network: Network, account: number) => {
  const root = HDKey.fromMasterSeed(seed);
  const networkIndex = network === Network.Mainnet ? 0 : 1;
  const accountPath = `m/${ADDRESS_TYPE_TO_PURPOSE[addressType]}'/${networkIndex}'/${account}'`;
  const accountNode = root.derive(accountPath);

  if (!accountNode.privateExtendedKey) {
    throw new Error('Failed to derive account-level private key');
  }

  if (!accountNode.publicExtendedKey) {
    throw new Error('Failed to derive account-level public key');
  }

  return {
    pair: {
      publicKey: accountNode.publicExtendedKey,
      privateKey: accountNode.privateExtendedKey
    },
    path: accountPath
  };
};

/**
 * Derives a child key pair from the account-level HD key.
 *
 * This function derives a child key for a specific chain (external for receiving or internal for change)
 * and index, based on the account-level extended key. The chain is determined by using '0' for external addresses and
 * '1' for internal addresses.
 *
 * @param {string} accountKey - The account-level extended key (HDKey).
 * @param {ChainType} chain - The chain type (external for receiving, internal for change).
 * @param {number} index - The index of the child key to derive.
 * @returns {{ pair: KeyPair, path: string }} An object containing the derived child key pair and its derivation path.
 * @throws {Error} If the child private key cannot be derived.
 */
export const deriveChildKeyPair = (accountKey: string, chain: ChainType, index: number) => {
  const hdAccountKey = HDKey.fromExtendedKey(accountKey);
  const chainPath = chain === ChainType.External ? '0' : '1';
  const fullPath = `m/${chainPath}/${index}`;
  const childNode = hdAccountKey.derive(fullPath);
  if (!childNode.privateKey) {
    throw new Error('Failed to derive child private key');
  }

  if (!childNode.publicKey) {
    throw new Error('Failed to derive child public key');
  }

  return {
    pair: {
      publicKey: Buffer.from(childNode.publicKey),
      privateKey: Buffer.from(childNode.privateKey)
    },
    path: fullPath
  };
};

/**
 * Derives a child public key from a given extended public key using non-hardened derivation.
 *
 * This function allows deriving a child public key without requiring the private key.
 * It accepts an extended public key (as a Buffer) and a relative derivation path (e.g. "0/0")
 * for non-hardened derivation. If derivation is successful, it returns the child public key.
 *
 * @param {Buffer} extendedPublicKey - The extended public key as a Buffer.
 * @param {ChainType} chain - The chain type (external for receiving, internal for change).
 * @param {number} index - The index of the child key to derive.
 * @returns {Buffer} The derived child public key.
 * @throws {Error} If the child public key cannot be derived.
 */
export const deriveChildPublicKey = (extendedPublicKey: string, chain: ChainType, index: number): Buffer => {
  const hdKey = HDKey.fromExtendedKey(extendedPublicKey);
  const chainPath = chain === ChainType.External ? '0' : '1';
  const relativePath = `m/${chainPath}/${index}`;
  const childNode = hdKey.derive(relativePath);

  if (!childNode.publicKey) {
    throw new Error('Failed to derive child public key');
  }

  return Buffer.from(childNode.publicKey);
};

/**
 * Derives the extended account public keys for all supported address types and networks.
 *
 * Given a master seed and an account index, this function derives the account-level extended public key
 * (xpub) for each address type (Legacy, SegWit, NativeSegWit, Taproot, ElectrumNativeSegWit) on both Mainnet and Testnet.
 * The returned structure maps each network to its corresponding extended keys.
 *
 * @param {Buffer} seed - The master seed derived from the mnemonic.
 * @param {number} account - The account index.
 * @returns An object containing the extended account public keys for mainnet and testnet.
 */
export const getExtendedPubKeys = (
  seed: Buffer,
  account: number
): { mainnet: ExtendedAccountPublicKeys; testnet: ExtendedAccountPublicKeys } => {
  const addressTypes: AddressType[] = [
    AddressType.NativeSegWit,
    AddressType.Legacy,
    AddressType.Taproot,
    AddressType.SegWit,
    AddressType.ElectrumNativeSegWit
  ];
  const networks: Network[] = [Network.Mainnet, Network.Testnet];

  const extendedAccountPublicKeys: { mainnet: ExtendedAccountPublicKeys; testnet: ExtendedAccountPublicKeys } = {
    mainnet: {
      legacy: '',
      segWit: '',
      nativeSegWit: '',
      taproot: '',
      electrumNativeSegWit: ''
    },
    testnet: {
      legacy: '',
      segWit: '',
      nativeSegWit: '',
      taproot: '',
      electrumNativeSegWit: ''
    }
  };

  for (const network of networks) {
    for (const addressType of addressTypes) {
      const keyPair = deriveAccountRootKeyPair(seed, addressType, network, account);
      const extendedKeyStr = keyPair.pair.publicKey;

      if (network === Network.Mainnet) {
        extendedAccountPublicKeys.mainnet[ADDRESS_TYPE_TO_KEY[addressType]] = extendedKeyStr;
      } else {
        extendedAccountPublicKeys.testnet[ADDRESS_TYPE_TO_KEY[addressType]] = extendedKeyStr;
      }
    }
  }

  return extendedAccountPublicKeys;
};
