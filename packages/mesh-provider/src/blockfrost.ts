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
  toBytes,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import { resolveRewardAddress, toScriptRef } from "@meshsdk/core-cst";

import { utxosToAssets } from "./common/utxos-to-assets";
import { BlockfrostAsset, BlockfrostUTxO } from "./types";
import { parseHttpError } from "./utils";
import { parseAssetUnit } from "./utils/parse-asset-unit";

export type BlockfrostSupportedNetworks = "mainnet" | "preview" | "preprod";

/**
 * Blockfrost provides restful APIs which allows your app to access information stored on the blockchain.
 *
 * Usage:
 * ```
 * import { BlockfrostProvider } from "@meshsdk/core";
 *
 * const blockchainProvider = new BlockfrostProvider('<Your-API-Key>');
 */
export class BlockfrostProvider
  implements IFetcher, IListener, ISubmitter, IEvaluator
{
  private readonly _axiosInstance: AxiosInstance;
  private readonly _network: BlockfrostSupportedNetworks;

  /**
   * If you are using a privately hosted Blockfrost instance, you can set the URL in the parameter.
   * @param baseUrl The base URL of the instance.
   */
  constructor(baseUrl: string);

  /**
   * If you are using [Blockfrost](https://blockfrost.io/) hosted instance, you can set the project ID in the parameter.
   * @param projectId The project ID of the instance.
   * @param version The version of the API. Default is 0.
   */
  constructor(projectId: string, version?: number);

  constructor(...args: unknown[]) {
    if (
      typeof args[0] === "string" &&
      (args[0].startsWith("http") || args[0].startsWith("/"))
    ) {
      this._axiosInstance = axios.create({ baseURL: args[0] });
      this._network = "mainnet";
    } else {
      const projectId = args[0] as string;
      const network = projectId.slice(0, 7);
      this._axiosInstance = axios.create({
        baseURL: `https://cardano-${network}.blockfrost.io/api/v${
          args[1] ?? 0
        }`,
        headers: { project_id: projectId },
      });
      this._network = network as BlockfrostSupportedNetworks;
    }
  }

  /**
   * Evaluates the resources required to execute the transaction
   * @param tx - The transaction to evaluate
   */
  async evaluateTx(cbor: string): Promise<any> {
    try {
      const headers = { "Content-Type": "application/cbor" };
      const { status, data } = await this._axiosInstance.post(
        "utils/txs/evaluate",
        cbor,
        {
          headers,
        },
      );

      if (status === 200 && data.result.EvaluationResult) {
        const tagMap: { [key: string]: RedeemerTagType } = {
          spend: "SPEND",
          mint: "MINT",
          certificate: "CERT",
          withdrawal: "REWARD",
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

  /**
   * Obtain information about a specific stake account.
   * @param address - Wallet address to fetch account information
   */
  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    const rewardAddress = address.startsWith("addr")
      ? resolveRewardAddress(address)
      : address;

    try {
      const { data, status } = await this._axiosInstance.get(
        `accounts/${rewardAddress}`,
      );

      if (status === 200 || status == 202)
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

  /**
   * Fetches the assets for a given address.
   * @param address - The address to fetch assets for
   * @returns A map of asset unit to quantity
   */
  async fetchAddressAssets(
    address: string,
  ): Promise<{ [key: string]: string }> {
    const utxos = await this.fetchAddressUTxOs(address);
    return utxosToAssets(utxos);
  }

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

      if (status === 200 || status == 202)
        return data.length > 0
          ? paginateUTxOs(page + 1, [
              ...utxos,
              ...(await Promise.all(
                data.map((utxo: BlockfrostUTxO) =>
                  this.toUTxO(utxo, utxo.tx_hash),
                ),
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

  /**
   * Fetches the asset addresses for a given asset.
   * @param asset - The asset to fetch addresses for
   */
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

      if (status === 200 || status == 202)
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

  /**
   * Fetches the metadata for a given asset.
   * @param asset - The asset to fetch metadata for
   * @returns The metadata for the asset
   */
  async fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}`,
      );
      if (status === 200 || status == 202)
        return <AssetMetadata>{
          ...data.onchain_metadata,
          fingerprint: data.fingerprint,
          totalSupply: data.quantity,
          mintingTxHash: data.initial_mint_tx_hash, // todo: request for `initial_mint_tx_hash`
          mintCount: data.mint_or_burn_count,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Fetches the metadata for a given asset.
   * @param asset - The asset to fetch metadata for
   * @returns The metadata for the asset
   */
  async fetchLatestBlock(): Promise<BlockInfo> {
    try {
      const { data, status } = await this._axiosInstance.get(`blocks/latest`);

      if (status === 200 || status == 202)
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

  async fetchBlockInfo(hash: string): Promise<BlockInfo> {
    try {
      const { data, status } = await this._axiosInstance.get(`blocks/${hash}`);

      if (status === 200 || status == 202)
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

      if (status === 200 || status == 202)
        return {
          assets: data.map((asset: BlockfrostAsset) => ({
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

  async fetchHandle(handle: string): Promise<AssetMetadata> {
    if (this._network !== "mainnet") {
      throw new Error(
        "Does not support fetching addresses by handle on non-mainnet networks.",
      );
    }
    try {
      const assetName = fromUTF8(`${handle.replace("$", "")}`);
      const asset = await this.fetchAssetMetadata(
        `${SUPPORTED_HANDLES[1]}000de140${assetName}`,
      );
      return asset;
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchHandleAddress(handle: string): Promise<string> {
    if (this._network !== "mainnet") {
      throw new Error(
        "Does not support fetching addresses by handle on non-mainnet networks.",
      );
    }
    try {
      const assetName = fromUTF8(handle.replace("$", ""));
      const { data, status } = await this._axiosInstance.get(
        `assets/${SUPPORTED_HANDLES[1]}${assetName}/addresses`,
      );

      if (status === 200 || status == 202) return data[0].address;

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

      if (status === 200 || status == 202)
        return castProtocol({
          coinsPerUtxoSize: data.coins_per_utxo_word,
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

      if (status === 200 || status == 202)
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
      if (status === 200 || status == 202) {
        const bfOutputs = data.outputs as BlockfrostUTxO[];
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

  async get(url: string): Promise<any> {
    try {
      const { data, status } = await this._axiosInstance.get(url);
      if (status === 200 || status == 202) {
        return data;
      }
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Allow you to listen to a transaction confirmation. Upon confirmation, the callback will be called.
   * @param txHash - The transaction hash to listen for confirmation
   * @param callback - The callback function to call when the transaction is confirmed
   * @param limit - The number of blocks to wait for confirmation
   */
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

  /**
   * Submit a serialized transaction to the network.
   * @param tx - The serialized transaction in hex to submit
   * @returns The transaction hash of the submitted transaction
   */
  async submitTx(tx: string): Promise<string> {
    try {
      const headers = { "Content-Type": "application/cbor" };
      const { data, status } = await this._axiosInstance.post(
        "tx/submit",
        toBytes(tx),
        { headers },
      );

      if (status === 200 || status == 202) return data;

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

      if (status === 200 || status == 202) {
        const script = data.type.startsWith("plutus")
          ? <PlutusScript>{
              code: await this.fetchPlutusScriptCBOR(scriptHash),
              version: data.type.replace("plutus", ""),
            }
          : await this.fetchNativeScriptJSON(scriptHash);

        return toScriptRef(script).toCbor().toString();
      }

      throw parseHttpError(data);
    }

    return undefined;
  };

  private toUTxO = async (
    bfUTxO: BlockfrostUTxO,
    tx_hash: string,
  ): Promise<UTxO> => ({
    input: {
      outputIndex: bfUTxO.output_index,
      txHash: tx_hash,
    },
    output: {
      address: bfUTxO.address,
      amount: bfUTxO.amount,
      dataHash: bfUTxO.data_hash ?? undefined,
      plutusData: bfUTxO.inline_datum ?? undefined,
      scriptRef: bfUTxO.reference_script_hash
        ? await this.resolveScriptRef(bfUTxO.reference_script_hash)
        : undefined,
      scriptHash: bfUTxO.reference_script_hash,
    },
  });

  private async fetchPlutusScriptCBOR(scriptHash: string): Promise<string> {
    const { data, status } = await this._axiosInstance.get(
      `scripts/${scriptHash}/cbor`,
    );

    if (status === 200 || status == 202) return data.cbor;

    throw parseHttpError(data);
  }

  private async fetchNativeScriptJSON(
    scriptHash: string,
  ): Promise<NativeScript> {
    const { data, status } = await this._axiosInstance.get(
      `scripts/${scriptHash}/json`,
    );

    if (status === 200 || status == 202) return data.json;

    throw parseHttpError(data);
  }
}
