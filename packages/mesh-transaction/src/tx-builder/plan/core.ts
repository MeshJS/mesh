import type { NetworkConfig } from "@meshsdk/common";
import { Crypto, HexBlob } from "@meshsdk/core-cst";

import type { BuiltTxData } from "../builder";
import type { LinkedPart, TxPart } from "../parts/types";
import type { KeyWitness } from "../sign";
import type { TxPlanStatus, TxStepStatus } from "./types";

// The state machine of a plan: a pure function from a record and an event to the next
// record. A plan is a group of transactions built together, whose bodies never change; the
// record holds them and what is learnt about them: signatures, deliveries, the answers to them,
// what the chain showed, and the mark that the plan sends nothing more. It makes no request and
// reads no clock: every time it compares comes in the event or the record. Nothing here is
// exported from the package.

/** The record format this library writes */
export const PLAN_RECORD_VERSION = 2;

/** The step as the application gave it: its parts, links kept as links, and its data options */
export type StepGiven = {
  readonly parts: readonly (TxPart | LinkedPart)[];
  readonly options?: Readonly<Record<string, unknown>>;
};

/** One step as the state machine reads and writes it */
export type StepRecord = {
  /** Its name in the plan; unique */
  readonly name: string;
  /** `"consolidation"` for a step the plan put in itself */
  readonly kind?: "consolidation";
  readonly status: TxStepStatus;
  /** The hash of its body; signatures do not change it */
  readonly txHash: string;
  /**
   * The block it was last found in; present while it is included, final or failed, and kept
   * when a rollback takes it out of the block: a step that has it was found in a block once
   */
  readonly seen?: { readonly slot: number; readonly block?: string };
  /**
   * The names of the earlier steps whose outputs it spends, reads or puts up as collateral, in
   * the order of the plan
   */
  readonly standsOn: readonly string[];
  /**
   * The hashes of the transactions given in `after` whose outputs it spends, reads or puts up as
   * collateral, in the order of `after`; absent when none. A refusal of the step proves nothing
   * while one of them is not in a block
   */
  readonly after?: readonly string[];
  /**
   * A transaction on chain before the step, for a step every input of which comes from a
   * transaction of `after`: the source of an input of one of them that is not itself of `after`.
   * A look searches it with the step, so that a step that is not found, past its end of
   * validity and the margin, can be shown expired by a search that knows the chain before it;
   * absent otherwise
   */
  readonly expirySource?: string;
  /** The transaction, as built; never changed */
  readonly built: BuiltTxData;
  /**
   * The vkey and bootstrap witnesses held, each verified against the body before it was given
   * here, at most one per key hash, vkey witnesses first
   */
  readonly witnesses: readonly KeyWitness[];
  /** Witnesses of keys the body does not ask for that its fee counts; absent when none */
  readonly extraKeyWitnesses?: number;
  /** The step as it was given, when the plan built it from parts */
  readonly given?: StepGiven;
  /** How many deliveries of it were recorded */
  readonly sends: number;
  /** How many of those deliveries the submitter refused */
  readonly refused: number;
};

/**
 * A plan as the state machine reads and writes it, in memory: transactions as
 * `BuiltTxData`, with their `bigint`s. `encodePlan` gives its JSON. Nothing in it assumes
 * that the set of steps is fixed when the plan is made: steps are only ever appended.
 */
export type PlanRecord = {
  readonly kind: "TxPlan";
  readonly version: number;
  readonly id?: string;
  /** One higher with every change; 0 only for the empty plan a first record is made from */
  readonly rev: number;
  readonly status: TxPlanStatus;
  /** The decision that the plan signs and sends nothing more; never removed */
  readonly stopped?: true;
  /**
   * The plan came to `stopped` by steps that will not land: it sends no step for the first time,
   * whatever a later look finds; never removed
   */
  readonly halted?: true;
  /** The id of the plan this one was made in place of */
  readonly replaces?: string;
  /** The id of the plan made in place of this one */
  readonly replacedBy?: string;
  readonly network: string | NetworkConfig;
  readonly deadlines: {
    readonly ttlMs: number;
    readonly expiryMarginMs: number;
    readonly confirmations: number;
  };
  /** The steps, in the order they are sent */
  readonly steps: readonly StepRecord[];
  /** The data options of the plan */
  readonly options: Readonly<Record<string, unknown>>;
};

/**
 * The provider's tip: its slot, the POSIX ms that slot starts at, its height when known, and the
 * local clock's time when it was read
 */
export type PlanTip = {
  readonly slot: number;
  readonly timeMs: number;
  readonly height?: number;
  /** The local clock when the tip was read, POSIX ms; without it no step expires by this tip */
  readonly clockMs?: number;
};

/**
 * How far the tip's time may be ahead of the local clock, in ms, for the tip to expire a step. A
 * block is never made for a slot that has not begun, so a tip ahead of the clock shows a clock
 * that is behind or a provider that is wrong; two minutes covers a clock that drifted, and a tip
 * further ahead expires nothing
 */
export const TIP_AHEAD_TOLERANCE_MS = 120_000;

/** Whether the tip is ahead of the local clock by more than the tolerance */
export const tipAheadOfClock = (tip: PlanTip): boolean =>
  tip.clockMs !== undefined &&
  tip.timeMs - tip.clockMs > TIP_AHEAD_TOLERANCE_MS;

/**
 * What a fresh search said about one transaction: a step of the plan, or a transaction one of
 * its inputs comes from. `valid` absent: the search did not say whether its scripts passed.
 */
export type TxSighting =
  | {
      readonly txHash: string;
      readonly found: true;
      readonly slot: number;
      readonly block?: string;
      readonly blockHeight?: number;
      readonly valid?: boolean;
    }
  | { readonly txHash: string; readonly found: false };

/** A step as an event appends it; the state machine gives it its status and counts */
export type NewStep = Pick<
  StepRecord,
  | "name"
  | "kind"
  | "standsOn"
  | "after"
  | "expirySource"
  | "built"
  | "extraKeyWitnesses"
  | "given"
> & {
  /** Witnesses it holds already, verified against its body */
  readonly witnesses?: readonly KeyWitness[];
};

/** A fact the state machine applies to a record */
export type PlanEvent =
  /**
   * Steps appended at the end of the plan, in order. Every step already in the plan stays as it
   * is. The first record is this event applied to the empty plan
   */
  | { readonly type: "steps"; readonly steps: readonly NewStep[] }
  /**
   * Witnesses that were checked against the body of the step. Once a delivery of the step is
   * recorded its witnesses are fixed, and the event changes nothing
   */
  | {
      readonly type: "signature";
      readonly step: string;
      readonly witnesses: readonly KeyWitness[];
    }
  /**
   * The step is about to be delivered; applied and written before the bytes leave. A step that
   * lacks a key is never delivered. A plan that is `stopping` and not marked takes it only for a
   * step that was sent before and stands on no step that will not land: the same bytes again.
   * So does a plan that came to `stopped` by its steps once (`halted`), whatever was found since
   */
  | { readonly type: "delivery"; readonly step: string }
  /** The submitter took a recorded delivery of the step */
  | { readonly type: "answer"; readonly step: string; readonly refused: false }
  /**
   * The ledger refused a recorded delivery of the step. `found`: what a search made after the
   * refusal said of the step. `standingInBlock`: a search made after the refusal found in a
   * block every step it stands on and every transaction of `after` it stands on. Absent: not
   * known
   */
  | {
      readonly type: "answer";
      readonly step: string;
      readonly refused: true;
      readonly found?: boolean;
      readonly standingInBlock?: boolean;
    }
  /**
   * What one look at the chain showed. What is absent is unknown. A step found in a block is
   * included, then final by depth, whatever it was called before; a final step never changes. A
   * step is orphaned exactly while a step it stands on will not land; once none does, it is
   * what its own record and this look make of it
   */
  | {
      readonly type: "observation";
      readonly tip?: PlanTip;
      readonly sightings?: readonly TxSighting[];
    }
  /**
   * The decision that the plan signs and sends nothing more; `replacedBy` names the plan made in
   * its place. A final or stopped plan takes `replacedBy` once, with the mark, and nothing else
   */
  | { readonly type: "stop"; readonly replacedBy?: string };

/** Why an event is refused */
export type PlanRefusal =
  /** The plan is final or stopped: it takes only looks at the chain and the mark */
  | "terminal"
  /** The plan is marked: it signs and sends nothing more */
  | "stopped"
  /** The event is not allowed in the status of the plan or of its step */
  | "status"
  /** The event names a step the plan does not have */
  | "step"
  /** Steps that cannot be appended as given */
  | "steps";

/** The answer of the state machine: the next record, or why the event was refused */
export type PlanAdvanced =
  /** Accepted; `json` is the very record given when nothing changed */
  | { readonly ok: true; readonly json: PlanRecord }
  /** Refused; the record stays as it was */
  | {
      readonly ok: false;
      readonly reason: PlanRefusal;
      readonly message: string;
    };

const DEAD: ReadonlySet<TxStepStatus> = new Set([
  "expired",
  "failed",
  "orphaned",
]);
const UNLANDED: ReadonlySet<TxStepStatus> = new Set([
  "built",
  "signed",
  "sent",
  "rejected",
]);
const LANDED: ReadonlySet<TxStepStatus> = new Set(["included", "final"]);

/** Whether a step will not land: expired, failed or orphaned */
export const isDeadStep = (step: Pick<StepRecord, "status">) =>
  DEAD.has(step.status);

/** Whether a step is not in a block and not known to be dead */
export const isUnlandedStep = (step: Pick<StepRecord, "status">) =>
  UNLANDED.has(step.status);

const refuse = (reason: PlanRefusal, message: string): PlanAdvanced => ({
  ok: false,
  reason,
  message,
});

/** The end of a step's validity, POSIX ms; undefined when its transaction has none */
export const stepUntil = (step: Pick<StepRecord, "built">) => {
  const until = step.built.validity?.until;
  return typeof until === "number" && Number.isFinite(until)
    ? until
    : undefined;
};

/**
 * The keys that must sign a step and have not: a key has signed only by a vkey witness whose
 * public key hashes to it. A bootstrap witness signs for no key hash
 */
export const missingKeys = (
  step: Pick<StepRecord, "built" | "witnesses">,
): string[] =>
  step.built.signers.keyHashes.filter(
    (key) =>
      !step.witnesses.some(
        (witness) =>
          witness.kind === "vkey" && keyHashOfVkey(witness.vkey) === key,
      ),
  );

const VKEY = /^[0-9a-f]{64}$/;

/**
 * The hash of a public key, worked out from its bytes; undefined for a text that is not a public
 * key of 32 bytes in hex. A witness counts for this key alone, whatever key it is named with
 */
export const keyHashOfVkey = (vkey: unknown): string | undefined => {
  if (typeof vkey !== "string" || !VKEY.test(vkey)) return undefined;
  return Crypto.blake2b.hash(HexBlob(vkey), 28).toString();
};

/**
 * The hashes of the transactions whose outputs a transaction spends, reads or puts up as
 * collateral, lower-cased, each once
 */
export const sourcesOf = (
  built: Pick<BuiltTxData, "inputs" | "referenceInputs" | "collateral">,
): string[] =>
  Array.from(
    new Set(
      [
        ...built.inputs,
        ...(built.referenceInputs ?? []),
        ...(built.collateral?.inputs ?? []),
      ].map((utxo) => utxo.txHash.toLowerCase()),
    ),
  );

/**
 * The earlier steps a transaction stands on: those whose hash is the transaction of one of its
 * inputs, reference inputs or collateral inputs, in the order of `earlier`
 */
export const standsOnOf = (
  built: Pick<BuiltTxData, "inputs" | "referenceInputs" | "collateral">,
  earlier: readonly Pick<StepRecord, "name" | "txHash">[],
): string[] => {
  const sources = new Set(sourcesOf(built));
  return earlier
    .filter((step) => sources.has(step.txHash.toLowerCase()))
    .map((step) => step.name);
};

/** The status of a plan, worked out from its steps and its marks */
export const planStatus = (
  record: Pick<PlanRecord, "steps" | "stopped" | "halted">,
): TxPlanStatus => {
  const { steps } = record;
  if (steps.length === 0) return "pending";
  if (steps.every((step) => step.status === "final")) return "final";
  const halted =
    record.stopped === true || record.halted === true || steps.some(isDeadStep);
  if (!halted) return "pending";
  return steps.every((step) => step.status === "final" || isDeadStep(step))
    ? "stopped"
    : "stopping";
};

/** The steps found in a block: included and final */
export const landedSteps = (record: Pick<PlanRecord, "steps">) =>
  record.steps.filter((step) => LANDED.has(step.status));

/** The steps not in a block that may still land: neither expired, failed nor orphaned */
export const liveSteps = (record: Pick<PlanRecord, "steps">) =>
  record.steps.filter(isUnlandedStep);

/**
 * The time after which no step of the plan that is not in a block can land: the latest end of
 * validity among its transactions, POSIX ms; undefined when one of them has none
 */
export const planUntil = (
  record: Pick<PlanRecord, "steps">,
): number | undefined => {
  let latest: number | undefined;
  for (const step of record.steps) {
    const until = stepUntil(step);
    if (until === undefined) return undefined;
    latest = latest === undefined ? until : Math.max(latest, until);
  }
  return latest;
};

/** An empty plan with these members: the record the first `steps` event is applied to */
export const emptyPlan = (
  init: Pick<PlanRecord, "id" | "network" | "deadlines" | "options"> &
    Partial<Pick<PlanRecord, "replaces">>,
): PlanRecord => ({
  kind: "TxPlan",
  version: PLAN_RECORD_VERSION,
  ...(init.id !== undefined && { id: init.id }),
  rev: 0,
  status: "pending",
  ...(init.replaces !== undefined && { replaces: init.replaces }),
  network: init.network,
  deadlines: init.deadlines,
  steps: [],
  options: init.options,
});

/**
 * The record with these steps and this mark, its status worked out again and its revision one
 * higher. A plan that comes to `stopped` by its steps, unmarked, records that it did (`halted`)
 */
const next = (
  json: PlanRecord,
  changes: Partial<Pick<PlanRecord, "steps" | "stopped" | "replacedBy">>,
): PlanRecord => {
  const record = { ...json, ...changes };
  const status = planStatus(record);
  const halted =
    status === "stopped" && record.stopped !== true && record.halted !== true;
  return {
    ...record,
    ...(halted && { halted: true as const }),
    rev: json.rev + 1,
    status,
  };
};

const replaceAt = (
  steps: readonly StepRecord[],
  index: number,
  step: StepRecord,
): StepRecord[] => steps.map((each, i) => (i === index ? step : each));

/** A witness with its own members only, its key hash worked out from its public key */
const witnessCopy = (witness: KeyWitness, keyHash: string): KeyWitness => ({
  kind: witness.kind,
  vkey: witness.vkey,
  signature: witness.signature,
  keyHash,
  ...(witness.chainCode !== undefined && { chainCode: witness.chainCode }),
  ...(witness.attributes !== undefined && { attributes: witness.attributes }),
});

/**
 * The witnesses held with the offered ones added: one of each kind per public key, the first
 * kept, vkey witnesses before bootstrap ones, each in the order it came. A witness counts for
 * the key its own public key hashes to, never for the key it is named with, and one whose
 * public key cannot be read is not kept
 */
const mergeWitnesses = (
  held: readonly KeyWitness[],
  offered: readonly KeyWitness[],
): KeyWitness[] => {
  const all = [...held];
  for (const witness of offered) {
    const keyHash = keyHashOfVkey(witness?.vkey);
    if (keyHash === undefined) continue;
    if (
      !all.some(
        (each) => each.kind === witness.kind && each.keyHash === keyHash,
      )
    )
      all.push(witnessCopy(witness, keyHash));
  }
  return [
    ...all.filter((witness) => witness.kind === "vkey"),
    ...all.filter((witness) => witness.kind !== "vkey"),
  ];
};

/**
 * Applies one event to a plan's record. The answer is the next record, with `status` worked
 * out again and `rev` one higher when anything changed, or the very record given when nothing
 * did; or a refusal, which changes nothing. The record and the event are never modified.
 */
export const advancePlan = (
  json: PlanRecord,
  event: PlanEvent,
): PlanAdvanced => {
  switch (event.type) {
    case "steps":
      return append(json, event);
    case "signature":
      return signature(json, event);
    case "delivery":
      return delivery(json, event);
    case "answer":
      return answer(json, event);
    case "observation":
      return observe(json, event);
    case "stop":
      return stop(json, event);
  }
};

type EventOf<T extends PlanEvent["type"]> = Extract<PlanEvent, { type: T }>;

const isTerminal = (json: PlanRecord) =>
  json.status === "final" || json.status === "stopped";

const terminal = (json: PlanRecord, type: string) =>
  refuse(
    "terminal",
    `the plan is ${json.status}: a terminal plan takes no ${type}`,
  );

const marked = (type: string) =>
  refuse(
    "stopped",
    `the plan is marked to sign and send nothing more: it takes no ${type}`,
  );

/** The index of the step with this name, or a refusal */
const indexOf = (
  json: PlanRecord,
  name: string,
  type: string,
): number | PlanAdvanced => {
  const index = json.steps.findIndex((step) => step.name === name);
  if (index < 0)
    return refuse(
      "step",
      `the plan has no step ${JSON.stringify(name)} for a ${type}`,
    );
  return index;
};

/** Why a new step cannot be appended after `earlier`; undefined when it can */
const newStepProblem = (
  step: NewStep,
  earlier: readonly Pick<StepRecord, "name" | "txHash">[],
): string | undefined => {
  const quoted = JSON.stringify(step.name);
  if (typeof step.name !== "string" || step.name === "")
    return "a step's name is a non-empty text";
  if (earlier.some((each) => each.name === step.name))
    return `the plan already has a step ${quoted}`;
  const txHash = step.built.txHash;
  if (earlier.some((each) => each.txHash === txHash))
    return `the plan already has the transaction ${txHash} of step ${quoted}`;
  if (step.kind === "consolidation" && step.given !== undefined)
    return `the consolidation step ${quoted} has no parts it was given`;
  const names = new Set(earlier.map((each) => each.name));
  if (new Set(step.standsOn).size !== step.standsOn.length)
    return `step ${quoted} names a step it stands on twice`;
  for (const name of step.standsOn)
    if (!names.has(name))
      return `step ${quoted} stands on ${JSON.stringify(name)}, which is not a step before it`;
  const sources = standsOnOf(step.built, earlier);
  if (
    sources.length !== step.standsOn.length ||
    sources.some((name) => !step.standsOn.includes(name))
  )
    return `step ${quoted} stands on [${step.standsOn.join(", ")}], and its transaction spends, reads or puts up outputs of [${sources.join(", ")}]`;
  return afterProblem(step, earlier);
};

/**
 * Why the transactions of `after` a step is given as standing on cannot be: each is one its
 * transaction spends, reads or puts up an output of, none twice, and none a step of the plan
 */
export const afterProblem = (
  step: Pick<StepRecord, "name" | "after" | "expirySource" | "built">,
  earlier: readonly Pick<StepRecord, "txHash">[],
): string | undefined => {
  const after = step.after ?? [];
  const quoted = JSON.stringify(step.name);
  if (step.after !== undefined && after.length === 0)
    return `step ${quoted} stands on no transaction of after, and names the list`;
  if (new Set(after).size !== after.length)
    return `step ${quoted} names a transaction of after twice`;
  const sources = new Set(sourcesOf(step.built));
  for (const txHash of after) {
    if (!sources.has(txHash.toLowerCase()))
      return `step ${quoted} stands on the transaction ${txHash} of after, and spends, reads or puts up no output of it`;
    if (
      earlier.some((each) => each.txHash.toLowerCase() === txHash.toLowerCase())
    )
      return `step ${quoted} names the transaction ${txHash} of a step of the plan among those of after`;
  }
  const source = step.expirySource?.toLowerCase();
  if (source === undefined) return undefined;
  const lowered = after.map((txHash) => txHash.toLowerCase());
  if (!/^[0-9a-f]{64}$/.test(source))
    return `step ${quoted} names an expirySource that is not a transaction hash`;
  if (
    step.built.inputs.length === 0 ||
    step.built.inputs.some(
      (input) => !lowered.includes(input.txHash.toLowerCase()),
    )
  )
    return `step ${quoted} names an expirySource, and an input of it comes from no transaction of after`;
  if (
    lowered.includes(source) ||
    earlier.some((each) => each.txHash.toLowerCase() === source)
  )
    return `step ${quoted} names as its expirySource a transaction of after or of a step of the plan`;
  return undefined;
};

const append = (json: PlanRecord, event: EventOf<"steps">): PlanAdvanced => {
  const given = event.steps;
  if (given.length === 0) return refuse("steps", "no step is given to append");
  // The same steps again, as a second writer applies them: nothing changes
  const held = given.filter((step) =>
    json.steps.some(
      (each) => each.name === step.name && each.txHash === step.built.txHash,
    ),
  );
  if (held.length === given.length) return { ok: true, json };
  if (held.length > 0)
    return refuse(
      "steps",
      `the plan already has some of the steps given (${held.map((step) => step.name).join(", ")}) and not the others`,
    );
  if (isTerminal(json)) return terminal(json, "steps");
  if (json.stopped === true) return marked("steps");
  if (json.status !== "pending")
    return refuse(
      "status",
      `the plan is ${json.status}: steps are appended only to a plan that may still complete`,
    );
  const steps = [...json.steps];
  for (const step of given) {
    const problem = newStepProblem(step, steps);
    if (problem !== undefined) return refuse("steps", problem);
    const witnesses = mergeWitnesses([], step.witnesses ?? []);
    const record: StepRecord = {
      name: step.name,
      ...(step.kind !== undefined && { kind: step.kind }),
      status: "built",
      txHash: step.built.txHash,
      standsOn: [...step.standsOn],
      ...(step.after !== undefined &&
        step.after.length > 0 && { after: [...step.after] }),
      ...(step.expirySource !== undefined && {
        expirySource: step.expirySource.toLowerCase(),
      }),
      built: step.built,
      witnesses,
      ...(step.extraKeyWitnesses !== undefined &&
        step.extraKeyWitnesses > 0 && {
          extraKeyWitnesses: step.extraKeyWitnesses,
        }),
      ...(step.given !== undefined && { given: step.given }),
      sends: 0,
      refused: 0,
    };
    steps.push(
      missingKeys(record).length === 0
        ? { ...record, status: "signed" }
        : record,
    );
  }
  return { ok: true, json: next(json, { steps }) };
};

const signature = (
  json: PlanRecord,
  event: EventOf<"signature">,
): PlanAdvanced => {
  if (isTerminal(json)) return terminal(json, "signature");
  if (json.stopped === true) return marked("signature");
  const index = indexOf(json, event.step, "signature");
  if (typeof index !== "number") return index;
  const step = json.steps[index]!;
  // Every send of a step is the same bytes: the witnesses of a delivered step never change
  if (step.sends > 0) return { ok: true, json };
  if (!isUnlandedStep(step))
    return refuse(
      "status",
      `step ${JSON.stringify(step.name)} is ${step.status}: a step takes signatures only before it is in a block`,
    );
  const witnesses = mergeWitnesses(step.witnesses, event.witnesses);
  if (witnesses.length === step.witnesses.length) return { ok: true, json };
  const signed =
    step.status === "built" &&
    missingKeys({ built: step.built, witnesses }).length === 0;
  const updated: StepRecord = {
    ...step,
    witnesses,
    ...(signed && { status: "signed" as const }),
  };
  return {
    ok: true,
    json: next(json, { steps: replaceAt(json.steps, index, updated) }),
  };
};

const delivery = (
  json: PlanRecord,
  event: EventOf<"delivery">,
): PlanAdvanced => {
  if (isTerminal(json)) return terminal(json, "delivery");
  if (json.stopped === true) return marked("delivery");
  const index = indexOf(json, event.step, "delivery");
  if (typeof index !== "number") return index;
  const step = json.steps[index]!;
  const quoted = JSON.stringify(step.name);
  if (
    step.status !== "signed" &&
    step.status !== "sent" &&
    step.status !== "rejected"
  )
    return refuse(
      "status",
      `step ${quoted} is ${step.status}: only a fully signed step that is not in a block is delivered`,
    );
  if (missingKeys(step).length > 0)
    return refuse(
      "status",
      `step ${quoted} lacks the signature of ${missingKeys(step).length} key(s): only a fully signed step is delivered`,
    );
  if (json.status !== "pending") {
    // A plan that does not go on sends no step for the first time; the same bytes of a step
    // sent before may go again, unless it stands on a step that will not land
    const again =
      step.status !== "signed" &&
      !step.standsOn.some((name) =>
        json.steps.some((each) => each.name === name && isDeadStep(each)),
      );
    if (!again)
      return refuse(
        "status",
        `the plan is ${json.status}: it does not go on, and sends no step for the first time`,
      );
  }
  const updated: StepRecord = {
    ...step,
    status: "sent",
    sends: step.sends + 1,
  };
  return {
    ok: true,
    json: next(json, { steps: replaceAt(json.steps, index, updated) }),
  };
};

const answer = (json: PlanRecord, event: EventOf<"answer">): PlanAdvanced => {
  if (isTerminal(json)) return terminal(json, "answer");
  const index = indexOf(json, event.step, "answer");
  if (typeof index !== "number") return index;
  const step = json.steps[index]!;
  if (step.refused >= step.sends)
    return refuse(
      "status",
      `step ${JSON.stringify(step.name)} has no recorded delivery left to answer`,
    );
  // An answer tells nothing about a step that is final or will not land, and never changes it
  if (!event.refused || step.status === "final" || isDeadStep(step))
    return { ok: true, json };
  const refused = step.refused + 1;
  // A refusal counts only when every recorded delivery was refused, a search after it does not
  // find the step, and every transaction it stands on is in a block by a search after it
  const rejected =
    step.status === "sent" &&
    refused === step.sends &&
    event.found === false &&
    event.standingInBlock === true;
  const updated: StepRecord = {
    ...step,
    refused,
    ...(rejected && { status: "rejected" as const }),
  };
  return {
    ok: true,
    json: next(json, { steps: replaceAt(json.steps, index, updated) }),
  };
};

/** The depth of a found block under the tip, when both heights are sound; else undefined */
const depthOf = (
  tip: PlanTip | undefined,
  sighting: Extract<TxSighting, { found: true }>,
): number | undefined => {
  if (tip === undefined) return undefined;
  const { height } = tip;
  const { blockHeight } = sighting;
  if (
    height === undefined ||
    blockHeight === undefined ||
    !Number.isInteger(height) ||
    !Number.isInteger(blockHeight) ||
    height < 0 ||
    blockHeight < 0
  )
    return undefined;
  const depth = height - blockHeight;
  // A slot holds at most one block, so a depth above the slot difference means the heights lie
  if (depth < 0 || depth > tip.slot - sighting.slot) return undefined;
  return depth;
};

const seenOf = (sighting: Extract<TxSighting, { found: true }>) => ({
  slot: sighting.slot,
  ...(sighting.block !== undefined && { block: sighting.block }),
});

/**
 * Whether the tip and the local clock have both passed the end of a step's validity and the
 * margin, and the tip is not ahead of the clock by more than the tolerance
 */
const pastMarginOf = (
  json: PlanRecord,
  step: StepRecord,
  tip: PlanTip | undefined,
): boolean => {
  const until = stepUntil(step);
  if (tip === undefined || until === undefined || tip.clockMs === undefined)
    return false;
  const limit = until + json.deadlines.expiryMarginMs;
  return tip.timeMs >= limit && tip.clockMs >= limit && !tipAheadOfClock(tip);
};

/** What the step's own sighting and the tip make of it */
const byOwnFacts = (
  json: PlanRecord,
  step: StepRecord,
  event: EventOf<"observation">,
  found: ReadonlyMap<string, TxSighting>,
): StepRecord => {
  // A final step never changes; a failed one is in a block with its collateral taken
  if (step.status === "final" || step.status === "failed") return step;
  const sighting = found.get(step.txHash.toLowerCase());
  const { tip } = event;
  // A step called dead changes only when the chain shows it in a block: what the chain shows wins
  if (isDeadStep(step) && sighting?.found !== true) return step;

  if (sighting?.found === true) {
    const plutus = step.built.redeemers.length > 0;
    const valid = sighting.valid ?? (plutus ? undefined : true);
    if (valid === undefined) return step;
    if (valid === false) {
      // An included step found invalid contradicts the earlier find: no fact either way; a
      // step called dead keeps what it was called
      if (step.status === "included" || isDeadStep(step)) return step;
      return { ...step, status: "failed", seen: seenOf(sighting) };
    }
    const depth = depthOf(tip, sighting);
    const final = depth !== undefined && depth >= json.deadlines.confirmations;
    const updated: StepRecord = {
      ...step,
      status: final ? "final" : "included",
      seen: seenOf(sighting),
    };
    const unchanged =
      updated.status === step.status &&
      step.seen?.slot === updated.seen?.slot &&
      step.seen?.block === updated.seen?.block;
    return unchanged ? step : updated;
  }

  if (sighting?.found === false) {
    // A rollback: the bytes are out and may land again, unless the same look shows them dead.
    // The block it was found in is kept: it was found in a block once
    const unlanded: StepRecord =
      step.status === "included" ? { ...step, status: "sent" } : step;
    const pastMargin = pastMarginOf(json, step, tip);
    // The same look found a transaction one of its inputs comes from: the search answers and
    // knows the chain before the step
    const sourceFound =
      step.built.inputs.some(
        (input) => found.get(input.txHash.toLowerCase())?.found === true,
      ) ||
      (step.expirySource !== undefined &&
        found.get(step.expirySource)?.found === true);
    if (pastMargin && sourceFound) return { ...unlanded, status: "expired" };
    return unlanded;
  }
  return step;
};

/**
 * A step by its own record, apart from the steps it stands on: `sent` once a delivery of it is
 * recorded or it was found in a block, else `signed` or `built` by its witnesses
 */
const byOwnRecord = (step: StepRecord): StepRecord => ({
  ...step,
  status:
    step.sends > 0 || step.seen !== undefined
      ? "sent"
      : missingKeys(step).length === 0
        ? "signed"
        : "built",
});

const observe = (
  json: PlanRecord,
  event: EventOf<"observation">,
): PlanAdvanced => {
  const found = new Map<string, TxSighting>();
  for (const sighting of event.sightings ?? [])
    found.set(sighting.txHash.toLowerCase(), sighting);
  // In order, so that a step sees what this look made of the steps it stands on
  const steps: StepRecord[] = [];
  for (const step of json.steps) {
    const deadBelow = step.standsOn.some((name) =>
      steps.some((each) => each.name === name && isDeadStep(each)),
    );
    // Orphaned only while a step it stands on will not land: then the rules of its own record
    const own =
      step.status === "orphaned" && !deadBelow ? byOwnRecord(step) : step;
    let updated = byOwnFacts(json, own, event, found);
    if (isUnlandedStep(updated) && deadBelow)
      updated = { ...updated, status: "orphaned" };
    steps.push(updated);
  }
  if (steps.every((step, i) => step === json.steps[i]))
    return { ok: true, json };
  return { ok: true, json: next(json, { steps }) };
};

const stop = (json: PlanRecord, event: EventOf<"stop">): PlanAdvanced => {
  const { replacedBy } = event;
  if (
    json.replacedBy !== undefined &&
    replacedBy !== undefined &&
    replacedBy !== json.replacedBy
  )
    return refuse(
      "status",
      `the plan was replaced by ${JSON.stringify(json.replacedBy)} already, not by ${JSON.stringify(replacedBy)}`,
    );
  const markReplaced =
    replacedBy !== undefined && json.replacedBy === undefined;
  // A terminal plan takes only the name of the plan made in its place, so that a line of plans
  // never branches
  if ((isTerminal(json) || json.stopped === true) && !markReplaced)
    return { ok: true, json };
  return {
    ok: true,
    json: next(json, {
      stopped: true,
      ...(markReplaced && { replacedBy }),
    }),
  };
};
