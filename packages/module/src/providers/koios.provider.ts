import axios, { AxiosInstance } from 'axios';
import { SUPPORTED_NETWORKS } from '@mesh/common/constants';
import { IFetcher, ISubmitter } from '@mesh/common/contracts';
import { parseHttpError, toBytes } from '@mesh/common/utils';
import type { Asset, AssetMetadata, Protocol, UTxO } from '@mesh/common/types';

export class KoiosProvider implements IFetcher, ISubmitter {
  private readonly _axiosInstance: AxiosInstance;

  constructor(networkId: number, version = 0) {
    const network = SUPPORTED_NETWORKS.get(networkId) === 'mainnet' ? 'api' : 'testnet';

    this._axiosInstance = axios.create({
      baseURL: `https://${network}.koios.rest/api/v${version}`,
    });
  }

  async fetchAssetMetadata(_asset: string): Promise<AssetMetadata> {
    throw new Error('Method not implemented.');
  }

  async fetchAssetUtxosFromAddress(asset: string, address: string): Promise<UTxO[]> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `address_info?_address=${address}`
      );

      if (status === 200)
        return data
          .flatMap((info: { utxo_set: []; }) => info.utxo_set)
          .map((utxo) => ({
            input: {
              outputIndex: utxo.tx_index,
              txHash: utxo.tx_hash,
            },
            output: {
              address: address,
              amount: [
                { unit: 'lovelace', quantity: utxo.value },
                ...utxo.asset_list
                  .map((a) => ({
                    unit: `${a.policy_id}${a.asset_name}`,
                    quantity: `${a.quantity}`
                  }) as Asset)
              ],
              dataHash: utxo.datum_hash,
            },
          }) as UTxO)
          .filter(
            (utxo: UTxO) =>
              utxo.output.amount.find((a) => a.unit === asset) !== undefined
          );

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchProtocolParameters(epoch: number): Promise<Protocol> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `epoch_params?_epoch_no=${epoch}`
      );

      if (status === 200)
        return {
          coinsPerUTxOSize: data.coins_per_utxo_size,
          collateralPercent: data.collateral_percent,
          decentralisation: data.decentralisation_param,
          epoch: data.epoch_no,
          keyDeposit: data.key_deposit,
          maxBlockExMem: data.max_block_ex_mem.toString(),
          maxBlockExSteps: data.max_block_ex_steps.toString(),
          maxBlockHeaderSize: data.max_bh_size,
          maxBlockSize: data.max_block_size,
          maxCollateralInputs: data.max_collateral_inputs,
          maxTxExMem: data.max_tx_ex_mem.toString(),
          maxTxExSteps: data.max_tx_ex_steps.toString(),
          maxTxSize: data.max_tx_size,
          maxValSize: data.max_val_size.toString(),
          minFeeA: data.min_fee_a,
          minFeeB: data.min_fee_b,
          minPoolCost: data.min_pool_cost,
          poolDeposit: data.pool_deposit,
          priceMem: data.price_mem,
          priceStep: data.price_step,
        } as Protocol;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async submitTx(tx: string): Promise<string> {
    try {
      const headers = { 'Content-Type': 'application/cbor' };
      const { data, status } = await this._axiosInstance.post(
        'submittx', toBytes(tx), { headers },
      );

      if (status === 202)
        return data as string;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
}
