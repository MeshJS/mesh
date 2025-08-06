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
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    throw new Error("Method not implemented.");
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
            amount: [],
          },
        };
      }) as UTxO[];
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
}
