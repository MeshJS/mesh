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
} from "../parts/types";
import type { Payer, PayerRead, PayerSource } from "../payer";
import type { KeyWitness, KeyWitnessTags } from "../sign";
import type {
  NewStep,
  PlanBefore,
  PlanRecord,
  PlanTip,
  StepGiven,
  StepRecord,
} from "./core";
import type { GuardStep, LineInput } from "./replace";
import type {
  PlanOptions,
  PlanStep,
  PlanSteps,
  StepOptions,
  StepParts,
} from "./types";
import { abortable } from "../abort";
import { isKeyLocked } from "../balance";
import {
  afterBound,
  flattenParts,
  isPartKind,
  ownAfterEntry,
  readAfter,
} from "../builder";
import { BuiltTx, isBuiltHere } from "../built-tx";
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
import { readTransactionItems } from "../sign";
import { scanTransaction } from "../tx-scan";
import { addValues, fromMultiAsset, negate, valueOf } from "../value";
import {
  buildConsolidation,
  isConsolidable,
  namedByParts,
} from "./consolidate";
import {
  advancePlan,
  emptyPlan,
  MAX_CONSOLIDATION_STEPS,
  MAX_STEPS,
  planUntil,
  sourcesOf,
  spentBefore,
  standsOnOf,
} from "./core";
import { effectiveDeadlines, horizonSlot } from "./deadlines";
import { decodeTx, unquoted, UnreadContent } from "./json";
import { chainObserver } from "./observer";
import { rootGuards } from "./replace";

// Builds a plan: every body at once, in order, each on the UTxOs the steps before it
// leave. Each payer is read once; each step is built with the steps before it as `after`, so
// that their inputs are not selected again and their change at the step's change address is
// selectable; a step spends the change of the step before it of the same payer; a part linked
// to an earlier step is filled in from that step's own transaction; every step the plan builds
// ends at the plan's one deadline. A step given as a transaction built before is read from its
// own bytes by `fromCbor`, before any step is built, and no other step spends or selects what it
// spends. Nothing is signed and nothing is sent. Nothing here is exported from the package.

/** The options `makePlan` takes: those of a plan, with `after` as built data only */
export type MakePlanOptions = Omit<PlanOptions, "after"> & {
  after?: BuiltTxData | readonly BuiltTxData[];
};

/**
 * A step the plan built: its transaction, its name, what it stands on, and how it was given; a
 * consolidation step the plan put in itself, and a transaction given built, have their kind and
 * no parts given
 */
export type MadeStep = {
  readonly name: string;
  readonly kind?: "consolidation" | "prebuilt";
  readonly built: BuiltTxData;
  /** The names of the earlier steps whose outputs it spends, reads or puts up as collateral */
  readonly standsOn: readonly string[];
  /** The hashes of the transactions of `after` whose outputs it spends, reads or puts up */
  readonly after?: readonly string[];
  /** A transaction before those of `after`, when every input comes from one of them */
  readonly expirySource?: string;
  readonly given?: StepGiven;
  readonly extraKeyWitnesses?: number;
  /** Of a prebuilt step: the witnesses it came with, verified against its body */
  readonly witnesses?: readonly KeyWitness[];
  /** Of a prebuilt step: the set tag of each entry of its witnesses */
  readonly tags?: KeyWitnessTags;
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

/** The call an aborted signal names */
const CALL = "the call";

/** The most steps a plan may have, as the state machine counts them */
export { MAX_STEPS };

/** The start of the names the plan gives the steps it puts in itself */
const RESERVED_PREFIX = "consolidate-";

/** The most consolidation steps a plan has when its options give no limit */
const DEFAULT_CONSOLIDATION_STEPS = 4;

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
  // A plain object: a Map, a Date or an instance of a class is none, nor is an object whose
  // maxSteps comes from its prototype
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw invalidOption(
      "consolidate",
      value,
      CONSOLIDATE_ALLOWED,
      ", not a plain object",
    );
  if (Reflect.ownKeys(value).some((key) => key !== "maxSteps"))
    throw invalidOption(
      "consolidate",
      value,
      CONSOLIDATE_ALLOWED,
      ", with a member other than maxSteps",
    );
  const { maxSteps } = value as Record<string, unknown>;
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
  "one list of parts, or an object of named steps, each parts, { parts, ...options }, a BuiltTx or a transaction in CBOR hex";

/** The steps `plan.add` takes */
const ADDED_ALLOWED =
  "an object of named steps, each parts, { parts, ...options }, a BuiltTx or a transaction in CBOR hex";

/** The steps `plan.add` takes, and the builder it takes them on */
const ADDED_HELD_ALLOWED =
  "an object of named steps, on a builder that holds no parts from add";

/**
 * INVALID_OPTION (`steps`)
 * @param given What was given, when the refusal is about it: `details.value` holds its
 *   JavaScript type alone, never the value, which may be or hold a key or a transaction
 */
const invalidSteps = (
  reason: string,
  given?: { readonly value: unknown },
  allowed = STEPS_ALLOWED,
) =>
  new TxBuildError("INVALID_OPTION", `invalid steps: ${reason}`, {
    details: {
      option: "steps",
      value: given === undefined ? undefined : typeOf(given.value),
      allowed,
    },
  });

/**
 * INVALID_OPTION (`steps`) for steps given to `plan.add`
 * @param given What was given, when the refusal is about it: its JavaScript type alone is held
 */
export const invalidAddedSteps = (
  reason: string,
  given?: { readonly value: unknown },
) => invalidSteps(reason, given, ADDED_ALLOWED);

/**
 * A refusal of steps as `plan.add` tells it: the forms `add` takes in `details.allowed` of the
 * error and of its causes, in place of those of `builder.plan`
 */
const asAdded = (error: unknown): unknown => {
  for (
    let each: unknown = error;
    each instanceof TxError;
    each = (each as TxError).cause
  )
    if (
      TxBuildError.is(each, "INVALID_OPTION") &&
      each.details.option === "steps" &&
      each.details.allowed === STEPS_ALLOWED
    )
      (each.details as { allowed: string }).allowed = ADDED_ALLOWED;
  return error;
};

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
  /**
   * A transaction given built, as it was given; its bytes, read once: the text given, or the
   * object's `partialTx`; and the hash of its body when one is read from those bytes without a
   * request. Such a step has no parts and no options
   */
  readonly prebuilt?: {
    readonly tx: BuiltTx | string;
    readonly text: string;
    readonly txHash?: string;
  };
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a value is one part, of any kind, linked or not */
const isOnePart = (value: unknown) =>
  isObject(value) && typeof value.kind === "string";

/**
 * Whether the steps given are one part: an object whose own `kind` names a part kind. Any other
 * object is named steps, one of which may be named `kind`
 */
const stepsAreOnePart = (steps: unknown) =>
  isObject(steps) &&
  Object.prototype.hasOwnProperty.call(steps, "kind") &&
  isPartKind(steps.kind);

/**
 * Refuses an object of steps whose prototype is neither `Object.prototype` nor `null`, before
 * anything is read of it: a `Map`, an object of a class or of another realm, and a plain object
 * whose prototype a member `__proto__` of a literal, or `steps["__proto__"] = step`, set to an
 * object in place of a step, which no name then lists. A list, a transaction built before and
 * what is no object are left to the reading
 * @throws TxBuildError INVALID_OPTION (`steps`)
 */
const refusePrototype = (steps: unknown, allowed: string) => {
  if (!isObject(steps) || steps instanceof BuiltTx) return;
  const prototype: unknown = Object.getPrototypeOf(steps);
  if (prototype === Object.prototype || prototype === null) return;
  throw invalidSteps(
    "the steps are not a plain object (their prototype is another): give them as a plain object, or built with Object.fromEntries",
    { value: steps },
    allowed,
  );
};

/** Whether a value is the data or the JSON of a transaction, and not the object */
const isTransactionData = (value: unknown) =>
  isObject(value) &&
  !(value instanceof BuiltTx) &&
  ((typeof value.tx === "string" && typeof value.txHash === "string") ||
    value.kind === "BuiltTx");

/** Whether a value is a transaction built before: a `BuiltTx`, its data or its JSON */
const isBuiltTransaction = (value: unknown) =>
  value instanceof BuiltTx || isTransactionData(value);

/**
 * The hash of the body of a transaction given built, in lower case, read without a request from
 * its bytes (the CBOR given, or an object's `partialTx`; an object's `txHash` is not believed),
 * as `fromCbor` reads them after the same walk. Undefined for a text no transaction is read from
 */
const prebuiltHash = (
  builder: TxBuilder,
  bytes: string,
): string | undefined => {
  try {
    const text = bytes.toLowerCase();
    scanTransaction(text, builder.params?.maxTxSize);
    return readTransactionItems(text).txId.toLowerCase();
  } catch {
    return undefined;
  }
};

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

/**
 * The steps as given, in their forms, read in order; their links are not read here
 * @param held The parts one list of parts gets first, and that named steps are refused beside:
 *   the builder's from `add`, unless the plan makes the steps itself
 */
const readStepForms = (
  builder: TxBuilder,
  steps: unknown,
  options: MakePlanOptions,
  held: readonly TxPart[] = internals(builder).added,
): StepInput[] => {
  refusePrototype(steps, STEPS_ALLOWED);
  if (
    !isBuiltTransaction(steps) &&
    (Array.isArray(steps) || stepsAreOnePart(steps))
  )
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
    throw invalidSteps(`expected ${STEPS_ALLOWED}`, { value: steps });
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
    // An own member of that name, as JSON.parse or Object.fromEntries make one, is set on a
    // plain object as its prototype: the step would be lost from the steps a plan gives back
    if (name === "__proto__")
      throw invalidSteps(
        `the step name ${JSON.stringify(name)} is the name of an object's prototype, which an object of steps cannot hold as a step: give the step another name`,
      );
    const step = steps[name];
    // A transaction built before is taken as it is, read later from its own bytes
    if (step instanceof BuiltTx || typeof step === "string") {
      let text: string;
      try {
        text = step instanceof BuiltTx ? step.partialTx : step;
      } catch {
        throw invalidSteps(
          `step ${JSON.stringify(name)} is an object whose transaction is not read: give the object build, finalize, fromCbor or restore returns, or the transaction's CBOR hex`,
          { value: step },
        );
      }
      const txHash = prebuiltHash(builder, text);
      return {
        name,
        parts: [],
        options: {},
        prebuilt: { tx: step, text, ...(txHash !== undefined && { txHash }) },
      };
    }
    // Its data or its JSON states what its bytes may not hold: only the object or the bytes
    if (isTransactionData(step))
      throw invalidSteps(
        `step ${JSON.stringify(name)} is the data or the JSON of a transaction built before, which a plan does not read: give the object build, finalize, fromCbor or restore returns, or the transaction's CBOR hex`,
        { value: step },
      );
    if (Array.isArray(step) || isOnePart(step))
      return { name, parts: flatten(step, name), options: {} };
    if (!isObject(step) || !("parts" in step))
      throw invalidSteps(
        `step ${JSON.stringify(name)} is neither parts nor { parts, ...options }`,
        { value: step },
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

/**
 * Refuses a step given as text that no transaction is read from, not hex, empty or refused by
 * the walk of its bytes, with the error `builder.fromCbor` gives that text, the step's name at
 * the start of its message: the reader refuses it before it makes any request, so nothing is
 * read before, neither the tip, nor a payer, nor the store
 * @throws every error `builder.fromCbor` throws before a request
 */
export const refuseUnread = async (
  builder: TxBuilder,
  read: readonly StepInput[],
): Promise<void> => {
  for (const step of read) {
    if (step.prebuilt === undefined || step.prebuilt.txHash !== undefined)
      continue;
    try {
      await builder.fromCbor(step.prebuilt.text);
    } catch (error) {
      throw withStep(error, step.name);
    }
  }
};

/**
 * The steps of `builder.plan` read in their forms, a step given as text that no transaction is
 * read from refused, with no request
 * @throws TxBuildError INVALID_OPTION (`steps`) as `readSteps`; what `refuseUnread` throws
 */
export const checkPlanSteps = async (
  builder: TxBuilder,
  steps: unknown,
  options: MakePlanOptions,
): Promise<void> => refuseUnread(builder, readSteps(builder, steps, options));

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
          ? "none of its outputs has a label (a transaction given built has labels only as an object build or finalize made in this process): name the output by its position"
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
  earlier: readonly Pick<StepBefore, "name" | "built" | "prebuilt">[],
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
    // Of a transaction given built only the outputs it was given with marked are change: none
    // marked is not none made, and a link that fills to nothing would drop an input unsaid
    if (
      "change" in link &&
      before.prebuilt === true &&
      before.built.change.length === 0
    )
      throw invalidSteps(
        `a link names the change of step ${JSON.stringify(link.step)}, a transaction given built with no output marked change: name the output by its position, { step: ${JSON.stringify(link.step)}, output: n }`,
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
  const putUp = new Set(
    parts.flatMap((part) =>
      part.kind === "collateral"
        ? [`${part.input.transaction_id}#${part.input.index}`]
        : [],
    ),
  );
  return freeChange(
    previous,
    changeAddress,
    earlier,
    (output) => putUp.has(utxoKey(output)),
    canSelect,
  );
};

/**
 * The change of a step before, of the same payer, that a step may spend: its first change output
 * at the payer's change address, key-locked, spent by no earlier step, not `kept`, and taken by
 * `canSelect` when one is given; else why there is none
 */
const freeChange = (
  previous: Pick<MadeStep, "name" | "built">,
  changeAddress: string,
  earlier: readonly Pick<MadeStep, "name" | "built">[],
  kept: (output: Utxo) => boolean,
  canSelect: ((utxo: Utxo) => boolean) | undefined,
): Utxo | { readonly none: string } => {
  const spent = new Set(
    earlier.flatMap((step) => step.built.inputs.map((input) => utxoKey(input))),
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
    (output) => !spent.has(utxoKey(output)) && !kept(output),
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
 * The change of the step before, of the same payer, that the first consolidation step made for
 * a step stands on when the step itself spends none of it: as `changeToSpend` finds it, out of
 * every output the step's parts spend, read or put up; undefined when there is none
 */
const changeBefore = (
  parts: readonly TxPart[],
  previous: Pick<MadeStep, "name" | "built">,
  changeAddress: string,
  earlier: readonly Pick<MadeStep, "name" | "built">[],
  canSelect: ((utxo: Utxo) => boolean) | undefined,
): Utxo | undefined => {
  const named = namedByParts(parts);
  const found = freeChange(
    previous,
    changeAddress,
    earlier,
    (output) => named.has(utxoKey(output).toLowerCase()),
    canSelect,
  );
  return "none" in found ? undefined : found;
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

/** The data options a plan records, in the order of its record, and builds its steps with */
const PLAN_DATA_OPTIONS = [
  "knownUtxos",
  "registeredPools",
  "extraKeyWitnesses",
  "topUpCollateral",
  "collateralReturn",
  "consolidate",
] as const;

/** The data options of a plan, with its payer's change address, for its record */
const planOptionsOf = (
  options: MakePlanOptions,
  changeAddress: string | undefined,
): Record<string, unknown> => {
  const out: Record<string, unknown> =
    changeAddress === undefined ? {} : { changeAddress };
  for (const key of PLAN_DATA_OPTIONS) {
    const value = options[key];
    if (value === undefined) continue;
    // UTxOs in the builder's form, whatever form they were given in; `consolidate` checked
    out[key] =
      key === "knownUtxos"
        ? toKnownUtxos(value as NonNullable<MakePlanOptions["knownUtxos"]>)
        : key === "consolidate"
          ? consolidateOf(value)
          : value;
  }
  return out;
};

/** The data options a plan records, as its steps are built with them */
const recordedOptionsOf = (
  recorded: PlanRecord["options"],
): Pick<MakePlanOptions, (typeof PLAN_DATA_OPTIONS)[number]> => {
  const out: Record<string, unknown> = {};
  for (const key of PLAN_DATA_OPTIONS)
    if (recorded[key] !== undefined) out[key] = recorded[key];
  return out;
};

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
 *   two change addresses, with its JavaScript type only; every error of reading a payer; ABORTED
 *   at once when the signal aborts while a read hangs
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
    // A transaction given built is paid already: no payer is asked for it
    if (step.prebuilt !== undefined) continue;
    const payer = payerOf(step);
    if (payer === undefined) throw context.missing(step);
    if (!payers.includes(payer)) payers.push(payer);
  }
  // The call's signal ends the wait for a read that hangs: what it answers later is dropped
  const reads = await abortable(
    Promise.all(
      payers.map((payer) =>
        internals(builder).readGivenPayer(payer, context.signal),
      ),
    ),
    context.signal,
    CALL,
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

/**
 * A step's name and how its record holds it given: its parts and options; of a transaction given
 * built its kind and the hash of its body, absent when none could be read
 */
export type GivenStep =
  | { readonly name: string; readonly given: StepGiven }
  | {
      readonly name: string;
      readonly kind: "prebuilt";
      readonly txHash?: string;
    };

/**
 * Each step's name and how its record holds it given, worked out without building, for
 * `orderOf` and `plan.add`: a step with a payer of its own has that payer asked for its change
 * address, and no other payer is asked; a transaction given built is told by the hash of its
 * body alone; no UTxO is read
 */
export const givenSteps = async (
  read: readonly StepInput[],
  addressOf: AddressOf,
): Promise<GivenStep[]> => {
  const out: GivenStep[] = [];
  for (const step of read) {
    if (step.prebuilt !== undefined) {
      const { txHash } = step.prebuilt;
      out.push({
        name: step.name,
        kind: "prebuilt",
        ...(txHash !== undefined && { txHash }),
      });
      continue;
    }
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
  readonly steps: readonly GivenStep[];
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
  // Every step built from parts has a payer, the payers asked in the order of the steps
  for (const step of given) {
    if (step.prebuilt !== undefined) continue;
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
 * flattening. A builder that holds parts from `add` is refused: they are not the steps'.
 * Their links are not read here
 * @throws TxBuildError INVALID_OPTION (`steps`) for one list of parts, one part, a text, a
 *   transaction built before, or anything but an object of named steps, with the JavaScript type
 *   in `details.value`; for all that `builder.plan` refuses of named steps
 */
export const readAddedSteps = (
  builder: TxBuilder,
  steps: unknown,
): StepInput[] => {
  refusePrototype(steps, ADDED_ALLOWED);
  if (!isObject(steps) || stepsAreOnePart(steps) || isBuiltTransaction(steps))
    throw invalidAddedSteps(
      Array.isArray(steps) || stepsAreOnePart(steps)
        ? "one list of parts is the step main of a new plan; steps are added by name, { name: parts }"
        : `expected ${ADDED_ALLOWED}`,
      { value: steps },
    );
  if (Object.keys(steps).length === 0)
    throw invalidAddedSteps("no step is given", { value: steps });
  const held = internals(builder).added.length;
  if (held > 0)
    throw invalidSteps(
      `the builder holds ${held} part(s) from add: steps added to a plan are built without the parts a builder holds; resume the plan on a builder that holds none`,
      undefined,
      ADDED_HELD_ALLOWED,
    );
  try {
    return readStepForms(builder, steps, {});
  } catch (error) {
    throw asAdded(error);
  }
};

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
  try {
    checkLinks(read, recorded);
  } catch (error) {
    throw asAdded(error);
  }
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
  const without = read.find(
    (step) => step.prebuilt === undefined && step.options.payer === undefined,
  );
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
 * A step of a record as a step before those a loop builds: final, or in a block, with its kind,
 * the steps it stands on and its payer's change address: its own, else the plan's; of a
 * consolidation step the address its outputs pay; of a step given built none, as it is of no
 * payer by default and its outputs marked change tell
 * @param options The data options of the plan the step is recorded in
 */
const stepBeforeOf = (
  step: StepRecord,
  options: PlanRecord["options"],
): StepBefore => {
  const own = step.given?.options?.changeAddress;
  const changeAddress =
    step.kind === "prebuilt"
      ? undefined
      : step.kind === "consolidation"
        ? (step.built.change[0] ?? step.built.outputs[0])?.address
        : typeof own === "string"
          ? own
          : typeof options.changeAddress === "string"
            ? options.changeAddress
            : undefined;
  return {
    name: step.name,
    built: step.built,
    ...(changeAddress !== undefined && { changeAddress }),
    final: step.status === "final",
    ...(step.status === "included" && { included: true as const }),
    ...(step.kind === "consolidation" && { consolidation: true as const }),
    ...(step.kind === "prebuilt" && { prebuilt: true as const }),
    standsOn: step.standsOn,
  };
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
    /** Told each payer's read before any step is built; what it throws stops the call */
    readonly withReads?: (
      reads: readonly { readonly step: StepInput; readonly read: PayerRead }[],
    ) => Promise<void>;
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
  await context.withReads?.(
    read
      .filter((step) => step.prebuilt === undefined)
      .map((step) => ({ step, read: readOf(step) })),
  );
  const recorded = base.options;
  const made = await buildSteps(builder, read, {
    before: base.steps.map((step) => stepBeforeOf(step, recorded)),
    after: [],
    tip: context.tip,
    ttlMs: base.deadlines.ttlMs,
    ...(base.id !== undefined && { planId: base.id }),
    options: {
      ...recordedOptionsOf(recorded),
      ...(signal !== undefined && { signal }),
      ...(trace !== undefined && { trace }),
    },
    readOf,
    formOf: (step) => toPayerSource(payerOf(step)).form,
  }).catch((error: unknown) => {
    throw asAdded(error);
  });
  return made.map(newStepOf);
};

/**
 * The steps of a plan made in place of another, read as `builder.plan` reads steps. Steps the
 * application gives (`own`) take the builder's parts from `add` as `builder.plan` does; steps
 * the plan makes of what is left hold their parts already, and take none
 * @throws TxBuildError INVALID_OPTION (`steps`) as `builder.plan`
 */
export const readReplanSteps = (
  builder: TxBuilder,
  steps: unknown,
  options: MakePlanOptions,
  own: boolean,
): StepInput[] =>
  readStepForms(builder, steps, options, own ? internals(builder).added : []);

/**
 * Checks the links of the steps of a plan made in place of another, and fills in those to a
 * kept step from that step's own transaction: the filled part stands in the step from here on.
 * A link names a step given before its own, a kept step, or a taken step; a link to a taken step
 * stays a link, which the build fills from the step the new plan holds
 * @param kept The final steps of the plan replaced
 * @param taken The names of the steps the new plan takes of it
 * @throws TxBuildError INVALID_OPTION (`steps`) for a link to any other step, to an output past
 *   the last, or to an output a kept step spends; UNKNOWN_LABEL; TxPartError for an output the
 *   part cannot take
 */
export const fillKeptLinks = (
  read: readonly StepInput[],
  kept: readonly Pick<StepRecord, "name" | "kind" | "built">[],
  taken: readonly string[] = [],
): StepInput[] => {
  checkLinks(read, [...kept.map((step) => step.name), ...taken]);
  const earlier = kept.map((step) => ({
    name: step.name,
    built: step.built,
    ...(step.kind === "prebuilt" && { prebuilt: true as const }),
  }));
  return read.map((step) => {
    if (!step.parts.some((part) => isLinkedPart(part))) return step;
    try {
      const parts = step.parts.flatMap((part) =>
        isLinkedPart(part) && kept.some((each) => each.name === part.link.step)
          ? fillLinks([part], step.name, earlier, [])
          : [part],
      );
      return { ...step, parts };
    } catch (error) {
      throw withStep(error, step.name);
    }
  });
};

/**
 * The parts each step of a plan made in place of another gets beside its own: for each root of
 * the open transactions, the input it shares with the first step built for the payer whose read
 * holds it (`rootGuards`), as `spend.pubKey({ utxo })`
 * @param open The open transactions that may still land
 * @param reads Each step built from parts, with its payer's read
 * @param prebuilt The steps given built, as `readPrebuilt` read them
 */
const guardsOf = (
  open: readonly LineInput[],
  reads: readonly { readonly step: StepInput; readonly read: PayerRead }[],
  read: readonly StepInput[],
  prebuilt: ReadonlyMap<string, PrebuiltRead>,
  taken: readonly StepBefore[],
): ReadonlyMap<string, readonly TxPart[]> => {
  const byPayer = new Map<string, readonly Utxo[]>();
  for (const each of reads)
    byPayer.set(each.read.snapshot.changeAddress, each.read.snapshot.utxos);
  const payerOf = new Map(
    reads.map((each) => [each.step.name, each.read.snapshot.changeAddress]),
  );
  const steps: GuardStep[] = read.flatMap((step): GuardStep[] => {
    const body = prebuilt.get(step.name);
    if (body !== undefined) return [{ name: step.name, built: body.built }];
    const payer = payerOf.get(step.name);
    // A link to a taken step counts as the out refs it names, so that no guard goes in beside
    // a link that spends the same output
    const parts = step.parts.flatMap((part) =>
      isLinkedPart(part) && taken.some((each) => each.name === part.link.step)
        ? fillLinks([part], step.name, taken, [])
        : [part],
    );
    return payer === undefined ? [] : [{ name: step.name, payer, parts }];
  });
  const parts = new Map<string, TxPart[]>();
  for (const guard of rootGuards(open, byPayer, steps).added)
    parts.set(guard.step, [
      ...(parts.get(guard.step) ?? []),
      spend.pubKey({ utxo: guard.utxo }),
    ]);
  return parts;
};

/** What a plan made in place of another was built to */
export type MadeReplan = {
  /** The steps the call built, in order: those the pair rule judges */
  readonly steps: readonly MadeStep[];
  /** The taken steps, as the first record holds them */
  readonly taken: readonly NewStep[];
  readonly record: PlanRecord;
};

/**
 * A taken step as the first record of the plan made in place of `base` holds it: its
 * transaction, witnesses, kind and block as `base` records them; the taken steps before it that
 * it stands on; and its parts, each link to a kept step filled with that step's output (a link
 * to a taken step stays), with the change address of its payer when the new plan's is another
 */
const takenStepOf = (
  step: StepRecord,
  before: readonly StepRecord[],
  kept: readonly StepRecord[],
  base: PlanRecord,
  planAddress: string | undefined,
): NewStep => {
  const earlier = kept.map((each) => ({
    name: each.name,
    built: each.built,
    ...(each.kind === "prebuilt" && { prebuilt: true as const }),
  }));
  const given =
    step.given === undefined
      ? undefined
      : (() => {
          const parts = step.given.parts.flatMap((part) =>
            isLinkedPart(part) &&
            kept.some((each) => each.name === part.link.step)
              ? fillLinks([part], step.name, earlier, [])
              : [part],
          );
          const own = step.given.options?.changeAddress;
          const recorded = base.options.changeAddress;
          const options =
            typeof own !== "string" &&
            typeof recorded === "string" &&
            planAddress !== recorded
              ? { ...step.given.options, changeAddress: recorded }
              : step.given.options;
          return { parts, ...(options !== undefined && { options }) };
        })();
  return {
    name: step.name,
    ...(step.kind !== undefined && { kind: step.kind }),
    taken: true,
    seen: step.seen!,
    built: step.built,
    witnesses: step.witnesses,
    ...(step.tags !== undefined && { tags: step.tags }),
    ...(step.extraKeyWitnesses !== undefined && {
      extraKeyWitnesses: step.extraKeyWitnesses,
    }),
    ...(step.after !== undefined && { after: step.after }),
    ...(step.expirySource !== undefined && {
      expirySource: step.expirySource,
    }),
    standsOn: standsOnOf(step.built, before),
    ...(given !== undefined && { given }),
  };
};

/**
 * Builds the steps of a plan made in place of `base`, in the one loop of `makePlan`, and its
 * first record in memory. Each payer is read once; `withReads` is told the reads before any
 * step is built and gives the parts a step gets beside its own, which are built with it and are
 * no part of how it was given. The steps before are the final and the taken steps of `base`, in
 * its order: what they spent is never selected, and their outputs are known to a link and to a
 * step given built. No step stands on a final one by the order rule; a step stands on the taken
 * step before it of its payer by its change, when the payer's read lists it, else `cannotStand`
 * refuses it. The first record holds the taken steps first, then the steps built. The deadlines
 * and data options are the call's, else those `base` records
 * @param keep What the new record keeps of the plans before it, from the steps built
 * @throws as `makePlan` throws of building its steps; MISSING_PAYER; what `withReads` throws
 */
export const buildReplan = async (
  builder: TxBuilder,
  base: PlanRecord,
  read: readonly StepInput[],
  context: {
    readonly id: string;
    readonly options: MakePlanOptions;
    /** The payer of the steps that name none */
    readonly payer?: Payer;
    readonly asked: AddressOf;
    readonly tip: PlanTip;
    /**
     * The open transactions of the line that may still land: each root among them gets the
     * input it shares with the first step built for the payer that holds it
     */
    readonly open: readonly LineInput[];
    /** Told the reads before any step is built; what it throws stops the call */
    readonly withReads: (
      reads: readonly { readonly step: StepInput; readonly read: PayerRead }[],
    ) => Promise<void>;
    readonly keep: (steps: readonly MadeStep[]) => PlanBefore;
    /** The steps of `base` the new plan takes, in the order of `base` */
    readonly taken: readonly StepRecord[];
    /** The error of a step that cannot stand on a taken step: the call waits */
    readonly cannotStand: (
      step: string,
      taken: Pick<StepRecord, "name" | "txHash">,
      why: string,
    ) => unknown;
  },
): Promise<MadeReplan> => {
  const { id, options, tip, asked } = context;
  const deadlines = effectiveDeadlines(options, base.deadlines);
  consolidateOf(options.consolidate);
  const { signal } = options;
  const payerOf = (step: StepInput) => step.options.payer ?? context.payer;
  const { readOf, readOfPayer } = await readStepPayers(builder, read, payerOf, {
    missing: (step) =>
      new TxBuildError(
        "MISSING_PAYER",
        `step ${JSON.stringify(step.name)}: no payer: give the call a payer, or the step its own`,
      ),
    ...(signal !== undefined && { signal }),
    asked,
  });
  const reads = read
    .filter((step) => step.prebuilt === undefined)
    .map((step) => ({ step, read: readOf(step) }));
  await context.withReads(reads);
  const kept = base.steps.filter((step) => step.status === "final");
  const keptNames = new Set(kept.map((step) => step.name));
  const takenNames = new Set(context.taken.map((step) => step.name));
  const merged: MakePlanOptions = { ...recordedOptionsOf(base.options) };
  for (const [key, value] of Object.entries(options))
    if (value !== undefined)
      (merged as Record<string, unknown>)[key] = value as unknown;
  const before = base.steps.flatMap((step): StepBefore[] =>
    keptNames.has(step.name)
      ? [
          {
            name: step.name,
            built: step.built,
            final: true,
            ...(step.kind === "consolidation" && {
              consolidation: true as const,
            }),
            ...(step.kind === "prebuilt" && { prebuilt: true as const }),
            standsOn: step.standsOn,
          },
        ]
      : takenNames.has(step.name)
        ? [{ ...stepBeforeOf(step, base.options), taken: true as const }]
        : [],
  );
  // Read from the transactions' own bytes, as `makePlan` reads them
  const after = readAfter(options.after, afterBound(builder.params));
  // The steps given built, read once by the one reader: the guards keep off what they name
  const prebuilt = await readPrebuilt(builder, read, {
    before,
    after,
    ...(merged.knownUtxos !== undefined && { knownUtxos: merged.knownUtxos }),
    ...(signal !== undefined && { signal }),
  });
  const extra = guardsOf(
    context.open,
    reads,
    read,
    prebuilt,
    before.filter((step) => step.taken === true),
  );
  const added = new Set<unknown>();
  const given = read.map((step) => {
    const more = extra.get(step.name);
    if (more === undefined || more.length === 0) return step;
    for (const part of more) added.add(part);
    return { ...step, parts: [...step.parts, ...more] };
  });
  const built = await buildSteps(builder, given, {
    before,
    after,
    prebuilt,
    tip,
    ttlMs: deadlines.ttlMs,
    planId: id,
    options: merged,
    readOf,
    formOf: (step) => toPayerSource(payerOf(step)!).form,
    cannotStand: (step, taken, why) =>
      context.cannotStand(
        step,
        { name: taken.name, txHash: taken.built.txHash },
        why,
      ),
  });
  // The kept steps of the plan replaced are no steps of this one; the parts given beside a
  // step's own are no part of how it was given
  const steps = built.map((step): MadeStep => ({
    ...step,
    standsOn: step.standsOn.filter((name) => !keptNames.has(name)),
    ...(step.given !== undefined && {
      given: {
        ...step.given,
        parts: step.given.parts.filter((part) => !added.has(part)),
      },
    }),
  }));
  const planPayer =
    context.payer === undefined ? undefined : readOfPayer(context.payer);
  const planAddress =
    planPayer?.snapshot.changeAddress ??
    (context.payer === undefined
      ? typeof base.options.changeAddress === "string"
        ? base.options.changeAddress
        : undefined
      : await abortable(asked(context.payer), signal, CALL));
  const taken = context.taken.map((step, i) =>
    takenStepOf(step, context.taken.slice(0, i), kept, base, planAddress),
  );
  const first = advancePlan(
    emptyPlan({
      id,
      ...(base.id !== undefined && { replaces: base.id }),
      before: context.keep(steps),
      network: recordNetwork(builder),
      deadlines,
      options: planOptionsOf(merged, planAddress),
    }),
    { type: "steps", steps: [...taken, ...steps.map(newStepOf)] },
  );
  // The steps are built here, so the state machine refusing them is a fault of this code
  if (!first.ok)
    throw new Error(`the plan's first record was refused: ${first.message}`);
  return { steps, taken, record: first.json };
};

/**
 * Builds a plan. Every step given as parts is built by this call, in order, and every step given
 * as a transaction built before is read from its bytes first: each payer is read once, and each
 * step is built on the payer's UTxOs as the steps before it leave them. A step spends
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
 *   the step's name at the start of its message; for a step given built, the refusals of
 *   `readPrebuilt` (two steps on one output, an output one reads or puts up that another spends,
 *   one transaction under two names, an object that lists another number of outputs, a
 *   transaction a record does not hold) and of `buildSteps` (a step that spends what one reads
 *   or puts up, a link to the change of one with no output marked change), and the TxBuildError
 *   errors of `fromCbor`, with the step's name at the start of their message
 * @throws TxPlanError CANNOT_OBSERVE (`noTip`) when the tip cannot be read; INVALID_STATE
 *   (`pastHorizon`); INVALID_WITNESS (`wrongBody`) of `fromCbor`, for a step given built that
 *   holds a signature that is not of its body
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
    // Read from their bytes at the door; an entry read already is taken as it is
    after: readAfter(options.after, afterBound(builder.params)),
    tip,
    ttlMs: deadlines.ttlMs,
    ...(id !== undefined && { planId: id }),
    options,
    readOf,
    formOf: (step) => toPayerSource(payerOf(step)).form,
  });

  // The plan's payer was read when a step built from parts is paid by it; else (every step is
  // given built or has a payer of its own) its change address is asked alone, so that the
  // record holds it as the order of the same call does
  const planPayer =
    options.payer === undefined ? undefined : readOfPayer(options.payer);
  const planAddress =
    planPayer?.snapshot.changeAddress ??
    (options.payer === undefined
      ? undefined
      : await abortable(addressBook(builder)(options.payer), signal, CALL));
  const planOptions = planOptionsOf(options, planAddress);
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
  /** It is a taken step: a step that cannot stand on it makes the call wait */
  readonly taken?: true;
  /** It is a consolidation step the plan put in itself */
  readonly consolidation?: true;
  /** The step a consolidation step this loop built serves */
  readonly serves?: string;
  /**
   * It is a transaction given built: of no payer but those at whose change address it has an
   * output marked change
   */
  readonly prebuilt?: true;
  /** The names of the steps before it that it stands on */
  readonly standsOn?: readonly string[];
};

/** Whether a step before is a step of the payer of this change address */
const isOfPayer = (step: StepBefore, changeAddress: string) =>
  step.prebuilt === true
    ? step.built.change.some((output) => output.address === changeAddress)
    : step.changeAddress === changeAddress;

/**
 * Whether parts stand on a step: they spend, read or put up an output of it, or of a step that
 * stands on it, through any steps between
 */
const standsThrough = (
  parts: readonly TxPart[],
  target: StepBefore,
  all: readonly StepBefore[],
) => {
  const on = new Set([target.name]);
  for (const each of all)
    if (each.standsOn?.some((name) => on.has(name))) on.add(each.name);
  const hashes = all
    .filter((each) => on.has(each.name))
    .map((each) => each.built.txHash);
  return parts.some((part) =>
    hashes.some((txHash) => standsOnTx(part, txHash)),
  );
};

/** A transaction given built, as the plan read it: its data and the witnesses it came with */
type PrebuiltRead = {
  readonly built: BuiltTxData;
  readonly witnesses: readonly KeyWitness[];
  readonly extraKeyWitnesses?: number;
  readonly tags: KeyWitnessTags;
};

/**
 * The objects `rest` of a plan gives for its steps given built: their labels are those the
 * record holds, which came only with an object built here
 */
const RECORDED_MARKS = new WeakSet<BuiltTx>();

/**
 * Marks an object `rest` gives for a step given built: a plan made from it takes its labels as
 * of an object built here
 */
export const withRecordedMarks = (tx: BuiltTx): BuiltTx => {
  RECORDED_MARKS.add(tx);
  return tx;
};

/**
 * The data of a transaction read from its bytes, with the two marks an object of it gives by
 * position, and nothing else of the object: `label` where its output is labelled, only of an
 * object `build` or `finalize` made in this process, or that `rest` gave from a record (a label
 * of a restored object is the word of whoever wrote its JSON, and decides what a link spends);
 * `change` where its output is marked change, of any object, since selection takes only such
 * an output at the payer's own change address
 * @throws TxBuildError INVALID_OPTION (`steps`) for an object that lists another number of
 *   outputs than its transaction has
 */
const withMarks = (
  built: BuiltTxData,
  object: BuiltTx,
  name: string,
): BuiltTxData => {
  const listed: readonly unknown[] = Array.isArray(object.outputs)
    ? object.outputs
    : [];
  if (listed.length !== built.outputs.length)
    throw invalidSteps(
      `step ${JSON.stringify(name)} is an object that lists ${listed.length} output(s), and its transaction has ${built.outputs.length}: give the object as it was made, or the transaction's CBOR hex`,
    );
  const labelled = isBuiltHere(object) || RECORDED_MARKS.has(object);
  const outputs = built.outputs.map((output, i): BuiltOutput => {
    const mark = listed[i];
    const label =
      labelled && isObject(mark) && typeof mark.label === "string"
        ? mark.label
        : undefined;
    const change = isObject(mark) && mark.change === true;
    return {
      ...plainUtxo(output),
      ...(label !== undefined && { label }),
      ...(change && { change: true as const }),
    };
  });
  return {
    ...built,
    outputs,
    change: outputs.filter((output) => output.change === true),
  };
};

/** An out ref as `txHash#index`, the hash in lower case */
const refKey = (ref: {
  readonly txHash: string;
  readonly outputIndex: number;
}) => `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;

/**
 * What a transaction given built keeps for itself beside what it spends: the out refs it reads
 * (reference inputs, those of reference scripts among them) and those it puts up as collateral,
 * each with how it uses it. Another step that spends one makes it fail for ever; two steps may
 * read one output, and may put up one UTxO as collateral, which a transaction whose scripts pass
 * does not spend
 */
const keptBy = (
  built: Pick<BuiltTxData, "referenceInputs" | "collateral">,
): Map<string, string> => {
  const kept = new Map<string, string>();
  for (const utxo of built.collateral?.inputs ?? [])
    kept.set(refKey(utxo), "puts up as collateral");
  for (const utxo of built.referenceInputs)
    if (!kept.has(refKey(utxo))) kept.set(refKey(utxo), "reads");
  return kept;
};

/**
 * The first of these out refs that a step given built keeps for itself, with that step and how
 * it uses it
 */
const keptAmong = (
  spends: readonly { readonly txHash: string; readonly outputIndex: number }[],
  keepers: readonly { readonly name: string; readonly built: BuiltTxData }[],
): { outRef: string; name: string; use: string } | undefined => {
  for (const ref of spends) {
    const outRef = refKey(ref);
    for (const each of keepers) {
      const use = keptBy(each.built).get(outRef);
      if (use !== undefined) return { outRef, name: each.name, use };
    }
  }
  return undefined;
};

/**
 * Reads every step given built, in order, before any step is built: each through
 * `builder.fromCbor`, the public reader, from the bytes given or the object's `partialTx`, with
 * the UTxOs the plan knows: the outputs of the steps before and of the steps given built before
 * it, from their own transactions; then those of the transactions of `after`, read from their
 * own bytes at the door (`readAfter`); then the
 * `knownUtxos` the call builds with; each out ref once, the first. Any other is read through the
 * provider. The object `fromCbor` returns becomes the step through its JSON and the reader of a
 * record: so a step enters a plan as a record gives it back.
 * @throws every error of `fromCbor`, with the step's name at the start of its message;
 *   TxBuildError INVALID_OPTION (`steps`) for a transaction a record does not hold, an object
 *   that lists another number of outputs, a transaction the plan has under another name, and
 *   one that spends an output a step before, a step given built before it or a transaction of
 *   `after` spends; ABORTED
 */
const readPrebuilt = async (
  builder: TxBuilder,
  given: readonly StepInput[],
  context: {
    readonly before: readonly StepBefore[];
    readonly after: readonly BuiltTxData[];
    readonly knownUtxos?: LoopOptions["knownUtxos"];
    readonly signal?: AbortSignal;
  },
): Promise<Map<string, PrebuiltRead>> => {
  const read = new Map<string, PrebuiltRead>();
  const done: { readonly name: string; readonly built: BuiltTxData }[] = [];
  const known = toKnownUtxos(context.knownUtxos);
  // The transactions of `after` were read from their own bytes at the door
  const ofAfter = context.after.flatMap((each) => each.outputs);
  for (const step of given) {
    if (step.prebuilt === undefined) continue;
    const { name } = step;
    const { tx, text } = step.prebuilt;
    try {
      // The plan's own transactions first: an entry of knownUtxos never replaces one of them
      const knownUtxos = new Map<string, Utxo>();
      const put = (utxo: Utxo) => {
        const key = utxoKey(utxo);
        if (!knownUtxos.has(key)) knownUtxos.set(key, plainUtxo(utxo));
      };
      for (const each of [...context.before, ...done])
        each.built.outputs.forEach(put);
      ofAfter.forEach(put);
      known.forEach(put);
      const object = await abortable(
        builder.fromCbor(text, {
          knownUtxos: Array.from(knownUtxos.values()),
        }),
        context.signal,
        CALL,
      );
      // Through the reader of a record: what a record cannot hold is no step
      let record: ReturnType<typeof decodeTx>;
      try {
        record = unquoted(() =>
          decodeTx(
            JSON.parse(JSON.stringify(object.toJSON())),
            object.txHash,
            "tx",
          ),
        );
      } catch (error) {
        if (!(error instanceof UnreadContent)) throw error;
        throw invalidSteps(
          `step ${JSON.stringify(name)} is a transaction a plan's record does not hold (${error.message}): send it on its own, with fromCbor`,
        );
      }
      let built =
        tx instanceof BuiltTx
          ? withMarks(record.built, tx, name)
          : record.built;
      if (built.validity?.until === undefined)
        built = {
          ...built,
          warnings: [
            ...built.warnings,
            {
              code: "NEVER_EXPIRES",
              message:
                "the transaction has no end of validity: the plan never calls it expired, and is not stopped while it may still land",
            },
          ],
        };
      // One transaction is one step, and no output is spent by two
      const txHash = built.txHash.toLowerCase();
      const twice = [...context.before, ...done].find(
        (each) => each.built.txHash.toLowerCase() === txHash,
      );
      if (twice !== undefined)
        throw invalidSteps(
          `step ${JSON.stringify(name)} is the transaction ${txHash} of step ${JSON.stringify(twice.name)}: a transaction is one step of a plan`,
        );
      const spender = spentBefore(built, [...context.before, ...done]);
      if (spender !== undefined)
        throw invalidSteps(
          `step ${JSON.stringify(name)} spends ${spender.outRef}, which step ${JSON.stringify(spender.name)} spends: two steps of a plan never spend one output`,
        );
      // What it reads or puts up no step of the plan spends, and what it spends no other step
      // given built reads or puts up: either would keep one of the two from ever landing
      for (const each of [...context.before, ...done]) {
        const taken = keptAmong(each.built.inputs, [{ name, built }]);
        if (taken !== undefined)
          throw invalidSteps(
            `step ${JSON.stringify(name)} ${taken.use} ${taken.outRef}, which step ${JSON.stringify(each.name)} spends: an output a step given built reads or puts up is never spent by another step of the plan`,
          );
      }
      const keeper = keptAmong(built.inputs, [
        ...context.before.filter(
          (each) => each.prebuilt === true && !each.final,
        ),
        ...done,
      ]);
      if (keeper !== undefined)
        throw invalidSteps(
          `step ${JSON.stringify(name)} spends ${keeper.outRef}, which step ${JSON.stringify(keeper.name)} ${keeper.use}: an output a step given built reads or puts up is never spent by another step of the plan`,
        );
      // Nor a transaction of after: what it reads or puts up, one of them spends
      for (const each of context.after) {
        const taken = keptAmong(each.inputs, [{ name, built }]);
        if (taken !== undefined)
          throw invalidSteps(
            `step ${JSON.stringify(name)} ${taken.use} ${taken.outRef}, which the transaction ${each.txHash} of after spends: an output a step given built reads or puts up is never spent by another transaction`,
          );
      }
      const afterSpender = spentBefore(
        built,
        context.after.map((each) => ({ name: each.txHash, built: each })),
      );
      if (afterSpender !== undefined)
        throw invalidSteps(
          `step ${JSON.stringify(name)} spends ${afterSpender.outRef}, which the transaction ${afterSpender.name} of after spends: two transactions never spend one output`,
        );
      read.set(name, {
        built,
        witnesses: record.witnesses,
        ...(record.extraKeyWitnesses !== undefined && {
          extraKeyWitnesses: record.extraKeyWitnesses,
        }),
        tags: record.tags,
      });
      done.push({ name, built });
    } catch (error) {
      throw withStep(error, name);
    }
  }
  return read;
};

/**
 * The token units a step's parts take out of the transaction beyond what they bring in: outputs
 * and burns against spent UTxOs and mints. A spend whose UTxO is not given yet is counted as
 * bringing nothing, so a unit may be named that selection then does not need
 */
const neededUnits = (parts: readonly TxPart[]): Set<string> => {
  const flow = addValues(
    ...parts.flatMap((part) => {
      if (part.kind === "output")
        return [fromMultiAsset(part.output.amount.multiasset)];
      if (part.kind === "spend" && part.utxo !== undefined)
        return [negate(valueOf(part.utxo.value))];
      // A burn takes out, a mint brings in
      if (part.kind === "mint")
        return [negate(fromMultiAsset({ [part.policyId]: part.assets }))];
      return [];
    }),
  );
  return new Set(
    Array.from(flow.assets).flatMap(([unit, n]) => (n > 0n ? [unit] : [])),
  );
};

/**
 * A consolidation step as a later step's build reads it in `after`: its parked outputs that
 * hold a unit the step needs marked as change, so that its selection may take them; the
 * others stay out of it. Without `needed`, every parked output is marked: a sweep takes all the
 * payer has. The step itself is not changed
 */
const withParkedOpen = (
  built: BuiltTxData,
  needed?: ReadonlySet<string>,
): BuiltTxData => {
  const opens = (output: BuiltOutput) =>
    output.change !== true &&
    (needed === undefined ||
      Object.entries(output.value).some(
        ([unit, quantity]) => needed.has(unit) && quantity > 0n,
      ));
  if (!built.outputs.some(opens)) return ownAfterEntry(built);
  const outputs = built.outputs.map((output) =>
    opens(output) ? { ...output, change: true as const } : output,
  );
  return ownAfterEntry({
    ...built,
    outputs,
    change: outputs.filter((output) => output.change === true),
  });
};

/**
 * A transaction of `after` of a build: a step as it is, and a final step with its inputs alone,
 * so that what it spent is never selected, named or put up, and what it left is taken from the
 * payer's read, since it may be spent by now
 */
export const asAfter = <T extends BuiltTxData>(built: T, final: boolean): T => {
  if (!final) return ownAfterEntry(built);
  const alone = { ...built, outputs: [], change: [] };
  INPUTS_ALONE.add(alone);
  return ownAfterEntry(alone);
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
 * again on the change of the last one, until it fits. The first stands on the change of the
 * step before it of the payer whenever the step's parts name none of that change, and none
 * takes a UTxO a step of the plan that is not final reads or puts up as collateral. The change
 * of a consolidation step holds only what `canSelect` let through: the next consolidation step
 * and the step spend it without asking. They are named `consolidate-N`, counted through the
 * plan, and at most the option's limit of them are in the plan as a whole. The
 * outputs a consolidation step parks are out of reach of the step it serves; a later step may
 * select those that hold a token unit its parts take out beyond what they bring in, and a later
 * step with `sendAllTo` every one of its payer, without asking `canSelect`, since they hold only
 * what it let through.
 *
 * Every step given as a transaction built before is read first, in order (`readPrebuilt`); it
 * takes its place among the steps in the order given. A step the loop builds gets in `after`
 * each such step before it whole, and each one after it with its inputs alone, so that nothing
 * such a step spends is selected or spent by another; nor is what such a step that is not final
 * reads or puts up as collateral, a part that spends it being INVALID_OPTION (`steps`). Such a
 * step is of a payer only by its outputs marked change at that payer's change address
 * @throws as `makePlan` throws of building its steps, each error with the step's name at the
 *   start of its message; TxBuildError TX_TOO_LARGE (`cause: "selection"`) for a step that
 *   needs more consolidation steps than the plan allows, whose consolidation step cannot be
 *   built, or leaves no change the step can stand on; what `readPrebuilt` throws
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
    /** The form of a step's payer as it was given */
    readonly formOf: (step: StepInput) => PayerSource["form"];
    /** The steps given built, read already by `readPrebuilt` with this context */
    readonly prebuilt?: ReadonlyMap<string, PrebuiltRead>;
    /**
     * The error of a step that cannot stand on the step before it of its payer when that step
     * is taken. Without it, the order rule's own error
     */
    readonly cannotStand?: (
      step: string,
      taken: StepBefore,
      why: string,
    ) => unknown;
  },
): Promise<MadeStep[]> => {
  const { after: before, tip, ttlMs, planId, options, readOf } = context;
  const { signal, trace } = options;
  const limit = consolidationLimit(options.consolidate);
  const prebuilt =
    context.prebuilt ??
    (await readPrebuilt(builder, given, {
      before: context.before,
      after: before,
      ...(options.knownUtxos !== undefined && {
        knownUtxos: options.knownUtxos,
      }),
      ...(signal !== undefined && { signal }),
    }));
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
    const read = prebuilt.get(name);
    if (read !== undefined) {
      const next: MadeStep = {
        ...madeOf(name, read.built),
        kind: "prebuilt",
        witnesses: read.witnesses,
        tags: read.tags,
        ...(read.extraKeyWitnesses !== undefined && {
          extraKeyWitnesses: read.extraKeyWitnesses,
        }),
      };
      made.push(next);
      all.push({
        name,
        built: read.built,
        final: false,
        prebuilt: true,
        standsOn: next.standsOn,
      });
      continue;
    }
    // The steps given built after this one: their inputs are spent by them
    const later = given.slice(index + 1).flatMap((each) => {
      const found = prebuilt.get(each.name);
      return found === undefined
        ? []
        : [{ name: each.name, built: found.built }];
    });
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
      // What a step given built that is not final reads or puts up, before this step or after
      // it, this step neither spends nor selects
      const keepers = [
        ...all.filter((each) => each.prebuilt === true && !each.final),
        ...later,
      ];
      const held = new Set(
        keepers.flatMap((each) => Array.from(keptBy(each.built).keys())),
      );
      const selectable =
        held.size === 0
          ? canSelect
          : (utxo: Utxo) =>
              !held.has(refKey(utxo)) &&
              (canSelect === undefined || canSelect(utxo));
      let built: BuiltTxData | undefined;
      /** The step's last TX_TOO_LARGE, which its consolidation steps serve */
      let served: TxBuildError<"TX_TOO_LARGE"> | undefined;
      while (built === undefined) {
        // The step before it of the same payer, told by the change address; a final one is on
        // chain, and the ledger keeps nothing in order after it
        const nearest = [...all]
          .reverse()
          .find((each) => isOfPayer(each, changeAddress));
        const previous = nearest?.final === true ? undefined : nearest;
        // The change of a consolidation step made for this step holds only what canSelect let
        // through: it is spent without asking
        const ownStep = previous?.serves === name;
        const found = changeToSpend(
          filled,
          previous,
          changeAddress,
          [...all, ...later],
          ownStep ? undefined : canSelect,
        );
        // The steps of one payer form a chain the ledger keeps in order: a step stands on the
        // step before it of its payer, by its change or by an output its parts name, of that
        // step or of a step that stands on it
        if (
          found !== undefined &&
          "none" in found &&
          !standsThrough(filled, previous!, all)
        ) {
          const refused = invalidSteps(
            `step ${JSON.stringify(name)} cannot stand on step ${JSON.stringify(previous!.name)}, the step before it of the same payer: ${found.none}, so step ${JSON.stringify(name)} could land before it. Link step ${JSON.stringify(name)} to an output of step ${JSON.stringify(previous!.name)}, or make it a plan of its own`,
          );
          if (previous!.taken === true && context.cannotStand !== undefined)
            throw context.cannotStand(name, previous!, found.none);
          // A step the application did not give is never one it is told to link to
          if (ownStep && served !== undefined)
            throw tooLargeOf(
              served,
              `the consolidation step ${JSON.stringify(previous!.name)} the plan would put before it leaves no change it can stand on: nothing was recorded`,
              refused,
            );
          throw refused;
        }
        const change =
          found === undefined || "none" in found ? undefined : found;
        // The change of a step in a block is what the chain shows of it: a read that does not
        // list it shows it spent, or is behind that block
        const unread =
          change !== undefined &&
          previous?.included === true &&
          !payer.snapshot.utxos.some(
            (utxo) => utxoKey(utxo) === utxoKey(change),
          );
        if (
          unread &&
          previous.taken === true &&
          context.cannotStand !== undefined
        )
          throw context.cannotStand(
            name,
            previous,
            "its change is not in the payer's read",
          );
        if (unread)
          throw invalidSteps(
            `step ${JSON.stringify(name)} cannot stand on step ${JSON.stringify(previous.name)}, the step before it of the same payer: the change of step ${JSON.stringify(previous.name)} is not in the payer's read; ${
              // A snapshot is read as it is given: nothing catches up by itself
              context.formOf(step) === "snapshot"
                ? `it was spent outside the plan, or the snapshot was taken before the block step ${JSON.stringify(previous.name)} is in. A snapshot is read as it is given: a snapshot taken after that block tells`
                : `it was spent outside the plan, or the read is behind the block step ${JSON.stringify(previous.name)} is in. The same call again later tells`
            }; a step that cannot stand on it is a new plan's`,
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
        const kept = keptAmong(
          parts.flatMap((part) =>
            part.kind === "spend"
              ? [
                  {
                    txHash: part.input.transaction_id,
                    outputIndex: part.input.index,
                  },
                ]
              : [],
          ),
          keepers,
        );
        if (kept !== undefined)
          throw invalidSteps(
            `step ${JSON.stringify(name)} spends ${kept.outRef}, which step ${JSON.stringify(kept.name)} ${kept.use}: an output a step given built reads or puts up is never spent by another step of the plan`,
          );
        // Tokens an earlier consolidation step parked are within reach of a later step that
        // needs them; never of the step it serves, nor of a step that needs none of them. A
        // sweep sends all the payer has: every parked output is within its reach
        const sweep = own.sendAllTo !== undefined;
        const needed = neededUnits(parts);
        const after = [
          ...before,
          ...all.map((each) =>
            each.consolidation === true &&
            !each.final &&
            each.serves !== name &&
            each.changeAddress === changeAddress &&
            (sweep || needed.size > 0)
              ? withParkedOpen(each.built, sweep ? undefined : needed)
              : asAfter(each.built, each.final),
          ),
          ...later.map((each) => asAfter(each.built, true)),
        ];
        // A sweep takes the outputs its payer's earlier consolidation steps parked without asking
        // canSelect, as a consolidation change is spent: they hold only what canSelect let
        // through. Nothing else bypasses it
        const parked = sweep
          ? new Set(
              all
                .filter(
                  (each) =>
                    each.consolidation === true &&
                    !each.final &&
                    each.serves !== name &&
                    each.changeAddress === changeAddress,
                )
                .flatMap((each) =>
                  each.built.outputs
                    .filter((output) => output.change !== true)
                    .map(refKey),
                ),
            )
          : new Set<string>();
        const choose =
          parked.size === 0 || canSelect === undefined
            ? selectable
            : (utxo: Utxo) =>
                !held.has(refKey(utxo)) &&
                (parked.has(refKey(utxo)) || canSelect(utxo));
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
              ...(choose !== undefined && { canSelect: choose }),
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
          ) {
            // Short of funds after consolidation steps made for it: their fees are part of why
            const steps = all.filter((each) => each.serves === name);
            if (
              steps.length > 0 &&
              TxBuildError.is(error, "INSUFFICIENT_FUNDS")
            )
              (error as { message: string }).message =
                `${error.message}; the plan would put ${steps.length} consolidation step(s) before it, whose fees take ${steps.reduce((sum, each) => sum + each.built.fee, 0n)} lovelace: nothing was recorded`;
            throw error;
          }
          served = error as TxBuildError<"TX_TOO_LARGE">;
          // The first consolidation step made for the step stands on the step before it of its
          // payer, by that step's change, whenever the step's parts leave that change: so it
          // never lands before that step, however the step itself stands on it
          const before =
            previous !== undefined && previous.serves !== name
              ? changeBefore(
                  parts,
                  previous,
                  changeAddress,
                  [...all, ...later],
                  canSelect,
                )
              : undefined;
          // Of a step in a block, a change the payer's read does not list may be spent: there
          // is none to stand on
          const standOn =
            change ??
            (before !== undefined &&
            (previous?.included !== true ||
              payer.snapshot.utxos.some(
                (utxo) => utxoKey(utxo) === utxoKey(before),
              ))
              ? before
              : undefined);
          // Nor does it take what a step of the plan not on chain reads or puts up
          const readers = [
            ...all.filter((each) => !each.final).map((each) => each.built),
            ...later.map((each) => each.built),
          ];
          const consolidation = await consolidate(error, {
            builder,
            payer,
            parts,
            change: standOn,
            after,
            readers,
            canSelect,
            options,
            limit,
            count: all.filter((each) => each.consolidation === true).length,
            number: nextNumber(all),
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
            serves: name,
            standsOn: next.standsOn,
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
      all.push({
        name,
        built,
        changeAddress,
        final: false,
        standsOn: next.standsOn,
      });
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

/** The number of a new consolidation step: one above the highest among the plan's names */
const nextNumber = (steps: readonly { readonly name: string }[]): number =>
  steps.reduce((highest, { name }) => {
    const number = name.slice(RESERVED_PREFIX.length);
    return name.startsWith(RESERVED_PREFIX) && /^[0-9]+$/.test(number)
      ? Math.max(highest, Number(number))
      : highest;
  }, 0) + 1;

/** The served step's TX_TOO_LARGE, with why consolidation could not make it fit */
const tooLargeOf = (
  served: TxBuildError<"TX_TOO_LARGE">,
  why: string,
  cause: unknown,
) =>
  new TxBuildError("TX_TOO_LARGE", `${served.message}; ${why}`, {
    details: { ...served.details },
    cause,
  });

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
    /** The change the consolidation step stands on */
    readonly change: Utxo | undefined;
    readonly after: readonly BuiltTxData[];
    /** The steps of the plan not on chain, whose reads and collateral it leaves alone */
    readonly readers: readonly BuiltTxData[];
    readonly canSelect: ((utxo: Utxo) => boolean) | undefined;
    readonly options: LoopOptions;
    /** The most consolidation steps the plan allows */
    readonly limit: number;
    /** The consolidation steps the plan has */
    readonly count: number;
    /** The number of the step's name */
    readonly number: number;
    /** The steps the plan may still take beside those given */
    readonly room: number;
  },
): Promise<{ readonly name: string; readonly built: BuiltTxData }> => {
  const served = error as TxBuildError<"TX_TOO_LARGE">;
  const { limit, count, room, options } = context;
  const tooLarge = (why: string, cause: unknown) =>
    tooLargeOf(served, why, cause);
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
  const name = `${RESERVED_PREFIX}${context.number}`;
  try {
    const built = await buildConsolidation({
      builder: context.builder,
      payer: context.payer,
      error,
      parts: context.parts,
      ...(context.change !== undefined && { standOn: context.change }),
      after: context.after,
      readers: context.readers,
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
  ...(step.witnesses !== undefined && { witnesses: step.witnesses }),
  ...(step.tags !== undefined && { tags: step.tags }),
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
