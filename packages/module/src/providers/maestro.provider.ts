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
      baseURL: `https://${network}.gomaestro-api.org/v0`,
      headers: { 'api-key': key },
    });
    console.log('network', network)
  }

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const rewardAddress = address.startsWith('addr')
      ? resolveRewardAddress(address)
      : address;

    try {
      const request = `accounts/${rewardAddress}`
      console.log(request)
      const { data, status } = await this._axiosInstance.get(
        request
      );

      if (status === 200) {
        console.log('data', data)
        return <AccountInfo>{
          poolId: data.delegated_pool,
          active: data.active || data.active_epoch !== null,
          balance: data.total_balance.toString(),
          rewards: data.total_rewarded.toString(),
          withdrawals: data.total_withdrawn.toString(),
        };
      }

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

    //throw new Error('not implemented.');

    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}`
      );

      if (status === 200)
        console.log('data', data)
      return <AssetMetadata>{
        //...data.onchain_metadata,
        name: data.asset_standards.cip25_metadata.name,
        image: data.asset_standards.cip25_metadata.image,
        mediaType: data.asset_standards.cip25_metadata.mediaType,
        description: data.asset_standards.cip25_metadata.description,
      };

      throw parseHttpError(data);
    } catch (error) {
      console.log('error parsing')
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
        console.log('data', data)
      return {
        assets: data.map((asset) => ({
          unit: policyId + asset.asset_name,
          quantity: asset.total_supply,
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

    if (!isNaN(epoch)) throw new Error('Maestro only supports fetching Protocol parameters of the latest epoch.')

    // Decimal numbers in Maestro are given as ratio of two numbers represented by string of format "firstNumber/secondNumber".
    const decimalFromRationalString = (str: string): number => {
      const forwardSlashIndex = str.indexOf("/");
      return parseInt(str.slice(0, forwardSlashIndex)) / parseInt(str.slice(forwardSlashIndex + 1));
    }

    try {
      const { data, status } = await this._axiosInstance.get("protocol-params");
      if (status === 200) {
        try {
          const { data: epochData, status: epochStatus } = await this._axiosInstance.get("epochs/current");

          if (epochStatus === 200)
            return <Protocol>{
              coinsPerUTxOSize: data.coins_per_utxo_byte,
              collateralPercent: parseInt(data.collateral_percentage),
              decentralisation: 0,  // Deprecated in Babbage era.
              epoch: parseInt(epochData.epoch_no),
              keyDeposit: data.stake_key_deposit,
              maxBlockExMem: data.max_execution_units_per_block.memory,
              maxBlockExSteps: data.max_execution_units_per_block.steps,
              maxBlockHeaderSize: parseInt(data.max_block_header_size),
              maxBlockSize: parseInt(data.max_block_body_size),
              maxCollateralInputs: parseInt(data.max_collateral_inputs),
              maxTxExMem: data.max_execution_units_per_transaction.memory,
              maxTxExSteps: data.max_execution_units_per_transaction.steps,
              maxTxSize: parseInt(data.max_tx_size),
              maxValSize: data.max_value_size,
              minFeeA: data.min_fee_constant,
              minFeeB: data.min_fee_coefficient,
              minPoolCost: data.min_pool_cost,
              poolDeposit: data.pool_deposit,
              priceMem: decimalFromRationalString(data.prices.memory),
              priceStep: decimalFromRationalString(data.prices.steps),
            };
          throw parseHttpError(data);
        } catch (error) {
          throw parseHttpError(error);
        }
      }
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
    try {
      const headers = { 'Content-Type': 'application/cbor' };
      const { data, status } = await this._axiosInstance.post(
        'transactions',
        toBytes(tx),
        { headers }
      );

      if (status === 202) return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }


}
