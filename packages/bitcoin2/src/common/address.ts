/* eslint-disable @typescript-eslint/no-non-null-assertion, complexity, no-magic-numbers */
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { Network } from './network';
import { ChainType } from './keyDerivation';
import { tweakTaprootPubKey } from './taproot';

bitcoin.initEccLib(ecc);

/**
 * Enum representing different Bitcoin address types.
 *
 * Bitcoin supports multiple address formats, each optimized for different use cases, including backward compatibility,
 * SegWit improvements, and modern Taproot addresses. This enum standardizes the available address types,
 * including a specific type used by Electrum for Native SegWit.
 */
export enum AddressType {
  /**
   * Legacy P2PKH (Pay-to-Public-Key-Hash). The original Bitcoin address format, used before SegWit.
   *
   * Starts with `1` (e.g., `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`).
   */
  Legacy = 'Legacy',

  /**
   * SegWit P2SH-P2WPKH (Pay-to-Script-Hash wrapped SegWit). A backward-compatible SegWit address format wrapped
   * in a P2SH script.
   *
   * Starts with `3` (e.g., `3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy`).
   */
  SegWit = 'SegWit',

  /**
   * Native SegWit P2WPKH (Pay-to-Witness-Public-Key-Hash) address format, lowest fees for SegWit transactions due to
   * reduced transaction size.
   *
   * Not compatible with very old wallets or tools that do not support Bech32 addresses.
   *
   * Starts with `bc1q` (e.g., `bc1qw508d6qe...`).
   */
  NativeSegWit = 'NativeSegWit',

  /**
   * Taproot P2TR (Pay-to-Taproot) address format introduced in Bitcoin's Taproot upgrade. Supports advanced scripting, improved privacy,
   * and further reduced transaction fees.
   *
   * Starts with `bc1p` (e.g., `bc1p5cyxnux...`).
   */
  Taproot = 'Taproot',

  /**
   * Electrum's implementation of Native SegWit uses a custom derivation scheme, with `m/0'` as the root path instead
   * of the BIP-84 standard `m/84'/0'/0'`. Is not directly compatible with other wallets that expect standard BIP-84 paths.
   *
   * Starts with `bc1q` (similar to Native SegWit).
   */
  ElectrumNativeSegWit = 'ElectrumNativeSegWit'
}

/**
 * Derives a Bitcoin address from the given public key and address type.
 *
 * Bitcoin supports multiple address formats, each optimized for different use cases,
 * such as backward compatibility, SegWit efficiency, and Taproot privacy enhancements.
 * This function derives the appropriate Bitcoin address based on the specified address type.
 *
 * @param {Buffer} publicKey - The public key (compressed, 33 bytes).
 * @param {AddressType} addressType - The address type (Legacy, SegWit, NativeSegWit, Taproot, ElectrumNativeSegWit).
 * @param {bitcoin.networks.Network} network - The Bitcoin network (e.g., `bitcoin.networks.bitcoin` for mainnet or `bitcoin.networks.testnet`).
 * @returns {string} The derived Bitcoin address as a string.
 *
 * @throws {Error} If an unsupported address type is provided.
 */
export const deriveAddressByType = (
  publicKey: Buffer,
  addressType: AddressType,
  network: bitcoin.networks.Network
): string => {
  // Ensure the public key is a Buffer
  const pubkeyBuffer = Buffer.from(publicKey);

  switch (addressType) {
    /**
     * **Legacy (P2PKH)**: Pay-to-Public-Key-Hash
     * - Address format: Starts with `1`.
     * - Example: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
     */
    case AddressType.Legacy:
      return bitcoin.payments.p2pkh({ pubkey: pubkeyBuffer, network }).address!;

    /**
     * **SegWit (P2SH-P2WPKH)**: Pay-to-Script-Hash wrapped SegWit
     * - Address format: Starts with `3`.
     * - Example: 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy
     */
    case AddressType.SegWit:
      return bitcoin.payments.p2sh({
        redeem: bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network }),
        network
      }).address!;

    /**
     * **NativeSegWit (P2WPKH)**: Native Pay-to-Witness-Public-Key-Hash
     * - Address format: Starts with `bc1q`.
     * - Example: bc1qw508d6qejxtdg4y5r3zarvaryvaxxpcs
     */
    case AddressType.NativeSegWit:
    case AddressType.ElectrumNativeSegWit: // Electrum uses the same format but different derivation paths
      return bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network }).address!;

    /**
     * **Taproot (P2TR)**: Pay-to-Taproot
     * - Address format: Starts with `bc1p`.
     * - Example: bc1p5cyxnuxmeuwuvkwfem96l4rze9x9z7g03pzhj
     *
     * Taproot requires the "x-only" public key, which is the 32-byte version of the public key.
     * The first byte (prefix) of the compressed public key is removed.
     */
    case AddressType.Taproot: {
      // Convert the compressed public key to an x‑only public key by removing the first byte.
      const internalXOnlyPubKey = pubkeyBuffer.slice(1);
      const tweakedPubKey = tweakTaprootPubKey(internalXOnlyPubKey);
      return bitcoin.payments.p2tr({ pubkey: tweakedPubKey, network }).address!;
    }

    default:
      throw new Error(`Unsupported address type: ${addressType}`);
  }
};

/**
 * Represents a Bitcoin address and its corresponding derivation path details.
 *
 * In hierarchical deterministic (HD) wallets, Bitcoin addresses are derived
 * systematically using derivation paths. Each path uniquely identifies a specific
 * address in the wallet's key hierarchy, allowing for organized management of keys.
 */
export type DerivedAddress = {
  /**
   * The derived Bitcoin address.
   */
  address: string;

  /**
   * The type of address used to derive the address.
   */
  addressType: AddressType;

  /**
   * The Bitcoin network to which this address belongs.
   */
  network: Network;

  /**
   * The account number in the derivation path.
   *
   * This number represents the account index within the wallet's key hierarchy.
   */
  account: number;

  /**
   * The chain type used in the derivation path.
   *
   * This distinguishes between external (receiving) and internal (change).
   */
  chain: ChainType;

  /**
   * The index number in the derivation path.
   *
   * This indicates the sequential order of the address within the specified chain.
   */
  index: number;

  /**
   * The public key for this address.
   */
  publicKeyHex: string;
};

/**
 * Enumeration for results of Bitcoin address validation.
 */
export enum AddressValidationResult {
  /**
   * Indicates the address is correctly formatted and matches the expected network.
   */
  Valid = 'Valid',

  /**
   * Indicates the address does not match the expected network prefix.
   */
  InvalidNetwork = 'InvalidNetwork',

  /**
   * Indicates the address format is incorrect or not supported.
   */
  InvalidAddress = 'InvalidAddress'
}

/**
 * Validates a Bitcoin address and returns a result indicating if the address is valid or the type of issue found.
 *
 * @param address The Bitcoin address to validate.
 * @param network The expected Bitcoin network (mainnet or testnet).
 * @returns An enum value indicating the validation result.
 */
export const validateBitcoinAddress = (address: string, network: Network): AddressValidationResult => {
  const bitcoinNetwork = network === Network.Testnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

  try {
    const decodedBase58 = bitcoin.address.fromBase58Check(address);
    if (decodedBase58.version === bitcoinNetwork.pubKeyHash || decodedBase58.version === bitcoinNetwork.scriptHash) {
      return AddressValidationResult.Valid;
    }
    return AddressValidationResult.InvalidNetwork;
  } catch {
    // continue
  }

  try {
    const decodedBech32 = bitcoin.address.fromBech32(address);
    if (decodedBech32.prefix !== bitcoinNetwork.bech32) {
      return AddressValidationResult.InvalidNetwork;
    }
    if (
      (decodedBech32.version === 0 && (decodedBech32.data.length === 20 || decodedBech32.data.length === 32)) ||
      (decodedBech32.version === 1 && decodedBech32.data.length === 32)
    ) {
      return AddressValidationResult.Valid;
    }
  } catch {
    return AddressValidationResult.InvalidAddress;
  }

  return AddressValidationResult.InvalidAddress;
};

/**
 * Checks if a Bitcoin address is a Taproot (P2TR) address.
 * @param {string} address - The Bitcoin address to check.
 * @returns {boolean} True if the address is a Taproot address, otherwise false.
 */
export const isP2trAddress = (address: string): boolean => address.startsWith('bc1p') || address.startsWith('tb1p');
