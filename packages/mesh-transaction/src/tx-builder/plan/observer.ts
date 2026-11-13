import type { IFetcher, UTxO } from "@meshsdk/common";
import { CachedFetcher } from "@meshsdk/common";

// What a plan reads from the chain, and how it reads what a provider throws. Every read goes
// to the provider itself, past the shared cache, and every failure is "unknown": never "no".
// Nothing here is exported from the package.

/** The provider's latest block: its slot, and its height when it reports a usable one */
export type ObservedTip = { readonly slot: number; readonly height?: number };

/**
 * What a search for a transaction answered: found, with what the answer gave of its block;
 * `{ found: false }` not found; `{ unsupported: true }` the provider has no search. `undefined`:
 * unknown.
 */
export type TxSearch =
  | {
      readonly found: true;
      /** The slot of the block it is in */
      readonly slot?: number;
      readonly block?: string;
      /** The height of the block it is in */
      readonly blockHeight?: number;
      /** `false`: a Plutus script failed and only the collateral was taken */
      readonly validContract?: boolean;
    }
  | { readonly found: false }
  | { readonly unsupported: true }
  | undefined;

/** What a plan reads from the chain. Every failure is `undefined`: unknown, never "no" */
export type ChainObserver = {
  /**
   * The provider's latest block. Unknown when it cannot be read, when its slot is not a whole
   * number 0 or more, and when it is older than a tip this observer has already read.
   */
  tip(): Promise<ObservedTip | undefined>;
  /** A transaction by hash: found, not found, a provider without search, or unknown */
  findTx(txHash: string): Promise<TxSearch>;
  /**
   * The unspent outputs at an address, read past the cache. An empty list, a failed read and a
   * read while the provider keeps an address cache are unknown.
   */
  utxosAt(address: string): Promise<readonly UTxO[] | undefined>;
};

/**
 * What a thrown value says, read from its `kind`, else from its `status`, and from nothing
 * else: `"notFound"` (kind `notFound`, or status 404), `"rejected"` (kind `rejected`, or status
 * 400), `"unsupported"` (kind `unsupported`). A thrown string that is a JSON object is read by
 * its numeric `status` alone, as a provider that throws its HTTP answer as text does. The text
 * of an error is never read: everything else is unknown.
 */
export const errorFact = (
  error: unknown,
): "notFound" | "rejected" | "unsupported" | undefined => {
  let fields: { kind?: unknown; status?: unknown } | undefined;
  if (typeof error === "object" && error !== null)
    fields = error as { kind?: unknown; status?: unknown };
  else if (typeof error === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(error);
    } catch {
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return undefined;
    fields = { status: (parsed as { status?: unknown }).status };
  }
  if (fields === undefined) return undefined;
  let kind: unknown;
  let status: unknown;
  try {
    ({ kind, status } = fields);
  } catch {
    // A getter that throws tells nothing
    return undefined;
  }
  if (typeof kind === "string") {
    if (kind === "notFound" || kind === "rejected" || kind === "unsupported")
      return kind;
    return undefined;
  }
  if (status === 404) return "notFound";
  if (status === 400) return "rejected";
  return undefined;
};

/** A submission refused by the ledger, as far as the thrown value says so */
export const isRefusal = (error: unknown) => errorFact(error) === "rejected";

/** The provider itself, past any `CachedFetcher` around it */
export const unwrapProvider = (provider: IFetcher): IFetcher => {
  let inner = provider;
  while (inner instanceof CachedFetcher) inner = inner.fetcher;
  return inner;
};

/**
 * Whether the provider says it keeps a cache of address UTxOs: its own `isCachingEnabled()`
 * answers `true`. A method that throws is taken as yes, since it does not say no.
 */
export const keepsAddressCache = (provider: IFetcher): boolean => {
  const inner = unwrapProvider(provider) as {
    isCachingEnabled?: unknown;
  };
  if (typeof inner.isCachingEnabled !== "function") return false;
  try {
    return (inner.isCachingEnabled as () => unknown).call(inner) === true;
  } catch {
    return true;
  }
};

/** A slot as a provider gives it, a string of digits or a number, when it is a whole number */
const slotOf = (value: unknown): number | undefined => {
  const slot =
    typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : typeof value === "number"
        ? value
        : undefined;
  return slot !== undefined && Number.isSafeInteger(slot) && slot >= 0
    ? slot
    : undefined;
};

/** A block height, when it is a whole number 0 or more */
const heightOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

/**
 * The chain observer of one plan object, over the builder's provider. A builder without a
 * provider gives an observer that knows nothing.
 */
export const chainObserver = (
  provider: IFetcher | undefined,
): ChainObserver => {
  const inner = provider === undefined ? undefined : unwrapProvider(provider);
  /** The highest slot of a tip this observer has read */
  let highestSlot = -1;

  const tip = async (): Promise<ObservedTip | undefined> => {
    if (typeof inner?.fetchLatestBlock !== "function") return undefined;
    let block: unknown;
    try {
      block = await inner.fetchLatestBlock();
    } catch {
      return undefined;
    }
    if (typeof block !== "object" || block === null) return undefined;
    const { slot: rawSlot, height: rawHeight } = block as {
      slot?: unknown;
      height?: unknown;
    };
    const slot = slotOf(rawSlot);
    if (slot === undefined || slot < highestSlot) return undefined;
    highestSlot = slot;
    const height = heightOf(rawHeight);
    return height === undefined ? { slot } : { slot, height };
  };

  const findTx = async (txHash: string): Promise<TxSearch> => {
    if (inner === undefined) return undefined;
    if (typeof inner.fetchTxInfo !== "function") return { unsupported: true };
    let info: unknown;
    try {
      info = await inner.fetchTxInfo(txHash);
    } catch (error) {
      const fact = errorFact(error);
      if (fact === "notFound") return { found: false };
      if (fact === "unsupported") return { unsupported: true };
      return undefined;
    }
    if (typeof info !== "object" || info === null) return undefined;
    const answer = info as {
      hash?: unknown;
      slot?: unknown;
      block?: unknown;
      blockHeight?: unknown;
      validContract?: unknown;
    };
    // An answer about another transaction says nothing about this one
    if (
      typeof answer.hash === "string" &&
      answer.hash.toLowerCase() !== txHash.toLowerCase()
    )
      return undefined;
    const slot = slotOf(answer.slot);
    const blockHeight = heightOf(answer.blockHeight);
    return {
      found: true,
      ...(slot !== undefined && { slot }),
      ...(typeof answer.block === "string" && { block: answer.block }),
      ...(blockHeight !== undefined && { blockHeight }),
      ...(typeof answer.validContract === "boolean" && {
        validContract: answer.validContract,
      }),
    };
  };

  const utxosAt = async (
    address: string,
  ): Promise<readonly UTxO[] | undefined> => {
    // Asked before every read: a cache may be switched on after the plan was made
    if (inner === undefined || keepsAddressCache(inner)) return undefined;
    let utxos: unknown;
    try {
      utxos = await inner.fetchAddressUTxOs(address);
    } catch {
      return undefined;
    }
    // An empty list is no evidence: a provider may answer [] to an error
    return Array.isArray(utxos) && utxos.length > 0
      ? (utxos as UTxO[])
      : undefined;
  };

  return { tip, findTx, utxosAt };
};

/**
 * One look at the chain: a search for each transaction, then the tip, read after every search
 * has answered, so that a find is never newer than the tip it is judged by
 */
export const searchThenTip = async (
  observer: ChainObserver,
  txHashes: readonly string[],
): Promise<{
  readonly searches: ReadonlyMap<string, TxSearch>;
  readonly tip: ObservedTip | undefined;
}> => {
  const answers = await Promise.all(txHashes.map((h) => observer.findTx(h)));
  const searches = new Map(txHashes.map((h, i) => [h, answers[i]]));
  return { searches, tip: await observer.tip() };
};
