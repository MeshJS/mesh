import type { IFetcher } from "@meshsdk/common";
import { CachedFetcher } from "@meshsdk/common";

import type { SubmitFailureReason } from "../errors";
import type { OutRef } from "../parts/types";
import { TIP_AHEAD_TOLERANCE_MS } from "./core";

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
   * number 0 or more, when it is older than a tip this observer has already read, and, for an
   * observer that knows the time of a slot, when its slot starts later than the local clock by
   * more than the tolerance: such a tip is neither taken nor kept.
   */
  tip(): Promise<ObservedTip | undefined>;
  /** A transaction by hash: found, not found, a provider without search, or unknown */
  findTx(txHash: string): Promise<TxSearch>;
  /**
   * The out refs of the unspent outputs at an address, read past the cache. An empty list, a
   * list with an entry whose out ref cannot be read, a failed read and a read while the provider
   * keeps an address cache are unknown.
   */
  utxosAt(address: string): Promise<readonly OutRef[] | undefined>;
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

/**
 * The codes of a connection that failed, was reset or timed out, as Node's sockets, DNS and TLS,
 * its `fetch` (undici) and axios set them on an error or on its `cause`
 */
const TRANSPORT_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  "ENETUNREACH",
  "ENETDOWN",
  "EPIPE",
  "ERR_NETWORK",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
  "ERR_TLS_HANDSHAKE_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** One field of a value; a getter or a proxy that throws tells nothing */
const fieldOf = (value: unknown, name: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    return (value as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
};

/**
 * The numeric `code` of a thrown value, as a wallet's error carries it; a getter or a proxy
 * that throws tells nothing
 */
export const numericCodeOf = (error: unknown): number | undefined => {
  const code = fieldOf(error, "code");
  return typeof code === "number" ? code : undefined;
};

/** An HTTP status, when the value is a whole number from 100 to 599 */
const httpStatusOf = (value: unknown): number | undefined =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 100 &&
  value <= 599
    ? value
    : undefined;

const reasonOfKind = (kind: string): SubmitFailureReason =>
  kind === "unavailable" || kind === "rateLimited" || kind === "unauthorized"
    ? kind
    : "unknown";

const reasonOfStatus = (status: number): SubmitFailureReason => {
  if (status === 429) return "rateLimited";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 408 || status === 425 || status >= 500) return "unavailable";
  return "unknown";
};

/**
 * The reason of a gRPC status, as a `ConnectError` carries it in `code`: Unauthenticated (16)
 * and PermissionDenied (7) `unauthorized`, ResourceExhausted (8) `rateLimited`, Unavailable
 * (14) and DeadlineExceeded (4) `unavailable`; any other undefined
 */
const reasonOfGrpcCode = (code: number): SubmitFailureReason | undefined => {
  if (code === 16 || code === 7) return "unauthorized";
  if (code === 8) return "rateLimited";
  if (code === 14 || code === 4) return "unavailable";
  return undefined;
};

/** A failed connection: a code of the list, or the name `TimeoutError` */
const isTransportFailure = (code: unknown, name: unknown) =>
  (typeof code === "string" && TRANSPORT_CODES.has(code)) ||
  name === "TimeoutError";

/**
 * What a thrown value says of a failed submission, read from its fields and never from the
 * text of an error. A refusal of the ledger, as `errorFact` reads it, decides first: `refused`.
 * Else a string `kind` decides: `unavailable`, `rateLimited` and `unauthorized` are the reason,
 * any other kind is `unknown`, and a status never overrides it. Else an HTTP `status` decides:
 * 429 `rateLimited`, 401 and 403 `unauthorized`, 408, 425 and 500 to 599 `unavailable`, any
 * other `unknown`. Else the gRPC status of a `ConnectError` (`name` "ConnectError" and a whole
 * number `code`): 16 and 7 `unauthorized`, 8 `rateLimited`, 14 and 4 `unavailable`. Else a
 * string `code` of the value or of its `cause` that is of a connection that failed, was reset
 * or timed out, or the name `TimeoutError` of either, is `unavailable`; everything else is
 * `unknown`. A thrown string that is a JSON object is read by its `status` and its `code`, as a
 * provider that throws its HTTP answer as text gives them. `status` is the value's own, when it
 * is a whole number from 100 to 599.
 */
export const submitFailure = (
  error: unknown,
): { reason: SubmitFailureReason; status?: number } => {
  let value: unknown = error;
  let kind: unknown;
  let name: unknown;
  let cause: unknown;
  if (typeof error === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(error);
    } catch {
      return { reason: "unknown" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { reason: "unknown" };
    value = parsed;
  } else if (typeof error === "object" && error !== null) {
    kind = fieldOf(error, "kind");
    name = fieldOf(error, "name");
    cause = fieldOf(error, "cause");
  } else return { reason: "unknown" };
  const status = httpStatusOf(fieldOf(value, "status"));
  const withStatus = status === undefined ? {} : { status };
  if (errorFact(error) === "rejected")
    return { reason: "refused", ...withStatus };
  if (typeof kind === "string")
    return { reason: reasonOfKind(kind), ...withStatus };
  if (status !== undefined) return { reason: reasonOfStatus(status), status };
  const code = fieldOf(value, "code");
  if (name === "ConnectError" && Number.isInteger(code)) {
    const reason = reasonOfGrpcCode(code as number);
    if (reason !== undefined) return { reason };
  }
  if (
    isTransportFailure(code, name) ||
    isTransportFailure(fieldOf(cause, "code"), fieldOf(cause, "name"))
  )
    return { reason: "unavailable" };
  return { reason: "unknown" };
};

/** The words of each reason: what the submitter's error says, and no more */
const SUBMIT_FAILURE_WORDS: Record<SubmitFailureReason, string> = {
  unavailable:
    "the submitter's error is a failed, reset or timed-out connection or request, or a server that did not take the request",
  rateLimited: "the submitter's error is a rate limit or an exhausted quota",
  unauthorized:
    "the submitter's error is an authorization failure, such as a wrong API key",
  refused:
    "the submitter's error is a refusal of the ledger, which proves nothing here",
  unknown: "the submitter's error does not give a reason this library reads",
};

/** The words of a failed submission's reason, with its HTTP status, for the start of a message */
export const submitFailureText = ({
  reason,
  status,
}: {
  reason: SubmitFailureReason;
  status?: number;
}): string =>
  status === undefined
    ? SUBMIT_FAILURE_WORDS[reason]
    : `${SUBMIT_FAILURE_WORDS[reason]} (HTTP ${status})`;

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
 * The out ref of one entry of an address list: its `input.txHash`, a string, and its
 * `input.outputIndex`, a number. Anything else, a getter that throws included, is unreadable.
 */
const outRefOfEntry = (entry: unknown): OutRef | undefined => {
  try {
    if (typeof entry !== "object" || entry === null) return undefined;
    const input: unknown = (entry as { input?: unknown }).input;
    if (typeof input !== "object" || input === null) return undefined;
    const { txHash, outputIndex } = input as {
      txHash?: unknown;
      outputIndex?: unknown;
    };
    if (typeof txHash !== "string" || typeof outputIndex !== "number")
      return undefined;
    return { txHash, outputIndex };
  } catch {
    return undefined;
  }
};

/** What an observer knows of time: the POSIX ms a slot starts at, and whom to tell of a tip */
export type ObserverClock = {
  readonly timeAt: (slot: number) => number;
  /** Told of a tip whose slot starts later than the local clock by more than the tolerance */
  readonly ahead?: (slot: number, aheadMs: number) => void;
};

/**
 * The chain observer of one plan object, over the builder's provider. A builder without a
 * provider gives an observer that knows nothing. With a clock, a tip ahead of the local clock by
 * more than the tolerance is unknown: a block is never made for a slot that has not begun.
 */
export const chainObserver = (
  provider: IFetcher | undefined,
  clock?: ObserverClock,
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
    if (clock !== undefined) {
      const aheadMs = clock.timeAt(slot) - Date.now();
      if (aheadMs > TIP_AHEAD_TOLERANCE_MS) {
        try {
          clock.ahead?.(slot, aheadMs);
        } catch {
          // Being told changes nothing
        }
        return undefined;
      }
    }
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
  ): Promise<readonly OutRef[] | undefined> => {
    // Asked before every read: a cache may be switched on after the plan was made
    if (inner === undefined || keepsAddressCache(inner)) return undefined;
    let utxos: unknown;
    try {
      utxos = await inner.fetchAddressUTxOs(address);
    } catch {
      return undefined;
    }
    // An empty list is no evidence: a provider may answer [] to an error
    if (!Array.isArray(utxos) || utxos.length === 0) return undefined;
    // A list with an entry that cannot be read says nothing of the out refs it holds
    const refs: OutRef[] = [];
    for (const entry of utxos as unknown[]) {
      const ref = outRefOfEntry(entry);
      if (ref === undefined) return undefined;
      refs.push(ref);
    }
    return refs;
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
