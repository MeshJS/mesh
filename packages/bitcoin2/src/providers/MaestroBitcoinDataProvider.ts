/* eslint-disable @typescript-eslint/no-explicit-any, no-magic-numbers, sonarjs/no-identical-functions */
import axios, { AxiosInstance } from 'axios';
import {
  BlockchainDataProvider,
  BlockInfo,
  FeeEstimationMode,
  TransactionHistoryEntry,
  TransactionStatus,
  UTxO
} from './BitcoinDataProvider';
import { Network } from '../common';
import type { Cache } from '@cardano-sdk/util';
import { Logger } from 'ts-log';

const SATS_IN_BTC = 100_000_000;

const btcStringToSatoshisBigint = (btcString: string): bigint => {
  // Split the BTC string into integer and fractional parts.
  const [integerPart, fractionPart = ''] = btcString.split('.');
  // Ensure the fractional part has exactly 8 digits by padding with zeros (or trimming if too long).
  const paddedFraction = fractionPart.padEnd(8, '0').slice(0, 8);
  // Compute satoshis: integer part * 100,000,000 plus the fractional part interpreted as an integer.
  return BigInt(integerPart) * BigInt(SATS_IN_BTC) + BigInt(paddedFraction);
};

export class MaestroBitcoinDataProvider implements BlockchainDataProvider {
  private api: AxiosInstance;
  private cache: Cache<any>; // TODO: Create Maestro Transaction Model.
  private logger: Logger;

  constructor(token: string, cache: Cache<any>, logger: Logger, network: Network = Network.Mainnet) {
    this.cache = cache;
    this.logger = logger;
    this.api = axios.create({
      baseURL: `https://xbt-${network}.gomaestro-api.org/v0`,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': token
      }
    });
  }

  /**
   * Fetches basic information about the blockchain, including the current block height and hash.
   *
   * @returns {Promise<BlockInfo>} A promise that resolves with the current blockchain information.
   */
  async getLastKnownBlock(): Promise<BlockInfo> {
    const response = await this.api.get('/rpc/general/info');
    const blockHeight = response.data?.last_updated?.block_height || 0;
    const blockHash = response.data?.last_updated?.block_hash || '';
    return { height: blockHeight, hash: blockHash };
  }

  /**
   * Retrieves detailed information about a specific blockchain transaction by its hash.
   *
   * @param {string} txHash - The hash of the transaction to retrieve. This is typically a unique identifier
   * in hexadecimal format.
   * @returns {Promise<TransactionHistoryEntry>} A promise that resolves to a `TransactionHistoryEntry`.
   *
   * @throws {Error} Throws an error if the transaction cannot be retrieved, which might occur due to network issues,
   * incorrect transaction hash, or the transaction not existing in the blockchain.
   */
  async getTransaction(txHash: string): Promise<TransactionHistoryEntry> {
    const details = await this.getTransactionDetails(txHash);
    return {
      inputs: details.vin.map((input: any) => ({
        txId: input.txid,
        index: input.vout,
        address: input.address,
        satoshis: btcStringToSatoshisBigint(input.value.toString())
      })),
      outputs: details.vout.map((output: any) => ({
        address: output.address,
        satoshis: btcStringToSatoshisBigint(output.value.toString())
      })),
      transactionHash: txHash,
      confirmations: details.confirmations,
      status: TransactionStatus.Confirmed,
      blockHeight: details.blockheight,
      timestamp: details.blocktime
    };
  }

  /**
   * Fetches the transaction history for an address.
   */
  async getTransactions(
    address: string,
    afterBlockHeight?: number,
    limit = 50,
    cursor = ''
  ): Promise<{ transactions: TransactionHistoryEntry[]; nextCursor: string }> {
    const params: Record<string, any> = { count: limit, order: 'desc' };

    if (cursor !== undefined && cursor !== '') {
      params.cursor = cursor;
    }

    if (afterBlockHeight !== undefined) {
      params.from = afterBlockHeight;
    }

    try {
      const response = await this.api.get(`/addresses/${address}/txs`, { params });
      const transactions = response.data.data || [];
      const txDetails = await Promise.all(
        transactions.map(async (tx: any) => {
          const details = await this.getTransactionDetails(tx.tx_hash);
          return {
            inputs: details.vin.map((input: any) => ({
              txId: input.txid,
              index: input.vout,
              address: input.address,
              satoshis: btcStringToSatoshisBigint(input.value.toString())
            })),
            outputs: details.vout.map((output: any) => ({
              address: output.address,
              satoshis: btcStringToSatoshisBigint(output.value.toString())
            })),
            transactionHash: tx.tx_hash,
            confirmations: details.confirmations,
            status: TransactionStatus.Confirmed,
            blockHeight: details.blockheight,
            timestamp: details.blocktime
          };
        })
      );

      return {
        transactions: txDetails,
        nextCursor: response.data.next_cursor || ''
      };
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return { transactions: [], nextCursor: '' };
      }
      throw error;
    }
  }

  /**
   * Retrieves unconfirmed transactions (as transaction history entries) from the mempool for a given Bitcoin address.
   *
   * This function queries pending transactions associated with the specified Bitcoin address.
   * It returns an array of transaction history entries representing UTXOs that are currently unconfirmed.
   * Optionally, you can filter transactions to only include those observed after a specified block height.
   *
   * @param {string} address - The Bitcoin address or script pubkey to query for pending transactions.
   * @param {number} [afterBlockHeight] - Optional. Only include transactions observed after this block height.
   * @returns {Promise<TransactionHistoryEntry[]>} A promise that resolves to an array of transaction history entries from the mempool.
   */
  async getTransactionsInMempool(address: string, afterBlockHeight?: number): Promise<TransactionHistoryEntry[]> {
    const params: Record<string, any> = { from: afterBlockHeight };

    try {
      const response = await this.api.get(`/mempool/addresses/${address}/utxos`, { params });
      const transactions = response.data.data || [];

      const uniqueTransactions = transactions.filter(
        (tx: any, index: number, self: any[]) => index === self.findIndex((item) => item.txid === tx.txid)
      );

      return await Promise.all(
        uniqueTransactions
          .filter((tx: any) => tx.mempool)
          .map(async (tx: any) => {
            const details = await this.getTransactionDetails(tx.txid);
            return {
              inputs: details.vin.map((input: any) => ({
                txId: input.txid,
                index: input.vout,
                address: input.address,
                satoshis: btcStringToSatoshisBigint(input.value.toString())
              })),
              outputs: details.vout.map((output: any) => ({
                address: output.address,
                satoshis: btcStringToSatoshisBigint(output.value.toString())
              })),
              transactionHash: tx.txid,
              confirmations: -1,
              status: TransactionStatus.Pending,
              blockHeight: 0,
              timestamp: 0
            };
          })
      );
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetches the unspent transaction outputs (UTxOs) associated with a specified address.
   *
   * @returns {Promise<UTxO[]>} A promise that resolves with a list of UTxOs for the address.
   */
  async getUTxOs(address: string): Promise<UTxO[]> {
    try {
      const response = await this.api.get(`/addresses/${address}/utxos`);
      const utxos = response.data.data || [];
      return utxos.map((utxo: any) => ({
        txId: utxo.txid,
        index: Number.parseInt(utxo.vout, 10),
        satoshis: BigInt(utxo.satoshis),
        address: utxo.address
      }));
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Submits a raw transaction to the blockchain for inclusion in a block.
   *
   * @returns {Promise<string>} A promise that resolves with the transaction hash of the submitted transaction.
   */
  async submitTransaction(rawTransaction: string): Promise<string> {
    const endpoint = '/rpc/transaction/submit';

    try {
      const response = await this.api.post(endpoint, JSON.stringify(rawTransaction));

      if (response.status === 201 && response.data) {
        return response.data;
      }
      throw new Error(`Unexpected response status: ${response.status} - ${JSON.stringify(response.data)}`);
    } catch (error: any) {
      throw error.response
        ? new Error(`Transaction submission failed: ${error.response.data?.error || 'Unknown error'}`)
        : new Error('Transaction submission failed due to an unknown error.');
    }
  }

  /**
   * Fetches the status of a specified transaction by its hash.
   *
   * @returns {Promise<TransactionStatus>} A promise that resolves with the current status of the transaction.
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const response = await this.api.get(`/rpc/transaction/${txHash}`);
      const data = response.data;

      if (data.confirmations > 0) {
        return TransactionStatus.Confirmed;
      }
      return TransactionStatus.Pending;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return TransactionStatus.Dropped;
      }
      throw new Error(`Failed to fetch transaction status: ${error.message}`);
    }
  }

  /**
   * Estimates the transaction fee in satoshis per byte based on the desired confirmation time and fee estimation mode.
   *
   * This method queries a blockchain fee estimation service to determine the appropriate fee
   * rate required for a transaction to be confirmed within the specified number of blocks.
   *
   * @param {number} blocks - The target number of blocks within which the transaction should be confirmed.
   *                          A smaller number indicates a higher priority and typically results in a higher fee.
   *                          For example, `blocks = 1` requests a fee estimation for the next block confirmation.
   * @param {FeeEstimationMode} mode - The fee estimation mode, which determines the trade-off between
   *                                   reliability and cost:
   *                                   - `FeeEstimationMode.Conservative`: Prioritizes confirmation reliability.
   *                                   - `FeeEstimationMode.Economical`: Aims to minimize fees, with potentially slower confirmations.
   * @returns {Promise<number>} A promise that resolves to the estimated fee in satoshis per byte.
   *                            This value can be used to calculate the total transaction fee
   *                            based on the size of the transaction in bytes.
   */
  async estimateFee(blocks: number, mode: FeeEstimationMode): Promise<{ feeRate: number; blocks: number }> {
    try {
      const response = await this.api.get(`/rpc/transaction/estimatefee/${blocks}?mode=${mode}`);

      if (response.status !== 200) {
        throw new Error('Invalid response from fee estimation API.');
      }
      return { feeRate: response.data.data.feerate, blocks: response.data.data.blocks };
    } catch (error: any) {
      throw new Error(`Failed to estimate fee. Please try again later. ${error.message || error}`);
    }
  }

  /**
   * Fetches details of a specific transaction by its hash.
   */
  private async getTransactionDetails(txHash: string): Promise<any> {
    const cached = await this.cache.get(txHash);

    if (cached) {
      this.logger.debug(`Resolved TX ${txHash} from cache`);
      return cached;
    }

    const response = await this.api.get(`/rpc/transaction/${txHash}?verbose=true`);

    // Only cache transactions that are confirmed, we need to keep fetching
    // unconfirmed transaction to get their updated block time and height when they are confirmed.
    if (response.data.data.confirmations > 0) {
      void this.cache.set(txHash, response.data.data);
    }

    return response.data.data;
  }
}
