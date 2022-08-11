import { ProtocolParameters } from '../types/index';
import axios, { AxiosInstance } from 'axios/index';
import { Axios } from './axios';

export class Blockfrost {
  private _instance!: AxiosInstance;
  private _networkEndpoint = '';
  private _blockfrostApiKey = '';

  constructor() {}

  async init({
    blockfrostApiKey,
    network,
  }: {
    blockfrostApiKey: string;
    network: number;
  }) {
    this._blockfrostApiKey = blockfrostApiKey;
    this._networkEndpoint =
      network == 0
        ? 'https://cardano-testnet.blockfrost.io/api/v0'
        : 'https://cardano-mainnet.blockfrost.io/api/v0';
    this._instance = axios.create({
      baseURL: this._networkEndpoint,
      headers: {
        project_id: blockfrostApiKey,
      },
    });
  }

  isLoaded() {
    return this._instance !== undefined;
  }

  private async _request({
    endpoint = '',
    body = null,
    method = 'GET',
    headers = null,
  }: {
    endpoint: string;
    body?: null | string | Buffer;
    method?: string;
    headers?: {} | null;
  }) {
    if (method == 'GET') {
      return await this._instance
        .get(`${endpoint}`)
        .then(({ data }) => {
          return data;
        })
        .catch((error) => {
          throw error;
        });
    }

    if (method == 'POST') {
      if (headers) {
        let temp_instance = new Axios({
          baseURL: this._networkEndpoint,
          headers: { project_id: this._blockfrostApiKey },
        });

        return await temp_instance
          .post({ endpoint: `${endpoint}`, data: body, headers: headers })
          .then(({ data }) => {
            return data;
          })
          .catch((error) => {
            throw error;
          });
      } else {
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

  async addressesAddressUtxosAsset({
    address,
    asset,
  }: {
    address: string;
    asset: string;
  }): Promise<[]> {
    return await this._request({
      endpoint: `/addresses/${address}/utxos/${asset}`,
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
      endpoint: '/blocks/latest',
    });
  }

  /**
   * Return the protocol parameters for the latest epoch.
   * @returns
   */
  async epochsLatestEpochProtocolParameters(): Promise<ProtocolParameters> {
    return await this._request({
      endpoint: '/epochs/latest/parameters',
    });
  }

  async transactionsSpecificTransaction({
    hash,
  }: {
    hash: string;
  }): Promise<{}> {
    return await this._request({
      endpoint: `/txs/${hash}`,
    });
  }

  async transactionsTransactionUTXOs({ hash }: { hash: string }): Promise<{}> {
    return await this._request({
      endpoint: `/txs/${hash}/utxos`,
    });
  }

  async transactionSubmitTx({ tx }: { tx: string }): Promise<{}> {
    return await this._request({
      endpoint: `/tx/submit`,
      body: Buffer.from(tx, 'hex'),
      method: 'POST',
      headers: { 'Content-Type': 'application/cbor' },
    });
  }

  // const result = await blockfrostRequest(
  //   `/tx/submit`,
  //   { 'Content-Type': 'application/cbor' },
  //   Buffer.from(tx, 'hex')
  // );
}
