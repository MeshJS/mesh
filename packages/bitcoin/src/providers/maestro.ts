import axios, { AxiosInstance } from "axios";
import { Network } from "../common";
import { IBitcoinProvider } from "../interfaces/provider";
import { parseHttpError } from "./common";
import { AddressInfo } from "../types/address-info";
import { ScriptInfo } from "../types/script-info";
import { TransactionsInfo } from "../types/transactions-info";
import { TransactionsStatus } from "../types/transactions-status";
import { UTxO, UTxO2 } from "../types";

export class MaestroProvider {
  private readonly _axiosInstance: AxiosInstance;

  constructor(network: Network = Network.Mainnet, apiKey: string) {
    this._axiosInstance = axios.create({
      baseURL: `https://xbt-${network}.gomaestro-api.org/v0`,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
    });
  }

  /**
   * Get information about an address.
   * @param address - The address.
   * @returns AddressInfo
   */
  async fetchAddress(address: string): Promise<AddressInfo> {
    try {
      throw new Error("Method not implemented.");
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Get transaction history for the specified address, sorted with newest first.
   * Returns up to 50 mempool transactions plus the first 25 confirmed transactions. You can request more confirmed transactions using `last_seen_txid`.
   * @param address - The address.
   * @param last_seen_txid - The last seen transaction ID (optional).
   * @returns TransactionsInfo[]
   */
  async fetchAddressTransactions(
    address: string,
    last_seen_txid?: string
  ): Promise<TransactionsInfo[]> {
    try {
      throw new Error("Method not implemented.");
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Get the list of unspent transaction outputs associated with the address.
   * @param address - The address.
   * @returns UTxO[]
   */
  async fetchAddressUTxOs(address: string): Promise<UTxO2[]> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `/addresses/${address}/utxos`
      );

      if (status === 200) {
        const utxos = data.data || [];

        return utxos.map((utxo: any) => ({
          txId: utxo.txid,
          satoshis: BigInt(utxo.satoshis),
          address: utxo.address,
          vout: Number.parseInt(utxo.vout, 10),
          block_height: utxo.height,
        })) as UTxO2[];
      }

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Get information about a scripthash.
   * @param hash - The hash of the script.
   * @returns ScriptInfo
   */
  async fetchScript(hash: string): Promise<ScriptInfo> {
    try {
      throw new Error("Method not implemented.");
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Get transaction history for the specified scripthash, sorted with newest first.
   * Returns up to 50 mempool transactions plus the first 25 confirmed transactions. You can request more confirmed transactions using `last_seen_txid`.
   * @param hash - The hash of the script.
   * @param last_seen_txid - The last seen transaction ID (optional).
   * @returns TransactionsInfo[]
   */
  async fetchScriptTransactions(
    hash: string,
    last_seen_txid?: string
  ): Promise<TransactionsInfo[]> {
    try {
      throw new Error("Method not implemented.");
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Get the list of unspent transaction outputs associated with the scripthash.
   * @param hash - The hash of the script.
   * @returns UTxO[]
   */
  async fetchScriptUTxOs(hash: string): Promise<UTxO[]> {
    try {
      throw new Error("Method not implemented.");
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Fetches the status of a transaction
   * @param txid - The transaction ID.
   * @returns TransactionsStatus
   */
  async fetchTransactionStatus(txid: string): Promise<TransactionsStatus> {
    try {
      throw new Error("Method not implemented.");
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Broadcast a raw transaction to the network.
   * The transaction should be provided as hex in the request body. The txid will be returned on success.
   * @param tx - The transaction in hex format.
   * @returns The transaction ID.
   */
  async submitTx(tx: string): Promise<string> {
    try {
      const { data, status } = await this._axiosInstance.post(
        "/rpc/transaction/submit",
        JSON.stringify(tx)
      );

      if (status === 201 && data) return data as string;
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
}
