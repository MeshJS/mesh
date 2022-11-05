import axios, { AxiosInstance } from 'axios';
import { IFetcher, ISubmitter } from '@mesh/common/contracts';
import {
  deserializeNativeScript, fromNativeScript,
  parseHttpError, toBytes, toScriptRef,
} from '@mesh/common/utils';
import type {
  Asset, AssetMetadata, PlutusScript, Protocol, UTxO,
} from '@mesh/common/types';

export class KoiosProvider implements IFetcher, ISubmitter {
  private readonly _axiosInstance: AxiosInstance;

  constructor(network: 'api' | 'testnet' | 'guild', version = 0) {
    this._axiosInstance = axios.create({
      baseURL: `https://${network}.koios.rest/api/v${version}`,
    });
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const resolveScriptRef = (kScriptRef): string | undefined => {
      if (kScriptRef) {
        const script = kScriptRef.type.startsWith('plutus')
          ? {
              code: kScriptRef.bytes,
              version: kScriptRef.type.replace('plutus', ''),
            } as PlutusScript
          : fromNativeScript(
              deserializeNativeScript(kScriptRef.bytes)
            );

        return toScriptRef(script).to_hex();
      }

      return undefined;
    };

    try {
      const { data, status } = await this._axiosInstance.post(
        'address_info', { _addresses: [address] }
      );

      if (status === 200) {
        const utxos = data
          .flatMap((info: { utxo_set: [] }) => info.utxo_set)
          .map((utxo) => ({
            input: {
              outputIndex: utxo.tx_index,
              txHash: utxo.tx_hash,
            },
            output: {
              address: address,
              amount: [
                { unit: 'lovelace', quantity: utxo.value },
                ...utxo.asset_list.map(
                  (a) =>
                    ({
                      unit: `${a.policy_id}${a.asset_name}`,
                      quantity: `${a.quantity}`,
                    } as Asset)
                ),
              ],
              dataHash: utxo.datum_hash ?? undefined,
              plutusData: utxo.inline_datum.bytes ?? undefined,
              scriptRef: resolveScriptRef(utxo.reference_script),
            },
          })) as UTxO[];

        return asset !== undefined
          ? utxos.filter(
              (utxo) =>
                utxo.output.amount.find((a) => a.unit === asset) !== undefined
            )
          : utxos;
      }

      throw parseHttpError(data);
    } catch (error) {
      return [];
    }
  }

  async fetchAssetMetadata(_asset: string): Promise<AssetMetadata> {
    throw new Error('fetchAssetMetadata not implemented.');
  }

  async fetchHandleAddress(_handle: string): Promise<string> {
    throw new Error('fetchHandleAddress not implemented.');
  }

  async fetchProtocolParameters(epoch: number): Promise<Protocol> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `epoch_params?_epoch_no=${epoch}`
      );

      if (status === 200)
        return <Protocol>{
          coinsPerUTxOSize: data[0].coins_per_utxo_size,
          collateralPercent: data[0].collateral_percent,
          decentralisation: data[0].decentralisation,
          epoch: data[0].epoch_no,
          keyDeposit: data[0].key_deposit,
          maxBlockExMem: data[0].max_block_ex_mem.toString(),
          maxBlockExSteps: data[0].max_block_ex_steps.toString(),
          maxBlockHeaderSize: data[0].max_bh_size,
          maxBlockSize: data[0].max_block_size,
          maxCollateralInputs: data[0].max_collateral_inputs,
          maxTxExMem: data[0].max_tx_ex_mem.toString(),
          maxTxExSteps: data[0].max_tx_ex_steps.toString(),
          maxTxSize: data[0].max_tx_size,
          maxValSize: data[0].max_val_size.toString(),
          minFeeA: data[0].min_fee_a,
          minFeeB: data[0].min_fee_b,
          minPoolCost: data[0].min_pool_cost,
          poolDeposit: data[0].pool_deposit,
          priceMem: data[0].price_mem,
          priceStep: data[0].price_step,
        };

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
        return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
}
