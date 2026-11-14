import type { CachedFetcher, ISubmitter } from "@meshsdk/common";

import type { BuiltTxData, TxBuilder } from "./builder";
import type { AskedKey, KeyWitness, RawTx, Signer } from "./sign";
import type { RequiredKey } from "./witnesses";
import {
  abortable,
  abortedError,
  MAX_TIMER_MS,
  throwIfAborted,
  TIMED_OUT,
  within,
} from "./abort";
import { NO_REBUILD, TxBuildError, TxPlanError } from "./errors";
import {
  checkWaitOptions,
  DEFAULT_POLL_MS,
  DEFAULT_TIMEOUT_MS,
} from "./plan/deadlines";
import { decodeBuilt, encodeBuilt, unquoted, UnreadContent } from "./plan/json";
import { chainObserver, isRefusal } from "./plan/observer";
import {
  canSign,
  countedWitnesses,
  isWallet,
  readTransaction,
  signerWitnesses,
  toSigners,
  withWitnesses,
  witnessesToAdd,
  writeWitnessSet,
} from "./sign";
import { askedKeys } from "./witnesses";

// The object of one built transaction: the data of the build as its own members, and the calls
// that sign that one body, submit it and look for it. Its bytes and their hash are read once,
// when it is made; the members are data for the application, and nothing the object signs,
// sends or looks for is taken from them later.

/** The call an aborted signal names */
const CALL = "the call";

/** The builder's private member the object uses: the shared cache of its provider */
type BuilderInternals = { readonly cache?: CachedFetcher };

/** What became of one delivery: taken, else refused by the ledger or failed otherwise */
type Delivery =
  | { readonly taken: true }
  | {
      readonly taken: false;
      readonly refused: boolean;
      readonly error: unknown;
    };

/**
 * What one look for the transaction gave: found, not found, or unknown (no provider, a provider
 * without search, a search that failed or answered about another transaction)
 */
type Look = "found" | "notFound" | "unknown";

/** The start of the message of REJECTED */
const REFUSED =
  "the ledger refused the transaction, and no delivery of it by this object may have gone through";

/** The options of one call of `sign()` of a `BuiltTx` */
export type SignTxOptions = {
  /** Who signs: one signer or several, asked one after another in this order */
  signers: Signer | readonly Signer[];
  /**
   * `true`, the default: the call adds what its signers give and returns, whether or not a key
   * is still missing; `missing` lists the rest. `false`: a key still missing after every signer
   * was asked is MISSING_SIGNATURES; what the signers gave stays in the transaction
   */
  partial?: boolean;
  /** Aborts the call with ABORTED; a signer already asked is no longer waited for */
  signal?: AbortSignal;
};

/** Where `awaitInclusion()` found the transaction: what the provider's answer gave of its block */
export type TxInclusion = {
  /** The hash of the transaction found: the object's `txHash` */
  readonly txHash: string;
  /** The slot of the block it is in */
  readonly slot?: number;
  /** The hash of that block */
  readonly block?: string;
  /** The height of that block */
  readonly blockHeight?: number;
};

/**
 * A `BuiltTx` as data, in its encoded form: what `toJSON()` returns. Plain JSON data:
 * every `bigint` stands as its decimal string. Applications read `kind`, `version` and `txHash`;
 * the rest is the library's.
 */
export type BuiltTxJSON = {
  /** Always `"BuiltTx"`: what kind of record this is */
  readonly kind: "BuiltTx";
  /** The record format; this release writes 1 */
  readonly version: number;
  /** The hash of the transaction's body */
  readonly txHash: string;
  /** The library's: the data of the build */
  readonly built: Record<string, unknown>;
  /** The library's: the vkey and bootstrap witnesses it holds, as a CBOR witness set in hex */
  readonly witnesses?: string;
  /**
   * The library's: how many witnesses of keys the transaction does not need its fee counts,
   * the build's `extraKeyWitnesses`; written only when above 0
   */
  readonly extraKeyWitnesses?: number;
  /**
   * The library's: a delivery of it was taken by a submitter, or its outcome is unknown, one
   * still on its way when the JSON was written among them
   */
  readonly delivered?: true;
};

/** The record format of `BuiltTxJSON` this library writes and reads */
const RECORD_VERSION = 1;

/** The members of `BuiltTxJSON` */
const RECORD_MEMBERS: readonly string[] = [
  "kind",
  "version",
  "txHash",
  "built",
  "witnesses",
  "extraKeyWitnesses",
  "delivered",
];

/** What a restored object starts from beside the data: read from its JSON and verified */
type RestoredState = {
  /** The transaction of the data, read once */
  readonly raw: RawTx;
  /** The witnesses of the JSON, each verified against the body */
  readonly held: readonly KeyWitness[];
  /** A delivery of it was taken, or its outcome is unknown */
  readonly delivered: boolean;
};

/** The JavaScript type of a value, with `null` told apart */
const typeOf = (value: unknown) => (value === null ? "null" : typeof value);

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { aborted?: unknown }).aborted === "boolean" &&
  typeof (value as { addEventListener?: unknown }).addEventListener ===
    "function";

const OPTIONS_ALLOWED = "an object { signers, partial?, signal? }";

/**
 * An option of `sign()` that is refused. What is given there may be or hold a key, so the message
 * and `details.value` name only its JavaScript type, never the value
 */
const invalidOption = (
  option: string,
  value: unknown,
  allowed: string,
  hint = "",
) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got a value of type ${typeOf(value)}${hint}`,
    { details: { option, value: typeOf(value), allowed } },
  );

/**
 * The options of `sign()`, checked by their shape
 * @throws TxBuildError INVALID_OPTION
 */
const checkSignOptions = (options: unknown) => {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null || canSign(options))
    throw invalidOption(
      "options",
      options,
      OPTIONS_ALLOWED,
      typeof options === "string"
        ? "; a private key is given as { signers: keySigner(key) }"
        : canSign(options)
          ? "; a signer is given as { signers }"
          : "",
    );
  if (Array.isArray(options))
    throw invalidOption(
      "options",
      options,
      OPTIONS_ALLOWED,
      "; signers are given as { signers: [...] }",
    );
  const { signers, partial, signal } = options as Record<string, unknown>;
  const given = toSigners(signers);
  if (partial !== undefined && typeof partial !== "boolean")
    throw invalidOption("partial", partial, "a boolean");
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
  return {
    signers: given,
    partial: partial as boolean | undefined,
    signal: signal as AbortSignal | undefined,
  };
};

const hasMethod = (value: unknown, name: string) =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as Record<string, unknown>)[name] === "function";

/**
 * Options of a call that are an object, else INVALID_OPTION: `undefined` is none
 * @param given What the call's options are given as when a member is given in their place
 */
const optionsObject = (
  options: unknown,
  allowed: string,
  given?: { member: string; is: (value: unknown) => boolean },
): Record<string, unknown> => {
  if (options === undefined) return {};
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options) ||
    given?.is(options) === true
  )
    throw invalidOption(
      "options",
      options,
      allowed,
      given?.is(options) === true
        ? `; a ${given.member} is given as { ${given.member} }`
        : "",
    );
  return options as Record<string, unknown>;
};

/**
 * The options of `submit()`, checked by their shape
 * @throws TxBuildError INVALID_OPTION
 */
const checkSubmitOptions = (options: unknown) => {
  const { submitter, signal } = optionsObject(
    options,
    "an object { submitter?, signal? }",
    { member: "submitter", is: (value) => hasMethod(value, "submitTx") },
  );
  if (submitter !== undefined && !hasMethod(submitter, "submitTx"))
    throw invalidOption("submitter", submitter, "an object with submitTx");
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
  return {
    submitter: submitter as ISubmitter | undefined,
    signal: signal as AbortSignal | undefined,
  };
};

/**
 * The options of `awaitInclusion()`: `timeoutMs` and `pollMs` as a plan's call checks them
 * @throws TxBuildError INVALID_OPTION
 */
const checkInclusionOptions = (options: unknown) => {
  const { timeoutMs, pollMs, signal } = optionsObject(
    options,
    "an object { timeoutMs?, pollMs?, signal? }",
  );
  checkWaitOptions({
    timeoutMs: timeoutMs as number | undefined,
    pollMs: pollMs as number | undefined,
  });
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
  return {
    timeoutMs: timeoutMs as number | undefined,
    pollMs: pollMs as number | undefined,
    signal: signal as AbortSignal | undefined,
  };
};

/**
 * Waits `ms`, or until the signal aborts the call
 * @throws TxBuildError ABORTED
 */
const pause = (ms: number, signal: AbortSignal | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError(signal, CALL));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError(signal!, CALL));
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener?.("abort", onAbort);
        resolve();
      },
      Math.min(Math.max(0, ms), MAX_TIMER_MS),
    );
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** The CIP-30 code of what a wallet threw, when it carries a numeric one */
const walletCodeOf = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  typeof (error as { code?: unknown }).code === "number"
    ? (error as { code: number }).code
    : undefined;

/** The keys in a message: each hash with its roles */
const keysText = (keys: readonly RequiredKey[]) =>
  keys.map((k) => `${k.keyHash} (${k.roles.join(", ")})`).join("; ");

/**
 * One built transaction, on its own: what `builder.build()` and `builder.finalize()` return, and
 * `builder.restore()` brings back.
 *
 * It is a `BuiltTxData`: every member of it is here as the object's own read-only data, so it goes
 * wherever a `BuiltTxData` goes (`after`, `utxosAfter`, `outputOf`), and `{ ...built }` or
 * `structuredClone(built)` is that data as a plain object. Beside the data it holds the
 * witnesses given to it, and it has the calls that sign this one body, take witnesses made
 * elsewhere, submit it and look for it: `tx` stays the unsigned transaction, `partialTx` is it
 * with the witnesses held so far, and `signedTx` is it with every witness it needs.
 *
 * ```ts
 * const built = await builder.build(output({ address, value }), { payer: wallet });
 * await built.sign({ signers: wallet });
 * await built.submit();
 * await built.awaitInclusion();
 * ```
 *
 * One object is one body. Its bytes and its hash are fixed when it is made; no call builds,
 * edits or serializes a transaction again, and what is signed and sent is that body. It has no
 * deadline, no anchor, no statuses and no replacement, so do not build another transaction to
 * retry it: a new build may select other inputs, and both may land. A retry is the same call on
 * the same object. A payment that has to be repeated safely, replaced or followed to `final` is
 * a `TxPlan`; a plan's `build()` gives the data alone, since a plan signs and sends its own
 * attempts.
 *
 * Two calls at once are safe: a witness is kept once per key, whoever gives it first.
 */
export class BuiltTx implements BuiltTxData {
  /** The unsigned transaction, in CBOR hex */
  declare readonly tx: BuiltTxData["tx"];
  declare readonly txHash: BuiltTxData["txHash"];
  /**
   * The transaction as a value, exactly as serialized. It follows the transaction format of the
   * current ledger era; code meant to outlive an era reads the other members of `BuiltTxData`.
   */
  declare readonly prototype: BuiltTxData["prototype"];
  declare readonly fee: BuiltTxData["fee"];
  /** Total execution units of the transaction's redeemers */
  declare readonly exUnits: BuiltTxData["exUnits"];
  declare readonly redeemers: BuiltTxData["redeemers"];
  /** Every input spent, resolved, in the transaction's order */
  declare readonly inputs: BuiltTxData["inputs"];
  /** The inputs added to pay for the transaction */
  declare readonly selectedInputs: BuiltTxData["selectedInputs"];
  /** The reference inputs, resolved, in the transaction's order */
  declare readonly referenceInputs: BuiltTxData["referenceInputs"];
  /**
   * Every output as a UTxO of `txHash`, in body order, with its part's label. The collateral
   * return is not among them.
   */
  declare readonly outputs: BuiltTxData["outputs"];
  /**
   * The change outputs, as UTxOs of `txHash`, in body order; each is also in `outputs`. A build
   * made before this transaction is seen by the provider passes it as `after`; when that build
   * has the same change address, it can then select this change.
   */
  declare readonly change: BuiltTxData["change"];
  /**
   * The collateral, when the transaction runs Plutus scripts; of a transaction completed by
   * `finalize`, whenever the body has collateral inputs
   */
  declare readonly collateral?: BuiltTxData["collateral"];
  /** The keys that must sign, each with the roles it is needed in */
  declare readonly signers: BuiltTxData["signers"];
  /**
   * The validity interval, with the bounds the transaction has: in slots, and the POSIX
   * milliseconds those slots start at on the builder's network
   */
  declare readonly validity?: BuiltTxData["validity"];
  /** The network the transaction was built for */
  declare readonly network: BuiltTxData["network"];
  /** What is worth knowing about the transaction and did not stop the build; often empty */
  declare readonly warnings: BuiltTxData["warnings"];
  /**
   * Every part of the transaction, resolved, the ones added by balancing included; empty on a
   * transaction completed by `finalize`
   */
  declare readonly parts: BuiltTxData["parts"];

  /** The transaction as built, read once: what is signed, whatever the members say later */
  readonly #raw: RawTx;
  /** The keys that must sign, copied: what `missing` lists */
  readonly #keys: readonly RequiredKey[];
  /** `signers` as built, copied: what the JSON writes, whatever the member says later */
  readonly #signers: BuiltTxData["signers"];
  /** The keys a signer is asked for: those that must sign, then those native scripts name */
  readonly #asked: readonly AskedKey[];
  /** The keys the fee counts a vkey witness for */
  readonly #counted: ReadonlySet<string>;
  /** The bootstrap witnesses the fee counts: one per Byron address spent from */
  readonly #bootstraps: number;
  /** The vkey witnesses of other keys the fee counts: the build's `extraKeyWitnesses` */
  readonly #extraKeys: number;
  /** The witnesses held, each verified against the body, in the order they were kept */
  readonly #held: KeyWitness[] = [];
  /** `partialTx` as last written, with the number of witnesses it holds */
  #written?: { count: number; tx: string };
  /** The builder that made it: its submitter, provider, cache and `planDefaults` */
  readonly #builder: TxBuilder;
  /**
   * Whether a Plutus script runs, read from the transaction once (its witness set holds
   * redeemers): a find then needs the provider to say that the scripts passed
   */
  readonly #plutus: boolean;
  /**
   * A delivery was taken by a submitter, its outcome is unknown, or the call that handed it off
   * was aborted: the bytes may land, and a refusal proves nothing. Set by the delivery itself
   */
  #delivered = false;
  /** The deliveries handed to a submitter that have not answered yet, each its outcome */
  readonly #sending = new Set<Promise<Delivery>>();
  /** How many deliveries were handed off: a refused call sees one handed off while it looks */
  #handedOff = 0;

  /** Made by `builder.build()`, `builder.finalize()` and `builder.restore()` only */
  private constructor(
    builder: TxBuilder,
    built: BuiltTxData,
    extraKeys: number,
    restored?: RestoredState,
  ) {
    Object.assign(this, built);
    this.#builder = builder;
    this.#raw = restored?.raw ?? readTransaction(built.tx);
    // Read from the transaction itself: its witness set holds redeemers
    this.#plutus =
      (this.#raw.transaction.witnessSet().redeemers()?.size() ?? 0) > 0;
    this.#signers = structuredClone(built.signers);
    this.#keys = Object.freeze(
      built.signers.keys.map(({ keyHash, roles }) =>
        Object.freeze({ keyHash, roles: Object.freeze([...roles]) }),
      ),
    ) as readonly RequiredKey[];
    this.#asked = Object.freeze(askedKeys(built.signers));
    this.#counted = new Set(this.#asked.map(({ keyHash }) => keyHash));
    this.#bootstraps = built.signers.byronAddresses.length;
    this.#extraKeys = extraKeys;
    if (restored !== undefined) {
      this.#keep(restored.held);
      this.#delivered = restored.delivered;
    }
    Object.freeze(this);
  }

  /**
   * The transaction with every witness it needs, in CBOR hex: `tx` with the witnesses held.
   * Undefined while a key of `signers.keyHashes` has not signed. Bootstrap witnesses and the
   * keys only native scripts name are not waited for: without them the ledger refuses it
   */
  get signedTx(): string | undefined {
    return this.missing.length === 0 ? this.partialTx : undefined;
  }

  /**
   * The transaction with the witnesses held so far, in CBOR hex, whether or not every key has
   * signed: `tx` itself while it holds none, and `signedTx` once none is missing. It is what is
   * handed to a party that signs next outside this object, such as a wallet's `signTx(tx, true)`
   * in another program; what that party gives back goes to `addWitnesses`. While a key is
   * missing the ledger refuses it: `submit()` sends `signedTx` only
   */
  get partialTx(): string {
    const count = this.#held.length;
    if (this.#written?.count !== count)
      this.#written = { count, tx: withWitnesses(this.#raw, this.#held) };
    return this.#written.tx;
  }

  /**
   * The keys the transaction needs that have not signed yet, each with its roles. Keys that
   * only a native script names are never listed
   */
  get missing(): readonly RequiredKey[] {
    const signed = new Set(this.#held.map((w) => w.keyHash));
    return Object.freeze(this.#keys.filter((k) => !signed.has(k.keyHash)));
  }

  /**
   * Signs with the call's signers, each asked once, in order, for the keys that have not signed
   * yet: the keys the transaction needs and those its native scripts name. A signer with
   * `signTxWitnesses` is handed their hashes; a signer of transaction hashes (`signTxHash`, a
   * function, `keySigner(key)`) gets them with their roles and is not asked when none is left; a
   * CIP-30 api chooses its keys itself. Every witness is verified against the body. Witnesses of
   * the keys the fee counts are kept, each once: the keys asked for, as many other keys as the
   * build's `extraKeyWitnesses`, and as many bootstrap witnesses as the transaction spends from
   * Byron addresses; any other is dropped. What a signer gave stays when a later one fails.
   *
   * By default the call returns whether or not a key is still missing, so that parties sign one
   * after another; with `partial: false` a key still missing is MISSING_SIGNATURES. `submit()`
   * checks the same before it sends.
   * @returns This object
   * @throws TxPlanError MISSING_SIGNATURES `{ missing }` when no signer is given (an empty list
   *   gives none), and with `partial: false` when a key the transaction needs has no signature
   *   after every signer was asked; SIGN_DECLINED when a signer declines; SIGNER_FAILED when one
   *   fails, or answers with a witness that is not of this body
   * @throws TxBuildError INVALID_OPTION for options that are not an object (a signer given in
   *   their place among them: give it as `{ signers }`), a signer that cannot sign (a private
   *   key given as it is among them: `keySigner(key)` makes a signer of it), a `partial` that is
   *   not a boolean, a `signal` that is not an AbortSignal; `details.value` is only the
   *   JavaScript type of what was given; ABORTED
   */
  async sign(options: SignTxOptions): Promise<this> {
    const { signers, partial, signal } = checkSignOptions(options);
    throwIfAborted(signal, CALL);
    if (signers === undefined) {
      const missing = this.missing;
      throw new TxPlanError(
        "MISSING_SIGNATURES",
        `nobody in this call can sign: give signers, or add witnesses made elsewhere with addWitnesses; ${
          missing.length === 0
            ? "every key the transaction needs has signed it"
            : `${missing.length} key(s) the transaction needs have not signed it`
        }`,
        { details: { missing: [...missing] } },
      );
    }
    for (const signer of signers) {
      throwIfAborted(signal, CALL);
      // The keys that have not signed yet, by what is held now
      const signed = new Set(this.#held.map((w) => w.keyHash));
      const keys = this.#asked.filter(({ keyHash }) => !signed.has(keyHash));
      const offered = await abortable(
        signerWitnesses(signer, this.#raw, { keys, signal }),
        signal,
        CALL,
      );
      this.#keep(offered);
    }
    const missing = this.missing;
    if (partial === false && missing.length > 0)
      throw new TxPlanError(
        "MISSING_SIGNATURES",
        `${missing.length} key(s) the transaction needs have not signed it after every signer was asked: ${keysText(missing)}; the witnesses given are kept`,
        { details: { missing: [...missing] } },
      );
    return this;
  }

  /**
   * Adds witnesses made elsewhere: witness sets, or full transactions of which only the vkey and
   * bootstrap witnesses are taken, each verified against this body. Kept as `sign()` keeps them.
   * @returns This object
   * @throws TxPlanError INVALID_WITNESS (`undecodable`, `wrongBody`) with the index of the
   *   argument, counted from 0; nothing of the call is kept then
   */
  async addWitnesses(...witnesses: string[]): Promise<this> {
    this.#keep(await witnessesToAdd(this.#raw, witnesses));
    return this;
  }

  /**
   * Hands the transaction to a submitter: the call's, else the builder's, else the provider when
   * it submits. It sends `signedTx` and nothing else: the same body every time, so the call can
   * be repeated, and a repeat never pays twice. After every hand-off the builder's cache of
   * volatile reads is cleared. What the submitter answers is not read: the hash is `txHash`.
   *
   * It returns when the submitter took the bytes. It also returns when the submitter refuses
   * them after a delivery of this object that was taken or whose answer was lost, and when the
   * provider already finds the transaction: a refusal of bytes that may be on their way, or are
   * in a block, proves nothing. A delivery of this object that has not answered yet is waited
   * for, and the refusal is decided by its outcome. The call's `signal` stops the waiting for
   * the submitter, for those deliveries and for the look.
   * @returns This object
   * @throws TxPlanError MISSING_SIGNATURES `{ missing }` while a key has not signed, and
   *   MISSING_SUBMITTER with nothing to submit through: nothing is sent. REJECTED when the
   *   ledger refuses the bytes, no delivery of this object may have gone through and the
   *   transaction is not found, or the provider cannot be asked; the object does not know what
   *   another process sent. SUBMIT_FAILED (retryable) when the outcome is unknown, for a wallet
   *   with `details.walletCode`: the same call sends the same bytes. The submitter's error is
   *   the `cause`
   * @throws TxBuildError INVALID_OPTION for options that are not an object (a submitter given
   *   in their place among them: give it as `{ submitter }`), a submitter without `submitTx` or
   *   a signal that is not an AbortSignal; `details.value` is only the JavaScript type of what
   *   was given; ABORTED: bytes already handed to the submitter count as sent
   */
  async submit(options?: {
    submitter?: ISubmitter;
    signal?: AbortSignal;
  }): Promise<this> {
    const call = checkSubmitOptions(options);
    throwIfAborted(call.signal, CALL);
    const tx = this.signedTx;
    if (tx === undefined) {
      const missing = this.missing;
      throw new TxPlanError(
        "MISSING_SIGNATURES",
        `${missing.length} key(s) the transaction needs have not signed it: ${keysText(missing)}; sign it, or add witnesses made elsewhere with addWitnesses; nothing was sent`,
        { details: { missing: [...missing] } },
      );
    }
    const submitter = this.#submitter(call.submitter);
    if (submitter === undefined)
      throw new TxPlanError(
        "MISSING_SUBMITTER",
        "nothing can submit the transaction: give the call or the builder a submitter, or a provider with submitTx; nothing was sent",
      );
    const wallet = isWallet(submitter);
    const delivery = this.#deliver(submitter, tx, wallet);
    try {
      let outcome: Delivery;
      try {
        outcome = await abortable(delivery, call.signal, CALL);
      } catch (error) {
        // Aborted after the hand-off: the bytes are on their way
        this.#delivered = true;
        throw error;
      }
      if (outcome.taken) return this;
      if (!outcome.refused) {
        const walletCode = wallet ? walletCodeOf(outcome.error) : undefined;
        throw new TxPlanError(
          "SUBMIT_FAILED",
          `the outcome of the delivery is unknown: the transaction may be on its way; the same submit() sends the same bytes again. ${NO_REBUILD}`,
          {
            details: walletCode === undefined ? {} : { walletCode },
            cause: outcome.error,
          },
        );
      }
      const look = await this.#refusal(call.signal);
      if (look === undefined) return this;
      throw new TxPlanError(
        "REJECTED",
        look === "notFound"
          ? `${REFUSED}; the provider does not find the transaction, and the object does not know what another process sent. ${NO_REBUILD}`
          : `${REFUSED}; the provider could not be asked whether it holds the transaction (no provider, no search, or no answer), and the object does not know what another process sent. ${NO_REBUILD}`,
        { details: { otherLive: [] }, cause: outcome.error },
      );
    } finally {
      internals(this.#builder).cache?.clearVolatile();
    }
  }

  /**
   * Looks for the transaction through the builder's provider, past its cache, every `pollMs`,
   * until it is found in a block: `included`, in a plan's words. It promises that one sighting
   * and nothing after it: a rollback can undo it, and nothing here waits for depth or `final`.
   * It sends nothing and changes nothing; it can be called before `submit()`, after it, again,
   * and for a transaction that another process sent.
   * @param options.timeoutMs How long to look, in ms, a look that has not answered by then
   *   included; above 0; 120 000 by default
   * @param options.pollMs The pause between two looks, in ms; above 0; the builder's
   *   `planDefaults.pollMs`, else 5 000
   * @returns What the provider's answer gave of the block
   * @throws TxPlanError CONFIRM_TIMEOUT `{ waitedFor: "included", timeoutMs }` (retryable) when
   *   it is not found in time: this does not mean that it will not land. SCRIPT_FAILED when it
   *   is in a block with `is_valid = false`: a script failed and the collateral was taken.
   *   CANNOT_OBSERVE (`noSearch`) for a provider without `fetchTxInfo`, (`noValidity`) for a
   *   transaction that runs a Plutus script found without `validContract`
   * @throws TxBuildError MISSING_FETCHER when the builder has no provider; INVALID_OPTION for an
   *   option out of range; ABORTED
   */
  async awaitInclusion(options?: {
    timeoutMs?: number;
    pollMs?: number;
    signal?: AbortSignal;
  }): Promise<TxInclusion> {
    const call = checkInclusionOptions(options);
    throwIfAborted(call.signal, CALL);
    const { provider, planDefaults } = this.#builder;
    if (provider === undefined)
      throw new TxBuildError(
        "MISSING_FETCHER",
        "looking for the transaction needs a provider, and the builder has none",
      );
    const timeoutMs = call.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollMs = call.pollMs ?? planDefaults?.pollMs ?? DEFAULT_POLL_MS;
    const observer = chainObserver(provider);
    const txHash = this.#raw.txId;
    const timeout = () =>
      new TxPlanError(
        "CONFIRM_TIMEOUT",
        `the transaction was not found in a block within ${timeoutMs} ms: this does not mean that it will not land, and the same call looks again. ${NO_REBUILD}`,
        { details: { waitedFor: "included", timeoutMs } },
      );
    const started = Date.now();
    for (;;) {
      // A look gets the time left: one that has not answered by then is unknown, and dropped
      const search = await within(
        observer.findTx(txHash),
        timeoutMs - (Date.now() - started),
        call.signal,
        CALL,
      );
      if (search === TIMED_OUT) throw timeout();
      if (search !== undefined && "unsupported" in search)
        throw new TxPlanError(
          "CANNOT_OBSERVE",
          "the provider cannot search for a transaction (fetchTxInfo): use another provider",
          { details: { reason: "noSearch" } },
        );
      // Not found, and an answer that tells nothing, are looked for again: unknown is never "no"
      if (search !== undefined && "found" in search && search.found) {
        if (search.validContract === false)
          throw new TxPlanError(
            "SCRIPT_FAILED",
            "the transaction is in a block with is_valid = false: a script failed and the collateral was taken",
          );
        if (this.#plutus && search.validContract !== true)
          throw new TxPlanError(
            "CANNOT_OBSERVE",
            "the provider finds the transaction and does not say whether its scripts passed (validContract): use another provider",
            { details: { reason: "noValidity" } },
          );
        return Object.freeze({
          txHash,
          ...(search.slot !== undefined && { slot: search.slot }),
          ...(search.block !== undefined && { block: search.block }),
          ...(search.blockHeight !== undefined && {
            blockHeight: search.blockHeight,
          }),
        });
      }
      const left = timeoutMs - (Date.now() - started);
      if (left <= 0) throw timeout();
      await pause(Math.min(pollMs, left), call.signal);
    }
  }

  /**
   * The transaction as plain JSON data, with the witnesses it holds: `JSON.stringify(built)`
   * writes it, and `builder.restore(json)` gives the object back, in this process or another.
   * It holds no signer and no key: the witnesses only. It marks a delivery that was taken or
   * whose outcome is unknown when this is called, a delivery handed off that has not answered
   * yet among them: the bytes may land, and the object restored treats a refusal as this one
   * would.
   *
   * `signers` is written as it was built: what the object restored asks for and waits for does
   * not depend on what was done to that member of this one. The other members are written as
   * they stand: they are the application's view of the data, and decide nothing that is signed,
   * asked for or sent
   */
  toJSON(): BuiltTxJSON {
    const held = this.#held;
    const delivered = this.#delivered || this.#sending.size > 0;
    return {
      kind: "BuiltTx",
      version: RECORD_VERSION,
      txHash: this.#raw.txId,
      built: encodeBuilt({ ...this, signers: this.#signers }) as Record<
        string,
        unknown
      >,
      ...(held.length > 0 && { witnesses: writeWitnessSet(held, false) }),
      ...(this.#extraKeys > 0 && { extraKeyWitnesses: this.#extraKeys }),
      ...(delivered && { delivered: true as const }),
    };
  }

  /** The submitter of a call: its own, else the builder's, else the provider when it submits */
  #submitter(given: ISubmitter | undefined): ISubmitter | undefined {
    if (given !== undefined) return given;
    const { submitter, provider } = this.#builder;
    if (submitter !== undefined) return submitter;
    return hasMethod(provider, "submitTx")
      ? (provider as unknown as ISubmitter)
      : undefined;
  }

  /**
   * Hands the bytes to the submitter, at once, and records the outcome of the delivery when it
   * answers, before any call that waits for it goes on: taken, or failed otherwise than by a
   * refusal of the ledger (every failure of a wallet), sets `#delivered`; a refusal does not
   * @returns The outcome; it never rejects
   */
  #deliver(submitter: ISubmitter, tx: string, wallet: boolean) {
    this.#handedOff += 1;
    const delivery: Promise<Delivery> = (async () => submitter.submitTx(tx))()
      .then(
        (): Delivery => {
          this.#delivered = true;
          return { taken: true };
        },
        (error: unknown): Delivery => {
          const refused = !wallet && isRefusal(error);
          if (!refused) this.#delivered = true;
          return { taken: false, refused, error };
        },
      )
      .finally(() => {
        this.#sending.delete(delivery);
      });
    this.#sending.add(delivery);
    return delivery;
  }

  /**
   * Decides a refusal of a call's own delivery on settled facts: `undefined` when the bytes may
   * land or are found (the call returns), else what the last look gave (REJECTED)
   * @throws TxBuildError ABORTED by the call's signal while it waits; no mark is set then
   */
  async #refusal(
    signal: AbortSignal | undefined,
  ): Promise<"notFound" | "unknown" | undefined> {
    for (;;) {
      // A delivery taken, or whose answer was lost, may land: the refusal proves nothing
      if (this.#delivered) return undefined;
      // A delivery that has not answered yet decides by its outcome
      if (this.#sending.size > 0) {
        await abortable(Promise.all(this.#sending), signal, CALL);
        continue;
      }
      const handedOff = this.#handedOff;
      const look = await this.#look(signal);
      // Bytes in a block already, sent by another process, are no refusal
      if (look === "found") return undefined;
      // A delivery that settled as taken or lost, or was handed off, during the look
      if (this.#delivered || this.#handedOff !== handedOff) continue;
      return look;
    }
  }

  /** One look for the transaction past the cache */
  async #look(signal: AbortSignal | undefined): Promise<Look> {
    const search = await abortable(
      chainObserver(this.#builder.provider).findTx(this.#raw.txId),
      signal,
      CALL,
    );
    if (search === undefined || "unsupported" in search) return "unknown";
    return search.found ? "found" : "notFound";
  }

  /** Keeps the offered witnesses the fee counts, against what is held at this moment */
  #keep(offered: readonly KeyWitness[]) {
    this.#held.push(
      ...countedWitnesses(offered, this.#held, {
        keys: this.#counted,
        extraKeys: this.#extraKeys,
        bootstraps: this.#bootstraps,
      }),
    );
  }
}

/** The builder's private members */
const internals = (builder: TxBuilder) =>
  builder as unknown as BuilderInternals;

/**
 * A `BuiltTx` of the data of a build: the object `build()`, `finalize()` and `restore()`
 * return
 * @param builder The builder that made it: it submits through it and looks through its provider
 * @param extraKeys The build's `extraKeyWitnesses`: witnesses of other keys its fee counts
 * @param restored What a restored object starts from: its transaction read, its witnesses
 *   verified, and its mark of a delivery
 */
export const makeBuiltTx = (
  builder: TxBuilder,
  built: BuiltTxData,
  extraKeys = 0,
  restored?: RestoredState,
): BuiltTx =>
  new (
    BuiltTx as unknown as new (
      builder: TxBuilder,
      built: BuiltTxData,
      extraKeys: number,
      restored?: RestoredState,
    ) => BuiltTx
  )(builder, built, extraKeys, restored);

const JSON_ALLOWED = "the JSON of a BuiltTx, as its toJSON() writes it";

/**
 * A JSON `restore` does not take. It names no value of what was given: the JavaScript type of
 * the value, and what is wrong with it
 */
const invalidJson = (json: unknown, reason?: string) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid json: ${
      reason ?? `expected ${JSON_ALLOWED}; got a value of type ${typeOf(json)}`
    }`,
    { details: { option: "json", value: typeOf(json), allowed: JSON_ALLOWED } },
  );

/** A JSON whose content this library does not read; `what` quotes none of it */
const notRead = (what: string) =>
  new TxPlanError(
    "INVALID_STATE",
    `the JSON of the transaction was not read: ${what}. Use a version of this library that reads it`,
    { details: { reason: "recordVersion" } },
  );

/** The content of a JSON whose shape is an object, read; its refusals quote none of it */
const readRecord = (json: Record<string, unknown>) =>
  unquoted(() => {
    const unread = (what: string): never => {
      throw new UnreadContent(what);
    };
    if (json.kind !== "BuiltTx")
      unread(
        'its kind is not "BuiltTx": this library reads the JSON of a BuiltTx here',
      );
    const version = json.version;
    if (!Number.isSafeInteger(version) || (version as number) < 1)
      unread("its version is not a whole number from 1");
    if ((version as number) > RECORD_VERSION)
      unread(
        `its version is newer than ${RECORD_VERSION}, the version this library reads`,
      );
    for (const key of Object.keys(json))
      if (!RECORD_MEMBERS.includes(key))
        unread("it holds a member this library does not know");
    if (typeof json.txHash !== "string") unread("txHash is not a text");
    const built = decodeBuilt(json.built, "built");
    const { name, networkId } = built.network as Record<string, unknown>;
    if (typeof name !== "string" || (networkId !== 0 && networkId !== 1))
      unread("built.network is not a network name with its network id, 0 or 1");
    if (json.witnesses !== undefined && typeof json.witnesses !== "string")
      unread("witnesses is not a text");
    const extraKeys = json.extraKeyWitnesses;
    if (
      extraKeys !== undefined &&
      (!Number.isSafeInteger(extraKeys) || (extraKeys as number) < 0)
    )
      unread("extraKeyWitnesses is not a whole number of 0 or more");
    if (json.delivered !== undefined && json.delivered !== true)
      unread("delivered is not true");
    return {
      txHash: json.txHash as string,
      built,
      witnesses: json.witnesses as string | undefined,
      extraKeys: (extraKeys as number | undefined) ?? 0,
      delivered: json.delivered === true,
    };
  });

/**
 * The object of a JSON `toJSON()` wrote, on this builder: read whole, its transaction read
 * again and found unsigned, its hash compared, every witness verified against the body and kept
 * by the rule `sign()` keeps them by. An error quotes nothing of the JSON but its network, in
 * the `details` of NETWORK_MISMATCH; nothing is requested
 * @throws TxPlanError INVALID_STATE (`recordVersion`) for another kind, a newer version, a
 *   member or content this library does not read
 * @throws TxBuildError INVALID_OPTION (`json`) for a value that is not JSON data of an object, a
 *   transaction that holds a vkey or bootstrap witness, a `txHash` that is not the hash of its
 *   transaction's body, a witness that is not of that body;
 *   NETWORK_MISMATCH for a transaction of another network than the builder's
 */
export const restoreBuiltTx = async (
  builder: TxBuilder,
  json: unknown,
): Promise<BuiltTx> => {
  // A copy, so that the object shares nothing with the value given, and a check that the value
  // is JSON data
  let copy: unknown;
  try {
    copy = JSON.parse(JSON.stringify(json));
  } catch {
    throw invalidJson(json);
  }
  if (typeof copy !== "object" || copy === null || Array.isArray(copy))
    throw invalidJson(json);
  let record: ReturnType<typeof readRecord>;
  try {
    record = readRecord(copy as Record<string, unknown>);
  } catch (error) {
    if (error instanceof UnreadContent) throw notRead(error.message);
    throw error;
  }
  const { built } = record;
  const own = builder.network;
  if (
    built.network.name !== own.name ||
    built.network.networkId !== own.networkId
  )
    throw new TxBuildError(
      "NETWORK_MISMATCH",
      `the transaction was built for another network than the builder's, ${own.name} (network id ${own.networkId}): restore it with a builder of its network`,
      {
        details: {
          expected: { name: own.name, networkId: own.networkId },
          found: [
            {
              role: "record",
              network: built.network.name,
              networkId: built.network.networkId,
            },
          ],
        },
      },
    );
  let raw: RawTx;
  try {
    raw = readTransaction(built.tx);
  } catch {
    throw notRead(
      "built.tx is not a transaction in CBOR hex this library reads",
    );
  }
  // The transaction of a JSON is the unsigned one, as toJSON writes it: a witness inside it
  // would be held unverified, and would hide that its key has not signed
  const { vkeys, bootstraps } = raw.witnessSet;
  if (
    (vkeys?.witnesses.length ?? 0) > 0 ||
    (bootstraps?.witnesses.length ?? 0) > 0
  )
    throw invalidJson(
      json,
      "the transaction of the record must be the unsigned one, without a vkey or bootstrap witness: its signatures go in witnesses",
    );
  if (raw.txId !== record.txHash || raw.txId !== built.txHash)
    throw invalidJson(
      json,
      "its txHash is not the hash of the body of its transaction",
    );
  let held: KeyWitness[] = [];
  if (record.witnesses !== undefined)
    try {
      held = await witnessesToAdd(raw, [record.witnesses]);
    } catch (error) {
      if (!TxPlanError.is(error, "INVALID_WITNESS")) throw error;
      if (error.details.reason === "wrongBody")
        throw invalidJson(
          json,
          "it holds a witness that is not of the body of its transaction",
        );
      throw notRead("witnesses is not a witness set this library reads");
    }
  return makeBuiltTx(builder, built, record.extraKeys, {
    raw,
    held,
    delivered: record.delivered,
  });
};
