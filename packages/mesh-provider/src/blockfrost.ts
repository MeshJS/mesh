import axios, { AxiosInstance } from "axios";

import {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  DEFAULT_FETCHER_OPTIONS,
  fromUTF8,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
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
import {
  normalizePlutusScript,
  resolveRewardAddress,
  toScriptRef,
} from "@meshsdk/core-cst";

import { utxosToAssets } from "./common/utxos-to-assets";
import { OfflineFetcher } from "./offline/offline-fetcher";
import { BlockfrostAsset, BlockfrostUTxO } from "./types";
import { parseHttpError } from "./utils";
import { parseAssetUnit } from "./utils/parse-asset-unit";

export type BlockfrostCachingOptions = {
  enableCaching?: boolean;
  offlineFetcher?: OfflineFetcher;
};

export type BlockfrostSupportedNetworks = "mainnet" | "preview" | "preprod";

/**
 * Blockfrost provides restful APIs which allows your app to access information stored on the blockchain.
 *
 * Usage:
 * ```
 * import { BlockfrostProvider } from "@meshsdk/core";
 *
 * const provider = new BlockfrostProvider('<Your-API-Key>');
 * 
 * // With caching enabled
 * const providerWithCache = new BlockfrostProvider('<Your-API-Key>', 0, { enableCaching: true });
 * ```
 */
export class BlockfrostProvider
  implements IFetcher, IListener, ISubmitter, IEvaluator
{
  private readonly _axiosInstance: AxiosInstance;
  private readonly _network: BlockfrostSupportedNetworks;
  private submitTxToBytes = true;
  private _offlineFetcher?: OfflineFetcher;
  private _enableCaching = false;

  /**
   * If you are using a privately hosted Blockfrost instance, you can set the URL in the parameter.
   * @param baseUrl The base URL of the instance.
   * @param cachingOptions Optional caching configuration
   */
  constructor(baseUrl: string, cachingOptions?: BlockfrostCachingOptions);

  /**
   * If you are using [Blockfrost](https://blockfrost.io/) hosted instance, you can set the project ID in the parameter.
   * @param projectId The project ID of the instance.
   * @param version The version of the API. Default is 0.
   * @param cachingOptions Optional caching configuration
   */
  constructor(projectId: string, version?: number, cachingOptions?: BlockfrostCachingOptions);

  constructor(...args: unknown[]) {
    let cachingOptions: BlockfrostCachingOptions | undefined;
    
    if (
      typeof args[0] === "string" &&
      (args[0].startsWith("http") || args[0].startsWith("/"))
    ) {
      this._axiosInstance = axios.create({ baseURL: args[0] });
      this._network = "mainnet";
      cachingOptions = args[1] as BlockfrostCachingOptions | undefined;
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
      cachingOptions = args[2] as BlockfrostCachingOptions | undefined;
    }

    // Initialize caching if enabled
    if (cachingOptions?.enableCaching) {
      this._enableCaching = true;
      this._offlineFetcher = cachingOptions.offlineFetcher || new OfflineFetcher(this._network);
    }
  }

  /**
   * Evaluates the resources required to execute the transaction
   * @param tx - The transaction to evaluate
   */
  async evaluateTx(cbor: string): Promise<Omit<Action, "data">[]> {
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

  /**
   * Transactions for an address. The `TransactionInfo` would only return the `hash`, `inputs`, and `outputs`.
   * @param address - The address to fetch transactions for
   * @returns - partial TransactionInfo
   */
  async fetchAddressTxs(
    address: string,
    option: IFetcherOptions = DEFAULT_FETCHER_OPTIONS,
  ): Promise<TransactionInfo[]> {
    const txs: TransactionInfo[] = [];
    try {
      const fetcherOptions = { ...DEFAULT_FETCHER_OPTIONS, ...option };

      for (let i = 1; i <= fetcherOptions.maxPage!; i++) {
        let { data, status } = await this._axiosInstance.get(
          `/addresses/${address}/transactions?page=${i}&order=${fetcherOptions.order}`,
        );
        if (status !== 200) throw parseHttpError(data);
        if (data.length === 0) break;
        for (const tx of data) {
          const txInfo = await this.fetchTxInfo(tx.tx_hash);

          const _tx = {
            ...txInfo,
            blockHeight: tx.block_height,
            blockTime: tx.block_time,
          };

          txs.push(_tx);
        }
      }
      return txs;
    } catch (error) {
      throw parseHttpError(error);
    }
  }
  /**
   * Deprecated, use fetchAddressTxs instead
   * @param address
   * @returns - partial TransactionInfo
   */
  async fetchAddressTransactions(address: string): Promise<TransactionInfo[]> {
    return await this.fetchAddressTxs(address);
  }

  /**
   * UTXOs of the address.
   * @param address - The address to fetch UTXO
   * @param asset - UTXOs of a given asset​
   * @returns - Array of UTxOs
   */
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    // Check cache first if caching is enabled
    if (this._enableCaching && this._offlineFetcher) {
      try {
        const cachedUtxos = await this._offlineFetcher.fetchAddressUTxOs(address, asset);
        if (cachedUtxos.length > 0) {
          return cachedUtxos;
        }
      } catch (error) {
        // Cache miss or error, continue to fetch from network
      }
    }

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
      const fetchedUtxos = await paginateUTxOs();
      
      // Cache the fetched UTXOs if caching is enabled
      if (this._enableCaching && this._offlineFetcher && fetchedUtxos.length > 0) {
        try {
          this._offlineFetcher.addUTxOs(fetchedUtxos);
        } catch (error) {
          // Log error but don't fail the request
          console.warn("Failed to cache UTXOs:", error);
        }
      }
      
      return fetchedUtxos;
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

  /**
   * Fetches the block information for a given block hash.
   * @param hash The block hash to fetch from
   * @returns The block information
   */
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

  /**
   * Fetches the list of assets for a given policy ID.
   * @param policyId The policy ID to fetch assets for
   * @param cursor The cursor for pagination
   * @returns The list of assets and the next cursor
   */
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

  /**
   * Fetch the latest protocol parameters.
   * @param epoch Optional - The epoch to fetch protocol parameters for
   * @returns - Protocol parameters
   */
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

  /**
   * Fetches the transaction information for a given transaction hash.
   * @param hash The transaction hash to fetch
   * @returns The transaction information
   */
  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    try {
      const { data: txData, status } = await this._axiosInstance.get(
        `txs/${hash}`,
      );
      if (status === 200 || status == 202) {
        const { data, status } = await this._axiosInstance.get(
          `/txs/${txData.hash}/utxos`,
        );
        if (status !== 200) throw parseHttpError(data);
        return <TransactionInfo>{
          block: txData.block,
          deposit: txData.deposit,
          fees: txData.fees,
          hash: txData.hash,
          index: txData.index,
          invalidAfter: txData.invalid_hereafter ?? "",
          invalidBefore: txData.invalid_before ?? "",
          slot: txData.slot.toString(),
          size: txData.size,
          inputs: data.inputs,
          outputs: data.outputs,
        };
      }

      throw parseHttpError(txData);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Get UTxOs for a given hash.
   * @param hash The transaction hash
   * @param index Optional - The output index for filtering post fetching
   * @returns - Array of UTxOs
   */
  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
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

        if (index !== undefined) {
          return outputs.filter((utxo) => utxo.input.outputIndex === index);
        }

        return outputs;
      }
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Fetches the governance proposal information.
   * @param txHash The transaction hash of the proposal
   * @param certIndex The certificate index of the proposal
   * @returns The governance proposal information
   */
  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `governance/proposals/${txHash}/${certIndex}`,
      );
      if (status === 200 || status == 202)
        return <GovernanceProposalInfo>{
          txHash: data.tx_hash,
          certIndex: data.cert_index,
          governanceType: data.governance_type,
          deposit: data.deposit,
          returnAddress: data.return_address,
          governanceDescription: data.governance_description,
          ratifiedEpoch: data.ratified_epoch,
          enactedEpoch: data.enacted_epoch,
          droppedEpoch: data.dropped_epoch,
          expiredEpoch: data.expired_epoch,
          expiration: data.expiration,
          metadata: (
            await this._axiosInstance.get(
              `governance/proposals/${txHash}/${certIndex}/metadata`,
            )
          ).data,
        };
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * A generic method to fetch data from a URL.
   * @param url - The URL to fetch data from
   * @returns - The data fetched from the URL
   */
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
   * A generic method to post data to a URL.
   * @param url - The URL to fetch data from
   * @param body - Payload
   * @param headers - Specify headers, default: { "Content-Type": "application/json" }
   * @returns - Data
   */
  async post(
    url: string,
    body: any,
    headers = { "Content-Type": "application/json" },
  ): Promise<any> {
    try {
      const { data, status } = await this._axiosInstance.post(url, body, {
        headers,
      });

      if (status === 200 || status == 202) return data;

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

  setSubmitTxToBytes(value: boolean): void {
    this.submitTxToBytes = value;
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
        this.submitTxToBytes ? toBytes(tx) : tx,
        { headers },
      );

      if (status === 200 || status == 202) {
        // Cache the submitted transaction if caching is enabled
        if (this._enableCaching && this._offlineFetcher) {
          try {
            this._offlineFetcher.addSerializedTransaction(tx);
          } catch (error) {
            // Log error but don't fail the request
            console.warn("Failed to cache submitted transaction:", error);
          }
        }
        
        return data;
      }

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
        let script;
        if (data.type.startsWith("plutus")) {
          const plutusScript = await this.fetchPlutusScriptCBOR(scriptHash);
          const normalized = normalizePlutusScript(plutusScript, "DoubleCBOR");
          script = <PlutusScript>{
            version: data.type.replace("plutus", ""),
            code: normalized,
          };
        } else {
          script = await this.fetchNativeScriptJSON(scriptHash);
        }

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

  /**
   * Enable or disable caching functionality.
   * @param enable - Whether to enable caching
   * @param offlineFetcher - Optional custom OfflineFetcher instance to use
   */
  setCaching(enable: boolean, offlineFetcher?: OfflineFetcher): void {
    this._enableCaching = enable;
    if (enable) {
      this._offlineFetcher = offlineFetcher || new OfflineFetcher(this._network);
    } else {
      this._offlineFetcher = undefined;
    }
  }

  /**
   * Get the current OfflineFetcher instance if caching is enabled.
   * @returns The OfflineFetcher instance or undefined if caching is disabled
   */
  getOfflineFetcher(): OfflineFetcher | undefined {
    return this._offlineFetcher;
  }

  /**
   * Check if caching is currently enabled.
   * @returns True if caching is enabled, false otherwise
   */
  isCachingEnabled(): boolean {
    return this._enableCaching;
  }

  /**
   * Export the cached data as JSON string.
   * @returns JSON string of cached data or null if caching is disabled
   */
  exportCache(): string | null {
    return this._offlineFetcher ? this._offlineFetcher.toJSON() : null;
  }

  /**
   * Import cached data from JSON string.
   * @param jsonData - JSON string containing cached data
   * @param enableCaching - Whether to enable caching if not already enabled
   */
  importCache(jsonData: string, enableCaching = true): void {
    if (enableCaching && !this._enableCaching) {
      this.setCaching(true);
    }
    
    if (this._offlineFetcher) {
      const importedFetcher = OfflineFetcher.fromJSON(jsonData);
      this._offlineFetcher = importedFetcher;
    }
  }

  /**
   * Clear all cached data.
   */
  clearCache(): void {
    if (this._offlineFetcher) {
      this._offlineFetcher = new OfflineFetcher(this._network);
    }
  }
}
