import { IFetcher, ISubmitter, UTxO, DEFAULT_PROTOCOL_PARAMETERS, Protocol } from "@meshsdk/common";
import { resolveTxHash } from "@meshsdk/core-cst";

/**
 * In-memory `IFetcher` for unit tests: seeded with a fixed UTxO set, no live network. Only
 * implements the subset of `IFetcher` this package actually calls - everything else throws,
 * to catch accidental use of a method our code doesn't (and therefore this fake doesn't) support.
 */
export class FakeFetcher implements IFetcher {
  private utxos: UTxO[];
  private readonly txInfoByHash = new Map<string, { block: string }>();
  private readonly blockConfirmations = new Map<string, number>();

  constructor(utxos: UTxO[] = []) {
    this.utxos = utxos;
  }

  addUtxo(utxo: UTxO): void {
    this.utxos.push(utxo);
  }

  /** Marks a `txHash#index` as spent by removing it from the live UTxO set. */
  spend(txHash: string, outputIndex: number): void {
    this.utxos = this.utxos.filter(
      (u) => !(u.input.txHash === txHash && u.input.outputIndex === outputIndex),
    );
  }

  setConfirmed(txHash: string, blockHash: string, confirmations: number): void {
    this.txInfoByHash.set(txHash, { block: blockHash });
    this.blockConfirmations.set(blockHash, confirmations);
  }

  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    return this.utxos.filter(
      (u) => u.input.txHash === hash && (index === undefined || u.input.outputIndex === index),
    );
  }

  async fetchAddressUTxOs(address: string): Promise<UTxO[]> {
    return this.utxos.filter((u) => u.output.address === address);
  }

  async fetchTxInfo(hash: string) {
    const info = this.txInfoByHash.get(hash);
    if (!info) throw new Error(`FakeFetcher: no tx info for ${hash}`);
    return info as unknown as Awaited<ReturnType<IFetcher["fetchTxInfo"]>>;
  }

  async fetchBlockInfo(hash: string) {
    const confirmations = this.blockConfirmations.get(hash);
    if (confirmations === undefined) throw new Error(`FakeFetcher: no block info for ${hash}`);
    return { confirmations } as unknown as Awaited<ReturnType<IFetcher["fetchBlockInfo"]>>;
  }

  async fetchProtocolParameters(): Promise<Protocol> {
    return DEFAULT_PROTOCOL_PARAMETERS;
  }

  /** MeshTxBuilder consults this during `.complete()`; an empty result makes it fall back to defaults. */
  async fetchCostModels(): Promise<number[][]> {
    return [];
  }

  fetchAccountInfo(): never {
    throw new Error("FakeFetcher: fetchAccountInfo not implemented");
  }
  fetchAddressTxs(): never {
    throw new Error("FakeFetcher: fetchAddressTxs not implemented");
  }
  fetchAssetAddresses(): never {
    throw new Error("FakeFetcher: fetchAssetAddresses not implemented");
  }
  fetchAssetMetadata(): never {
    throw new Error("FakeFetcher: fetchAssetMetadata not implemented");
  }
  fetchCollectionAssets(): never {
    throw new Error("FakeFetcher: fetchCollectionAssets not implemented");
  }
  fetchGovernanceProposal(): never {
    throw new Error("FakeFetcher: fetchGovernanceProposal not implemented");
  }
  get(): never {
    throw new Error("FakeFetcher: get not implemented");
  }
}

/** In-memory `ISubmitter` for unit tests: records what was submitted, never broadcasts. */
export class FakeSubmitter implements ISubmitter {
  readonly submitted: string[] = [];

  async submitTx(tx: string): Promise<string> {
    this.submitted.push(tx);
    return resolveTxHash(tx);
  }
}
