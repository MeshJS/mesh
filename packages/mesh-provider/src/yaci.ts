import axios, { AxiosInstance } from "axios";

import {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  fromUTF8,
  IEvaluator,
  IFetcher,
  IListener,
  ISubmitter,
  NativeScript,
  PlutusScript,
  Protocol,
  RedeemerTagType,
  SUPPORTED_HANDLES,
  TransactionInfo,
  Unit,
  UTxO,
} from "@meshsdk/common";
import { resolveRewardAddress, toScriptRef } from "@meshsdk/core-cst";

import { parseHttpError } from "./utils";
import { parseAssetUnit } from "./utils/parse-asset-unit";

export class YaciProvider
  implements IFetcher, IListener, ISubmitter, IEvaluator
{
  private readonly _axiosInstance: AxiosInstance;

  /**
   * Set the URL of the instance.
   * @param baseUrl The base URL of the instance.
   */
  constructor(baseUrl = "https://yaci-node.meshjs.dev/api/v1/") {
    this._axiosInstance = axios.create({
      baseURL: baseUrl,
    });
  }

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const rewardAddress = address.startsWith("addr")
      ? resolveRewardAddress(address)
      : address;

    try {
      const { data, status } = await this._axiosInstance.get(
        `accounts/${rewardAddress}`,
      );

      if (status === 200)
        return <AccountInfo>{
          poolId: data.pool_id,
          active: data.active || data.active_epoch !== null,
          balance: data.controlled_amount,
          rewards: data.withdrawable_amount,
          withdrawals: data.withdrawals_sum,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private resolveScriptRef = async (
    scriptHash: string,
  ): Promise<string | undefined> => {
    if (scriptHash) {
      const { data, status } = await this._axiosInstance.get(
        `scripts/${scriptHash}`,
      );

      if (status === 200) {
        const script = data.type.startsWith("plutus")
          ? <PlutusScript>{
              code: await this.fetchPlutusScriptCBOR(scriptHash),
              version: data.type.replace("plutus", ""),
            }
          : await this.fetchNativeScriptJSON(scriptHash);

        return toScriptRef(script).toCbor();
      }

      throw parseHttpError(data);
    }

    return undefined;
  };

  private toUTxO = async (
    bfUTxO: YaciUTxO,
    tx_hash: string,
  ): Promise<UTxO> => ({
    input: {
      outputIndex: bfUTxO.output_index,
      txHash: tx_hash,
    },
    output: {
      address: bfUTxO.address,
      amount: bfUTxO.amount.map((utxo) => {
        // diff bf
        return { ...utxo, quantity: utxo.quantity.toString() };
      }),
      dataHash: bfUTxO.data_hash ?? undefined,
      plutusData: bfUTxO.inline_datum ?? undefined,
      scriptRef: bfUTxO.script_ref
        ? bfUTxO.script_ref
        : bfUTxO.reference_script_hash
          ? await this.resolveScriptRef(bfUTxO.reference_script_hash)
          : undefined,
      scriptHash: bfUTxO.reference_script_hash,
    },
  });

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const filter = asset !== undefined ? `/${asset}` : "";
    const url = `addresses/${address}/utxos` + filter;

    const paginateUTxOs = async (
      page = 1,
      utxos: UTxO[] = [],
    ): Promise<UTxO[]> => {
      const { data, status } = await this._axiosInstance.get(
        `${url}?page=${page}`,
      );

      if (status === 200)
        return data.length > 0
          ? paginateUTxOs(page + 1, [
              ...utxos,
              ...(await Promise.all(
                data.map((utxo: any) => this.toUTxO(utxo, utxo.tx_hash)),
              )),
            ])
          : utxos;

      throw parseHttpError(data);
    };

    try {
      return await paginateUTxOs();
    } catch (error) {
      return [];
    }
  }

  async fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    const paginateAddresses = async <T>(
      page = 1,
      addresses: T[] = [],
    ): Promise<T[]> => {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}/addresses?page=${page}`,
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
    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}`,
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
    try {
      const { data, status } = await this._axiosInstance.get(`blocks/${hash}`);

      if (status === 200)
        return <BlockInfo>{
          confirmations: data.confirmations,
          epoch: data.epoch,
          epochSlot: data.epoch_slot.toString(),
          fees: data.fees,
          hash: data.hash,
          nextBlock: data.next_block ?? "",
          operationalCertificate: data.op_cert,
          output: data.output ?? "0",
          previousBlock: data.previous_block,
          size: data.size,
          slot: data.slot.toString(),
          slotLeader: data.slot_leader ?? "",
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
    cursor = 1,
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `assets/policy/${policyId}?page=${cursor}`,
      );

      if (status === 200)
        return {
          assets: data.map((asset: any) => ({
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

  async fetchHandle(handle: string): Promise<object> {
    throw new Error("Method not implemented.");
  }

  async fetchHandleAddress(handle: string): Promise<string> {
    try {
      const assetName = fromUTF8(handle.replace("$", ""));
      const { data, status } = await this._axiosInstance.get(
        `assets/${SUPPORTED_HANDLES[1]}${assetName}/addresses`,
      );

      if (status === 200) return data[0].address;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `epochs/${isNaN(epoch) ? "latest" : epoch}/parameters`,
      );

      if (status === 200)
        return castProtocol({
          coinsPerUtxoSize: data.coins_per_utxo_size,
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
        });

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
          invalidAfter: data.invalid_hereafter ?? "",
          invalidBefore: data.invalid_before ?? "",
          slot: data.slot.toString(),
          size: data.size,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchUTxOs(hash: string): Promise<UTxO[]> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `txs/${hash}/utxos`,
      );
      if (status === 200) {
        const bfOutputs = data.outputs as YaciUTxO[];
        const outputsPromises: Promise<UTxO>[] = [];
        bfOutputs.forEach((output) => {
          outputsPromises.push(this.toUTxO(output, hash));
        });
        const outputs = await Promise.all(outputsPromises);
        return outputs;
      }
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  onTxConfirmed(txHash: string, callback: () => void, limit = 100): void {
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

  async submitTx(txHex: string): Promise<string> {
    try {
      const headers = { "Content-Type": "text/plain" };
      const { status, data } = await this._axiosInstance.post(
        "/tx/submit",
        txHex,
        {
          headers,
        },
      );

      if (status === 202) {
        return data;
      }

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async evaluateTx(txHex: string) {
    try {
      const headers = { "Content-Type": "application/cbor" };
      const { status, data } = await this._axiosInstance.post(
        "utils/txs/evaluate",
        txHex,
        {
          headers,
        },
      );

      if (status === 202 && data.result.EvaluationResult) {
        const tagMap: { [key: string]: RedeemerTagType } = {
          spend: "SPEND",
          mint: "MINT",
          certificate: "CERT",
          reward: "REWARD",
        };
        const result: Omit<Action, "data">[] = [];

        Object.keys(data.result.EvaluationResult).forEach((key) => {
          const [tagKey, index] = key.split(":");
          const { memory, steps } = data.result.EvaluationResult[key];
          result.push({
            tag: tagMap[tagKey!]!,
            index: Number(index),
            budget: { mem: memory, steps },
          });
        });

        return result;
      }

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private async fetchPlutusScriptCBOR(scriptHash: string): Promise<string> {
    const { data, status } = await this._axiosInstance.get(
      `scripts/${scriptHash}/cbor`,
    );

    if (status === 200) return data.cbor;

    throw parseHttpError(data);
  }

  private async fetchNativeScriptJSON(
    scriptHash: string,
  ): Promise<NativeScript> {
    const { data, status } = await this._axiosInstance.get(
      `scripts/${scriptHash}/json`,
    );

    if (status === 200) return data.json;

    throw parseHttpError(data);
  }
}

type YaciUTxO = {
  output_index: number;
  amount: Array<{
    unit: Unit;
    quantity: number;
  }>;
  address: string;
  data_hash?: string;
  inline_datum?: string;
  collateral?: boolean;
  reference_script_hash?: string;
  script_ref?: string;
};
