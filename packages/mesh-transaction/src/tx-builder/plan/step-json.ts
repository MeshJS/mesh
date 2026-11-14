import type { NetworkConfig } from "@meshsdk/common";

import type { BuiltTxData } from "../builder";
import type { KeyWitness } from "../sign";
import type {
  StepGiven,
  StepPlanRecord,
  StepPlanStatus,
  StepRecord,
  TxStepStatus,
} from "./step-core";
import { NOT_UNPAID, TxPlanError } from "../errors";
import {
  readTransaction,
  readWitnessArgument,
  verifies,
  writeWitnessSet,
} from "../sign";
import {
  count,
  decodeBuilt,
  decodeDeadlines,
  decodeNetwork,
  decodeParts,
  encodeBuilt,
  encodeParts,
  encodeValue,
  finite,
  flag,
  integer,
  isPlainObject,
  known,
  list,
  Obj,
  object,
  PLAN_RECORD_VERSION,
  show,
  text,
  texts,
  UnreadContent,
  utxos,
} from "./json";
import {
  isDeadStep,
  isUnlandedStep,
  missingKeys,
  standsOnOf,
  stepPlanStatus,
} from "./step-core";

// The record of a plan of steps as data: what a store holds and `toJSON()` returns. A step's
// transaction is written as the JSON of a `BuiltTx`, its witnesses as one witness set; the
// reader takes the bytes again, compares the hash and verifies every witness against the body.
// The reader is strict: content it does not know, or a record the state machine could not have
// written, is refused whole. Nothing here is exported from the package.

/** One step as the record holds it */
export type TxStepJSON = {
  readonly name: string;
  readonly kind?: "consolidation";
  readonly status: TxStepStatus;
  readonly txHash: string;
  readonly seen?: { readonly slot: number; readonly block?: string };
  /** The names of the steps it stands on; absent when none */
  readonly standsOn?: readonly string[];
  readonly sends: number;
  readonly refused: number;
  /** The transaction with the witnesses it holds, as the JSON of a `BuiltTx` */
  readonly tx: {
    readonly kind: "BuiltTx";
    readonly version: number;
    readonly txHash: string;
    readonly built: Record<string, unknown>;
    readonly witnesses?: string;
    readonly extraKeyWitnesses?: number;
    readonly delivered?: true;
  };
  /** The step as it was given: its parts, links kept, and its data options */
  readonly given?: {
    readonly parts: readonly unknown[];
    readonly options?: Record<string, unknown>;
  };
};

/** A plan of steps as plain JSON data */
export type StepPlanJSON = {
  readonly kind: "TxPlan";
  readonly version: number;
  readonly id?: string;
  readonly rev: number;
  readonly status: StepPlanStatus;
  readonly stopped?: true;
  readonly replaces?: string;
  readonly replacedBy?: string;
  readonly network: string | NetworkConfig;
  readonly deadlines: {
    readonly ttlMs: number;
    readonly expiryMarginMs: number;
    readonly confirmations: number;
  };
  readonly steps: readonly TxStepJSON[];
  readonly options: Record<string, unknown>;
};

/** The version of the JSON of a `BuiltTx` a step's transaction is written in */
const BUILT_TX_VERSION = 1;

/** Statuses after which a delivery of the step was taken, or its bytes are out */
const OUT: ReadonlySet<TxStepStatus> = new Set([
  "sent",
  "included",
  "final",
  "failed",
]);

/** Whether a delivery of the step was taken or may have been: the mark of a `BuiltTx` */
const deliveredOf = (step: Pick<StepRecord, "status" | "sends" | "refused">) =>
  OUT.has(step.status) || step.sends > step.refused;

/* ---------------------------------------------------------------------------------------------
 * Writing
 * ------------------------------------------------------------------------------------------- */

const encodeGiven = (given: StepGiven) => ({
  parts: encodeParts(given.parts),
  ...(given.options !== undefined && {
    options: encodeValue(given.options) as Record<string, unknown>,
  }),
});

const encodeStep = (step: StepRecord): TxStepJSON => ({
  name: step.name,
  ...(step.kind !== undefined && { kind: step.kind }),
  status: step.status,
  txHash: step.txHash,
  ...(step.seen !== undefined && {
    seen: {
      slot: step.seen.slot,
      ...(step.seen.block !== undefined && { block: step.seen.block }),
    },
  }),
  ...(step.standsOn.length > 0 && { standsOn: [...step.standsOn] }),
  sends: step.sends,
  refused: step.refused,
  tx: {
    kind: "BuiltTx",
    version: BUILT_TX_VERSION,
    txHash: step.txHash,
    built: encodeBuilt(step.built) as Record<string, unknown>,
    ...(step.witnesses.length > 0 && {
      witnesses: writeWitnessSet(step.witnesses, false),
    }),
    ...(step.extraKeyWitnesses !== undefined && {
      extraKeyWitnesses: step.extraKeyWitnesses,
    }),
    ...(deliveredOf(step) && { delivered: true as const }),
  },
  ...(step.given !== undefined && { given: encodeGiven(step.given) }),
});

/**
 * The record a store holds, from the record the state machine works on: plain JSON data in the
 * version this library writes
 * @throws TxBuildError NOT_SERIALIZABLE for a part that holds a redeemer function
 */
export const encodeStepPlan = (record: StepPlanRecord): StepPlanJSON => ({
  kind: "TxPlan",
  version: PLAN_RECORD_VERSION,
  ...(record.id !== undefined && { id: record.id }),
  rev: record.rev,
  status: record.status,
  ...(record.stopped === true && { stopped: true as const }),
  ...(record.replaces !== undefined && { replaces: record.replaces }),
  ...(record.replacedBy !== undefined && { replacedBy: record.replacedBy }),
  network: encodeValue(record.network) as StepPlanJSON["network"],
  deadlines: {
    ttlMs: record.deadlines.ttlMs,
    expiryMarginMs: record.deadlines.expiryMarginMs,
    confirmations: record.deadlines.confirmations,
  },
  steps: record.steps.map(encodeStep),
  options: encodeValue(record.options) as Record<string, unknown>,
});

/* ---------------------------------------------------------------------------------------------
 * Reading
 * ------------------------------------------------------------------------------------------- */

const unread = (message: string): never => {
  throw new UnreadContent(message);
};

const STEP_STATUSES: ReadonlySet<string> = new Set<TxStepStatus>([
  "built",
  "signed",
  "sent",
  "rejected",
  "included",
  "final",
  "expired",
  "failed",
  "orphaned",
]);

const PLAN_STATUSES: ReadonlySet<string> = new Set<StepPlanStatus>([
  "pending",
  "stopping",
  "stopped",
  "final",
]);

/** The data options of a step as it was given; the plan's are these and the change address */
const STEP_OPTIONS: Readonly<
  Record<string, (value: unknown, path: string) => unknown>
> = {
  sendAllTo: text,
  fee: integer,
  knownUtxos: utxos,
  registeredPools: texts,
  extraKeyWitnesses: count,
  topUpCollateral: flag,
  collateralReturn: flag,
  changeAddress: text,
};

const PLAN_OPTIONS: Readonly<
  Record<string, (value: unknown, path: string) => unknown>
> = {
  knownUtxos: utxos,
  registeredPools: texts,
  extraKeyWitnesses: count,
  topUpCollateral: flag,
  collateralReturn: flag,
  changeAddress: text,
};

const decodeOptions = (
  value: unknown,
  readers: Readonly<Record<string, (value: unknown, path: string) => unknown>>,
  path: string,
): Obj => {
  const json = object(value, path);
  known(json, Object.keys(readers), path);
  const options: Obj = {};
  for (const [key, read] of Object.entries(readers))
    if (json[key] !== undefined)
      options[key] = read(json[key], `${path}.${key}`);
  return options;
};

const nonEmpty = (value: unknown, path: string) => {
  const read = text(value, path);
  if (read === "") unread(`${path} is an empty text`);
  return read;
};

const TX_MEMBERS = [
  "kind",
  "version",
  "txHash",
  "built",
  "witnesses",
  "extraKeyWitnesses",
  "delivered",
] as const;

/**
 * A step's transaction: its JSON read, its bytes read again and found unsigned, its hash
 * compared, and every witness verified against its body
 */
const decodeTx = (
  value: unknown,
  txHash: string,
  path: string,
): {
  built: BuiltTxData;
  witnesses: KeyWitness[];
  extraKeyWitnesses?: number;
  delivered: boolean;
} => {
  const json = object(value, path);
  known(json, TX_MEMBERS, path);
  if (json.kind !== "BuiltTx")
    unread(`${path}.kind is ${show(json.kind)}, not "BuiltTx"`);
  if (json.version !== BUILT_TX_VERSION)
    unread(`${path}.version is ${show(json.version)}, not ${BUILT_TX_VERSION}`);
  if (text(json.txHash, `${path}.txHash`) !== txHash)
    unread(`${path}.txHash is not the step's txHash`);
  const built = decodeBuilt(json.built, `${path}.built`);
  if (built.txHash !== txHash)
    unread(`${path}.built.txHash is not the step's txHash`);
  let body: string;
  let signed: boolean;
  try {
    const raw = readTransaction(built.tx);
    body = raw.txId;
    signed =
      (raw.witnessSet.vkeys?.witnesses.length ?? 0) > 0 ||
      (raw.witnessSet.bootstraps?.witnesses.length ?? 0) > 0;
  } catch {
    return unread(
      `${path}.built.tx is not a transaction in CBOR hex this library reads`,
    );
  }
  if (body !== txHash)
    unread(`${path}.built.tx is not the transaction of the step's txHash`);
  if (signed)
    unread(
      `${path}.built.tx holds a vkey or bootstrap witness: the transaction is the unsigned one, and its witnesses go in witnesses`,
    );
  let witnesses: KeyWitness[] = [];
  if (json.witnesses !== undefined) {
    const at = `${path}.witnesses`;
    let read: ReturnType<typeof readWitnessArgument>;
    try {
      read = readWitnessArgument(text(json.witnesses, at));
    } catch (error) {
      if (error instanceof UnreadContent) throw error;
      return unread(`${at} is not a witness set this library reads`);
    }
    if (read.isTransaction) unread(`${at} is a transaction, not a witness set`);
    witnesses = read.witnesses;
    if (witnesses.length === 0) unread(`${at} holds no witness`);
    witnesses.forEach((witness, i) => {
      if (!verifies(witness, txHash))
        unread(`${at}: witness ${i} does not verify against the step's body`);
      if (
        witnesses.findIndex(
          (w) => w.kind === witness.kind && w.keyHash === witness.keyHash,
        ) !== i
      )
        unread(
          `${at} holds two ${witness.kind} witnesses of key ${witness.keyHash}`,
        );
    });
  }
  const extra = json.extraKeyWitnesses;
  if (extra !== undefined && count(extra, `${path}.extraKeyWitnesses`) === 0)
    unread(`${path}.extraKeyWitnesses is 0: it is written only when above 0`);
  if (json.delivered !== undefined && json.delivered !== true)
    unread(`${path}.delivered is ${show(json.delivered)}, not true`);
  return {
    built,
    witnesses,
    ...(extra !== undefined && { extraKeyWitnesses: extra as number }),
    delivered: json.delivered === true,
  };
};

const decodeGiven = (value: unknown, path: string): StepGiven => {
  const json = object(value, path);
  known(json, ["parts", "options"], path);
  return {
    parts: decodeParts(list(json.parts, `${path}.parts`), { links: true }),
    ...(json.options !== undefined && {
      options: decodeOptions(json.options, STEP_OPTIONS, `${path}.options`),
    }),
  };
};

const STEP_MEMBERS = [
  "name",
  "kind",
  "status",
  "txHash",
  "seen",
  "standsOn",
  "sends",
  "refused",
  "tx",
  "given",
] as const;

/** A step back from its JSON, checked against the steps before it */
const decodeStep = (
  value: unknown,
  earlier: readonly StepRecord[],
  path: string,
): StepRecord => {
  const json = object(value, path);
  known(json, STEP_MEMBERS, path);
  const name = nonEmpty(json.name, `${path}.name`);
  if (earlier.some((step) => step.name === name))
    unread(`${path}.name: the plan has a step ${show(name)} before it`);
  if (json.kind !== undefined && json.kind !== "consolidation")
    unread(`${path}.kind: the step kind ${show(json.kind)}`);
  const status = json.status;
  if (typeof status !== "string" || !STEP_STATUSES.has(status))
    unread(`${path}.status: the step status ${show(status)}`);
  const txHash = text(json.txHash, `${path}.txHash`);
  if (earlier.some((step) => step.txHash === txHash))
    unread(`${path}.txHash: the plan has the transaction ${txHash} before it`);
  let seen: StepRecord["seen"];
  if (json.seen !== undefined) {
    const at = `${path}.seen`;
    const read = object(json.seen, at);
    known(read, ["slot", "block"], at);
    seen = {
      slot: finite(read.slot, `${at}.slot`),
      ...(read.block !== undefined && {
        block: text(read.block, `${at}.block`),
      }),
    };
  }
  const standsOn =
    json.standsOn === undefined ? [] : texts(json.standsOn, `${path}.standsOn`);
  if (json.standsOn !== undefined && standsOn.length === 0)
    unread(
      `${path}.standsOn is empty: it is written only when the step stands on a step`,
    );
  const sends = count(json.sends, `${path}.sends`);
  const refused = count(json.refused, `${path}.refused`);
  const tx = decodeTx(json.tx, txHash, `${path}.tx`);
  const step: StepRecord = {
    name,
    ...(json.kind !== undefined && { kind: "consolidation" as const }),
    status: status as TxStepStatus,
    txHash,
    ...(seen !== undefined && { seen }),
    standsOn,
    built: tx.built,
    witnesses: tx.witnesses,
    ...(tx.extraKeyWitnesses !== undefined && {
      extraKeyWitnesses: tx.extraKeyWitnesses,
    }),
    ...(json.given !== undefined && {
      given: decodeGiven(json.given, `${path}.given`),
    }),
    sends,
    refused,
  };

  // What the state machine relies on
  if (step.kind === "consolidation" && step.given !== undefined)
    unread(`${path}.given is on a consolidation step`);
  const sources = standsOnOf(step.built, earlier);
  if (
    new Set(standsOn).size !== standsOn.length ||
    sources.length !== standsOn.length ||
    sources.some((each) => !standsOn.includes(each))
  )
    unread(
      `${path}.standsOn names [${standsOn.join(", ")}], and the transaction spends, reads or puts up outputs of the earlier steps [${sources.join(", ")}]`,
    );
  const landedOrFailed =
    step.status === "included" ||
    step.status === "final" ||
    step.status === "failed";
  if (landedOrFailed !== (seen !== undefined))
    unread(
      `${path}.seen is ${seen === undefined ? "missing on" : "on"} a step that is ${step.status}`,
    );
  if (refused > sends)
    unread(`${path}.refused is ${refused}, more than its ${sends} sends`);
  if (step.status === "rejected" && (sends === 0 || refused !== sends))
    unread(
      `${path}.status is rejected, and not every one of its ${sends} recorded deliveries was refused`,
    );
  if ((step.status === "built" || step.status === "signed") && sends > 0)
    unread(`${path}.status is ${step.status}, and it has recorded deliveries`);
  const missing = missingKeys(step).length;
  if (step.status === "built" && missing === 0)
    unread(`${path}.status is built, and every key has signed it`);
  if (step.status === "signed" && missing > 0)
    unread(
      `${path}.status is signed, and ${missing} key(s) have not signed it`,
    );
  const deadBelow = standsOn.some((each) =>
    earlier.some((step) => step.name === each && isDeadStep(step)),
  );
  // The step it stood on that would not land may have been found in a block since
  if (step.status === "orphaned" && standsOn.length === 0)
    unread(`${path}.status is orphaned, and it stands on no step`);
  if (isUnlandedStep(step) && deadBelow)
    unread(
      `${path}.status is ${step.status}, and it stands on a step that will not land`,
    );
  if (tx.delivered !== deliveredOf(step))
    unread(
      `${path}.tx.delivered does not match the step's status and deliveries`,
    );
  return step;
};

const RECORD_MEMBERS = [
  "kind",
  "version",
  "id",
  "rev",
  "status",
  "stopped",
  "replaces",
  "replacedBy",
  "network",
  "deadlines",
  "steps",
  "options",
] as const;

const decodeStepPlan = (json: Obj, id?: string): StepPlanRecord => {
  known(json, RECORD_MEMBERS, "");
  const own = json.id === undefined ? undefined : nonEmpty(json.id, "id");
  if (id !== undefined && own !== id)
    unread(`id is ${show(json.id)}, where ${show(id)} was asked for`);
  const status = json.status;
  if (typeof status !== "string" || !PLAN_STATUSES.has(status))
    unread(`status: the plan status ${show(status)}`);
  const rev = count(json.rev, "rev");
  if (rev === 0) unread("rev is 0: a written record has revision 1 or more");
  if (json.stopped !== undefined && json.stopped !== true)
    unread(`stopped is ${show(json.stopped)}, not true`);
  const replaces =
    json.replaces === undefined
      ? undefined
      : nonEmpty(json.replaces, "replaces");
  const replacedBy =
    json.replacedBy === undefined
      ? undefined
      : nonEmpty(json.replacedBy, "replacedBy");
  if (replacedBy !== undefined && json.stopped !== true)
    unread("stopped is missing on a plan that was replaced");
  const steps: StepRecord[] = [];
  list(json.steps, "steps").forEach((item, i) => {
    steps.push(decodeStep(item, steps, `steps[${i}]`));
  });
  if (steps.length === 0) unread("steps is empty: a plan has a step at least");
  const record: StepPlanRecord = {
    kind: "TxPlan",
    version: PLAN_RECORD_VERSION,
    ...(own !== undefined && { id: own }),
    rev,
    status: status as StepPlanStatus,
    ...(json.stopped === true && { stopped: true as const }),
    ...(replaces !== undefined && { replaces }),
    ...(replacedBy !== undefined && { replacedBy }),
    network: decodeNetwork(json.network, "network"),
    deadlines: decodeDeadlines(json.deadlines, "deadlines"),
    steps,
    options: decodeOptions(json.options, PLAN_OPTIONS, "options"),
  };
  if (stepPlanStatus(record) !== record.status)
    unread(
      `status: the plan status ${show(status)}, which its steps and mark do not give`,
    );
  return record;
};

const notRead = (what: string, id: string | undefined) =>
  new TxPlanError(
    "INVALID_STATE",
    `the plan's record was not read: ${what}. It is left as it is, and nothing was signed, written or sent: use a version of this library that reads it. ${NOT_UNPAID}`,
    {
      details: { reason: "recordVersion" },
      ...(id !== undefined && { planId: id }),
    },
  );

/**
 * Reads the record of a plan of steps from a store or from `toJSON()`: checks its kind and
 * version, reads every member strictly, reads each step's transaction again, and checks that the
 * state machine could have written it. `id`, when given, is the id the record must have.
 * @throws TxPlanError INVALID_STATE (`recordVersion`, not retryable) for another kind, another
 *   version, content this library does not know or cannot read, a transaction whose bytes are not
 *   of its hash, a witness that is not of its body, or statuses that do not fit together; the
 *   message names it
 */
export const readStepPlan = (json: unknown, id?: string): StepPlanRecord => {
  const planId =
    id ??
    (isPlainObject(json) && typeof json.id === "string" && json.id !== ""
      ? json.id
      : undefined);
  try {
    // A copy, so that the record read shares nothing with the value given, and a check that
    // the value is plain JSON data
    let copy: unknown;
    try {
      copy = JSON.parse(JSON.stringify(json));
    } catch (error) {
      unread(`the record is not JSON data (${(error as Error).message})`);
    }
    const record = object(copy, "the record");
    if (record.kind !== "TxPlan")
      unread(
        `the kind ${show(record.kind)}: this library reads "TxPlan" records`,
      );
    if (record.version !== PLAN_RECORD_VERSION)
      unread(
        `the version ${show(record.version)}: this library reads version ${PLAN_RECORD_VERSION}`,
      );
    return decodeStepPlan(record, id);
  } catch (error) {
    if (error instanceof UnreadContent) throw notRead(error.message, planId);
    throw error;
  }
};
