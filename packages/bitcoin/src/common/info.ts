import { Network } from './network';

/**
 * Extended account public keys for a Bitcoin wallet.
 *
 * @typedef {Object} ExtendedAccountPublicKeys
 * @property {string} legacy - The extended public key for legacy addresses (base58 encoded).
 * @property {string} segWit - The extended public key for SegWit addresses (base58 encoded).
 * @property {string} nativeSegWit - The extended public key for Native SegWit addresses (base58 encoded).
 * @property {string} taproot - The extended public key for Taproot addresses (base58 encoded).
 * @property {string} electrumNativeSegWit - The extended public key for Electrum Native SegWit addresses (base58 encoded).
 */
export type ExtendedAccountPublicKeys = {
  legacy: string;
  segWit: string;
  nativeSegWit: string;
  taproot: string;
  electrumNativeSegWit: string;
};

export type BitcoinWalletInfo = {
  walletName: string;
  accountIndex: number;
  encryptedSecrets: {
    mnemonics: string;
    seed: string;
  };
  extendedAccountPublicKeys: {
    mainnet: ExtendedAccountPublicKeys;
    testnet: ExtendedAccountPublicKeys;
  };
};

export const getNetworkKeys = (info: BitcoinWalletInfo, network: Network): ExtendedAccountPublicKeys =>
  network === Network.Mainnet ? info.extendedAccountPublicKeys.mainnet : info.extendedAccountPublicKeys.testnet;
