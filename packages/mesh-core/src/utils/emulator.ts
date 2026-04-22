import { Emulator, SlotConfig as ScalusSlotConfig, SubmitResult } from "scalus";

import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  GovernanceProposalInfo,
  IFetcher,
  IFetcherOptions,
  Protocol,
  SlotConfig,
  TransactionInfo,
  UTxO,
} from "@meshsdk/common";
import { cborMapToUtxos, utxosToCborMap } from "@meshsdk/core-cst";
import { OfflineFetcher } from "@meshsdk/provider";

export class MeshEmulator extends Emulator implements IFetcher {
  fetcher: OfflineFetcher;

  constructor(initialUtxos: UTxO[], slotConfig: SlotConfig) {
    super(
      Buffer.from(utxosToCborMap(initialUtxos), "hex"),
      new ScalusSlotConfig(
        slotConfig.zeroTime,
        slotConfig.zeroSlot,
        slotConfig.slotLength,
      ),
    );
    this.fetcher = new OfflineFetcher();
    this.fetcher.addUTxOs(initialUtxos);
  }
  fetchAccountInfo(address: string): Promise<AccountInfo> {
    return this.fetcher.fetchAccountInfo(address);
  }
  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    return this.fetcher.fetchAddressUTxOs(address, asset);
  }
  fetchAddressTxs(
    address: string,
    options?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    return this.fetcher.fetchAddressTxs(address, options);
  }
  fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    return this.fetcher.fetchAssetAddresses(asset);
  }
  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    return this.fetcher.fetchAssetMetadata(asset);
  }
  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    return this.fetcher.fetchBlockInfo(hash);
  }
  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }> {
    return this.fetcher.fetchCollectionAssets(policyId, cursor);
  }
  fetchProtocolParameters(epoch: number): Promise<Protocol> {
    return this.fetcher.fetchProtocolParameters(epoch);
  }
  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    return this.fetcher.fetchTxInfo(hash);
  }
  fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    return this.fetcher.fetchUTxOs(hash);
  }
  fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    return this.fetcher.fetchGovernanceProposal(txHash, certIndex);
  }
  get(url: string): Promise<any> {
    return this.fetcher.get(url);
  }

  submitTxHex(txHex: string): SubmitResult {
    const result = this.submitTx(Buffer.from(txHex, "hex"));
    if (result.isSuccess) {
      this.fetcher = new OfflineFetcher();
      this.fetcher.addUTxOs(this.getAllUtxosMesh());
    }
    return result;
  }

  getAllUtxosMesh() {
    const allUtxos = this.getAllUtxos();
    const utxoList = allUtxos.map((u) => Buffer.from(u).toString("hex"));
    return cborMapToUtxos(utxoList);
  }
}
