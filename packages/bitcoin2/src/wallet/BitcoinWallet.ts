/* eslint-disable no-magic-numbers, unicorn/no-null, unicorn/prefer-array-some, @typescript-eslint/explicit-module-boundary-types */
import {
  BlockchainDataProvider,
  BlockchainInputResolver,
  BlockInfo,
  InputResolver,
  TransactionHistoryEntry,
  UTxO
} from './../providers';
import {
  AddressType,
  BitcoinWalletInfo,
  ChainType,
  deriveAddressByType,
  deriveChildPublicKey,
  DerivedAddress,
  getNetworkKeys,
  Network
} from '../common';
import { Logger } from 'ts-log';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import isEqual from 'lodash/isEqual';
import { historyEntryFromRawTx } from '../tx-builder/utils';
import { FeeMarketProvider } from './FeeMarketProvider';

bitcoin.initEccLib(ecc);

/**
 * Represents the fee market for estimating transaction fees.
 */
export type FeeMarket = {
  /**
   * The fee rate in satoshis per byte.
   */
  feeRate: number;

  /**
   * The confirmation target time in seconds.
   * This represents the estimated time within which the transaction is expected to be confirmed.
   */
  targetConfirmationTime: number;
};

/**
 * Represents the estimated fees for different transaction speeds.
 *
 * The estimated fees are categorized into three tiers: `fast`, `standard`, and `slow`.
 * Each tier includes the fee rate (in satoshis per byte) and the expected confirmation
 * time (in seconds).
 */
export type EstimatedFees = {
  /**
   * Fast tier: The fee and confirmation time for transactions requiring
   * high priority and the fastest possible confirmation.
   */
  fast: FeeMarket;

  /**
   * Standard tier: The fee and confirmation time for transactions with
   * average priority, balancing cost and confirmation speed.
   */
  standard: FeeMarket;

  /**
   * Slow tier: The fee and confirmation time for transactions with
   * low priority, suitable for non-urgent transfers.
   */
  slow: FeeMarket;
};

export interface SyncStatus {
  isAnyRequestPending: boolean;
  isUpToDate: boolean;
  isSettled: boolean;
  shutdown(): void;
}

export type WalletEventCallback<T> = (data: T) => void;

export interface WalletEventHandlers {
  onTransactionHistoryUpdate?: WalletEventCallback<TransactionHistoryEntry[]>;
  onPendingTransactionsUpdate?: WalletEventCallback<TransactionHistoryEntry[]>;
  onUtxosUpdate?: WalletEventCallback<UTxO[]>;
  onBalanceUpdate?: WalletEventCallback<bigint>;
  onAddressesUpdate?: WalletEventCallback<DerivedAddress[]>;
}

export class BitcoinWallet {
  private pollIntervalId: NodeJS.Timeout | null = null;
  private lastKnownBlock: BlockInfo | null = null;
  private readonly pollInterval: number;
  private readonly historyDepth: number;
  private provider: BlockchainDataProvider;
  private info: BitcoinWalletInfo;
  private network: Network;
  private address: DerivedAddress;
  private pollEnabled: boolean = true;
  private logger: Logger;
  private inputResolver: InputResolver;
  private readonly feeMarketProvider: FeeMarketProvider;
  private eventHandlers: WalletEventHandlers = {};

  public syncStatus: SyncStatus;

  // Wallet state - use getters instead of observables
  private _transactionHistory: TransactionHistoryEntry[] = [];
  private _pendingTransactions: TransactionHistoryEntry[] = [];
  private _utxos: UTxO[] = [];
  private _balance: bigint = BigInt(0);
  private _addresses: DerivedAddress[] = [];

  // Getters for accessing current state
  public get transactionHistory(): TransactionHistoryEntry[] {
    return [...this._transactionHistory];
  }

  public get pendingTransactions(): TransactionHistoryEntry[] {
    return [...this._pendingTransactions];
  }

  public get utxos(): UTxO[] {
    return [...this._utxos];
  }

  public get balance(): bigint {
    return this._balance;
  }

  public get addresses(): DerivedAddress[] {
    return [...this._addresses];
  }

  // Event handler management
  public setEventHandlers(handlers: WalletEventHandlers): void {
    this.eventHandlers = { ...handlers };
  }

  // Helper methods to update state and trigger callbacks
  private setTransactionHistory(history: TransactionHistoryEntry[]): void {
    this._transactionHistory = [...history];
    this.eventHandlers.onTransactionHistoryUpdate?.(this._transactionHistory);
  }

  private setPendingTransactions(pending: TransactionHistoryEntry[]): void {
    this._pendingTransactions = [...pending];
    this.eventHandlers.onPendingTransactionsUpdate?.(this._pendingTransactions);
  }

  private setUtxos(utxos: UTxO[]): void {
    this._utxos = [...utxos];
    this.eventHandlers.onUtxosUpdate?.(this._utxos);
    // Update balance when UTXOs change
    const newBalance = utxos.reduce((total, utxo) => total + utxo.satoshis, BigInt(0));
    this.setBalance(newBalance);
  }

  private setBalance(balance: bigint): void {
    this._balance = balance;
    this.eventHandlers.onBalanceUpdate?.(this._balance);
  }

  private setAddresses(addresses: DerivedAddress[]): void {
    this._addresses = [...addresses];
    this.eventHandlers.onAddressesUpdate?.(this._addresses);
  }

  // eslint-disable-next-line max-params
  constructor(
    provider: BlockchainDataProvider,
    feeMarketProvider: FeeMarketProvider,
    pollInterval = 30_000,
    historyDepth = 20,
    info: BitcoinWalletInfo,
    network: Network = Network.Testnet,
    pollEnabled: boolean = true,
    logger: Logger
  ) {
    const bitcoinNetwork = network === Network.Mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    this.pollEnabled = pollEnabled;
    this.logger = logger;
    this.network = network;
    this.pollInterval = pollInterval;
    this.historyDepth = historyDepth;
    this.provider = provider;
    this.info = info;
    this.syncStatus = {
      // TODO: Track actual sync status
      isAnyRequestPending: false,
      isUpToDate: true,
      isSettled: true,
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      shutdown: () => {}
    };

    // TODO: Allow this to be injected.
    this.inputResolver = new BlockchainInputResolver(provider);
    this.feeMarketProvider = feeMarketProvider;

    const networkKeys = getNetworkKeys(info, network);
    const extendedAccountPubKey = networkKeys.nativeSegWit;
    const pubKey = deriveChildPublicKey(extendedAccountPubKey, ChainType.External, 0);
    const address = deriveAddressByType(pubKey, AddressType.NativeSegWit, bitcoinNetwork);

    this.address = {
      address,
      addressType: AddressType.NativeSegWit,
      network,
      account: this.info.accountIndex,
      chain: ChainType.External,
      index: 0,
      publicKeyHex: Buffer.from(pubKey).toString('hex')
    };

    this.setAddresses([this.address]);
    this.startPolling();
  }

  public async getInfo(): Promise<BitcoinWalletInfo> {
    return this.info;
  }

  public async getNetwork(): Promise<Network> {
    return this.network;
  }

  public async getAddress(): Promise<DerivedAddress> {
    return this.address;
  }

  /**
   * Fetches the current fee market for estimating transaction fees.
   */
  public async getCurrentFeeMarket(): Promise<EstimatedFees> {
    return this.feeMarketProvider.getFeeMarket();
  }

  /**
   * Submits a raw transaction to the blockchain for inclusion in a block.
   *
   * @param rawTransaction - The raw transaction data to be broadcast to the network.
   */
  public async submitTransaction(rawTransaction: string): Promise<string> {
    try {
      const transactionId = await this.provider.submitTransaction(rawTransaction);
      const entry = await historyEntryFromRawTx(rawTransaction, this.network, this.inputResolver);
      entry.transactionHash = transactionId;

      // Add to pending transactions if not already present
      if (!this._pendingTransactions.find((tx) => tx.transactionHash === entry.transactionHash)) {
        this.setPendingTransactions([...this._pendingTransactions, entry]);
      }

      return transactionId;
    } catch (error) {
      this.logger.error('Failed to submit transaction:', error);
      throw error;
    }
  }

  /**
   * Stop polling by clearing the interval
   */
  public shutdown() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  /**
   * Enable or disable polling
   */
  public setPollEnabled(enabled: boolean): void {
    this.pollEnabled = enabled;
  }

  /**
   * Starts polling for new blocks and updating wallet state.
   */
  private startPolling() {
    // Start polling immediately and then at intervals
    this.poll();
    
    this.pollIntervalId = setInterval(() => {
      if (this.pollEnabled) {
        this.poll();
      }
    }, this.pollInterval);
  }

  /**
   * Single poll cycle
   */
  private async poll(): Promise<void> {
    if (!this.pollEnabled) return;

    this.logger.debug('Poll cycle started');

    try {
      const latestBlockInfo = await this.provider.getLastKnownBlock();
      if (!latestBlockInfo) return;

      await (!this.lastKnownBlock || this.lastKnownBlock.hash !== latestBlockInfo.hash
        ? this.updateState(latestBlockInfo)
        : this.updatePendingTransactions());
    } catch (error) {
      this.logger.error('Failed to fetch blockchain info during polling:', error);
    }
  }

  private async updateTransactions(): Promise<boolean> {
    const { transactions } = await this.provider.getTransactions(this.address.address, 0, this.historyDepth);

    const txSetChanged = !isEqual(transactions, this._transactionHistory);

    if (txSetChanged) {
      this.setTransactionHistory(transactions);
    }

    return txSetChanged;
  }

  /**
   * Updates the local list of pending transactions by synchronizing with the remote mempool.
   *
   * Transactions in the Bitcoin network can be replaced in the mempool by another transaction
   * with the same inputs but possibly with a higher fee (Replace-By-Fee, RBF).
   *
   * The method performs the following operations:
   *
   * 1. **Fetch Remote Pending Transactions**: Retrieves the list of pending transactions from the mempool
   *    for the wallet's address. This includes transactions that are waiting to be confirmed.
   *
   * 2. **Synchronize Local and Remote Transactions**:
   *    - For each remote pending transaction:
   *      - If it matches a transaction in the local list (by transaction hash), it updates the local transaction
   *        with the remote version, since it contains more metadata (I.E resolved inputs).
   *
   * 3. **Purge Invalid Local Transactions**:
   *    - Iterates over the local list of pending transactions to check each transaction's inputs against:
   *      a. Inputs of all other transactions in the transaction history to detect if any inputs have been confirmed in a block.
   *      b. Inputs of other remote pending transactions to handle RBF scenarios where a transaction might be replaced
   *         by another with the same inputs but not the same hash.
   *    - Removes any local transactions whose inputs are found in the confirmed transactions or in another competing pending transaction.
   */
  private async updatePendingTransactions() {
    const remotePendingTxs = await this.provider.getTransactionsInMempool(
      this.address.address,
      this.lastKnownBlock?.height ?? 0
    );
    const updatedPendingTxs = [...this._pendingTransactions];

    const filteredPendingTxs = updatedPendingTxs.filter((localTx) => {
      const inputUsedInHistory = this._transactionHistory.some((historyTx) =>
        historyTx.inputs.some((histInput) =>
          localTx.inputs.some(
            (localInput) => histInput.txId === localInput.txId && histInput.index === localInput.index
          )
        )
      );

      const inputUsedInRemotePending = remotePendingTxs.some(
        (remoteTx) =>
          remoteTx.transactionHash !== localTx.transactionHash &&
          remoteTx.inputs.some((remoteInput) =>
            localTx.inputs.some(
              (localInput) => remoteInput.txId === localInput.txId && remoteInput.index === localInput.index
            )
          )
      );

      return !(inputUsedInHistory || inputUsedInRemotePending);
    });

    remotePendingTxs.forEach((remoteTx) => {
      const index = filteredPendingTxs.findIndex((t) => t.transactionHash === remoteTx.transactionHash);
      if (index > -1) filteredPendingTxs[index] = remoteTx;
      else filteredPendingTxs.push(remoteTx);
    });

    if (!isEqual(filteredPendingTxs, this._pendingTransactions)) {
      this.setPendingTransactions(filteredPendingTxs);
    }
  }

  private async updateUtxos() {
    const newUtxos = await this.provider.getUTxOs(this.address.address);

    if (!isEqual(newUtxos, this._utxos)) {
      this.setUtxos(newUtxos);
    }
  }

  /**
   * Updates the wallet state by fetching new transactions and UTxOs.
   */
  private async updateState(latestBlockInfo: BlockInfo): Promise<void> {
    this.lastKnownBlock = latestBlockInfo;

    const txSetChanged = await this.updateTransactions();
    await this.updatePendingTransactions();

    if (txSetChanged) {
      await this.updateUtxos();
    }

    this.lastKnownBlock = latestBlockInfo;
  }
}
