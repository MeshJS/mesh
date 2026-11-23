import { resolveEpochEnd } from "../data/time";
import { IFetcher, IFetcherOptions } from "../interfaces/fetcher";
import {
  AccountInfo,
  Asset,
  AssetMetadata,
  BlockInfo,
  Network,
  Protocol,
  TransactionInfo,
  UTxO,
} from "../types";
import { GovernanceProposalInfo } from "../types/governance";

/** Networks whose epoch boundaries are known, used when the fetcher's network is not */
const PUBLIC_NETWORKS: Network[] = ["mainnet", "preprod", "preview"];

/**
 * How long after an epoch boundary values for the latest epoch are only kept briefly,
 * since a provider can take a moment to start serving the new epoch's parameters.
 */
const EPOCH_SETTLE_MS = 5 * 60 * 1000;

const DEFAULT_MAX_CACHED_TXS = 1000;

/**
 * Half of Cardano's average block time: 1 s slots with an active slot coefficient of 0.05
 * give a block every 20 s. Chain state read within this window is very unlikely to have moved.
 */
const DEFAULT_VOLATILE_TTL_MS = 10 * 1000;

/** Most short-lived answers kept at once, dropping the oldest first */
const MAX_VOLATILE_ENTRIES = 1000;

type CacheEntry<T> = { value: Promise<T>; expiresAt: number };

export type CachedFetcherOptions = {
  /**
   * The network the fetcher serves. Values for the latest epoch are kept until that
   * network's epoch ends; without it, until the earliest epoch end of mainnet, preprod
   * and preview. `"testnet"` (a custom network) disables caching of epoch values.
   */
  network?: Network;
  /** Most transactions whose outputs are kept, dropping the least recently used first */
  maxCachedTxs?: number;
  /**
   * How long answers reflecting current chain state (address UTxOs, account info, ...) are
   * kept, in milliseconds. Defaults to 10 s, half the average block time; 0 disables it.
   */
  volatileTtlMs?: number;
  /** Clock in milliseconds, for tests */
  now?: () => number;
};

/**
 * An `IFetcher` that remembers answers for as long as they can be trusted:
 *
 * - `fetchUTxOs(hash)`: the outputs of a transaction are fixed by its body, so they are
 *   fetched once per hash (all outputs at once, whatever `index` is asked for).
 * - `fetchProtocolParameters` and `fetchCostModels`: parameters change only at an epoch
 *   boundary, so the latest ones are kept until the current epoch ends, and those of a
 *   given past epoch for good.
 * - Everything else reflects current chain state and is kept only briefly (10 s by default,
 *   half the average block time), so a burst of identical queries costs one request. Call
 *   `clearVolatile()` after submitting a transaction to see its effects as soon as the
 *   provider does; `MeshTxBuilder.submitTx` does so.
 *
 * Concurrent calls for the same key share one request, and failures are never remembered,
 * nor are empty transaction outputs. `get(url)` is passed straight through.
 */
export class CachedFetcher implements IFetcher {
  private static readonly shared = new WeakMap<IFetcher, CachedFetcher>();

  /**
   * One shared cache per fetcher, so separate builders and evaluators using the same
   * provider reuse each other's answers.
   * @param fetcher The fetcher to wrap; returned as is if it already caches
   */
  static wrap(fetcher: IFetcher): CachedFetcher {
    if (fetcher instanceof CachedFetcher) return fetcher;
    let cached = CachedFetcher.shared.get(fetcher);
    if (!cached) {
      cached = new CachedFetcher(fetcher);
      CachedFetcher.shared.set(fetcher, cached);
    }
    return cached;
  }

  network?: Network;
  private readonly maxCachedTxs: number;
  private readonly volatileTtlMs: number;
  private readonly now: () => number;
  private readonly txOutputs = new Map<string, Promise<UTxO[]>>();
  private readonly epochValues = new Map<string, CacheEntry<unknown>>();
  private readonly volatileValues = new Map<string, CacheEntry<unknown>>();

  constructor(
    readonly fetcher: IFetcher,
    options: CachedFetcherOptions = {},
  ) {
    this.network = options.network;
    this.maxCachedTxs = options.maxCachedTxs ?? DEFAULT_MAX_CACHED_TXS;
    this.volatileTtlMs = options.volatileTtlMs ?? DEFAULT_VOLATILE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Forget everything cached */
  clear() {
    this.txOutputs.clear();
    this.epochValues.clear();
    this.volatileValues.clear();
  }

  /** Forget answers reflecting current chain state, e.g. after submitting a transaction */
  clearVolatile() {
    this.volatileValues.clear();
  }

  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    let utxos = await this.fetchTxOutputs(hash);
    if (index === undefined) return utxos;
    let utxo = utxos.find((u) => u.input.outputIndex === index);
    if (!utxo) {
      // Not seen by the provider when first asked; ask again
      this.txOutputs.delete(hash);
      utxos = await this.fetchTxOutputs(hash);
      utxo = utxos.find((u) => u.input.outputIndex === index);
    }
    return utxo ? [utxo] : [];
  }

  fetchProtocolParameters(epoch: number): Promise<Protocol> {
    return this.cacheForEpoch(`params:${epoch}`, epoch, () =>
      this.fetcher.fetchProtocolParameters(epoch),
    );
  }

  fetchCostModels(epoch?: number): Promise<number[][]> {
    return this.cacheForEpoch(`costModels:${epoch}`, epoch, () =>
      this.fetcher.fetchCostModels(epoch),
    );
  }

  fetchAccountInfo(address: string): Promise<AccountInfo> {
    return this.cacheBriefly(["fetchAccountInfo", address], () =>
      this.fetcher.fetchAccountInfo(address),
    );
  }

  fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    return this.cacheBriefly(["fetchAddressUTxOs", address, asset], () =>
      this.fetcher.fetchAddressUTxOs(address, asset),
    );
  }

  fetchAddressTxs(
    address: string,
    options?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    return this.cacheBriefly(["fetchAddressTxs", address, options], () =>
      this.fetcher.fetchAddressTxs(address, options),
    );
  }

  fetchAssetAddresses(
    asset: string,
  ): Promise<{ address: string; quantity: string }[]> {
    return this.cacheBriefly(["fetchAssetAddresses", asset], () =>
      this.fetcher.fetchAssetAddresses(asset),
    );
  }

  fetchAssetMetadata(asset: string): Promise<AssetMetadata> {
    return this.cacheBriefly(["fetchAssetMetadata", asset], () =>
      this.fetcher.fetchAssetMetadata(asset),
    );
  }

  fetchBlockInfo(hash: string): Promise<BlockInfo> {
    return this.cacheBriefly(["fetchBlockInfo", hash], () =>
      this.fetcher.fetchBlockInfo(hash),
    );
  }

  fetchCollectionAssets(
    policyId: string,
    cursor?: number | string,
  ): Promise<{ assets: Asset[]; next?: string | number | null }> {
    return this.cacheBriefly(["fetchCollectionAssets", policyId, cursor], () =>
      this.fetcher.fetchCollectionAssets(policyId, cursor),
    );
  }

  fetchTxInfo(hash: string): Promise<TransactionInfo> {
    return this.cacheBriefly(["fetchTxInfo", hash], () =>
      this.fetcher.fetchTxInfo(hash),
    );
  }

  fetchGovernanceProposal(
    txHash: string,
    certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    return this.cacheBriefly(
      ["fetchGovernanceProposal", txHash, certIndex],
      () => this.fetcher.fetchGovernanceProposal(txHash, certIndex),
    );
  }

  get(url: string): Promise<any> {
    return this.fetcher.get(url);
  }

  private fetchTxOutputs(hash: string): Promise<UTxO[]> {
    const cached = this.txOutputs.get(hash);
    if (cached) {
      // Mark as recently used
      this.txOutputs.delete(hash);
      this.txOutputs.set(hash, cached);
      return cached;
    }
    const request = this.fetcher.fetchUTxOs(hash);
    this.txOutputs.set(hash, request);
    request.then(
      (utxos) => {
        if (!utxos || utxos.length === 0) this.forgetTx(hash, request);
      },
      () => this.forgetTx(hash, request),
    );
    if (this.txOutputs.size > this.maxCachedTxs) {
      this.txOutputs.delete(this.txOutputs.keys().next().value!);
    }
    return request;
  }

  private forgetTx(hash: string, request: Promise<UTxO[]>) {
    if (this.txOutputs.get(hash) === request) this.txOutputs.delete(hash);
  }

  private cacheBriefly<T>(key: unknown[], fetch: () => Promise<T>): Promise<T> {
    if (this.volatileTtlMs <= 0) return fetch();
    const keyString = JSON.stringify(key);
    const now = this.now();
    const cached = this.volatileValues.get(keyString);
    if (cached && cached.expiresAt > now) return cached.value as Promise<T>;

    const value = fetch();
    const entry = { value, expiresAt: now + this.volatileTtlMs };
    this.volatileValues.delete(keyString);
    this.volatileValues.set(keyString, entry);
    value.catch(() => {
      if (this.volatileValues.get(keyString) === entry)
        this.volatileValues.delete(keyString);
    });
    // Entries are kept in insertion order, so the oldest - and first to expire - lead
    for (const [oldKey, oldEntry] of this.volatileValues) {
      if (
        oldEntry.expiresAt > now &&
        this.volatileValues.size <= MAX_VOLATILE_ENTRIES
      )
        break;
      this.volatileValues.delete(oldKey);
    }
    return value;
  }

  private cacheForEpoch<T>(
    key: string,
    epoch: number | undefined,
    fetch: () => Promise<T>,
  ): Promise<T> {
    const now = this.now();
    const cached = this.epochValues.get(key);
    if (cached && cached.expiresAt > now) return cached.value as Promise<T>;

    const expiresAt = this.epochValueExpiry(epoch, now);
    if (expiresAt <= now) return fetch();
    const value = fetch();
    const entry = { value, expiresAt };
    this.epochValues.set(key, entry);
    value.catch(() => {
      if (this.epochValues.get(key) === entry) this.epochValues.delete(key);
    });
    return value;
  }

  /**
   * Values asked for by epoch number are final once fetched. The latest ones last until
   * the current epoch ends - only briefly right after a boundary, while providers catch up.
   */
  private epochValueExpiry(epoch: number | undefined, now: number): number {
    if (epoch !== undefined && Number.isInteger(epoch)) return Infinity;
    if (this.network === "testnet") return now;
    const networks = this.network ? [this.network] : PUBLIC_NETWORKS;
    let epochEnd = Infinity;
    let epochStart = -Infinity;
    for (const network of networks) {
      const end = resolveEpochEnd(network, now);
      const length = resolveEpochEnd(network, end) - end;
      epochEnd = Math.min(epochEnd, end);
      epochStart = Math.max(epochStart, end - length);
    }
    const settled = epochStart + EPOCH_SETTLE_MS;
    return now < settled ? Math.min(settled, epochEnd) : epochEnd;
  }
}
