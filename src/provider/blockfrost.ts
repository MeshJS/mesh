import { ProtocolParameters } from "../types/index.js";
import axios, { AxiosInstance } from "axios/index.js";

export class Blockfrost {
  private _instance: AxiosInstance;

  constructor() {}

  async init({
    blockfrostApiKey,
    network,
  }: {
    blockfrostApiKey: string;
    network: number;
  }) {
    const networkEndpoint =
      network == 0
        ? "https://cardano-testnet.blockfrost.io/api/v0"
        : "https://cardano-mainnet.blockfrost.io/api/v0";
    this._instance = axios.create({
      baseURL: networkEndpoint,
      headers: {
        project_id: blockfrostApiKey,
      },
    });
  }

  isLoaded() {
    return this._instance !== undefined;
  }

  private async _request({
    endpoint = "",
    body = null,
    method = "GET",
  }: {
    endpoint: string;
    body?: null | string | Buffer;
    method?: string;
  }) {
    if (method == "GET") {
      return await this._instance
        .get(`${endpoint}`)
        .then(({ data }) => {
          return data;
        })
        .catch((error) => {
          throw error;
        });
    }

    if (method == "POST") {
      return await this._instance
        .post(`${endpoint}`, body)
        .then(({ data }) => {
          return data;
        })
        .catch((error) => {
          throw error;
        });
    }
  }

  async addressesAddressUtxos({
    address,
    page = 1,
    limit = 100,
  }: {
    address: string;
    page?: number;
    limit?: number;
  }): Promise<[]> {
    return await this._request({
      endpoint: `/addresses/${address}/utxos?page=${page}&count=${limit}`,
    });
  }

  /**
   * Information about a specific asset
   * @param asset Concatenation of the policy_id and hex-encoded asset_name
   * @returns asset
   */
  async assetSpecificAsset({
    asset,
  }: {
    asset: string;
  }): Promise<{ onchain_metadata: { image: string } }> {
    return await this._request({ endpoint: `/assets/${asset}` });
  }

  /**
   * Return the transactions within the latest block.
   * @returns
   */
  async blockLatestBlock(): Promise<{}> {
    return await this._request({
      endpoint: "/blocks/latest",
    });
  }

  /**
   * Return the protocol parameters for the latest epoch.
   * @returns
   */
  async epochsLatestEpochProtocolParameters(): Promise<ProtocolParameters> {
    return await this._request({
      endpoint: "/epochs/latest/parameters",
    });
  }
}
