import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { IFetcher, ISubmitter } from '@mesh/common/contracts';
import { resolveRewardAddress, toScriptRef } from '@mesh/common/utils';
import type {
  AccountInfo, AssetMetadata, NativeScript,
  PlutusScript, Protocol, UTxO, BlockfrostUtxos, BlockfrostEpoch
} from '@mesh/common/types';

export class BlockfrostProvider implements IFetcher, ISubmitter {
  private readonly blockfrostAPI: BlockFrostAPI;

  constructor(projectId: string, version = 0) {
    this.blockfrostAPI = new BlockFrostAPI({
      projectId, version
    });
  }

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const rewardAddress = address.startsWith('addr')
      ? resolveRewardAddress(address)
      : address;
    const bfResponse = await this.blockfrostAPI.accounts(rewardAddress);

    return {
      active: bfResponse.active || bfResponse.active_epoch !== null,
      poolId: bfResponse.pool_id ?? undefined,
      balance: bfResponse.controlled_amount,
      rewards: bfResponse.withdrawable_amount,
      withdrawals: bfResponse.withdrawals_sum,
    };
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    let bfUtxos: BlockfrostUtxos = [];

    if (asset) {
      bfUtxos = await this.blockfrostAPI.addressesUtxosAssetAll(address, asset);
    } else {
      bfUtxos = await this.blockfrostAPI.addressesUtxosAll(address);
    }

    const resolveScriptRef = async (scriptHash: BlockfrostUtxos[0]['reference_script_hash']): Promise<string | undefined> => {
      if (scriptHash) {
        const bfResponse = await this.blockfrostAPI.scriptsByHash(scriptHash);
        const script = bfResponse.type.startsWith('plutus')
          ? {
            code: await this.fetchPlutusScriptCBOR(scriptHash),
            version: bfResponse.type.replace('plutus', ''),
          } as PlutusScript
          : await this.fetchNativeScriptJSON(scriptHash);

        return toScriptRef(script).to_hex();
      }

      return undefined;
    };

    const toUTxO = async (bfUTxO: BlockfrostUtxos[0]): Promise<UTxO> => {
      const scriptRef = await resolveScriptRef(bfUTxO.reference_script_hash);

      return {
        input: {
          outputIndex: bfUTxO.output_index,
          txHash: bfUTxO.tx_hash,
        },
        output: {
          address: address,
          amount: bfUTxO.amount,
          dataHash: bfUTxO.data_hash ?? undefined,
          plutusData: bfUTxO.inline_datum ?? undefined,
          scriptRef,
        },
      };
    };

    const result = await Promise.all(
      bfUtxos.map(async (utxo) => await toUTxO(utxo))
    );

    return result;

  }

  async fetchAssetMetadata(_asset: string): Promise<AssetMetadata> {
    throw new Error('fetchAssetMetadata not implemented.');
  }

  async fetchHandleAddress(_handle: string): Promise<string> {
    throw new Error('fetchHandleAddress not implemented.');
  }

  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
    let bfResponse: BlockfrostEpoch;
    const isLatestEpoch = isNaN(epoch);

    if (isLatestEpoch) {
      bfResponse = await this.blockfrostAPI.epochsLatestParameters();
    } else {
      bfResponse = await this.blockfrostAPI.epochsParameters(epoch);
    }

    return {
      // @ts-expect-error - can be null
      coinsPerUTxOSize: bfResponse.coins_per_utxo_word,
      // @ts-expect-error - can be null
      collateralPercent: bfResponse.collateral_percent,
      decentralisation: bfResponse.decentralisation_param,
      epoch: bfResponse.epoch,
      keyDeposit: bfResponse.key_deposit,
      // @ts-expect-error - can be null
      maxBlockExMem: bfResponse.max_block_ex_mem,
      // @ts-expect-error - can be null
      maxBlockExSteps: bfResponse.max_block_ex_steps,
      maxBlockHeaderSize: bfResponse.max_block_header_size,
      maxBlockSize: bfResponse.max_block_size,
      // @ts-expect-error - can be null
      maxCollateralInputs: bfResponse.max_collateral_inputs,
      // @ts-expect-error - can be null
      maxTxExMem: bfResponse.max_tx_ex_mem,
      // @ts-expect-error - can be null
      maxTxExSteps: bfResponse.max_tx_ex_steps,
      maxTxSize: bfResponse.max_tx_size,
      // @ts-expect-error - can be null
      maxValSize: bfResponse.max_val_size,
      minFeeA: bfResponse.min_fee_a,
      minFeeB: bfResponse.min_fee_b,
      minPoolCost: bfResponse.min_pool_cost,
      poolDeposit: bfResponse.pool_deposit,
      // @ts-expect-error - can be null
      priceMem: bfResponse.price_mem,
      // @ts-expect-error - can be null
      priceStep: bfResponse.price_step,
    };
  }

  async submitTx(tx: string): Promise<string> {
    const bfResponse = await this.blockfrostAPI.txSubmit(tx);

    return bfResponse;
  }

  private async fetchPlutusScriptCBOR(scriptHash: string): Promise<string> {
    const bfResponse = await this.blockfrostAPI.scriptsCbor(scriptHash);
    const cborResponse = bfResponse.cbor;

    if (!cborResponse) {
      throw new Error('Failed to fetch CBOR for script.');
    }

    return cborResponse;
  }

  private async fetchNativeScriptJSON(scriptHash: string): Promise<NativeScript> {
    const bfResponse: { json: unknown } = await this.blockfrostAPI.scriptsJson(scriptHash);

    return bfResponse.json as NativeScript;
  }
}
