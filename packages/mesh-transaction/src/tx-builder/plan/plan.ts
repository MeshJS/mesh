import type { CachedFetcher, ISubmitter } from "@meshsdk/common";
import { Crypto } from "@meshsdk/core-cst";

import type { BuildEvent, BuiltTxData, TxBuilder } from "../builder";
import type { TxPlanErrorCode, TxPlanErrorDetails } from "../errors";
import type { Payer, PayerRead } from "../payer";
import type { KeyWitness, Signer } from "../sign";
import type { RequiredKey } from "../witnesses";
import type {
  BeforeEntry,
  PlanEvent,
  PlanRecord,
  PlanRefusal,
  PlanTip,
  StepGiven,
  StepRecord,
  TxSighting,
} from "./core";
import type { EffectiveWait } from "./deadlines";
import type {
  AddressOf,
  GivenStep,
  MadePlan,
  MakePlanOptions,
  PlanOrder,
  StandIns,
  StepInput,
} from "./make";
import type { ChainObserver, ObservedTip, TxSearch } from "./observer";
import type { LineClasses, LineInput, LineTx, LookAnswer } from "./replace";
import type {
  PlanOptions,
  PlanStep,
  PlanSteps,
  ResumeOptions,
  RunOptions,
  SignOptions,
  StepParts,
  StoredTxPlanJSON,
  TxPlanJSON,
  TxPlanStatus,
  TxPlanStore,
  TxStep,
} from "./types";
import {
  abortable,
  abortedError,
  throwIfAborted,
  TIMED_OUT,
  within,
} from "../abort";
import { afterBound, checkAfterSize, readAfter } from "../builder";
import { BuiltTx, makeBuiltTx } from "../built-tx";
import { NOT_UNPAID, TxBuildError, TxPlanError } from "../errors";
import {
  invalidOption,
  optionsObject,
  SIGNERS_IN_PLACE,
  SUBMITTER_IN_PLACE,
} from "../options";
import { TxPartError } from "../parts/errors";
import { isLinkedPart } from "../parts/unresolved";
import { toPayerSource } from "../payer";
import {
  countedWitnesses,
  isWallet,
  payerHasNothingLeft,
  payerSigner,
  payerWitnesses,
  readTransaction,
  readWitnessArgument,
  signerWitnesses,
  signsHashes,
  toSigners,
  verifies,
  withWitnesses,
} from "../sign";
import { askedKeys, countedKeys } from "../witnesses";
import {
  advancePlan,
  isDeadStep,
  isUnlandedStep,
  keyHashOfVkey,
  landedSteps,
  liveSteps,
  MAX_STEPS,
  missingKeys,
  pastMarginAt,
  planUntil,
  stepUntil,
  tipAheadOfClock,
} from "./core";
import { effectiveWait } from "./deadlines";
import {
  deliveredOf,
  encodeGiven,
  encodeParts,
  encodePlan,
  encodeValue,
  readPlan,
  sameJson,
} from "./json";
import {
  addressBook,
  asAfter,
  buildAddedSteps,
  buildReplan,
  checkAddedSteps,
  checkPlanSteps,
  fillKeptLinks,
  givenParts,
  givenSteps,
  invalidAddedSteps,
  makePlan,
  orderOf,
  payerOfAdded,
  readAddedSteps,
  readReplanSteps,
  refuseUnread,
  withRecordedMarks,
} from "./make";
import {
  chainObserver,
  isRefusal,
  numericCodeOf,
  searchThenTip,
  submitFailure,
  submitFailureText,
} from "./observer";
import {
  beforeOf,
  heldByTaken,
  keptNamesOf,
  landsBeside,
  leftOf,
  lineClasses,
  openAmong,
  outRefKey,
  settled,
  standingOn,
} from "./replace";

// The object that runs a plan: a group of transactions built together, whose bodies
// never change. It makes the requests: it reads the chain through its observer, asks signers
// and submits. It builds nothing. Every change of what it knows is an event given to the state
// machine of `core.ts`, written before the step it permits: a delivery before the bytes
// leave. Nothing here is exported from the package.

/** The call an aborted signal names */
const CALL = "the call";

/** What a call waits for when the tip has passed a step's end of validity */
const PAST_UNTIL =
  "the tip has passed its end of validity and it was not sent now: it may still land until the margin has passed and a look does not find it";

/** The builder's cache, which a delivery or a landing makes stale */
type BuilderInternals = { readonly cache?: CachedFetcher };

const internals = (builder: TxBuilder) =>
  builder as unknown as BuilderInternals;

/** The live objects of a plan: kept by the object, never written into its record */
type LiveObjects = ResumeOptions;

/** What a plan object holds besides its record */
type PlanState = {
  readonly builder: TxBuilder;
  record: PlanRecord;
  /** The payer as the signer of a call that names none, when it can sign */
  readonly signer?: Signer;
  /**
   * The payer given to `builder.plan` or `builder.resume`: it pays the steps `add` builds that
   * name none, while its change address is the plan's. Never written
   */
  readonly payer?: Payer;
  readonly trace?: (event: BuildEvent) => void;
  readonly observer: ChainObserver;
  /** `owed` until a probe of the provider answered: made before the first delivery */
  probe: "owed" | "done";
  /** The last tip read, for the age of the tip in errors */
  lastTip?: PlanTip;
  /** The waits of calls on this object, woken when its record changes */
  readonly watchers: Set<() => void>;
  /** The store the record is kept in; without one the object alone holds it */
  readonly store?: TxPlanStore;
  /** The writes of the object, made one at a time */
  writing: Promise<unknown>;
  /** How often a record read from the store replaced the one the object held */
  storeReads: number;
  /** The plan this object made in place of its own by `replan`, never written */
  made?: TxPlan;
  /** The call of `replan` going on this object, when one is */
  replanning?: Promise<TxPlan>;
};

const STATE = new WeakMap<TxPlan, PlanState>();

const stateOf = (plan: TxPlan): PlanState => {
  const state = STATE.get(plan);
  if (state === undefined)
    throw new TypeError("not a plan made by this library");
  return state;
};

/* ---------------------------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------------------------- */

const isFunction = (value: unknown, name: string) =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as Record<string, unknown>)[name] === "function";

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { aborted?: unknown }).aborted === "boolean" &&
  typeof (value as { addEventListener?: unknown }).addEventListener ===
    "function";

/** The members of the options of `sign()`, and what the call takes */
const SIGN_MEMBERS: readonly string[] = ["signers", "signal"];
const SIGN_ALLOWED = "an object { signers?, signal? }";

/** The members of the options of `add()`, and what the call takes */
const ADD_MEMBERS: readonly string[] = ["signal"];
const ADD_ALLOWED = "an object { signal? }";

/** The members of the options of `replan()`, and what the call takes */
const REPLAN_MEMBERS: readonly string[] = [
  "id",
  "steps",
  "payer",
  "canSelect",
  "coinSelection",
  "sendAllTo",
  "fee",
  "registeredPools",
  "extraKeyWitnesses",
  "topUpCollateral",
  "collateralReturn",
  "after",
  "knownUtxos",
  "signal",
  "trace",
  "ttlMs",
  "expiryMarginMs",
  "confirmations",
  "consolidate",
];
const REPLAN_ALLOWED =
  "an object { id, steps?, ...the options of builder.plan }";
const REPLAN_ID_ALLOWED =
  "a non-empty string, other than the id of the plan it replaces";

/** The most addresses one call of `replan` reads for the outputs of a dead step */
const MAX_PAID_ADDRESSES = 16;

/** The members of the options of `builder.resume`, and what the call takes */
const RESUME_MEMBERS: readonly string[] = ["payer", "trace"];
const RESUME_ALLOWED = "an object { payer?, trace? }";

/** The members of the options of `run()`, and what the call takes */
const RUN_MEMBERS: readonly string[] = [
  "signers",
  "submitter",
  "waitFor",
  "timeoutMs",
  "pollMs",
  "signal",
];
const RUN_ALLOWED =
  "an object { signers?, submitter?, waitFor?, timeoutMs?, pollMs?, signal? }";

/**
 * The submitter and the signal of a call, checked by their shape
 * @throws TxBuildError INVALID_OPTION for a submitter without `submitTx`, or a signal that is
 *   not an AbortSignal; `details.value` is only the JavaScript type of what was given
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

/**
 * Sets the record an object holds, and wakes the waits of its other calls. A record with more
 * steps makes the object owe the provider's probe again: an added step may be the first that
 * runs a Plutus script
 */
const commit = (state: PlanState, record: PlanRecord) => {
  if (record.steps.length > state.record.steps.length) state.probe = "owed";
  state.record = record;
  for (const wake of [...state.watchers]) wake();
};

/** Takes a record read from the store as the object's own */
const commitStored = (state: PlanState, record: PlanRecord) => {
  state.storeReads += 1;
  commit(state, record);
};

/**
 * Waits `ms` of real time, until the record changes, or until the signal aborts the call
 * @throws TxBuildError ABORTED
 */
const pause = (state: PlanState, ms: number, signal: AbortSignal | undefined) =>
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

/** Whether a step is in a block: included or final */
const isLanded = (step: Pick<StepRecord, "status">) =>
  step.status === "included" || step.status === "final";

const isTerminal = (record: PlanRecord) =>
  record.status === "final" || record.status === "stopped";

/** The step of a record with this name */
const stepIn = (record: PlanRecord, name: string) =>
  record.steps.find((step) => step.name === name);

/** Whether two records have the same steps: the same count, and the same hash at each place */
const sameSteps = (a: PlanRecord, b: PlanRecord) =>
  a.steps.length === b.steps.length &&
  a.steps.every((step, i) => step.txHash === b.steps[i]!.txHash);

/** A value as plain JSON data */
const plainOf = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/**
 * Whether a step was given the same parts and options as recorded; parts that hold a redeemer
 * function are never the same
 */
const sameGiven = (recorded: StepGiven | undefined, given: StepGiven) => {
  if (recorded === undefined) return false;
  try {
    return sameJson(
      plainOf(encodeGiven(recorded)),
      plainOf(encodeGiven(given)),
    );
  } catch {
    return false;
  }
};

/**
 * Whether a recorded step is the step given: the same parts and options; of a transaction given
 * built, a prebuilt step with the hash of its body
 */
const isSameStep = (recorded: StepRecord, step: GivenStep) =>
  "given" in step
    ? sameGiven(recorded.given, step.given)
    : recorded.kind === "prebuilt" &&
      step.txHash !== undefined &&
      recorded.txHash.toLowerCase() === step.txHash;

/**
 * What a record makes of steps given to `add`: `same` when it has every one of them with the
 * same parts and options, or the same transaction, `new` when it has none of their names, else
 * why they are refused
 */
const heldOf = (
  record: PlanRecord,
  given: readonly GivenStep[],
): "same" | "new" | { readonly refused: string } => {
  const held = given.filter((step) => stepIn(record, step.name) !== undefined);
  if (held.length === 0) return "new";
  const names = (steps: readonly GivenStep[]) =>
    steps.map((step) => JSON.stringify(step.name)).join(", ");
  const other = held.filter(
    (step) => !isSameStep(stepIn(record, step.name)!, step),
  );
  if (other.length > 0)
    return {
      refused: `the plan has the step(s) ${names(other)} with other parts or options, or another transaction: a step of a plan never changes, and a name names one step`,
    };
  if (held.length < given.length)
    return {
      refused: `the plan has the step(s) ${names(held)} and not ${names(given.filter((step) => !held.includes(step)))}: the steps of one call are added together, so a call made again gives the same steps`,
    };
  return "same";
};

/** A search that found the transaction in a block: found, with the slot of its block */
const isInBlock = (search: TxSearch) =>
  search !== undefined &&
  "found" in search &&
  search.found &&
  search.slot !== undefined;

/** Whether a step stands on a step that will not land */
const standsOnDead = (record: PlanRecord, step: StepRecord) =>
  step.standsOn.some((name) => {
    const below = stepIn(record, name);
    return below !== undefined && isDeadStep(below);
  });

/**
 * Whether a look leaves a step out: the plan never sent it, nobody is known to have sent it, and
 * a step it stands on is not in a block. It cannot be in a block before that step is
 */
const cannotBeSeen = (record: PlanRecord, step: StepRecord) =>
  step.sends === 0 &&
  step.status !== "sent" &&
  step.status !== "included" &&
  step.status !== "failed" &&
  step.standsOn.some((name) => {
    const below = stepIn(record, name);
    return below === undefined || !isLanded(below);
  });

/**
 * Whether a call cannot go on with the plan: a step will not land, or the plan came to
 * `stopped` by its steps once and the first step not in a block is one it never sent
 */
const cannotGoOn = (record: PlanRecord) => {
  if (record.steps.some(isDeadStep)) return true;
  if (record.halted !== true) return false;
  const first = record.steps.find((step) => !isLanded(step));
  return (
    first !== undefined &&
    first.status !== "sent" &&
    first.status !== "rejected"
  );
};

/** The step a call waits for: the first that is not in a block, else the first not final */
const waitingOn = (record: PlanRecord): StepRecord =>
  record.steps.find((step) => !isLanded(step)) ??
  record.steps.find((step) => step.status !== "final") ??
  record.steps[0]!;

/**
 * Whether the tip has passed the end of a step's validity; never by a tip ahead of the local
 * clock by more than the tolerance
 */
const pastUntil = (step: StepRecord, tip: PlanTip | undefined) => {
  const until = stepUntil(step);
  return (
    tip !== undefined &&
    until !== undefined &&
    !tipAheadOfClock(tip) &&
    tip.timeMs >= until
  );
};

const SIGNED = new WeakMap<StepRecord, string>();

/** The step's transaction with its witnesses; undefined while a key is missing */
const signedTxOf = (step: StepRecord): string | undefined => {
  if (missingKeys(step).length > 0) return undefined;
  let tx = SIGNED.get(step);
  if (tx === undefined) {
    const raw = readTransaction(step.built.tx);
    // A prebuilt step's witnesses in the form they came in
    tx = withWitnesses(raw, step.witnesses, step.tags ?? raw.taggedSets);
    SIGNED.set(step, tx);
  }
  return tx;
};

/** The keys a step needs and has no vkey witness of, each with its roles */
const missingOf = (step: StepRecord): RequiredKey[] => {
  const missing = new Set(missingKeys(step));
  return step.built.signers.keys
    .filter((key) => missing.has(key.keyHash))
    .map((key) => ({ keyHash: key.keyHash, roles: [...key.roles] }));
};

/** Freezes a value all the way down, also below members frozen already */
const freezeAll = (value: unknown, seen = new Set<object>()) => {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  Object.freeze(value);
  for (const member of Object.values(value)) freezeAll(member, seen);
};

const VIEWS = new WeakMap<StepRecord, TxStep>();

/**
 * A prebuilt step as the transaction it is: an object on the plan's builder, with the witnesses
 * the plan holds, in the form they came in, and no payer
 */
const prebuiltOf = (builder: TxBuilder, step: StepRecord): BuiltTx =>
  withRecordedMarks(
    makeBuiltTx(builder, step.built, step.extraKeyWitnesses ?? 0, {
      raw: readTransaction(step.built.tx),
      held: step.witnesses,
      delivered: deliveredOf(step),
      ...(step.tags !== undefined && { tags: step.tags }),
    }),
  );

/** A step as the public `TxStep`: the data of its transaction with its place in the plan */
const viewOf = (step: StepRecord): TxStep => {
  let view = VIEWS.get(step);
  if (view === undefined) {
    const signedTx = signedTxOf(step);
    // The data of the transaction is the record's own: shown frozen, so that nothing done to a
    // step changes what the plan holds, writes, signs or sends
    freezeAll(step.built);
    view = Object.freeze({
      ...step.built,
      name: step.name,
      ...(step.kind !== undefined && { kind: step.kind }),
      status: step.status,
      missing: Object.freeze(missingOf(step)),
      ...(signedTx !== undefined && { signedTx }),
      standsOn: Object.freeze([...step.standsOn]),
      ...(step.seen !== undefined && { seen: Object.freeze({ ...step.seen }) }),
    });
    VIEWS.set(step, view);
  }
  return view;
};

/** The witnesses a step needs that are not held: a key not signed, or a bootstrap witness */
const needsWitnesses = (step: StepRecord) =>
  isUnlandedStep(step) &&
  !payerHasNothingLeft(
    askedKeys(step.built.signers).filter(
      ({ keyHash }) =>
        !step.witnesses.some(
          (w) => w.kind === "vkey" && keyHashOfVkey(w.vkey) === keyHash,
        ),
    ),
    step.witnesses,
    step.built.signers.byronAddresses.length,
  );

/** Offered witnesses with the key hash each one's own public key gives; none that has none */
const ownKeys = (offered: readonly KeyWitness[]): KeyWitness[] =>
  offered.flatMap((witness) => {
    const keyHash = keyHashOfVkey(witness.vkey);
    return keyHash === undefined ? [] : [{ ...witness, keyHash }];
  });

/** The witnesses a step keeps of those offered: those its fee counts, by the record now */
const keptOf = (step: StepRecord, offered: readonly KeyWitness[]) =>
  countedWitnesses(ownKeys(offered), step.witnesses, {
    keys: new Set(countedKeys(step.built.signers)),
    extraKeys: step.extraKeyWitnesses ?? 0,
    bootstraps: step.built.signers.byronAddresses.length,
  });

/** How many times one change is applied again to a record read again after a refused write */
const MAX_REPEATS = 3;

/** What a write does with the record it is shown */
type WriteDecision =
  /** Apply the event; `refused` maps a refusal to the error, or undefined to drop it */
  | {
      readonly event: PlanEvent;
      readonly refused: (refusal: {
        reason: PlanRefusal;
        message: string;
      }) => unknown;
    }
  /** Throw this, applying nothing */
  | { readonly stop: unknown }
  /** Apply nothing: the caller goes on from the record as it is now */
  | { readonly skip: true };

type WriteOutcome = "written" | "unchanged" | "skipped";

/** What one look could not follow */
type Observed = {
  readonly tip?: PlanTip;
  /** A step that runs a Plutus script was found without its validity */
  readonly noValidity: boolean;
  /** A step was found while the tip or the find has no block height */
  readonly noDepth: boolean;
  /** What each search of the look answered */
  readonly answers: readonly LookAnswer[];
};

/** One call of `run()`, its options worked out */
type Call = {
  readonly wait: EffectiveWait;
  readonly signers?: readonly Signer[];
  readonly submitter?: ISubmitter;
  readonly signal?: AbortSignal;
  /** When the call started, by the local clock */
  readonly started: number;
  /**
   * When `timeoutMs` counts from, by the local clock: the call's start, or the answer to the
   * last send of a step that was its first in this call
   */
  from: number;
};

/** A request a method waits for, as the message of one that does not answer in time names it */
type RequestKind = "look" | "tip" | "read" | "write" | "submit";

/**
 * Waits for one request of a method: until the method's signal aborts it and, for a call of
 * `run()`, no longer than the time left of its `timeoutMs`
 */
type Ask = <T>(
  request: Promise<T>,
  kind: RequestKind,
  step?: StepRecord,
) => Promise<T>;

/** What one send of a step's bytes came to */
type Sent =
  /** Accepted, or refused in a way that proves nothing */
  | { readonly outcome: "accepted" }
  /** Refused while no delivery of it may have gone through, and the refusal does not count */
  | { readonly outcome: "unconfirmed"; readonly error: TxPlanError }
  /** The record changed meanwhile: nothing was sent; on from the record as it is now */
  | { readonly outcome: "moved" }
  /** Sending the same bytes again failed; the outcome is unknown */
  | { readonly outcome: "failed"; readonly error: TxPlanError };

/* ---------------------------------------------------------------------------------------------
 * The plan
 * ------------------------------------------------------------------------------------------- */

/**
 * A group of transactions built together and sent in order. `builder.plan(steps, options)`
 * builds every transaction of it at once and returns the plan; `builder.resume` brings a
 * recorded one back.
 *
 * ```ts
 * const plan = await builder.plan(output({ address, value }), { payer: wallet });
 * await plan.run(); // signs with the payer, sends, waits for a block
 * ```
 *
 * The transactions of a plan never change: a call signs them, sends them and looks for them, and
 * a repeated call sends the same bytes. A step built from parts stands on the step before it of
 * the same payer, so the steps of one payer can land only in their order. `run()` sends a step
 * when the step before it is in a block. When a step cannot go through, the plan stops and says
 * what landed, what will not land and what was never sent.
 *
 * A group is not atomic. Whether one payment went through is the status of its step: `final`
 * means it did, `expired`, `failed` and `orphaned` mean it did not and will not, and any other
 * status means it is not known yet. No error of a plan means that a payment did not go through.
 *
 * On a builder with a store, every change is written before the method returns, over the
 * revision the object holds: a delivery before the bytes leave. A write over a revision another
 * writer changed reads the record again and applies the same fact to it, up to three times, then
 * VERSION_CONFLICT. Every method of such a plan may throw STORE_FAILED (the store threw; a write
 * may have passed), PLAN_NOT_FOUND (the record is gone) and INVALID_STATE (`recordVersion`) for a
 * record this library does not read.
 */
export class TxPlan {
  /** Made by `builder.plan` and `builder.resume` only */
  private constructor() {}

  /** The application's id of the plan, when it was given one */
  get id(): string | undefined {
    return stateOf(this).record.id;
  }

  /** `final`, `stopped`, `stopping`, or `pending` */
  get status(): TxPlanStatus {
    return stateOf(this).record.status;
  }

  /**
   * The steps, in the order they are sent; of a plan made by `replan`, first the steps it holds
   * of the plan before it
   */
  get steps(): readonly TxStep[] {
    return stateOf(this).record.steps.map(viewOf);
  }

  /**
   * The step with this name
   * @throws TxBuildError INVALID_OPTION (`step`) when the plan has no step with the name
   */
  step(name: string): TxStep {
    const step =
      typeof name === "string" ? stepIn(stateOf(this).record, name) : undefined;
    if (step === undefined)
      throw invalidOption(
        "step",
        name,
        `the name of a step of the plan: ${stateOf(this)
          .record.steps.map((each) => JSON.stringify(each.name))
          .join(", ")}`,
      );
    return viewOf(step);
  }

  /**
   * The steps found in a block: `included` and `final`. A step a plan made by `replan` holds of
   * the plan before it is here at once, and out of it after a rollback until a look finds it
   * again
   */
  get landed(): readonly TxStep[] {
    return landedSteps(stateOf(this).record).map(viewOf);
  }

  /**
   * The steps that are not in a block and may still land: neither expired, failed nor orphaned.
   * A step a plan made by `replan` holds of the plan before it is here while a rollback has it
   * out of its block
   */
  get live(): readonly TxStep[] {
    return liveSteps(stateOf(this).record).map(viewOf);
  }

  /**
   * The fees of all its transactions together; the fee of a step it holds of the plan before it
   * is in that plan's `fee` too
   */
  get fee(): bigint {
    return stateOf(this).record.steps.reduce(
      (sum, step) => sum + step.built.fee,
      0n,
    );
  }

  /**
   * The time after which no step that is not in a block can land: the latest end of validity
   * among its transactions, POSIX ms, those it holds of the plan before it among them. Undefined
   * when a transaction of it has none
   */
  get until(): number | undefined {
    return planUntil(stateOf(this).record);
  }

  /** The id of the plan made in place of this one, when that plan has an id */
  get replacedBy(): string | undefined {
    return stateOf(this).record.replacedBy;
  }

  /**
   * The steps that were never found in a block, as `builder.plan` takes them: the parts a step
   * was given, links kept, with its own options. A step that is in a block, or was found in one
   * and rolled back, is not among them, nor is a consolidation step, nor a step a plan made by
   * `replan` holds of the plan before it. A step that had a payer of
   * its own comes back with that payer's change address as its payer, so that it is built on
   * that payer's UTxOs and never on another's; the application may give the payer itself in its
   * place.
   *
   * A step given as a transaction built before comes back as that transaction, a `BuiltTx` on
   * this plan's builder with the witnesses the plan holds, its labels and its change marks, and
   * no payer: the same transaction in another plan cannot pay twice, and a new one comes from
   * its maker.
   *
   * A step whose name a transaction of the plans before this one has, found in a block by a look
   * of this plan, is not among them either. `rest` shows what is left without a look; a new plan
   * for it is `replan`: nothing keeps a plan made with `builder.plan(plan.rest)` apart from this
   * one, and both may pay.
   *
   * A step given built with no end of validity (`NEVER_EXPIRES`) that was never sent may land
   * as long as every input of it is unspent. When another transaction spends one of them it can
   * never land, but the plan cannot tell who spent the input, and keeps it as a step that may
   * land: such a plan is `stopping`, and never `stopped`. Ask the maker for a transaction with
   * an end of validity, or let the plan build the step. A plan made in place of this one
   * (`replan`) holds that transaction too or spends an input of it; otherwise none is made.
   */
  get rest(): PlanSteps {
    const { builder, record } = stateOf(this);
    // No prototype: a name is a member, never an inherited one
    const rest: Record<string, PlanStep> = Object.create(null);
    // What was left of a plan made in place of another is that plan's
    if (record.replacedBy !== undefined) return Object.freeze(rest);
    // A step whose name a transaction of the plans before has, found in a block: paid there
    const paid = new Set(
      (record.before?.open ?? []).flatMap((entry) =>
        entry.seen === undefined ? [] : [entry.step],
      ),
    );
    for (const step of record.steps) {
      if (isLanded(step) || step.seen !== undefined || paid.has(step.name))
        continue;
      const given = stepAsGiven(builder, step);
      if (given !== undefined) rest[step.name] = given;
    }
    return Object.freeze(rest);
  }

  /**
   * The plan as plain JSON data, as it is: `JSON.stringify(plan)` writes it. Without a store it
   * is the only record: save it again after every `add`, since a copy saved before holds no
   * added step, and the same `add` on that copy builds and pays the steps again
   */
  toJSON(): TxPlanJSON {
    return encodePlan(stateOf(this).record);
  }

  /**
   * Signs every step that still needs signatures, in order, with the call's signers, else with
   * the plan's payer when it can sign; each signer is asked once for each step, for the keys
   * that have not signed it yet, and the payer only for those. Every witness is verified against
   * the body it is for, and counts for the key its own public key hashes to. A step with every
   * key is `signed`; a step a signer gives no witness for stays `built`, and `run()` asks again
   * when its turn comes. A signer is waited for no longer than the step's end of validity, by
   * the tip read once before asking.
   *
   * A step given as a transaction built before (`kind: "prebuilt"`) is signed as a step the
   * plan built: the signers are handed its body, for the keys that have not signed it yet. A
   * transaction of another party is read before it is given (its `missing`, `collateral` and
   * `warnings`); a key the application does not want to sign it with is not among the signers.
   * @throws TxPlanError MISSING_SIGNATURES when a step needs keys and nobody can sign;
   *   SIGN_DECLINED, SIGNER_FAILED, with the step in `error.step`: the witnesses already
   *   recorded stay; INVALID_STATE (`stopped`) for a plan that was stopped, a step of which
   *   will not land, or that came to `stopped` once
   * @throws TxBuildError ABORTED; INVALID_OPTION for a signer that cannot sign, and for options
   *   that are not an object or have a member other than these
   */
  sign(options?: SignOptions): Promise<this> {
    return this.#call(async (state) => {
      const opts: SignOptions = optionsObject(
        options,
        SIGN_MEMBERS,
        SIGN_ALLOWED,
        SIGNERS_IN_PLACE,
      );
      const { signal } = opts;
      checkCallOptions({ signal });
      const given = toSigners(opts.signers);
      if (state.record.status === "final") return this;
      this.#refuseStopped(state);
      throwIfAborted(signal, CALL);
      const needing = state.record.steps.filter(needsWitnesses);
      if (needing.length === 0) return this;
      const signers = given ?? (state.signer && [state.signer]);
      if (signers === undefined) throw this.#missingSignatures(needing[0]!);
      const tip = await this.#readTip(state, this.#ask(signal));
      for (const step of needing)
        await this.#signStep(
          state,
          step.name,
          signers,
          tip,
          signal,
          given === undefined,
        );
      return this;
    });
  }

  /**
   * Adds witnesses made elsewhere: witness sets, or full transactions of which only the vkey and
   * bootstrap witnesses are taken. Each witness goes to the step whose body it verifies against,
   * and counts for the key its own public key hashes to; a witness of a step in a block is
   * dropped. Nothing of a call is kept when one of its arguments is refused.
   * @throws TxPlanError INVALID_WITNESS (`undecodable`, `wrongBody`) with the index of the
   *   argument; a witness of no transaction of the plan is `wrongBody`. INVALID_STATE
   *   (`stopped`) as `sign()`
   */
  addWitnesses(...witnesses: string[]): Promise<this> {
    return this.#call(async (state) => {
      if (state.record.status !== "final") this.#refuseStopped(state);
      await Crypto.ready();
      const offered = new Map<string, KeyWitness[]>();
      for (const [argument, value] of witnesses.entries()) {
        let read: KeyWitness[];
        try {
          read = readWitnessArgument(value).witnesses;
        } catch (error) {
          throw this.#error(
            "INVALID_WITNESS",
            `witness argument ${argument} is neither a witness set nor a transaction`,
            { details: { reason: "undecodable", argument }, cause: error },
          );
        }
        for (const witness of read) {
          const step = state.record.steps.find((each) =>
            verifies(witness, each.txHash),
          );
          if (step === undefined)
            throw this.#error(
              "INVALID_WITNESS",
              `witness argument ${argument} holds a signature of key ${witness.keyHash} that is not of the body of any step of the plan`,
              {
                details: {
                  reason: "wrongBody",
                  argument,
                  keyHash: witness.keyHash,
                },
              },
            );
          offered.set(step.name, [...(offered.get(step.name) ?? []), witness]);
        }
      }
      const since = state.storeReads;
      for (const [name, list] of offered)
        await this.#record(state, name, list, since);
      return this;
    });
  }

  /**
   * Adds steps at the end of the plan while it is `pending`: named steps, as `builder.plan`
   * takes them. The call looks at the chain, then builds every step given, in order, each on
   * its payer's UTxOs as the steps before it leave them. No step the plan has changes, and
   * nothing is signed or sent: `run()` takes the added steps in their turn, also a call that is
   * going.
   *
   * ```ts
   * await plan.add({ refund: output({ address: buyer, value: { lovelace: 2_000_000n } }) });
   * await plan.run();
   * ```
   *
   * - A step is paid by its own payer (`{ parts, payer }`), else by the plan's payer, as it was
   *   given to `builder.plan` or `builder.resume`. The data options the plan records apply,
   *   unless the step has its own; `canSelect` and `coinSelection` are given in the step.
   * - A step may be a transaction built before, a `BuiltTx` or its CBOR hex, as in
   *   `builder.plan`: the UTxOs it names come from the plan's steps, its recorded `knownUtxos`
   *   or the provider. The same transaction under its name again is the same step.
   * - A step may link to any step before it. It stands on the last step of its payer, as in
   *   `builder.plan`, unless that step is final. It spends no output a step of the plan spends,
   *   and of a final step it takes what the payer's read shows.
   * - A step whose parts give no end of validity ends at the tip of this call plus the plan's
   *   `ttlMs`; `until` follows.
   * - A step that does not fit a transaction because of the inputs it needs gets consolidation
   *   steps before it, as in `builder.plan`, unless the plan records `consolidate: false`; they
   *   are numbered after the plan's, and counted against its limit with them.
   * - The same call again builds nothing and returns the plan, whatever its status: the steps
   *   are in it. A call whose answer was lost is made again as it is.
   * - ABORTED or STORE_FAILED while the record is written: the steps may be recorded; the same
   *   call again returns the plan when they are.
   * - After `add`, read `plan.status`: the same call again returns the plan also when the plan
   *   stopped meanwhile, and a stopped plan sends nothing.
   * - Without a store the plan's JSON is the only record: a copy saved before an `add` does not
   *   hold the added steps, and the same `add` on it builds and pays them again. Save `toJSON()`
   *   after `add`, or use a store.
   * - A link to an output of a final step, and the transactions of `after` the plan was made
   *   with, are not checked against the chain again: a step that names an output spent since is
   *   refused by the ledger, and a step added while a transaction of `after` is not in a block
   *   may take an input that transaction spends, so that one of the two is refused.
   * - On a plan made by `replan`, no step added may land beside a transaction of the plans before
   *   it that may still land: one of another payer, which shares no input with it, is STILL_LIVE
   *   until that transaction is dead. One that only a step of the plan in a block and not final
   *   keeps from landing (it spends an input that step spends) is waited for, CANNOT_OBSERVE
   *   (`unconfirmed`), until that step is final: after a rollback it could land beside the step
   *   added. Where steps in blocks keep several old transactions from landing, the wait names the
   *   one in a block last. When every other step of the plan is final, or in a block no later than
   *   that one, the plan is final with it and the same call is then INVALID_STATE (`final`): the
   *   message says so, and such a step is paid by a plan after this one (`after`). STILL_LIVE is
   *   told first. A step added to such a plan is the application's to follow, by this plan's id, as
   *   steps given to `replan` are: when the plan it was made in place of becomes final after all,
   *   the added step was not paid, unless it passed by time (`NO_SHARED_INPUT`).
   * @throws TxPlanError INVALID_STATE (`final`) for a final plan, (`stopped`) for a plan that
   *   is stopping or stopped; STILL_LIVE on a plan made by `replan`, as above, nothing added;
   *   CANNOT_OBSERVE (`unconfirmed`, retryable after the builder's `pollMs`) on such a plan for
   *   an old transaction only a step in a block keeps from landing, for a step on an output of
   *   an old transaction the search does not find, for an address that lists such an output,
   *   and for an old transaction past its end and the margin the search gave no answer for,
   *   nothing added;
   *   VERSION_CONFLICT when another writer added other steps meanwhile,
   *   or the store refused four writes of the record (this call's, or that of its look at the
   *   chain): none of this call's steps is recorded, and the same call builds on the plan as it
   *   is;
   *   CANNOT_OBSERVE (`noTip`); INVALID_STATE (`pastHorizon`); STORE_FAILED when the store fails
   *   to read or write the record; PLAN_NOT_FOUND when the record is gone from the store;
   *   INVALID_STATE (`recordVersion`) for a stored record this library does not read;
   *   INVALID_WITNESS (`wrongBody`) of `fromCbor`, for a step given built that holds a signature
   *   that is not of its body
   * @throws TxBuildError INVALID_OPTION (`steps`) for steps that are not named steps, for all
   *   that `builder.plan` refuses of named steps, on a builder that holds parts from `add`, for
   *   more than 32 steps in the plan, for a name the plan has with other parts or options or with
   *   another transaction, for a transaction given built that the plan holds under another name,
   *   that spends an output a step of the plan spends, reads or puts up as a step given built,
   *   or reads or puts up an output a step spends, whose object lists another number of outputs
   *   than its transaction has, or that a record does not hold, for a step that spends what a
   *   step given built reads or puts up, and a link to the change of a step given built with no
   *   output marked change; the errors of `fromCbor` for a step given built, its name first,
   *   INVALID_OPTION (`tx`) before any request for a text no transaction is read from; for
   *   steps only some of which the plan has, and for a step on the change of the step before it
   *   of its payer, in a block, that the payer's read does not list; INVALID_OPTION (`payer`)
   *   for a payer that answered two change addresses in the call; MISSING_PAYER for a step
   *   without a payer when the object does not hold the plan's; NETWORK_MISMATCH for a payer of
   *   another network; WALLET_FAILED; MISSING_FETCHER and PROVIDER_FAILED when the payer's UTxOs
   *   are read through the provider (an address, or a wallet that reads none itself) and there
   *   is none, or the read fails; NOT_SERIALIZABLE on a builder with a store; every error
   *   of building a step, its name at the start of the message; ABORTED; INVALID_OPTION for
   *   options that are not an object or have a member other than `signal`
   */
  add(steps: PlanSteps, options?: Pick<RunOptions, "signal">): Promise<this> {
    return this.#call(async (state) => {
      const opts: Pick<RunOptions, "signal"> = optionsObject(
        options,
        ADD_MEMBERS,
        ADD_ALLOWED,
      );
      const { signal } = opts;
      checkCallOptions({ signal });
      const { builder } = state;
      // The shapes first, with no request and no read of the store
      const read = readAddedSteps(builder, steps);
      await refuseUnread(builder, read);
      if (builder.store !== undefined)
        for (const step of read) encodeParts(step.parts);
      throwIfAborted(signal, CALL);
      const ask = this.#ask(signal);
      await this.#takeStoredIfNewer(state, ask);
      // A repeat is told by names and parts, before anything is looked at or built
      const addressOf = addressBook(builder);
      const given = await abortable(givenSteps(read, addressOf), signal, CALL);
      /**
       * The steps judged against a record: undefined when it has them all, else their links, the
       * limit of steps, and the payer of the steps that name none
       */
      const judge = async (record: PlanRecord) => {
        const held = heldOf(record, given);
        if (held === "same") return undefined;
        if (held !== "new") throw invalidAddedSteps(held.refused);
        checkAddedSteps(
          read,
          record.steps.map((step) => step.name),
        );
        const payer = await abortable(
          payerOfAdded(record, state.payer, read, addressOf),
          signal,
          CALL,
        );
        return { payer };
      };
      if ((await judge(state.record)) === undefined) return this;
      // The statuses are what the chain shows before anything is built on them; a plan made in
      // place of another looks at its whole line
      const seen = await this.#look(
        state,
        ask,
        state.record.before !== undefined,
      );
      // The look may have taken a record another writer extended: the build starts from it, so
      // the steps are judged on it again
      const base = state.record;
      const judged = await judge(base);
      if (judged === undefined) return this;
      const { payer } = judged;
      this.#refuseClosed(base);
      const { tip } = seen;
      if (tip === undefined)
        throw this.#error(
          "CANNOT_OBSERVE",
          "the provider did not give the chain's tip (fetchLatestBlock), which the end of validity of an added step is counted from: nothing was built or added",
          { details: { reason: "noTip" } },
        );
      /** The dead transactions a step passed beside, told once the steps are recorded */
      let told: readonly LineTx[] = [];
      /** The addresses the cap left unread */
      let unread = 0;
      // A plan made in place of another: the transactions of the plans before it that were not
      // found yet, which no step added may land beside, stand on, or find at an address
      const line =
        base.before === undefined
          ? undefined
          : (() => {
              const classes = lineClasses(base, seen.answers, tip);
              const entries = new Set(
                base.before.open.flatMap((entry) =>
                  entry.seen === undefined ? [entry.txHash] : [],
                ),
              );
              this.#refuseNoValidity({
                noValidity: classes.noValidity.filter((tx) =>
                  entries.has(tx.txHash),
                ),
              });
              return [...classes.open, ...classes.unconfirmed].filter((tx) =>
                entries.has(tx.txHash),
              );
            })();
      const newSteps = await buildAddedSteps(builder, base, read, {
        ...(payer !== undefined && { payer }),
        asked: addressOf,
        tip,
        ...(signal !== undefined && { signal }),
        ...(state.trace !== undefined && { trace: state.trace }),
        ...(line !== undefined && {
          withReads: async (reads, standIns) => {
            ({ unread } = await this.#refuseOpenOutputs(
              state,
              base,
              line,
              base.steps.filter((step) => step.status === "final"),
              standIns,
              reads,
              ask,
            ));
          },
        }),
      });
      if (line !== undefined) {
        const final = base.steps.filter((step) => step.status === "final");
        // An old transaction that only a step of the plan in a block keeps from landing is
        // waited for, as `replan` waits for it: the pair is gone once that step is final. The
        // others first
        const apart = heldByTaken(
          landsBeside(newSteps, line, final, base.steps),
          line,
          final,
          base.steps.filter((step) => step.status === "included"),
          newSteps.map((step) => step.built.txHash),
        );
        const dead = this.#judgePairs(
          apart.pairs,
          base,
          tip,
          "nothing was added",
        );
        this.#refuseStandingOnOpen(newSteps, line);
        this.#refuseHeld(apart.held, base);
        told = dead;
      }
      // The event goes only to a record with the steps the build started from
      let shown = base;
      const written = await this.#write(
        state,
        (record) => {
          shown = record;
          if (!sameSteps(record, base))
            return heldOf(record, given) === "same"
              ? { skip: true }
              : {
                  stop: this.#error(
                    "VERSION_CONFLICT",
                    "another writer added steps to the plan while these were built: none of them is recorded, and the same call builds on the plan as it is",
                    {},
                  ),
                };
          return {
            event: { type: "steps", steps: newSteps },
            refused: (refusal) => this.#addRefused(shown, refusal),
          };
        },
        undefined,
        ask,
      );
      if (written === "written")
        this.#tellNoSharedInput(state.trace, told, unread);
      return this;
    });
  }

  /**
   * Drives the plan. It looks at the chain first. Then the first step that is not in a block is
   * signed if it still needs signatures, sent, and waited for; then the next one. A step is sent
   * only when every step before it is in a block. A step that was sent is sent again, the same
   * bytes, every `resendMs` until it is found. The call returns when the plan reached `waitFor`.
   * It can be repeated at any time, by any process that holds the plan: it goes on from what the
   * chain shows.
   *
   * A refusal of the ledger counts only when no delivery of the step may have gone through, a
   * search after it does not find the step, and every step and every transaction of `after` it
   * stands on is found in a block by that search. A refusal that does not count proves nothing:
   * a call that waits goes on waiting and sends the same bytes again; a call with
   * `waitFor: "sent"` throws SUBMIT_FAILED (`refused`) when no delivery of the step may have gone
   * through.
   *
   * A step whose end of validity the tip has passed is not sent: the call waits until the chain
   * shows it in a block or dead. A step sent by another party whose witnesses the plan does not
   * all hold is offered to the call's signers, and waited for. On a plan that does not go on, the
   * call looks at the chain first; a plan with a step that will not land sends again the same
   * bytes of the steps it sent that stand on no such step, then throws, and sends no step for
   * the first time. A plan that came to `stopped` and left it, when a look found a step in a
   * block after all, does the same: it waits for the steps it sent, and throws INVALID_STATE
   * (`stopped`) when the next step is one it never sent.
   *
   * A step given as a transaction built before is signed as a step the plan built, by the
   * call's signers or the payer, and one sent by another party without every witness is offered
   * to the call's signers as any step.
   * @throws TxPlanError with the step in `error.step`. REJECTED when the refusal counts: the step
   *   is `rejected`, and the same call sends the same bytes again. EXPIRED (`unsent` when the plan
   *   never sent it), SCRIPT_FAILED, ORPHANED when a step will not land: the plan does not go on.
   *   SUBMIT_FAILED when the outcome of a delivery is unknown (retryable). CONFIRM_TIMEOUT after
   *   `timeoutMs`, also while a step past its end of validity may still land, and when a request
   *   the call waits for does not answer within the time left: a delivery whose submit did not
   *   answer is recorded, and its outcome is unknown (retryable).
   *   NOT_YET_VALID before a step's lower bound (retryable). MISSING_SIGNATURES,
   *   MISSING_SUBMITTER, SIGN_DECLINED, SIGNER_FAILED: nothing was sent. CANNOT_OBSERVE when the
   *   provider cannot follow the plan. INVALID_STATE (`stopped`) for a plan that was stopped or
   *   replaced, that came to `stopped` and would have to send a step for the first time, or, made
   *   by `replan`, whose look found a transaction of the plans before it in a block, its hash in
   *   `error.txHash`: it sends nothing more, also not bytes it sent before
   * @throws TxBuildError ABORTED; INVALID_OPTION for a wait option out of range, and for options
   *   that are not an object or have a member other than those of `RunOptions`
   */
  run(options?: RunOptions): Promise<this> {
    return this.#call(async (state) => {
      const opts: RunOptions = optionsObject(
        options,
        RUN_MEMBERS,
        RUN_ALLOWED,
        [...SIGNERS_IN_PLACE, SUBMITTER_IN_PLACE],
      );
      const wait = effectiveWait(
        {
          waitFor: opts.waitFor ?? "included",
          ...(opts.timeoutMs !== undefined && { timeoutMs: opts.timeoutMs }),
          ...(opts.pollMs !== undefined && { pollMs: opts.pollMs }),
        },
        state.record.deadlines,
        state.builder.planDefaults,
      );
      checkCallOptions(opts);
      const signers = toSigners(opts.signers);
      const { signal } = opts;
      const started = Date.now();
      const call: Call = {
        wait,
        ...(signers !== undefined && { signers }),
        ...(opts.submitter !== undefined && { submitter: opts.submitter }),
        ...(signal !== undefined && { signal }),
        started,
        from: started,
      };
      const ask = this.#ask(signal, call);
      await this.#takeStoredIfNewer(state, ask);
      if (state.record.status === "final") return this;
      throwIfAborted(signal, CALL);
      const seen = await this.#look(state, ask);
      this.#refuseUnobservable(seen);
      await this.#drive(state, call);
      return this;
    });
  }

  /**
   * One look at the chain: a search for each step that is not final, also one called dead, and
   * for a transaction one of the inputs of each step not in a block comes from, then the tip; on
   * a plan made by `replan`, also each transaction of the plans before it not found yet. A step
   * the plan never sent that stands on a step not in a block is not searched for. It records
   * what they show, sends nothing, and throws nothing for what it sees. A step called dead that
   * is found in a block is included, and the plan's status follows; a transaction of the plans
   * before that is found in a block stops the plan. On a final plan it returns at once, without
   * a request.
   */
  refresh(): Promise<this> {
    return this.#call(async (state) => {
      await this.#takeStoredIfNewer(state);
      await this.#look(state, this.#ask(undefined));
      return this;
    });
  }

  /**
   * Records the decision that the plan signs and sends nothing more. Steps that were sent, or
   * signed, may still land: the plan is `stopping` until none of them can, then `stopped`. A
   * step given built with no end of validity (`NEVER_EXPIRES`) that is not in a block may land
   * for as long as the plan can see, also when an input of it was spent elsewhere: such a plan
   * stays `stopping` and is never `stopped` (see `rest`). On a plan that is `final` or `stopped`
   * it does nothing
   */
  stop(): Promise<this> {
    return this.#call(async (state) => {
      await this.#write(state, (record) =>
        isTerminal(record)
          ? { skip: true }
          : {
              event: { type: "stop" },
              refused: (refusal) => this.#refused(refusal),
            },
      );
      return this;
    });
  }

  /**
   * A new plan in place of this one, for what is left of it. Without `steps` it builds the steps
   * its look shows open, as `rest` gives a step, and refuses a plan with a failed step; with
   * `steps`, those: one list of parts or named steps, as `builder.plan` takes them. The other
   * options are those of `builder.plan`; where the call gives none, the payer this object holds and
   * the deadlines and data options this plan records apply. `id` is the new plan's id. A plan made
   * with `steps` that pay what this plan was not to pay is followed by its own id: when this plan
   * becomes final after all, that payment was not made, unless a step of it passed by time
   * (`NO_SHARED_INPUT`). A step given that pays what a step of this plan or a plan before it was to
   * pay keeps that step's name: once that step is final after all, the name is kept and nothing is
   * built again under it; under a new name a later `replan` without `steps` builds it again, and
   * pays twice.
   *
   * ```ts
   * const next = await plan.replan({ id: "order-7:2" });
   * await next.run();
   * ```
   *
   * - The call looks at the chain first. A step that is final, of this plan or of the plans
   *   before it, is never built again, and a link to one of this plan's is filled in with its
   *   output. A step of this plan that the look finds in a block, not final, becomes a step of
   *   the new plan: the same transaction under its name, with the witnesses and the block this
   *   plan records, marked `taken` in the record. The new plan looks for it, sends its bytes
   *   again after a rollback, and is final only once it is; a link may name it, and its name is
   *   not given again. A step built need not stand on it: one of its payer spends its change,
   *   while one of another payer, or one given built that spends no output of it, is built and
   *   recorded at once. A new plan stopped by a look that found a transaction of the plans
   *   before it sends nothing more, also not such a step that a rollback took out of its block:
   *   it comes back only if the network lands it again, and otherwise `replan` of the stopped
   *   plan builds it again. The call does not wait for final: after a rollback that is not
   *   undone a step built that stands on it cannot land, and one that does not may have landed.
   *   The new plan then stops and is never final, and `replan` of it builds what is left again:
   *   a step that landed is never built again, and a step whose end of validity came from `ttlMs`
   *   gets a new end. To wait as before, call once every step in `landed` is final.
   * - Without `steps`, a plan with a step that failed its script is refused: its parts need fixing,
   *   and the steps left without it would end the order with that payment not made. A step left
   *   whose own end of validity has passed (its parts give one, or it was given built) is refused:
   *   built again it could not land. So is a step given built that spends, reads or puts up an
   *   output of a step the new plan does not hold as the same transaction (one built again from its
   *   parts, a consolidation step): that output never exists in the new plan. Both are told once
   *   the payers' reads are checked: a read that lists an output of a step the search does not find
   *   (the step left, or the step below it) is waited for first. A step past its own end may be in
   *   a block the search does not show, or be sent by another party, whatever this plan holds of
   *   its witnesses: another party may hold a copy it signed. The call waits (CANNOT_OBSERVE,
   *   `unconfirmed`) until its end and the margin have passed by the tip and the clock, or the look
   *   calls it expired, and then refuses it. The application gives the steps of the new plan.
   * - What the new plan cannot hold is waited for, CANNOT_OBSERVE (`unconfirmed`): a
   *   transaction in a block with a failed script, and a transaction of a plan before this one
   *   that a look found in a block, each until it is final; a step in a block this call's
   *   search gave no answer for; a step built that cannot stand on the step before it of its
   *   payer when that step is in a block (the payer's read does not list its change, or
   *   `canSelect` refuses it), and an old transaction that only a step in a block keeps from
   *   landing beside a step built that does not stand on that step, each until that step is
   *   final; a plan whose every step is final or in a block, which has nothing left to pay,
   *   until it is final (then INVALID_STATE, `final`): to pay more, `add` steps to it while it
   *   is pending, or make a plan after it (`after`). One that is not takes no step: a stopped
   *   one (by `stop()`, a mark, or a look that found a transaction of the plans before it)
   *   sends nothing more, and one that came to stopped by its steps once sends no step it never
   *   sent; once a rollback leaves a step of it open the same call makes the plan in its place.
   *   An address that lists an output of a transaction of those plans the search does not find
   *   refuses the call the same way.
   * - Every other transaction of those plans is one the new plan must not land beside. The first
   *   step built for a payer spends an input of each that may still land and stands on no other,
   *   also of one called dead, that the payer still holds: the ledger then takes one of the two and
   *   never both, whatever a provider shows. Where no input is shared, a transaction that may still
   *   land refuses the call (STILL_LIVE): when time does not settle it, the message names steps
   *   that hold that transaction or spend an input of it, under the names of the steps they pay
   *   for. When each such one was found in a block once, the search does not find it now, and its
   *   end of validity has passed (a step on it too, `orphaned`), the message says what is known: a
   *   rollback took it out, or the provider lost it while it stayed in its block; no step this call
   *   builds by default is kept apart from it, and the application decides how to pay what is left.
   *   A plan of its own is kept apart from nothing the library knows: it is safe once more than `k`
   *   blocks (the security parameter) are on the chain after those ends, unless the provider lost
   *   them. One kept without its end (`seenBefore`), or one an address of which the cap of reads
   *   left unread, gets the message of any pair. One this call's look answered it did not find,
   *   past its end of validity, which no look ever found, is left to its end and the provider's
   *   search, and `trace` is told (`NO_SHARED_INPUT`) once the new plan is recorded: a search that
   *   hid it, or a switch of the network to a fork deeper than the margin and less deep than final
   *   where it landed in time, makes the new plan pay twice. A search that fails is no answer: the
   *   transaction may still land.
   * - This plan is marked before the new one is recorded: `replacedBy` names it, and this plan
   *   signs and sends nothing more. A plan is replaced once. The same call again, with the id
   *   `replacedBy` names, returns the plan made in its place and makes nothing: with a store the
   *   recorded one, also when this plan came to final since; without a store the one this
   *   object made, and an object that does not hold it (one resumed from a JSON) is refused.
   *   Calls on one object never overlap: one that finds another going waits for it, then
   *   answers as a call made after it; so a call is never awaited from inside a callback this
   *   plan calls (a store's `load` or `save`, a provider, a signer), where it would wait for the
   *   call that called it. Without a store save both JSONs, this plan's with its mark and the
   *   new plan's, after the call and before `run()`.
   *   Without a store a copy of this plan's JSON saved before the call does not know it was
   *   replaced, and a plan made in its place again can pay again: save the JSON after the call,
   *   or use a store. The id is the new plan's alone: after a crash that followed the mark, a
   *   plan of another order under it ends this line. A repeat compares the steps given, not the
   *   other options: with other options it returns the plan recorded with the first ones. The
   *   deadlines given are the new plan's, also for the steps it holds of this plan, and carry on
   *   to a plan made in its place. The new plan stops when a look of it finds one of those
   *   transactions in a block.
   * - The addresses a transaction called dead pays, or one found in a block once that the look
   *   calls expired, at most 16 in a call, are read past the builder's cache: first those of one
   *   that may pass by time beside a step built, then those of one found in a block once, then the
   *   rest. A provider's own cache of address reads is not under the library's control, and a list
   *   it gives counts as its answer.
   * @throws TxPlanError STILL_LIVE (retryable with `details.safeAfter`; without it, of old steps
   *   found in a block once that the search does not find past their ends, its message says so);
   *   CANNOT_OBSERVE (`unconfirmed`, retryable after the builder's `pollMs`; `noTip`; `noValidity`,
   *   not retryable, for a transaction that runs a Plutus script found by a provider that does not
   *   say whether its scripts passed; `noSearch`, `noDepth` from probing the provider);
   *   INVALID_STATE (`final`) for a final plan, also one that came to final while the new plan
   *   was built, (`stopped`) for a plan replaced by a plan of another id, or by one this object
   *   does not hold and no store can tell of, (`pastHorizon`), (`recordVersion`) for a stored
   *   record this library does not read; MISSING_ID; PLAN_EXISTS for an id the store holds
   *   otherwise; PLAN_NOT_FOUND when the record is gone from the store; VERSION_CONFLICT;
   *   STORE_FAILED
   * @throws TxBuildError INVALID_OPTION for options that are not an object or have a member other
   *   than those of `builder.plan` and `steps`, (`id`) for an id that is not a string or is this
   *   plan's, (`payer`) for a payer of no known form or one that answered two change addresses,
   *   (`trace`) for a trace that is not a function, (`signal`), (`steps`) when nothing is left and
   *   no step is given, for a step that failed its script when no step is given, for a step left
   *   whose own end of validity has passed, once the margin has passed too, or that was given built
   *   and stands on a step the new plan does not hold, when no step is given, for a name that is
   *   final in this plan or a plan before it or in a block in this plan, for more than 32 steps
   *   with those in a block, for a link to a step that is neither given, in a block nor final, and
   *   for all that `builder.plan` refuses, (`after`) for a transaction of these plans that is not
   *   final; MISSING_PAYER; NETWORK_MISMATCH for a payer of another network or a recorded plan of
   *   another; WALLET_FAILED; MISSING_FETCHER and PROVIDER_FAILED for a read of a payer or of an
   *   address that fails; NOT_SERIALIZABLE; every error of building a step; ABORTED
   */
  replan(
    options: PlanOptions & { id: string; steps?: StepParts | PlanSteps },
  ): Promise<TxPlan> {
    return this.#call(async (state) => {
      const { signal } = optionsObject(
        options,
        REPLAN_MEMBERS,
        REPLAN_ALLOWED,
      ) as { signal?: unknown };
      checkCallOptions({ signal });
      // One call at a time on an object: a call that finds another going waits for it before it
      // reads or builds anything, then answers as a call made after it
      while (state.replanning !== undefined)
        await abortable(
          state.replanning.then(
            () => undefined,
            () => undefined,
          ),
          signal as AbortSignal | undefined,
          CALL,
        );
      const mine = this.#replanOnce(state, options);
      state.replanning = mine;
      try {
        return await mine;
      } finally {
        if (state.replanning === mine) state.replanning = undefined;
      }
    });
  }

  /** One call of `replan`, with no other going on the object */
  async #replanOnce(
    state: PlanState,
    options: PlanOptions & { id: string; steps?: StepParts | PlanSteps },
  ): Promise<TxPlan> {
    const opts: PlanOptions & { steps?: unknown } = optionsObject(
      options,
      REPLAN_MEMBERS,
      REPLAN_ALLOWED,
    );
    const { signal, id } = opts;
    checkCallOptions({ signal });
    if (id === undefined || id === "")
      throw this.#error(
        "MISSING_ID",
        "a plan made in place of another needs an id of its own, a non-empty string: the plan it replaces records it, and so is replaced once",
        {},
      );
    if (typeof id !== "string" || id === state.record.id)
      throw invalidOption("id", id, REPLAN_ID_ALLOWED);
    const { builder } = state;
    // The shapes first, with no request and no read of the store
    if (opts.payer !== undefined) toPayerSource(opts.payer);
    if (opts.trace !== undefined && typeof opts.trace !== "function")
      throw invalidOption("trace", opts.trace, "a function");
    const { steps, after, ...rest } = opts;
    const callOptions: MakePlanOptions = {
      ...rest,
      ...(after !== undefined && { after: afterOf(after) }),
    };
    // A transaction of after too large to read is refused before any request
    checkAfterSize(callOptions.after, afterBound(builder.params));
    const own =
      steps === undefined
        ? undefined
        : readReplanSteps(builder, steps, callOptions, true);
    if (builder.store !== undefined)
      for (const step of own ?? []) encodeParts(step.parts);
    const live: LiveObjects = {
      ...((opts.payer ?? state.payer) !== undefined && {
        payer: (opts.payer ?? state.payer)!,
      }),
      ...((opts.trace ?? state.trace) !== undefined && {
        trace: (opts.trace ?? state.trace)!,
      }),
    };
    throwIfAborted(signal, CALL);
    const ask = this.#ask(signal);
    await this.#takeStoredIfNewer(state, ask);
    this.#refuseOtherName(state.record, id);
    const addressOf = addressBook(builder);

    // The same call again: the plan made in place of this one, with nothing looked at, read
    // or built; also when this plan came to final since. Without a store only the object that
    // made it holds it
    if (state.store === undefined && state.record.replacedBy === id) {
      if (state.made !== undefined) return state.made;
      throw this.#error(
        "INVALID_STATE",
        `the plan was replaced by ${JSON.stringify(id)}, which this object does not hold, and no store can say whether it exists: it is resumed from its own JSON, and nothing is made in its place again`,
        { details: { reason: "stopped" } },
      );
    }
    if (state.store !== undefined) {
      const stored = await ask(loadRecord(state.store, id), "read");
      if (stored !== undefined) {
        const repeat = await this.#sameReplan(
          state,
          stored,
          id,
          own,
          addressOf,
          signal,
        );
        return objectOver(builder, repeat, live, "owed");
      }
    }
    this.#refuseReplaced(state.record, id);

    // One look at the whole line
    const seen = await this.#look(state, ask, true);
    this.#refuseUnobservable(seen);
    const { tip } = seen;
    if (tip === undefined)
      throw this.#error(
        "CANNOT_OBSERVE",
        "the provider did not give the chain's tip (fetchLatestBlock), which a new plan is judged and built by: nothing was built or written",
        { details: { reason: "noTip" } },
      );
    const base = state.record;
    this.#refuseReplaced(base, id);
    const classes = lineClasses(base, seen.answers, tip);
    this.#refuseNoValidity(classes);
    // What the new plan cannot hold is waited for
    const { unconfirmed } = classes;
    if (unconfirmed.length > 0)
      throw this.#unconfirmed(
        `${unconfirmed.map((tx) => `step ${JSON.stringify(tx.step)} (${tx.txHash})`).join(", ")} ${unconfirmed.length === 1 ? "is" : "are"} in a block and not final, or found where its block or the outcome of its scripts is not known, and the new plan cannot hold it: a transaction with a failed script, a transaction of a plan before this one, or a step this look did not find in a block`,
        unconfirmed[0]!.txHash,
      );
    // The steps this look found in a block, not final: the new plan holds them as they are
    const takenHashes = new Set(classes.taken.map((tx) => tx.txHash));
    const taken = base.steps.filter((step) =>
      takenHashes.has(step.txHash.toLowerCase()),
    );
    const takenNames = taken.map((step) => step.name);
    // A taken step stands on nothing the search does not find in a block
    const below = standingOn(taken, classes.open);
    if (below !== undefined)
      throw this.#unconfirmed(
        `step ${JSON.stringify(below.step.name)} (${below.step.txHash}) is in a block and spends, reads or puts up an output of step ${JSON.stringify(below.below.step)} (${below.below.txHash}), which the search does not find in a block`,
        below.below.txHash,
      );

    // A plan whose every step is final or in a block has nothing left to pay: it is not stuck,
    // sends its steps again after a rollback, and becomes final by itself
    if (
      taken.length > 0 &&
      base.steps.every(
        (step) => step.status === "final" || takenNames.includes(step.name),
      )
    )
      throw this.#unconfirmed(
        // `add` takes steps only on a pending plan that is not marked
        base.status === "pending" && base.replacedBy === undefined
          ? "every step of the plan is in a block, and none is left for a plan in its place: the plan becomes final by itself, and sends its steps again after a rollback; to pay more, add steps to it while it is pending, or make a plan after it"
          : "every step of the plan is in a block, and none is left for a plan in its place: the plan does not go on, takes no more steps and sends no step it never sent; once its steps are final it is final, and after a rollback that leaves a step open the same call makes the plan in its place",
        taken[0]!.txHash,
      );

    // The steps: those given, else what the look shows open; none of a kept or a taken name
    const keptNames = keptNamesOf(base, classes);
    let read: StepInput[];
    /** The steps left whose own end of validity has passed, told late */
    let late: StepRecord[] = [];
    /** A step given built left on a step the new plan does not hold as it is, told late */
    let unheld: { readonly step: string; readonly below: string } | undefined;
    if (own === undefined) {
      // A step that failed its script paid nobody, and built again from the same parts it fails
      // again: the steps left without it would close the order with that payment not made
      const failed = base.steps.find(
        (step) => step.status === "failed" && !keptNames.has(step.name),
      );
      if (failed !== undefined)
        throw stepsRefused(
          `step ${JSON.stringify(failed.name)} failed its script: its parts need fixing; give the steps of the new plan`,
        );
      // No prototype: `in` sees the steps left alone, never an inherited name
      const left: Record<string, PlanStep> = Object.create(null);
      for (const step of leftOf(base, classes)) {
        const given = stepAsGiven(builder, step);
        if (given !== undefined) left[step.name] = given;
      }
      if (Object.keys(left).length === 0)
        throw stepsRefused(
          "nothing of the plan is left to build: every step is final, in a block or a consolidation step; give the steps of the new plan",
        );
      // A step whose own end of validity the tip has reached could only be built dead: built
      // now, its transaction lands in a block after the tip or in none. Refused once the payers'
      // reads are checked, and once this look calls it expired: a read that lists an output of
      // a step the search does not find tells that the step may have landed, and so may one
      // that is not past the margin
      late = leftOf(base, classes).filter(
        (step) =>
          step.name in left &&
          ownEndOf(step) &&
          (stepUntil(step) ?? Infinity) <= tip.timeMs,
      );
      // A step given built that stands on a step the new plan does not hold as the same
      // transaction could only be held dead: the output it spends, reads or puts up never exists
      // in the new plan. Refused once the payers' reads are checked: a read that lists an output
      // of the step below, which the search does not find, tells that it may still land
      unheld = blockedPrebuilt(base, left, takenNames);
      read = readReplanSteps(builder, left, callOptions, false);
    } else {
      const final = own.filter((step) => keptNames.has(step.name));
      if (final.length > 0)
        throw stepsRefused(
          `the step(s) ${final.map((step) => JSON.stringify(step.name)).join(", ")} are final in this plan or a plan before it: a final step is never built again`,
        );
      const held = own.filter((step) => takenNames.includes(step.name));
      if (held.length > 0)
        throw stepsRefused(
          `the step(s) ${held.map((step) => JSON.stringify(step.name)).join(", ")} are in a block in this plan: the new plan holds them as they are, and a name names one step`,
        );
      read = own;
    }
    if (taken.length + read.length > MAX_STEPS)
      throw stepsRefused(
        `a plan has at most ${MAX_STEPS} steps: the new plan holds ${taken.length} of this plan that are in a block, and ${read.length} are to be built`,
      );
    const keptSteps = base.steps.filter((step) => step.status === "final");
    read = fillKeptLinks(read, keptSteps, takenNames);
    if (
      openAmong(readAfter(callOptions.after, afterBound(builder.params)), [
        ...classes.open,
        ...classes.taken,
      ]) !== undefined
    )
      throw invalidOption(
        "after",
        after,
        "transactions that are no transaction of this plan or the plans before it that is not final: the new plan holds those in a block as its own steps, and stands on no other",
      );
    const payer =
      opts.payer ??
      (await abortable(
        payerOfAdded(base, state.payer, read, addressOf),
        signal,
        CALL,
      ));

    // The payers read now, past the cache; the steps built on them with the guards of the
    // transactions that may still land
    const settledOnes = new Set(settled(classes.open, classes.kept));
    this.#clearVolatile(state);
    /** The addresses the cap left unread */
    let unread = 0;
    /** An address a gone transaction pays went unread */
    let goneUnread = false;
    const made = await buildReplan(builder, base, read, {
      id,
      options: callOptions,
      ...(payer !== undefined && { payer }),
      asked: addressOf,
      tip,
      open: classes.open.filter((tx) => !settledOnes.has(tx)),
      withReads: async (reads, standIns) => {
        ({ unread, goneUnread } = await this.#refuseOpenOutputs(
          state,
          base,
          classes.open,
          classes.kept,
          standIns,
          reads,
          ask,
        ));
        // One that this look does not call expired (its end and the margin passed, and the
        // search answered "not found") may be in a block the search does not show, whatever the
        // plan holds of its witnesses: another party may hold a copy it signed, and have sent
        // it. Waited for until its end and the margin have passed by the tip and the clock, so
        // that no wait lasts for ever. An orphaned one stands on a step that will not land, and
        // lands with it or never
        const hidden = late.find(
          (step) =>
            step.status !== "orphaned" &&
            !pastMarginAt(
              stepUntil(step),
              base.deadlines.expiryMarginMs,
              tip,
            ) &&
            !expiredByLook(classes, step.txHash),
        );
        if (hidden !== undefined)
          throw this.#unconfirmed(
            `step ${JSON.stringify(hidden.name)} is past its end of validity and may be in a block the search does not show, or be sent by another party before its margin passes`,
            hidden.txHash,
          );
        const first = late[0];
        if (first !== undefined)
          throw stepsRefused(
            first.kind === "prebuilt"
              ? `step ${JSON.stringify(first.name)} was given built and its end of validity has passed: the same transaction cannot land; give the steps of the new plan`
              : `step ${JSON.stringify(first.name)} cannot be built again as it was given: its parts give an end of validity, and the chain's tip has passed it, so the transaction could not land; give the steps of the new plan`,
          );
        if (unheld !== undefined)
          throw stepsRefused(
            `step ${JSON.stringify(unheld.step)} was given built and spends, reads or puts up an output of step ${JSON.stringify(unheld.below)}, which the new plan does not hold as the same transaction: the transaction given built could not land in the new plan; give the steps of the new plan`,
          );
      },
      keep: (steps) =>
        beforeOf(base, classes, [
          ...taken.map((step) => step.txHash),
          ...steps.map((step) => step.built.txHash),
        ]),
      taken,
      cannotStand: (step, on, why) =>
        this.#unconfirmed(
          `step ${JSON.stringify(step)} cannot stand on step ${JSON.stringify(on.name)} (${on.txHash}), which is in a block and not final: ${why}; the call passes once that step is final, or with steps that spend an output of it`,
          on.txHash,
        ),
    });

    // Every pair of a step built and an open transaction, judged on the bodies; the taken steps
    // are steps of the new plan the steps built may stand on
    const pairs = landsBeside(made.steps, classes.open, classes.kept, taken);
    // A transaction that only a taken step keeps from landing beside a step built is no case of
    // time or of a shared input: the pair is gone once that step is final. The others first
    const apart = heldByTaken(
      pairs,
      classes.open,
      classes.kept,
      taken,
      made.steps.map((step) => step.built.txHash),
    );
    this.#refuseGone(apart.pairs, goneUnread);
    const dead = this.#judgePairs(
      apart.pairs,
      base,
      tip,
      "nothing was written",
    );
    this.#refuseStandingOnOpen(made.steps, classes.open);
    this.#refuseHeld(apart.held);

    // The provider, as for any new plan; then the mark; then the new record
    const probed = await probeProvider(
      state.observer,
      made.record,
      ask,
      (problem) =>
        this.#error("CANNOT_OBSERVE", problem.message, {
          details: { reason: problem.reason },
        }),
    );
    await this.#mark(state, base, id, ask);
    if (state.store === undefined) {
      // Held, so that the same call again returns it and builds nothing
      state.made = objectOver(
        builder,
        made.record,
        live,
        probed ? "done" : "owed",
      );
      this.#tellNoSharedInput(live.trace, dead, unread);
      return state.made;
    }
    return this.#recordReplan(
      state,
      made.record,
      id,
      own,
      addressOf,
      live,
      probed,
      ask,
      dead,
      unread,
    );
  }

  /* -------------------------------------------------------------------------------------------
   * Replacing
   * ----------------------------------------------------------------------------------------- */

  /**
   * INVALID_STATE (`stopped`) for a plan replaced by a plan of another id, (`final`) for a final
   * plan
   */
  #refuseReplaced(record: PlanRecord, id: string) {
    this.#refuseOtherName(record, id);
    if (record.status === "final")
      throw this.#error(
        "INVALID_STATE",
        "the plan is final: every step of it is final, and nothing is made in its place",
        { details: { reason: "final" } },
      );
  }

  /**
   * CANNOT_OBSERVE (`noValidity`) for a transaction of the line that runs a Plutus script, found
   * in a block by a search that does not say whether its scripts passed
   */
  #refuseNoValidity(classes: Pick<LineClasses, "noValidity">) {
    const found = classes.noValidity[0];
    if (found !== undefined)
      throw this.#error(
        "CANNOT_OBSERVE",
        `step ${JSON.stringify(found.step)} (${found.txHash}) of the plans before runs a Plutus script and was found in a block, and the provider does not report whether its scripts passed (validContract): it never will; use a provider that does`,
        { details: { reason: "noValidity" }, txHash: found.txHash },
      );
  }

  /**
   * CANNOT_OBSERVE (`unconfirmed`) for a step built that spends, reads or puts up an output of
   * an open transaction of the line whose hash no step built has: the search does not find it
   * in a block, and a plan stands on nothing it does not find there. A used-up transaction is in
   * a block for good, its collateral return with it; a taken step is no open transaction
   */
  #refuseStandingOnOpen(
    steps: readonly { readonly name: string; readonly built: BuiltTxData }[],
    open: readonly LineTx[],
  ) {
    const found = standingOn(steps, open);
    if (found !== undefined)
      throw this.#unconfirmed(
        `step ${JSON.stringify(found.step.name)} spends, reads or puts up an output of step ${JSON.stringify(found.below.step)} (${found.below.txHash}) of the plans before, which the search does not find in a block: a plan stands on nothing the search does not find in a block`,
        found.below.txHash,
      );
  }

  /**
   * CANNOT_OBSERVE (`unconfirmed`) for an old transaction that only a step in a block and not
   * final keeps from landing beside a step built, with that step's hash: once it is final the
   * old transaction is settled, and the same call passes. Of `add` (`plan`, the plan the steps
   * are added to), when every other step of the plan is final, or in a block no later than that
   * step's, the plan is final with that step and takes no step: the message says so
   */
  #refuseHeld(
    held:
      | {
          readonly step: { readonly name: string };
          readonly open: LineTx;
          readonly taken: LineTx;
        }
      | undefined,
    plan?: PlanRecord,
  ) {
    if (held === undefined) return;
    const { slot } = held.taken.seen ?? {};
    const last =
      plan !== undefined &&
      slot !== undefined &&
      plan.steps.every(
        (step) =>
          step.status === "final" ||
          step.txHash.toLowerCase() === held.taken.txHash ||
          (step.status === "included" &&
            step.seen !== undefined &&
            step.seen.slot <= slot),
      );
    throw this.#unconfirmed(
      `step ${JSON.stringify(held.step.name)} could land beside step ${JSON.stringify(held.open.step)} (${held.open.txHash}) of the plans before, which only step ${JSON.stringify(held.taken.step)} (${held.taken.txHash}), in a block and not final, keeps from landing: ${
        last
          ? "once that step is final the plan is final and takes no step: pay it by a plan after this one (after)"
          : "the call passes once that step is final"
      }`,
      held.taken.txHash,
    );
  }

  /** INVALID_STATE (`stopped`) for a plan replaced by a plan of another id */
  #refuseOtherName(record: PlanRecord, id: string) {
    if (record.replacedBy !== undefined && record.replacedBy !== id)
      throw this.#error(
        "INVALID_STATE",
        `the plan was replaced by ${JSON.stringify(record.replacedBy)}: a plan is replaced once, and the plan made in its place is the one to replan`,
        { details: { reason: "stopped" } },
      );
  }

  /**
   * CANNOT_OBSERVE (`unconfirmed`): nothing was written, and the same call later tells; retry
   * after the builder's `pollMs`
   */
  #unconfirmed(why: string, txHash?: string) {
    const { builder, record } = stateOf(this);
    return this.#error(
      "CANNOT_OBSERVE",
      `${why}; nothing was written, and the same call later tells`,
      {
        details: { reason: "unconfirmed" },
        retryAfterMs: effectiveWait({}, record.deadlines, builder.planDefaults)
          .pollMs,
        ...(txHash !== undefined && { txHash }),
      },
    );
  }

  /**
   * Tells `trace` of each dead transaction a step passed beside (`NO_SHARED_INPUT`): only by a
   * call whose steps were recorded
   */
  #tellNoSharedInput(
    trace: ((event: BuildEvent) => void) | undefined,
    dead: readonly LineTx[],
    unread: number,
  ) {
    for (const tx of dead)
      emit(trace, {
        type: "warning",
        code: "NO_SHARED_INPUT",
        step: tx.step,
        txHash: tx.txHash,
        ...(unread > 0 && { unread }),
      });
  }

  /**
   * The plan recorded under `id` when it is the plan made in place of this one by the same call:
   * it names this plan in `replaces`, this plan names it, and the steps given, when given, are
   * those it was made with. The steps are compared as the call that made the stored plan filled
   * them, by that plan's own record: a link to a name it keeps in `before.final` is filled with
   * that step's output, a link to a step it holds as taken or to a step given before stays a
   * link; a link to any other name is none that call could have recorded
   * @param own The steps as this call gave them, their links as given
   * @param path Where the call is: at its start, before anything was looked at, or after the
   *   store refused the first record this call built
   * @throws TxPlanError PLAN_EXISTS for any other record; TxBuildError NETWORK_MISMATCH
   */
  async #sameReplan(
    state: PlanState,
    stored: PlanRecord,
    id: string,
    own: readonly StepInput[] | undefined,
    addressOf: AddressOf,
    signal: AbortSignal | undefined,
    path: "start" | "refused" = "start",
  ): Promise<PlanRecord> {
    const exists = () =>
      this.#error(
        "PLAN_EXISTS",
        `the store holds the plan ${id}, and not as the plan made in place of this one with the steps given: ${
          path === "start"
            ? "nothing was looked at, built or written"
            : "the steps this call built were not recorded, and none was signed or sent"
        }`,
        {},
      );
    if (
      state.record.id === undefined ||
      stored.replaces !== state.record.id ||
      state.record.replacedBy !== id
    )
      throw exists();
    checkRecordNetwork(state.builder, stored);
    if (own !== undefined) {
      const kept = stored.before?.final ?? [];
      const held = stored.steps.flatMap((step) =>
        step.taken === true ? [step.name] : [],
      );
      // Each link names a step given before its own, a step the stored plan holds as taken, or a
      // step of this plan whose name it keeps as final; any other it could not have recorded
      own.forEach((step, index) => {
        for (const part of step.parts) {
          if (!isLinkedPart(part)) continue;
          const named = part.link.step;
          if (
            own.slice(0, index).some((each) => each.name === named) ||
            held.includes(named)
          )
            continue;
          if (
            kept.includes(named) &&
            state.record.steps.some((each) => each.name === named)
          )
            continue;
          throw exists();
        }
      });
      let filled: StepInput[];
      try {
        filled = fillKeptLinks(
          own,
          state.record.steps.filter(
            (step) => kept.includes(step.name) && !held.includes(step.name),
          ),
          held,
        );
      } catch (error) {
        // A link the stored plan's call could not have filled: not that call
        if (
          TxBuildError.is(error, "INVALID_OPTION") ||
          TxBuildError.is(error, "UNKNOWN_LABEL") ||
          error instanceof TxPartError
        )
          throw exists();
        throw error;
      }
      const given = await abortable(
        givenSteps(filled, addressOf),
        signal,
        CALL,
      );
      if (!stepsOfOrder(stored, given)) throw exists();
    }
    return stored;
  }

  /**
   * The first record of the plan made in place of this one, written over no record. A record
   * the store holds under its id already is the plan of the same call, or PLAN_EXISTS
   */
  async #recordReplan(
    state: PlanState,
    record: PlanRecord,
    id: string,
    own: readonly StepInput[] | undefined,
    addressOf: AddressOf,
    live: LiveObjects,
    probed: boolean,
    ask: Ask,
    dead: readonly LineTx[],
    unread: number,
  ): Promise<TxPlan> {
    const store = state.store!;
    const json = encodePlan(record) as unknown as StoredTxPlanJSON;
    const saving = (async () => {
      try {
        return (await store.save(json, 0)) === true;
      } catch (error) {
        throw this.#error(
          "STORE_FAILED",
          `the store failed to write the first record of the plan ${id}, and the write may have passed: this plan names it, and the same call finds out`,
          { cause: error },
        );
      }
    })();
    if (await ask(saving, "write")) {
      const plan = objectOver(
        state.builder,
        record,
        live,
        probed ? "done" : "owed",
      );
      this.#tellNoSharedInput(live.trace, dead, unread);
      return plan;
    }
    const stored = await ask(loadRecord(store, id), "read");
    if (stored === undefined)
      throw this.#error(
        "VERSION_CONFLICT",
        `the store refused the first record of the plan ${id} and holds none: nothing of it was signed or sent, and the same call builds it again`,
        {},
      );
    const repeat = await this.#sameReplan(
      state,
      stored,
      id,
      own,
      addressOf,
      undefined,
      "refused",
    );
    return objectOver(state.builder, repeat, live, "owed");
  }

  /**
   * The mark on this plan: `replacedBy` is `id`, by compare-and-set over the record the build
   * started from. Refused when it names another plan, or when the record moved under the build:
   * steps added, a step found in a block, a transaction of the plans before found, or a step that
   * was in a block in it and is in none now, as another object saw a rollback. The record is read
   * from the store first, so that these are asked also when the mark is written already
   * @throws TxPlanError INVALID_STATE (`stopped`, `final`); CANNOT_OBSERVE (`unconfirmed`);
   *   VERSION_CONFLICT; STORE_FAILED
   */
  async #mark(state: PlanState, base: PlanRecord, id: string, ask: Ask) {
    const inBlock = (step: StepRecord | undefined) =>
      step !== undefined && (isLanded(step) || step.status === "failed");
    const seenIn = (record: PlanRecord) =>
      new Set(
        (record.before?.open ?? []).flatMap((entry) =>
          entry.seen === undefined ? [] : [entry.txHash],
        ),
      );
    const moved = () =>
      this.#unconfirmed(
        "the plan's record moved while the new plan was built: a step was added, a look found one of its transactions in a block, or a step that was in a block is in none now",
      );
    // The record as the store holds it now: a mark written already is no reason to skip the
    // checks, and another object may have seen a step leave its block since this call looked
    await this.#takeStoredIfNewer(state, ask);
    await this.#write(
      state,
      (record) => {
        if (record.replacedBy !== undefined && record.replacedBy !== id)
          return {
            stop: this.#error(
              "INVALID_STATE",
              `the plan was replaced by ${JSON.stringify(record.replacedBy)} while this call built: a plan is replaced once; nothing of ${JSON.stringify(id)} was written`,
              { details: { reason: "stopped" } },
            ),
          };
        if (!sameSteps(record, base)) return { stop: moved() };
        if (
          record.steps.some(
            (step, i) => inBlock(step) && !inBlock(base.steps[i]),
          )
        )
          return { stop: moved() };
        // A step the new plan may hold as in a block that a look of another object found in
        // none since
        if (
          record.steps.some(
            (step, i) => !inBlock(step) && inBlock(base.steps[i]),
          )
        )
          return { stop: moved() };
        const before = seenIn(base);
        if ([...seenIn(record)].some((txHash) => !before.has(txHash)))
          return { stop: moved() };
        if (record.replacedBy === id) return { skip: true };
        return {
          event: { type: "stop", replacedBy: id },
          refused: (refusal) =>
            refusal.reason === "terminal"
              ? this.#error(
                  "INVALID_STATE",
                  "the plan came to final while the new plan was built: nothing is made in its place",
                  { details: { reason: "final" } },
                )
              : this.#refused(refusal),
        };
      },
      undefined,
      ask,
    );
  }

  /**
   * CANNOT_OBSERVE (`unconfirmed`) when a list of UTxOs the call reads holds an output of an
   * open transaction of the line, told by its hash: each payer's read, and the read of each
   * address a step of the line that is dead, gone or used up pays, where no payer's read covered
   * it (at most 16): the search says it is in no block, and the address says it is. Of a used-up
   * transaction, whose collateral return is on chain for good, only its regular outputs count. A
   * read of an address that fails, or answers no list, refuses the call with its own error. The
   * addresses read are those a step that is dead, gone or used up pays, and those an entry of the
   * plans before that is dead or gone pays, at most 16 in a call: first those of a dead one the
   * steps about to be built may land beside (one that may pass by time), then those of a gone
   * one, then the rest. An entry keeps the first 16 addresses its transaction pays; those it
   * could not keep are counted as unread, though a payer's read may have covered one: the count
   * may be high, never low
   * @param open The open transactions of the line to match
   * @param kept The kept transactions of the line, as the pair rule is given them
   * @param standIns What is sure of the steps about to be built
   * @returns how many addresses were left unread past the 16, with those entries could not keep;
   *   and whether an address of a gone transaction is among them
   * @throws TxBuildError PROVIDER_FAILED, MISSING_FETCHER
   */
  async #refuseOpenOutputs(
    state: PlanState,
    base: PlanRecord,
    open: readonly LineTx[],
    kept: readonly LineInput[],
    standIns: StandIns,
    reads: readonly { readonly read: PayerRead }[],
    ask: Ask,
  ): Promise<{ readonly unread: number; readonly goneUnread: boolean }> {
    const stepOf = new Map(
      base.steps.map((step) => [step.txHash.toLowerCase(), step]),
    );
    // The dead ones that may pass by time: the stand-ins may land beside them
    const beside = new Set(
      landsBeside(standIns.steps, open, kept, standIns.earlier).flatMap(
        (pair) => pair.open.map((tx) => tx.txHash),
      ),
    );
    const byHash = new Map<string, LineTx>();
    const outputs = new Map<string, LineTx>();
    /** The addresses the transactions pay, by need: those that may pass by time first */
    const passing: string[] = [];
    const gone: string[] = [];
    const rest: string[] = [];
    /** The addresses the expired entries pay that they could not keep */
    let notKept = 0;
    let goneNotKept = false;
    for (const tx of open) {
      const step = stepOf.get(tx.txHash);
      // A gone one is read as a dead one: a search that lost it may say it is in no block
      const expired = tx.dead === true || tx.gone === true;
      if (tx.usedUp !== true) byHash.set(tx.txHash, tx);
      else
        for (const output of step?.built.outputs ?? [])
          outputs.set(outRefKey(output.txHash, output.outputIndex), tx);
      const into =
        tx.dead === true && beside.has(tx.txHash)
          ? passing
          : tx.gone === true
            ? gone
            : rest;
      if (step !== undefined && (expired || tx.usedUp === true))
        into.push(...step.built.outputs.map((output) => output.address));
      else if (step === undefined && expired) {
        into.push(...(tx.pays ?? []));
        notKept += tx.paysMore ?? 0;
        if (tx.gone === true && (tx.paysMore ?? 0) > 0) goneNotKept = true;
      }
    }
    const check = (utxo: { txHash: string; outputIndex: number }) => {
      const outRef = outRefKey(utxo.txHash, utxo.outputIndex);
      const tx = byHash.get(utxo.txHash.toLowerCase()) ?? outputs.get(outRef);
      if (tx !== undefined)
        throw this.#unconfirmed(
          `an address lists ${outRef}, an output of step ${JSON.stringify(tx.step)} (${tx.txHash}), which the search does not find in a block`,
          tx.txHash,
        );
    };
    const covered = new Set<string>();
    for (const { read } of reads) {
      covered.add(read.snapshot.changeAddress);
      for (const utxo of read.snapshot.utxos) {
        covered.add(utxo.address);
        check(utxo);
      }
    }
    // Those no read covered, at most 16, by need
    const unread = Array.from(new Set([...passing, ...gone, ...rest])).filter(
      (address) => !covered.has(address),
    );
    const addresses = unread.splice(0, MAX_PAID_ADDRESSES);
    const goneUnread =
      goneNotKept || unread.some((address) => gone.includes(address));
    const answer = { unread: unread.length + notKept, goneUnread };
    if (addresses.length === 0) return answer;
    const fetcher = internals(state.builder).cache?.fetcher;
    const lists = await ask(
      Promise.all(addresses.map((address) => readAddress(fetcher, address))),
      "read",
    );
    for (const list of lists) for (const ref of list) check(ref);
    return answer;
  }

  /**
   * STILL_LIVE of `replan` when every transaction that is not dead in the pairs `landsBeside`
   * gives is gone (found in a block once, out of it now past its end of validity and the
   * margin): the message says what the look knows of them, and that the application decides how
   * to pay what is left. Not while an address a gone transaction pays went unread: what it would
   * show is not known. `add` judges no gone transaction: an entry it reads was never found in a
   * block, or has no end in the record
   * @param goneUnread An address a gone transaction pays went unread
   * @throws TxPlanError STILL_LIVE
   */
  #refuseGone(
    pairs: readonly { readonly open: readonly LineTx[] }[],
    goneUnread: boolean,
  ) {
    if (goneUnread) return;
    const live = new Map<string, LineTx>();
    for (const pair of pairs)
      for (const tx of pair.open) if (tx.dead !== true) live.set(tx.txHash, tx);
    const txs = [...live.values()];
    if (txs.length === 0 || !txs.every((tx) => tx.gone === true)) return;
    const named = txs
      .map((tx) => `step ${JSON.stringify(tx.step)} (${tx.txHash})`)
      .join(", ");
    const one = txs.length === 1;
    // Each was found in a block and the search does not find it now: a rollback took it out, or
    // the provider lost it while it stayed. A step of one payer holds no input of another
    // payer's old step, so the steps built by default are not kept apart from them
    throw this.#error(
      "STILL_LIVE",
      `${named} of this plan or a plan before it ${one ? "was" : "were"} found in a block, the search does not find ${one ? "it" : "them"} now, and ${one ? "its end" : "their ends"} of validity ${one ? "has" : "have"} passed: a rollback took ${one ? "it" : "them"} out, and ${one ? "it lands" : "they land"} again only if the chain goes back to the blocks that held ${one ? "it" : "them"}, or the provider lost ${one ? "it while it stayed in its block" : "them while they stayed in their blocks"}. No plan is made in its place: no step this call builds by default is kept apart from ${one ? "it" : "them"}; the application decides how to pay what is left`,
      { details: { txHashes: [...live.keys()] } },
    );
  }

  /**
   * The pairs `landsBeside` gives, judged: a transaction that is dead passes; any other refuses
   * the call, STILL_LIVE, with every such hash and, when time settles them all, `safeAfter`,
   * never in the past: past it, CANNOT_OBSERVE (`unconfirmed`), the look did not settle them
   * @param done What the call did not do
   * @returns the dead transactions a step passed beside
   * @throws TxPlanError STILL_LIVE
   */
  #judgePairs(
    pairs: readonly { readonly open: readonly LineTx[] }[],
    base: PlanRecord,
    tip: PlanTip,
    done: string,
  ): LineTx[] {
    const live = new Map<string, LineTx>();
    const dead = new Map<string, LineTx>();
    for (const pair of pairs)
      for (const tx of pair.open)
        (tx.dead === true ? dead : live).set(tx.txHash, tx);
    if (live.size === 0) return [...dead.values()];
    const txs = [...live.values()];
    const timed = txs.every(
      (tx) => tx.until !== undefined && tx.seen === undefined,
    );
    const safeAfter = timed
      ? Math.max(...txs.map((tx) => tx.until!)) + base.deadlines.expiryMarginMs
      : undefined;
    const waitMs = safeAfter === undefined ? 0 : safeAfter - tip.timeMs;
    // Past their end and the margin by the tip, and still not dead: this look did not settle
    // them (a search that gave no answer, or a clock behind the tip). Time has done its part
    if (safeAfter !== undefined && waitMs <= 0)
      throw this.#unconfirmed(
        `${txs.map((tx) => `step ${JSON.stringify(tx.step)} (${tx.txHash})`).join(", ")} of this plan or a plan before it ${txs.length === 1 ? "is" : "are"} past the end of validity and the margin, and the search did not answer that it is not found (or the local clock is behind the tip): ${done}`,
        txs[0]!.txHash,
      );
    const named = txs
      .map((tx) => `step ${JSON.stringify(tx.step)} (${tx.txHash})`)
      .join(", ");
    throw this.#error(
      "STILL_LIVE",
      `a step built could land beside ${named} of this plan or a plan before it, which may still land and share no input with it: ${done}; ${
        safeAfter === undefined
          ? "no time settles it, as one of them has no end of validity or was found in a block once: steps that hold that transaction or spend an input of it, under the names of the steps they pay for, are the way"
          : "the same call passes once its end of validity and the margin have passed (safeAfter)"
      }`,
      {
        details: {
          txHashes: [...live.keys()],
          ...(safeAfter !== undefined && { safeAfter }),
        },
        ...(waitMs > 0 && { retryAfterMs: waitMs }),
      },
    );
  }

  /* -------------------------------------------------------------------------------------------
   * Errors
   * ----------------------------------------------------------------------------------------- */

  /** Runs a method; every plan error it throws gets the plan, its id and status */
  async #call<T>(body: (state: PlanState) => Promise<T>): Promise<T> {
    const state = stateOf(this);
    try {
      return await body(state);
    } catch (error) {
      throw this.#withPlan(state, error);
    }
  }

  /** A plan error as a method of this plan throws it */
  #withPlan(state: PlanState, error: unknown): unknown {
    if (!TxPlanError.is(error) || error.plan !== undefined) return error;
    Object.defineProperty(error, "plan", {
      value: this,
      enumerable: false,
      configurable: true,
      writable: false,
    });
    const fields = error as { planId?: string; status?: string };
    if (fields.planId === undefined && state.record.id !== undefined)
      fields.planId = state.record.id;
    fields.status = state.record.status;
    let message = error.message;
    if (!message.endsWith(NOT_UNPAID))
      message = `${message}${message.endsWith(".") ? "" : "."} ${NOT_UNPAID}`;
    error.message = message;
    return error;
  }

  /** A new plan error of this plan; about a step, it names the step and its transaction */
  #error<C extends TxPlanErrorCode>(
    code: C,
    message: string,
    context: {
      details?: C extends keyof TxPlanErrorDetails
        ? TxPlanErrorDetails[C]
        : undefined;
      retryAfterMs?: number;
      step?: Pick<StepRecord, "name" | "txHash">;
      /** The transaction the error is about, when it is no step of this plan */
      txHash?: string;
      cause?: unknown;
    },
  ): TxPlanError<C> {
    const make = TxPlanError as new (
      code: C,
      message: string,
      context: object,
    ) => TxPlanError<C>;
    const { step, ...rest } = context;
    const error = new make(
      code,
      step === undefined
        ? message
        : `step ${JSON.stringify(step.name)}: ${message}`,
      { ...rest, ...(step !== undefined && { txHash: step.txHash }) },
    );
    if (step !== undefined) onStep(error, step);
    return error;
  }

  /** The age of the last tip read by the local clock, for `tipAgeMs` */
  #tipAge(state: PlanState): { tipAgeMs?: number } {
    return state.lastTip === undefined
      ? {}
      : { tipAgeMs: Date.now() - state.lastTip.timeMs };
  }

  #missingSignatures(step: StepRecord) {
    const missing = missingOf(step);
    return this.#error(
      "MISSING_SIGNATURES",
      `${missing.length} key(s) the step needs have not signed it, and nobody in this call can sign: give signers, a payer that signs, or addWitnesses; nothing was sent`,
      { details: { missing }, step },
    );
  }

  /** The error of a step that will not land; it says the plan's status */
  #deadError(state: PlanState, step: StepRecord) {
    const plan = `the plan does not go on, and is ${state.record.status}`;
    switch (step.status) {
      case "expired": {
        const unsent = step.sends === 0;
        return this.#error(
          "EXPIRED",
          `its end of validity and the margin have passed and it is not on chain${unsent ? ", and the plan never sent it" : ""}: it will not land; ${plan}`,
          {
            details: {
              ...(unsent && { unsent: true as const }),
              ...this.#tipAge(state),
            },
            step,
          },
        );
      }
      case "orphaned":
        return this.#error(
          "ORPHANED",
          `a step it stands on will not land, so it will not either; ${plan}`,
          { step },
        );
      default:
        return this.#error(
          "SCRIPT_FAILED",
          `it is in a block with is_valid = false: a script failed and the collateral was taken; ${plan}`,
          { step },
        );
    }
  }

  /**
   * Maps a refusal of the state machine to the error of the method: the plan does not take the
   * change, so it signs and sends nothing more of it
   */
  #refused(refusal: { reason: PlanRefusal; message: string }): TxPlanError {
    return this.#error("INVALID_STATE", refusal.message, {
      details: { reason: "stopped" },
    });
  }

  /**
   * INVALID_STATE for a plan that takes no more steps: (`final`) when every step is final,
   * (`stopped`) when it is stopping or stopped
   */
  #refuseClosed(record: PlanRecord) {
    if (record.status === "final")
      throw this.#error(
        "INVALID_STATE",
        "the plan is final: every step of it is final, and it takes no more steps; new content is a new plan",
        { details: { reason: "final" } },
      );
    if (record.status !== "pending")
      throw this.#error(
        "INVALID_STATE",
        `the plan is ${record.status}: it does not go on, and takes no more steps; new content is a new plan`,
        { details: { reason: "stopped" } },
      );
  }

  /**
   * The error of `add` for a refusal of its steps by the state machine, on the record it was
   * shown: the plan came to `final` or does not go on; a refusal of the steps themselves is a
   * fault of this code, which built them
   */
  #addRefused(
    record: PlanRecord,
    refusal: { reason: PlanRefusal; message: string },
  ): unknown {
    if (refusal.reason === "terminal" && record.status === "final")
      return this.#error(
        "INVALID_STATE",
        `${refusal.message}: every step of it is final; new content is a new plan`,
        { details: { reason: "final" } },
      );
    if (
      refusal.reason === "terminal" ||
      refusal.reason === "stopped" ||
      refusal.reason === "status"
    )
      return this.#error(
        "INVALID_STATE",
        `${refusal.message}; nothing was added, and new content is a new plan`,
        { details: { reason: "stopped" } },
      );
    return new Error(`the steps built were refused: ${refusal.message}`);
  }

  /**
   * INVALID_STATE (`stopped`) for a plan that was stopped or replaced, or that found a
   * transaction of the plans before it in a block, its hash in `error.txHash`
   */
  #refuseMarked(state: PlanState) {
    const { record } = state;
    if (record.stopped !== true) return;
    if (record.replacedBy !== undefined)
      throw this.#error(
        "INVALID_STATE",
        `the plan was replaced by ${JSON.stringify(record.replacedBy)}: it signs and sends nothing more`,
        { details: { reason: "stopped" } },
      );
    const found = record.before?.open.find((entry) => entry.seen !== undefined);
    if (found !== undefined)
      throw this.#error(
        "INVALID_STATE",
        `a look found the transaction ${found.txHash} of step ${JSON.stringify(found.step)} of the plan it was made in place of in a block: that plan's step may have paid, so this plan signs and sends nothing more; replan it`,
        { details: { reason: "stopped" }, txHash: found.txHash },
      );
    throw this.#error(
      "INVALID_STATE",
      "the plan was stopped: it signs and sends nothing more",
      { details: { reason: "stopped" } },
    );
  }

  /**
   * INVALID_STATE (`stopped`) for a plan that was stopped, one of whose steps will not land, or
   * that came to `stopped` by its steps once
   */
  #refuseStopped(state: PlanState) {
    this.#refuseMarked(state);
    const { record } = state;
    const first = record.steps.find(isDeadStep);
    if (first !== undefined)
      throw this.#error(
        "INVALID_STATE",
        `step ${JSON.stringify(first.name)} will not land: the plan does not go on, and signs and sends nothing more`,
        { details: { reason: "stopped" } },
      );
    if (record.halted === true) throw this.#haltedError();
  }

  /** INVALID_STATE (`stopped`) for a plan that came to `stopped` by its steps once */
  #haltedError() {
    return this.#error(
      "INVALID_STATE",
      "the plan came to stopped when steps of it would not land: it does not go on, signs nothing, and sends again only the steps it sent",
      { details: { reason: "stopped" } },
    );
  }

  /** CANNOT_OBSERVE right after a look that found what cannot be followed */
  #refuseUnobservable(seen: Observed) {
    if (seen.noValidity)
      throw this.#error(
        "CANNOT_OBSERVE",
        "a step that runs a Plutus script was found, and the provider does not say whether its scripts passed (validContract): use a provider that does",
        { details: { reason: "noValidity" } },
      );
    if (seen.noDepth)
      throw this.#error(
        "CANNOT_OBSERVE",
        "a step was found, and the provider gives no block heights to count its depth by: use a provider that does",
        { details: { reason: "noDepth" } },
      );
  }

  /**
   * How the requests of a method are waited for: until its signal aborts and, for a call of
   * `run()`, no longer than the time left of its `timeoutMs`, after which the call throws
   * CONFIRM_TIMEOUT. What such a request answers later is dropped
   */
  #ask(signal: AbortSignal | undefined, call?: Call): Ask {
    const state = stateOf(this);
    return async <T>(
      request: Promise<T>,
      kind: RequestKind,
      step?: StepRecord,
    ): Promise<T> => {
      if (call === undefined) return abortable(request, signal, CALL);
      const left = call.from + call.wait.timeoutMs - Date.now();
      const answer = await within(request, Math.max(0, left), signal, CALL);
      if (answer === TIMED_OUT) throw this.#timedOut(state, call, kind, step);
      return answer as T;
    };
  }

  /**
   * CONFIRM_TIMEOUT for a request of a call that did not answer within its time, about this
   * step, else the step the call waits for
   */
  #timedOut(
    state: PlanState,
    call: Call,
    kind: RequestKind,
    step = waitingOn(state.record),
  ) {
    const { waitFor, timeoutMs } = call.wait;
    const within = `within the time left of timeoutMs (${timeoutMs} ms)`;
    const what: Record<RequestKind, string> = {
      look: `the provider did not answer a look at the chain ${within}; the same call waits on`,
      tip: `the provider did not answer a read of the tip ${within}; the same call waits on`,
      read: `the store did not answer a read of the plan's record ${within}; the same call waits on`,
      write: `the store did not answer a write of the plan's record ${within}: the write may have passed, and nothing was sent; the plan goes on from its record`,
      submit: `the submitter did not answer ${within}: the delivery is recorded and its outcome is unknown, so it may be on its way; the same call sends the same bytes again`,
    };
    return this.#error("CONFIRM_TIMEOUT", what[kind], {
      details: {
        waitedFor: waitFor === "final" ? "final" : "included",
        timeoutMs,
      },
      step,
    });
  }

  /* -------------------------------------------------------------------------------------------
   * Writing
   * ----------------------------------------------------------------------------------------- */

  /**
   * One change of the record: `decide` gives the event for the record it is shown, and the
   * object takes the next record only once it is written. Without a store the change is made at
   * once. With one, the record is saved over the revision the object holds; on `false` the
   * record is read again and `decide` is shown the fresh record (`fresh`), at most three times
   * more. The writes of one object are made one at a time. `fresh` is also true when a record
   * read from the store replaced the object's since `since`.
   * @returns `written`, `unchanged` (the event changed nothing, or its refusal was dropped), or
   *   `skipped` (`decide` applied nothing)
   * @throws TxPlanError VERSION_CONFLICT after the fourth `false`; STORE_FAILED when the store
   *   throws; PLAN_NOT_FOUND when the record is gone; INVALID_STATE (`recordVersion`) for a
   *   record read again that this library does not read; what `decide` stops with
   */
  #write(
    state: PlanState,
    decide: (record: PlanRecord, fresh: boolean) => WriteDecision,
    since = state.storeReads,
    ask: Ask = this.#ask(undefined),
  ): Promise<WriteOutcome> {
    const run = async (): Promise<WriteOutcome> => {
      let record = state.record;
      let fresh = state.storeReads !== since;
      for (let saves = 0; ;) {
        const step = decide(record, fresh);
        if ("stop" in step) throw step.stop;
        if ("skip" in step) return "skipped";
        const result = advancePlan(record, step.event);
        if (!result.ok) {
          const error = step.refused(result);
          if (error !== undefined) throw error;
          return "unchanged";
        }
        if (result.json === record) return "unchanged";
        const next = result.json;
        if (state.store === undefined) {
          commit(state, next);
          return "written";
        }
        if (await this.#save(state, next, record.rev, ask)) {
          commit(state, next);
          return "written";
        }
        saves += 1;
        if (saves > MAX_REPEATS)
          throw this.#error(
            "VERSION_CONFLICT",
            `the store holds another revision of the plan's record at each of ${saves} writes of one change: nothing was sent; the plan goes on from its record`,
            {},
          );
        record = await this.#reread(state, ask);
        fresh = true;
      }
    };
    // Without a store nothing waits: the change is made before the first pause
    if (state.store === undefined) return run();
    const mine = state.writing.then(run, run);
    state.writing = mine.then(
      () => undefined,
      () => undefined,
    );
    return mine;
  }

  /**
   * Saves the next record over the revision the object holds
   * @returns whether the store wrote it; any answer but `true` is taken as another revision
   * @throws TxPlanError STORE_FAILED when the store throws: the write may have passed;
   *   CONFIRM_TIMEOUT when the time of a call of `run()` is up before the store answers
   */
  async #save(
    state: PlanState,
    next: PlanRecord,
    expectedRev: number,
    ask: Ask,
  ): Promise<boolean> {
    const json = encodePlan(next) as unknown as StoredTxPlanJSON;
    const saving = (async () => {
      try {
        return (await state.store!.save(json, expectedRev)) === true;
      } catch (error) {
        throw this.#error(
          "STORE_FAILED",
          "the store failed to write the plan's record, and the write may have passed: nothing was sent; the plan goes on from its record",
          { cause: error },
        );
      }
    })();
    return ask(saving, "write");
  }

  /**
   * The record read again after a write the store refused, taken as the object's own. A record
   * of a lower revision than the one the object holds is a stale read: it is not taken, and the
   * object goes on from its own, which the next write finds out of date again
   * @throws TxPlanError PLAN_NOT_FOUND when the record is gone: it is never written anew;
   *   STORE_FAILED; INVALID_STATE (`recordVersion`)
   */
  async #reread(state: PlanState, ask: Ask): Promise<PlanRecord> {
    const record = await ask(
      loadRecord(state.store!, state.record.id!),
      "read",
    );
    if (record === undefined)
      throw this.#error(
        "PLAN_NOT_FOUND",
        "the plan's record is gone from the store: nothing was sent or written, and the record is not written anew",
        {},
      );
    if (record.rev < state.record.rev) return state.record;
    commitStored(state, record);
    return record;
  }

  /**
   * With a store: the stored record, when it is newer than the one the object holds, or of the
   * same revision and not the same record: the store holds the plan, and a mark in it is never
   * written over
   */
  async #takeStoredIfNewer(state: PlanState, ask: Ask = this.#ask(undefined)) {
    if (state.store === undefined) return;
    const stored = await ask(loadRecord(state.store, state.record.id!), "read");
    if (stored === undefined)
      throw this.#error(
        "PLAN_NOT_FOUND",
        "the plan's record is gone from the store: nothing was sent or written, and the record is not written anew",
        {},
      );
    if (
      stored.rev > state.record.rev ||
      (stored.rev === state.record.rev && !sameRecord(stored, state.record))
    )
      commitStored(state, stored);
  }

  /* -------------------------------------------------------------------------------------------
   * Observation
   * ----------------------------------------------------------------------------------------- */

  /**
   * The tip as the state machine takes it, with the time its slot starts at and the local clock;
   * undefined for a tip ahead of the clock by more than the tolerance, which is neither taken nor
   * kept (the observer tells `trace` of it)
   */
  #tipOf(state: PlanState, observed: ObservedTip): PlanTip | undefined {
    const tip: PlanTip = {
      slot: observed.slot,
      timeMs: state.builder.timeAt(observed.slot),
      ...(observed.height !== undefined && { height: observed.height }),
      clockMs: Date.now(),
    };
    if (tipAheadOfClock(tip)) return undefined;
    state.lastTip = tip;
    return tip;
  }

  /** Reads the tip once; undefined when it is unknown */
  async #readTip(state: PlanState, ask: Ask): Promise<PlanTip | undefined> {
    const observed = await ask(state.observer.tip(), "tip");
    return observed && this.#tipOf(state, observed);
  }

  /**
   * One look: a search for each step that is not final, dead ones included, but a step the plan
   * never sent that stands on a step not in a block; for each step searched that is not in a
   * block and has an end of validity, a transaction one of its inputs comes from when no search
   * of the look covers one already; then the tip. What it shows is recorded; what it cannot tell
   * is unknown and changes nothing. A find without its slot is unknown. A step called dead that
   * the look finds in a block is told to `trace`.
   */
  async #look(state: PlanState, ask: Ask, line = false): Promise<Observed> {
    let seen: Observed = { noValidity: false, noDepth: false, answers: [] };
    // Each round searches steps no round of this look searched; a round that finds a step in a
    // block lets the next one search the steps that stand on it. Every round searches one step
    // more at least, so a look ends
    const searched = new Set<string>();
    for (let round = 0; state.record.status !== "final"; round++) {
      const record = state.record;
      const watched = record.steps.filter(
        (step) =>
          step.status !== "final" &&
          !searched.has(step.name) &&
          (line || !cannotBeSeen(record, step)),
      );
      // The transactions of the plans before this one: those not found yet in every look, all
      // of them in a look of the whole line; in the first round
      const entries =
        round > 0
          ? []
          : (record.before?.open ?? []).filter(
              (entry) => line || entry.seen === undefined,
            );
      if (watched.length === 0 && round > 0) break;
      for (const step of watched) searched.add(step.name);
      // A later round takes the tip of the first: a search made after a tip finds nothing deeper
      // than it is, and does not find what was not there at that tip either
      const found = await this.#lookOnce(
        state,
        watched,
        ask,
        round > 0 ? (seen.tip ?? null) : undefined,
        entries,
        line,
      );
      const answers = new Map(
        [...seen.answers, ...found.answers].map((each) => [each.txHash, each]),
      );
      seen = {
        ...(found.tip !== undefined
          ? { tip: found.tip }
          : seen.tip !== undefined && { tip: seen.tip }),
        noValidity: seen.noValidity || found.noValidity,
        noDepth: seen.noDepth || found.noDepth,
        answers: [...answers.values()],
      };
      if (watched.length === 0) break;
    }
    return seen;
  }

  /**
   * One round of a look: a search for each of these steps, these transactions of the plans
   * before, and the sources, then the tip
   * @param earlier The tip of an earlier round, taken instead of reading one; `null` for none
   * @param line A look of the whole line: also the source of each step called dead and of each
   *   transaction of the plans before that is not in a block and has an end
   */
  async #lookOnce(
    state: PlanState,
    watched: readonly StepRecord[],
    ask: Ask,
    earlier?: PlanTip | null,
    entries: readonly BeforeEntry[] = [],
    line = false,
  ): Promise<Observed> {
    const hashes = watched.map((step) => step.txHash.toLowerCase());
    for (const entry of entries)
      if (!hashes.includes(entry.txHash)) hashes.push(entry.txHash);
    const sources: string[] = [];
    const covered = (from: readonly string[]) =>
      from.some((hash) => hashes.includes(hash) || sources.includes(hash));
    for (const step of watched) {
      if (
        !(isUnlandedStep(step) || (line && isDeadStep(step))) ||
        stepUntil(step) === undefined
      )
        continue;
      const from = step.built.inputs.map((input) => input.txHash.toLowerCase());
      if (step.expirySource !== undefined) {
        if (!sources.includes(step.expirySource))
          sources.push(step.expirySource);
        continue;
      }
      if (covered(from)) continue;
      if (from[0] !== undefined) sources.push(from[0]);
    }
    if (line)
      for (const entry of entries) {
        if (entry.seen !== undefined || entry.until === undefined) continue;
        const from = entry.spends.map((outRef) =>
          outRef.slice(0, outRef.indexOf("#")).toLowerCase(),
        );
        if (!covered(from) && from[0] !== undefined) sources.push(from[0]);
      }
    const all = [...hashes, ...sources];
    let searches: ReadonlyMap<string, TxSearch>;
    let tip: PlanTip | undefined;
    if (earlier === undefined) {
      const read = await ask(searchThenTip(state.observer, all), "look");
      searches = read.searches;
      tip = read.tip && this.#tipOf(state, read.tip);
    } else {
      const answers = await ask(
        Promise.all(all.map((txHash) => state.observer.findTx(txHash))),
        "look",
      );
      searches = new Map(all.map((txHash, i) => [txHash, answers[i]!]));
      tip = earlier ?? undefined;
    }
    const sightings: TxSighting[] = [];
    let noValidity = false;
    let noDepth = false;
    for (const step of watched) {
      const txHash = step.txHash.toLowerCase();
      const search = searches.get(txHash);
      if (search === undefined || "unsupported" in search) continue;
      if (!search.found) {
        sightings.push({ txHash, found: false });
        continue;
      }
      const plutus = step.built.redeemers.length > 0;
      const validityUnknown = plutus && search.validContract === undefined;
      if (validityUnknown && step.status !== "failed") noValidity = true;
      if (search.slot === undefined) continue;
      sightings.push(sightingOf(txHash, search));
      if (
        !validityUnknown &&
        search.validContract !== false &&
        (search.blockHeight === undefined ||
          (tip !== undefined && tip.height === undefined))
      )
        noDepth = true;
    }
    const ownHashes = new Set(hashes.slice(0, watched.length));
    for (const txHash of all) {
      if (ownHashes.has(txHash)) continue;
      const search = searches.get(txHash);
      if (search === undefined || "unsupported" in search) continue;
      if (!search.found) sightings.push({ txHash, found: false });
      else if (search.slot !== undefined)
        sightings.push(sightingOf(txHash, search));
    }
    // What each search said, also of a find without its slot or its scripts' outcome
    const answers: LookAnswer[] = [];
    for (const txHash of all) {
      const search = searches.get(txHash);
      if (search === undefined || "unsupported" in search) continue;
      answers.push(
        search.found
          ? {
              txHash,
              found: true,
              ...(search.slot !== undefined && { slot: search.slot }),
              ...(search.block !== undefined && { block: search.block }),
              ...(search.blockHeight !== undefined && {
                blockHeight: search.blockHeight,
              }),
              ...(search.validContract !== undefined && {
                valid: search.validContract,
              }),
            }
          : { txHash, found: false },
      );
    }
    const landed = landedSteps(state.record).length;
    const dead = new Map(
      state.record.steps
        .filter(isDeadStep)
        .map((step) => [step.name, step.status] as const),
    );
    await this.#write(
      state,
      () => ({
        event: {
          type: "observation",
          ...(tip !== undefined && { tip }),
          sightings,
        },
        refused: () => undefined,
      }),
      undefined,
      ask,
    );
    if (landedSteps(state.record).length > landed) this.#clearVolatile(state);
    for (const step of state.record.steps) {
      const was = dead.get(step.name);
      if (was !== undefined && isLanded(step))
        emit(state.trace, {
          type: "warning",
          code: "DEAD_STEP_FOUND",
          step: step.name,
          txHash: step.txHash,
          was: was as "expired" | "orphaned",
        });
    }
    return {
      ...(tip !== undefined && { tip }),
      noValidity,
      noDepth,
      answers,
    };
  }

  /** Clears the builder's cache of reads that a delivery or a landing makes stale */
  #clearVolatile(state: PlanState) {
    internals(state.builder).cache?.clearVolatile();
  }

  /* -------------------------------------------------------------------------------------------
   * Signing
   * ----------------------------------------------------------------------------------------- */

  /**
   * Asks each signer once for one step, sharing the time left to its end of validity by the
   * tip; records what each gives as it comes. A signer of hashes is skipped when no key is left;
   * the payer, asked because the call names no signer, when it has nothing left to give, and only
   * its witnesses of the keys it was asked for, and bootstrap witnesses, are recorded.
   * @param byDefault The signer is the plan's payer, asked because the call names no signer
   */
  async #signStep(
    state: PlanState,
    name: string,
    signers: readonly Signer[],
    tip: PlanTip | undefined,
    signal: AbortSignal | undefined,
    byDefault: boolean,
    ask?: Ask,
  ) {
    const since = state.storeReads;
    const first = stepIn(state.record, name)!;
    const keys = askedKeys(first.built.signers);
    const raw = readTransaction(first.built.tx);
    const until = stepUntil(first);
    const timeout = () =>
      this.#error(
        "SIGNER_FAILED",
        "the signer did not answer before the step's end of validity",
        { details: { reason: "timeout" }, step: first },
      );
    const endsAt =
      tip === undefined || until === undefined
        ? undefined
        : Date.now() + (until - tip.timeMs);
    for (const signer of signers) {
      // The keys that have not signed yet, by the record as it is now
      const now = stepIn(state.record, name)!;
      if (!isUnlandedStep(now)) return;
      const signed = new Set(
        now.witnesses
          .filter((w) => w.kind === "vkey")
          .map((w) => keyHashOfVkey(w.vkey)),
      );
      const unsigned = keys.filter(({ keyHash }) => !signed.has(keyHash));
      if (unsigned.length === 0 && signsHashes(signer)) continue;
      if (
        byDefault &&
        payerHasNothingLeft(
          unsigned,
          now.witnesses,
          now.built.signers.byronAddresses.length,
        )
      )
        continue;
      const left = endsAt === undefined ? undefined : endsAt - Date.now();
      if (left !== undefined && left <= 0) throw timeout();
      let offered: KeyWitness[] | typeof TIMED_OUT;
      try {
        offered = await abortable(
          within(
            signerWitnesses(
              signer,
              raw,
              { keys: unsigned, ...(signal !== undefined && { signal }) },
              "the step's body",
            ),
            left,
          ),
          signal,
          CALL,
        );
      } catch (error) {
        if (TxPlanError.is(error)) onStep(error, first);
        throw error;
      }
      if (offered === TIMED_OUT) throw timeout();
      await this.#record(
        state,
        name,
        byDefault ? payerWitnesses(offered, unsigned) : offered,
        since,
        ask,
      );
    }
  }

  /**
   * Records the witnesses offered for a step that its fee counts: of the keys it needs and of
   * the keys its native scripts name, `extraKeyWitnesses` more of other keys, and as many
   * bootstrap witnesses as it spends from Byron addresses; each counts for the key its own
   * public key hashes to. A step in a block keeps none
   */
  #record(
    state: PlanState,
    name: string,
    offered: readonly KeyWitness[],
    since = state.storeReads,
    ask?: Ask,
  ) {
    return this.#write(
      state,
      (record) => {
        if (record.stopped === true)
          return {
            stop: this.#error(
              "INVALID_STATE",
              "the plan was stopped: it signs and sends nothing more",
              { details: { reason: "stopped" } },
            ),
          };
        const step = stepIn(record, name);
        if (step === undefined || !isUnlandedStep(step)) return { skip: true };
        const kept = keptOf(step, offered);
        if (kept.length === 0) return { skip: true };
        return {
          event: { type: "signature", step: name, witnesses: kept },
          refused: (refusal) => this.#refused(refusal),
        };
      },
      since,
      ask,
    );
  }

  /* -------------------------------------------------------------------------------------------
   * Running
   * ----------------------------------------------------------------------------------------- */

  /** The submitter of a call: its own, else the builder's, else the provider when it submits */
  #submitter(state: PlanState, given: ISubmitter | undefined) {
    if (given) return given;
    if (state.builder.submitter) return state.builder.submitter;
    const { provider } = state.builder;
    return provider !== undefined && isFunction(provider, "submitTx")
      ? (provider as ISubmitter)
      : undefined;
  }

  /**
   * The loop of `run()`: the first step that is not in a block is signed, sent and waited for;
   * every step before it is in a block. It holds no state of its own but the times of its
   * sends: every turn starts from the record as it is. A turn starts only once the turn before
   * it changed the record or waited; else it waits and looks first, so no turn repeats at once
   */
  async #drive(state: PlanState, call: Call) {
    const { waitFor, resendMs } = call.wait;
    const ask = this.#ask(call.signal, call);
    const lastSent = new Map<string, number>();
    const signedHere = new Set<string>();
    // The record the last turn started from, and whether that turn waited; the look of `run()`
    // before the first turn counts as a wait
    let previous: PlanRecord | undefined;
    let waited = true;
    for (;;) {
      if (!waited && state.record === previous)
        await this.#pauseAndLook(state, call, waitingOn(state.record));
      previous = state.record;
      waited = false;
      const record = state.record;
      if (record.status === "final") return;
      await this.#refuseHalted(state, call);
      const step = record.steps.find((each) => !isLanded(each));
      if (step === undefined) {
        // Every step is in a block
        if (waitFor !== "final") return;
        const first = record.steps.find((each) => each.status !== "final")!;
        await this.#pauseAndLook(state, call, first);
        waited = true;
        continue;
      }
      const signers =
        call.signers ?? (state.signer ? [state.signer] : undefined);
      switch (step.status) {
        case "built": {
          if (pastUntil(step, state.lastTip)) {
            await this.#pauseAndLook(state, call, step, PAST_UNTIL);
            waited = true;
            continue;
          }
          if (signedHere.has(step.name)) throw this.#missingSignatures(step);
          if (signers === undefined) throw this.#missingSignatures(step);
          await this.#signStep(
            state,
            step.name,
            signers,
            state.lastTip,
            call.signal,
            call.signers === undefined,
            ask,
          );
          signedHere.add(step.name);
          continue;
        }
        case "signed":
        case "rejected": {
          // The deadline once more, by a tip read after signing
          const tip = signedHere.has(step.name)
            ? ((await this.#readTip(state, ask)) ?? state.lastTip)
            : state.lastTip;
          if (pastUntil(step, tip)) {
            await this.#pauseAndLook(state, call, step, PAST_UNTIL);
            waited = true;
            continue;
          }
          this.#refuseNotYetValid(state, step, tip);
          const sent = await this.#send(state, step.name, call, true);
          if (sent.outcome === "moved") continue;
          if (sent.outcome === "failed") throw sent.error;
          lastSent.set(step.name, Date.now());
          call.from = Date.now();
          if (waitFor === "sent") {
            if (sent.outcome === "unconfirmed") throw sent.error;
            return;
          }
          await this.#pauseAndLook(state, call, step);
          waited = true;
          continue;
        }
        case "sent": {
          if (signedTxOf(step) === undefined) {
            // Sent by another party, and the plan does not hold every witness of it: the call's
            // signers are asked once, and the step is waited for like any step sent
            if (signers !== undefined && !signedHere.has(step.name)) {
              await this.#signStep(
                state,
                step.name,
                signers,
                state.lastTip,
                call.signal,
                call.signers === undefined,
                ask,
              );
              signedHere.add(step.name);
              continue;
            }
            if (waitFor === "sent") return;
            await this.#pauseAndLook(state, call, step);
            waited = true;
            continue;
          }
          const last = lastSent.get(step.name);
          if (last === undefined || Date.now() - last >= resendMs) {
            const sent = await this.#send(state, step.name, call, false);
            if (sent.outcome === "moved") continue;
            if (last === undefined) call.from = Date.now();
            lastSent.set(step.name, Date.now());
            if (waitFor === "sent") {
              if (sent.outcome !== "accepted") throw sent.error;
              return;
            }
          }
          await this.#pauseAndLook(state, call, step);
          waited = true;
          continue;
        }
        default:
          throw this.#error(
            "INVALID_STATE",
            `the step is ${step.status}, a status this library does not know`,
            { details: { reason: "recordVersion" }, step },
          );
      }
    }
  }

  /**
   * INVALID_STATE (`stopped`) for a plan that was stopped. For a plan with a step that will not
   * land, the error of the first such step, after the same bytes of each step it sent that stands
   * on no such step went again: a plan that does not go on sends no step for the first time. A
   * plan that came to `stopped` by its steps once goes on only while the first step not in a
   * block is one it sent; else the same, with INVALID_STATE (`stopped`)
   */
  async #refuseHalted(state: PlanState, call: Call) {
    this.#refuseMarked(state);
    if (!cannotGoOn(state.record)) return;
    const submitter = this.#submitter(state, call.submitter);
    if (submitter !== undefined)
      for (const step of state.record.steps) {
        const now = stepIn(state.record, step.name)!;
        if (
          (now.status !== "sent" && now.status !== "rejected") ||
          signedTxOf(now) === undefined ||
          standsOnDead(state.record, now)
        )
          continue;
        try {
          await this.#send(state, now.name, call, false);
        } catch (error) {
          // A refusal that counts is recorded; the plan's own error follows
          if (!TxPlanError.is(error, "REJECTED")) throw error;
        }
      }
    this.#refuseMarked(state);
    const dead = state.record.steps.find(isDeadStep);
    if (dead !== undefined) throw this.#deadError(state, dead);
    if (cannotGoOn(state.record)) throw this.#haltedError();
  }

  /**
   * One pause of a call that waits, then a look; CONFIRM_TIMEOUT about the step waited for once
   * `timeoutMs` has passed since `call.from`
   * @param why What the call waits for, when it is not a block or depth
   */
  async #pauseAndLook(
    state: PlanState,
    call: Call,
    step: StepRecord,
    why?: string,
  ) {
    const { waitFor, timeoutMs, pollMs } = call.wait;
    const elapsed = Date.now() - call.from;
    if (elapsed >= timeoutMs)
      throw this.#error(
        "CONFIRM_TIMEOUT",
        why === undefined
          ? `it did not reach ${waitFor} within ${timeoutMs} ms; nothing changed, and the same call waits on`
          : `${why}, and ${timeoutMs} ms have passed; the same call waits on`,
        {
          details: {
            waitedFor: waitFor === "final" ? "final" : "included",
            timeoutMs,
          },
          step,
        },
      );
    await pause(state, Math.min(pollMs, timeoutMs - elapsed), call.signal);
    const ask = this.#ask(call.signal, call);
    await this.#takeStoredIfNewer(state, ask);
    const seen = await this.#look(state, ask);
    this.#refuseUnobservable(seen);
  }

  /** NOT_YET_VALID while the step's lower bound is ahead of the tip */
  #refuseNotYetValid(
    state: PlanState,
    step: StepRecord,
    tip: PlanTip | undefined,
  ) {
    const before = step.built.validity?.invalidBefore;
    if (tip === undefined || before === undefined || before <= tip.slot) return;
    const waitMs = state.builder.timeAt(before) - tip.timeMs;
    throw this.#error(
      "NOT_YET_VALID",
      `it is valid from slot ${before}, ${waitMs} ms after the tip: nothing was sent`,
      { details: { waitMs }, retryAfterMs: waitMs, step },
    );
  }

  /**
   * One send of a step's bytes: the probe this object owes, the delivery written, then the bytes
   * of `signedTx` handed to the submitter, and its answer. When the record no longer takes the
   * delivery (another call or writer changed it), nothing is sent: `moved`.
   * @param first The step was not sent yet: a failure is thrown; else it is given back
   * @throws TxPlanError MISSING_SUBMITTER, nothing sent; REJECTED; SUBMIT_FAILED for a first send
   */
  async #send(
    state: PlanState,
    name: string,
    call: Call,
    first: boolean,
  ): Promise<Sent> {
    const since = state.storeReads;
    const step = stepIn(state.record, name)!;
    const submitter = this.#submitter(state, call.submitter);
    if (submitter === undefined)
      throw this.#error(
        "MISSING_SUBMITTER",
        "nothing can submit it: give the call or the builder a submitter, or a provider with submitTx; nothing was sent",
        { step },
      );
    const ask = this.#ask(call.signal, call);
    if (state.probe === "owed") {
      const probed = await probeProvider(
        state.observer,
        state.record,
        ask,
        (error) =>
          this.#error("CANNOT_OBSERVE", error.message, {
            details: { reason: error.reason },
          }),
      );
      if (probed) state.probe = "done";
    }
    throwIfAborted(call.signal, CALL);
    const delivered = await this.#write(
      state,
      (record) => {
        const now = stepIn(record, name);
        if (now === undefined || signedTxOf(now) === undefined)
          return { skip: true };
        // The state machine judges whether the record takes the delivery; a refusal sends nothing
        return {
          event: { type: "delivery", step: name },
          refused: () => undefined,
        };
      },
      since,
      ask,
    );
    if (delivered !== "written") return { outcome: "moved" };
    // The bytes of the step as recorded
    const now = stepIn(state.record, name)!;
    const tx = signedTxOf(now)!;
    let answer: unknown;
    try {
      answer = await this.#submit(state, submitter, tx, now, ask);
    } catch (error) {
      // A submitter that did not answer in time: the delivery is recorded, the outcome unknown
      if (
        TxBuildError.is(error, "ABORTED") ||
        TxPlanError.is(error, "CONFIRM_TIMEOUT")
      )
        throw error;
      const failure = await this.#failedDelivery(
        state,
        now,
        submitter,
        error,
        ask,
      );
      if (failure.outcome === "failed" && first) throw failure.error;
      return failure;
    }
    const reportedHash = answeredHash(answer);
    if (reportedHash !== undefined && reportedHash !== now.txHash)
      emit(state.trace, {
        type: "warning",
        code: "HASH_MISMATCH",
        txHash: now.txHash,
        reportedHash,
      });
    return { outcome: "accepted" };
  }

  /** Hands the bytes of a step to the submitter; the cache is cleared whatever it answers */
  async #submit(
    state: PlanState,
    submitter: ISubmitter,
    tx: string,
    step: StepRecord,
    ask: Ask,
  ): Promise<unknown> {
    try {
      return await ask(
        Promise.resolve().then(() => submitter.submitTx(tx)),
        "submit",
        step,
      );
    } finally {
      this.#clearVolatile(state);
    }
  }

  /**
   * What a delivery that failed comes to. A refusal of the ledger is recorded with what a search
   * made after it shows: whether the step is found, and whether every step it stands on is found
   * in a block. It counts only when every recorded delivery was refused and both say so: the step
   * is `rejected`, and the error is REJECTED. Else it proves nothing when an earlier delivery may
   * have gone through (`accepted`), and is SUBMIT_FAILED (`refused`) when none may have
   * (`unconfirmed`). Any other failure leaves the outcome unknown (`failed`)
   * @throws TxPlanError REJECTED
   */
  async #failedDelivery(
    state: PlanState,
    step: StepRecord,
    submitter: ISubmitter,
    error: unknown,
    ask: Ask,
  ): Promise<Sent> {
    const wallet = isWallet(submitter);
    if (!wallet && isRefusal(error)) {
      // The steps it stands on, and the transactions of `after` it stands on
      const parents = [
        ...step.standsOn.map((name) => stepIn(state.record, name)!.txHash),
        ...(step.after ?? []),
      ];
      const { searches } = await ask(
        searchThenTip(state.observer, [step.txHash, ...parents]),
        "look",
      );
      const own = searches.get(step.txHash);
      const found =
        own === undefined || "unsupported" in own ? undefined : own.found;
      // Found without the slot of a block, a transaction may be in a mempool: not in a block
      const standingInBlock = parents.every((txHash) =>
        isInBlock(searches.get(txHash)),
      );
      await this.#write(
        state,
        (record) => {
          const held = stepIn(record, step.name);
          if (
            held === undefined ||
            !isUnlandedStep(held) ||
            held.refused >= held.sends
          )
            return { skip: true };
          return {
            event: {
              type: "answer",
              step: step.name,
              refused: true,
              ...(found !== undefined && { found }),
              standingInBlock,
            },
            refused: () => undefined,
          };
        },
        undefined,
        ask,
      );
      const now = stepIn(state.record, step.name)!;
      if (now.status === "rejected")
        throw this.#error(
          "REJECTED",
          "the ledger refused it, no delivery of it may have gone through, and it is not found while every step it stands on is in a block; the bytes exist and the same call sends them again",
          {
            details: this.#tipAge(state),
            cause: error,
            step: now,
          },
        );
      if (!isUnlandedStep(now) || now.sends > now.refused || found === true)
        return { outcome: "accepted" };
      return {
        outcome: "unconfirmed",
        error: this.#error(
          "SUBMIT_FAILED",
          `the ledger refused it while ${standingInBlock ? "the search does not tell whether it is on chain" : "a step or a transaction of after it stands on is not found in a block"}: the refusal proves nothing; the same call sends the same bytes again`,
          {
            details: { ...submitFailure(error), reason: "refused" },
            cause: error,
            step: now,
          },
        ),
      };
    }
    const walletCode = wallet ? numericCodeOf(error) : undefined;
    const failure = submitFailure(error);
    return {
      outcome: "failed",
      error: this.#error(
        "SUBMIT_FAILED",
        `${submitFailureText(failure)}; the outcome of the delivery is unknown: it may be on its way; the same call sends the same bytes again`,
        {
          details: {
            ...failure,
            ...(walletCode !== undefined && { walletCode }),
          },
          cause: error,
          step,
        },
      ),
    };
  }
}

/** Names the step an error is about */
const onStep = (
  error: TxPlanError,
  step: Pick<StepRecord, "name" | "txHash">,
) => {
  const fields = error as { step?: string; txHash?: string };
  if (fields.step === undefined) fields.step = step.name;
  if (fields.txHash === undefined) fields.txHash = step.txHash;
};

/**
 * The out refs at an address, read from the provider past its cache, for the check of what a
 * transaction the search does not find paid: a read that fails is no answer, and refuses the
 * call
 * @throws TxBuildError MISSING_FETCHER without a provider; PROVIDER_FAILED when the read fails
 *   or its answer cannot be read
 */
const readAddress = async (
  fetcher: CachedFetcher["fetcher"] | undefined,
  address: string,
): Promise<{ txHash: string; outputIndex: number }[]> => {
  if (fetcher === undefined)
    throw new TxBuildError(
      "MISSING_FETCHER",
      `the UTxOs at ${address}, which a transaction the search does not find pays, have to be read through a provider, and the builder has none`,
    );
  const failed = (cause: unknown) =>
    new TxBuildError(
      "PROVIDER_FAILED",
      `reading the UTxOs at ${address}, which a transaction the search does not find pays, failed or gave no list: nothing was written, and the application may make the same call again`,
      { details: { operation: "fetchAddressUTxOs" }, cause },
    );
  let utxos: unknown;
  try {
    utxos = await fetcher.fetchAddressUTxOs(address);
  } catch (error) {
    throw failed(error);
  }
  // Only a list is an answer; an empty one is
  if (!Array.isArray(utxos))
    throw failed(new Error("the answer is not a list"));
  return utxos.map((entry: unknown) => {
    const input = (
      entry as { input?: { txHash?: unknown; outputIndex?: unknown } }
    )?.input;
    if (
      typeof input?.txHash !== "string" ||
      typeof input.outputIndex !== "number"
    )
      throw failed(new Error("an entry of the answer has no out ref"));
    return { txHash: input.txHash, outputIndex: input.outputIndex };
  });
};

/**
 * Whether this look calls the open transaction of this hash expired: dead, or, found in a block
 * once, gone from it
 */
const expiredByLook = (classes: Pick<LineClasses, "open">, txHash: string) => {
  const hash = txHash.toLowerCase();
  const tx = classes.open.find((each) => each.txHash === hash);
  return tx !== undefined && (tx.dead === true || tx.gone === true);
};

/**
 * Whether a recorded step has an end of validity of its own, which building it again keeps: a
 * step given built whose transaction has one, or a step whose parts give `until` or
 * `invalidHereafter`. An end the plan's `ttlMs` gave is not its own
 */
const ownEndOf = (step: StepRecord) =>
  step.kind === "prebuilt"
    ? stepUntil(step) !== undefined
    : (step.given?.parts ?? []).some(
        (part) =>
          part.kind === "validity" &&
          ("until" in part || "invalidHereafter" in part) &&
          ((part as { until?: unknown }).until !== undefined ||
            (part as { invalidHereafter?: unknown }).invalidHereafter !==
              undefined),
      );

/**
 * The first step given built among those left that spends, reads or puts up a regular output of
 * a step of `base` the new plan does not hold as the same transaction (one built again from its
 * parts, a consolidation step, a failed one), with that step's name; undefined when none does. A
 * step given built that is left is held as it is; a final or a taken step is no open step
 */
const blockedPrebuilt = (
  base: PlanRecord,
  left: Readonly<Record<string, unknown>>,
  taken: readonly string[],
): { readonly step: string; readonly below: string } | undefined => {
  const notHeld = base.steps.filter(
    (step) =>
      step.status !== "final" &&
      !taken.includes(step.name) &&
      !(step.kind === "prebuilt" && step.name in left),
  );
  for (const step of base.steps) {
    if (step.kind !== "prebuilt" || !(step.name in left)) continue;
    const refs = [
      ...step.built.inputs,
      ...(step.built.referenceInputs ?? []),
      ...(step.built.collateral?.inputs ?? []),
    ];
    const below = notHeld.find(
      (each) =>
        each !== step &&
        refs.some(
          (ref) =>
            ref.txHash.toLowerCase() === each.txHash.toLowerCase() &&
            ref.outputIndex < each.built.outputs.length,
        ),
    );
    if (below !== undefined) return { step: step.name, below: below.name };
  }
  return undefined;
};

/** INVALID_OPTION (`steps`) of `replan` */
const stepsRefused = (reason: string) =>
  new TxBuildError("INVALID_OPTION", `invalid steps: ${reason}`, {
    details: {
      option: "steps",
      value: undefined,
      allowed:
        "one list of parts, or an object of named steps none of which is final in the plan or a plan before it, or in a block in the plan",
    },
  });

/**
 * A step of a record as `builder.plan` takes it, as `rest` gives it: its parts and own options,
 * with its own payer's change address as its payer; a step given built as that transaction.
 * Undefined for a consolidation step
 */
const stepAsGiven = (
  builder: TxBuilder,
  step: StepRecord,
): PlanStep | undefined => {
  if (step.kind === "prebuilt") return prebuiltOf(builder, step);
  if (step.kind === "consolidation" || step.given === undefined)
    return undefined;
  const parts = step.given.parts as StepParts;
  const { changeAddress, ...options } = step.given.options ?? {};
  const own =
    typeof changeAddress === "string"
      ? { payer: changeAddress, ...options }
      : options;
  return Object.keys(own).length === 0
    ? parts
    : ({ parts, ...own } as PlanStep);
};

/**
 * Whether a record holds the steps given, as `builder.plan` compares them: those it was made
 * with, or all it has, in order; consolidation steps left out of both
 */
const stepsOfOrder = (record: PlanRecord, given: readonly GivenStep[]) => {
  const order = JSON.parse(
    JSON.stringify(
      shapeOfOrder({
        network: record.network,
        deadlines: {},
        options: {},
        steps: given,
      }).steps,
    ),
  ) as unknown;
  return [false, true].some((added) =>
    sameJson(JSON.parse(JSON.stringify(shapeOf(record, added).steps)), order),
  );
};

/** A find of a search as the state machine takes it */
const sightingOf = (
  txHash: string,
  search: Extract<TxSearch, { found: true }>,
): TxSighting => ({
  txHash,
  found: true,
  slot: search.slot!,
  ...(search.block !== undefined && { block: search.block }),
  ...(search.blockHeight !== undefined && {
    blockHeight: search.blockHeight,
  }),
  ...(search.validContract !== undefined && { valid: search.validContract }),
});

/* ---------------------------------------------------------------------------------------------
 * Making the object
 * ------------------------------------------------------------------------------------------- */

/** A new plan error of the store or of creation; its message says that it means no "not paid" */
const planError = <C extends TxPlanErrorCode>(
  code: C,
  message: string,
  context: {
    planId?: string;
    cause?: unknown;
    details?: C extends keyof TxPlanErrorDetails
      ? TxPlanErrorDetails[C]
      : undefined;
  },
): TxPlanError<C> => {
  const make = TxPlanError as new (
    code: C,
    message: string,
    context: object,
  ) => TxPlanError<C>;
  return new make(code, `${message}. ${NOT_UNPAID}`, {
    ...(context.planId !== undefined && { planId: context.planId }),
    ...(context.cause !== undefined && { cause: context.cause }),
    ...(context.details !== undefined && { details: context.details }),
  });
};

/**
 * The trial request of the provider: a search for the transaction the first input of the first
 * step comes from, and the tip. The provider must have a search, block heights and, for a plan
 * with a step that runs a Plutus script, the validity of what it finds. Without an answer nothing
 * is forbidden.
 * @returns whether the provider answered both, so that nothing is left to probe
 * @throws what `cannot` makes of CANNOT_OBSERVE (`noSearch`, `noDepth`, `noValidity`)
 */
const probeProvider = async (
  observer: ChainObserver,
  record: PlanRecord,
  ask: Ask,
  cannot: (problem: {
    reason: "noSearch" | "noDepth" | "noValidity";
    message: string;
  }) => unknown,
) => {
  const source = record.steps[0]?.built.inputs[0]?.txHash;
  const plutus = record.steps.some((step) => step.built.redeemers.length > 0);
  const { searches, tip } = await ask(
    searchThenTip(observer, source === undefined ? [] : [source]),
    "look",
  );
  const search = source === undefined ? undefined : searches.get(source);
  const fail = (reason: "noSearch" | "noDepth" | "noValidity", what: string) =>
    cannot({
      reason,
      message: `the provider cannot follow the plan: ${what}; use another provider`,
    });
  if (search !== undefined && "unsupported" in search)
    throw fail("noSearch", "it cannot search for a transaction");
  if (tip !== undefined && tip.height === undefined)
    throw fail("noDepth", "its tip has no block height");
  if (search?.found === true) {
    if (search.blockHeight === undefined)
      throw fail("noDepth", "what it finds has no block height");
    if (plutus && search.validContract === undefined)
      throw fail(
        "noValidity",
        "what it finds does not say whether its scripts passed (validContract)",
      );
  }
  return tip !== undefined && (source === undefined || search !== undefined);
};

/**
 * The record of an id, read from a store and checked; undefined when there is none
 * @throws TxPlanError STORE_FAILED when the store throws; INVALID_STATE (`recordVersion`) for
 *   a record this library does not read
 */
const loadRecord = async (
  store: TxPlanStore,
  id: string,
): Promise<PlanRecord | undefined> => {
  let json: unknown;
  try {
    json = await store.load(id);
  } catch (error) {
    throw planError(
      "STORE_FAILED",
      `the store failed to read the record of the plan ${id}: nothing was signed, written or sent`,
      { planId: id, cause: error },
    );
  }
  // Only `undefined` says that there is no record; anything else is read as one
  if (json === undefined) return undefined;
  return readPlan(json, id);
};

/**
 * The record's network against the builder's: the name, and for a recorded configuration also
 * the network id and the slot clock, by which the plan's time is counted
 * @throws TxBuildError NETWORK_MISMATCH with the role `record`
 */
const checkRecordNetwork = (builder: TxBuilder, record: PlanRecord) => {
  const own = builder.network;
  const recorded = record.network;
  const name = typeof recorded === "string" ? recorded : recorded.name;
  let differs: string | undefined;
  if (name !== own.name) differs = "the name";
  else if (typeof recorded !== "string") {
    const a = recorded.slotConfig;
    const b = own.slotConfig;
    if (recorded.networkId !== own.networkId) differs = "the network id";
    else if (
      a.zeroTime !== b.zeroTime ||
      a.zeroSlot !== b.zeroSlot ||
      a.slotLength !== b.slotLength
    )
      differs = "the slot clock (zeroTime, zeroSlot, slotLength)";
  }
  if (differs === undefined) return;
  throw new TxBuildError(
    "NETWORK_MISMATCH",
    `the plan's record ${record.id ?? ""} was written for the network ${name}${typeof recorded === "string" ? "" : ` (network id ${recorded.networkId})`}, and the builder is for ${own.name} (network id ${own.networkId}): ${differs} differs. Resume it with a builder of its network`,
    {
      details: {
        expected: { name: own.name, networkId: own.networkId },
        found: [
          {
            role: "record",
            network: name,
            ...(typeof recorded !== "string" && {
              networkId: recorded.networkId,
            }),
          },
        ],
      },
    },
  );
};

/** A plan object over a record, with its live objects */
const objectOver = (
  builder: TxBuilder,
  record: PlanRecord,
  live: LiveObjects,
  probe: "owed" | "done",
): TxPlan => {
  const plan = new (TxPlan as unknown as new () => TxPlan)();
  const signer = payerSigner(live.payer);
  const { store } = builder;
  STATE.set(plan, {
    builder,
    record,
    ...(signer !== undefined && { signer }),
    ...(live.payer !== undefined && { payer: live.payer }),
    ...(live.trace !== undefined && { trace: live.trace }),
    observer: chainObserver(builder.provider, {
      timeAt: (slot) => builder.timeAt(slot),
      ahead: (slot, aheadMs) =>
        emit(live.trace, {
          type: "warning",
          code: "TIP_AHEAD_OF_CLOCK",
          slot,
          aheadMs,
        }),
    }),
    probe,
    watchers: new Set(),
    ...(store !== undefined && { store }),
    writing: Promise.resolve(),
    storeReads: 0,
  });
  return plan;
};

/** Whether two records are the same, member for member */
const sameRecord = (a: PlanRecord, b: PlanRecord) =>
  a === b ||
  sameJson(
    JSON.parse(JSON.stringify(encodePlan(a))),
    JSON.parse(JSON.stringify(encodePlan(b))),
  );

/**
 * What makes two records of one id the same plan: its network, deadlines, options and the steps
 * it was made with; steps added later are not of it unless `added` says so, nor ever the
 * consolidation steps the plan put in, which depend on the wallet as it was read, nor the steps
 * it took of the plan it was made in place of, which depend on what a look found
 */
const shapeOf = (record: PlanRecord, added = false) => {
  const json = encodePlan(record);
  return {
    network: json.network,
    deadlines: json.deadlines,
    options: json.options,
    steps: json.steps
      .filter(
        (step) =>
          (added || step.added !== true) &&
          step.kind !== "consolidation" &&
          step.taken !== true,
      )
      .map((step) => ({
        name: step.name,
        kind: step.kind,
        given: step.given,
        // A transaction given built is told by its body alone
        ...(step.kind === "prebuilt" && { txHash: step.txHash.toLowerCase() }),
      })),
  };
};

/** The same, of an order that was not built */
const shapeOfOrder = (order: PlanOrder) => ({
  network: encodeValue(order.network),
  deadlines: order.deadlines,
  options: encodeValue(order.options),
  steps: order.steps.map((step) =>
    "given" in step
      ? { name: step.name, given: encodeGiven(step.given) }
      : { name: step.name, kind: step.kind, txHash: step.txHash ?? null },
  ),
});

/**
 * Whether a record and a record, or an order not built, are the same plan. Of the deadlines of
 * an order only those it gives explicitly are compared: the builder's defaults may change
 * @param added Whether the steps added to `a` count among its steps
 */
const sameOrder = (a: PlanRecord, b: PlanRecord | PlanOrder, added = false) => {
  if ("rev" in b)
    return sameJson(
      JSON.parse(JSON.stringify(shapeOf(a, added))),
      JSON.parse(JSON.stringify(shapeOf(b))),
    );
  const order = b as PlanOrder;
  const recorded = shapeOf(a, added);
  const deadlines = Object.fromEntries(
    Object.keys(order.deadlines).map((key) => [
      key,
      recorded.deadlines[key as keyof typeof recorded.deadlines],
    ]),
  );
  return sameJson(
    JSON.parse(JSON.stringify({ ...recorded, deadlines })),
    JSON.parse(JSON.stringify(shapeOfOrder(order))),
  );
};

/**
 * Whether a recorded plan is the plan of these steps and options: the steps given are those it
 * was made with, or all the steps it has, in order; its consolidation steps are left out of both
 */
const isOrderOf = (recorded: PlanRecord, given: PlanRecord | PlanOrder) =>
  sameOrder(recorded, given) || sameOrder(recorded, given, true);

/**
 * The message of PLAN_EXISTS: the id names another plan, what was done, and where the recorded
 * plan is
 */
const planExists = (id: string, done: string) =>
  `the store holds the plan ${id} with other steps or options: an id names one plan, whose steps never change; ${done}. The recorded plan is builder.resume(id), by this id; a new id is for a new order, and under a new id the same steps are paid again`;

/**
 * The object of a plan `makePlan` built. The provider is probed first. On a builder with a
 * store the plan needs an id, and its first record is written before the object is returned:
 * an id the store holds already with the same steps and options (the steps it was made with, or
 * all the steps it has) gives the recorded plan, with its recorded transactions, and the steps
 * just built are dropped.
 * @throws TxPlanError CANNOT_OBSERVE (`noSearch`, `noDepth`, `noValidity`) for a provider that
 *   cannot follow the plan; on a builder with a store MISSING_ID, PLAN_EXISTS for an id recorded
 *   with other steps or options, STORE_FAILED, VERSION_CONFLICT
 * @throws TxBuildError NOT_SERIALIZABLE on a builder with a store, for a part that holds a
 *   redeemer function; NETWORK_MISMATCH for a recorded id of another network
 */
export const createPlan = async (
  builder: TxBuilder,
  made: Pick<MadePlan, "record">,
  live: LiveObjects = {},
): Promise<TxPlan> => {
  const { record } = made;
  const { store } = builder;
  const id = record.id;
  if (store !== undefined && (id === undefined || id === ""))
    throw planError(
      "MISSING_ID",
      "a builder with a store keeps every plan under its id: give the plan an id, a non-empty string, such as the key of the order",
      {},
    );
  const json =
    store === undefined
      ? undefined
      : (encodePlan(record) as unknown as StoredTxPlanJSON);
  const probed = await probeProvider(
    chainObserver(builder.provider),
    record,
    (request) => request,
    (p) =>
      planError("CANNOT_OBSERVE", p.message, {
        ...(id !== undefined && { planId: id }),
        details: { reason: p.reason },
      }),
  );
  // A probe without an answer is made again before the first delivery
  const probe = probed ? "done" : "owed";
  if (store === undefined) return objectOver(builder, record, live, probe);
  let written: boolean;
  try {
    written = (await store.save(json!, 0)) === true;
  } catch (error) {
    throw planError(
      "STORE_FAILED",
      `the store failed to write the first record of the plan ${id}, and the write may have passed: nothing was signed or sent`,
      { planId: id!, cause: error },
    );
  }
  if (written) return objectOver(builder, record, live, probe);
  const stored = await loadRecord(store, id!);
  if (stored === undefined)
    throw planError(
      "VERSION_CONFLICT",
      `the store refused the first record of the plan ${id} and holds none: nothing was signed or sent`,
      { planId: id! },
    );
  checkRecordNetwork(builder, stored);
  if (!isOrderOf(stored, record))
    throw planError(
      "PLAN_EXISTS",
      planExists(
        id!,
        "the steps just built are dropped, and nothing was written",
      ),
      {
        planId: id!,
      },
    );
  // The stored plan may hold steps the plan just built does not: the probe is made again
  return objectOver(builder, stored, live, "owed");
};

/**
 * A recorded plan, with the live objects given again: by its id from the builder's store, or
 * from its JSON. It makes no request to the chain and does not call the payer; the provider is
 * probed before the first delivery. The transactions are those of the record, each read again
 * and its witnesses verified against its body.
 *
 * On a builder with a store the store holds the plan: a JSON whose id the store holds gives the
 * stored record when the stored revision is the same or later, whatever the JSON says; a JSON of
 * a later revision than the stored one is refused, since only a copy that left the store can be
 * ahead of it. So a mark the store holds is never written over.
 * @throws TxPlanError MISSING_STORE for an id on a builder without a store; MISSING_ID for an
 *   id that is not a non-empty string, and for a record without one on a builder with a store;
 *   PLAN_NOT_FOUND; VERSION_CONFLICT for a JSON ahead of the stored record; STORE_FAILED;
 *   INVALID_STATE (`recordVersion`) for a record this library does not read
 * @throws TxBuildError NETWORK_MISMATCH for a record of another network
 */
export const resumePlan = async (
  builder: TxBuilder,
  source: string | TxPlanJSON,
  given: LiveObjects = {},
): Promise<TxPlan> => {
  const live: LiveObjects = optionsObject(
    given,
    RESUME_MEMBERS,
    RESUME_ALLOWED,
  );
  // A payer of no known form is refused here, as by `builder.plan`; nothing is requested
  if (live.payer !== undefined) toPayerSource(live.payer);
  if (live.trace !== undefined && typeof live.trace !== "function")
    throw invalidOption("trace", live.trace, "a function");
  const { store } = builder;
  let record: PlanRecord;
  if (
    typeof source !== "string" &&
    (typeof source !== "object" || source === null)
  )
    throw planError(
      "MISSING_ID",
      "a plan is resumed by its id, a non-empty string, or from its JSON",
      {},
    );
  if (typeof source === "string") {
    if (store === undefined)
      throw planError(
        "MISSING_STORE",
        "the builder has no store to resume a plan from: give the builder the store the plan was recorded in, or resume it from its JSON",
        {},
      );
    if (source === "")
      throw planError(
        "MISSING_ID",
        "a plan is resumed by its id, a non-empty string",
        {},
      );
    const stored = await loadRecord(store, source);
    if (stored === undefined)
      throw planError("PLAN_NOT_FOUND", `the store holds no plan ${source}`, {
        planId: source,
      });
    record = stored;
  } else {
    record = readPlan(source);
    if (store !== undefined) {
      if (record.id === undefined || record.id === "")
        throw planError(
          "MISSING_ID",
          "a builder with a store keeps every plan under its id, and the record has none",
          {},
        );
      const stored = await loadRecord(store, record.id);
      if (stored !== undefined) {
        if (record.rev > stored.rev)
          throw planError(
            "VERSION_CONFLICT",
            `the JSON of the plan ${record.id} is at revision ${record.rev}, ahead of the stored one at ${stored.rev}: a copy kept apart from the store went on, and the store holds the plan. Nothing was written; resume it by its id`,
            { planId: record.id },
          );
        record = stored;
      }
    }
  }
  checkRecordNetwork(builder, record);
  return objectOver(builder, record, live, "owed");
};

/** The record a plan object holds now */
export const recordOf = (plan: TxPlan): PlanRecord => stateOf(plan).record;

/**
 * The steps a plan given in `after` stands for: those in a block and those that may still land,
 * whole; a final step with its inputs alone, so that what it spent is never selected again, also
 * from a read that still lists it, and what it left is taken from the payer's read, since it may
 * be spent by now. A step that will not land spends and makes nothing
 */
export const standingSteps = (plan: TxPlan): readonly TxStep[] =>
  plan.steps
    .filter((step) => !isDeadStep(step))
    .map((step) => asAfter(step, step.status === "final"));

/** The transactions of `after`, each plan given as the steps it stands for */
const afterOf = (after: PlanOptions["after"]): MakePlanOptions["after"] => {
  // Anything but a plan or a list goes to the build as given, which checks it
  if (!Array.isArray(after) && !(after instanceof TxPlan))
    return after as MakePlanOptions["after"];
  const entries: readonly unknown[] = Array.isArray(after) ? after : [after];
  return entries.flatMap((entry): unknown[] =>
    entry instanceof TxPlan ? [...standingSteps(entry)] : [entry],
  ) as unknown as MakePlanOptions["after"];
};

/**
 * The plan of `builder.plan`. On a builder with a store the store is read first: an id it holds
 * with the same steps and options (the steps it was made with, or all the steps it has, in order;
 * consolidation steps left out of both) is the recorded plan, returned with its recorded
 * transactions, and nothing is built; with other steps or options it is PLAN_EXISTS. Otherwise
 * every step is built (`makePlan`), the provider is probed, and the first record is written
 * before the object is returned.
 * @throws what `makePlan` and `createPlan` throw; TxBuildError INVALID_OPTION (`id`) for an id
 *   that is not a string; TxPlanError MISSING_ID on a builder with a store without an id that
 *   is a non-empty string; PLAN_EXISTS; STORE_FAILED; INVALID_STATE (`recordVersion`) for a
 *   stored record this library does not read; TxBuildError NETWORK_MISMATCH for a stored record
 *   of another network
 */
export const planFor = async (
  builder: TxBuilder,
  steps: StepParts | PlanSteps,
  options: PlanOptions = {},
): Promise<TxPlan> => {
  const { id, payer, trace } = options;
  if (id !== undefined && typeof id !== "string")
    throw invalidOption("id", id, "a non-empty string");
  const live: LiveObjects = {
    ...(payer !== undefined && { payer }),
    ...(trace !== undefined && { trace }),
  };
  const { after, ...rest } = options;
  const given: MakePlanOptions = {
    ...rest,
    // The transactions of `after` are read from their own bytes at the door
    ...(after !== undefined && {
      after: readAfter(afterOf(after), afterBound(builder.params)),
    }),
  };
  // The shapes first, with no request: a step given as text no transaction is read from is
  // refused before the store, the tip or a payer is read
  await checkPlanSteps(builder, steps, given);
  const { store } = builder;
  if (store !== undefined) {
    if (id === undefined || id === "")
      throw planError(
        "MISSING_ID",
        "a builder with a store keeps every plan under its id: give the plan an id, a non-empty string, such as the key of the order",
        {},
      );
    // A record holds data only: a redeemer function is refused before anything is read or built
    for (const parts of givenParts(builder, steps, given)) encodeParts(parts);
    const stored = await loadRecord(store, id);
    if (stored !== undefined) {
      checkRecordNetwork(builder, stored);
      if (!isOrderOf(stored, await orderOf(builder, steps, given)))
        throw planError(
          "PLAN_EXISTS",
          planExists(id, "nothing was built or written"),
          {
            planId: id,
          },
        );
      return objectOver(builder, stored, live, "owed");
    }
  }
  return createPlan(builder, await makePlan(builder, steps, given), live);
};
