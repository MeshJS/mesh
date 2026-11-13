import type { CachedFetcher, ISubmitter, UTxO } from "@meshsdk/common";

import type { SelectInputs } from "../balance";
import type { BuildEvent, BuildOptions, BuiltTx, TxBuilder } from "../builder";
import type { TxIntentErrorCode, TxIntentErrorDetails } from "../errors";
import type { OutRef, TxPart } from "../parts/types";
import type {
  Payer,
  PayerRead,
  PayerSnapshot,
  PayerSource,
  TxWallet,
} from "../payer";
import type { KeyWitness, Signer } from "../sign";
import type { RequiredKey } from "../witnesses";
import type {
  AnchorKind,
  AttemptRecord,
  IntentRecord,
  Sighting,
  Tip,
  TxIntentEvent,
  Witness,
} from "./core";
import type { EffectiveWait } from "./deadlines";
import type { ChainObserver, ObservedTip } from "./observer";
import type {
  IntentOptions,
  SendOptions,
  SignOptions,
  TxAttempt,
  TxIntentStatus,
} from "./types";
import { abortable, abortedError, throwIfAborted } from "../abort";
import { isKeyLocked } from "../balance";
import { TxBuildError, TxIntentError } from "../errors";
import { spend, validity } from "../parts";
import { toPayerSource } from "../payer";
import { utxoKey } from "../resolve";
import {
  readTransaction,
  readWitnessArgument,
  signWitnesses,
  verifies,
  withWitnesses,
  witnessesToAdd,
  writeWitnessSet,
} from "../sign";
import {
  advanceIntent,
  currentAttempt,
  draftIntent,
  intentStatus,
  landedAttempt,
  liveAttempts,
  MAX_ATTEMPTS,
} from "./core";
import {
  DEFAULT_POLL_MS,
  effectiveDeadlines,
  effectiveWait,
  horizonSlot,
} from "./deadlines";
import {
  chainObserver,
  isRefusal,
  keepsAddressCache,
  searchThenTip,
  unwrapProvider,
} from "./observer";

// The class that carries one payment from its parts to a final state. It makes the requests:
// it reads the chain through its observer, builds attempts with the builder, asks signers and
// submits. Every change of its state is an event given to the state machine of `core.ts`, and
// is recorded before the step it permits: an attempt before it is handed out or signed, a
// delivery before the bytes leave.

/** The sentence every error of an intent ends with */
const NOT_UNPAID =
  "This error does not mean that the payment did not go through: only an abandoned intent did not pay.";

/** The call an aborted signal names */
const CALL = "the call";

/** The builder's private members an intent uses: its build over a final list, and its cache */
type BuilderInternals = {
  readGivenPayer(payer: Payer, signal?: AbortSignal): Promise<PayerRead>;
  buildList(
    source: PayerSource,
    flat: readonly TxPart[],
    options: BuildOptions | undefined,
  ): Promise<BuiltTx>;
  readonly cache?: CachedFetcher;
};

const internals = (builder: TxBuilder) =>
  builder as unknown as BuilderInternals;

/** The live objects of an intent: kept by the object, never written into its record */
export type IntentLiveObjects = {
  payer?: Payer;
  canSelect?: (utxo: UTxO) => boolean;
  coinSelection?: SelectInputs;
  trace?: (event: BuildEvent) => void;
};

/** The data options of an intent, as its record holds them */
type DataOptions = {
  sendAllTo?: string;
  knownUtxos?: readonly UTxO[];
  fee?: bigint;
  registeredPools?: readonly string[];
  extraKeyWitnesses?: number;
  /** The change address of the first attempt's payer, in bech32; every later change goes there */
  changeAddress?: string;
};

/** What an intent object holds besides its record */
type IntentState = {
  readonly builder: TxBuilder;
  record: IntentRecord;
  /** The parts every attempt is built from, as the record holds them */
  readonly parts: readonly TxPart[];
  /** The payer as given; checked by the first build that reads it */
  payer?: Payer;
  /** An attempt was built from the payer, given as a snapshot, which serves one attempt */
  snapshotUsed: boolean;
  readonly canSelect?: (utxo: UTxO) => boolean;
  readonly coinSelection?: SelectInputs;
  readonly trace?: (event: BuildEvent) => void;
  readonly observer: ChainObserver;
  /**
   * `owed` until a probe of the provider answered: the object makes it with the first attempt it
   * builds, else before the first delivery of an attempt it did not build
   */
  probe: "owed" | "done";
  /** The last tip read, for the age of the tip in errors */
  lastTip?: Tip;
  /** The waits of calls on this object, woken when its record changes */
  readonly watchers: Set<() => void>;
};

const STATE = new WeakMap<TxIntent, IntentState>();

const stateOf = (intent: TxIntent): IntentState => {
  const state = STATE.get(intent);
  if (state === undefined)
    throw new TypeError("not an intent made by TxBuilder.intent");
  return state;
};

/* ---------------------------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------------------------- */

const refKey = (ref: Readonly<OutRef>) => `${ref.txHash}#${ref.outputIndex}`;

const sameRef = (utxo: Readonly<UTxO>, ref: Readonly<OutRef>) =>
  utxo.input.txHash.toLowerCase() === ref.txHash.toLowerCase() &&
  utxo.input.outputIndex === ref.outputIndex;

const describe = (value: unknown): string => {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object" && value !== null)
    return Array.isArray(value) ? "a list" : "an object";
  return String(value);
};

const invalidOption = (option: string, value: unknown, allowed: string) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${describe(value)}`,
    { details: { option, value, allowed } },
  );

const isFunction = (value: unknown, name: string) =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as Record<string, unknown>)[name] === "function";

/** A signer by its shape: it has `signTxWitnesses` or `signTx` */
const canSign = (value: unknown): value is Signer =>
  isFunction(value, "signTxWitnesses") || isFunction(value, "signTx");

/** A wallet given as a submitter: its errors are never refusals of the ledger */
const isWallet = (value: object) =>
  isFunction(value, "getChangeAddress") || canSign(value);

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { aborted?: unknown }).aborted === "boolean" &&
  typeof (value as { addEventListener?: unknown }).addEventListener ===
    "function";

const SIGNERS_ALLOWED =
  "a signer (signTxWitnesses or signTx), or a list of them";

/**
 * The signers a call gives, checked by their shape
 * @throws TxBuildError INVALID_OPTION for an entry that cannot sign
 */
const callSigners = (signers: unknown): Signer[] | undefined => {
  if (signers === undefined) return undefined;
  const list: unknown[] = Array.isArray(signers) ? signers : [signers];
  if (!list.every(canSign))
    throw invalidOption("signers", signers, SIGNERS_ALLOWED);
  // An empty list gives no signer: the payer signs, else nobody can
  return list.length === 0 ? undefined : (list as Signer[]);
};

/**
 * The submitter and the signal of a call, checked by their shape
 * @throws TxBuildError INVALID_OPTION for a submitter without `submitTx`, or a signal that is
 *   not an AbortSignal
 */
const checkCallOptions = (options: {
  submitter?: unknown;
  signal?: unknown;
}) => {
  const { submitter, signal } = options;
  if (submitter !== undefined && !isFunction(submitter, "submitTx"))
    throw invalidOption("submitter", submitter, "an object with submitTx");
  if (signal !== undefined && !isAbortSignal(signal))
    throw invalidOption("signal", signal, "an AbortSignal");
};

/** Sets the record an object holds, and wakes the waits of its other calls */
const commit = (state: IntentState, record: IntentRecord) => {
  state.record = record;
  for (const wake of [...state.watchers]) wake();
};

/**
 * Waits `ms` of real time, until the record changes, or until the signal aborts the call
 * @throws TxBuildError ABORTED
 */
const pause = (
  state: IntentState,
  ms: number,
  signal: AbortSignal | undefined,
) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError(signal, CALL));
      return;
    }
    const stop = () => {
      clearTimeout(timer);
      state.watchers.delete(done);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const done = () => {
      stop();
      resolve();
    };
    const onAbort = () => {
      stop();
      reject(abortedError(signal!, CALL));
    };
    const timer = setTimeout(done, Math.max(0, ms));
    state.watchers.add(done);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const TIMED_OUT = Symbol("timed out");

/** The longest delay a timer takes; a longer one fires at once */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Waits for a promise no longer than `ms` (no limit when undefined); `TIMED_OUT` after that.
 * What the promise does later is dropped. A limit longer than a timer takes is waited for in
 * several timers.
 */
const within = <T>(
  promise: Promise<T>,
  ms: number | undefined,
): Promise<T | typeof TIMED_OUT> => {
  if (ms === undefined) return promise;
  return new Promise((resolve, reject) => {
    const endsAt = Date.now() + Math.max(0, ms);
    let timer: ReturnType<typeof setTimeout>;
    const arm = (delay: number) => {
      timer = setTimeout(() => {
        const left = endsAt - Date.now();
        if (left > 0) arm(Math.min(left, MAX_TIMER_MS));
        else resolve(TIMED_OUT);
      }, delay);
    };
    arm(Math.min(Math.max(0, ms), MAX_TIMER_MS));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

/** Sends an event to `trace`; what it throws or rejects with is dropped */
const emit = (
  trace: ((event: BuildEvent) => void) | undefined,
  event: BuildEvent,
) => {
  if (!trace) return;
  try {
    const answer: unknown = trace(event);
    if (
      typeof answer === "object" &&
      answer !== null &&
      typeof (answer as PromiseLike<unknown>).then === "function"
    )
      (answer as PromiseLike<unknown>).then(undefined, () => undefined);
  } catch {
    // Diagnostics never change a step
  }
};

/** A hash in a submitter's answer: trimmed of spaces and quotes at its ends, lower-cased */
const answeredHash = (answer: unknown): string | undefined => {
  if (typeof answer !== "string") return undefined;
  const hash = answer
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : undefined;
};

/** The keys a native script names, every one of which the fee counts */
const nativeKeys = (
  scripts: BuiltTx["signers"]["nativeScripts"],
): Set<string> => {
  const keys = new Set<string>();
  const visit = (script: (typeof scripts)[number]) => {
    switch (script.type) {
      case "SCRIPT_PUBKEY":
        keys.add(script.value.addr_keyhash);
        return;
      case "SCRIPT_ALL":
      case "SCRIPT_ANY":
      case "SCRIPT_N_OF_K":
        script.value.native_scripts.forEach(visit);
        return;
      default:
        return;
    }
  };
  scripts.forEach(visit);
  return keys;
};

/** An attempt as the public `TxAttempt`: without the library's fields */
const attemptView = (attempt: AttemptRecord): TxAttempt => {
  const view: {
    -readonly [K in keyof TxAttempt]: TxAttempt[K];
  } = {
    txHash: attempt.txHash,
    status: attempt.status,
    until: attempt.until,
    sends: attempt.sends,
  };
  if (attempt.reportedHash !== undefined)
    view.reportedHash = attempt.reportedHash;
  if (attempt.seen !== undefined) view.seen = { ...attempt.seen };
  if (attempt.parents !== undefined)
    view.parents = attempt.parents.map((parent) => ({ ...parent }));
  return Object.freeze(view);
};

const VIEWS = new WeakMap<AttemptRecord, TxAttempt>();
const viewOf = (attempt: AttemptRecord): TxAttempt => {
  let view = VIEWS.get(attempt);
  if (view === undefined) {
    view = attemptView(attempt);
    VIEWS.set(attempt, view);
  }
  return view;
};

/** The witnesses recorded for an attempt, decoded */
const recordedWitnesses = (attempt: AttemptRecord): KeyWitness[] =>
  attempt.witnesses.flatMap((w) => readWitnessArgument(w.witness).witnesses);

const keysComplete = (attempt: AttemptRecord) =>
  attempt.keys.every((key) => attempt.witnesses.some((w) => w.keyHash === key));

const SIGNED = new WeakMap<AttemptRecord, string>();

/** The attempt's transaction with its recorded witnesses; undefined while a key is missing */
const signedTxOf = (attempt: AttemptRecord): string | undefined => {
  if (attempt.built === undefined || !keysComplete(attempt)) return undefined;
  let tx = SIGNED.get(attempt);
  if (tx === undefined) {
    tx = withWitnesses(
      readTransaction(attempt.built.tx),
      recordedWitnesses(attempt),
    );
    SIGNED.set(attempt, tx);
  }
  return tx;
};

/** The attempt `built` and `txHash` stand for: the landed one, else the current one */
const shownAttempt = (record: IntentRecord) =>
  landedAttempt(record) ?? currentAttempt(record);

/** The data options of the record */
const dataOptions = (record: IntentRecord) => record.options as DataOptions;

/** The anchor every new attempt spends: the last one that is not a parent's output */
const generalAnchor = (record: IntentRecord) =>
  [...record.anchor.anchors].reverse().find((entry) => entry.kind !== "parent");

/** The UTxO of an anchor out ref, as the record holds it */
const anchorUtxo = (record: IntentRecord, ref: OutRef) =>
  record.anchor.anchors.find((entry) => sameRef(entry.utxo, ref))?.utxo;

const runsPlutus = (part: TxPart) =>
  "witness" in part && part.witness.type === "plutus";

/**
 * The inputs the parts name explicitly: the inputs they spend, read and put up as collateral,
 * and the outputs holding their reference scripts
 */
const explicitInputs = (parts: readonly TxPart[]): OutRef[] => {
  const refs = new Map<string, OutRef>();
  const add = (input: { transaction_id: string; index: number }) => {
    const ref = { txHash: input.transaction_id, outputIndex: input.index };
    refs.set(refKey(ref), ref);
  };
  for (const part of parts) {
    if (
      part.kind === "spend" ||
      part.kind === "referenceInput" ||
      part.kind === "collateral"
    )
      add(part.input);
    if ("witness" in part) {
      const { witness } = part;
      if (
        (witness.type === "native" || witness.type === "plutus") &&
        witness.script.type === "reference"
      )
        add(witness.script.input);
    }
  }
  return [...refs.values()];
};

/* ---------------------------------------------------------------------------------------------
 * The intent
 * ------------------------------------------------------------------------------------------- */

/**
 * One payment, carried from its parts to a final state. `builder.intent(parts, options)` makes
 * it; it is the only way to make one.
 *
 * An intent holds its parts, its options and deadlines, and its attempts: an attempt is one
 * transaction body with one hash. Every attempt spends one common input, the anchor, so at most
 * one of them can land, and every step can be repeated by the same call without paying twice.
 * An intent's time is the time of the chain's tip; local timers only set the pace of waiting.
 *
 * ```ts
 * const intent = builder.intent(output({ address, value }), { payer: wallet });
 * await intent.send({ waitFor: "included" }); // builds, signs with the payer, submits, waits
 * ```
 *
 * No error of an intent means that the payment did not go through: only the status
 * `abandoned` does.
 */
export class TxIntent {
  /** Made by `builder.intent()` only */
  private constructor() {}

  /** The application's id of the intent, when it was given one */
  get id(): string | undefined {
    return stateOf(this).record.id;
  }

  /**
   * `abandoned`; `final` or `included` when an attempt is; else the current attempt's status;
   * `draft` before the first attempt
   */
  get status(): TxIntentStatus {
    return intentStatus(stateOf(this).record);
  }

  /**
   * The landed attempt's transaction, else the current one's; `built.tx` is unsigned. Undefined
   * while the intent has no attempt
   */
  get built(): BuiltTx | undefined {
    return shownAttempt(stateOf(this).record)?.built;
  }

  /** The transaction of `built` with every witness it needs, from `signed` on */
  get signedTx(): string | undefined {
    const attempt = shownAttempt(stateOf(this).record);
    return attempt && signedTxOf(attempt);
  }

  /**
   * The landed attempt's hash, else the current one's. It may change with a new attempt before
   * `included`; the stable key of a payment is `id`
   */
  get txHash(): string | undefined {
    return shownAttempt(stateOf(this).record)?.txHash;
  }

  /**
   * The keys the attempt of `built` needs and has no witness of yet, with the parts that need
   * them. Keys that only a native script names are never listed
   */
  get missing(): readonly RequiredKey[] {
    const attempt = shownAttempt(stateOf(this).record);
    if (attempt?.built === undefined) return [];
    const signed = new Set(attempt.witnesses.map((w) => w.keyHash));
    return attempt.built.signers.keys.filter((key) => !signed.has(key.keyHash));
  }

  /** Every attempt, oldest first */
  get attempts(): readonly TxAttempt[] {
    return stateOf(this).record.attempts.map(viewOf);
  }

  /** The attempts that landed or may still land */
  get live(): readonly TxAttempt[] {
    return liveAttempts(stateOf(this).record).map(viewOf);
  }

  /** The attempt found in a block with `is_valid = true`; undefined again after a rollback */
  get landed(): TxAttempt | undefined {
    const attempt = landedAttempt(stateOf(this).record);
    return attempt && viewOf(attempt);
  }

  /**
   * Whether the decision to close the intent is recorded; never reset. While it is and the intent
   * is not terminal, `build()`, `sign()`, `addWitnesses()` and `send()` throw INVALID_STATE
   * (`closing`)
   */
  get closing(): boolean {
    return stateOf(this).record.closing === true;
  }

  /**
   * The attempt to sign and send: the current one, or the landed one; a new one when there is
   * none yet, and when the current one cannot go on.
   *
   * - `included`, `final`: the landed attempt, without a request. `sent`: the current attempt,
   *   without a request. `built`, `signed`: the tip is read, and nothing else: an attempt past
   *   its `until` gets a new one; else, also when the tip cannot be read, the current attempt.
   * - `failed`: SCRIPT_FAILED, nothing built: the parts need correcting, in a new intent.
   * - `draft`, `rejected`, `expired`, `orphaned`, and an unsent attempt past its `until`: a new
   *   attempt. Every
   *   earlier attempt is searched first: one in a block is returned, without an error. Then the
   *   explicit inputs of the parts are read: when one is spent, the search is made once more, and
   *   only when it finds nothing either, INPUTS_SPENT. INPUTS_SPENT is a hint: it does not make a
   *   new intent safe. The new attempt spends the same anchor as the earlier ones; an intent with
   *   `sendAllTo` builds no attempt in place of its first one (INVALID_STATE, `status`).
   *
   * The payer: the one given here, for this and later attempts, also when this call builds
   * nothing; else the one the intent was made with. A snapshot serves one attempt. Once an
   * attempt exists, a payer whose change address is not the recorded one, and that does not hold
   * the recorded anchor, is PAYER_MISMATCH; the change of every attempt goes to the recorded
   * change address. Selection uses the `canSelect` and `coinSelection` the object was given.
   * @throws TxIntentError CANNOT_OBSERVE (`unconfirmed`, retryable) when the tip cannot be read,
   *   is older than one already read, or when fresh reads of their addresses show none of the
   *   inputs that could be the first anchor; (`noSearch`, `noDepth`, `noValidity`) when the
   *   provider, probed with the first attempt this object builds, cannot follow it; nothing
   *   built. INVALID_STATE (`terminal`) in `abandoned`, (`closing`) with the closing mark,
   *   (`tooManyAttempts`) for a 17th attempt, (`pastHorizon`) for an attempt that runs a Plutus
   *   script past the network's forecast horizon, (`status`) when the parts give a body the
   *   intent already has. PAYER_MISMATCH, INPUTS_SPENT, SCRIPT_FAILED as above
   * @throws TxBuildError MISSING_PAYER without a payer, or with a snapshot an earlier attempt
   *   was built from; INVALID_OPTION for a payer of no known form; ABORTED; and every error of
   *   building the transaction, FEE_TOO_LOW for an attempt the intent's `fee` does not cover
   */
  build(options?: { payer?: Payer; signal?: AbortSignal }): Promise<BuiltTx> {
    return this.#run(async (state) => {
      const { payer, signal } = options ?? {};
      checkCallOptions({ signal });
      // In final the landed attempt is returned: only abandoned and the closing mark refuse
      if (intentStatus(state.record) !== "final") this.#refuseClosed(state);
      if (payer !== undefined) {
        toPayerSource(payer);
        state.payer = payer;
        state.snapshotUsed = false;
      }
      throwIfAborted(signal, CALL);
      const record = state.record;
      const status = intentStatus(record);
      const current = currentAttempt(record);
      switch (status) {
        case "included":
        case "final":
          return landedAttempt(record)!.built!;
        case "failed":
          throw this.#error("SCRIPT_FAILED", this.#scriptFailedText(), {});
        case "sent":
          return current!.built!;
        case "built":
        case "signed": {
          const tip = await this.#readTip(state, signal);
          if (tip === undefined || tip.timeMs < current!.until)
            return current!.built!;
          return this.#newAttempt(state, signal, tip);
        }
        case "draft":
        case "rejected":
        case "expired":
        case "orphaned":
          return this.#newAttempt(state, signal);
        default:
          throw this.#error(
            "INVALID_STATE",
            `the intent is ${status}, a status this library does not build in`,
            { details: { reason: "status" } },
          );
      }
    });
  }

  /**
   * Signs the current attempt with the call's signers, else with the intent's payer when it can
   * sign, each asked once, and records the witnesses it got: those of the keys the fee counts
   * (the keys the attempt needs and those its native scripts name, and `extraKeyWitnesses`
   * more); others are dropped. With every needed key the attempt is `signed`; else it stays
   * `built` and `missing` lists the rest. A signer is waited for no longer than the attempt's
   * `until`, by the tip read once before asking.
   * @throws TxIntentError MISSING_SIGNATURES when nobody can sign: no signers given (an empty
   *   list gives none), and a payer that cannot sign;
   *   SIGN_DECLINED, SIGNER_FAILED (`timeout` past the deadline, also without asking when no
   *   time is left), which change nothing; INVALID_STATE (`closing`) with the closing mark,
   *   (`terminal`) in `final` and `abandoned`, (`status`) in `draft`, `included`, `expired`,
   *   `failed` and `orphaned`; INVALID_WITNESS (`staleAttempt`) when the attempt was replaced
   *   meanwhile
   * @throws TxBuildError ABORTED; INVALID_OPTION for a signer that cannot sign
   */
  sign(options?: SignOptions): Promise<this> {
    return this.#run(async (state) => {
      const { signal } = options ?? {};
      checkCallOptions({ signal });
      const given = callSigners(options?.signers);
      this.#refuseClosed(state);
      this.#refuseUnsignable(state);
      throwIfAborted(signal, CALL);
      const signers = given ?? this.#payerSigner(state);
      if (signers === undefined) throw this.#missingSignatures();
      const tip = await this.#readTip(state, signal);
      await this.#signWith(state, signers, tip, signal);
      return this;
    });
  }

  /**
   * Adds witnesses to the current attempt: witness sets, or full transactions of which only the
   * vkey and bootstrap witnesses are taken, each checked against the attempt's body. Kept as
   * `sign()` keeps them; signatures can come over days and from any object.
   * @throws TxIntentError INVALID_WITNESS (`undecodable`, `wrongBody`, `staleAttempt` for a
   *   witness of a replaced attempt of this intent) with the index of the argument, counted from
   *   0; INVALID_STATE as `sign()`
   */
  addWitnesses(...witnesses: string[]): Promise<this> {
    return this.#run(async (state) => {
      this.#refuseClosed(state);
      this.#refuseUnsignable(state);
      const attempt = currentAttempt(state.record)!;
      const built = attempt.built!;
      const raw = readTransaction(
        withWitnesses(readTransaction(built.tx), recordedWitnesses(attempt)),
      );
      let offered: KeyWitness[];
      try {
        offered = await witnessesToAdd(raw, witnesses);
      } catch (error) {
        throw this.#staleOrSame(state, error, witnesses);
      }
      this.#record(state, attempt, offered);
      return this;
    });
  }

  /**
   * Observes first, then does the step for the status it saw, and goes on in the same call:
   *
   * - `draft`: builds the first attempt (the only status `send()` builds in);
   * - `built`: signs with the call's signers, else with the payer when it can sign;
   * - `signed`: submits, through the call's submitter, else the builder's, else the provider;
   * - `sent`: sends the same bytes again, then waits;
   * - `included`: waits, without sending;
   * - `rejected`, `expired`, `failed`: throws that state's error again; `final`: returns.
   *
   * It waits for `waitFor` (`"sent"` by default: the answer to the delivery), observing every
   * `pollMs` and sending the same bytes again every `resendMs` while the attempt is `sent`. A
   * submitter that answers with another hash is no error: the intent is `sent`, the hash is kept
   * in `TxAttempt.reportedHash`, and `trace` gets a `warning`. A refusal of the same bytes sent
   * again proves nothing and is no error. After every delivery and when a landing is found, the
   * builder's cache of volatile reads is cleared.
   * @throws TxIntentError EXPIRED `{ unsent: true }` for a `built` or `signed` attempt past its
   *   `until` by the tip, read again after signing; nothing sent. NOT_YET_VALID before an
   *   attempt's `invalidBefore`; MISSING_SIGNATURES; MISSING_SUBMITTER; SUBMIT_FAILED when the
   *   outcome of a delivery is unknown (the same call sends the same bytes); REJECTED when the
   *   ledger refused it and every earlier delivery; EXPIRED, ORPHANED with the other live
   *   attempts; SCRIPT_FAILED; CONFIRM_TIMEOUT after `timeoutMs`; CANNOT_OBSERVE (`noValidity`)
   *   for a Plutus attempt found without its validity, (`noDepth`) for an attempt found without
   *   block heights, and the probe's reasons; INVALID_STATE (`terminal`) in `abandoned` and when
   *   the intent is closed while waiting, (`closing`) with the closing mark; and the errors of
   *   `build()` and `sign()`
   * @throws TxBuildError INVALID_OPTION for a wait option out of range, before any request;
   *   ABORTED: bytes already handed to the submitter count as sent
   */
  send(options?: SendOptions): Promise<this> {
    return this.#run(async (state) => {
      const opts = options ?? {};
      const wait = effectiveWait(
        opts,
        state.record.deadlines,
        state.builder.intentDefaults,
      );
      checkCallOptions(opts);
      const signers = callSigners(opts.signers);
      const { signal } = opts;
      if (intentStatus(state.record) === "final") return this;
      this.#refuseClosed(state);
      throwIfAborted(signal, CALL);
      const started = Date.now();
      const seen = await this.#observe(state, "live", signal);
      this.#refuseUnobservable(seen);
      await this.#step(state, {
        wait,
        signers,
        submitter: opts.submitter,
        signal,
        started,
        tip: seen.tip,
      });
      return this;
    });
  }

  /**
   * One observation: searches every live attempt, then reads the tip, and records what they
   * show. It never builds, signs or sends, and throws nothing for what it sees. In `draft`,
   * `final` and `abandoned` it returns at once, without a request.
   */
  refresh(): Promise<this> {
    return this.#run(async (state) => {
      await this.#observe(state, "live", undefined);
      return this;
    });
  }

  /* -------------------------------------------------------------------------------------------
   * Errors
   * ----------------------------------------------------------------------------------------- */

  /** Runs a method; every intent error it throws gets the intent, its id, status and attempt */
  async #run<T>(body: (state: IntentState) => Promise<T>): Promise<T> {
    const state = stateOf(this);
    try {
      return await body(state);
    } catch (error) {
      throw this.#withIntent(state, error);
    }
  }

  /** An intent error as a method of this intent throws it */
  #withIntent(state: IntentState, error: unknown): unknown {
    if (!TxIntentError.is(error) || error.intent !== undefined) return error;
    Object.defineProperty(error, "intent", {
      value: this,
      enumerable: false,
      configurable: true,
      writable: false,
    });
    const fields = error as {
      intentId?: string;
      status?: TxIntentStatus;
      txHash?: string;
    };
    const { record } = state;
    if (record.id !== undefined) fields.intentId = record.id;
    fields.status = intentStatus(record);
    const txHash = shownAttempt(record)?.txHash;
    if (fields.txHash === undefined && txHash !== undefined)
      fields.txHash = txHash;
    if (!error.message.endsWith(NOT_UNPAID))
      error.message = `${error.message}${error.message.endsWith(".") ? "" : "."} ${NOT_UNPAID}`;
    return error;
  }

  /** A new intent error about this intent */
  #error<C extends TxIntentErrorCode>(
    code: C,
    message: string,
    context: {
      details?: C extends keyof TxIntentErrorDetails
        ? TxIntentErrorDetails[C]
        : undefined;
      retryAfterMs?: number;
      txHash?: string;
      cause?: unknown;
    },
  ): TxIntentError<C> {
    const make = TxIntentError as new (
      code: C,
      message: string,
      context: object,
    ) => TxIntentError<C>;
    return new make(code, message, context);
  }

  /** The age of the last tip read by the local clock, for `tipAgeMs` */
  #tipAge(state: IntentState): { tipAgeMs?: number } {
    return state.lastTip === undefined
      ? {}
      : { tipAgeMs: Date.now() - state.lastTip.timeMs };
  }

  /** The hashes of the live attempts but the current one */
  #otherLive(state: IntentState): string[] {
    const current = currentAttempt(state.record)?.txHash;
    return liveAttempts(state.record)
      .map((attempt) => attempt.txHash)
      .filter((txHash) => txHash !== current);
  }

  #retryAfterPoll(state: IntentState) {
    return state.builder.intentDefaults?.pollMs ?? DEFAULT_POLL_MS;
  }

  #unconfirmed(state: IntentState, message: string) {
    return this.#error("CANNOT_OBSERVE", message, {
      details: { reason: "unconfirmed" },
      retryAfterMs: this.#retryAfterPoll(state),
    });
  }

  #scriptFailedText() {
    return "an attempt of the intent is in a block with is_valid = false: a script failed and the collateral was taken; correct the parts in a new intent once this one is abandoned";
  }

  #missingSignatures() {
    const missing = [...this.missing];
    const keys =
      missing.length === 0
        ? "every key the attempt needs has signed it"
        : `${missing.length} key(s) the attempt needs have not signed it`;
    return this.#error(
      "MISSING_SIGNATURES",
      `${keys}, and nobody in this call can sign: give signers, a payer that signs, or addWitnesses`,
      { details: { missing } },
    );
  }

  /** The error of a dead current attempt, as `send()` throws it again */
  #deadError(state: IntentState, status: TxIntentStatus) {
    const otherLive = this.#otherLive(state);
    switch (status) {
      case "rejected":
        return this.#error(
          "REJECTED",
          "the ledger refused the attempt, and every earlier delivery of it; build a new attempt, then send it",
          { details: { otherLive, ...this.#tipAge(state) } },
        );
      case "expired":
        return this.#error(
          "EXPIRED",
          "the attempt's deadline and the margin have passed and it is not on chain; build a new attempt, then send it",
          { details: { otherLive, ...this.#tipAge(state) } },
        );
      case "orphaned":
        return this.#error(
          "ORPHANED",
          "the parent attempt whose output the attempt spends is dead",
          { details: { otherLive } },
        );
      default:
        return this.#error("SCRIPT_FAILED", this.#scriptFailedText(), {});
    }
  }

  /** Maps a refusal of the state machine to the error of the method */
  #refused(
    state: IntentState,
    refusal: { reason: string; message: string },
    witness?: number,
  ): TxIntentError {
    if (refusal.reason === "staleAttempt" && witness !== undefined)
      return this.#error(
        "INVALID_WITNESS",
        `the witnesses are for an attempt that is no longer the current one: ${refusal.message}`,
        { details: { reason: "staleAttempt", argument: witness } },
      );
    const reason =
      refusal.reason === "terminal" ||
      refusal.reason === "closing" ||
      refusal.reason === "tooManyAttempts"
        ? refusal.reason
        : "status";
    return this.#error("INVALID_STATE", refusal.message, {
      details: { reason },
    });
  }

  /** Applies an event to the record as it is now */
  #apply(state: IntentState, event: TxIntentEvent, witness?: number) {
    const result = advanceIntent(state.record, event);
    if (!result.ok) throw this.#refused(state, result, witness);
    commit(state, result.json);
  }

  /** INVALID_STATE for a closed intent and for one with the closing mark */
  #refuseClosed(state: IntentState) {
    const status = intentStatus(state.record);
    if (status === "final" || status === "abandoned")
      throw this.#error(
        "INVALID_STATE",
        `the intent is ${status}: nothing more is done with it`,
        { details: { reason: "terminal" } },
      );
    if (state.record.closing === true)
      throw this.#error(
        "INVALID_STATE",
        "the decision to close the intent is recorded: it builds, signs and sends nothing more; advance() finishes the closing",
        { details: { reason: "closing" } },
      );
  }

  /** INVALID_STATE (`status`) where an attempt takes no signatures */
  #refuseUnsignable(state: IntentState) {
    const status = intentStatus(state.record);
    if (
      status !== "built" &&
      status !== "signed" &&
      status !== "sent" &&
      status !== "rejected"
    )
      throw this.#error(
        "INVALID_STATE",
        `an attempt takes signatures in built, signed, sent and rejected, and the intent is ${status}`,
        { details: { reason: "status" } },
      );
  }

  /** CANNOT_OBSERVE right after an observation that found what cannot be followed */
  #refuseUnobservable(seen: Observed) {
    if (seen.noValidity)
      throw this.#error(
        "CANNOT_OBSERVE",
        "an attempt that runs a Plutus script was found, and the provider does not say whether its scripts passed (validContract): use a provider that does",
        { details: { reason: "noValidity" } },
      );
    if (seen.noDepth)
      throw this.#error(
        "CANNOT_OBSERVE",
        "an attempt was found, and the provider gives no block heights to count its depth by: use a provider that does",
        { details: { reason: "noDepth" } },
      );
  }

  /* -------------------------------------------------------------------------------------------
   * Observation
   * ----------------------------------------------------------------------------------------- */

  /** The tip as the state machine takes it, with the time its slot starts at */
  #tipOf(state: IntentState, observed: ObservedTip): Tip {
    const tip: Tip = {
      slot: observed.slot,
      timeMs: state.builder.timeAt(observed.slot),
      ...(observed.height !== undefined && { height: observed.height }),
    };
    state.lastTip = tip;
    return tip;
  }

  /** Reads the tip once; undefined when it is unknown */
  async #readTip(
    state: IntentState,
    signal: AbortSignal | undefined,
  ): Promise<Tip | undefined> {
    const observed = await abortable(state.observer.tip(), signal, CALL);
    return observed && this.#tipOf(state, observed);
  }

  /**
   * One observation: a search for each attempt (the live ones, or all of them), then the tip,
   * and, where it can decide an expiry, a fresh read of an anchor's address. What it shows is
   * recorded; what it cannot tell is unknown and changes nothing.
   */
  async #observe(
    state: IntentState,
    which: "live" | "all",
    signal: AbortSignal | undefined,
  ): Promise<Observed> {
    const record = state.record;
    const status = intentStatus(record);
    const none: Observed = { noValidity: false, noDepth: false };
    if (
      status === "final" ||
      status === "abandoned" ||
      record.attempts.length === 0
    )
      return none;
    const attempts = which === "all" ? record.attempts : liveAttempts(record);
    const { searches, tip: observed } = await abortable(
      searchThenTip(
        state.observer,
        attempts.map((attempt) => attempt.txHash),
      ),
      signal,
      CALL,
    );
    const tip = observed && this.#tipOf(state, observed);
    const sightings: Sighting[] = [];
    let noValidity = false;
    let noDepth = false;
    // The attempts the search gave no answer about; a find without its slot is not among them
    const noAnswer: AttemptRecord[] = [];
    // The anchors that an attempt found without its slot spends
    const spentUnplaced = new Set<string>();
    for (const attempt of attempts) {
      const search = searches.get(attempt.txHash);
      if (search === undefined || "unsupported" in search) {
        noAnswer.push(attempt);
        continue;
      }
      if (!search.found) {
        sightings.push({ txHash: attempt.txHash, found: false });
        continue;
      }
      const validityUnknown =
        attempt.plutus === true && search.validContract === undefined;
      if (validityUnknown && attempt.status !== "failed") noValidity = true;
      // A find without its slot cannot be placed against the tip: unknown, and since the search
      // answered, never expired by the anchor's address either
      if (search.slot === undefined) {
        for (const ref of attempt.anchors) spentUnplaced.add(refKey(ref));
        continue;
      }
      sightings.push({
        txHash: attempt.txHash,
        found: true,
        slot: search.slot,
        ...(search.block !== undefined && { block: search.block }),
        ...(search.blockHeight !== undefined && {
          blockHeight: search.blockHeight,
        }),
        ...(search.validContract !== undefined && {
          valid: search.validContract,
        }),
      });
      if (
        !validityUnknown &&
        search.validContract !== false &&
        attempt.status !== "final" &&
        (search.blockHeight === undefined ||
          (tip !== undefined && tip.height === undefined))
      )
        noDepth = true;
    }

    // An attempt past its deadline and the margin that the search gave no answer about is
    // expired when a fresh read of its anchor's address shows the anchor still there. An anchor
    // that an attempt found without its slot spends is never read: the state machine applies an
    // anchor in place to every attempt without a sighting, and that attempt has none
    const anchorsInPlace: OutRef[] = [];
    if (tip !== undefined) {
      const margin = record.deadlines.expiryMarginMs;
      const due = noAnswer.filter(
        (attempt) =>
          (attempt.status === "built" ||
            attempt.status === "signed" ||
            attempt.status === "sent" ||
            attempt.status === "rejected") &&
          tip.timeMs >= attempt.until + margin,
      );
      const refs = new Map<string, UTxO>();
      for (const attempt of due)
        for (const ref of attempt.anchors) {
          if (spentUnplaced.has(refKey(ref))) continue;
          const utxo = anchorUtxo(record, ref);
          if (utxo) refs.set(refKey(ref), utxo);
        }
      const reads = new Map<string, Promise<readonly UTxO[] | undefined>>();
      for (const utxo of refs.values()) {
        const address = utxo.output.address;
        if (!reads.has(address))
          reads.set(address, state.observer.utxosAt(address));
      }
      for (const utxo of refs.values()) {
        const listed = await abortable(
          reads.get(utxo.output.address)!,
          signal,
          CALL,
        );
        if (listed?.some((held) => sameRef(held, utxo.input)))
          anchorsInPlace.push({ ...utxo.input });
      }
    }

    const before = landedAttempt(state.record)?.txHash;
    const result = advanceIntent(state.record, {
      type: "observation",
      ...(tip !== undefined && { tip }),
      attempts: sightings,
      ...(anchorsInPlace.length > 0 && { anchorsInPlace }),
    });
    // A record closed meanwhile takes no observation: nothing to record
    if (result.ok) commit(state, result.json);
    const after = landedAttempt(state.record)?.txHash;
    if (after !== undefined && after !== before) this.#clearVolatile(state);
    return { ...(tip !== undefined && { tip }), noValidity, noDepth };
  }

  /** Clears the builder's cache of reads that a delivery or a landing makes stale */
  #clearVolatile(state: IntentState) {
    internals(state.builder).cache?.clearVolatile();
  }

  /**
   * The trial request of the provider: a search for the transaction that created the anchor,
   * and the tip. The provider must have a search, block heights and, for an attempt that runs a
   * Plutus script, the validity of what it finds. Without an answer nothing is forbidden, and
   * the probe is made again before the first delivery.
   * @throws TxIntentError CANNOT_OBSERVE (`noSearch`, `noDepth`, `noValidity`)
   */
  async #probe(
    state: IntentState,
    anchor: OutRef,
    plutus: boolean,
    signal: AbortSignal | undefined,
  ) {
    const { searches, tip: observed } = await abortable(
      searchThenTip(state.observer, [anchor.txHash]),
      signal,
      CALL,
    );
    if (observed !== undefined) this.#tipOf(state, observed);
    const search = searches.get(anchor.txHash);
    const cannot = (
      reason: "noSearch" | "noDepth" | "noValidity",
      what: string,
    ) =>
      this.#error(
        "CANNOT_OBSERVE",
        `the provider cannot follow the intent: ${what}; use another provider`,
        { details: { reason } },
      );
    if (search !== undefined && "unsupported" in search)
      throw cannot("noSearch", "it cannot search for a transaction");
    if (observed !== undefined && observed.height === undefined)
      throw cannot("noDepth", "its tip has no block height");
    if (search?.found === true) {
      if (search.blockHeight === undefined)
        throw cannot("noDepth", "what it finds has no block height");
      if (plutus && search.validContract === undefined)
        throw cannot(
          "noValidity",
          "what it finds does not say whether its scripts passed (validContract)",
        );
    }
    if (observed !== undefined && search !== undefined) state.probe = "done";
  }

  /* -------------------------------------------------------------------------------------------
   * Building an attempt
   * ----------------------------------------------------------------------------------------- */

  /**
   * Builds and records a new attempt, or returns an earlier one that landed. The order: search
   * the earlier attempts, read the tip, check the explicit inputs, the limits and the payer,
   * build, choose the first anchor, probe the provider, record.
   */
  async #newAttempt(
    state: IntentState,
    signal: AbortSignal | undefined,
    knownTip?: Tip,
  ): Promise<BuiltTx> {
    const startCount = state.record.attempts.length;
    const first = startCount === 0;
    let tip: Tip | undefined;
    if (first) tip = knownTip ?? (await this.#readTip(state, signal));
    else {
      // Every earlier attempt may have been sent by someone else: search them all first
      const seen = await this.#observe(state, "all", signal);
      const landed = this.#landedOrFailed(state);
      if (landed) return landed;
      if (seen.noValidity) this.#refuseUnobservable(seen);
      tip = seen.tip;
    }
    if (tip === undefined)
      throw this.#unconfirmed(
        state,
        "the tip cannot be read, or is older than one already read: a new attempt needs it for its deadline",
      );

    const record = state.record;
    const status = intentStatus(record);
    const current = currentAttempt(record);
    const mayBuild =
      status === "draft" ||
      status === "rejected" ||
      status === "expired" ||
      status === "orphaned" ||
      ((status === "built" || status === "signed") &&
        tip.timeMs >= current!.until);
    if (!mayBuild) return shownAttempt(record)!.built!;

    if (!first) {
      const landed = await this.#checkInputs(state, current!, signal);
      if (landed) return landed;
    }
    if (state.record.attempts.length >= MAX_ATTEMPTS)
      throw this.#error(
        "INVALID_STATE",
        `the intent already holds ${MAX_ATTEMPTS} attempts, the most it may`,
        { details: { reason: "tooManyAttempts" } },
      );
    const options = dataOptions(record);
    if (!first && options.sendAllTo !== undefined)
      throw this.#error(
        "INVALID_STATE",
        "an intent with sendAllTo builds no new attempt in place of its first one: the inputs of a new attempt would change the amount it pays",
        { details: { reason: "status" } },
      );
    if (state.payer === undefined || state.snapshotUsed)
      throw new TxBuildError(
        "MISSING_PAYER",
        state.payer === undefined
          ? "the intent has no payer for a new attempt: give one to build({ payer }) as a wallet, an address in bech32 or hex, or a snapshot { changeAddress, utxos }"
          : "the payer snapshot served an earlier attempt: give a new one to build({ payer }) as a wallet, an address in bech32 or hex, or a snapshot { changeAddress, utxos }",
      );
    throwIfAborted(signal, CALL);
    const given = state.payer;
    const read = await abortable(
      internals(state.builder).readGivenPayer(given, signal),
      signal,
      CALL,
    );
    const payer = read.snapshot;
    const changeAddress = this.#checkPayer(state, payer);

    const parts = this.#attemptParts(state, tip);
    throwIfAborted(signal, CALL);
    // The attempt is built from this one read; a CIP-30 payer's collateral fallback stays
    const snapshot = toPayerSource({ changeAddress, utxos: payer.utxos });
    const built = await internals(state.builder).buildList(
      read.getCollateral && snapshot.form === "snapshot"
        ? { ...snapshot, getCollateral: read.getCollateral }
        : snapshot,
      parts,
      {
        ...(state.canSelect && { canSelect: state.canSelect }),
        ...(state.coinSelection && { coinSelection: state.coinSelection }),
        ...(options.sendAllTo !== undefined && {
          sendAllTo: options.sendAllTo,
        }),
        ...(options.knownUtxos !== undefined && {
          knownUtxos: options.knownUtxos,
        }),
        ...(options.fee !== undefined && { fee: options.fee }),
        ...(options.registeredPools !== undefined && {
          registeredPools: options.registeredPools,
        }),
        ...(options.extraKeyWitnesses !== undefined && {
          extraKeyWitnesses: options.extraKeyWitnesses,
        }),
        ...(state.trace && { trace: state.trace }),
        ...(signal && { signal }),
      },
    );

    const anchor = first
      ? await this.#firstAnchor(state, built, payer, signal)
      : generalAnchor(record)!;
    if (state.probe === "owed")
      await this.#probe(
        state,
        anchor.utxo.input,
        built.redeemers.length > 0,
        signal,
      );

    // Another call recorded an attempt meanwhile: this body is dropped, never handed out
    if (state.record.attempts.length !== startCount)
      return shownAttempt(state.record)!.built!;
    const result = advanceIntent(state.record, {
      type: "build",
      built,
      anchors: [{ utxo: anchor.utxo, kind: anchor.kind }],
      tipTimeMs: tip.timeMs,
    });
    if (!result.ok) {
      if (result.reason === "attempt")
        throw this.#error(
          "INVALID_STATE",
          `the parts give the same body again: the intent already has the attempt ${built.txHash}, with these parts and this payer it has no other body; start a new intent once this one is abandoned, or build again once the payer's UTxOs have changed`,
          { details: { reason: "status" }, txHash: built.txHash },
        );
      throw this.#refused(state, result);
    }
    commit(
      state,
      first
        ? {
            ...result.json,
            options: { ...result.json.options, changeAddress },
          }
        : result.json,
    );
    // A snapshot serves one attempt; a payer given meanwhile by build({ payer }) is a fresh one
    if (state.payer === given && toPayerSource(given).form === "snapshot")
      state.snapshotUsed = true;
    return built;
  }

  /**
   * After a search of every attempt: the landed one's transaction; SCRIPT_FAILED when one was
   * found with `is_valid = false`
   */
  #landedOrFailed(state: IntentState): BuiltTx | undefined {
    const landed = landedAttempt(state.record);
    if (landed) return landed.built;
    if (state.record.attempts.some((attempt) => attempt.status === "failed"))
      throw this.#error("SCRIPT_FAILED", this.#scriptFailedText(), {});
    return undefined;
  }

  /**
   * The explicit inputs of the parts, read fresh at their addresses: when one is gone, the
   * attempts are searched once more, at once; one that landed is returned, else INPUTS_SPENT
   */
  async #checkInputs(
    state: IntentState,
    previous: AttemptRecord,
    signal: AbortSignal | undefined,
  ): Promise<BuiltTx | undefined> {
    const built = previous.built;
    if (built === undefined) return undefined;
    const known = [
      ...built.inputs,
      ...built.referenceInputs,
      ...(built.collateral?.inputs ?? []),
    ];
    const reads = new Map<string, Promise<readonly UTxO[] | undefined>>();
    const checked: { ref: OutRef; address: string }[] = [];
    for (const ref of explicitInputs(state.parts)) {
      const address = known.find((utxo) => sameRef(utxo, ref))?.output.address;
      // Not in the previous attempt: nothing to compare with, unknown
      if (address === undefined) continue;
      checked.push({ ref, address });
      if (!reads.has(address))
        reads.set(address, state.observer.utxosAt(address));
    }
    const spent: OutRef[] = [];
    for (const { ref, address } of checked) {
      const listed = await abortable(reads.get(address)!, signal, CALL);
      if (listed !== undefined && !listed.some((utxo) => sameRef(utxo, ref)))
        spent.push(ref);
    }
    if (spent.length === 0) return undefined;
    // An attempt may have landed between the first search and the read
    await this.#observe(state, "all", signal);
    const landed = this.#landedOrFailed(state);
    if (landed) return landed;
    throw this.#error(
      "INPUTS_SPENT",
      `${spent.map(refKey).join(", ")}, named by the parts, ${spent.length === 1 ? "is" : "are"} spent, and no attempt of the intent is found: a new attempt cannot spend ${spent.length === 1 ? "it" : "them"}. This is a hint only: it does not make a new intent safe`,
      { details: { inputs: spent } },
    );
  }

  /**
   * The payer read for a new attempt, compared with the record: the change address it builds
   * with, the recorded one once an attempt exists
   * @throws TxIntentError PAYER_MISMATCH for another change address of a payer that does not
   *   hold the recorded anchor
   */
  #checkPayer(state: IntentState, payer: PayerSnapshot): string {
    const recorded = dataOptions(state.record).changeAddress;
    if (recorded === undefined || recorded === payer.changeAddress)
      return payer.changeAddress;
    const anchor = generalAnchor(state.record);
    const holds =
      anchor?.kind === "payer" &&
      payer.utxos.some((utxo) => sameRef(utxo, anchor.utxo.input));
    if (!holds)
      throw this.#error(
        "PAYER_MISMATCH",
        `the payer's change address ${payer.changeAddress} is not the intent's ${recorded}, and the payer does not hold the intent's anchor`,
        { details: { recorded, given: payer.changeAddress } },
      );
    return recorded;
  }

  /**
   * The parts of a new attempt: the intent's parts with its deadline in the one validity part,
   * and the payer's anchor when the parts do not spend it
   * @throws TxIntentError INVALID_STATE (`pastHorizon`) for an attempt that runs a Plutus script
   *   and ends past the network's forecast horizon
   */
  #attemptParts(state: IntentState, tip: Tip): TxPart[] {
    const { builder } = state;
    const parts = [...state.parts];
    const at = parts.findIndex((part) => part.kind === "validity");
    const given =
      at < 0 ? undefined : (parts[at] as Extract<TxPart, { kind: "validity" }>);
    const fromMs =
      given?.from ??
      (given?.invalidBefore !== undefined
        ? builder.timeAt(BigInt(given.invalidBefore))
        : undefined);
    const fromSlot =
      given?.invalidBefore !== undefined
        ? Number(given.invalidBefore)
        : given?.from !== undefined
          ? builder.slotAt(given.from, "up")
          : undefined;
    let hereafter: number;
    if (given?.until !== undefined) hereafter = builder.slotAt(given.until);
    else if (given?.invalidHereafter !== undefined)
      hereafter = Number(given.invalidHereafter);
    else {
      const until =
        Math.max(tip.timeMs, fromMs ?? tip.timeMs) +
        state.record.deadlines.ttlMs;
      hereafter = builder.slotAt(until);
      const deadline = validity({
        ...(given?.from !== undefined && { from: given.from }),
        ...(given?.invalidBefore !== undefined && {
          invalidBefore: BigInt(given.invalidBefore),
        }),
        invalidHereafter: hereafter,
        ...(given?.label !== undefined && { label: given.label }),
      });
      if (at < 0) parts.push(deadline);
      else parts[at] = deadline;
    }

    if (parts.some(runsPlutus)) {
      const last = horizonSlot(builder.network, tip.slot, fromSlot);
      if (last !== undefined && hereafter > last)
        throw this.#error(
          "INVALID_STATE",
          `the attempt runs a Plutus script and would end at slot ${hereafter}, past the forecast horizon at slot ${last}: give a shorter ttlMs or until`,
          { details: { reason: "pastHorizon" } },
        );
    }

    const anchor = generalAnchor(state.record);
    if (
      anchor?.kind === "payer" &&
      !parts.some(
        (part) =>
          part.kind === "spend" &&
          part.input.transaction_id.toLowerCase() ===
            anchor.utxo.input.txHash.toLowerCase() &&
          part.input.index === anchor.utxo.input.outputIndex,
      )
    )
      parts.push(spend.pubKey({ utxo: anchor.utxo }));
    return parts;
  }

  /**
   * The first anchor: the payer's key-locked input the attempt spends first in the ledger's
   * order, else the first input the parts name; a candidate a fresh read of its address does
   * not show is passed over
   * @throws TxIntentError CANNOT_OBSERVE (`unconfirmed`) when the reads show none of them
   */
  async #firstAnchor(
    state: IntentState,
    built: BuiltTx,
    payer: PayerSnapshot,
    signal: AbortSignal | undefined,
  ): Promise<{ utxo: UTxO; kind: AnchorKind }> {
    const payers = new Set(payer.utxos.map(utxoKey));
    let kind: AnchorKind = "payer";
    let candidates = built.inputs.filter(
      (utxo) => payers.has(utxoKey(utxo)) && isKeyLocked(utxo),
    );
    if (candidates.length === 0) {
      kind = "parts";
      candidates = state.parts.flatMap((part) => {
        if (part.kind !== "spend") return [];
        const utxo = built.inputs.find(
          (input) =>
            input.input.txHash.toLowerCase() ===
              part.input.transaction_id.toLowerCase() &&
            input.input.outputIndex === part.input.index,
        );
        return utxo ? [utxo] : [];
      });
    }
    const reads = new Map<string, Promise<readonly UTxO[] | undefined>>();
    for (const utxo of candidates) {
      const address = utxo.output.address;
      if (!reads.has(address))
        reads.set(address, state.observer.utxosAt(address));
      const listed = await abortable(reads.get(address)!, signal, CALL);
      // Dropped only by a read that answered and does not show it
      if (
        listed === undefined ||
        listed.some((held) => sameRef(held, utxo.input))
      )
        return { utxo, kind };
    }
    throw this.#unconfirmed(
      state,
      candidates.length === 0
        ? "the attempt spends no input that can be its anchor"
        : "fresh reads of their addresses show none of the inputs that could be the intent's anchor: the provider contradicts the payer's own list",
    );
  }

  /* -------------------------------------------------------------------------------------------
   * Signing
   * ----------------------------------------------------------------------------------------- */

  /** The payer, as the signer of last resort, when it can sign */
  #payerSigner(state: IntentState): Signer[] | undefined {
    const { payer } = state;
    return payer !== undefined && typeof payer === "object" && canSign(payer)
      ? [payer as TxWallet & Signer]
      : undefined;
  }

  /**
   * Asks each signer once for the current attempt, sharing the time left to its `until` by the
   * tip; records what each gives as it comes
   */
  async #signWith(
    state: IntentState,
    signers: readonly Signer[],
    tip: Tip | undefined,
    signal: AbortSignal | undefined,
  ) {
    const attempt = currentAttempt(state.record)!;
    const built = attempt.built!;
    const keys = [
      ...new Set([
        ...built.signers.keyHashes,
        ...nativeKeys(built.signers.nativeScripts),
      ]),
    ];
    const raw = readTransaction(built.tx);
    const timeout = () =>
      this.#error(
        "SIGNER_FAILED",
        "the signer did not answer before the attempt's deadline",
        { details: { reason: "timeout" }, txHash: attempt.txHash },
      );
    const endsAt =
      tip === undefined ? undefined : Date.now() + (attempt.until - tip.timeMs);
    for (const signer of signers) {
      const left = endsAt === undefined ? undefined : endsAt - Date.now();
      if (left !== undefined && left <= 0) throw timeout();
      const answer = await abortable(
        within(signWitnesses(signer, built.tx, keys), left),
        signal,
        CALL,
      );
      if (answer === TIMED_OUT) throw timeout();
      let offered: KeyWitness[];
      try {
        offered = await witnessesToAdd(raw, [answer]);
      } catch (error) {
        throw this.#error(
          "SIGNER_FAILED",
          "the signer answered with a witness that is not of the attempt's body",
          { details: { reason: "error" }, cause: error },
        );
      }
      this.#record(state, attempt, offered);
    }
  }

  /**
   * Records the witnesses offered for an attempt that the fee counts: of the keys it needs and of
   * the keys its native scripts name, `extraKeyWitnesses` more of other keys over the whole
   * attempt, and as many bootstrap witnesses as it spends from Byron addresses
   */
  #record(
    state: IntentState,
    attempt: AttemptRecord,
    offered: readonly KeyWitness[],
  ) {
    const built = attempt.built!;
    const priced = new Set([
      ...built.signers.keyHashes,
      ...nativeKeys(built.signers.nativeScripts),
    ]);
    // Counted against the record as it is now, which may hold more than when the call started
    const now =
      state.record.attempts.find((a) => a.txHash === attempt.txHash) ?? attempt;
    const held = recordedWitnesses(now);
    let others = held.filter(
      (w) => w.kind === "vkey" && !priced.has(w.keyHash),
    ).length;
    let bootstraps = held.filter((w) => w.kind === "bootstrap").length;
    const extra = dataOptions(state.record).extraKeyWitnesses ?? 0;
    const kept: Witness[] = [];
    const seen = new Set(now.witnesses.map((w) => w.keyHash));
    for (const witness of offered) {
      if (seen.has(witness.keyHash)) continue;
      if (witness.kind === "bootstrap") {
        if (bootstraps >= built.signers.byronAddresses.length) continue;
        bootstraps++;
      } else if (!priced.has(witness.keyHash)) {
        if (others >= extra) continue;
        others++;
      }
      seen.add(witness.keyHash);
      kept.push({
        keyHash: witness.keyHash,
        witness: writeWitnessSet([witness], false),
      });
    }
    if (kept.length === 0) return;
    this.#apply(
      state,
      { type: "signature", txHash: attempt.txHash, witnesses: kept },
      0,
    );
  }

  /**
   * The error of `addWitnesses` for an argument whose witness does not verify against the current
   * body: `staleAttempt` when it verifies against a replaced attempt of this intent
   */
  #staleOrSame(
    state: IntentState,
    error: unknown,
    witnesses: readonly string[],
  ): unknown {
    if (
      !TxIntentError.is(error, "INVALID_WITNESS") ||
      error.details.reason !== "wrongBody"
    )
      return error;
    const { argument, keyHash } = error.details;
    let read: KeyWitness[];
    try {
      read = readWitnessArgument(witnesses[argument]).witnesses;
    } catch {
      return error;
    }
    const current = currentAttempt(state.record)?.txHash;
    const earlier = state.record.attempts
      .map((attempt) => attempt.txHash)
      .filter((txHash) => txHash !== current);
    const stale = read.find(
      (witness) =>
        witness.keyHash === keyHash &&
        earlier.some((txHash) => verifies(witness, txHash)),
    );
    if (stale === undefined) return error;
    return this.#error(
      "INVALID_WITNESS",
      `witness argument ${argument} holds a signature of key ${stale.keyHash} for a replaced attempt of the intent, not for its current one`,
      {
        details: {
          reason: "staleAttempt",
          argument,
          keyHash: stale.keyHash,
        },
      },
    );
  }

  /* -------------------------------------------------------------------------------------------
   * Sending and waiting
   * ----------------------------------------------------------------------------------------- */

  /** The submitter of a call: its own, else the builder's, else the provider when it submits */
  #submitter(state: IntentState, given: ISubmitter | undefined) {
    if (given) return given;
    if (state.builder.submitter) return state.builder.submitter;
    const { provider } = state.builder;
    return provider !== undefined && isFunction(provider, "submitTx")
      ? (provider as ISubmitter)
      : undefined;
  }

  /** The step of `send()` for the status the intent is in, and the ones after it */
  async #step(state: IntentState, call: Call) {
    let { tip } = call;
    // When timeoutMs counts from: the call's start, or the answer to its delivery
    let from = call.started;
    let acted = false;
    let signedHere = false;
    for (;;) {
      const status = intentStatus(state.record);
      if (status === "final") return;
      this.#refuseClosed(state);
      const current = currentAttempt(state.record);
      switch (status) {
        case "draft":
          await this.#newAttempt(state, call.signal);
          tip = state.lastTip;
          acted = true;
          continue;
        case "built": {
          this.#refusePastUntil(state, current!, tip);
          if (signedHere) throw this.#missingSignatures();
          const signers = call.signers ?? this.#payerSigner(state);
          if (signers === undefined) throw this.#missingSignatures();
          await this.#signWith(state, signers, tip, call.signal);
          signedHere = true;
          acted = true;
          continue;
        }
        case "signed": {
          // The deadline once more, by a tip read after building or signing
          if (acted) tip = await this.#readTip(state, call.signal);
          this.#refusePastUntil(state, current!, tip);
          this.#refuseNotYetValid(state, current!, tip);
          const outcome = await this.#deliver(state, current!, call);
          // Another call changed the record meanwhile: on from the record as it is now
          if (outcome !== "answered") {
            if (outcome === "movedAfterSending") from = Date.now();
            continue;
          }
          if (call.wait.waitFor === "sent") return;
          await this.#wait(state, call, Date.now());
          return;
        }
        case "sent": {
          const outcome = await this.#resend(state, call);
          if (outcome.failed && call.wait.waitFor === "sent")
            throw outcome.failed;
          if (call.wait.waitFor === "sent") return;
          await this.#wait(state, call, Date.now());
          return;
        }
        case "included":
          if (call.wait.waitFor !== "final") return;
          await this.#wait(state, call, from);
          return;
        case "rejected":
        case "expired":
        case "orphaned":
        case "failed":
          throw this.#deadError(state, status);
        default:
          throw this.#error(
            "INVALID_STATE",
            `the intent is ${status}, a status this library does not send in`,
            { details: { reason: "status" } },
          );
      }
    }
  }

  /**
   * EXPIRED for a `built` or `signed` attempt whose `until` the tip has passed; `unsent` only
   * when the intent never sent it (a refused attempt that took one more witness was sent)
   */
  #refusePastUntil(
    state: IntentState,
    attempt: AttemptRecord,
    tip: Tip | undefined,
  ) {
    if (tip === undefined || tip.timeMs < attempt.until) return;
    const unsent = attempt.sends === 0;
    throw this.#error(
      "EXPIRED",
      unsent
        ? "the attempt was never sent, and the tip has passed its deadline: nothing was sent; build a new attempt, then send it"
        : "the tip has passed the attempt's deadline: nothing was sent now; build a new attempt, then send it",
      {
        details: {
          otherLive: this.#otherLive(state),
          ...(unsent && { unsent: true as const }),
          ...this.#tipAge(state),
        },
        txHash: attempt.txHash,
      },
    );
  }

  /** NOT_YET_VALID while the attempt's lower bound is ahead of the tip */
  #refuseNotYetValid(
    state: IntentState,
    attempt: AttemptRecord,
    tip: Tip | undefined,
  ) {
    const before = attempt.built?.validity?.invalidBefore;
    if (tip === undefined || before === undefined || before <= tip.slot) return;
    const waitMs = state.builder.timeAt(before) - tip.timeMs;
    throw this.#error(
      "NOT_YET_VALID",
      `the attempt is valid from slot ${before}, ${waitMs} ms after the tip: nothing was sent`,
      { details: { waitMs }, retryAfterMs: waitMs },
    );
  }

  /**
   * A recorded delivery: the probe this object owes, the delivery written, then the bytes handed
   * to the submitter, and its answer. When another call on the object changed the record
   * meanwhile, the step goes on from the record as it is now: `moved` before anything was sent,
   * `movedAfterSending` after the submitter answered
   * @throws TxIntentError MISSING_SUBMITTER, nothing sent; REJECTED; SUBMIT_FAILED
   */
  async #deliver(
    state: IntentState,
    attempt: AttemptRecord,
    call: Call,
  ): Promise<"answered" | "moved" | "movedAfterSending"> {
    const submitter = this.#submitter(state, call.submitter);
    if (submitter === undefined)
      throw this.#error(
        "MISSING_SUBMITTER",
        "nothing can submit the attempt: give the call or the builder a submitter, or a provider with submitTx; nothing was sent",
        {},
      );
    if (state.probe === "owed") {
      const anchor = attempt.anchors[0];
      if (anchor !== undefined)
        await this.#probe(state, anchor, attempt.plutus === true, call.signal);
      // Another call may have delivered, found or replaced the attempt during the probe
      const now = currentAttempt(state.record);
      if (now?.txHash !== attempt.txHash || now.status !== "signed")
        return "moved";
    }
    const tx = signedTxOf(attempt)!;
    throwIfAborted(call.signal, CALL);
    this.#apply(state, { type: "delivery", txHash: attempt.txHash });
    let answer: unknown;
    try {
      answer = await this.#submit(submitter, tx, call.signal);
    } catch (error) {
      if (TxBuildError.is(error, "ABORTED")) throw error;
      const failure = this.#failedDelivery(state, attempt, submitter, error);
      if (failure === undefined) return "movedAfterSending";
      throw failure;
    }
    this.#answered(state, attempt, answer, true);
    return "answered";
  }

  /** Hands the bytes to the submitter; the cache is cleared whatever it answers */
  async #submit(
    submitter: ISubmitter,
    tx: string,
    signal: AbortSignal | undefined,
  ): Promise<unknown> {
    const state = stateOf(this);
    try {
      return await abortable(
        Promise.resolve().then(() => submitter.submitTx(tx)),
        signal,
        CALL,
      );
    } finally {
      this.#clearVolatile(state);
    }
  }

  /**
   * The error of a recorded delivery that failed, and the refusal recorded when it is one.
   * Undefined when another call on the object found the attempt in a block meanwhile: nothing is
   * recorded, and the step goes on from the record
   */
  #failedDelivery(
    state: IntentState,
    attempt: AttemptRecord,
    submitter: ISubmitter,
    error: unknown,
  ): TxIntentError | undefined {
    const status = state.record.attempts.find(
      (a) => a.txHash === attempt.txHash,
    )?.status;
    if (
      intentStatus(state.record) === "final" ||
      status === "included" ||
      status === "final"
    )
      return undefined;
    const wallet = isWallet(submitter);
    if (!wallet && isRefusal(error)) {
      this.#apply(state, {
        type: "answer",
        txHash: attempt.txHash,
        refused: true,
      });
      const now = state.record.attempts.find(
        (a) => a.txHash === attempt.txHash,
      );
      if (now?.status === "rejected") {
        const failure = this.#deadError(state, "rejected");
        (failure as { cause?: unknown }).cause = error;
        return failure;
      }
    }
    const walletCode =
      wallet &&
      typeof error === "object" &&
      error !== null &&
      typeof (error as { code?: unknown }).code === "number"
        ? ((error as { code: number }).code as number)
        : undefined;
    return this.#error(
      "SUBMIT_FAILED",
      "the outcome of the delivery is unknown: the attempt may be on its way; the same send() sends the same bytes again",
      {
        details: walletCode === undefined ? {} : { walletCode },
        cause: error,
        txHash: attempt.txHash,
      },
    );
  }

  /** An accepted answer: another hash in it is kept and traced, never an error */
  #answered(
    state: IntentState,
    attempt: AttemptRecord,
    answer: unknown,
    recorded: boolean,
  ) {
    const reportedHash = answeredHash(answer);
    if (reportedHash === undefined || reportedHash === attempt.txHash) return;
    const now = state.record.attempts.find((a) => a.txHash === attempt.txHash);
    if (
      now !== undefined &&
      now.reportedHash === undefined &&
      (recorded || now.refused < now.sends)
    ) {
      const result = advanceIntent(state.record, {
        type: "answer",
        txHash: attempt.txHash,
        refused: false,
        reportedHash,
      });
      if (result.ok) commit(state, result.json);
    }
    emit(state.trace, {
      type: "warning",
      code: "HASH_MISMATCH",
      txHash: attempt.txHash,
      reportedHash,
    });
  }

  /**
   * The same bytes of the current attempt again. A refusal proves nothing; any other failure
   * leaves the outcome unknown. Nothing of either is recorded
   */
  async #resend(
    state: IntentState,
    call: Call,
  ): Promise<{ failed?: TxIntentError | TxBuildError }> {
    const attempt = currentAttempt(state.record)!;
    const tx = signedTxOf(attempt);
    if (tx === undefined) return {};
    if (await this.#landedOnEarlierAnchor(state, call.signal)) return {};
    const submitter = this.#submitter(state, call.submitter);
    if (submitter === undefined)
      return {
        failed: this.#error(
          "MISSING_SUBMITTER",
          "nothing can send the attempt again: give the call or the builder a submitter, or a provider with submitTx",
          {},
        ),
      };
    try {
      const answer = await this.#submit(submitter, tx, call.signal);
      this.#answered(state, attempt, answer, false);
      return {};
    } catch (error) {
      if (TxBuildError.is(error, "ABORTED")) throw error;
      if (!isWallet(submitter) && isRefusal(error)) return {};
      return {
        failed: this.#failedResend(attempt, submitter, error),
      };
    }
  }

  #failedResend(attempt: AttemptRecord, submitter: ISubmitter, error: unknown) {
    const code =
      isWallet(submitter) &&
      typeof error === "object" &&
      error !== null &&
      typeof (error as { code?: unknown }).code === "number"
        ? (error as { code: number }).code
        : undefined;
    return this.#error(
      "SUBMIT_FAILED",
      "sending the same bytes again failed, and its outcome is unknown: the attempt stays sent; the same send() sends them again",
      {
        details: code === undefined ? {} : { walletCode: code },
        cause: error,
        txHash: attempt.txHash,
      },
    );
  }

  /**
   * On an intent whose anchor has changed, the attempts on the earlier anchors are searched
   * before the bytes go again: one found landed ends the resending
   */
  async #landedOnEarlierAnchor(
    state: IntentState,
    signal: AbortSignal | undefined,
  ): Promise<boolean> {
    const general = state.record.anchor.anchors.filter(
      (entry) => entry.kind !== "parent",
    );
    if (general.length < 2) return false;
    await this.#observe(state, "all", signal);
    return landedAttempt(state.record) !== undefined;
  }

  /**
   * Waits for the call's target, observing every `pollMs` and sending the same bytes again every
   * `resendMs` while the attempt is `sent`
   * @param from When `timeoutMs` counts from
   */
  async #wait(state: IntentState, call: Call, from: number) {
    const { waitFor, timeoutMs, pollMs, resendMs } = call.wait;
    let lastResend = Date.now();
    for (;;) {
      const status = intentStatus(state.record);
      if (status === "final") return;
      this.#refuseClosed(state);
      if (waitFor === "included" && status === "included") return;
      if (
        status === "rejected" ||
        status === "expired" ||
        status === "orphaned" ||
        status === "failed"
      )
        throw this.#deadError(state, status);
      if (status === "sent" && Date.now() - lastResend >= resendMs) {
        lastResend = Date.now();
        await this.#resend(state, call);
        if (intentStatus(state.record) !== "sent") continue;
      }
      const elapsed = Date.now() - from;
      if (elapsed >= timeoutMs)
        throw this.#error(
          "CONFIRM_TIMEOUT",
          `the attempt did not reach ${waitFor} within ${timeoutMs} ms; nothing changed, and the same call waits on`,
          {
            details: {
              waitedFor: waitFor === "final" ? "final" : "included",
              timeoutMs,
            },
          },
        );
      await pause(state, Math.min(pollMs, timeoutMs - elapsed), call.signal);
      const seen = await this.#observe(state, "live", call.signal);
      this.#refuseUnobservable(seen);
    }
  }
}

/** What one observation could not follow */
type Observed = {
  readonly tip?: Tip;
  /** A Plutus attempt was found without its validity */
  readonly noValidity: boolean;
  /** An attempt was found while the tip or the find has no block height */
  readonly noDepth: boolean;
};

/** One call of `send()`, its options worked out */
type Call = {
  readonly wait: EffectiveWait;
  readonly signers?: readonly Signer[];
  readonly submitter?: ISubmitter;
  readonly signal?: AbortSignal;
  /** When the call started, by the local clock */
  readonly started: number;
  /** The tip of the call's observation */
  readonly tip?: Tip;
};

/* ---------------------------------------------------------------------------------------------
 * Making intents
 * ------------------------------------------------------------------------------------------- */

/** An intent object over a record, with its live objects; one per object */
const makeIntent = (
  builder: TxBuilder,
  record: IntentRecord,
  live: IntentLiveObjects,
): TxIntent => {
  const intent = new (TxIntent as unknown as new () => TxIntent)();
  const payer = live.payer;
  // The payer is taken as given: the build that reads it checks it
  STATE.set(intent, {
    builder,
    record,
    parts: record.parts as TxPart[],
    ...(payer !== undefined && { payer }),
    snapshotUsed: false,
    ...(live.canSelect && { canSelect: live.canSelect }),
    ...(live.coinSelection && { coinSelection: live.coinSelection }),
    ...(live.trace && { trace: live.trace }),
    observer: chainObserver(builder.provider),
    probe: "owed",
    watchers: new Set(),
  });
  return intent;
};

/** The network as a record holds it: a public network by name, any other as its configuration */
const recordNetwork = (builder: TxBuilder) => {
  const { network } = builder;
  return network.name === "mainnet" ||
    network.name === "preprod" ||
    network.name === "preview"
    ? network.name
    : network;
};

/**
 * A new intent in `draft` over the parts of a builder, held ones first; no request is made.
 * `TxBuilder.intent` calls it.
 * @throws TxBuildError INVALID_OPTION for `after`, an id that is not a string, or a deadline out
 *   of range
 * @throws TxIntentError CANNOT_OBSERVE (`noTip`) without a provider that reads the tip,
 *   (`addressCache`) for a provider that keeps a cache of address UTxOs
 */
export const createIntent = (
  builder: TxBuilder,
  parts: readonly TxPart[],
  options: IntentOptions,
): TxIntent => {
  const given = options as IntentOptions & { after?: unknown };
  if (given.after !== undefined)
    throw invalidOption(
      "after",
      given.after,
      "no parent: an intent made from parts alone",
    );
  if (options.id !== undefined && typeof options.id !== "string")
    throw invalidOption("id", options.id, "a string");
  const deadlines = effectiveDeadlines(
    {
      ...(options.ttlMs !== undefined && { ttlMs: options.ttlMs }),
      ...(options.expiryMarginMs !== undefined && {
        expiryMarginMs: options.expiryMarginMs,
      }),
      ...(options.confirmations !== undefined && {
        confirmations: options.confirmations,
      }),
    },
    builder.intentDefaults,
  );
  const intentId = options.id;
  const { provider } = builder;
  if (
    provider === undefined ||
    typeof unwrapProvider(provider).fetchLatestBlock !== "function"
  )
    throw new TxIntentError(
      "CANNOT_OBSERVE",
      `the builder's provider cannot read the chain's tip (fetchLatestBlock), which every deadline of an intent is counted by: use a provider that does. ${NOT_UNPAID}`,
      {
        details: { reason: "noTip" },
        ...(intentId !== undefined && { intentId }),
      },
    );
  if (keepsAddressCache(provider))
    throw new TxIntentError(
      "CANNOT_OBSERVE",
      `the builder's provider keeps a cache of address UTxOs, which could show a spent anchor as unspent: switch the cache off. ${NOT_UNPAID}`,
      {
        details: { reason: "addressCache" },
        ...(intentId !== undefined && { intentId }),
      },
    );
  const data: DataOptions = {
    ...(options.sendAllTo !== undefined && { sendAllTo: options.sendAllTo }),
    ...(options.knownUtxos !== undefined && {
      knownUtxos: options.knownUtxos,
    }),
    ...(options.fee !== undefined && { fee: options.fee }),
    ...(options.registeredPools !== undefined && {
      registeredPools: options.registeredPools,
    }),
    ...(options.extraKeyWitnesses !== undefined && {
      extraKeyWitnesses: options.extraKeyWitnesses,
    }),
  };
  const record = draftIntent({
    ...(intentId !== undefined && { id: intentId }),
    network: recordNetwork(builder),
    deadlines: { ...deadlines },
    parts: [...parts],
    options: data,
  });
  return makeIntent(builder, record, {
    ...(options.payer !== undefined && { payer: options.payer }),
    ...(options.canSelect && { canSelect: options.canSelect }),
    ...(options.coinSelection && { coinSelection: options.coinSelection }),
    ...(options.trace && { trace: options.trace }),
  });
};

/**
 * An intent object over an existing record. It makes no request and no check: the record is
 * taken as it is. The object did not build the record's current attempt, so it probes the
 * provider before that attempt's first delivery, and it has read no tip yet. A payer given here
 * is compared with the record when the object builds a new attempt; without one, a new attempt
 * is MISSING_PAYER.
 */
export const intentOver = (
  builder: TxBuilder,
  record: IntentRecord,
  live: IntentLiveObjects = {},
): TxIntent => makeIntent(builder, record, live);

/** The record an intent object holds now */
export const recordOf = (intent: TxIntent): IntentRecord =>
  stateOf(intent).record;
