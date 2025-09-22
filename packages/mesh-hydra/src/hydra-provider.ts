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

import { parseHttpError } from "./utils";
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
   * Connects to the Hydra Head. This command is a no-op when a Head is already open.
   */
  async connect() {
    if (this._status !== "DISCONNECTED") {
      return;
    }
    this._connection.connect();
    this._status = "CONNECTED";
  }

  /**
   * Disconnects from the Hydra Head.
   *
   * @param timeout - Optional timeout in milliseconds default to 5 minutes to wait for the disconnect operation to complete.
   *                  If not provided, the default disconnect timeout will be used.
   *                  Useful for customizing how long to wait before disconnecting.
   */
  async disconnect(timeout?: number) {
    if (this._status === "DISCONNECTED" || this._status === "IDLE") {
      return;
    }
  
    const minTimeout = 1 * 60 * 1000;
    const defaultTimeout = 5 * 60 * 1000;
  
    if (timeout !== undefined && timeout < minTimeout) {
      throw new Error("Timeout must be at least 1 minute (60000 ms)");
    }
  
    const effectiveTimeout = timeout ?? defaultTimeout;
  
    await this._connection.disconnect(effectiveTimeout);
    this._status = "DISCONNECTED";
    this._eventEmitter.emit("onstatuschange", this._status);
  }
  
  /**
   * FETCHERS and SUBMITTERS
   */

  /**
   * UTXOs of the address.
   * @param address - The address to fetch UTXO
   * @param asset - UTXOs of a given asset​
   * @returns - Array of UTxOs
   */
  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    const utxos = await this.fetchUTxOs();
    return utxos.filter((utxo) => utxo.output.address === address);
  }

  /**
   * Fetch the latest protocol parameters.
   * @param epoch
   * @returns - Protocol parameters
   */
  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
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
   * Submit a transaction to the Hydra node. Note, unlike other providers, Hydra does not return a transaction hash.
   * @param tx - The transaction in CBOR hex format usually obtained from an unsigned transaction
   */
  async submitTx(tx: string): Promise<string> {
    try {
      await this.newTx( {
        type: "Witnessed Tx ConwayEra",
        description: "",
        cborHex: tx,
      });
      const txId = await new Promise<string>((resolve) => {
        this.onMessage((message) => {
          if (message.tag === "TxValid") {
            if (message.transaction && message.transaction.cborHex === tx) {
              resolve(message.transaction.txId!);
            }
          }
          if (message.tag === "TxInvalid") {
            if (message.transaction && message.transaction.cborHex === tx) {
              throw JSON.stringify(message.validationError);
            }
          }
        });
      });
      return txId;
    } catch (error) {
      throw parseHttpError(error);
    }
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
    this._connection.send({ tag: "Init" });
  }

  /**
   * Aborts a head before it is opened. This can only be done before all participants have committed. Once opened, the head can't be aborted anymore but it can be closed using: `Close`.
   */
  async abort() {
    this._connection.send({ tag: "Abort" });
  }

  /**
   * Submit a transaction through the head. Note that the transaction is only broadcast if well-formed and valid.
   *
   * @param transaction The transaction in text envelope format, containing:
   *   - type: The type of the transaction (e.g., "Unwitnessed Tx ConwayEra").
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The CBOR-encoded unsigned transaction.
   *   - txId: (Optional) The transaction ID.
   * @param type Allowed values: "Tx ConwayEra""Unwitnessed Tx ConwayEra""Witnessed Tx ConwayEra"
   * @param description 
   */
  async newTx(transaction: hydraTransaction) {
    const payload = {
      tag: "NewTx",
      transaction: transaction,
    };
    this._connection.send(payload);
  }

  /**
   * Request to decommit a UTxO from a Head by providing a decommit tx. Upon reaching consensus, this will eventually result in corresponding transaction outputs becoming available on the layer 1.
   *
   * @param decommitTx The decommit transaction in text envelope format, containing:
   *   - type: The type of the transaction (e.g., "Unwitnessed Tx ConwayEra").
   *   - description: (Optional) A human-readable description of the transaction.
   *   - cborHex: The CBOR-encoded unsigned transaction.
   * @param type Allowed values: "Tx ConwayEra""Unwitnessed Tx ConwayEra""Witnessed Tx ConwayEra"
   * @param description
   */
  async decommit(
    decommitTx: hydraTransaction
  ) {
    const payload = {
      tag: "Decommit",
      decommitTx: {
        type: decommitTx.type,
        description: decommitTx.description,
        cborHex: decommitTx.cborHex,
      },
    };
    this._connection.send(payload);
  }

  /**
   * Terminate a head with the latest known snapshot. This effectively moves the head from the Open state to the Close state where the contestation phase begin. As a result of closing a head, no more transactions can be submitted via NewTx.
   */
  async close() {
    this._connection.send({ tag: "Close" });
  }

  /**
   * Challenge the latest snapshot announced as a result of a head closure from another participant. Note that this necessarily contest with the latest snapshot known of your local Hydra node. Participants can only contest once.
   */
  async contest() {
    this._connection.send({ tag: "Contest" });
  }

  /**
   * Finalize a head after the contestation period passed. This will distribute the final (as closed and maybe contested) head state back on the layer 1.
   */
  /**
   * Finalize a head after the contestation period has passed.
   * This will distribute the final head state back on layer 1.
   * Resolves when the head is finalized.
   */
  async fanout(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onMessage = (message: any) => {
        if (message?.tag === "HeadIsFinalized") {
          this._eventEmitter.off("onmessage", onMessage);
          this._status = "FINAL";
          this._eventEmitter.emit("onstatuschange", this._status);
          resolve();
        } else if (message?.tag === "FanoutFailed") {
          this._eventEmitter.off("onmessage", onMessage);
          reject(new Error("Fanout failed"));
        }
      };

      this._eventEmitter.on("onmessage", onMessage);
      this._connection.send({ tag: "Fanout" });
    });
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
    headers: RawAxiosRequestHeaders = {}
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
  async publishCardanoTransaction(
    payload: unknown,
    headers: RawAxiosRequestHeaders = {}
  ) {
    const txHex = await this.post("/cardano-transaction", payload, headers);
    return txHex;
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
        | DecommitFinalized
    ) => void
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
    headers: RawAxiosRequestHeaders
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

  async fetchAssetsUTxOs(policyId: string): Promise<UTxO[]> {
    if (policyId.length !== POLICY_ID_LENGTH) {
      throw new Error("Invalid policyid length");
    }
    const utxo = await this.fetchUTxOs();
    const assets = utxo.filter((asset) =>
      asset.output.amount.find((a) => a.unit === policyId)
    );
    return assets;
  }

  /**
   * NOT IMPLEMENTED FETCHERS
   */

  fetchAccountInfo(address: string): Promise<AccountInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchAddressTxs(
    address: string,
    options: IFetcherOptions = DEFAULT_FETCHER_OPTIONS
  ): Promise<TransactionInfo[]> {
    throw new Error("Method not implemented.");
  }

  fetchAssetAddresses(
    asset: string
  ): Promise<{ address: string; quantity: string }[]> {
    throw new Error("Method not implemented.");
  }

  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    throw new Error("Method not implemented.");
  }

  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    throw new Error("Method not implemented.");
  }

  fetchCollectionAssets(
    policyId: string,
    cursor?: string | number | undefined
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    throw new Error("Method not implemented.");
  }

  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Method not implemented");
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    throw new Error("Method not implemented.");
  }
}
