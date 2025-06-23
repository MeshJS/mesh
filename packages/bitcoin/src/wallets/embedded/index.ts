import { bitcoin, bip32, bip39, ECPair } from "../../core";
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
      network: this._network,
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
   * Returns the network identifier of the wallet.
   * 0': Indicates the Bitcoin mainnet.
   * 1': Indicates the Bitcoin testnet.
   *
   * @returns {0 | 1} The Bitcoin network ID.
   */
  getNetworkId(): 0 | 1 {
    return this._network === bitcoin.networks.testnet ? 1 : 0;
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
    // Get the private key buffer from the BIP32 wallet
    const privateKey = this._wallet.privateKey;
    if (!privateKey) {
      throw new Error("Private key is not available for signing.");
    }

    // Create ECPair from private key
    const keyPair = ECPair.fromPrivateKey(privateKey, { compressed: true });
    // Prepare message buffer
    const messageBuffer = Buffer.from(message, "utf8");
    // Prepare the buffer to sign (see bitcoinjs-message implementation)
    
    const bufferToHash = Buffer.concat([
      varIntBuffer(messageBuffer.length),
      messageBuffer,
    ]);
    const hash = bitcoin.crypto.hash256(bufferToHash);
    // Sign the hash
    const signature = keyPair.sign(hash);
    // DER encode and return as base64
    return signature.toString("base64");
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
      throw new Error(
        "Invalid strength. Must be one of: 128, 160, 192, 224, 256."
      );
    }

    const mnemonic = bip39.generateMnemonic(strength);
    return mnemonic.split(" ");
  }
}

function _derive(
  words: string[],
  path: string = "m/84'/0'/0'/0/0",
  network?: Network
): BIP32Interface {
  const mnemonic = words.join(" ");

  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic provided.");
  }

  const seed = mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);
  const child = root.derivePath(path);

  return child;
}

function varIntBuffer(n: number): Buffer {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, n >> 8]);
  if (n <= 0xffffffff)
    return Buffer.from([
      0xfe,
      n & 0xff,
      (n >> 8) & 0xff,
      (n >> 16) & 0xff,
      (n >> 24) & 0xff,
    ]);
  throw new Error("Message too long");
}

/**
 * Verifies if a signature is valid for a given message and public key.
 * @param message - The original message that was signed.
 * @param signatureBase64 - The base64-encoded signature to verify.
 * @param publicKeyHex - The hex-encoded public key to verify against.
 * @returns {boolean} True if the signature is valid and matches the public key.
 */
export function verifySignature(
  message: string,
  signatureBase64: string,
  publicKeyHex: string
): boolean {
  try {
    const messageBuffer = Buffer.from(message, "utf8");
    const bufferToHash = Buffer.concat([
      varIntBuffer(messageBuffer.length),
      messageBuffer,
    ]);
    const hash = bitcoin.crypto.hash256(bufferToHash);
    const signature = Buffer.from(signatureBase64, "base64");
    const publicKey = Buffer.from(publicKeyHex, "hex");
    
    return ECPair.fromPublicKey(publicKey).verify(hash, signature);
  } catch (e) {
    return false;
  }
}
