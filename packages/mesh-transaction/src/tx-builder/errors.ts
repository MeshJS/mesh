import type { Budget, ScriptFailure } from "@meshsdk/common";

import type { TxPartError, TxPartErrorCode } from "./parts/errors";
import type { OutRef, TxPart, Unresolved } from "./parts/types";
import type { TxPlan } from "./plan/plan";
import type { TxAttempt, TxPlanStatus } from "./plan/types";
import type { RequiredKey } from "./witnesses";

/** Codes of a `TxBuildError`: why a transaction could not be built from its parts */
export type TxBuildErrorCode =
  /** A part still leaves something to be filled in; `details` lists the gaps */
  | "UNRESOLVED"
  /**
   * Two parts claim what a transaction holds only once: an input, a policy, a voter, ...; or a
   * prototype given to `finalize` names one output twice among its inputs, reference inputs or
   * collateral inputs, or reads an output it spends
   */
  | "DUPLICATE_PART"
  /**
   * Collateral inputs that cannot cover the total collateral, or that hold native assets in a
   * build without a collateral return
   */
  | "INVALID_COLLATERAL"
  /** Something has to be looked up, and the builder has no provider */
  | "MISSING_FETCHER"
  /** An output referenced by the transaction does not exist, or could not be fetched */
  | "UTXO_NOT_FOUND"
  /** A protocol parameter the transaction needs is not known */
  | "MISSING_PARAMETER"
  /** Execution units have to be worked out, and the builder has no evaluator */
  | "MISSING_EVALUATOR"
  /** The evaluator failed, or did not price every redeemer */
  | "EVALUATION_FAILED"
  /** A script needs more execution units than its redeemer states */
  | "EXUNITS_TOO_LOW"
  /** The transaction's scripts need more execution units than a transaction may use */
  | "EXUNITS_EXCEEDED"
  /** Execution units did not settle within the allowed evaluation rounds */
  | "EVALUATION_NOT_CONVERGED"
  /** The available UTxOs cannot pay for the transaction */
  | "INSUFFICIENT_FUNDS"
  /** No collateral, or not enough, can be put up for the transaction's scripts */
  | "INSUFFICIENT_COLLATERAL"
  /** An output holds less lovelace than the ledger requires */
  | "OUTPUT_BELOW_MIN_COIN"
  /** An output's value is larger than the ledger allows */
  | "VALUE_TOO_LARGE"
  /** The transaction is larger than the ledger allows */
  | "TX_TOO_LARGE"
  /** The fee given is below the transaction's minimum fee */
  | "FEE_TOO_LOW"
  /** Balancing did not settle on a fee within the allowed rounds */
  | "FEE_NOT_CONVERGED"
  /** The serializer cannot serialize a `TransactionPrototype` */
  | "UNSUPPORTED_SERIALIZER"
  /** An address, wallet, provider or plan record of another network than the builder's */
  | "NETWORK_MISMATCH"
  /** No `payer` says who pays */
  | "MISSING_PAYER"
  /**
   * A provider call failed, and no other code says what could not be read; the provider's error
   * is the `cause`
   */
  | "PROVIDER_FAILED"
  /** A redeemer function threw, asked for an item the tx does not hold, or gave bad data */
  | "INVALID_REDEEMER"
  /** A key guard whose hash is the hash of one of the transaction's scripts */
  | "INVALID_GUARD"
  /** `coinSelection` returned an out ref that names no candidate */
  | "INVALID_SELECTION"
  /** The call's `signal` aborted it */
  | "ABORTED"
  /** A part holds a redeemer function, which cannot be written as data */
  | "NOT_SERIALIZABLE"
  /** Reading the payer from a wallet failed */
  | "WALLET_FAILED"
  /** An option with a value that is not accepted */
  | "INVALID_OPTION"
  /** No output of the transaction has this label */
  | "UNKNOWN_LABEL";

/** Every build error code, once: the compiler checks the list against `TxBuildErrorCode` */
export const TX_BUILD_ERROR_CODES = Object.keys({
  UNRESOLVED: true,
  DUPLICATE_PART: true,
  INVALID_COLLATERAL: true,
  MISSING_FETCHER: true,
  UTXO_NOT_FOUND: true,
  MISSING_PARAMETER: true,
  MISSING_EVALUATOR: true,
  EVALUATION_FAILED: true,
  EXUNITS_TOO_LOW: true,
  EXUNITS_EXCEEDED: true,
  EVALUATION_NOT_CONVERGED: true,
  INSUFFICIENT_FUNDS: true,
  INSUFFICIENT_COLLATERAL: true,
  OUTPUT_BELOW_MIN_COIN: true,
  VALUE_TOO_LARGE: true,
  TX_TOO_LARGE: true,
  FEE_TOO_LOW: true,
  FEE_NOT_CONVERGED: true,
  UNSUPPORTED_SERIALIZER: true,
  NETWORK_MISMATCH: true,
  MISSING_PAYER: true,
  PROVIDER_FAILED: true,
  INVALID_REDEEMER: true,
  INVALID_GUARD: true,
  INVALID_SELECTION: true,
  ABORTED: true,
  NOT_SERIALIZABLE: true,
  WALLET_FAILED: true,
  INVALID_OPTION: true,
  UNKNOWN_LABEL: true,
} satisfies Record<TxBuildErrorCode, true>) as TxBuildErrorCode[];

/** A part's gaps, as listed in an `UNRESOLVED` error */
export type PartGaps = {
  kind: TxPart["kind"];
  label?: string;
  gaps: Unresolved[];
};

/** Why INSUFFICIENT_FUNDS */
export type InsufficientFundsDetails = {
  /** `"lovelace"` or the token unit: a key of a UTxO's `value` */
  unit: string;
  /**
   * What to add for this build to pass: outputs, deposits, the fee with every selectable UTxO
   * selected, and the change minimum. When `coinSelection` answered with nothing: what it was
   * asked for
   */
  missing: bigint;
  /** What the transaction takes out of `unit`, the fee and the change minimum included */
  required: bigint;
  /**
   * What the parts bring in of `unit`, and every selectable UTxO holds. When `coinSelection`
   * answered with nothing: what the parts bring in and the inputs selected before
   */
  available: bigint;
  /**
   * `noUtxos`: the payer has no UTxOs at all, or none that the transactions of `after` leave
   * (the message says so, and names the payer);
   * `change`: only the change minimum is short; `payment`: the rest
   */
  reason: "payment" | "change" | "noUtxos";
  /**
   * The fee of the transaction with every selectable UTxO selected, or of the round when
   * `coinSelection` answered with nothing; lovelace only
   */
  feeEstimate?: bigint;
  /** The least lovelace the change of that transaction must hold; lovelace only */
  changeMinimum?: bigint;
  /** The payer's UTxOs, and why some could not be selected */
  pool: {
    /** The payer's UTxOs, with the change of `after` transactions that joins them */
    given: number;
    selectable: number;
    scriptLocked: number;
    excludedByFilter: number;
    readByParts: number;
    /** The payer's UTxOs that a transaction given in `after` spends */
    spentByAfter: number;
  };
};

/** An address, wallet, provider or plan record of another network than the builder's */
export type NetworkMismatchDetails = {
  expected: { name: string; networkId: 0 | 1 };
  found: {
    role:
      | "payer"
      | "wallet"
      | "provider"
      | "utxo"
      | "output"
      | "collateralReturn"
      | "withdrawal"
      | "rewardAccount"
      /** The network a plan's record, or the JSON of a `BuiltTx`, was written for */
      | "record";
    address?: string;
    networkId?: number;
    network?: string;
    part?: TxPart["kind"];
    label?: string;
  }[];
};

/** A failed script joined to the part whose redeemer it ran */
export type PartFailure = ScriptFailure & {
  part: TxPart["kind"];
  label?: string;
};

/** `details` of a build error, by code; codes not listed carry none */
export type TxBuildErrorDetails = {
  UNRESOLVED: PartGaps[];
  /** The repeated key (out ref, policy, reward address, ...), or the kind held once */
  DUPLICATE_PART: { item: string };
  UTXO_NOT_FOUND: { input: OutRef };
  /** The option the value was expected from */
  MISSING_PARAMETER: { parameter: "params" | "costModels" | "deposits" };
  INSUFFICIENT_FUNDS: InsufficientFundsDetails;
  INSUFFICIENT_COLLATERAL: { required: bigint; available: bigint };
  NETWORK_MISMATCH: NetworkMismatchDetails;
  /**
   * The transaction evaluated, in CBOR hex, and its failed scripts. With exactly one failure,
   * the error's own `part` and `label` are that failure's
   */
  EVALUATION_FAILED: { tx: string; failures: PartFailure[] };
  EXUNITS_TOO_LOW: { needed: Budget; given: Budget };
  EXUNITS_EXCEEDED: { mem: bigint; steps: bigint };
  VALUE_TOO_LARGE: { size: number; maxValSize: number };
  TX_TOO_LARGE: { size: number; maxTxSize: number };
  FEE_TOO_LOW: { fee: bigint; minFee: bigint };
  OUTPUT_BELOW_MIN_COIN: { coin: bigint; minCoin: bigint };
  INVALID_REDEEMER: {
    reason:
      | "notAnInput"
      | "notAReferenceInput"
      | "noSuchOutput"
      | "threw"
      | "invalidData";
    ref?: string;
  };
  INVALID_SELECTION: { utxo: OutRef };
  /** The provider's method that failed */
  PROVIDER_FAILED: { operation: string };
  /** `scriptHash`: a key guard whose hash is the hash of one of the transaction's scripts */
  INVALID_GUARD: { reason: "scriptHash"; hash: string };
  /** A bad option, or a JSON version or part this library does not read */
  INVALID_OPTION: { option: string; value: unknown; allowed: string };
  /** The label asked for, and the labels the transaction's outputs have */
  UNKNOWN_LABEL: { label: string; labels: string[] };
  /** A failed payer read: the CIP-30 APIError code, -1..-4, if any */
  WALLET_FAILED: { walletCode?: number };
};

/**
 * Codes of a `TxPlanError`: signing, submitting and waiting for the chain, by a plan or by a
 * `BuiltTx`, any step of a plan, and its store
 */
export type TxPlanErrorCode =
  /** The signer declined to sign */
  | "SIGN_DECLINED"
  /** The signer failed, timed out, or changed accounts */
  | "SIGNER_FAILED"
  /** A witness set that cannot be used for the transaction */
  | "INVALID_WITNESS"
  /** Keys the transaction needs have not signed it */
  | "MISSING_SIGNATURES"
  /** Nothing to submit the transaction with: neither the call, the builder nor its provider */
  | "MISSING_SUBMITTER"
  /** The transaction's validity interval has not started yet */
  | "NOT_YET_VALID"
  /**
   * Submitting failed with an unknown outcome; the same bytes are safe to submit again: the same
   * call of the plan or of the transaction sends them
   */
  | "SUBMIT_FAILED"
  /**
   * The ledger rejected the transaction: a plan's attempt, or a transaction none of whose
   * deliveries can have gone through and that the provider does not find or cannot be asked for
   */
  | "REJECTED"
  /**
   * The transaction was not seen on chain within the time allowed; it may still land. From a
   * plan's wait, or from `awaitInclusion()` of a transaction
   */
  | "CONFIRM_TIMEOUT"
  /** The transaction's validity interval ended before it was included */
  | "EXPIRED"
  /**
   * The transaction was included with a failed script, and its collateral taken: a plan's
   * attempt, or a transaction `awaitInclusion()` finds
   */
  | "SCRIPT_FAILED"
  /**
   * The attempt spends an output of a parent attempt that can no longer land, or the parent has
   * no live attempt to build on; the attempt is live again once a fresh search finds none of the
   * parent attempts whose outputs it spends dead: each one is found in a block with
   * `is_valid = true`, or not found while the tip is before its deadline and the margin, and one
   * of them at least is found
   */
  | "ORPHANED"
  /**
   * The provider cannot tell what is needed, or cannot tell it yet: what a plan follows, or what
   * `awaitInclusion()` of a transaction looks for
   */
  | "CANNOT_OBSERVE"
  /** An attempt is on chain */
  | "ATTEMPT_ON_CHAIN"
  /**
   * The call does not fit the plan's state; or a record is not read: a plan's, or the JSON of a
   * transaction given to `restore`
   */
  | "INVALID_STATE"
  /** An attempt may still land */
  | "STILL_LIVE"
  /** The payer is not the one the plan was made for */
  | "PAYER_MISMATCH"
  /** Inputs the parts name explicitly are spent */
  | "INPUTS_SPENT"
  /** A plan with this id is already stored */
  | "PLAN_EXISTS"
  /** No plan with this id is stored */
  | "PLAN_NOT_FOUND"
  /** The stored plan was changed by someone else */
  | "VERSION_CONFLICT"
  /** The store failed */
  | "STORE_FAILED"
  /** The call needs a store, and none is given */
  | "MISSING_STORE"
  /** The call needs a plan id, and none is given */
  | "MISSING_ID";

/** Every plan error code, once: the compiler checks the list against `TxPlanErrorCode` */
export const TX_PLAN_ERROR_CODES = Object.keys({
  SIGN_DECLINED: true,
  SIGNER_FAILED: true,
  INVALID_WITNESS: true,
  MISSING_SIGNATURES: true,
  MISSING_SUBMITTER: true,
  NOT_YET_VALID: true,
  SUBMIT_FAILED: true,
  REJECTED: true,
  CONFIRM_TIMEOUT: true,
  EXPIRED: true,
  SCRIPT_FAILED: true,
  ORPHANED: true,
  CANNOT_OBSERVE: true,
  ATTEMPT_ON_CHAIN: true,
  INVALID_STATE: true,
  STILL_LIVE: true,
  PAYER_MISMATCH: true,
  INPUTS_SPENT: true,
  PLAN_EXISTS: true,
  PLAN_NOT_FOUND: true,
  VERSION_CONFLICT: true,
  STORE_FAILED: true,
  MISSING_STORE: true,
  MISSING_ID: true,
} satisfies Record<TxPlanErrorCode, true>) as TxPlanErrorCode[];

/**
 * What the submitter's error says of a failed submission. No reason says that the bytes did not
 * arrive: a `SUBMIT_FAILED` of any reason is an unknown outcome, and the same call sends the
 * same bytes again.
 * - `"unavailable"`: a connection that failed, was reset or timed out, whoever closed it (a
 *   reset or an abort on the caller's side can carry the same code), or a server that did not
 *   take the request (HTTP 408, 425, 5xx; gRPC Unavailable, DeadlineExceeded)
 * - `"rateLimited"`: a rate limit or an exhausted quota (HTTP 429; gRPC ResourceExhausted)
 * - `"unauthorized"`: an authorization failure, such as a wrong API key (HTTP 401, 403; gRPC
 *   Unauthenticated, PermissionDenied)
 * - `"refused"`: the ledger refused this delivery, and the attempt is not rejected by it: an
 *   earlier delivery of the same bytes may land, a parent attempt is not in a block yet, or a
 *   wallet submitted, whose refusal is never taken as the ledger's. The same call sends the
 *   same bytes again; only the code `REJECTED` means refused for good
 * - `"unknown"`: the error gives none of these
 *
 * Read from a refusal of the ledger first, else a provider error's `kind`, else an HTTP
 * `status`, else the gRPC status of a `ConnectError`, else the `code` of a failed connection
 */
export type SubmitFailureReason =
  "unavailable" | "rateLimited" | "unauthorized" | "refused" | "unknown";

/** `details` of a plan error, by code; codes not listed carry none */
export type TxPlanErrorDetails = {
  /** The CIP-30 code, if any; an aborted signal is ABORTED */
  SIGNER_FAILED: {
    reason: "error" | "timeout" | "accountChanged";
    walletCode?: number;
  };
  INVALID_WITNESS: {
    reason: "undecodable" | "wrongBody" | "staleAttempt";
    argument: number;
    keyHash?: string;
  };
  NOT_YET_VALID: { waitMs: number };
  /** Every key whose signature is missing, with the roles it is needed in */
  MISSING_SIGNATURES: { missing: RequiredKey[] };
  /**
   * `reason` and `status`: what the submitter's error says of the failure, read from its fields
   * alone; `walletCode`: the CIP-30 code when a wallet submitted (TxSendError Refused 1,
   * Failure 2). None of them changes what the error means: whatever the reason, the bytes may
   * have arrived, the outcome is unknown, and the same call sends the same bytes again
   */
  SUBMIT_FAILED: {
    reason: SubmitFailureReason;
    /** The HTTP status the submitter's error carries, a whole number from 100 to 599 */
    status?: number;
    walletCode?: number;
  };
  /** `otherLive`: a plan's other attempts that may still land; empty from a transaction */
  REJECTED: { otherLive: string[]; tipAgeMs?: number };
  /** `unsent`: the plan never sent this attempt */
  EXPIRED: { otherLive: string[]; unsent?: true; tipAgeMs?: number };
  ORPHANED: { otherLive: string[] };
  /** A transaction's `awaitInclusion()` waits for `included` */
  CONFIRM_TIMEOUT: { waitedFor: "included" | "final"; timeoutMs: number };
  /**
   * `unconfirmed`: this answer confirms nothing now (retryable); the other reasons are about the
   * provider itself; `noDepth`: no block heights, for any plan. A transaction's
   * `awaitInclusion()` raises `noSearch` and `noValidity`
   */
  CANNOT_OBSERVE: {
    reason:
      | "noTip"
      | "noValidity"
      | "noDepth"
      | "noSearch"
      | "addressCache"
      | "unconfirmed";
  };
  /**
   * `closing`: the plan carries the closing mark; `recordVersion`: the record is of a newer
   * format, another kind, or holds content this library does not know: a plan's record, or the
   * JSON of a `BuiltTx` given to `restore`, whose error quotes none of its values
   */
  INVALID_STATE: {
    reason:
      | "status"
      | "terminal"
      | "closing"
      | "tooManyAttempts"
      | "pastHorizon"
      | "recordVersion";
  };
  /** `safeAfter`: POSIX ms */
  STILL_LIVE: { txHashes: string[]; safeAfter: number };
  /** The attempt in a block with `is_valid = true`; raised by closing a plan */
  ATTEMPT_ON_CHAIN: { landed: TxAttempt };
  /** Change addresses; only when the recorded anchor is not among the payer's UTxOs either */
  PAYER_MISMATCH: { recorded: string; given: string };
  /** Explicit inputs of the parts that are gone */
  INPUTS_SPENT: { inputs: OutRef[] };
};

/** `details` of code `C` in a details table `D`: `undefined` for a code not listed there */
export type DetailsOf<C extends string, D> = C extends keyof D
  ? D[C]
  : undefined;

/** Every code of the error tree; a code belongs to one class only */
export type TxErrorCode = TxPartErrorCode | TxBuildErrorCode | TxPlanErrorCode;

/** The error a code belongs to, with `details` of that code */
export type TxErrorOf<C extends TxErrorCode> = C extends TxBuildErrorCode
  ? TxBuildError<C>
  : C extends TxPlanErrorCode
    ? TxPlanError<C>
    : C extends TxPartErrorCode
      ? TxPartError & { readonly code: C }
      : never;

/** Any error of the tree, as a union by code */
export type AnyTxError = TxErrorOf<TxErrorCode>;

/** Any build error, as a union by code */
export type AnyTxBuildError = {
  [C in TxBuildErrorCode]: TxBuildError<C>;
}[TxBuildErrorCode];

/** Any plan error, as a union by code */
export type AnyTxPlanError = {
  [C in TxPlanErrorCode]: TxPlanError<C>;
}[TxPlanErrorCode];

/** Fails to compile when a code is in two of the unions */
const codesAreUnique: [
  TxPartErrorCode & TxBuildErrorCode,
  TxPartErrorCode & TxPlanErrorCode,
  TxBuildErrorCode & TxPlanErrorCode,
] extends [never, never, never]
  ? true
  : false = true;
void codesAreUnique;

/** Tells the three classes apart; a `Symbol.for` key holds across copies of the package */
const BRAND = Symbol.for("@meshsdk/transaction/TxError");
type Brand = "part" | "build" | "plan";

const brandOf = (error: unknown): Brand | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const brand = (error as Record<symbol, unknown>)[BRAND];
    return brand === "part" || brand === "build" || brand === "plan"
      ? brand
      : undefined;
  } catch {
    return undefined;
  }
};

const hasCode = (error: unknown, codes: readonly string[]) =>
  codes.length === 0 || codes.includes((error as { code: string }).code);

/** Marks a class of the tree; called once per class */
export const brandClass = (target: { prototype: object }, value: Brand) =>
  Object.defineProperty(target.prototype, BRAND, { value });

const prefixOf = (part?: TxPart["kind"], label?: string) =>
  part === undefined
    ? ""
    : `${part}${label === undefined ? "" : ` "${label}"`}: `;

/** What every error of the tree may carry besides its code and message */
export type TxErrorContext = {
  part?: TxPart["kind"];
  label?: string;
  cause?: unknown;
};

/**
 * Base of every error of the transaction API: a code, the part and its label, the error it was
 * raised from, and whether the same call may be repeated.
 *
 * `TxError.is(error)` and `TxError.is(error, ...codes)` check the whole tree, also errors made
 * by another copy of this package, and narrow `details` by code.
 */
export abstract class TxError extends Error {
  abstract readonly code: string;
  /** Kind of the part the error is about, if it is about one */
  declare readonly part?: TxPart["kind"];
  /** Label of that part, if any */
  declare readonly label?: string;
  /** The error this one was raised from, if any */
  declare readonly cause?: unknown;
  /**
   * The same call, repeated no earlier than `retryAfterMs`, is safe and may pass. Decided by the
   * code alone (for `CANNOT_OBSERVE`, by its reason)
   */
  declare readonly retryable: boolean;
  /** How long to wait before repeating the call, on a retryable error that says so */
  declare readonly retryAfterMs?: number;

  protected constructor(
    message: string,
    context: TxErrorContext & { retryable: boolean; retryAfterMs?: number },
  ) {
    super(message);
    const { part, label, cause, retryable, retryAfterMs } = context;
    const self = this as { -readonly [K in keyof TxError]: TxError[K] };
    if (part !== undefined) self.part = part;
    if (label !== undefined) self.label = label;
    if (cause !== undefined) self.cause = cause;
    self.retryable = retryable;
    if (retryable && retryAfterMs !== undefined)
      self.retryAfterMs = retryAfterMs;
  }

  /**
   * Whether a value is an error of the tree, and when codes are given, one with any of them.
   * Checks a `Symbol.for` brand, so it holds across duplicate copies of the package; never
   * throws.
   */
  static is(error: unknown): error is AnyTxError;
  static is<C extends TxErrorCode>(
    error: unknown,
    ...codes: [C, ...C[]]
  ): error is TxErrorOf<C>;
  static is(error: unknown, ...codes: string[]): boolean {
    return brandOf(error) !== undefined && hasCode(error, codes);
  }
}

/** The context of a build error with code `C`: `details` required where the code has them */
export type TxBuildErrorContext<C extends TxBuildErrorCode> = TxErrorContext &
  (C extends keyof TxBuildErrorDetails
    ? { details: TxBuildErrorDetails[C] }
    : { details?: undefined });

/**
 * Raised when parts cannot be put together into a transaction, or the transaction cannot be
 * completed: resolved, balanced or evaluated. Unlike `TxPartError`, which points at a single
 * part builder call, this concerns the parts as a whole. Never retryable.
 */
export class TxBuildError<
  C extends TxBuildErrorCode = TxBuildErrorCode,
> extends TxError {
  readonly code: C;
  /** Data of the error, typed by `code`; `undefined` for a code that carries none */
  readonly details: DetailsOf<C, TxBuildErrorDetails>;

  constructor(
    code: C,
    message: string,
    ...[context]: C extends keyof TxBuildErrorDetails
      ? [context: TxBuildErrorContext<C>]
      : [context?: TxBuildErrorContext<C>]
  ) {
    const { part, label, cause, details } = (context ??
      {}) as TxErrorContext & {
      details?: unknown;
    };
    super(`${prefixOf(part, label)}${message}`, {
      part,
      label,
      cause,
      retryable: false,
    });
    this.name = "TxBuildError";
    this.code = code;
    this.details = details as DetailsOf<C, TxBuildErrorDetails>;
  }

  /** Whether a value is a build error, and when a code is given, one with that code */
  static is(error: unknown): error is AnyTxBuildError;
  static is<C extends TxBuildErrorCode>(
    error: unknown,
    code: C,
  ): error is TxBuildError<C>;
  static is(error: unknown, ...codes: string[]): boolean {
    return brandOf(error) === "build" && hasCode(error, codes);
  }
}
brandClass(TxBuildError, "build");

/** An argument of a public function that is not of its type */
export const invalidArgument = (
  option: string,
  value: unknown,
  allowed: string,
) =>
  new TxBuildError("INVALID_OPTION", `invalid ${option}: expected ${allowed}`, {
    details: { option, value, allowed },
  });

/** The sentence every message of a plan error ends with */
export const NOT_UNPAID =
  "This error does not mean that the payment did not go through: only an abandoned plan did not pay.";

/**
 * The sentence the messages of SUBMIT_FAILED, REJECTED and CONFIRM_TIMEOUT end with when a
 * `BuiltTx` raises them: a second build of the same payment may land beside the first
 */
export const NO_REBUILD =
  "Do not build another transaction to retry it: a new build may select other inputs, and both may land.";

/** Plan error codes whose same call may pass when repeated */
const RETRYABLE: ReadonlySet<string> = new Set<TxPlanErrorCode>([
  "SUBMIT_FAILED",
  "CONFIRM_TIMEOUT",
  "NOT_YET_VALID",
  "STILL_LIVE",
]);

/** The context of a plan error with code `C` */
export type TxPlanErrorContext<C extends TxPlanErrorCode> = TxErrorContext & {
  /** How long to wait before repeating the call; kept only on a retryable error */
  retryAfterMs?: number;
  /** The plan the error is raised by, kept as a property that is not enumerable */
  plan?: TxPlan;
  /** The plan's id */
  planId?: string;
  /** The plan's status when the error was raised */
  status?: TxPlanStatus;
  /** The attempt the error is about */
  txHash?: string;
} & (C extends keyof TxPlanErrorDetails
    ? { details: TxPlanErrorDetails[C] }
    : { details?: undefined });

/**
 * Raised by signing, submitting and waiting for a transaction or a plan, and by storing a plan.
 * Retryable for `SUBMIT_FAILED`, `CONFIRM_TIMEOUT`, `NOT_YET_VALID`, `STILL_LIVE`, and
 * `CANNOT_OBSERVE` with the reason `unconfirmed`; for no other code.
 */
export class TxPlanError<
  C extends TxPlanErrorCode = TxPlanErrorCode,
> extends TxError {
  readonly code: C;
  /** Data of the error, typed by `code`; `undefined` for a code that carries none */
  readonly details: DetailsOf<C, TxPlanErrorDetails>;
  /**
   * The plan the error was raised by, as it is now. Not enumerable, so that a logger does not
   * serialize it; set on every error a method of a plan throws
   */
  declare readonly plan?: TxPlan;
  /** The plan's id: plain data, safe to log */
  declare readonly planId?: string;
  /** The plan's status when the error was raised; for logs only */
  declare readonly status?: TxPlanStatus;
  /** The attempt the error is about */
  declare readonly txHash?: string;

  constructor(
    code: C,
    message: string,
    ...[context]: C extends keyof TxPlanErrorDetails
      ? [context: TxPlanErrorContext<C>]
      : [context?: TxPlanErrorContext<C>]
  ) {
    const {
      part,
      label,
      cause,
      details,
      retryAfterMs,
      plan,
      planId,
      status,
      txHash,
    } = (context ?? {}) as TxPlanErrorContext<TxPlanErrorCode> & {
      details?: unknown;
    };
    const retryable =
      RETRYABLE.has(code) ||
      (code === "CANNOT_OBSERVE" &&
        (details as { reason?: string } | undefined)?.reason === "unconfirmed");
    super(message, {
      part,
      label,
      cause,
      retryable,
      ...(retryAfterMs !== undefined && { retryAfterMs }),
    });
    this.name = "TxPlanError";
    this.code = code;
    this.details = details as DetailsOf<C, TxPlanErrorDetails>;
    const self = this as {
      planId?: string;
      status?: TxPlanStatus;
      txHash?: string;
    };
    if (plan !== undefined)
      Object.defineProperty(this, "plan", {
        value: plan,
        enumerable: false,
        configurable: true,
        writable: false,
      });
    if (planId !== undefined) self.planId = planId;
    if (status !== undefined) self.status = status;
    if (txHash !== undefined) self.txHash = txHash;
  }

  /** Whether a value is a plan error, and when codes are given, one with any of them */
  static is(error: unknown): error is AnyTxPlanError;
  static is<C extends TxPlanErrorCode>(
    error: unknown,
    ...codes: [C, ...C[]]
  ): error is TxErrorOf<C>;
  static is(error: unknown, ...codes: string[]): boolean {
    return brandOf(error) === "plan" && hasCode(error, codes);
  }
}
brandClass(TxPlanError, "plan");
