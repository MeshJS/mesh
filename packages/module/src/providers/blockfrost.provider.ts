import axios, { AxiosInstance } from 'axios';
import { IFetcher, ISubmitter } from '@mesh/common/contracts';
import {
  parseHttpError, toBytes, toScriptRef,
} from '@mesh/common/utils';
import type {
  AssetMetadata, NativeScript,
  PlutusScript, Protocol, UTxO,
} from '@mesh/common/types';

export class BlockfrostProvider implements IFetcher, ISubmitter {
  private readonly _axiosInstance: AxiosInstance;

  constructor(projectId: string, version = 0) {
    const network = projectId.slice(0, 7); 
    this._axiosInstance = axios.create({
      baseURL: `https://cardano-${network}.blockfrost.io/api/v${version}`,
      headers: { project_id: projectId },
    });
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const filter = asset !== undefined ? `/${asset}` : '';
    const url = `addresses/${address}/utxos` + filter;

    const paginateUTxOs = async (page = 1, utxos: UTxO[] = []): Promise<UTxO[]> => {
      const { data, status } = await this._axiosInstance.get(
        `${url}?page=${page}`,
      );

      if (status === 200) {
        return data.length > 0
          ? paginateUTxOs(page + 1, [...utxos, ...await Promise.all(data.map(toUTxO))])
          : utxos;
      }

      throw parseHttpError(data);
    };

    const resolveScriptRef = async (scriptHash): Promise<string | undefined> => {
      if (scriptHash) {
        const { data, status } = await this._axiosInstance.get(
          `scripts/${scriptHash}`,
        );

        if (status === 200) {
          const script = data.type.startsWith('plutus')
            ? {
                code: await this.fetchPlutusScriptCBOR(scriptHash),
                version: data.type.replace('plutus', ''),
              } as PlutusScript
            : await this.fetchNativeScriptJSON(scriptHash);

          return toScriptRef(script).to_hex();
        }

        throw parseHttpError(data);
      }

      return undefined;
    };

    const toUTxO = async (bfUTxO): Promise<UTxO> => ({
      input: {
        outputIndex: bfUTxO.output_index,
        txHash: bfUTxO.tx_hash,
      },
      output: {
        address: address,
        amount: bfUTxO.amount,
        dataHash: bfUTxO.data_hash ?? undefined,
        plutusData: bfUTxO.inline_datum ?? undefined,
        scriptRef: await resolveScriptRef(bfUTxO.reference_script_hash),
      },
    });

    try {
      return await paginateUTxOs();
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

  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
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

  async submitTx(tx: string): Promise<string> {
    try {
      const headers = { 'Content-Type': 'application/cbor' };
      const { data, status } = await this._axiosInstance.post(
        'tx/submit', toBytes(tx), { headers },
      );

      if (status === 200)
        return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private async fetchPlutusScriptCBOR(scriptHash: string): Promise<string> {
    const { data, status } = await this._axiosInstance.get(
      `scripts/${scriptHash}/cbor`,
    );

    if (status === 200)
      return data.cbor;

    throw parseHttpError(data);
  }

  private async fetchNativeScriptJSON(scriptHash: string): Promise<NativeScript> {
    const { data, status } = await this._axiosInstance.get(
      `scripts/${scriptHash}/json`,
    );

    if (status === 200)
      return data.json;

    throw parseHttpError(data);
  }
}
