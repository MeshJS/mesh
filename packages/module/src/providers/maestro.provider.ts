import axios, { AxiosInstance } from 'axios';
import { SUPPORTED_HANDLES } from '@mesh/common/constants';
import { IFetcher, ISubmitter } from '@mesh/common/contracts';
import {
  fromUTF8,
  parseAssetUnit,
  parseHttpError,
  resolveRewardAddress,
  toBytes,
} from '@mesh/common/utils';
import type {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  Protocol,
  TransactionInfo,
  UTxO,
} from '@mesh/common/types';

export class MaestroProvider implements IFetcher, ISubmitter {
  private readonly _axiosInstance: AxiosInstance;

  constructor(network: string, key: string) {
    this._axiosInstance = axios.create({
      baseURL: `https://${network}.gomaestro-api.org`,
      headers: { 'api-key': key },
    });
  }

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const rewardAddress = address.startsWith('addr')
      ? resolveRewardAddress(address)
      : address;

    try {
      const { data, status } = await this._axiosInstance.get(
        `accounts/${address}`
      );

      if (status === 200){
        console.log('data', data)
        return <AccountInfo>{
          poolId: data.pool_id,
          active: data.active || data.active_epoch !== null,
          balance: data.controlled_amount,
          rewards: data.withdrawable_amount,
          withdrawals: data.withdrawals_sum,
        };}

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {

    throw new Error('not implemented.');

    const filter = asset !== undefined ? `/${asset}` : '';
    const url = `addresses/${address}/utxos` + filter;

    const paginateUTxOs = async (
      page = 1,
      utxos: UTxO[] = []
    ): Promise<UTxO[]> => {
      const { data, status } = await this._axiosInstance.get(
        `${url}?page=${page}`
      );

      if (status === 200)
        return data.length > 0
          ? paginateUTxOs(page + 1, [
              ...utxos,
              ...(await Promise.all(data.map(toUTxO))),
            ])
          : utxos;

      throw parseHttpError(data);
    };

    const toUTxO = async (utxos) => {
      console.log(utxos);
    }

    try {
      return await paginateUTxOs();
    } catch (error) {
      return [];
    }
  }

  async fetchAssetAddresses(
    asset: string
  ): Promise<{ address: string; quantity: string }[]> {

    throw new Error('not implemented.');

    const paginateAddresses = async <T>(
      page = 1,
      addresses: T[] = []
    ): Promise<T[]> => {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}/addresses?page=${page}`
      );

      if (status === 200)
        return data.length > 0
          ? paginateAddresses(page + 1, [...addresses, ...data])
          : addresses;

      throw parseHttpError(data);
    };

    try {
      return await paginateAddresses<{ address: string; quantity: string }>();
    } catch (error) {
      return [];
    }
  }

  async fetchAssetMetadata(asset: string): Promise<AssetMetadata> {

    throw new Error('not implemented.');

    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}`
      );

      if (status === 200)
        return <AssetMetadata>{
          ...data.onchain_metadata,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchBlockInfo(hash: string): Promise<BlockInfo> {

    throw new Error('not implemented.');

    try {
      const { data, status } = await this._axiosInstance.get(`blocks/${hash}`);

      if (status === 200)
        return <BlockInfo>{
          confirmations: data.confirmations,
          epoch: data.epoch,
          epochSlot: data.epoch_slot.toString(),
          fees: data.fees,
          hash: data.hash,
          nextBlock: data.next_block ?? '',
          operationalCertificate: data.op_cert,
          output: data.output ?? '0',
          previousBlock: data.previous_block,
          size: data.size,
          slot: data.slot.toString(),
          slotLeader: data.slot_leader ?? '',
          time: data.time,
          txCount: data.tx_count,
          VRFKey: data.block_vrf,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchCollectionAssets(
    policyId: string,
    cursor = 1
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `assets/policy/${policyId}?page=${cursor}`
      );

      if (status === 200)
        return {
          assets: data.map((asset) => ({
            unit: asset.asset,
            quantity: asset.quantity,
          })),
          next: data.length === 100 ? cursor + 1 : null,
        };

      throw parseHttpError(data);
    } catch (error) {
      return { assets: [], next: null };
    }
  }

  async fetchHandleAddress(handle: string): Promise<string> {

    throw new Error('not implemented.');

    try {
      const assetName = fromUTF8(handle.replace('$', ''));
      const { data, status } = await this._axiosInstance.get(
        `assets/${SUPPORTED_HANDLES[1]}${assetName}/addresses`
      );

      if (status === 200) return data[0].address;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {

    throw new Error('not implemented.');

    try {
      const { data, status } = await this._axiosInstance.get(
        `epochs/${isNaN(epoch) ? 'latest' : epoch}/parameters`
      );

      if (status === 200)
        return <Protocol>{
          coinsPerUTxOSize: data.coins_per_utxo_word,
          collateralPercent: data.collateral_percent,
          decentralisation: data.decentralisation_param,
          epoch: data.epoch,
          keyDeposit: data.key_deposit,
          maxBlockExMem: data.max_block_ex_mem,
          maxBlockExSteps: data.max_block_ex_steps,
          maxBlockHeaderSize: data.max_block_header_size,
          maxBlockSize: data.max_block_size,
          maxCollateralInputs: data.max_collateral_inputs,
          maxTxExMem: data.max_tx_ex_mem,
          maxTxExSteps: data.max_tx_ex_steps,
          maxTxSize: data.max_tx_size,
          maxValSize: data.max_val_size,
          minFeeA: data.min_fee_a,
          minFeeB: data.min_fee_b,
          minPoolCost: data.min_pool_cost,
          poolDeposit: data.pool_deposit,
          priceMem: data.price_mem,
          priceStep: data.price_step,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    try {
      const { data, status } = await this._axiosInstance.get(`txs/${hash}`);

      if (status === 200)
        return <TransactionInfo>{
          block: data.block,
          deposit: data.deposit,
          fees: data.fees,
          hash: data.hash,
          index: data.index,
          invalidAfter: data.invalid_hereafter ?? '',
          invalidBefore: data.invalid_before ?? '',
          slot: data.slot.toString(),
          size: data.size,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  onTxConfirmed(txHash: string, callback: () => void, limit = 20): void {
    let attempts = 0;

    const checkTx = setInterval(() => {
      if (attempts >= limit) clearInterval(checkTx);

      this.fetchTxInfo(txHash)
        .then((txInfo) => {
          this.fetchBlockInfo(txInfo.block)
            .then((blockInfo) => {
              if (blockInfo?.confirmations > 0) {
                clearInterval(checkTx);
                callback();
              }
            })
            .catch(() => {
              attempts += 1;
            });
        })
        .catch(() => {
          attempts += 1;
        });
    }, 5_000);
  }

  async submitTx(tx: string): Promise<string> {

    throw new Error('not implemented.');

    try {
      const headers = { 'Content-Type': 'application/cbor' };
      const { data, status } = await this._axiosInstance.post(
        'tx/submit',
        toBytes(tx),
        { headers }
      );

      if (status === 200) return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  
}
