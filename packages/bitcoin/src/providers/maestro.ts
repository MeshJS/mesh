import axios, { AxiosInstance } from "axios";
import { IBitcoinProvider } from "../interfaces/provider";
import { UTxO, AddressInfo, ScriptInfo, TransactionsInfo, TransactionsStatus } from "../types";
import { MaestroSupportedNetworks, MaestroConfig, SatoshiActivityResponse, BalanceResponse } from "../types/maestro";
import { parseHttpError } from "./common";

/**
 * Maestro provider for Bitcoin operations.
 */
export class MaestroProvider implements IBitcoinProvider {
    private readonly _axiosInstance: AxiosInstance;
    private readonly _network: MaestroSupportedNetworks;

    /**
     * Create provider with custom base URL (for proxy endpoints).
     * @param baseUrl - The base URL of the proxy endpoint.
     * @param apiKey - The API key for the proxy.
     */
    constructor(baseUrl: string, apiKey: string);

    /**
     * Create provider with Maestro configuration.
     * @param config - The Maestro configuration object.
     */
    constructor(config: MaestroConfig);

    constructor(...args: unknown[]) {
        if (
            typeof args[0] === "string" &&
            (args[0].startsWith("http") || args[0].startsWith("/"))
        ) {
            this._axiosInstance = axios.create({
                baseURL: args[0],
                headers: { "api-key": args[1] as string },
            });
            this._network = args[0].includes("testnet") ? "testnet" : "mainnet";
        } else {
            const { network, apiKey } = args[0] as MaestroConfig;
            this._axiosInstance = axios.create({
                baseURL: `https://xbt-${network}.gomaestro-api.org/v0`,
                headers: { "api-key": apiKey },
            });
            this._network = network;
        }
    }

    /**
     * Get information about a script hash.
     * @param hash - The script hash.
     * @returns ScriptInfo
     * @note Maestro does not have any endpoint available for this yet
     */
    async fetchScript(hash: string): Promise<ScriptInfo> {
        throw new Error(
            "fetchScript is not implemented - Maestro does not have any endpoint available for this yet",
        );
    }

    /**
     * Get transaction history for the specified script hash, sorted with newest first.
     * @param hash - The script hash.
     * @param last_seen_txid - The last seen transaction ID (optional).
     * @returns TransactionsInfo[]
     * @note Maestro does not have any endpoint available for this yet
     */
    async fetchScriptTransactions(
        hash: string,
        last_seen_txid?: string,
    ): Promise<TransactionsInfo[]> {
        throw new Error(
            "fetchScriptTransactions is not implemented - Maestro does not have any endpoint available for this yet",
        );
    }

    /**
     * Get the list of unspent transaction outputs associated with the script hash.
     * @param hash - The script hash.
     * @returns UTxO[]
     * @note Maestro does not have any endpoint available for this yet
     */
    async fetchScriptUTxOs(hash: string): Promise<UTxO[]> {
        throw new Error(
            "fetchScriptUTxOs is not implemented - Maestro does not have any endpoint available for this yet",
        );
    }

    /**
     * Get information about an address.
     * @param address - The address.
     * @returns AddressInfo
     */
    async fetchAddress(address: string): Promise<AddressInfo> {
        try {
            const { data, status } = await this._axiosInstance.get(
                `/esplora/address/${address}`,
            );

            if (status === 200) return data as AddressInfo;
            throw parseHttpError(data);
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
        last_seen_txid?: string,
    ): Promise<TransactionsInfo[]> {
        try {
            const url = last_seen_txid
                ? `/esplora/address/${address}/txs/chain/${last_seen_txid}`
                : `/esplora/address/${address}/txs`;
            const { data, status } = await this._axiosInstance.get(url);

            if (status === 200) return data as TransactionsInfo[];
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get the list of unspent transaction outputs associated with the address.
     * @param address - The address.
     * @returns UTxO[]
     */
    async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
        try {
            const { data, status } = await this._axiosInstance.get(
                `/esplora/address/${address}/utxo`,
            );

            if (status === 200) return data as UTxO[];
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get the spending status of a transaction output.
     * @param txid - The transaction ID.
     * @returns TransactionsStatus
     */
    async fetchTransactionStatus(txid: string): Promise<TransactionsStatus> {
        try {
            const { data, status } = await this._axiosInstance.get(
                `/esplora/tx/${txid}/status`,
            );

            if (status === 200) return data as TransactionsStatus;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Broadcast a raw transaction to the network.
     * @param txHex - The raw transaction in hexadecimal format.
     * @returns The transaction ID.
     */
    async submitTx(txHex: string): Promise<string> {
        try {
            const { data, status } = await this._axiosInstance.post(
                "/esplora/tx",
                txHex,
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );

            if (status === 200) return data.txid || data;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get fee estimates for Bitcoin transactions.
     * @param blocks - The number of blocks to estimate fees for (default: 6).
     * @returns FeeEstimateResponse containing the estimated fee rate.
     */
    async fetchFeeEstimates(blocks: number = 6): Promise<number> {
        try {
            const { data, status } = await this._axiosInstance.get(
                `/rpc/transaction/estimatefee/${blocks}`,
            );

            if (status === 200) return data.data.feerate;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    // Additional Bitcoin-specific methods (beyond IBitcoinProvider)
    /**
     * Fetch satoshi activity for a Bitcoin address (transaction history).
     * @param address - The Bitcoin address.
     * @param options - Optional parameters for filtering and pagination.
     * @param options.order - Sort order ('asc' or 'desc').
     * @param options.count - Maximum number of results to return.
     * @param options.from - Start block height.
     * @param options.to - End block height.
     * @param options.cursor - Pagination cursor.
     * @returns SatoshiActivityResponse containing transaction activity data.
     */
    async fetchSatoshiActivity(
        address: string,
        options: {
            order?: "asc" | "desc";
            count?: number;
            from?: number;
            to?: number;
            cursor?: string;
        } = {},
    ): Promise<SatoshiActivityResponse> {
        const params = new URLSearchParams();

        Object.entries(options).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                params.append(key, value.toString());
            }
        });

        const queryString = params.toString();
        const url = `/addresses/${address}/activity${queryString ? `?${queryString}` : ""}`;

        try {
            const { data, status } = await this._axiosInstance.get(url);

            if (status === 200) return data as SatoshiActivityResponse;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get transaction details by hash.
     * @param hash - The transaction hash.
     * @returns TransactionsInfo containing transaction details.
     */
    async fetchTxInfo(hash: string): Promise<TransactionsInfo> {
        try {
            const { data, status } = await this._axiosInstance.get(
                `/esplora/tx/${hash}`,
            );

            if (status === 200) return data as TransactionsInfo;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get address balance (raw response).
     * @param address - The Bitcoin address.
     * @returns BalanceResponse containing the raw balance data.
     */
    async fetchAddressBalance(address: string): Promise<BalanceResponse> {
        try {
            const { data, status } = await this._axiosInstance.get(
                `/addresses/${address}/balance`,
            );

            if (status === 200) return data as BalanceResponse;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get balance for a Bitcoin address (convenience method).
     * @param address - The Bitcoin address.
     * @returns The balance as a bigint in satoshis.
     */
    async getBalance(address: string): Promise<bigint> {
        const balanceResponse = await this.fetchAddressBalance(address);
        return BigInt(balanceResponse.data);
    }

    /**
     * Generic GET request for Bitcoin API endpoints.
     * @param url - The API endpoint URL.
     * @returns The response data.
     */
    async get(url: string): Promise<any> {
        try {
            const { data, status } = await this._axiosInstance.get(url);

            if (status === 200) return data;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Generic POST request for Bitcoin API endpoints.
     * @param url - The API endpoint URL.
     * @param body - The request body data.
     * @returns The response data.
     */
    async post(url: string, body: any): Promise<any> {
        try {
            const { data, status } = await this._axiosInstance.post(url, body, {
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (status === 200) return data;
            throw parseHttpError(data);
        } catch (error) {
            throw parseHttpError(error);
        }
    }

    /**
     * Get the network this provider is configured for.
     * @returns The network configuration (mainnet or testnet).
     */
    getNetwork(): MaestroSupportedNetworks {
        return this._network;
    }
}
