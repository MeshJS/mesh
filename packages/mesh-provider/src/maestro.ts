import axios, { AxiosInstance } from "axios";

import {
  AccountInfo,
  Action,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  fromUTF8,
  GovernanceProposalInfo,
  IEvaluator,
  IFetcher,
  IFetcherOptions,
  IListener,
  ISubmitter,
  NativeScript,
  NonFungibleAssetMetadata,
  PlutusScript,
  Protocol,
  SUPPORTED_HANDLES,
  toBytes,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import {
  normalizePlutusScript,
  resolveRewardAddress,
  toScriptRef,
  VrfVkBech32,
} from "@meshsdk/core-cst";

import { utxosToAssets } from "./common/utxos-to-assets";
import { MaestroAssetExtended, MaestroUTxO } from "./types/maestro";
import { parseHttpError } from "./utils";
import { parseAssetUnit } from "./utils/parse-asset-unit";

export type MaestroSupportedNetworks = "Mainnet" | "Preprod" | "Preview";

interface MaestroConfig {
  network: MaestroSupportedNetworks;
  apiKey: string;
  turboSubmit?: boolean;
}

export class MaestroProvider
  implements IFetcher, ISubmitter, IEvaluator, IListener
{
  private readonly _axiosInstance: AxiosInstance;
  private readonly _amountsAsStrings = {
    headers: {
      "amounts-as-strings": "true",
    },
  };
  private readonly _network: MaestroSupportedNetworks;
  private submitTxToBytes = true;
  submitUrl: string;

  constructor({ network, apiKey, turboSubmit = false }: MaestroConfig) {
    this._axiosInstance = axios.create({
      baseURL: `https://${network}.gomaestro-api.org/v1`,
      headers: { "api-key": apiKey },
    });
    this.submitUrl = turboSubmit ? "txmanager/turbosubmit" : "txmanager";
    this._network = network;
  }

  /**
   * Evaluates the resources required to execute the transaction
   * @param tx - The transaction to evaluate
   */
  async evaluateTx(cbor: string): Promise<Omit<Action, "data">[]> {
    try {
      const { data, status } = await this._axiosInstance.post(
        "transactions/evaluate",
        { cbor },
      );
      if (status === 200) {
        const tagMap: { [key: string]: string } = {
          spend: "SPEND",
          mint: "MINT",
          cert: "CERT",
          wdrl: "REWARD",
        };
        const result = data.map((action: any) => {
          const budget = action.ex_units;
          const index = action.redeemer_index;
          const tag = tagMap[action.redeemer_tag];
          return { budget, index, tag };
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
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `accounts/${rewardAddress}`,
        this._amountsAsStrings,
      );

      if (status === 200) {
        const data = timestampedData.data;
        return <AccountInfo>{
          poolId: data.delegated_pool,
          active: data.registered,
          balance: data.total_balance,
          rewards: data.rewards_available,
          withdrawals: data.total_withdrawn,
        };
      }
      throw parseHttpError(timestampedData);
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
   * UTXOs of the address.
   * @param address - The address to fetch UTXO
   * @param asset - UTXOs of a given asset​
   * @returns - Array of UTxOs
   */
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const queryPredicate = (() => {
      if (
        address.startsWith("addr_vkh") ||
        address.startsWith("addr_shared_vkh")
      )
        return `addresses/cred/${address}`;
      else return `addresses/${address}`;
    })();
    const appendAssetString = asset ? `&asset=${asset}` : "";
    const paginateUTxOs = async (
      cursor = null,
      utxos: UTxO[] = [],
    ): Promise<UTxO[]> => {
      const appendCursorString = cursor === null ? "" : `&cursor=${cursor}`;
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `${queryPredicate}/utxos?count=100${appendAssetString}${appendCursorString}`,
        this._amountsAsStrings,
      );
      if (status === 200) {
        const data = timestampedData.data;
        const pageUTxOs: UTxO[] = data.map(this.toUTxO);
        const addedUtxos = [...utxos, ...pageUTxOs];
        const nextCursor = timestampedData.next_cursor;
        return nextCursor == null
          ? addedUtxos
          : paginateUTxOs(nextCursor, addedUtxos);
      }

      throw parseHttpError(timestampedData);
    };

    try {
      return await paginateUTxOs();
    } catch (error) {
      return [];
    }
  }

  /**
   * Unimplemented - open for contribution
   *
   * Transactions for an address. The `TransactionInfo` would only return the `hash`, `inputs`, and `outputs`.
   * @param address
   * @returns - partial TransactionInfo
   */
  async fetchAddressTxs(
    address: string,
    option: IFetcherOptions = { maxPage: 100, order: "desc" },
  ): Promise<TransactionInfo[]> {
    // open for contribution, see blockfrost.ts for reference
    throw new Error("Method not implemented.");
  }

  /**
   * Fetches the asset addresses for a given asset.
   * @param asset - The asset to fetch addresses for
   */
  async fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    const { policyId, assetName } = parseAssetUnit(asset);
    const paginateAddresses = async (
      cursor = null,
      addressesWithQuantity: { address: string; quantity: string }[] = [],
    ): Promise<{ address: string; quantity: string }[]> => {
      const appendCursorString = cursor === null ? "" : `&cursor=${cursor}`;
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}/addresses?count=100${appendCursorString}`,
        this._amountsAsStrings,
      );
      if (status === 200) {
        const data = timestampedData.data;
        const pageAddressesWithQuantity: {
          address: string;
          quantity: string;
        }[] = data.map((a: { address: string; amount: string }) => {
          return { address: a.address, quantity: a.amount };
        });
        const nextCursor = timestampedData.next_cursor;
        const addedData = [
          ...addressesWithQuantity,
          ...pageAddressesWithQuantity,
        ];
        return nextCursor == null
          ? addedData
          : paginateAddresses(nextCursor, addedData);
      }

      throw parseHttpError(timestampedData);
    };

    try {
      return await paginateAddresses();
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
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `assets/${policyId}${assetName}`,
      );
      if (status === 200) {
        const data = timestampedData.data;
        return <AssetMetadata>{
          ...data.asset_standards.cip25_metadata,
          ...data.asset_standards.cip68_metadata,
          fingerprint: data.fingerprint,
          totalSupply: data.total_supply,
          mintingTxHash: data.latest_mint_tx.tx_hash,
          mintCount: data.mint_tx_count,
        };
      }

      throw parseHttpError(timestampedData);
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
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `blocks/${hash}`,
        this._amountsAsStrings,
      );

      if (status === 200) {
        const data = timestampedData.data;
        return <BlockInfo>{
          confirmations: data.confirmations,
          epoch: data.epoch,
          epochSlot: data.epoch_slot.toString(),
          fees: data.total_fees,
          hash: data.hash,
          nextBlock: data.next_block ?? "",
          operationalCertificate: data.operational_certificate?.hot_vkey,
          output: data.total_output_lovelace ?? "0",
          previousBlock: data.previous_block,
          size: data.size,
          slot: data.absolute_slot.toString(),
          slotLeader: data.block_producer ?? "",
          time: Date.parse(data.timestamp) / 1000,
          txCount: data.tx_hashes.length,
          VRFKey: VrfVkBech32.fromHex(data.vrf_key),
        };
      }

      throw parseHttpError(timestampedData);
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
    cursor?: string,
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    try {
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `policy/${policyId}/assets?count=100${
          cursor ? `&cursor=${cursor}` : ""
        }`,
      );

      if (status === 200) {
        const data = timestampedData.data;
        return {
          assets: data.map((asset: MaestroAssetExtended) => ({
            unit: policyId + asset.asset_name,
            quantity: asset.total_supply,
          })),
          next: timestampedData.next_cursor,
        };
      }

      throw parseHttpError(timestampedData);
    } catch (error) {
      return { assets: [], next: null };
    }
  }

  async fetchHandle(handle: string): Promise<object> {
    if (this._network !== "Mainnet") {
      throw new Error(
        "Does not support fetching addresses by handle on non-mainnet networks.",
      );
    }
    try {
      const assetName = fromUTF8(`${handle.replace("$", "")}`);
      const asset = (await this.fetchAssetMetadata(
        `${SUPPORTED_HANDLES[1]}000643b0${assetName}`,
      )) as NonFungibleAssetMetadata;

      if (asset.metadata !== undefined) return asset.metadata;

      throw "Problem fetching metadata";
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchHandleAddress(handle: string): Promise<string> {
    if (this._network !== "Mainnet") {
      throw new Error(
        "Does not support fetching addresses by handle on non-mainnet networks.",
      );
    }

    try {
      const handleWithoutDollar =
        handle.charAt(0) === "$" ? handle.substring(1) : handle;
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `ecosystem/adahandle/${handleWithoutDollar}`,
      );

      if (status === 200) return timestampedData.data;

      throw parseHttpError(timestampedData);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Fetch the latest protocol parameters.
   * @param epoch
   * @returns - Protocol parameters
   */
  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
    if (!isNaN(epoch))
      throw new Error(
        "Maestro only supports fetching Protocol parameters of the latest completed epoch.",
      );

    // Decimal numbers in Maestro are given as ratio of two numbers represented by string of format "firstNumber/secondNumber".
    const decimalFromRationalString = (str: string): number => {
      const forwardSlashIndex = str.indexOf("/");
      return (
        parseInt(str.slice(0, forwardSlashIndex)) /
        parseInt(str.slice(forwardSlashIndex + 1))
      );
    };
    try {
      const { data: timestampedData, status } =
        await this._axiosInstance.get("protocol-params");
      if (status === 200) {
        const data = timestampedData.data;
        try {
          const { data: timestampedDataEpochData, status: epochStatus } =
            await this._axiosInstance.get("epochs/current");
          if (epochStatus === 200) {
            const epochData = timestampedDataEpochData.data;
            return castProtocol({
              coinsPerUtxoSize: parseInt(data.coins_per_utxo_byte),
              collateralPercent: parseInt(data.collateral_percentage),
              decentralisation: 0, // Deprecated in Babbage era.
              epoch: parseInt(epochData.epoch_no),
              keyDeposit: parseInt(data.stake_key_deposit),
              maxBlockExMem:
                data.max_execution_units_per_block.memory.toString(),
              maxBlockExSteps:
                data.max_execution_units_per_block.steps.toString(),
              maxBlockHeaderSize: parseInt(data.max_block_header_size),
              maxBlockSize: parseInt(data.max_block_body_size),
              maxCollateralInputs: parseInt(data.max_collateral_inputs),
              maxTxExMem:
                data.max_execution_units_per_transaction.memory.toString(),
              maxTxExSteps:
                data.max_execution_units_per_transaction.steps.toString(),
              maxTxSize: parseInt(data.max_tx_size),
              maxValSize: parseInt(data.max_value_sized),
              minFeeA: data.min_fee_coefficient,
              minFeeB: data.min_fee_constant,
              minPoolCost: data.min_pool_cost.toString(),
              poolDeposit: parseInt(data.pool_deposit),
              priceMem: decimalFromRationalString(data.prices.memory),
              priceStep: decimalFromRationalString(data.prices.steps),
            });
          }
          throw parseHttpError(timestampedDataEpochData);
        } catch (error) {
          throw parseHttpError(error);
        }
      }
      throw parseHttpError(timestampedData);
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
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `transactions/${hash}`,
      );

      if (status === 200) {
        const data = timestampedData.data;
        return <TransactionInfo>{
          block: data.block_hash,
          deposit: data.deposit.toString(),
          fees: data.fee.toString(),
          hash: data.tx_hash,
          index: data.block_tx_index,
          invalidAfter: data.invalid_hereafter ?? "",
          invalidBefore: data.invalid_before ?? "",
          slot: data.block_absolute_slot.toString(),
          size: data.size - 1,
        };
      }
      throw parseHttpError(timestampedData);
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
      const { data: timestampedData, status } = await this._axiosInstance.get(
        `transactions/${hash}`,
        this._amountsAsStrings,
      );
      if (status === 200) {
        const msOutputs = timestampedData.data.outputs as MaestroUTxO[];
        const outputs = msOutputs.map(this.toUTxO);

        if (index !== undefined) {
          return outputs.filter((utxo) => utxo.input.outputIndex === index);
        }

        return outputs;
      }
      throw parseHttpError(timestampedData);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  /**
   * Unimplemented - open for contribution
   *
   * Fetches the governance proposal information.
   * @param txHash The transaction hash of the proposal
   * @param certIndex The certificate index of the proposal
   * @returns The governance proposal information
   */
  async fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error("Method not implemented by Maestro");
  }

  async get(url: string): Promise<any> {
    try {
      const { data, status } = await this._axiosInstance.get(url);
      if (status === 200) {
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
        this.submitUrl,
        this.submitTxToBytes ? toBytes(tx) : tx,
        { headers },
      );

      if (status === 202) return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private toUTxO = (utxo: MaestroUTxO): UTxO => ({
    input: {
      outputIndex: utxo.index,
      txHash: utxo.tx_hash,
    },
    output: {
      address: utxo.address,
      amount: utxo.assets.map((asset) => ({
        unit: asset.unit,
        quantity: asset.amount,
      })),
      dataHash: utxo.datum?.hash,
      plutusData: utxo.datum?.bytes,
      scriptRef: this.resolveScript(utxo),
      scriptHash: utxo.reference_script?.hash,
    },
  });

  private resolveScript = (utxo: MaestroUTxO) => {
    if (utxo.reference_script) {
      let script;
      if (utxo.reference_script.type === "native") {
        script = <NativeScript>utxo.reference_script.json;
      } else {
        const scriptBytes = utxo.reference_script.bytes;
        if (scriptBytes) {
          const normalized = normalizePlutusScript(scriptBytes, "DoubleCBOR");
          script = <PlutusScript>{
            code: normalized,
            version: utxo.reference_script.type.replace("plutusv", "V"),
          };
        } else {
          throw new Error("Script bytes not found");
        }
      }
      return toScriptRef(script).toCbor().toString();
    } else return undefined;
  };
}
