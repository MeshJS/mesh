import axios from "axios";

export class Blockfrost {
  private _instance;

  constructor({
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

  async _request({ endpoint = "", body = null, method = "GET" }) {
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

  /**
   * Information about a specific asset
   * @param asset Concatenation of the policy_id and hex-encoded asset_name
   * @returns asset
   */
  async assetSpecificAsset({ asset }: { asset: string }): Promise<{}> {
    return await this._request({ endpoint: `/assets/${asset}` });
  }

  async blockLatestBlock(): Promise<{}> {
    return await this._request({
      endpoint: "/blocks/latest",
    });
  }
}
