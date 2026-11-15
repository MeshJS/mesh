import type {
  BuildEvent,
  BuildOptions,
  BuiltOutput,
  BuiltTxData,
  TxBuilder,
} from "../builder";
import type { PartContext } from "../parts/normalize";
import type {
  CollateralPart,
  LinkedPart,
  ReferenceInputPart,
  SpendDatum,
  SpendPart,
  StepChange,
  StepOutput,
  TxPart,
  Utxo,
  ValidityPart,
} from "../parts/types";
import type { Payer, PayerRead, PayerSource } from "../payer";
import type { NewStep, PlanRecord, PlanTip, StepGiven } from "./core";
import type {
  PlanOptions,
  PlanStep,
  PlanSteps,
  StepOptions,
  StepParts,
} from "./types";
import { isKeyLocked } from "../balance";
import { flattenParts } from "../builder";
import { BuiltTx } from "../built-tx";
import { toKnownUtxos } from "../chain";
import { NOT_UNPAID, TxBuildError, TxError, TxPlanError } from "../errors";
import { checkNetworks } from "../network";
import { invalidOption, typeOf } from "../options";
import { checkLock, spend, toSpendDatum } from "../parts/inputs";
import { fail, freeze, withKnownHash } from "../parts/normalize";
import { validity } from "../parts/scalars";
import { isLinkedPart } from "../parts/unresolved";
import { plainUtxo, utxoKey } from "../parts/utxo";
import { changeAddressOf, givenPayerEntries, toPayerSource } from "../payer";
import { buildConsolidation, isConsolidable } from "./consolidate";
import {
  advancePlan,
  emptyPlan,
  MAX_STEPS,
  planUntil,
  sourcesOf,
  standsOnOf,
} from "./core";
import { effectiveDeadlines, horizonSlot } from "./deadlines";
import { chainObserver } from "./observer";

// Builds a plan: every body at once, in order, each on the UTxOs the steps before it
// leave. Each payer is read once; each step is built with the steps before it as `after`, so
// that their inputs are not selected again and their change at the step's change address is
// selectable; a step spends the change of the step before it of the same payer; a part linked
// to an earlier step is filled in from that step's own transaction; every step the plan builds
// ends at the plan's one deadline. Nothing is signed and nothing is sent. Nothing here is
// exported from the package.

/** The options `makePlan` takes: those of a plan, with `after` as built data only */
export type MakePlanOptions = Omit<PlanOptions, "after"> & {
  after?: BuiltTxData | readonly BuiltTxData[];
};

/**
 * A step the plan built: its transaction, its name, what it stands on, and how it was given; a
 * consolidation step the plan put in itself has its kind and was not given
 */
export type MadeStep = {
  readonly name: string;
  readonly kind?: "consolidation";
  readonly built: BuiltTxData;
  /** The names of the earlier steps whose outputs it spends, reads or puts up as collateral */
  readonly standsOn: readonly string[];
  /** The hashes of the transactions of `after` whose outputs it spends, reads or puts up */
  readonly after?: readonly string[];
  /** A transaction before those of `after`, when every input comes from one of them */
  readonly expirySource?: string;
  readonly given?: StepGiven;
  readonly extraKeyWitnesses?: number;
};

/** A plan built: its steps in order, the first record, the tip it was built at and its deadline */
export type MadePlan = {
  readonly steps: readonly MadeStep[];
  readonly record: PlanRecord;
  readonly tip: PlanTip;
  /** The latest end of validity among its transactions, POSIX ms; undefined when one has none */
  readonly until?: number;
};

/** The name of the step of a plan given as one list of parts */
export const MAIN_STEP = "main";

/** The most steps a plan may have, as the state machine counts them */
export { MAX_STEPS };

/** The start of the names the plan gives the steps it puts in itself */
const RESERVED_PREFIX = "consolidate-";

/** The most consolidation steps a plan has when its options give no limit */
const DEFAULT_CONSOLIDATION_STEPS = 4;

/** The most consolidation steps a plan may be allowed: all its steps but the one they serve */
const MAX_CONSOLIDATION_STEPS = MAX_STEPS - 1;

const CONSOLIDATE_ALLOWED = `true, false or { maxSteps? }, maxSteps a whole number from 1 to ${MAX_CONSOLIDATION_STEPS}`;

/**
 * The option `consolidate` as a plan records it, checked: a flag, or `{ maxSteps? }`
 * @throws TxBuildError INVALID_OPTION (`consolidate`) for any other value, with its JavaScript
 *   type only
 */
const consolidateOf = (
  value: unknown,
): boolean | { readonly maxSteps?: number } | undefined => {
  if (value === undefined || typeof value === "boolean") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalidOption("consolidate", value, CONSOLIDATE_ALLOWED);
  const { maxSteps, ...others } = value as Record<string, unknown>;
  if (Object.keys(others).length > 0)
    throw invalidOption(
      "consolidate",
      value,
      CONSOLIDATE_ALLOWED,
      ", with a member other than maxSteps",
    );
  if (maxSteps === undefined) return {};
  if (
    typeof maxSteps !== "number" ||
    !Number.isInteger(maxSteps) ||
    maxSteps < 1 ||
    maxSteps > MAX_CONSOLIDATION_STEPS
  )
    throw invalidOption(
      "consolidate",
      value,
      CONSOLIDATE_ALLOWED,
      `, and its maxSteps, a ${typeOf(maxSteps)}, is not such a number`,
    );
  return { maxSteps };
};

/** The most consolidation steps a plan allows, 0 when it is not to consolidate */
const consolidationLimit = (value: unknown): number => {
  const read = consolidateOf(value);
  if (read === false) return 0;
  if (read === undefined || read === true) return DEFAULT_CONSOLIDATION_STEPS;
  return read.maxSteps ?? DEFAULT_CONSOLIDATION_STEPS;
};

/** The builder's private members a plan uses */
type BuilderInternals = {
  readonly added: readonly TxPart[];
  readGivenPayer(payer: Payer, signal?: AbortSignal): Promise<PayerRead>;
  buildList(
    source: PayerSource,
    flat: readonly TxPart[],
    options: BuildOptions | undefined,
  ): Promise<BuiltTxData>;
};

const internals = (builder: TxBuilder) =>
  builder as unknown as BuilderInternals;

const STEPS_ALLOWED =
  "one list of parts, or an object of named steps, each parts or { parts, ...options }";

/** The steps `plan.add` takes */
const ADDED_ALLOWED =
  "an object of named steps, each parts or { parts, ...options }";

const invalidSteps = (
  reason: string,
  value?: unknown,
  allowed = STEPS_ALLOWED,
) =>
  new TxBuildError("INVALID_OPTION", `invalid steps: ${reason}`, {
    details: { option: "steps", value, allowed },
  });

/**
 * INVALID_OPTION (`steps`) for steps given to `plan.add`
 * @param value The JavaScript type of what was given, never the value
 */
export const invalidAddedSteps = (reason: string, value?: string) =>
  invalidSteps(reason, value, ADDED_ALLOWED);

/** The members a step given with options may have */
const STEP_MEMBERS = new Set([
  "parts",
  "payer",
  "canSelect",
  "coinSelection",
  "sendAllTo",
  "fee",
  "registeredPools",
  "extraKeyWitnesses",
  "topUpCollateral",
  "collateralReturn",
]);

/** The data options of a step, written into its record as it was given */
const DATA_OPTIONS = [
  "sendAllTo",
  "fee",
  "registeredPools",
  "extraKeyWitnesses",
  "topUpCollateral",
  "collateralReturn",
] as const;

/** A step read from its given form */
export type StepInput = {
  readonly name: string;
  readonly parts: readonly (TxPart | LinkedPart)[];
  readonly options: StepOptions;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a value is one part, of any kind, linked or not */
const isOnePart = (value: unknown) =>
  isObject(value) && typeof value.kind === "string";

/** Whether a value is a transaction built before: a `BuiltTx`, or its data */
const isBuiltTransaction = (value: unknown) =>
  value instanceof BuiltTx ||
  (isObject(value) &&
    typeof value.tx === "string" &&
    typeof value.txHash === "string");

/** The parts of a step, flattened, linked parts kept */
const flatten = (parts: unknown, name: string): (TxPart | LinkedPart)[] => {
  try {
    return flattenParts(parts, { links: true });
  } catch (error) {
    throw withStep(error, name);
  }
};

/**
 * The steps as given, read in order: one list of parts is the step `main` with the parts the
 * builder holds from `add` first; named steps are each parts or parts with options. A part
 * linked to a step that is not before its own is refused here, before any request
 * @throws TxBuildError INVALID_OPTION (`steps`)
 */
const readSteps = (
  builder: TxBuilder,
  steps: unknown,
  options: MakePlanOptions,
): StepInput[] => {
  const read = readStepForms(builder, steps, options);
  checkLinks(read, []);
  return read;
};

/**
 * Refuses a part linked to a step that is neither one of `before` (the names of the steps the
 * plan has) nor a step given before its own: refused before any request
 * @throws TxBuildError INVALID_OPTION (`steps`)
 */
const checkLinks = (read: readonly StepInput[], before: readonly string[]) => {
  read.forEach((step, index) => {
    for (const part of step.parts) {
      if (!isLinkedPart(part)) continue;
      const named = part.link.step;
      if (before.includes(named)) continue;
      if (read.slice(0, index).some((each) => each.name === named)) continue;
      throw withStep(
        invalidSteps(
          read.some((each) => each.name === named)
            ? `a link names step ${JSON.stringify(named)}, which is not before step ${JSON.stringify(step.name)}: a step names only the steps before it`
            : `a link names step ${JSON.stringify(named)}, which the plan does not have`,
        ),
        step.name,
      );
    }
  });
};

/** The steps as given, in their forms, read in order; their links are not read here */
const readStepForms = (
  builder: TxBuilder,
  steps: unknown,
  options: MakePlanOptions,
): StepInput[] => {
  const held = internals(builder).added;
  if (Array.isArray(steps) || isOnePart(steps))
    return [
      {
        name: MAIN_STEP,
        parts: [...held, ...flatten(steps, MAIN_STEP)],
        options: {
          ...(options.sendAllTo !== undefined && {
            sendAllTo: options.sendAllTo,
          }),
          ...(options.fee !== undefined && { fee: options.fee }),
        },
      },
    ];
  if (!isObject(steps) || isBuiltTransaction(steps))
    throw invalidSteps(`expected ${STEPS_ALLOWED}`, typeof steps);
  if (held.length > 0)
    throw invalidSteps(
      `the builder holds ${held.length} part(s) from add, which would go into every step: give them in the steps, or give one list of parts`,
    );
  for (const option of ["sendAllTo", "fee"] as const)
    if (options[option] !== undefined)
      throw invalidSteps(
        `${option} describes one transaction: give it in the step it is for, { parts, ${option} }`,
      );
  const names = Object.keys(steps);
  if (names.length === 0) throw invalidSteps("a plan has a step at least");
  if (names.length > MAX_STEPS)
    throw invalidSteps(
      `a plan has at most ${MAX_STEPS} steps, and ${names.length} are given`,
    );
  return names.map((name) => {
    if (name === "") throw invalidSteps("a step's name is a non-empty text");
    if (/^[0-9]+$/.test(name))
      throw invalidSteps(
        `the step name ${JSON.stringify(name)} is a whole number, which an object moves to its front: give the step a name that is not`,
      );
    if (name.startsWith(RESERVED_PREFIX))
      throw invalidSteps(
        `the step name ${JSON.stringify(name)} starts with ${JSON.stringify(RESERVED_PREFIX)}, which names the steps a plan puts in itself`,
      );
    const step = steps[name];
    if (Array.isArray(step) || isOnePart(step))
      return { name, parts: flatten(step, name), options: {} };
    // A transaction built before is a step of its own form, taken as it is; not taken here
    if (isBuiltTransaction(step) || typeof step === "string")
      throw invalidSteps(
        `step ${JSON.stringify(name)} is a transaction built before; a step here is parts, or { parts, ...options }`,
        typeof step,
      );
    if (!isObject(step) || !("parts" in step))
      throw invalidSteps(
        `step ${JSON.stringify(name)} is neither parts nor { parts, ...options }`,
        typeof step,
      );
    for (const member of Object.keys(step))
      if (!STEP_MEMBERS.has(member))
        throw invalidSteps(
          `step ${JSON.stringify(name)} has the member ${JSON.stringify(member)}; a step takes parts, payer, canSelect, coinSelection, sendAllTo, fee, registeredPools, extraKeyWitnesses, topUpCollateral and collateralReturn`,
        );
    const { parts, ...own } = step as { parts: unknown } & StepOptions;
    return { name, parts: flatten(parts, name), options: own };
  });
};

/** The error of building a step, with the step's name at the start of its message */
const withStep = (error: unknown, name: string): unknown => {
  const prefix = `step ${JSON.stringify(name)}: `;
  if (error instanceof TxError && !error.message.startsWith(prefix))
    (error as { message: string }).message = `${prefix}${error.message}`;
  return error;
};

/* ---------------------------------------------------------------------------------------------
 * Links
 * ------------------------------------------------------------------------------------------- */

/** The outputs a link names in an earlier step's transaction */
const linkedOutputs = (
  link: StepOutput | StepChange,
  built: BuiltTxData,
): BuiltOutput[] => {
  if ("change" in link) return built.change;
  const { output } = link;
  if (typeof output === "number") {
    const found = built.outputs[output];
    if (found === undefined)
      throw invalidSteps(
        `a link names output ${output} of step ${JSON.stringify(link.step)}, whose transaction has ${built.outputs.length} output(s)`,
      );
    return [found];
  }
  const labelled = built.outputs.filter((each) => each.label === output);
  if (labelled.length === 0) {
    const labels = Array.from(
      new Set(
        built.outputs.flatMap((each) =>
          each.label === undefined ? [] : [each.label],
        ),
      ),
    );
    throw new TxBuildError(
      "UNKNOWN_LABEL",
      `no output of step ${JSON.stringify(link.step)} has the label ${JSON.stringify(output)}; ${
        labels.length === 0
          ? "none of its outputs has a label"
          : `its labels are ${labels.map((l) => JSON.stringify(l)).join(", ")}`
      }`,
      { details: { label: output, labels } },
    );
  }
  if (labelled.length > 1)
    throw invalidSteps(
      `a link names the label ${JSON.stringify(output)} of step ${JSON.stringify(link.step)}, which ${labelled.length} of its outputs have: name the output by its position`,
    );
  return labelled;
};

/** Checks a datum given with a Plutus spend against the output it spends */
const checkDatum = (ctx: PartContext, datum: SpendDatum, utxo: Utxo) => {
  const outRef = utxoKey(utxo);
  const held = utxo.datum;
  if (datum.type === "inline") {
    if (held?.type !== "inline")
      fail(ctx, "DATUM_MISMATCH", `${outRef} holds no inline datum`);
    return;
  }
  if (datum.type === "none") {
    if (held !== undefined)
      fail(ctx, "DATUM_MISMATCH", `${outRef} holds a datum`);
    return;
  }
  if (held?.type === "inline")
    fail(
      ctx,
      "DATUM_MISMATCH",
      `${outRef} holds its datum inline; spend it with datum "inline"`,
    );
  if (held?.type !== "hash")
    fail(ctx, "DATUM_MISMATCH", `${outRef} holds no datum hash`);
  if (held!.type === "hash" && held!.hash !== datum.hash)
    fail(
      ctx,
      "DATUM_MISMATCH",
      `${outRef} holds datum hash ${held!.hash}, not the given datum's ${datum.hash}`,
    );
};

/**
 * A linked part filled in with one output of an earlier step: the part it stands for, with the
 * checks its builder runs on a UTxO it is given in full
 */
const fillOne = (part: LinkedPart, output: BuiltOutput): TxPart => {
  const utxo = plainUtxo(output);
  const input = { transaction_id: utxo.txHash, index: utxo.outputIndex };
  const ctx: PartContext = { part: part.kind, label: part.label };
  const label = part.label === undefined ? {} : { label: part.label };
  if (part.kind === "referenceInput")
    return freeze<ReferenceInputPart>({
      kind: "referenceInput",
      input,
      utxo,
      ...label,
    });
  if (part.kind === "collateral") {
    checkLock(ctx, utxo, { type: "key" });
    return freeze<CollateralPart>({
      kind: "collateral",
      input,
      utxo,
      ...label,
    });
  }
  const { witness } = part as Extract<LinkedPart, { kind: "spend" }>;
  if (witness.type === "key") {
    checkLock(ctx, utxo, { type: "key" });
    return freeze<SpendPart>({ kind: "spend", input, utxo, witness, ...label });
  }
  const credential = checkLock(ctx, utxo, {
    type: "script",
    hash: witness.script.scriptHash,
  });
  if (witness.type === "native")
    return freeze<SpendPart>({
      kind: "spend",
      input,
      utxo,
      witness: {
        ...witness,
        script: withKnownHash(witness.script, credential),
      },
      ...label,
    });
  const script = withKnownHash(witness.script, credential);
  let datum = witness.datum;
  if (datum === undefined)
    datum = toSpendDatum(ctx, undefined, utxo, script.version);
  else checkDatum(ctx, datum, utxo);
  return freeze<SpendPart>({
    kind: "spend",
    input,
    utxo,
    witness: { ...witness, script, ...(datum && { datum }) },
    ...label,
  });
};

/**
 * The parts of a step with every link filled in from the earlier steps' own transactions, in
 * their places; a link to all the change becomes one part for each change output, none when
 * there is none
 * @throws TxBuildError INVALID_OPTION (`steps`) for a link to a step that is not before this
 *   one, to an output past the last, or to an output an earlier step spends, naming that step;
 *   UNKNOWN_LABEL for a label no output of that step has; TxPartError for an output the part
 *   cannot take (its lock, its datum)
 */
const fillLinks = (
  parts: readonly (TxPart | LinkedPart)[],
  name: string,
  earlier: readonly Pick<MadeStep, "name" | "built">[],
  later: readonly string[],
): TxPart[] =>
  parts.flatMap((part) => {
    if (!isLinkedPart(part)) return [part as TxPart];
    const { link } = part;
    const before = earlier.find((step) => step.name === link.step);
    if (before === undefined)
      throw invalidSteps(
        link.step === name || later.includes(link.step)
          ? `a link names step ${JSON.stringify(link.step)}, which is not before step ${JSON.stringify(name)}: a step names only the steps before it`
          : `a link names step ${JSON.stringify(link.step)}, which the plan does not have`,
      );
    const outputs = linkedOutputs(link, before.built);
    for (const output of outputs) {
      const key = utxoKey(plainUtxo(output));
      const taker = earlier.find((step) =>
        step.built.inputs.some((input) => utxoKey(input) === key),
      );
      if (taker !== undefined)
        throw invalidSteps(
          `a link names ${"change" in link ? "the change" : `output ${JSON.stringify(link.output)}`} of step ${JSON.stringify(link.step)}, which step ${JSON.stringify(taker.name)} spends already: the change of a step goes to the next step of its payer, so a link to change names the step just before`,
        );
    }
    return outputs.map((output) => fillOne(part, output));
  });

/* ---------------------------------------------------------------------------------------------
 * Building
 * ------------------------------------------------------------------------------------------- */

/** Whether a part spends an output of the transaction with this hash */
const spendsFrom = (part: TxPart, txHash: string) =>
  part.kind === "spend" &&
  part.input.transaction_id.toLowerCase() === txHash.toLowerCase();

/** Whether a part spends, reads or puts up an output of the transaction with this hash */
const standsOnTx = (part: TxPart, txHash: string) =>
  (part.kind === "spend" ||
    part.kind === "referenceInput" ||
    part.kind === "collateral") &&
  part.input.transaction_id.toLowerCase() === txHash.toLowerCase();

/**
 * The change of the step before, of the same payer, that this step spends when its parts spend
 * no output of that step: its first change output at the payer's change address, key-locked,
 * spent by no earlier step, not put up as collateral by the parts, and taken by `canSelect`.
 * Undefined when there is no step before or the parts spend an output of it; else, when no
 * change can be spent, why not
 */
const changeToSpend = (
  parts: readonly TxPart[],
  previous: Pick<MadeStep, "name" | "built"> | undefined,
  changeAddress: string,
  earlier: readonly Pick<MadeStep, "name" | "built">[],
  canSelect: ((utxo: Utxo) => boolean) | undefined,
): Utxo | { readonly none: string } | undefined => {
  if (previous === undefined) return undefined;
  if (parts.some((part) => spendsFrom(part, previous.built.txHash)))
    return undefined;
  const spent = new Set(
    earlier.flatMap((step) => step.built.inputs.map((input) => utxoKey(input))),
  );
  const putUp = new Set(
    parts.flatMap((part) =>
      part.kind === "collateral"
        ? [`${part.input.transaction_id}#${part.input.index}`]
        : [],
    ),
  );
  const selectable = (utxo: Utxo) => {
    if (canSelect === undefined) return true;
    try {
      return canSelect(plainUtxo(utxo)) === true;
    } catch {
      return false;
    }
  };
  const mine = previous.built.change.filter(
    (output) => output.address === changeAddress && isKeyLocked(output),
  );
  const free = mine.filter(
    (output) => !spent.has(utxoKey(output)) && !putUp.has(utxoKey(output)),
  );
  const change = free.find(selectable);
  if (change !== undefined) return plainUtxo(change);
  return {
    none:
      mine.length === 0
        ? "it leaves no change at the payer's change address"
        : free.length === 0
          ? "its change is spent by an earlier step or put up as collateral by this one"
          : "canSelect does not let its change through",
  };
};

/**
 * The parts with the plan's deadline in their one validity part: a step whose parts give an end
 * keeps it; any other ends at the tip's time, or its lower bound when later, plus `ttlMs`
 * @throws TxPlanError INVALID_STATE (`pastHorizon`) for a step that runs a Plutus script and
 *   ends past the network's forecast horizon
 */
const withDeadline = (
  builder: TxBuilder,
  parts: readonly TxPart[],
  tip: PlanTip,
  ttlMs: number,
  name: string,
  planId: string | undefined,
): TxPart[] => {
  const out = [...parts];
  const at = out.findIndex((part) => part.kind === "validity");
  const given =
    at < 0 ? undefined : (out[at] as Extract<TxPart, { kind: "validity" }>);
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
    hereafter = builder.slotAt(
      Math.max(tip.timeMs, fromMs ?? tip.timeMs) + ttlMs,
    );
    const deadline = validity({
      ...(given?.from !== undefined && { from: given.from }),
      ...(given?.invalidBefore !== undefined && {
        invalidBefore: BigInt(given.invalidBefore),
      }),
      invalidHereafter: hereafter,
      ...(given?.label !== undefined && { label: given.label }),
    });
    if (at < 0) out.push(deadline);
    else out[at] = deadline;
  }
  const plutus = out.some(
    (part) => "witness" in part && part.witness.type === "plutus",
  );
  if (plutus) {
    const last = horizonSlot(builder.network, tip.slot, fromSlot);
    if (last !== undefined && hereafter > last)
      throw new TxPlanError(
        "INVALID_STATE",
        `step ${JSON.stringify(name)} runs a Plutus script and would end at slot ${hereafter}, past the forecast horizon at slot ${last}: give a shorter ttlMs or until. ${NOT_UNPAID}`,
        {
          details: { reason: "pastHorizon" },
          ...(planId !== undefined && { planId }),
        },
      );
  }
  return out;
};

/** The network as a record holds it: the name of a public network, else its configuration */
const recordNetwork = (builder: TxBuilder) => {
  const { network } = builder;
  return network.name === "mainnet" ||
    network.name === "preprod" ||
    network.name === "preview"
    ? network.name
    : network;
};

/** The data options of a step as given, for its record */
const dataOptions = (options: StepOptions, changeAddress?: string) => {
  const out: Record<string, unknown> = {};
  for (const key of DATA_OPTIONS)
    if (options[key] !== undefined) out[key] = options[key];
  if (changeAddress !== undefined) out.changeAddress = changeAddress;
  return Object.keys(out).length === 0 ? undefined : out;
};

/** The data options of a plan, with its payer's change address, for its record */
const planOptionsOf = (
  options: MakePlanOptions,
  changeAddress: string | undefined,
): Record<string, unknown> => ({
  ...(changeAddress !== undefined && { changeAddress }),
  // In the builder's form of a UTxO, whatever form they were given in
  ...(options.knownUtxos !== undefined && {
    knownUtxos: toKnownUtxos(options.knownUtxos),
  }),
  ...(options.registeredPools !== undefined && {
    registeredPools: options.registeredPools,
  }),
  ...(options.extraKeyWitnesses !== undefined && {
    extraKeyWitnesses: options.extraKeyWitnesses,
  }),
  ...(options.topUpCollateral !== undefined && {
    topUpCollateral: options.topUpCollateral,
  }),
  ...(options.collateralReturn !== undefined && {
    collateralReturn: options.collateralReturn,
  }),
  ...(options.consolidate !== undefined && {
    consolidate: consolidateOf(options.consolidate),
  }),
});

/**
 * The step as its record holds it given: its parts, links kept, and its data options, with the
 * change address of its own payer when it has one
 */
const givenOf = (step: StepInput, changeAddress?: string): StepGiven => {
  const data = dataOptions(
    step.options,
    step.options.payer === undefined ? undefined : changeAddress,
  );
  return { parts: step.parts, ...(data !== undefined && { options: data }) };
};

/**
 * The change address of a payer, asked once for each payer, its form and network checked; and
 * the address a payer answered, when it was asked
 */
export type AddressOf = ((payer: Payer) => Promise<string>) & {
  readonly asked: (payer: Payer) => string | undefined;
};

/**
 * A book of change addresses: each payer is asked once, an address or a snapshot without a
 * request, a wallet by `getChangeAddress`; no UTxO is read
 * @throws TxBuildError INVALID_OPTION for a payer of no known form; NETWORK_MISMATCH for a payer
 *   given with another network's address; WALLET_FAILED
 */
export const addressBook = (builder: TxBuilder): AddressOf => {
  const addresses = new Map<Payer, string>();
  const addressOf = async (payer: Payer) => {
    let address = addresses.get(payer);
    if (address === undefined) {
      const source = toPayerSource(payer);
      checkNetworks(builder.network, givenPayerEntries(source));
      address = await changeAddressOf(source);
      addresses.set(payer, address);
    }
    return address;
  };
  return Object.assign(addressOf, {
    asked: (payer: Payer) => addresses.get(payer),
  });
};

/** What a payer that answered two change addresses in one call may be instead */
const ONE_ADDRESS_ALLOWED =
  "a payer that answers one change address within a call, such as a snapshot { changeAddress, utxos }";

/**
 * Reads the payer of each step once, for the builds of one call: the payers in the order of the
 * steps, read at once. Each payer has one change address in a call: the one its read gives. A
 * payer asked for its change address before in this call (`asked`) that reads another is
 * refused, and nothing is built
 * @param missing The error of a step without a payer
 * @returns the read of a step's payer
 * @throws what `missing` gives; TxBuildError INVALID_OPTION (`payer`) for a payer that answered
 *   two change addresses, with its JavaScript type only; every error of reading a payer
 */
const readStepPayers = async (
  builder: TxBuilder,
  steps: readonly StepInput[],
  payerOf: (step: StepInput) => Payer | undefined,
  context: {
    readonly missing: (step: StepInput) => unknown;
    readonly signal?: AbortSignal;
    readonly asked?: AddressOf;
  },
): Promise<{
  readonly readOf: (step: StepInput) => PayerRead;
  readonly readOfPayer: (payer: Payer) => PayerRead | undefined;
}> => {
  const payers: Payer[] = [];
  for (const step of steps) {
    const payer = payerOf(step);
    if (payer === undefined) throw context.missing(step);
    if (!payers.includes(payer)) payers.push(payer);
  }
  const reads = await Promise.all(
    payers.map((payer) =>
      internals(builder).readGivenPayer(payer, context.signal),
    ),
  );
  payers.forEach((payer, i) => {
    const before = context.asked?.asked(payer);
    if (before !== undefined && before !== reads[i]!.snapshot.changeAddress)
      throw new TxBuildError(
        "INVALID_OPTION",
        "invalid payer: it answered two change addresses within one call, and a plan needs one for the order of its steps; a payer with a fixed change address, a snapshot { changeAddress, utxos }, is the way: nothing was built or recorded",
        {
          details: {
            option: "payer",
            value: typeOf(payer),
            allowed: ONE_ADDRESS_ALLOWED,
          },
        },
      );
  });
  return {
    readOf: (step) => reads[payers.indexOf(payerOf(step)!)]!,
    readOfPayer: (payer) => {
      const at = payers.indexOf(payer);
      return at < 0 ? undefined : reads[at];
    },
  };
};

/** A step's name and how its record holds it given */
export type GivenStep = { readonly name: string; readonly given: StepGiven };

/**
 * Each step's name and how its record holds it given, worked out without building: a step with
 * a payer of its own has that payer asked for its change address, and no other payer is asked
 */
const givenSteps = async (
  read: readonly StepInput[],
  addressOf: AddressOf,
): Promise<GivenStep[]> => {
  const out: GivenStep[] = [];
  for (const step of read) {
    const own = step.options.payer;
    out.push({
      name: step.name,
      given: givenOf(
        step,
        own === undefined ? undefined : await addressOf(own),
      ),
    });
  }
  return out;
};

/**
 * What a plan made of these steps and options records of them, worked out before anything is
 * built: its network, the deadlines given explicitly, its data options with its payer's change
 * address, and each step's name and parts as given. Two plans with the same order are the same
 * order of the application. Each payer is asked for its change address only
 */
export type PlanOrder = {
  readonly network: PlanRecord["network"];
  /** The deadlines the options give explicitly; the builder's defaults are not part of it */
  readonly deadlines: Partial<PlanRecord["deadlines"]>;
  readonly options: Readonly<Record<string, unknown>>;
  readonly steps: readonly {
    readonly name: string;
    readonly given: StepGiven;
  }[];
};

/**
 * The parts of every step as given, read as `makePlan` reads them, without a request: for a
 * check that needs them before anything is built
 * @throws TxBuildError INVALID_OPTION (`steps`) as `makePlan`
 */
export const givenParts = (
  builder: TxBuilder,
  steps: StepParts | PlanSteps,
  options: MakePlanOptions = {},
): (TxPart | LinkedPart)[][] =>
  readSteps(builder, steps, options).map((step) => [...step.parts]);

/**
 * The order these steps and options give, without building: what `makePlan` would record of
 * them. A wallet is asked for its change address alone, and no UTxO is read
 * @throws TxBuildError INVALID_OPTION (`steps`) as `makePlan`; MISSING_PAYER; INVALID_OPTION for
 *   a payer of no known form; NETWORK_MISMATCH for a payer given with another network's
 *   address; WALLET_FAILED
 */
export const orderOf = async (
  builder: TxBuilder,
  steps: StepParts | PlanSteps,
  options: MakePlanOptions = {},
): Promise<PlanOrder> => {
  const given = readSteps(builder, steps, options);
  const addressOf = addressBook(builder);
  // The deadlines are checked as `makePlan` checks them
  effectiveDeadlines(options, builder.planDefaults);
  // Every step has a payer, the payers asked in the order of the steps
  for (const step of given) {
    const payer = step.options.payer ?? options.payer;
    if (payer === undefined)
      throw new TxBuildError(
        "MISSING_PAYER",
        `step ${JSON.stringify(step.name)}: no payer: give the plan a payer, or the step its own`,
      );
    await addressOf(payer);
  }
  const out = await givenSteps(given, addressOf);
  return {
    network: recordNetwork(builder),
    deadlines: {
      ...(options.ttlMs !== undefined && { ttlMs: options.ttlMs }),
      ...(options.expiryMarginMs !== undefined && {
        expiryMarginMs: options.expiryMarginMs,
      }),
      ...(options.confirmations !== undefined && {
        confirmations: options.confirmations,
      }),
    },
    options: planOptionsOf(
      options,
      options.payer === undefined ? undefined : await addressOf(options.payer),
    ),
    steps: out,
  };
};

/**
 * The source of an input of these transactions of `after`, followed back through the other
 * transactions of `after`, that is neither one of them nor a step of the plan; undefined when
 * there is none
 */
const sourceBefore = (
  before: readonly BuiltTxData[],
  after: readonly string[],
  made: readonly Pick<MadeStep, "built">[],
): string | undefined => {
  const byHash = new Map(before.map((tx) => [tx.txHash.toLowerCase(), tx]));
  const steps = new Set(made.map((each) => each.built.txHash.toLowerCase()));
  const queue = after.map((txHash) => txHash.toLowerCase());
  const visited = new Set<string>();
  while (queue.length > 0) {
    const txHash = queue.shift()!;
    if (visited.has(txHash)) continue;
    visited.add(txHash);
    for (const input of byHash.get(txHash)?.inputs ?? []) {
      const source = input.txHash.toLowerCase();
      if (byHash.has(source)) queue.push(source);
      else if (!steps.has(source)) return source;
    }
  }
  return undefined;
};

/**
 * The steps given to `plan.add`, read as `builder.plan` reads named steps: names, members,
 * flattening, a builder that holds parts. Their links are not read here
 * @throws TxBuildError INVALID_OPTION (`steps`) for one list of parts, one part, a text, a
 *   transaction built before, or anything but an object of named steps, with the JavaScript type
 *   in `details.value`; for all that `builder.plan` refuses of named steps
 */
export const readAddedSteps = (
  builder: TxBuilder,
  steps: unknown,
): StepInput[] => {
  if (!isObject(steps) || isOnePart(steps) || isBuiltTransaction(steps))
    throw invalidAddedSteps(
      Array.isArray(steps) || isOnePart(steps)
        ? "one list of parts is the step main of a new plan; steps are added by name, { name: parts }"
        : `expected ${ADDED_ALLOWED}`,
      typeof steps,
    );
  if (Object.keys(steps).length === 0)
    throw invalidAddedSteps("no step is given", typeof steps);
  return readStepForms(builder, steps, {});
};

/**
 * Each step's name and how a record holds it given, as `orderOf` works it out: a step with a
 * payer of its own has that payer asked for its change address, once for each payer; no other
 * payer is asked, and no UTxO is read
 */
export const givenOfSteps = (
  read: readonly StepInput[],
  addressOf: AddressOf,
): Promise<GivenStep[]> => givenSteps(read, addressOf);

/**
 * Checks steps to append to a plan that has the steps of `recorded`: each link names a step of
 * the plan or a step given before its own, and the plan has at most `MAX_STEPS` steps after
 * them. No request is made
 * @throws TxBuildError INVALID_OPTION (`steps`)
 */
export const checkAddedSteps = (
  read: readonly StepInput[],
  recorded: readonly string[],
) => {
  checkLinks(read, recorded);
  if (recorded.length + read.length > MAX_STEPS)
    throw invalidAddedSteps(
      `a plan has at most ${MAX_STEPS} steps: it has ${recorded.length}, and ${read.length} are given`,
    );
};

/**
 * The payer of the steps given to `plan.add` that name none: the payer the object holds, only
 * while its change address is the one the plan records; undefined when every step has its own.
 * It is asked for its change address alone
 * @throws TxBuildError MISSING_PAYER when a step names no payer and the object holds none, the
 *   plan records no change address, or the payer held has another change address; what
 *   `addressBook` throws
 */
export const payerOfAdded = async (
  record: PlanRecord,
  held: Payer | undefined,
  read: readonly StepInput[],
  addressOf: AddressOf,
): Promise<Payer | undefined> => {
  const without = read.find((step) => step.options.payer === undefined);
  if (without === undefined) return undefined;
  const recorded = record.options.changeAddress;
  const missing = (why: string) =>
    new TxBuildError(
      "MISSING_PAYER",
      `step ${JSON.stringify(without.name)}: no payer: ${why}; give the step its own payer, { parts, payer }, or resume the plan with its payer`,
    );
  if (held === undefined)
    throw missing("the step names none, and this object holds no payer");
  if (typeof recorded !== "string")
    throw missing(
      "the step names none, and the plan records no payer of its own",
    );
  if ((await addressOf(held)) !== recorded)
    throw missing(
      "the step names none, and the payer this object holds has another change address than the plan's",
    );
  return held;
};

/**
 * Builds the steps given to `plan.add` on the plan as `base` records it: each payer is read
 * once; each step is built after every step of the plan and the steps of the call before it, in
 * the one loop of `makePlan`. The data options the plan records apply, unless the step has its
 * own; `canSelect` and `coinSelection` only as a step gives them. A step whose parts give no end
 * ends at the tip plus the plan's `ttlMs`
 * @throws as the build of a step throws, with the step's name at the start of its message
 */
export const buildAddedSteps = async (
  builder: TxBuilder,
  base: PlanRecord,
  read: readonly StepInput[],
  context: {
    readonly payer?: Payer;
    readonly tip: PlanTip;
    readonly signal?: AbortSignal;
    readonly trace?: MakePlanOptions["trace"];
    /** The change addresses asked before in the call, which the reads must give again */
    readonly asked?: AddressOf;
  },
): Promise<NewStep[]> => {
  const { signal, trace } = context;
  const payerOf = (step: StepInput) => step.options.payer ?? context.payer;
  const { readOf } = await readStepPayers(builder, read, payerOf, {
    // The payer of every step was worked out before: a fault of this code otherwise
    missing: (step) =>
      new Error(`step ${JSON.stringify(step.name)} has no payer`),
    ...(signal !== undefined && { signal }),
    ...(context.asked !== undefined && { asked: context.asked }),
  });
  const recorded = base.options;
  const planAddress =
    typeof recorded.changeAddress === "string"
      ? recorded.changeAddress
      : undefined;
  const made = await buildSteps(builder, read, {
    before: base.steps.map((step) => {
      const own = step.given?.options?.changeAddress;
      // A consolidation step pays its payer alone: its outputs are at that payer's address
      const changeAddress =
        step.kind === "consolidation"
          ? (step.built.change[0] ?? step.built.outputs[0])?.address
          : typeof own === "string"
            ? own
            : planAddress;
      return {
        name: step.name,
        built: step.built,
        ...(changeAddress !== undefined && { changeAddress }),
        final: step.status === "final",
        ...(step.status === "included" && { included: true as const }),
        ...(step.kind === "consolidation" && { consolidation: true as const }),
      };
    }),
    after: [],
    tip: context.tip,
    ttlMs: base.deadlines.ttlMs,
    ...(base.id !== undefined && { planId: base.id }),
    options: {
      ...(recorded.knownUtxos !== undefined && {
        knownUtxos: recorded.knownUtxos as Utxo[],
      }),
      ...(recorded.registeredPools !== undefined && {
        registeredPools: recorded.registeredPools as string[],
      }),
      ...(recorded.extraKeyWitnesses !== undefined && {
        extraKeyWitnesses: recorded.extraKeyWitnesses as number,
      }),
      ...(recorded.topUpCollateral !== undefined && {
        topUpCollateral: recorded.topUpCollateral as boolean,
      }),
      ...(recorded.collateralReturn !== undefined && {
        collateralReturn: recorded.collateralReturn as boolean,
      }),
      ...(recorded.consolidate !== undefined && {
        consolidate: recorded.consolidate as MakePlanOptions["consolidate"],
      }),
      ...(signal !== undefined && { signal }),
      ...(trace !== undefined && { trace }),
    },
    readOf,
  });
  return made.map(newStepOf);
};

/**
 * Builds a plan. Every body is built by this call, in order: each payer is read once,
 * and each step is built on the payer's UTxOs as the steps before it leave them. A step spends
 * the change that the step before it of the same payer leaves at the payer's change address,
 * unless it spends an output of that step already, so the steps of one payer form a chain the
 * ledger keeps in order. A part linked to an earlier step is read as strictly as a record reads
 * it, filled in from that step's own transaction and checked as a part given the output in
 * full. The transactions of `after` a step spends, reads or puts up an output of are recorded
 * with it. A step whose parts give no end of validity ends at the plan's deadline, the tip's
 * time plus `ttlMs`. Nothing is signed and nothing is sent; the first record of the plan comes
 * with the steps.
 * @throws TxBuildError INVALID_OPTION (`steps`) for a step of no known form, a name that is
 *   empty, a whole number or reserved, more than 32 steps, named steps on a builder that holds
 *   parts from `add` or with `sendAllTo` or `fee` among the plan's options, a link to a step that
 *   is not before it, to an output past the last or to an output an earlier step spends, a label
 *   several outputs of the step have, and a step that can stand on the step before it of its
 *   payer neither by its change nor by an output its parts name; INVALID_OPTION (`parts`) and
 *   TxPartError INVALID_OUT_REF for a linked part the part builders could not have made;
 *   UNKNOWN_LABEL for a label no output of the step has; every error of building a step, with
 *   the step's name at the start of its message
 * @throws TxPlanError CANNOT_OBSERVE (`noTip`) when the tip cannot be read; INVALID_STATE
 *   (`pastHorizon`)
 */
export const makePlan = async (
  builder: TxBuilder,
  steps: StepParts | PlanSteps,
  options: MakePlanOptions = {},
): Promise<MadePlan> => {
  const given = readSteps(builder, steps, options);
  const deadlines = effectiveDeadlines(options, builder.planDefaults);
  consolidateOf(options.consolidate);
  const { id, signal } = options;

  const observed = await chainObserver(builder.provider).tip();
  if (observed === undefined)
    throw new TxPlanError(
      "CANNOT_OBSERVE",
      `the builder's provider did not give the chain's tip (fetchLatestBlock), which the plan's deadline is counted from. ${NOT_UNPAID}`,
      {
        details: { reason: "noTip" },
        ...(id !== undefined && { planId: id }),
      },
    );
  const tip: PlanTip = {
    slot: observed.slot,
    timeMs: builder.timeAt(observed.slot),
    ...(observed.height !== undefined && { height: observed.height }),
  };

  // Each payer is read once, before any step is built
  const payerOf = (step: StepInput) => step.options.payer ?? options.payer;
  const { readOf, readOfPayer } = await readStepPayers(
    builder,
    given,
    payerOf,
    {
      missing: (step) =>
        new TxBuildError(
          "MISSING_PAYER",
          `step ${JSON.stringify(step.name)}: no payer: give the plan a payer, or the step its own`,
        ),
      ...(signal !== undefined && { signal }),
    },
  );

  const made = await buildSteps(builder, given, {
    before: [],
    after:
      options.after === undefined
        ? []
        : Array.isArray(options.after)
          ? (options.after as readonly BuiltTxData[])
          : [options.after as BuiltTxData],
    tip,
    ttlMs: deadlines.ttlMs,
    ...(id !== undefined && { planId: id }),
    options,
    readOf,
  });

  const planPayer =
    options.payer === undefined ? undefined : readOfPayer(options.payer);
  const planOptions = planOptionsOf(options, planPayer?.snapshot.changeAddress);
  const first = advancePlan(
    emptyPlan({
      ...(id !== undefined && { id }),
      network: recordNetwork(builder),
      deadlines,
      options: planOptions,
    }),
    { type: "steps", steps: made.map(newStepOf) },
  );
  // The steps are built here, so the state machine refusing them is a fault of this code
  if (!first.ok)
    throw new Error(`the plan's first record was refused: ${first.message}`);
  return {
    steps: made,
    record: first.json,
    tip,
    ...(planUntil(first.json) !== undefined && {
      until: planUntil(first.json),
    }),
  };
};

/** A step built before those a loop builds: a step of the plan, or one the loop built */
type StepBefore = {
  readonly name: string;
  readonly built: BuiltTxData;
  /** The change address of its payer; undefined when the record holds none */
  readonly changeAddress?: string;
  /** It is final: its outputs may be spent by now */
  readonly final: boolean;
  /** It is in a block and not final: the chain shows whether its change is spent */
  readonly included?: true;
  /** It is a consolidation step the plan put in itself */
  readonly consolidation?: true;
};

/**
 * A transaction of `after` of a build: a step as it is, and a final step with its inputs alone,
 * so that what it spent is never selected, named or put up, and what it left is taken from the
 * payer's read, since it may be spent by now
 */
export const asAfter = <T extends BuiltTxData>(built: T, final: boolean): T => {
  if (!final) return built;
  const alone = { ...built, outputs: [], change: [] };
  INPUTS_ALONE.add(alone);
  return alone;
};

/**
 * The transactions of `after` that stand for a final step: they keep what it spent out of every
 * build and are nothing else. No step records one in its `after` or takes it as its
 * `expirySource`, and none is searched for: what a final step left is a UTxO of the chain
 */
const INPUTS_ALONE = new WeakSet<object>();

/** The options of a plan a loop builds every step with, unless the step has its own */
type LoopOptions = Pick<
  MakePlanOptions,
  | "canSelect"
  | "coinSelection"
  | "registeredPools"
  | "extraKeyWitnesses"
  | "topUpCollateral"
  | "collateralReturn"
  | "knownUtxos"
  | "consolidate"
  | "signal"
  | "trace"
>;

/** Sends a warning to `trace`; what it returns or throws is dropped */
const warn = (
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
    // Diagnostics never change a plan
  }
};

/**
 * Builds steps in order, each on its payer's UTxOs as the steps before it leave them: the
 * steps of the plan (`before`), then those this loop built. A part linked to a step before it is
 * filled in from that step's transaction; a step spends the change of the nearest step before it
 * of its payer, told by the change address, unless that step is final or the parts spend an
 * output of it already; a step whose parts give no end of validity ends at the tip's time plus
 * `ttlMs`. Each build is given `after` (the transactions of `after`, then every step before it,
 * a final one with its inputs alone), so that nothing a step before it spends is selected again.
 *
 * A step that does not fit a transaction because of the inputs its selection needs gets
 * consolidation steps before it, unless the option `consolidate` is `false` or the step has
 * `sendAllTo`: one at a time, each from what the failed build selected, then the step is built
 * again on the change of the last one, until it fits. They are named `consolidate-N`, counted
 * through the plan, and at most the option's limit of them are in the plan as a whole
 * @throws as `makePlan` throws of building its steps, each error with the step's name at the
 *   start of its message; TxBuildError TX_TOO_LARGE (`cause: "selection"`) for a step that
 *   needs more consolidation steps than the plan allows, or whose consolidation step cannot be
 *   built
 */
const buildSteps = async (
  builder: TxBuilder,
  given: readonly StepInput[],
  context: {
    readonly before: readonly StepBefore[];
    readonly after: readonly BuiltTxData[];
    readonly tip: PlanTip;
    readonly ttlMs: number;
    readonly planId?: string;
    readonly options: LoopOptions;
    readonly readOf: (step: StepInput) => PayerRead;
  },
): Promise<MadeStep[]> => {
  const { after: before, tip, ttlMs, planId, options, readOf } = context;
  const { signal, trace } = options;
  const limit = consolidationLimit(options.consolidate);
  const made: MadeStep[] = [];
  const all: StepBefore[] = [...context.before];
  /** A step built, with what it stands on: steps before it, transactions of `after` */
  const madeOf = (
    name: string,
    built: BuiltTxData,
  ): Pick<
    MadeStep,
    "name" | "built" | "standsOn" | "after" | "expirySource"
  > => {
    const sources = new Set(sourcesOf(built));
    const after = before
      .filter((tx) => !INPUTS_ALONE.has(tx))
      .map((tx) => tx.txHash)
      .filter(
        (txHash, i, list) =>
          sources.has(txHash.toLowerCase()) && list.indexOf(txHash) === i,
      );
    // A step every input of which comes from a transaction of `after` is shown expired by a
    // search that finds a transaction before them: an input's source that is none of them
    const expirySource =
      after.length > 0 &&
      built.inputs.length > 0 &&
      built.inputs.every((input) =>
        after.some(
          (txHash) => txHash.toLowerCase() === input.txHash.toLowerCase(),
        ),
      )
        ? sourceBefore(before, after, all)
        : undefined;
    return {
      name,
      built,
      standsOn: standsOnOf(
        built,
        all.map((each) => ({ name: each.name, txHash: each.built.txHash })),
      ),
      ...(after.length > 0 && { after }),
      ...(expirySource !== undefined && { expirySource }),
    };
  };
  for (const [index, step] of given.entries()) {
    const { name } = step;
    const own = step.options;
    const payer = readOf(step);
    const { changeAddress } = payer.snapshot;
    const canSelect = own.canSelect ?? options.canSelect;
    try {
      const filled = fillLinks(
        step.parts,
        name,
        all,
        given.slice(index + 1).map((each) => each.name),
      );
      let built: BuiltTxData | undefined;
      while (built === undefined) {
        // The step before it of the same payer, told by the change address; a final one is on
        // chain, and the ledger keeps nothing in order after it
        const nearest = [...all]
          .reverse()
          .find((each) => each.changeAddress === changeAddress);
        const previous = nearest?.final === true ? undefined : nearest;
        const found = changeToSpend(
          filled,
          previous,
          changeAddress,
          all,
          canSelect,
        );
        // The steps of one payer form a chain the ledger keeps in order: a step stands on the
        // step before it of its payer, by its change or by an output its parts name
        if (
          found !== undefined &&
          "none" in found &&
          !filled.some((part) => standsOnTx(part, previous!.built.txHash))
        )
          throw invalidSteps(
            `step ${JSON.stringify(name)} cannot stand on step ${JSON.stringify(previous!.name)}, the step before it of the same payer: ${found.none}, so step ${JSON.stringify(name)} could land before it. Link step ${JSON.stringify(name)} to an output of step ${JSON.stringify(previous!.name)}, or make it a plan of its own`,
          );
        const change =
          found === undefined || "none" in found ? undefined : found;
        // The change of a step in a block is what the chain shows of it: a read that does not
        // list it shows it spent, or is behind that block
        if (
          change !== undefined &&
          previous?.included === true &&
          !payer.snapshot.utxos.some(
            (utxo) => utxoKey(utxo) === utxoKey(change),
          )
        )
          throw invalidSteps(
            `step ${JSON.stringify(name)} cannot stand on step ${JSON.stringify(previous.name)}, the step before it of the same payer: the change of step ${JSON.stringify(previous.name)} is not in the payer's read; it was spent outside the plan, or the read is behind the block step ${JSON.stringify(previous.name)} is in. The same call again later tells; a step that cannot stand on it is a new plan's`,
          );
        const parts = withDeadline(
          builder,
          change === undefined
            ? filled
            : [...filled, spend.pubKey({ utxo: change })],
          tip,
          ttlMs,
          name,
          planId,
        );
        const after = [
          ...before,
          ...all.map((each) => asAfter(each.built, each.final)),
        ];
        try {
          built = await internals(builder).buildList(
            {
              form: "snapshot",
              snapshot: payer.snapshot,
              ...(payer.getCollateral && {
                getCollateral: payer.getCollateral,
              }),
            },
            parts,
            {
              ...pick(options, own, "canSelect"),
              ...pick(options, own, "coinSelection"),
              ...pick(options, own, "registeredPools"),
              ...pick(options, own, "extraKeyWitnesses"),
              ...pick(options, own, "topUpCollateral"),
              ...pick(options, own, "collateralReturn"),
              ...pick({}, own, "sendAllTo"),
              ...pick({}, own, "fee"),
              ...(options.knownUtxos !== undefined && {
                knownUtxos: options.knownUtxos,
              }),
              ...(signal !== undefined && { signal }),
              ...(trace !== undefined && { trace }),
              after,
            },
          );
        } catch (error) {
          if (
            limit === 0 ||
            own.sendAllTo !== undefined ||
            !isConsolidable(error)
          )
            throw error;
          const consolidation = await consolidate(error, {
            builder,
            payer,
            parts,
            change,
            after,
            canSelect,
            options,
            limit,
            count: all.filter((each) => each.consolidation === true).length,
            room: MAX_STEPS - all.length - (given.length - index),
          });
          const next: MadeStep = {
            ...madeOf(consolidation.name, consolidation.built),
            kind: "consolidation",
          };
          made.push(next);
          all.push({
            name: next.name,
            built: next.built,
            changeAddress,
            final: false,
            consolidation: true,
          });
        }
      }
      const extraKeyWitnesses =
        own.extraKeyWitnesses ?? options.extraKeyWitnesses ?? 0;
      const next: MadeStep = {
        ...madeOf(name, built),
        given: givenOf(step, changeAddress),
        ...(extraKeyWitnesses > 0 && { extraKeyWitnesses }),
      };
      made.push(next);
      all.push({ name, built, changeAddress, final: false });
    } catch (error) {
      throw withStep(error, name);
    }
  }
  const consolidations = made.filter((each) => each.kind === "consolidation");
  if (consolidations.length > 0)
    warn(trace, {
      type: "warning",
      code: "CONSOLIDATION_STEPS",
      steps: consolidations.length,
      fee: consolidations.reduce((sum, each) => sum + each.built.fee, 0n),
    });
  return made;
};

/**
 * One consolidation step for a step whose build did not fit because of what it selected: named
 * after those the plan has, built from that build's selection
 * @throws TxBuildError TX_TOO_LARGE (`cause: "selection"`) when the plan has as many
 *   consolidation steps as it allows, or as many steps as a plan may have, saying how many it
 *   allows; and when the consolidation step's own build fails for a reason of its own, that
 *   error as its cause; the served step's error when no consolidation step can be made of its
 *   selection; ABORTED, PROVIDER_FAILED and an error that is not of building, as they are
 */
const consolidate = async (
  error: unknown,
  context: {
    readonly builder: TxBuilder;
    readonly payer: PayerRead;
    readonly parts: readonly TxPart[];
    readonly change: Utxo | undefined;
    readonly after: readonly BuiltTxData[];
    readonly canSelect: ((utxo: Utxo) => boolean) | undefined;
    readonly options: LoopOptions;
    /** The most consolidation steps the plan allows */
    readonly limit: number;
    /** The consolidation steps the plan has */
    readonly count: number;
    /** The steps the plan may still take beside those given */
    readonly room: number;
  },
): Promise<{ readonly name: string; readonly built: BuiltTxData }> => {
  const served = error as TxBuildError<"TX_TOO_LARGE">;
  const { limit, count, room, options } = context;
  /** The served step's TX_TOO_LARGE, with why consolidation could not make it fit */
  const tooLarge = (why: string, cause: unknown) =>
    new TxBuildError("TX_TOO_LARGE", `${served.message}; ${why}`, {
      details: { ...served.details },
      cause,
    });
  if (count >= limit)
    throw tooLarge(
      `the plan allows ${limit} consolidation step(s) to make room for the inputs it needs, and has ${count}: nothing was recorded`,
      served,
    );
  if (room < 1)
    throw tooLarge(
      `a plan has at most ${MAX_STEPS} steps, consolidation steps among them, and has no room for another consolidation step: nothing was recorded`,
      served,
    );
  const name = `${RESERVED_PREFIX}${count + 1}`;
  const validity = context.parts.find(
    (part): part is ValidityPart => part.kind === "validity",
  );
  try {
    const built = await buildConsolidation({
      builder: context.builder,
      payer: context.payer,
      error,
      parts: context.parts,
      ...(context.change !== undefined && { standOn: context.change }),
      after: context.after,
      ...(validity !== undefined && { validity }),
      options: {
        ...(context.canSelect !== undefined && {
          canSelect: context.canSelect,
        }),
        ...(options.knownUtxos !== undefined && {
          knownUtxos: options.knownUtxos,
        }),
        ...(options.signal !== undefined && { signal: options.signal }),
        ...(options.trace !== undefined && { trace: options.trace }),
      },
    });
    return { name, built };
  } catch (failed) {
    // Nothing of the selection could be consolidated: the step's own error stands
    if (failed === error) throw failed;
    // A stop the application asked for, and a failure of a request, stay what they are
    if (
      !TxBuildError.is(failed) ||
      TxBuildError.is(failed, "ABORTED") ||
      TxBuildError.is(failed, "PROVIDER_FAILED")
    )
      throw failed;
    // Any other refusal is of a transaction the plan made, not of the parts the step was given
    throw tooLarge(
      `the consolidation step ${JSON.stringify(name)} the plan would put before it could not be built (${failed.code}): nothing was recorded`,
      failed,
    );
  }
};

/** A step built, as the event that appends it takes it: the first record's and `add`'s */
const newStepOf = (step: MadeStep): NewStep => ({
  name: step.name,
  ...(step.kind !== undefined && { kind: step.kind }),
  built: step.built,
  standsOn: step.standsOn,
  ...(step.after !== undefined && { after: step.after }),
  ...(step.expirySource !== undefined && {
    expirySource: step.expirySource,
  }),
  ...(step.given !== undefined && { given: step.given }),
  ...(step.extraKeyWitnesses !== undefined && {
    extraKeyWitnesses: step.extraKeyWitnesses,
  }),
});

/** The option of the step when it has one, else the plan's, as a member to spread */
const pick = <K extends keyof StepOptions>(
  plan: Partial<StepOptions>,
  own: StepOptions,
  key: K,
): Partial<Pick<StepOptions, K>> => {
  const value = own[key] !== undefined ? own[key] : plan[key];
  return value === undefined
    ? {}
    : ({ [key]: value } as Partial<Pick<StepOptions, K>>);
};
