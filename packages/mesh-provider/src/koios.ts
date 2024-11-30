import axios, { AxiosInstance, CreateAxiosDefaults } from "axios";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  castProtocol,
  fromUTF8,
  IFetcher,
  IListener,
  ISubmitter,
  PlutusScript,
  Protocol,
  SUPPORTED_HANDLES,
  toBytes,
  toUTF8,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import {
  deserializeNativeScript,
  fromNativeScript, normalizePlutusScript,
  resolveRewardAddress,
  toScriptRef,
} from "@meshsdk/core-cst";

import { utxosToAssets } from "./common/utxos-to-assets";
import { KoiosAsset, KoiosReferenceScript, KoiosUTxO } from "./types";
import { parseHttpError } from "./utils";
import { parseAssetUnit } from "./utils/parse-asset-unit";

export type KoiosSupportedNetworks = "api" | "preview" | "preprod" | "guild";

export class KoiosProvider implements IFetcher, IListener, ISubmitter {
  private readonly _axiosInstance: AxiosInstance;
  private readonly _network: KoiosSupportedNetworks;

  constructor(baseUrl: string);
  constructor(network: KoiosSupportedNetworks, token: string, version?: number);

  constructor(...args: unknown[]) {
    if (typeof args[0] === "string" && args[0].startsWith("http")) {
      this._axiosInstance = axios.create({
        baseURL: args[0],
        headers: {
          Authorization: `Bearer ${args[1]}`,
        },
      });
      this._network = "api";
    } else {
      let version = 1;
      if (typeof args[2] === "number") {
        version = args[2];
      }

      const config: CreateAxiosDefaults = {
        baseURL: `https://${args[0]}.koios.rest/api/v${version}`,
      };

      this._network = args[0] as KoiosSupportedNetworks;

      if (typeof args[1] === "string") {
        config.headers = {
          Authorization: `Bearer ${args[1]}`,
        };
      }

      this._axiosInstance = axios.create(config);
    }
  }

  async fetchAccountInfo(address: string): Promise<AccountInfo> {
    try {
      const rewardAddress = address.startsWith("addr")
        ? resolveRewardAddress(address)
        : address;

      const { data, status } = await this._axiosInstance.post("account_info", {
        _stake_addresses: [rewardAddress],
      });

      if (status === 200)
        return <AccountInfo>{
          poolId: data[0].delegated_pool,
          active: data[0].status === "registered",
          balance: data[0].total_balance.toString(),
          rewards: data[0].rewards_available,
          withdrawals: data[0].withdrawals,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchAddressAssets(
    address: string,
  ): Promise<{ [key: string]: string }> {
    const utxos = await this.fetchAddressUTxOs(address);
    return utxosToAssets(utxos);
  }

  /**
   * Transactions for an address.
   * @param address
   * @returns - partial TransactionInfo
   */
  async fetchAddressTransactions(address: string): Promise<TransactionInfo[]> {
    try {
      const { data, status } = await this._axiosInstance.post(`/address_txs`, {
        _addresses: [address],
      });
      if (status === 200 || status == 202) {
        return data.map((tx: any) => {
          return <TransactionInfo>{
            hash: tx.tx_hash,
            index: 0,
            block: "",
            slot: "",
            fees: "",
            size: 0,
            deposit: "",
            invalidBefore: "",
            invalidAfter: "",
          };
        });
      }
      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    try {
      const { data, status } = await this._axiosInstance.post("address_info", {
        _addresses: [address],
      });

      if (status === 200) {
        const utxos = <UTxO[]>(
          data
            .flatMap((info: { utxo_set: [] }) => info.utxo_set)
            .map((utxo: KoiosUTxO) => this.toUTxO(utxo, address))
        );

        return asset !== undefined
          ? utxos.filter(
              (utxo) =>
                utxo.output.amount.find((a) => a.unit === asset) !== undefined,
            )
          : utxos;
      }

      throw parseHttpError(data);
    } catch (error) {
      return [];
    }
  }

  async fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    try {
      const { policyId, assetName } = parseAssetUnit(asset);
      const { data, status } = await this._axiosInstance.get(
        `asset_addresses?_asset_policy=${policyId}&_asset_name=${assetName}`,
      );

      if (status === 200)
        return data.map(
          (item: {
            payment_address: string;
            quantity: string;
            stake_address: string;
          }) => ({
            address: item.payment_address,
            quantity: item.quantity,
          }),
        );

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
          fingerprint: data[0].fingerprint,
          totalSupply: data[0].total_supply,
          mintingTxHash: data[0].minting_tx_hash,
          mintCount: data[0].mint_cnt,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchBlockInfo(hash: string): Promise<BlockInfo> {
    try {
      const { data, status } = await this._axiosInstance.post("block_info", {
        _block_hashes: [hash],
      });

      if (status === 200)
        return <BlockInfo>{
          confirmations: data[0].num_confirmations,
          epoch: data[0].epoch_no,
          epochSlot: data[0].epoch_slot.toString(),
          fees: data[0].total_fees ?? "",
          hash: data[0].hash,
          nextBlock: data[0].child_hash ?? "",
          operationalCertificate: data[0].op_cert,
          output: data[0].total_output ?? "0",
          previousBlock: data[0].parent_hash,
          size: data[0].block_size,
          slot: data[0].abs_slot.toString(),
          slotLeader: data[0].pool ?? "",
          time: data[0].block_time,
          txCount: data[0].tx_count,
          VRFKey: data[0].vrf_key,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchCollectionAssets(policyId: string): Promise<{ assets: Asset[] }> {
    try {
      const { data, status } = await this._axiosInstance.get(
        `policy_asset_info?_asset_policy=${policyId}`,
      );

      if (status === 200)
        return {
          assets: data.map((asset: KoiosAsset) => ({
            unit: `${asset.policy_id}${asset.asset_name}`,
            quantity: asset.total_supply,
          })),
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchHandle(handle: string): Promise<AssetMetadata> {
    if (this._network !== "api") {
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
    if (this._network !== "api") {
      throw new Error(
        "Does not support fetching addresses by handle on non-mainnet networks.",
      );
    }
    try {
      const assetName = fromUTF8(handle.replace("$", ""));
      const { data, status } = await this._axiosInstance.get(
        `asset_addresses?_asset_policy=${SUPPORTED_HANDLES[1]}&_asset_name=${assetName}`,
      );

      if (status === 200) return data[0].payment_address;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchProtocolParameters(epoch = Number.NaN): Promise<Protocol> {
    try {
      if (isNaN(epoch)) {
        const { data } = await this._axiosInstance.get(`tip`);
        epoch = data[0].epoch_no;
      }

      const { data, status } = await this._axiosInstance.get(
        `epoch_params?_epoch_no=${epoch}`,
      );

      if (status === 200)
        return castProtocol({
          coinsPerUtxoSize: data[0].coins_per_utxo_size,
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
          maxValSize: data[0].max_val_size,
          minFeeA: data[0].min_fee_a,
          minFeeB: data[0].min_fee_b,
          minPoolCost: data[0].min_pool_cost,
          poolDeposit: data[0].pool_deposit,
          priceMem: data[0].price_mem,
          priceStep: data[0].price_step,
        });

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    try {
      const { data, status } = await this._axiosInstance.post("tx_info", {
        _tx_hashes: [hash],
      });

      if (status === 200 && data.length == 1)
        return <TransactionInfo>{
          block: data[0].block_hash,
          deposit: data[0].deposit,
          fees: data[0].fee,
          hash: data[0].tx_hash,
          index: data[0].tx_block_index,
          invalidAfter: data[0].invalid_after?.toString() ?? "",
          invalidBefore: data[0].invalid_before?.toString() ?? "",
          slot: data[0].absolute_slot.toString(),
          size: data[0].tx_size,
        };

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    try {
      const { data, status } = await this._axiosInstance.post("tx_info", {
        _tx_hashes: [hash],
      });

      if (status === 200) {
        const utxos: UTxO[] = data[0].outputs.map((utxo: KoiosUTxO) =>
          this.toUTxO(utxo, "undefined"),
        );

        if (index !== undefined) {
          return utxos.filter((utxo) => utxo.input.outputIndex === index);
        }

        return utxos;
      }
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

  async submitTx(tx: string): Promise<string> {
    try {
      const headers = { "Content-Type": "application/cbor" };

      const { data, status } = await this._axiosInstance.post(
        "submittx",
        toBytes(tx),
        { headers },
      );

      if (status === 202) return data;

      throw parseHttpError(data);
    } catch (error) {
      throw parseHttpError(error);
    }
  }

  private toUTxO(utxo: KoiosUTxO, address: string): UTxO {
    return {
      input: {
        outputIndex: utxo.tx_index,
        txHash: utxo.tx_hash,
      },
      output: {
        address: address,
        amount: [
          { unit: "lovelace", quantity: utxo.value },
          ...utxo.asset_list.map(
            (a: KoiosAsset) =>
              <Asset>{
                unit: `${a.policy_id}${a.asset_name}`,
                quantity: `${a.quantity}`,
              },
          ),
        ],
        dataHash: utxo.datum_hash ?? undefined,
        plutusData: utxo.inline_datum?.bytes ?? undefined,
        scriptRef: this.resolveScriptRef(utxo.reference_script),
        scriptHash: utxo.reference_script?.hash ?? undefined,
      },
    };
  }

  private resolveScriptRef = (
    kScriptRef: KoiosReferenceScript | undefined,
  ): string | undefined => {
    if (kScriptRef) {
      let script;
      if(kScriptRef.type.startsWith("plutus")) {
        const normalized = normalizePlutusScript(kScriptRef.bytes, "DoubleCBOR");
        script = <PlutusScript>{
          code: normalized,
          version: kScriptRef.type.replace("plutus", ""),
        }
      } else {
        script = fromNativeScript(deserializeNativeScript(kScriptRef.bytes));
      }

      if (script) return toScriptRef(script).toCbor().toString();
    }

    return undefined;
  };
}
