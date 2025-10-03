import { EventEmitter } from "events";
import axios, { AxiosInstance, RawAxiosRequestHeaders } from "axios";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  DEFAULT_FETCHER_OPTIONS,
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
import { hydraStatus, hydraTransaction, hydraUTxO } from "./types";
import {
  CommandFailed,
  Committed,
  DecommitApproved,
  DecommitFinalized,
  DecommitInvalid,
  DecommitRequested,
  GetUTxOResponse,
  Greetings,
  HeadIsAborted,
  HeadIsClosed,
  HeadIsContested,
  HeadIsFinalized,
  HeadIsInitializing,
  HeadIsOpen,
  IgnoredHeadInitializing,
  InvalidInput,
  PeerConnected,
  PeerDisconnected,
  PeerHandshakeFailure,
  PostTxOnChainFailed,
  ReadyToFanout,
  SnapshotConfirmed,
  TxInvalid,
  TxValid,
} from "./types/events";
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
  private _status: hydraStatus = "DISCONNECTED";
  private readonly _eventEmitter: EventEmitter;
  private readonly _axiosInstance: AxiosInstance;

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
  }

  /**
   * Connects to the Hydra Head.
   */
  async connect() {
    if (this._status !== "DISCONNECTED") {
      return;
    }
    this._connection.connect();
    this._status = "CONNECTED";
    this._eventEmitter.emit("onstatuschange", this._status);
  }

  /**
   * Disconnects from the Hydra Head.
   *
   * @param timeout - Optional timeout in milliseconds default to 5 minutes to wait for the disconnect operation to complete.
   *                  If not provided, the default disconnect timeout will be used.
   *                  Useful for customizing how long to wait before disconnecting.
   */
  async disconnect(timeout: number = 300_000) {
    if (this._status === "DISCONNECTED") {
      return;
    }

    if (timeout < 60_000) {
      throw new Error("Timeout must be at least 60,000 ms (1 minute)");
    }

    await this._connection.disconnect(timeout);

    this._status = "DISCONNECTED";
    this._eventEmitter.emit("onstatuschange", this._status);
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
  async init() {
    this.onMessage((message) => {
      const status =
        message.tag === "Greetings"
          ? { headStatus: message.headStatus }
          : { tag: message.tag };
      if (status.headStatus === "Idle") {
        this._connection.send({ tag: "Init" });
        this._eventEmitter.emit("onstatuschange", status);
      }
    });
  }
  /**
   * Aborts a head before it is opened. This can only be done before all participants have committed. Once opened, the head can't be aborted anymore but it can be closed using: `Close`.
   */
  async abort() {
    this.onMessage((message) => {
      const status =
        message.tag === "Greetings"
          ? { headStatus: message.headStatus }
          : { tag: message.tag };
      if (
        status.headStatus === "Initializing" ||
        status.tag === "HeadIsInitializing"
      ) {
        this._connection.send({ tag: "Abort" });
        this._eventEmitter.emit("onstatuschange", status);
      }
    });
  }

  /**
   * Submit a transaction through the Hydra head.
   *The transaction must be well-formed and valid; otherwise, it will not be broadcast.
   *
   * @param transaction - The transaction object to submit. Should have the following structure:
   *   - type: The type of the transaction. Allowed values: "Tx ConwayEra", "Unwitnessed Tx ConwayEra", "Witnessed Tx ConwayEra".
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The base16-encoded CBOR representation of the transaction.
   *   - txId: (Optional) The transaction ID.
   *
   * @example
   * ```ts
   * await hydraProvider.newTx({
   *   type: "Tx ConwayEra",
   *   description: "",
   *   cborHex: unsignedTx,
   * });
   * ```
   */
  async newTx(transaction: hydraTransaction): Promise<void> {
    const hydraTransaction = {
      type: transaction.type,
      description: transaction.description,
      cborHex: transaction.cborHex,
      txId: transaction.txId,
    };
    const payload = {
      tag: "NewTx",
      transaction: hydraTransaction,
    };
    this._connection.send(payload);
    this.onMessage((message) => {
      if (message.tag === "TxValid") {
        return message.transactionId;
      }
    });
  }

  /**
   * Attempt to recover a deposit transaction in the Hydra head by its transaction ID.
   * @param txId - The transaction ID (as a string) of the deposit transaction to recover.
   *
   * @example
   * ```ts
   * await hydraProvider.recover(txId);
   * ```
   */
  async recover(txId: string): Promise<void> {
    const payload = {
      tag: "Recover",
      recoverTxId: txId,
    };
    this._connection.send(payload);
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
  async decommit(transaction: hydraTransaction) {
    const payload = {
      tag: "Decommit",
      decommitTx: {
        type: transaction.type,
        description: transaction.description,
        cborHex: transaction.cborHex,
      },
    };
    this._connection.send(payload);
  }

  /**
   * Terminate a head with the latest known snapshot. This effectively moves the head from the Open state to the Close state where the contestation phase begin. As a result of closing a head, no more transactions can be submitted via NewTx.
   */
  async close() {
    this.onMessage((message) => {
      const status =
        message.tag === "Greetings"
          ? { headStatus: message.headStatus }
          : { tag: message.tag };
      if (status.headStatus === "Open") {
        this._connection.send({ tag: "Close" });
        this._eventEmitter.emit("onstatuschange", status);
      }
    });
  }

  /**
   * Challenge the latest snapshot announced as a result of a head closure from another participant. Note that this necessarily contest with the latest snapshot known of your local Hydra node. Participants can only contest once.
   */
  async contest() {
    this.onMessage((message) => {
      const status =
        message.tag === "Greetings"
          ? { headStatus: message.headStatus }
          : { tag: message.tag };
      if (status.headStatus === "Closed" || status.tag === "HeadIsClosed") {
        this._connection.send({ tag: "Contest" });
        this._eventEmitter.emit("onstatuschange", status);
      }
    });
  }

  /**
   * Finalize a head after the contestation period passed.
   * This will distribute the final (as closed and maybe contested) head state back on the layer 1.
   */
  async fanout() {
    this.onMessage((message) => {
      const status =
        message.tag === "Greetings"
          ? { headStatus: message.headStatus }
          : { tag: message.tag };
      if (
        status.headStatus === "FanoutPossible" ||
        status.tag === "ReadyToFanout"
      ) {
        this._connection.send({ tag: "Fanout" });
        this._eventEmitter.emit("onstatuschange", status);
      }
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
   * @returns theaddress and quantity for each UTxO holding the specified asset.
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
        "Invalid policyId length: must be a 56-character hex string",
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
   * Fetches all assets minted on the Hydra Head that are not available on Cardano L1.
   * @param blockchainProvider - An IFetcher instance to fetch asset metadata.
   * @returns object with policyId and assetName.
   */
  async fetchHydraAssets(
    blockchainProvider: IFetcher,
  ): Promise<{ policyId: string; assetName: string }[] | undefined> {
    const utxos = await this.fetchUTxOs();
    if (!utxos || utxos.length === 0) {
      throw new Error("No UTxOs found in the head snapshot");
    }

    const assetUnits = new Set<string>();
    for (const utxo of utxos) {
      for (const asset of utxo.output.amount ?? []) {
        if (asset.unit !== "lovelace") {
          assetUnits.add(asset.unit);
        }
      }
    }
    if (!assetUnits.size) {
      throw new Error("No script UTxOs found in the head snapshot");
    }

    const results = await Promise.all(
      [...assetUnits].map(async (unit) => {
        const metadata = await blockchainProvider.fetchAssetMetadata(unit);
        return metadata === undefined ? unit : null;
      }),
    );
    if (!results) {
      return undefined;
    }
    return results
      .filter((x): x is string => x !== null)
      .map((unit) => ({
        policyId: unit.slice(0, POLICY_ID_LENGTH),
        assetName: unit.slice(POLICY_ID_LENGTH),
      }));
  }

  /**
   * Submit a transaction to the Hydra node. Note, unlike other providers,this returns a transaction hash (txId).
   * @param cborHex - The transaction in CBOR hex format usually the unsigned transaction
   * @returns The transaction hash (txId)
   */
  async submitTx(cborHex: string): Promise<string> {
    try {
      await this.newTx({
        type: "Tx ConwayEra",
        description: "",
        cborHex,
      });

      return new Promise<string>((resolve, reject) => {
        this.onMessage((message) => {
          if (message.tag === "TxValid" && message.transactionId) {
            resolve(message.transactionId);
          } else if (
            message.tag === "TxInvalid" &&
            message.transaction?.cborHex === cborHex
          ) {
            reject(new Error(JSON.stringify(message.validationError)));
          }
        });
      });
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * OPERATIONS
   */

  /**
   * Draft a commit transaction, which can be completed and later submitted to the L1 network.
   */
  async buildCommit(payload: unknown, headers: RawAxiosRequestHeaders = {}) {
    const txHex = await this.post("/commit", payload, headers);
    return txHex;
  }

  /**
   * Emitted by the server after drafting a commit transaction with the user provided utxos. Transaction returned to the user is in it's cbor representation encoded as Base16.
   */
  async subscribeCommit() {
    // todo
    await this.get("/commit");
  }

  /**
   * Obtain a list of pending deposit transaction ID's.
   */
  async buildCommits() {
    const commits = await this.get("/commits");
    return commits;
  }

  async subscribeCommits() {
    // todo
    await this.get("/commits");
  }

  /**
   * Recover deposited UTxO by providing a TxId of a deposit transaction in the request path.
   */
  async commitsTxId(headers: RawAxiosRequestHeaders = {}) {
    // todo
    await this.post("/commits/tx-id", {}, headers);
  }

  async subscribeCommitsTxId() {
    // todo
    await this.get("/commits/tx-id");
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
    const txHex = await this.post("/decommit", payload, headers);
    return txHex;
  }

  /**
   * Emitted by the server after drafting a decommit transaction.
   */
  async subscribeDecommit() {
    // todo
    await this.get("/decommit");
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
   * Cardano transaction to be submitted to the L1 network. Accepts transactions encoded as Base16 CBOR string, TextEnvelope type or JSON.
   */
  async publishCardanoTransaction(headers: RawAxiosRequestHeaders = {}) {
    // todo
    await this.post("/cardano-transaction", {}, headers);
  }

  /**
   * Successfully submitted a cardano transaction to the L1 network.
   */
  async subscribeCardanoTransaction() {
    // todo
    await this.get("/cardano-transaction");
  }

  /**
   * Events emitted by the Hydra node.
   * @param callback - The callback function to be called when a message is received
   */
  onMessage(
    callback: (
      data:
        | Greetings
        | PeerConnected
        | PeerDisconnected
        | PeerHandshakeFailure
        | HeadIsInitializing
        | Committed
        | HeadIsOpen
        | HeadIsClosed
        | HeadIsContested
        | ReadyToFanout
        | HeadIsAborted
        | HeadIsFinalized
        | TxValid
        | TxInvalid
        | SnapshotConfirmed
        | GetUTxOResponse
        | InvalidInput
        | PostTxOnChainFailed
        | CommandFailed
        | IgnoredHeadInitializing
        | DecommitInvalid
        | DecommitRequested
        | DecommitApproved
        | DecommitFinalized,
    ) => void,
  ) {
    this._eventEmitter.on("onmessage", (message) => {
      switch (message.tag) {
        case "Greetings":
          callback(message as Greetings);
          break;
        case "PeerConnected":
          callback(message as PeerConnected);
          break;
        case "onPeerDisconnected":
          callback(message as PeerDisconnected);
          break;
        case "PeerHandshakeFailure":
          callback(message as PeerHandshakeFailure);
          break;
        case "HeadIsInitializing":
          callback(message as HeadIsInitializing);
          break;
        case "Committed":
          callback(message as Committed);
          break;
        case "HeadIsOpen":
          callback(message as HeadIsOpen);
          break;
        case "HeadIsClosed":
          callback(message as HeadIsClosed);
          break;
        case "HeadIsContested":
          callback(message as HeadIsContested);
          break;
        case "ReadyToFanout":
          callback(message as ReadyToFanout);
          break;
        case "HeadIsAborted":
          callback(message as HeadIsAborted);
          break;
        case "HeadIsFinalized":
          callback(message as HeadIsFinalized);
          break;
        case "TxValid":
          callback(message as TxValid);
          break;
        case "TxInvalid":
          callback(message as TxInvalid);
          break;
        case "SnapshotConfirmed":
          callback(message as SnapshotConfirmed);
          break;
        case "GetUTxOResponse":
          callback(message as GetUTxOResponse);
          break;
        case "InvalidInput":
          callback(message as InvalidInput);
          break;
        case "PostTxOnChainFailed":
          callback(message as PostTxOnChainFailed);
          break;
        case "CommandFailed":
          callback(message as CommandFailed);
          break;
        case "IgnoredHeadInitializing":
          callback(message as IgnoredHeadInitializing);
          break;
        case "DecommitInvalid":
          callback(message as DecommitInvalid);
          break;
        case "DecommitRequested":
          callback(message as DecommitRequested);
          break;
        case "DecommitApproved":
          callback(message as DecommitApproved);
          break;
        case "DecommitFinalized":
          callback(message as DecommitFinalized);
          break;
        default:
          break;
      }
    });
  }

  onStatusChange(callback: (status: hydraStatus) => void) {
    this._eventEmitter.on("onstatuschange", callback);
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
   * NOT IMPLEMENTED FETCHERS
   */

  fetchAccountInfo(address: string): Promise<AccountInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchAddressTxs(
    address: string,
    options: IFetcherOptions = DEFAULT_FETCHER_OPTIONS,
  ): Promise<TransactionInfo[]> {
    throw new Error("Method not implemented.");
  }

  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    throw new Error("Method not implemented.");
  }

  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Method not implemented");
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    throw new Error("Method not implemented");
  }
}
