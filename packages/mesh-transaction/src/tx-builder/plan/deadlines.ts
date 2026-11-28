import type { NetworkConfig } from "@meshsdk/common";

import type { PlanDeadlines, WaitTarget } from "./types";
import { TxBuildError } from "../errors";
import { heldValue, textShape } from "../parts/shape";

// The deadlines of plans and the waiting of their calls: the built-in values, the order in
// which the builder's defaults, a plan's options and a call's options override them, and the
// check of every value. `awaitInclusion()` of a `BuiltTx` waits by the same defaults and
// checks. Nothing here is exported from the package.

/** The waiting of one call; never written into the plan */
export type WaitOptions = {
  /** How far the call goes; `"included"` by default */
  waitFor?: WaitTarget;
  /**
   * How long the call waits for a block or for depth, in ms. Above 0; 120 000 by default, and
   * for `"final"` the plan's `confirmations` × 30 000 + 120 000
   */
  timeoutMs?: number;
  /** The pause between two looks at the chain, in ms; above 0; the builder's, else 5 000 */
  pollMs?: number;
  /** Aborts the whole call with ABORTED */
  signal?: AbortSignal;
};

/** The builder's `planDefaults`: the three deadlines and the pace of waiting */
export type PlanDefaults = PlanDeadlines & {
  pollMs?: number;
  resendMs?: number;
};

/** The deadlines a plan holds: every one of them, as a number */
export type EffectiveDeadlines = Readonly<Required<PlanDeadlines>>;

/** The waiting of one call, every value worked out */
export type EffectiveWait = {
  readonly waitFor: WaitTarget;
  readonly timeoutMs: number;
  readonly pollMs: number;
  readonly resendMs: number;
};

/** The deadlines of a plan that neither it nor its builder sets */
export const DEFAULT_DEADLINES: EffectiveDeadlines = Object.freeze({
  ttlMs: 600_000,
  expiryMarginMs: 600_000,
  confirmations: 30,
});

/** The pause between two looks at the chain while waiting, in ms */
export const DEFAULT_POLL_MS = 5_000;
/** How often the same bytes go again while a plan is sent, in ms */
export const DEFAULT_RESEND_MS = 120_000;
/**
 * How long a call waits for a block, in ms: a plan's call, and `awaitInclusion()` of a transaction
 */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** How long a call waits for `final` per block of depth, in ms, on top of `DEFAULT_TIMEOUT_MS` */
const FINAL_TIMEOUT_PER_BLOCK_MS = 30_000;

const WAIT_TARGETS: readonly WaitTarget[] = ["sent", "included", "final"];

const ABOVE_ZERO = "a finite number of milliseconds above 0";
const ZERO_OR_MORE = "a finite number of milliseconds, 0 or more";
const WHOLE_BLOCKS = "a whole number of blocks, 0 or more";

/**
 * A value given by mistake, as a message tells it: a text by its shape, as it may be a key given
 * by mistake
 */
const describe = (value: unknown): string => {
  if (typeof value === "string") return textShape(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "object" && value !== null)
    return Array.isArray(value) ? "a list" : "an object";
  return String(value);
};

const invalidOption = (option: string, value: unknown, allowed: string) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${describe(value)}`,
    { details: { option, value: heldValue(value), allowed } },
  );

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** A given number of ms above 0 */
const checkPositive = (option: string, value: unknown) => {
  if (value !== undefined && !(isFiniteNumber(value) && value > 0))
    throw invalidOption(option, value, ABOVE_ZERO);
};

/**
 * Checks the deadlines a plan or a builder gives: `ttlMs` above 0, `expiryMarginMs` 0 or
 * more, `confirmations` a whole number 0 or more, each a finite number; a deadline not given is
 * not checked
 * @throws TxBuildError INVALID_OPTION naming the first deadline out of its range
 */
export const checkDeadlines = (deadlines: PlanDeadlines) => {
  const { ttlMs, expiryMarginMs, confirmations } = deadlines;
  checkPositive("ttlMs", ttlMs);
  if (
    expiryMarginMs !== undefined &&
    !(isFiniteNumber(expiryMarginMs) && expiryMarginMs >= 0)
  )
    throw invalidOption("expiryMarginMs", expiryMarginMs, ZERO_OR_MORE);
  if (
    confirmations !== undefined &&
    !(Number.isSafeInteger(confirmations) && confirmations >= 0)
  )
    throw invalidOption("confirmations", confirmations, WHOLE_BLOCKS);
};

/**
 * Checks the builder's `planDefaults` and copies the members it knows: the three deadlines as
 * `checkDeadlines` checks them, `pollMs` above 0, and `resendMs` at least the builder's `pollMs`
 * (its own, else 5 000). A `resendMs` not given is not checked.
 * @throws TxBuildError INVALID_OPTION naming `planDefaults` when it is not an object, else the
 *   first member out of its range
 */
export const checkPlanDefaults = (
  value: unknown,
): Readonly<PlanDefaults> | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalidOption(
      "planDefaults",
      value,
      "an object of ttlMs, expiryMarginMs, confirmations, pollMs and resendMs",
    );
  const defaults = value as PlanDefaults;
  checkDeadlines(defaults);
  checkPositive("pollMs", defaults.pollMs);
  const pollMs = defaults.pollMs ?? DEFAULT_POLL_MS;
  const { resendMs } = defaults;
  if (
    resendMs !== undefined &&
    !(isFiniteNumber(resendMs) && resendMs >= pollMs)
  )
    throw invalidOption(
      "resendMs",
      resendMs,
      `a finite number of milliseconds, at least the builder's pollMs (${pollMs})`,
    );
  const copy: PlanDefaults = {};
  for (const key of [
    "ttlMs",
    "expiryMarginMs",
    "confirmations",
    "pollMs",
    "resendMs",
  ] as const)
    if (defaults[key] !== undefined) copy[key] = defaults[key];
  return Object.freeze(copy);
};

/**
 * The deadlines of a new plan: each its own option, else the builder's default, else the
 * built-in value. The plan's options are checked here; the builder's were checked when it was
 * made.
 * @throws TxBuildError INVALID_OPTION naming the first of the plan's deadlines out of its range
 */
export const effectiveDeadlines = (
  own: PlanDeadlines,
  defaults: Readonly<PlanDefaults> | undefined,
): EffectiveDeadlines => {
  checkDeadlines(own);
  return Object.freeze({
    ttlMs: own.ttlMs ?? defaults?.ttlMs ?? DEFAULT_DEADLINES.ttlMs,
    expiryMarginMs:
      own.expiryMarginMs ??
      defaults?.expiryMarginMs ??
      DEFAULT_DEADLINES.expiryMarginMs,
    confirmations:
      own.confirmations ??
      defaults?.confirmations ??
      DEFAULT_DEADLINES.confirmations,
  });
};

/**
 * Checks the wait options of a call: `waitFor` one of `"sent"`, `"included"`, `"final"`;
 * `timeoutMs` and `pollMs` finite numbers above 0. An option not given is not checked.
 * @throws TxBuildError INVALID_OPTION naming the first option out of its range
 */
export const checkWaitOptions = (options: WaitOptions) => {
  const { waitFor, timeoutMs, pollMs } = options;
  if (waitFor !== undefined && !WAIT_TARGETS.includes(waitFor))
    throw invalidOption("waitFor", waitFor, '"sent", "included" or "final"');
  checkPositive("timeoutMs", timeoutMs);
  checkPositive("pollMs", pollMs);
};

/**
 * The waiting of one call. `waitFor`: the call's, else `"included"`. `timeoutMs`: the call's as
 * given, else 120 000, and for `"final"` the plan's `confirmations` × 30 000 + 120 000.
 * `pollMs`: the call's, else the builder's, else 5 000. `resendMs`: the builder's, else 120 000.
 * The call's options are checked here.
 * @throws TxBuildError INVALID_OPTION naming the first of the call's options out of its range
 */
export const effectiveWait = (
  options: WaitOptions,
  deadlines: EffectiveDeadlines,
  defaults: Readonly<PlanDefaults> | undefined,
): EffectiveWait => {
  checkWaitOptions(options);
  const waitFor = options.waitFor ?? "included";
  return {
    waitFor,
    timeoutMs:
      options.timeoutMs ??
      (waitFor === "final"
        ? deadlines.confirmations * FINAL_TIMEOUT_PER_BLOCK_MS +
          DEFAULT_TIMEOUT_MS
        : DEFAULT_TIMEOUT_MS),
    pollMs: options.pollMs ?? defaults?.pollMs ?? DEFAULT_POLL_MS,
    resendMs: defaults?.resendMs ?? DEFAULT_RESEND_MS,
  };
};

/**
 * The forecast horizon of the public networks, in slots: 3k/f, the least a node guarantees.
 * A node refuses a Plutus transaction whose validity ends past it.
 */
const FORECAST_SLOTS: Readonly<Record<string, number>> = Object.freeze({
  mainnet: 129_600,
  preprod: 129_600,
  preview: 25_920,
});

/**
 * The last slot at which a step that runs a Plutus script may end (its `invalidHereafter`): the
 * tip's slot, or the step's lower bound when that is later, plus the network's forecast
 * horizon. Undefined for a network whose horizon is not known (a custom network): nothing is
 * checked there, and the node's refusal answers.
 * @param tipSlot The slot of the tip the step is built at
 * @param fromSlot The step's `invalidBefore`, when it has one
 */
export const horizonSlot = (
  network: NetworkConfig,
  tipSlot: number,
  fromSlot?: number,
): number | undefined => {
  const horizon = Object.prototype.hasOwnProperty.call(
    FORECAST_SLOTS,
    network.name,
  )
    ? FORECAST_SLOTS[network.name]
    : undefined;
  if (horizon === undefined) return undefined;
  return Math.max(tipSlot, fromSlot ?? tipSlot) + horizon;
};
