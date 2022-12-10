import axios, { AxiosInstance } from 'axios';
import { SUPPORTED_HANDLES } from '@mesh/common/constants';
import { IFetcher, ISubmitter } from '@mesh/common/contracts';
import {
  deserializeNativeScript, fromNativeScript, fromUTF8,
  parseAssetUnit, parseHttpError, resolveRewardAddress,
  toBytes, toScriptRef, toUTF8,
} from '@mesh/common/utils';
import type {
  AccountInfo, Asset, AssetMetadata,
  PlutusScript, Protocol, UTxO,
} from '@mesh/common/types';

export class KoiosProvider implements IFetcher, ISubmitter {
  private readonly _axiosInstance: AxiosInstance;

  constructor(network: 'api' | 'preview' | 'preprod' | 'guild', version = 0) {
    this._axiosInstance = axios.create({
      baseURL: `https://${network}.koios.rest/api/v${version}`,
    });
  }

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    try {
      const rewardAddress = address.startsWith('addr')
        ? resolveRewardAddress(address)
        : address;

      const { data, status } = await this._axiosInstance.post(
        'account_info', { _stake_addresses: [rewardAddress] },
      );

      if (status === 200)
        return <AccountInfo>{
          poolId: data[0].delegated_pool,
          active: data[0].status === 'registered',
          balance: data[0].total_balance.toString(),
          rewards: data[0].rewards_available,
          withdrawals: data[0].withdrawals,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const resolveScriptRef = (kScriptRef): string | undefined => {
      if (kScriptRef) {
        const script = kScriptRef.type.startsWith('plutus')
          ? <PlutusScript>{
              code: kScriptRef.bytes,
              version: kScriptRef.type.replace('plutus', ''),
            }
          : fromNativeScript(deserializeNativeScript(kScriptRef.bytes));

        return toScriptRef(script).to_hex();
      }

      return undefined;
    };

    try {
      const { data, status } = await this._axiosInstance.post(
        'address_info', { _addresses: [address] },
      );

      if (status === 200) {
        const utxos = <UTxO[]>data
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
                    <Asset>{
                      unit: `${a.policy_id}${a.asset_name}`,
                      quantity: `${a.quantity}`,
                    }
                ),
              ],
              dataHash: utxo.datum_hash ?? undefined,
              plutusData: utxo.inline_datum?.bytes ?? undefined,
              scriptRef: resolveScriptRef(utxo.reference_script),
            },
          }));

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

  async fetchAssetAddresses(asset: string): Promise<{ address: string; quantity: string }[]> {
    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `asset_address_list?_asset_policy=${policyId}&_asset_name=${assetName}`,
      );

      if (status === 200)
        return data.map((item) => ({
          address: item.payment_address,
          quantity: item.quantity,
        }));

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `asset_info?_asset_policy=${policyId}&_asset_name=${assetName}`,
      );

      if (status === 200)
        return <AssetMetadata>{
          ...data[0].minting_tx_metadata[721][policyId][toUTF8(assetName)],
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchHandleAddress(handle: string): Promise<string> {
    try {
      const assetName = fromUTF8(handle.replace('$', ''));
      const { data, status } = await this._axiosInstance.get(
        `asset_address_list?_asset_policy=${SUPPORTED_HANDLES[1]}&_asset_name=${assetName}`,
      );

      if (status === 200)
        return data[0].payment_address;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchProtocolParameters(epoch: number): Promise<Protocol> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `epoch_params?_epoch_no=${epoch}`,
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

      if (status === 202) return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }
}
