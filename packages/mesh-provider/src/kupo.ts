import axios, { AxiosInstance } from "axios";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  GovernanceProposalInfo,
  IFetcher,
  IFetcherOptions,
  Protocol,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";

import { parseHttpError } from "./utils";

// Unfortunately, Kupo is specifically used for fetching UTxOs and does not implement all methods of the IFetcher interface.
// Kupo is a specialized service for indexing Transaction outputs (UTxOs) and does not provide all the
// necessary methods for a full IFetcher implementation.
export class KupoProvider implements IFetcher {
  baseUrl: string;
  private readonly _axiosInstance: AxiosInstance;
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this._axiosInstance = axios.create({
      baseURL: this.baseUrl,
    });
  }
  fetchAccountInfo(address: string): Promise<AccountInfo> {
    throw new Error("Method not implemented.");
  }
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const { status, data } = await this.get(address);
    if (status === 200) {
      return data
        .map((utxo: any) => {
          const meshValue: Asset[] = this.kupoValueToMeshValue(utxo.value);
          if (asset) {
            if (!meshValue.some((v) => v.unit === asset)) {
              return null; // Skip UTxO if it does not contain the specified asset
            }
          }
          return {
            input: {
              txHash: utxo.transaction_id,
              outputIndex: utxo.output_index,
            },
            output: {
              address: utxo.address,
              amount: this.kupoValueToMeshValue(utxo.value),
            },
          };
        })
        .filter((utxo: any) => utxo !== null) as UTxO[];
    } else {
      parseHttpError(data);
    }
    return [];
  }
  fetchAddressTxs(
    address: string,
    options?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    throw new Error("Method not implemented.");
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
    cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }> {
    throw new Error("Method not implemented.");
  }
  fetchProtocolParameters(epoch: number): Promise<Protocol> {
    throw new Error("Method not implemented.");
  }
  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    throw new Error("Method not implemented.");
  }
  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    const { status, data } = await this.get(
      index === undefined ? `*@${hash}` : `${index}@${hash}`,
    );
    if (status === 200) {
      return data.map((utxo: any) => {
        return {
          input: {
            txHash: utxo.transaction_id,
            outputIndex: utxo.output_index,
          },
          output: {
            address: utxo.address,
            amount: this.kupoValueToMeshValue(utxo.value),
          },
        };
      }) as UTxO[];
    } else {
      parseHttpError(data);
    }
    return [];
  }
  fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Method not implemented.");
  }
  get(pattern: string): Promise<any> {
    try {
      return this._axiosInstance.get(`matches/${pattern}`);
    } catch (error) {
      throw new Error(`Failed to fetch data from Kupo: ${error}`);
    }
  }

  private kupoValueToMeshValue(value: any): any {
    if (value === null || value === undefined) return value;
    let meshValue: Asset[] = [];
    meshValue.push({
      unit: "lovelace",
      quantity: String(value.coins),
    });
    for (const [assetClass, quantity] of Object.entries(value.assets)) {
      let [policyId, assetName] = assetClass.split(".");
      if (!policyId) {
        throw new Error("Invalid asset class format found");
      }
      if (!assetName) {
        assetName = "";
      }
      meshValue.push({
        unit: policyId + assetName,
        quantity: String(quantity),
      });
    }
    return meshValue;
  }
}
