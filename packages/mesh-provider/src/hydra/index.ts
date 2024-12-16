import { EventEmitter } from "events";
import axios, { AxiosInstance } from "axios";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  GovernanceProposalInfo,
  IFetcher,
  ISubmitter,
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";

import { parseHttpError } from "../utils";
import { toUTxO } from "./convertor";
import { HydraConnection } from "./hydra-connection";
import { HydraStatus, HydraUTxO } from "./types";

/**
 * HydraProvider is a tool for administrating & interacting with Hydra Heads.
 *
 * Usage:
 * ```
 * import { HydraProvider } from "@meshsdk/core";
 *
 * const hydraProvider = new HydraProvider({url:'http://123.45.67.890:4001'});
 */
export class HydraProvider implements IFetcher, ISubmitter {
  private _connection: HydraConnection;
  private _status: HydraStatus = "DISCONNECTED";
  private readonly _eventEmitter: EventEmitter;
  private readonly _axiosInstance: AxiosInstance;

  constructor({ url, history = false }: { url: string; history?: boolean }) {
    this._eventEmitter = new EventEmitter();
    this._connection = new HydraConnection({
      url: url,
      eventEmitter: this._eventEmitter,
      history: history,
    });
    this._axiosInstance = axios.create({ baseURL: url });
  }

  async connect() {
    if (this._status !== "DISCONNECTED") {
      return;
    }
    this._status = "CONNECTING";
    this._connection.connect();
  }

  fetchAccountInfo(address: string): Promise<AccountInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    const utxos = await this.fetchUTxOs();
    return utxos.filter((utxo) => utxo.output.address === address);
  }

  fetchAssetAddresses(
    asset: string,
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
    cursor?: string | number | undefined,
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    throw new Error("Method not implemented.");
  }

  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Method not implemented");
  }

  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
    try {
      const { data, status } = await this._axiosInstance.get(
        "protocol-parameters",
      );

      if (status === 200) {
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

        // const { PlutusV1, PlutusV2, PlutusV3 } = data.costModels;

        // return {
        //   protocolParams,
        //   plutusV1: PlutusV1,
        //   plutusV2: PlutusV2,
        //   plutusV3: PlutusV3,
        // };

        return protocolParams;
      }

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    throw new Error("Method not implemented.");
  }

  async fetchUTxOs(): Promise<UTxO[]> {
    const { data, status } = await this._axiosInstance.get(`snapshot/utxo`);
    if (status === 200) {
      const utxos: UTxO[] = [];
      for (const [key, value] of Object.entries(data)) {
        const utxo = toUTxO(value as HydraUTxO, key);
        utxos.push(utxo);
      }
      return utxos;
    }
    throw parseHttpError(data);
  }

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
   * Submit a transaction to the Hydra node. Note, unlike other providers, Hydra does not return a transaction hash.
   * @param tx - The transaction in CBOR hex format
   */
  async submitTx(tx: string): Promise<string> {
    try {
      const payload = {
        tag: "NewTx",
        transaction: {
          type: "Witnessed Tx ConwayEra",
          description: "Ledger Cddl Format",
          cborHex: tx,
        },
      };
      this.send(payload);

      const txId = await new Promise<string>((resolve) => {
        this.onMessage((message) => {
          if (message.transaction && message.transaction.cborHex === tx) {
            if (message.tag === "TxValid") {
              console.log("txid", message.transaction.txId);
              resolve(message.transaction.txId);
            } else if (message.tag == "TxInvalid") {
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
   * Initializes a new Head. This command is a no-op when a Head is already open and the server will output an CommandFailed message should this happen.
   */
  async initializesHead() {
    this.send({ tag: "Init" });
  }

  send(data: any): void {
    this._connection.send(data);
  }

  onMessage(callback: (message: any) => void) {
    this._eventEmitter.on("onmessage", callback);
  }

  onStatusChange(callback: (status: HydraStatus) => void) {
    this._eventEmitter.on("onstatuschange", callback);
  }
}
