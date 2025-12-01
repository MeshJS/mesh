import { EventEmitter } from "events";
import axios, { AxiosInstance, RawAxiosRequestHeaders } from "axios";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  GovernanceProposalInfo,
  IFetcher,
  IFetcherOptions,
  ISubmitter,
  POLICY_ID_LENGTH,
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";

import { HydraConnection } from "./hydra-connection";
import {
  clientInput,
  ClientMessage,
  hydraStatus,
  hydraTransaction,
  hydraUTxO,
  hydraUTxOs,
  ServerOutput,
} from "./types";
import { handleHydraErrors } from "./types/events/handler";
import {
  PostTxOnChainFailed,
  TransactionSubmitted,
} from "./types/events/post-tx-failed";
import { seenSnapshot, snapshotSideLoad } from "./types/events/snapshot";
import { parseHttpError } from "./utils";

/**
 * HydraProvider is a tool for administrating & interacting with Hydra Heads.
 *
 * Usage:
 * ```
 * import { HydraProvider } from "@meshsdk/hydra";
 *
 * const hydraProvider = new HydraProvider({httpUrl:'http://123.45.67.890:4001'});
 */
export class HydraProvider implements IFetcher, ISubmitter {
  private _connection: HydraConnection;
  private readonly _eventEmitter: EventEmitter;
  private readonly _axiosInstance: AxiosInstance;
  private _messageCallback:
    | ((data: ServerOutput | ClientMessage) => void)
    | null = null;
  private _messageQueue: (ServerOutput | ClientMessage)[] = [];
  private _disconnectTimeout: NodeJS.Timeout | null = null;
  private _isDisconnecting: boolean = false;
  private _currentStatus: hydraStatus = "IDLE";

  constructor({
    httpUrl,
    history = false,
    address,
    wsUrl,
  }: {
    httpUrl: string;
    history?: boolean;
    address?: string;
    wsUrl?: string;
  }) {
    this._eventEmitter = new EventEmitter();
    this._connection = new HydraConnection({
      httpUrl: httpUrl,
      eventEmitter: this._eventEmitter,
      history: history,
      address: address,
      wsUrl: wsUrl,
    });
    this._axiosInstance = axios.create({
      baseURL: httpUrl,
    });

    this._eventEmitter.on(
      "onmessage",
      (message: ServerOutput | ClientMessage) => {
        this._messageQueue.push(message);

        if (this._messageCallback) {
          this._messageCallback(message);
        }
      },
    );

    this._eventEmitter.on("onstatuschange", (status: hydraStatus) => {
      this._currentStatus = status;
    });
  }

  /**
   * Connects to the Hydra Head.
   */
  async connect() {
    try {
      await this._connection.connect();
    } catch (error) {
      throw new Error(
        `Failed to connect to Hydra Head: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Disconnects from the Hydra Head.
   *
   * @param timeout Optional timeout in milliseconds (defaults to 5 minutes) to wait for the disconnect operation to complete.
   *                If set to 0, disconnects immediately (reactive to clicks/events).
   *                If not provided, the default disconnect timeout will be used.
   *                Useful for customizing how long to wait before disconnecting.
   * @throws {Error} If timeout is less than 0 or between 1 and 59,999 ms
   */
  async disconnect(timeout: number = 300_000) {
    if (timeout < 0) {
      throw new Error("Timeout must be a non-negative number");
    }
    if (timeout > 0 && timeout < 60_000) {
      throw new Error(
        "Timeout must be at least 60,000 ms (1 minute) or 0 for immediate disconnect",
      );
    }

    const clearPendingTimeout = () => {
      if (this._disconnectTimeout) {
        clearTimeout(this._disconnectTimeout);
        this._disconnectTimeout = null;
      }
    };

    if (timeout === 0) {
      clearPendingTimeout();
      this._isDisconnecting = false;
      await this._connection.disconnect(0);
      return;
    }

    if (this._isDisconnecting) return;

    this._isDisconnecting = true;
    this._disconnectTimeout = setTimeout(async () => {
      try {
        await this._connection.disconnect(0);
      } finally {
        this._disconnectTimeout = null;
        this._isDisconnecting = false;
      }
    }, timeout);
  }

  /**
   * Commands sent to the Hydra node.
   *
   * Accepts one of the following commands:
   * - Init: init()
   * - Abort: abort()
   * - NewTx: newTx()
   * - Decommit: decommit()
   * - Close: close()
   * - Contest: contest()
   * - Fanout: fanout()
   */

  /**
   * Initializes a new Head. This command is a no-op when a Head is already open and the server will output an CommandFailed message should this happen.
   */
  /**
   * Initialize the head when status is Idle.
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.onMessage((msg) => {
        if (msg.tag === "Greetings" && msg.headStatus === "Idle") {
          this._connection.send(clientInput.init);
        }
        if (msg.tag === "HeadIsInitializing") {
          resolve();
        }
        if (handleHydraErrors(msg as ClientMessage, reject)) {
          return;
        } else {
          reject(new Error("Failed to initialize, head is not in Idle state"));
        }
      });
    });
  }

  /**
   * Aborts a head before it is opened. This can only be done before all participants have committed. Once opened, the head can't be aborted anymore but it can be closed using: `Close`.
   */
  async abort(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.onMessage((msg) => {
        if (
          msg.tag === "HeadIsInitializing" ||
          (msg.tag === "Greetings" && msg.headStatus === "Initializing")
        ) {
          this._connection.send(clientInput.abort);
        }
        if (msg.tag === "HeadIsAborted") {
          resolve();
        }
        if (handleHydraErrors(msg as ClientMessage, reject)) {
          return;
        } else {
          reject(
            new Error("Failed to abort, head is not in Initializing state"),
          );
        }
      });
    });
  }

  /**
   * Submit a transaction through the Hydra head.
   * The transaction must be well-formed and valid; otherwise, it will not be broadcast.
   *
   * @param transaction The transaction object to submit. Should have the following structure:
   *   - type: The type of the transaction
   *   - description (optional)
   *   - cborHex:
   * @returns txhash
   * @example
   * ```tsx
   * await hydraProvider.newTx({
   *   type: "Tx ConwayEra",
   *   description: "",
   *   cborHex: unsignedTx,
   * });
   * ```
   */
  async newTx(transaction: hydraTransaction): Promise<string> {
    return new Promise((resolve, reject) => {
      this.onMessage((msg) => {
        if (
          msg.tag === "HeadIsOpen" ||
          (msg.tag === "Greetings" && msg.headStatus === "Open")
        ) {
          const payload = clientInput.newTx(transaction);
          this._connection.send(payload);
        }

        if (msg.tag === "TxValid" && msg.transactionId) {
          resolve(msg.transactionId);
        } else if (msg.tag === "TxInvalid") {
          reject(
            new Error(
              `Transaction invalid: ${JSON.stringify(msg.validationError)}`,
            ),
          );
        } else {
          reject(
            new Error(
              "Failed to submit transaction, head is not in Open state",
            ),
          );
        }
      });
    });
  }

  /**
   * Attempt to recover a deposit transaction in the Hydra head by its transaction ID.
   * @param txHash - The deposit txId or txHash of the deposit transaction to recover.
   *
   * @example
   * ```ts
   * await hydraProvider.recover(txId);
   * ```
   */
  async recover(txHash: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.onMessage((msg) => {
        if (
          msg.tag === "HeadIsOpen" ||
          (msg.tag === "Greetings" && msg.headStatus === "Open")
        ) {
          const payload = clientInput.recover(txHash);
          this._connection.send(payload);
        }

        if (msg.tag === "CommitRecovered" && msg.recoveredTxId === txHash) {
          resolve(msg.recoveredTxId);
        }
        if (handleHydraErrors(msg as ClientMessage, reject)) {
          return;
        } else {
          reject(
            new Error(
              "Failed to recover transaction, head is not in Open state",
            ),
          );
        }
      });
    });
  }

  /**
   * Request to decommit a UTxO from a Head making UTxOavailable on the layer 1.
   *
   * @param transaction The transaction object to decommit. Should have the following structure:
   *   - type: The type of the transaction. Allowed values: "Tx ConwayEra", "Unwitnessed Tx ConwayEra", "Witnessed Tx ConwayEra".
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The base16-encoded CBOR representation of the transaction.
   *
   * @example
   * ```tsx
   * await hydraProvider.decommit({
   *   type: "Tx ConwayEra",
   *   description: "",
   *   cborHex: unsignedTx,
   * });
   * ```
   */
  async decommit(transaction: hydraTransaction): Promise<string> {
    return new Promise((resolve, reject) => {
      this.onMessage(async (msg) => {
        if (
          msg.tag === "HeadIsOpen" ||
          (msg.tag === "Greetings" && msg.headStatus === "Open")
        ) {
          const payload = clientInput.decommit(transaction);
          const tx: hydraTransaction = await this.publishDecommit(payload, {
            "Content-Type": "application/json",
          });
          resolve(tx.cborHex);
        }
        if (handleHydraErrors(msg as ClientMessage, reject)) {
          return;
        } else {
          reject(new Error("Failed to decommit, head is not in Open state"));
        }
      });
    });
  }

  /**
   * Decommits a UTxO from the Hydra Head incrementally, making it available on layer 1.
   *
   * @param transaction The transaction object to decommit.
   * @returns Promise resolving to the transaction hash or result.
   */
  async incrementalDecommit(transaction: hydraTransaction) {
    return this.decommit(transaction);
  }

  /**
   * Terminate a head with the latest known snapshot. This effectively moves the head from the Open state to the Close state where the contestation phase begin. As a result of closing a head, no more transactions can be submitted via NewTx.
   */
  async close() {
    return new Promise((resolve, reject) => {
      this.onMessage((message) => {
        if (
          message.tag === "HeadIsOpen" ||
          (message.tag === "Greetings" && message.headStatus === "Open")
        ) {
          this._connection.send(clientInput.close);
        }
        if (message.tag === "HeadIsClosed") {
          resolve(message);
        }
        if (handleHydraErrors(message as ClientMessage, reject)) {
          reject(new Error("Failed to close head"));
          return;
        } else {
          reject(new Error("Failed to close, head is not in Open state"));
        }
      });
    });
  }

  /**
   * Challenge the latest snapshot announced as a result of a head closure from another participant. Note that this necessarily contest with the latest snapshot known of your local Hydra node. Participants can only contest once.
   */
  async contest() {
    return new Promise((resolve, reject) => {
      this.onMessage((msg) => {
        if (
          msg.tag === "HeadIsClosed" ||
          (msg.tag === "Greetings" && msg.headStatus === "Closed")
        )
          this._connection.send(clientInput.contest);
        if (msg.tag === "Greetings") {
          resolve(msg.headStatus === "Closed");
        }
        if (handleHydraErrors(msg as ClientMessage, reject)) {
          reject(new Error("Failed to contest head"));
          return;
        } else {
          reject(new Error("Failed to contest, head is not in Closed state"));
        }
      });
    });
  }

  /**
   * Finalize a head after the contestation period passed.
   * This will distribute the final (as closed and maybe contested) head state back on the layer 1.
   */
  async fanout() {
    return new Promise((resolve, reject) => {
      this.onMessage((msg) => {
        if (
          msg.tag === "ReadyToFanout" ||
          (msg.tag === "Greetings" && msg.headStatus === "Closed")
        ) {
          this._connection.send(clientInput.fanout);
          if (msg.tag === "Greetings") {
            resolve(msg.headStatus === "Final");
          }
        }
        if (handleHydraErrors(msg as ClientMessage, reject)) {
          reject(new Error("Failed to fanout head"));
          return;
        } else {
          reject(new Error("Failed to fanout, head is not in Closed state"));
        }
      });
    });
  }

  /**
   * FETCHERS and SUBMITTERS
   */

  /**
   * Fetches the UTXOs available in the current Hydra Head snapshot.
   * @param address - The address to filter UTXOs by (returns only UTXOs with this address if provided)
   * @param asset - Optional asset unit to filter UTXOs (returns only UTXOs containing this asset if provided)
   * @returns - Array of UTxOs matching the address and asset if provided
   */
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const utxos = await this.fetchUTxOs();
    const utxo = utxos.filter((utxo) => utxo.output.address === address);
    if (asset) {
      return utxo.filter((utxo) =>
        utxo.output.amount.some((a) => a.unit === asset),
      );
    }
    return utxo;
  }

  /**
   * Fetch the latest protocol parameters.
   * @returns - Protocol parameters
   */
  async fetchProtocolParameters(): Promise<Protocol> {
    return await this.subscribeProtocolParameters();
  }

  /**
   * Get UTxOs for a given hash.
   * @param hash
   * @param index
   * @returns - Array of UTxOs
   */
  async fetchUTxOs(hash?: string, index?: number): Promise<UTxO[]> {
    const snapshotUTxOs = await this.subscribeSnapshotUtxo();

    const outputsPromises: Promise<UTxO>[] = [];
    snapshotUTxOs.forEach((utxo) => {
      if (hash === undefined || utxo.input.txHash === hash) {
        outputsPromises.push(Promise.resolve(utxo));
      }
    });
    const outputs = await Promise.all(outputsPromises);

    if (index !== undefined) {
      return outputs.filter((utxo) => utxo.input.outputIndex === index);
    }

    return outputs;
  }

  /**
   * Fetches the addresses and quantities for a given Cardano asset.
   *
   * @param asset - The asset unit in Cardano format, defined as a concatenation of the policy ID and asset name in hex
   *
   * @returns the address and quantity for each UTxO holding the specified asset.
   */
  async fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    const utxos = await this.fetchUTxOs();
    const addressesWithQuantity: { address: string; quantity: string }[] = [];
    for (const utxo of utxos) {
      const found = utxo.output.amount.find((a) => a.unit === asset);
      if (found) {
        addressesWithQuantity.push({
          address: utxo.output.address,
          quantity: found.quantity,
        });
      }
    }
    if (addressesWithQuantity.length === 0 || undefined) {
      throw new Error(`No address found holding asset: ${asset}`);
    }
    return addressesWithQuantity;
  }

  /**
   * Fetches the list of assets for a given policy ID.
   * @param policyId The policy ID to fetch assets for
   * @returns The list of assets in the policyId collection
   */
  async fetchCollectionAssets(policyId: string): Promise<{ assets: Asset[] }> {
    if (policyId.length !== POLICY_ID_LENGTH) {
      throw new Error(
        "Invalid policyId length: must be a 56-character hexadecimal string",
      );
    }

    const utxos = await this.fetchUTxOs();
    const filteredUtxos = utxos.filter((utxo) =>
      utxo.output.amount.some(
        (a) => a.unit.slice(0, POLICY_ID_LENGTH) === policyId,
      ),
    );
    if (filteredUtxos.length === 0 || undefined) {
      throw new Error(`No assets found in the head snapshot: ${policyId}`);
    }
    return {
      assets: filteredUtxos.flatMap((utxo) =>
        utxo.output.amount
          .filter(
            (a) =>
              a.unit.length > policyId.length && a.unit.startsWith(policyId),
          )
          .map((a) => ({
            unit: a.unit,
            quantity: a.quantity,
          })),
      ),
    };
  }

  /**
   * Submit a transaction to the Hydra node. Note, unlike other providers,this returns a transaction hash (txId).
   * @param cborHex - The transaction in CBOR hex format usually the unsigned transaction
   * @returns The transaction hash (txId)
   */
  async submitTx(cborHex: string): Promise<string> {
    try {
      const txHash = await this.newTx({
        type: "Tx ConwayEra",
        description: "",
        cborHex,
      });
      return txHash;
    } catch (error) {
      throw parseHttpError(error);
    }
  }
  /**
   * Submit a transaction to the Cardano L1 network.
   * @param transaction - The transaction to submit
   * @returns The transaction cborHex
   */

  async submitL1Tx(
    transaction: hydraTransaction,
  ): Promise<TransactionSubmitted | PostTxOnChainFailed> {
    const tx = await this.publishCardanoTransaction(transaction, {
      "Content-Type": "application/json",
    });
    return new Promise((resolve) => {
      resolve(tx as TransactionSubmitted);
      this.onMessage((msg) => {
        if (handleHydraErrors(msg as ClientMessage, resolve)) {
          return;
        }
      });
    });
  }

  /*
  SNAPSHOT & COMMIT OPERATIONS
  */

  /**
   * Obtain a list of pending deposit transaction ID's.
   */
  async getPendingCommits() {
    const commit = await this.get("/commits");
    return commit;
  }

  /**
   * Get the latest snapshot signed by the Hydra node.
   * This returns snapshot information.
   *
   * @returns {Promise<seenSnapshot>} The latest seen snapshot information.
   * @throws {Error} If the latest snapshot cannot be retrieved or parsed.
   */
  async getLatestSeenSnapshot(): Promise<seenSnapshot> {
    try {
      const snapshot = await this.subscribeSeenSnapshot();
      if (!snapshot) {
        throw new Error(
          "Unable to fetch the latest seen snapshot from Hydra node",
        );
      }
      return snapshot;
    } catch (error) {
      throw new Error(
        `Error fetching latest seen snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * This is used to get the snapshop from a healthy node ready to
   * sideload into a stuck or unhealthy node
   * @returns
   */
  async getSideloadedSnapshot(): Promise<snapshotSideLoad> {
    const data: snapshotSideLoad = await this.get(`/snapshot`);
    let snapshot = {};

    if (data.tag === "InitialSnapshot") {
      const utxos: UTxO[] = [];
      for (const [key, value] of Object.entries(data.initialUTxO)) {
        const utxo = hydraUTxO.toUTxO(value as unknown as hydraUTxO, key);
        utxos.push(utxo);
      }

      snapshot = {
        tag: "InitialSnapshot",
        headId: data.headId,
        initialUTxO: utxos,
      };
    }
    if (data.tag === "ConfirmedSnapshot") {
      const utxos: UTxO[] = [];
      const utxoToCommit: UTxO[] = [];
      const utxoToDecommit: UTxO[] = [];

      for (const [key, value] of Object.entries(data.snapshot.utxo)) {
        const utxo = hydraUTxO.toUTxO(value as unknown as hydraUTxO, key);
        utxos.push(utxo);
      }

      if (data.snapshot.utxoToCommit) {
        for (const [key, value] of Object.entries(data.snapshot.utxoToCommit)) {
          const utxo = hydraUTxO.toUTxO(value as unknown as hydraUTxO, key);
          utxoToCommit.push(utxo);
        }
      }

      if (data.snapshot.utxoToDecommit) {
        for (const [key, value] of Object.entries(
          data.snapshot.utxoToDecommit,
        )) {
          const utxo = hydraUTxO.toUTxO(value as unknown as hydraUTxO, key);
          utxoToDecommit.push(utxo);
        }
      }

      snapshot = {
        tag: "ConfirmedSnapshot",
        snapshot: {
          ...data.snapshot,
          utxo: utxos as UTxO[],
          utxoToCommit: utxoToCommit.length ? utxoToCommit : null,
          utxoToDecommit: utxoToDecommit.length ? utxoToDecommit : null,
        },
        signatures: data.signatures,
      };
    }

    return snapshot as snapshotSideLoad;
  }

  /**
   * sync or sideLoadSnapshot to the hydra unhealthy node
   *
   */
  async syncSideloadSnapshot(snapshot: snapshotSideLoad): Promise<object> {
    let hydraSnapshot = {};
    if (snapshot.tag === "InitialSnapshot") {
      const initialUTxO = snapshot.initialUTxO.map((utxo) => hydraUTxO(utxo));
      hydraSnapshot = {
        tag: "InitialSnapshot",
        headId: snapshot.headId,
        initialUTxO: await Promise.all(initialUTxO),
      };
    }

    if (snapshot.tag === "ConfirmedSnapshot") {
      const utxo = await hydraUTxOs(snapshot.snapshot.utxo);
      const utxoToCommit = snapshot.snapshot.utxoToCommit
        ? await hydraUTxOs(snapshot.snapshot.utxoToCommit)
        : null;
      const utxoToDecommit = snapshot.snapshot.utxoToDecommit
        ? await hydraUTxOs(snapshot.snapshot.utxoToDecommit)
        : null;
      hydraSnapshot = {
        tag: "ConfirmedSnapshot",
        snapshot: {
          ...snapshot.snapshot,
          utxo: utxo,
          utxoToCommit: utxoToCommit,
          utxoToDecommit: utxoToDecommit,
        },
        signatures: snapshot.signatures,
      };
    }
    await this.post("/snapshot", hydraSnapshot, {
      "Content-Type": "application/json",
    });

    return new Promise((resolve) => {
      this.onMessage((msg) => {
        if (msg.tag === "SnapshotConfirmed") {
          resolve(msg.snapshot);
        }
      });
    });
  }

  /**
   * OPERATIONS
   */

  /**
   * Draft a commit transaction, which can be completed and later submitted to the L1 network.
   */
  async buildCommit(payload: unknown, headers: RawAxiosRequestHeaders = {}) {
    return await this.post("/commit", payload, headers);
  }

  /**
   *
   * gets last seen snapshot in the head
   */

  async subscribeSeenSnapshot(): Promise<seenSnapshot> {
    return this.get("/snapshot/last-seen");
  }

  /**
   * A set of unspent transaction outputs.
   * @returns - Array of UTxOs
   */
  async subscribeSnapshotUtxo(): Promise<UTxO[]> {
    const data = await this.get(`snapshot/utxo`);
    const utxos: UTxO[] = [];
    for (const [key, value] of Object.entries(data)) {
      const utxo = hydraUTxO.toUTxO(value as hydraUTxO, key);
      utxos.push(utxo);
    }
    return utxos;
  }

  /**
   * Provide decommit transaction that needs to be applicable to the Hydra's local ledger state. Specified transaction outputs will be available on layer 1 after decommit is successfully processed.
   */
  async publishDecommit(
    payload: unknown,
    headers: RawAxiosRequestHeaders = {},
  ) {
    return await this.post("/decommit", payload, headers);
  }

  /**
   * Cardano transaction to be submitted to the L1 network. Accepts transactions encoded as Base16 CBOR string, TextEnvelope type or JSON.
   */
  async publishCardanoTransaction(
    payload: unknown,
    headers: RawAxiosRequestHeaders = {},
  ): Promise<PostTxOnChainFailed | TransactionSubmitted> {
    return await this.post("/cardano-transaction", payload, headers);
  }

  /**
   * Get protocol parameters.
   * @returns - Protocol parameters
   */
  async subscribeProtocolParameters(): Promise<Protocol> {
    const data = await this.get("protocol-parameters");

    const protocolParams = castProtocol({
      coinsPerUtxoSize: data.utxoCostPerByte,
      collateralPercent: data.collateralPercentage,
      maxBlockExMem: data.maxBlockExecutionUnits.memory,
      maxBlockExSteps: data.maxBlockExecutionUnits.steps,
      maxBlockHeaderSize: data.maxBlockHeaderSize,
      maxBlockSize: data.maxBlockBodySize,
      maxCollateralInputs: data.maxCollateralInputs,
      maxTxExMem: data.maxTxExecutionUnits.memory,
      maxTxExSteps: data.maxTxExecutionUnits.steps,
      maxTxSize: data.maxTxSize,
      maxValSize: data.maxValueSize,
      minFeeA: data.txFeePerByte,
      minFeeB: data.txFeeFixed,
      minPoolCost: data.minPoolCost,
      poolDeposit: data.stakePoolDeposit,
      priceMem: data.executionUnitPrices.priceMemory,
      priceStep: data.executionUnitPrices.priceSteps,
    });

    return protocolParams;
  }

  /**
   * Registers a callback to receive messages from the Hydra Head.
   * When called, the callback will immediately be invoked for all messages that have already been received
   * (queued in the message queue), and subsequently for each new incoming message.
   *
   * @param callback - The function to call with each ServerOutput or ClientMessage received.
   *
   * @example
   * ```ts
   * hydraProvider.onMessage((message) => {
   *   console.log("Received Hydra message:", message);
   * });
   * ```
   */
  onMessage(callback: (data: ServerOutput | ClientMessage) => void) {
    this._messageCallback = callback;
    this._messageQueue.forEach((message) => {
      callback(message);
    });
  }

  /**
   * Subscribe to status changes of the Hydra Head.
   * The callback will be called whenever the status changes.
   *
   * @param callback Function to call when status changes, receives the new hydraStatus
   * @returns The current status
   *
   * @example
   * ```ts
   * hydraProvider.onStatusChange((status) => {
   *   console.log(`Hydra Head status changed to: ${status}`);
   * });
   * ```
   */
  onStatusChange(callback: (status: hydraStatus) => void): hydraStatus {
    this._eventEmitter.on("onstatuschange", (status: hydraStatus) => {
      this._currentStatus = status;
      callback(status);
    });
    return this._currentStatus;
  }

  /**
   * Get the current status of the Hydra Head.
   *
   * @returns The current hydraStatus
   *
   * @example
   * ```ts
   * const currentStatus = hydraProvider.getStatus();
   * console.log(`Current status: ${currentStatus}`);
   * ```
   */
  getStatus(): hydraStatus {
    return this._currentStatus;
  }

  /**
   * Useful utility functions.
   */

  /**
   * A generic method to fetch data from a URL.
   * @param url - The URL to fetch data from
   * @returns - The data fetched from the URL
   */
  async get(url: string): Promise<any> {
    try {
      const { data, status } = await this._axiosInstance.get(url);
      if (status === 200 || status == 202) {
        return data;
      }
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * A generic method to post data to a URL.
   * @param url - The URL to post data to
   * @param payload - The data to post
   * @returns - The response from the URL
   */
  async post(
    url: string,
    payload: unknown,
    headers: RawAxiosRequestHeaders,
  ): Promise<any> {
    try {
      const { data, status } = await this._axiosInstance.post(url, payload, {
        headers,
      });
      if (status === 200 || status == 202) {
        return data;
      }
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * NOT SUPPORTED FETCHERS
   */

  /**
   * Note: Not supported in Hydra L2.
   */
  async fetchAccountInfo(address?: string): Promise<AccountInfo> {
    throw new Error(`Not supported in Hydra L2.`);
  }

  /**
   * Not supported in Hydra L2.
   */
  async fetchAddressTxs(
    address?: string,
    option?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    throw new Error("Not supported in Hydra L2.");
  }

  /**
   * Not supported in Hydra L2.
   */
  async fetchAssetMetadata(asset?: string): Promise<AssetMetadata> {
    throw new Error("Not supported in Hydra L2.");
  }

  /**
   * Note: Not supported in Hydra L2.
   */
  async fetchBlockInfo(hash?: string): Promise<BlockInfo> {
    throw new Error("Not supported in Hydra L2.");
  }

  /**
   * Not supported in Hydra L2.
   */
  async fetchGovernanceProposal(
    txHash?: string,
    certIndex?: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Not supported in Hydra L2.");
  }

  /**
   * Not supported in Hydra L2.
   */
  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    const utxos = await this.fetchUTxOs(hash);
    throw new Error("Method not implemented.");
  }
}
