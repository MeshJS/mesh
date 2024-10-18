import { EventEmitter } from "events";
import axios, { AxiosInstance } from "axios";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  IFetcher,
  ISubmitter,
  Protocol,
  toBytes,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";

import { HydraAssets, HydraUTxO } from "./types";
import { parseHttpError } from "./utils";

import "@meshsdk/core-cst";

/**
 * Experimental Hydra provider - WIP and breaking changes are expected
 */
export class HydraProvider {
  private readonly _baseUrl: string;
  private readonly _eventEmitter: EventEmitter;
  private _client: WebSocket | undefined;
  private readonly _axiosInstance: AxiosInstance;

  constructor(url: string) {
    this._baseUrl = url;
    this._eventEmitter = new EventEmitter();

    this._axiosInstance = axios.create({ baseURL: url });
  }

  /**
   * Submit a transaction to the Hydra node. Note, unlike other providers, Hydra does not return a transaction hash.
   * @param tx - The transaction in CBOR hex format
   */
  async submitTx(tx: string): Promise<void> {
    try {
      const payload = {
        tag: "NewTx",
        transaction: {
          type: "Witnessed Tx ConwayEra",
          description: "Ledger Cddl Format",
          cborHex: tx,
        },
      };
      this.check();
      this.sendCommand(payload);
      // throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async connect(): Promise<void> {
    const _client = new WebSocket(this._baseUrl);

    await new Promise((resolve) => {
      _client.addEventListener("open", () => resolve(true), { once: true });
    });

    _client.onopen = () => {
      console.log("Connected to Hydra");
    };
    _client.onerror = (error) => {
      console.error("Error on Hydra websocket: ", error);
    };
    _client.onclose = () => {
      console.error("Hydra websocket closed");
    };
    _client.onmessage = this.receiveMessage.bind(this);

    this._client = _client;
  }

  check() {
    if (this._client === undefined) {
      throw new Error("HydraProvider not connected. Do connect() first.");
    }
  }

  /**
   * Initializes a new Head. This command is a no-op when a Head is already open and the server will output an CommandFailed message should this happen.
   */
  async initializesHead() {
    this.check();
    this.sendCommand({ tag: "Init" });
  }

  async fetchUtxoSnapshot(): Promise<UTxO[]> {
    const { data, status } = await this._axiosInstance.get(`snapshot/utxo`);
    if (status === 200) {
      console.log("UTXOs: ", data);
      const utxos: UTxO[] = [];
      for (const [key, value] of Object.entries(data)) {
        const utxo = this.toUTxO(value as HydraUTxO, key);
        utxos.push(utxo);
      }

      return utxos;
    }
    throw parseHttpError(data);
  }

  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    const utxos = await this.fetchUtxoSnapshot();
    return utxos.filter((utxo) => utxo.output.address === address);
  }

  async fetchProtocolParameters(): Promise<Protocol> {
    try {
      const { data, status } = await this._axiosInstance.get(
        "protocol-parameters",
      );

      if (status === 200)
        return castProtocol({
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

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
  // fetchAccountInfo(address: string): Promise<AccountInfo> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchAssetAddresses(
  //   asset: string,
  // ): Promise<{ address: string; quantity: string }[]> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchBlockInfo(hash: string): Promise<BlockInfo> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchCollectionAssets(
  //   policyId: string,
  //   cursor?: number | string,
  // ): Promise<{ assets: Asset[]; next?: string | number | null }> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchHandle(handle: string): Promise<object> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchHandleAddress(handle: string): Promise<string> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchTxInfo(hash: string): Promise<TransactionInfo> {
  //   throw new Error("Method not implemented.");
  // }
  // fetchUTxOs(hash: string): Promise<UTxO[]> {
  //   throw new Error("Method not implemented.");
  // }
  // get(url: string): Promise<any> {
  //   throw new Error("Method not implemented.");
  // }

  async receiveMessage(message: MessageEvent) {
    const data = JSON.parse(message.data);
    this._eventEmitter.emit("hydraMessage", data);
  }

  onMessage(callback: (message: unknown) => void) {
    this._eventEmitter.on("hydraMessage", callback);
  }

  private sendCommand(data: {}) {
    this._client!.send(JSON.stringify(data));
  }

  private toUTxO = (hUTxO: HydraUTxO, txId: string): UTxO => {
    const [txHash, txIndex] = txId.split("#");

    return {
      input: {
        outputIndex: Number(txIndex),
        txHash: txHash!,
      },
      output: {
        address: hUTxO.address,
        amount: this.toAssets(hUTxO.value),
        dataHash: hUTxO.datumhash ?? undefined,
        plutusData: hUTxO.inlineDatum?.toString() ?? undefined, // TODO: cast to correct cbor
        scriptHash: hUTxO.referenceScript?.toString() ?? undefined, // TODO: cast to correct cbor
      },
    };
  };

  private toAssets = (hAssets: HydraAssets): Asset[] => {
    const assets: Asset[] = [];
    for (const [policy, amount] of Object.entries(hAssets)) {
      assets.push({
        unit: policy,
        quantity: amount.toString(),
      });
    }
    return assets;
  };
}
