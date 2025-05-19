import { bitcoin, bip32, bip39 } from "../../core";
import { BIP32Interface } from "bip32";
import { UTxO } from "../../types/utxo";
import { Address } from "../../types/address";
import { IBitcoinProvider } from "../../interfaces/provider";
import type { Network } from "bitcoinjs-lib";
import { mnemonicToSeedSync, validateMnemonic } from "bip39";

export type CreateWalletOptions = {
  testnet: boolean;
  key: {
    type: "mnemonic";
    words: string[];
  };
  path?: string;
  provider?: IBitcoinProvider;
};

/**
 * EmbeddedWallet is a class that provides a simple interface to interact with Bitcoin wallets.
 */
export class EmbeddedWallet {
  private readonly _network: Network;
  private readonly _wallet: BIP32Interface;
  private readonly _provider?: IBitcoinProvider;

  constructor(options: CreateWalletOptions) {
    this._network = options.testnet
      ? bitcoin.networks.testnet
      : bitcoin.networks.bitcoin;

    this._wallet = _derive(
      options.key.words,
      options.path ?? "m/84'/0'/0'/0/0",
      this._network
    );

    this._provider = options.provider;
  }

  /**
   * Returns the wallet's SegWit (P2WPKH) address and associated public key.
   *
   * @returns {Address} The wallet address object including address, public key, and metadata.
   * @throws {Error} If internal address or public key is not properly initialized.
   */
  getAddress(): Address {
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: this._wallet.publicKey,
      network: this._network
    });

    if (!p2wpkh?.address) {
      throw new Error("Address is not initialized.");
    }

    return {
      address: p2wpkh.address,
      publicKey: this._wallet.publicKey.toString("hex"),
      purpose: "payment",
      addressType: "p2wpkh",
    };
  }

  /**
   * Returns the hex-encoded public key of the wallet.
   *
   * @returns {string} The public key in hexadecimal format.
   */
  getPublicKey(): string {
    return this._wallet.publicKey.toString("hex");
  }

  /**
   * Get UTXOs for the wallet address.
   * @returns An array of UTXOs.
   */
  async getUTxOs(): Promise<UTxO[]> {
    console.log("getUtxos");
    const address = this.getAddress();
    if (this._provider === undefined) {
      throw new Error("`provider` is not defined. Provide a BitcoinProvider.");
    }

    return await this._provider?.fetchAddressUTxOs(address.address);
  }

  /**
   * Signs a given message using the wallet's private key.
   *
   * @param message - The message to be signed.
   * @returns The signature of the message as a string.
   */
  signData(message: string): string {
    return "";
  }

  /**
   * Sign a transaction payload.
   * @param payload - The transaction payload to sign.
   * @returns The signed transaction in hex format.
   */
  signTx(payload: bitcoin.Transaction): string {
    return "";
  }

  /**
   * Generates a mnemonic phrase and returns it as an array of words.
   *
   * @param {number} [strength=128] - The strength of the mnemonic in bits (must be a multiple of 32 between 128 and 256).
   * @returns {string[]} An array of words representing the generated mnemonic.
   * @throws {Error} If the strength is not valid.
   */
  static brew(strength: number = 128): string[] {
    if (![128, 160, 192, 224, 256].includes(strength)) {
      throw new Error("Invalid strength. Must be one of: 128, 160, 192, 224, 256.");
    }

    const mnemonic = bip39.generateMnemonic(strength);
    return mnemonic.split(" ");
  }
}

function _derive(words: string[], path: string = "m/84'/0'/0'/0/0", network?: Network): BIP32Interface {
  const mnemonic = words.join(" ");

  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic provided.");
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);
  const child = root.derivePath(path);

  return child;
}
