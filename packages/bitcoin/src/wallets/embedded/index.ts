import type { Network } from "bitcoinjs-lib";
import { BIP32Interface } from "bip32";
import { mnemonicToSeedSync, validateMnemonic } from "bip39";
import { bip32, bip39, bitcoin, ECPair } from "../../core";
import { IBitcoinProvider } from "../../interfaces/provider";
import { UTxO } from "../../types/utxo";
import {
  CreateWalletOptions,
  GetAddressResult,
  GetBalanceResult,
  SendTransferParams,
  SendTransferResult,
  SignMessageParams,
  SignMessageResult,
  SignMultipleTransactionsParams,
  SignPsbtParams,
  SignPsbtResult,
} from "../../types/wallet";
import { resolveAddress } from "../../utils";

/**
 * EmbeddedWallet is a class that provides a simple interface to interact with Bitcoin wallets.
 */
export class EmbeddedWallet {
  private readonly _network: Network;
  private readonly _wallet?: BIP32Interface;
  private readonly _provider?: IBitcoinProvider;
  private readonly _isReadOnly: boolean;
  private readonly _address?: string;

  constructor(options: CreateWalletOptions) {
    switch (options.network) {
      case "Testnet":
        this._network = bitcoin.networks.testnet;
        break;
      case "Regtest":
        this._network = bitcoin.networks.regtest;
        break;
      case "Mainnet":
      default:
        this._network = bitcoin.networks.bitcoin;
        break;
    }

    if (options.key.type === "mnemonic") {
      this._wallet = _derive(
        options.key.words,
        options.path ?? "m/84'/0'/0'/0/0",
        this._network,
      );
      this._isReadOnly = false;
    } else {
      // Read-only wallet initialized with just an address
      this._address = options.key.address;
      this._isReadOnly = true;
    }

    this._provider = options.provider;
  }

  /**
   * Returns the wallet's Bitcoin addresses following Xverse API format.
   *
   * @param purposes Array of address purposes to request:
   *   - `'ordinals'` for managing ordinals (should return P2TR taproot address)
   *   - `'payment'` for managing bitcoin (returns P2WPKH address)
   *   TODO: Should follow Xverse docs to return taproot address for ordinals purpose
   * @param message Optional message to display in request prompt (ignored for embedded wallets)
   * @returns {Promise<GetAddressResult[]>} Array of address objects with address, publicKey, purpose, addressType, network, and walletType
   * @throws {Error} If wallet is not properly initialized.
   */
  async getAddresses(
    purposes?: Array<"payment" | "ordinals">,
    message?: string,
  ): Promise<GetAddressResult[]> {
    // TODO: Implement full Xverse API compliance
    // - Default to both purposes if not specified: ["payment", "ordinals"]
    // - Generate payment address (P2WPKH) when "payment" is requested
    // - Generate ordinals address (P2TR - Taproot) when "ordinals" is requested
    // - Filter addresses based on requested purposes
    //
    // Note: `message` parameter is used by Xverse to show custom prompts to users,
    // but embedded wallets don't have UI prompts, so this parameter is ignored here

    if (this._isReadOnly && this._address) {
      return [
        {
          address: this._address,
          publicKey: "", // Not available for read-only wallets
          purpose: "payment",
          addressType: "p2wpkh",
          network: this._getNetworkString(),
          walletType: "software",
        },
      ];
    }

    if (!this._wallet) {
      throw new Error("Wallet not initialized properly.");
    }

    const addressInfo = resolveAddress(this._wallet.publicKey, this._network);
    return [
      {
        address: addressInfo.address,
        publicKey:
          addressInfo.publicKey || this._wallet.publicKey.toString("hex"),
        purpose: "payment",
        addressType: addressInfo.addressType,
        network: this._getNetworkString(),
        walletType: "software",
      },
    ];
  }

  /**
   * Returns the hex-encoded public key of the wallet.
   *
   * @returns {string} The public key in hexadecimal format.
   * @throws {Error} If the wallet is read-only and public key is not available.
   */
  getPublicKey(): string {
    if (this._isReadOnly) {
      throw new Error("Public key is not available for read-only wallets.");
    }

    if (!this._wallet) {
      throw new Error("Wallet not initialized properly.");
    }

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
   * Returns the network type as a string for API responses.
   */
  private _getNetworkString(): "mainnet" | "testnet" | "regtest" {
    if (this._network === bitcoin.networks.testnet) return "testnet";
    if (this._network === bitcoin.networks.regtest) return "regtest";
    return "mainnet";
  }

  /**
   * Get UTXOs for the wallet address.
   * @returns An array of UTXOs.
   */
  async getUTxOs(): Promise<UTxO[]> {
    const address = await this.getAddresses();
    if (this._provider === undefined) {
      throw new Error("`provider` is not defined. Provide a BitcoinProvider.");
    }

    return await this._provider.fetchAddressUTxOs(address[0].address);
  }

  /**
   * Signs a message following Xverse API format.
   *
   * @param params - Object containing address, message, and optional protocol
   * @returns Promise resolving to signature result
   * @throws {Error} If the wallet is read-only or private key is not available.
   */
  async signMessage(params: SignMessageParams): Promise<SignMessageResult> {
    const { address, message, protocol = "ECDSA" } = params;

    // TODO: Implement BIP322 support for message signing
    if (protocol === "BIP322") {
      throw new Error(
        "BIP322 protocol is not yet supported. Only ECDSA is currently available.",
      );
    }

    if (this._isReadOnly) {
      throw new Error("Cannot sign data with a read-only wallet.");
    }

    if (!this._wallet || !this._wallet.privateKey) {
      throw new Error("Private key is not available for signing.");
    }

    // TODO: This uses legacy message signing format which may not be appropriate for SegWit addresses
    // Since we're using BIP84 derivation path (m/84'/0'/0'/0/0) for native SegWit (P2WPKH),
    // we should implement BIP322 message signing for proper SegWit address ownership proof

    // Create ECPair from private key
    const keyPair = ECPair.fromPrivateKey(this._wallet.privateKey, {
      compressed: true,
    });
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

    return {
      signature: signature.toString("base64"),
      messageHash: hash.toString("hex"),
      address: address,
    };
  }

  /**
   * Sign a PSBT following Xverse API format.
   * @param params - Object containing PSBT and signing instructions
   * @returns Promise resolving to signed PSBT result
   * @throws {Error} If the wallet is read-only or private key is not available.
   */
  async signPsbt(params: SignPsbtParams): Promise<SignPsbtResult> {
    const { psbt: psbtBase64, signInputs, broadcast = false } = params;
    if (this._isReadOnly) {
      throw new Error("Cannot sign transactions with a read-only wallet.");
    }

    if (!this._wallet || !this._wallet.privateKey) {
      throw new Error("Private key is not available for signing.");
    }

    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, {
      network: this._network,
    });

    const ecPair = ECPair.fromPrivateKey(this._wallet.privateKey, {
      network: this._network,
    });

    // Sign the specified inputs
    const allInputIndexes = Object.values(signInputs).flat();
    allInputIndexes.forEach((inputIndex) => {
      psbt.signInput(inputIndex, this._wallet!);
      psbt.validateSignaturesOfInput(
        inputIndex,
        (pubkey, hash, signature) =>
          ecPair.publicKey.equals(pubkey) && ecPair.verify(hash, signature),
      );
    });

    const signedPsbt = psbt.toBase64();

    if (broadcast) {
      if (!this._provider) {
        throw new Error(
          "`provider` is not defined. Provide a BitcoinProvider for broadcasting.",
        );
      }

      psbt.finalizeAllInputs();
      const txHex = psbt.extractTransaction().toHex();
      const txid = await this._provider.submitTx(txHex);

      return {
        psbt: signedPsbt,
        txid: txid,
      };
    }

    return {
      psbt: signedPsbt,
    };
  }

  /**
   * Send Bitcoin to recipients following Xverse API format.
   * @param params - Object containing recipients array
   * @returns Promise resolving to transaction result
   * @throws {Error} If the wallet is read-only or provider is not available.
   */
  async sendTransfer(params: SendTransferParams): Promise<SendTransferResult> {
    if (this._isReadOnly) {
      throw new Error("Cannot send transactions with a read-only wallet.");
    }

    if (!this._provider) {
      throw new Error("`provider` is not defined. Provide a BitcoinProvider for sending.");
    }

    if (!this._wallet) {
      throw new Error("Wallet not initialized properly.");
    }

    const { recipients } = params;

    const [addresses, utxos] = await Promise.all([
      this.getAddresses(),
      this.getUTxOs(),
    ]);

    const walletAddress = addresses[0].address;
    const psbt = await this._buildTransferPsbt(
      utxos,
      recipients,
      walletAddress,
    );

    // Sign and broadcast using signPsbt
    const inputCount = psbt.inputCount;
    const signInputs: Record<string, number[]> = {
      [walletAddress]: Array.from({ length: inputCount }, (_, i) => i),
    };

    const signResult = await this.signPsbt({
      psbt: psbt.toBase64(),
      signInputs,
      broadcast: true,
    });

    return { txid: signResult.txid! };
  }

  /**
   * Get wallet balance following Xverse API format.
   * @returns Promise resolving to balance information
   * @throws {Error} If provider is not available.
   */
  async getBalance(): Promise<GetBalanceResult> {
    if (!this._provider) {
      throw new Error(
        "`provider` is not defined. Provide a BitcoinProvider for balance.",
      );
    }

    const addresses = await this.getAddresses();
    const address = addresses[0].address;

    const addressInfo = await this._provider.fetchAddress(address);
    const confirmed = addressInfo.chain_stats.funded_txo_sum - addressInfo.chain_stats.spent_txo_sum;
    const unconfirmed = addressInfo.mempool_stats.funded_txo_sum - addressInfo.mempool_stats.spent_txo_sum;
    const total = confirmed + unconfirmed;

    return {
      confirmed: confirmed.toString(),
      unconfirmed: unconfirmed.toString(),
      total: total.toString(),
    };
  }

  /**
   * Sign multiple transactions (Xverse custom method).
   * @param params - Object containing network, message, and PSBTs array
   * @returns Promise resolving to signed PSBTs
   * @throws {Error} If the wallet is read-only or private key is not available.
   */
  async signMultipleTransactions(
    params: SignMultipleTransactionsParams,
  ): Promise<SignPsbtResult[]> {
    if (!this._wallet || !this._wallet.privateKey) {
      throw new Error("Private key is not available for signing.");
    }

    const { psbts } = params;
    const results: SignPsbtResult[] = [];

    for (const psbtInfo of psbts) {
      const psbt = bitcoin.Psbt.fromBase64(psbtInfo.psbtBase64, {
        network: this._network,
      });

      // Sign all specified input indexes
      const inputIndexes = psbtInfo.inputsToSign.flatMap(
        (input) => input.signingIndexes,
      );
      inputIndexes.forEach((index) => psbt.signInput(index, this._wallet!));

      results.push({
        psbt: psbt.toBase64(),
      });
    }

    return results;
  }

  /**
   * Simple largest-first coin selection algorithm.
   * Selects UTXOs in descending order by value until target amount + fees is reached.
   * 
   * @param utxos Available UTXOs
   * @param targetAmount Amount needed in satoshis
   * @param feeRate Fee rate in sat/vByte
   * @returns Selected UTXOs and change amount
   */
  private _selectUtxosLargestFirst(utxos: UTxO[], targetAmount: number, feeRate: number): 
    { selectedUtxos: UTxO[], change: number } {
    
    // Sort UTXOs by value (descending) - largest first
    const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);
    
    let selectedValue = 0;
    const selectedUtxos: UTxO[] = [];
    
    // Accumulate UTXOs until we have enough
    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo);
      selectedValue += utxo.value;
      
      // Calculate fee with current selection (rough estimate)
      const estimatedTxSize = selectedUtxos.length * 150 + 2 * 34 + 10; // inputs + outputs + overhead
      const fee = Math.ceil(estimatedTxSize * feeRate);
      
      // Check if we have enough
      if (selectedValue >= targetAmount + fee) {
        const finalFee = Math.ceil((selectedUtxos.length * 150 + 2 * 34 + 10) * feeRate);
        const change = selectedValue - targetAmount - finalFee;
        return { selectedUtxos, change };
      }
    }
    
    throw new Error("Insufficient funds for transaction.");
  }

  /**
   * Build PSBT for transfer using optimal coin selection.
   * @param utxos Available UTXOs
   * @param recipients Transfer recipients
   * @param walletAddress Wallet address for change
   * @returns Built PSBT ready for signing
   */
  private async _buildTransferPsbt(
    utxos: UTxO[],
    recipients: any[],
    walletAddress: string,
  ): Promise<bitcoin.Psbt> {
    let feeRate = 10; // Default fallback
    if (this._provider) {
      try {
        feeRate = await this._provider.fetchFeeEstimates(6);
      } catch (error) {
        console.warn("Fee estimation failed, using default rate:", error);
      }
    }

    // Use simple largest-first coin selection
    const targetAmount = recipients.reduce((sum, r) => sum + r.amount, 0);
    const { selectedUtxos, change } = this._selectUtxosLargestFirst(utxos, targetAmount, feeRate);
    const psbt = new bitcoin.Psbt({ network: this._network });
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: this._wallet!.publicKey,
      network: this._network,
    });

    selectedUtxos.forEach(utxo => {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: { script: p2wpkh.output!, value: utxo.value },
      });
    });

    recipients.forEach(recipient => {
      psbt.addOutput({ address: recipient.address, value: recipient.amount });
    });

    if (change > 0) {
      psbt.addOutput({ address: walletAddress, value: change });
    }

    return psbt;
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
        "Invalid strength. Must be one of: 128, 160, 192, 224, 256.",
      );
    }

    const mnemonic = bip39.generateMnemonic(strength);
    return mnemonic.split(" ");
  }
}

function _derive(
  words: string[],
  path: string = "m/84'/0'/0'/0/0",
  network?: Network,
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
  publicKeyHex: string,
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
