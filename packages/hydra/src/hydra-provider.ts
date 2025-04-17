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
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";

import { parseHttpError } from "./utils";
import { toUTxO } from "./convertor";
import { HydraConnection } from "./hydra-connection";
import { HydraStatus, HydraTransaction, HydraUTxO } from "./types";
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
 * const hydraProvider = new HydraProvider({url:'http://123.45.67.890:4001'});
 */
export class HydraProvider implements IFetcher, ISubmitter {
  private _connection: HydraConnection;
  private _status: HydraStatus = "DISCONNECTED";
  private readonly _eventEmitter: EventEmitter;
  private readonly _axiosInstance: AxiosInstance;

  constructor({
    url,
    history = false,
    address,
    wsUrl,
  }: {
    url: string;
    history?: boolean;
    address?: string;
    wsUrl?: string;
  }) {
    this._eventEmitter = new EventEmitter();
    this._connection = new HydraConnection({
      url: url,
      eventEmitter: this._eventEmitter,
      history: history,
      address: address,
      wsUrl: wsUrl,
    });
    this._axiosInstance = axios.create({
      baseURL: url,
    });
  }

  /**
   * Connects to the Hydra Head. This command is a no-op when a Head is already open.
   */
  async connect() {
    if (this._status !== "DISCONNECTED") {
      return;
    }
    this._status = "CONNECTING";
    this._connection.connect();
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
  async fetchUTxOs(): Promise<UTxO[]> {
    return await this.subscribeSnapshotUtxo();
  }

  /**
   * Submit a transaction to the Hydra node. Note, unlike other providers, Hydra does not return a transaction hash.
   * @param tx - The transaction in CBOR hex format
   */
  async submitTx(tx: string): Promise<string> {
    try {
      await this.newTx(tx, "Witnessed Tx ConwayEra");
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
    this.send({ tag: "Init" });
  }

  /**
   * Aborts a head before it is opened. This can only be done before all participants have committed. Once opened, the head can't be aborted anymore but it can be closed using: `Close`.
   */
  async abort() {
    this.send({ tag: "Abort" });
  }

  /**
   * Submit a transaction through the head. Note that the transaction is only broadcast if well-formed and valid.
   *
   * @param cborHex The base16-encoding of the CBOR encoding of some binary data
   * @param type Allowed values: "Tx ConwayEra""Unwitnessed Tx ConwayEra""Witnessed Tx ConwayEra"
   * @param description
   */
  async newTx(
    cborHex: string,
    type:
      | "Tx ConwayEra"
      | "Unwitnessed Tx ConwayEra"
      | "Witnessed Tx ConwayEra",
    description = "",
    txId?: string
  ) {
    const transaction: HydraTransaction = {
      type: type,
      description: description,
      cborHex: cborHex,
      txId: txId,
    };
    const payload = {
      tag: "NewTx",
      transaction: transaction,
    };
    this.send(payload);
  }

  /**
   * Request to decommit a UTxO from a Head by providing a decommit tx. Upon reaching consensus, this will eventually result in corresponding transaction outputs becoming available on the layer 1.
   *
   * @param cborHex The base16-encoding of the CBOR encoding of some binary data
   * @param type Allowed values: "Tx ConwayEra""Unwitnessed Tx ConwayEra""Witnessed Tx ConwayEra"
   * @param description
   */
  async decommit(
    cborHex: string,
    type:
      | "Tx ConwayEra"
      | "Unwitnessed Tx ConwayEra"
      | "Witnessed Tx ConwayEra",
    description: string
  ) {
    const payload = {
      tag: "Decommit",
      decommitTx: {
        type: type,
        description: description,
        cborHex: cborHex,
      },
    };
    this.send(payload);
  }

  /**
   * Terminate a head with the latest known snapshot. This effectively moves the head from the Open state to the Close state where the contestation phase begin. As a result of closing a head, no more transactions can be submitted via NewTx.
   */
  async close() {
    this.send({ tag: "Close" });
  }

  /**
   * Challenge the latest snapshot announced as a result of a head closure from another participant. Note that this necessarily contest with the latest snapshot known of your local Hydra node. Participants can only contest once.
   */
  async contest() {
    this.send({ tag: "Contest" });
  }

  /**
   * Finalize a head after the contestation period passed. This will distribute the final (as closed and maybe contested) head state back on the layer 1.
   */
  async fanout() {
    this.send({ tag: "Fanout" });
  }

  send(data: any): void {
    this._connection.send(data);
  }

  /**
   * OPERATIONS
   */

  /**
   * Draft a commit transaction, which can be completed and later submitted to the L1 network.
   */
  async buildCommit(payload: any, headers: RawAxiosRequestHeaders = {}) {
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
      const utxo = toUTxO(value as HydraUTxO, key);
      utxos.push(utxo);
    }
    return utxos;
  }

  /**
   * Provide decommit transaction that needs to be applicable to the Hydra's local ledger state. Specified transaction outputs will be available on layer 1 after decommit is successfully processed.
   */
  async publishDecommit(headers: RawAxiosRequestHeaders = {}) {
    // todo
    await this.post("/decommit", {}, headers);
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

  onStatusChange(callback: (status: HydraStatus) => void) {
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
    payload: any,
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
