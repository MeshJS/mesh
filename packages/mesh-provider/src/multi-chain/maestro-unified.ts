import { MaestroProvider as CardanoMaestroProvider, type MaestroSupportedNetworks as CardanoMaestroNetworks } from "../maestro";
import {
  MaestroProvider as BitcoinMaestroProvider,
  MaestroSupportedNetworks as BitcoinMaestroNetworks,
  TransactionsInfo as BitcoinTransactionInfo,
  UTxO as BitcoinUTxO,
  AddressInfo as BitcoinAddressInfo,
  TransactionsStatus as BitcoinTransactionStatus
} from "@meshsdk/bitcoin";
import type { TransactionInfo as CardanoTransactionInfo, UTxO as CardanoUTxO, IFetcherOptions } from "@meshsdk/common";

export type MaestroConfig =
  | { chain: "cardano"; apiKey: string; network: CardanoMaestroNetworks; turboSubmit?: boolean }
  | { chain: "bitcoin"; apiKey: string; network: BitcoinMaestroNetworks };

/**
 * Unified Maestro provider that supports both Cardano and Bitcoin operations.
 * Chain is specified in the constructor
 *
 * @example
 * ```typescript
 * // Cardano provider
 * const cardanoMaestro = new MaestroProvider({
 *   chain: "cardano",
 *   apiKey: "your-maestro-api-key",
 *   network: "Mainnet",
 *   turboSubmit: true
 * });
 *
 * // Bitcoin provider
 * const bitcoinMaestro = new MaestroProvider({
 *   chain: "bitcoin",
 *   apiKey: "your-maestro-api-key",
 *   network: "mainnet"
 * });
 *
 * // Clean unified API
 * const cardanoTxs = await cardanoMaestro.getAddressTxs(address);
 * const bitcoinUTxOs = await bitcoinMaestro.getAddressUTxOs(address);
 * ```
 */
export class MaestroMultiChainProvider {
  private _cardanoProvider?: CardanoMaestroProvider;
  private _bitcoinProvider?: BitcoinMaestroProvider;
  private _chain: "cardano" | "bitcoin";

  /**
   * Create a Maestro provider for the specified chain.
   * @param config - Chain-specific configuration object.
   */
  constructor(config: MaestroConfig) {
    this._chain = config.chain;

    if (config.chain === "cardano") {
      this._cardanoProvider = new CardanoMaestroProvider({
        network: config.network,
        apiKey: config.apiKey,
        turboSubmit: config.turboSubmit
      });
    } else if (config.chain === "bitcoin") {
      this._bitcoinProvider = new BitcoinMaestroProvider({
        network: config.network,
        apiKey: config.apiKey
      });
    }
  }

  /**
   * Get address transactions.
   * @param address - The address to query.
   * @param options - For Cardano: IFetcherOptions, for Bitcoin: lastSeenTxId string.
   * @returns Promise of transaction array (type depends on chain).
   */
  async getAddressTxs(address: string, options?: IFetcherOptions | string): Promise<CardanoTransactionInfo[] | BitcoinTransactionInfo[]> {
    if (this._chain === "cardano") {
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      // For Cardano, options should be IFetcherOptions or undefined
      const cardanoOptions = typeof options === 'string' ? undefined : options;
      return this._cardanoProvider.fetchAddressTxs(address, cardanoOptions);
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      // For Bitcoin, options should be the lastSeenTxId string
      const lastSeenTxId = typeof options === 'string' ? options : undefined;
      return await this._bitcoinProvider.fetchAddressTransactions(address, lastSeenTxId);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Get address UTXOs.
   * @param address - The address to query.
   * @returns Promise of UTXO array (type depends on chain).
   */
  async getAddressUTxOs(address: string): Promise<CardanoUTxO[] | BitcoinUTxO[]> {
    if (this._chain === "cardano") {
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      return this._cardanoProvider.fetchAddressUTxOs(address);
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return await this._bitcoinProvider.fetchAddressUTxOs(address);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Get address information including balance, transaction count, and UTXO statistics.
   * Available for Bitcoin only - Cardano doesn't have this endpoint.
   * @param address - The Bitcoin address to query.
   * @returns Promise of address info with chain_stats and mempool_stats.
   */
  async getAddressInfo(address: string): Promise<BitcoinAddressInfo> {
    if (this._chain !== "bitcoin") {
      throw new Error("Address info is only supported for Bitcoin chain. Cardano doesn't have this endpoint.");
    }

    if (!this._bitcoinProvider) {
      throw new Error("Bitcoin provider not initialized.");
    }

    return await this._bitcoinProvider.fetchAddress(address);
  }

  /**
   * Submit a transaction.
   * @param txData - The transaction data (format depends on chain).
   * @returns Promise of transaction ID.
   */
  async submitTx(txData: string): Promise<string> {
    if (this._chain === "cardano") {
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      return this._cardanoProvider.submitTx(txData);
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return this._bitcoinProvider.submitTx(txData);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Get the configured chain.
   * @returns The chain this provider is configured for.
   */
  getChain(): "cardano" | "bitcoin" {
    return this._chain;
  }

  /**
   * Get transaction details by hash.
   * @param txHash - The transaction hash.
   * @returns Promise of transaction details (type depends on chain).
   */
  async getTxInfo(txHash: string): Promise<CardanoTransactionInfo | BitcoinTransactionInfo> {
    if (this._chain === "cardano") {
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      return this._cardanoProvider.fetchTxInfo(txHash);
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return await this._bitcoinProvider.fetchTxInfo(txHash);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Get transaction status/confirmation details.
   * @param txHash - The transaction hash.
   * @returns Promise of transaction status (type depends on chain).
   */
  async getTxStatus(txHash: string): Promise<{ confirmed: boolean; details: CardanoTransactionInfo } | BitcoinTransactionStatus> {
    if (this._chain === "cardano") {
      // Cardano uses fetchTxInfo which includes status in the response
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      const txInfo = await this._cardanoProvider.fetchTxInfo(txHash);
      return { confirmed: true, details: txInfo };
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return await this._bitcoinProvider.fetchTransactionStatus(txHash);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Get the configured network.
   * @returns The network configuration.
   */
  async getNetwork(): Promise<string> {
    if (this._chain === "cardano") {
      // Cardano provider doesn't expose network publicly
      return "cardano-network";
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return this._bitcoinProvider.getNetwork();
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Generic GET request to chain-specific API endpoints.
   * @param url - The API endpoint URL (relative to the chain's base URL).
   * @returns The response data.
   */
  async get(url: string): Promise<any> {
    if (this._chain === "cardano") {
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      return this._cardanoProvider.get(url);
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return this._bitcoinProvider.get(url);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }

  /**
   * Generic POST request to chain-specific API endpoints.
   * @param url - The API endpoint URL (relative to the chain's base URL).
   * @param body - The request body data.
   * @returns The response data.
   */
  async post(url: string, body: any): Promise<any> {
    if (this._chain === "cardano") {
      if (!this._cardanoProvider) {
        throw new Error("Cardano provider not initialized.");
      }
      return this._cardanoProvider.post(url, body);
    }

    if (this._chain === "bitcoin") {
      if (!this._bitcoinProvider) {
        throw new Error("Bitcoin provider not initialized.");
      }
      return this._bitcoinProvider.post(url, body);
    }

    throw new Error(`Unsupported chain: ${this._chain}`);
  }
}