import type { Serialization } from "@meshsdk/core-cst";

import type { BuiltRedeemer, BuiltTxData } from "../builder";
import type { LinkedPart, TxPart, Utxo } from "../parts/types";
import type { KeyWitness, KeyWitnessTags, RawTx } from "../sign";
import type {
  BeforeEntry,
  PlanBefore,
  PlanRecord,
  StepGiven,
  StepRecord,
} from "./core";
import type {
  TxPlanJSON,
  TxPlanStatus,
  TxStepJSON,
  TxStepStatus,
} from "./types";
import { readTxValue } from "../builder";
import { NOT_UNPAID, TxBuildError, TxPlanError } from "../errors";
import { freeze } from "../parts/normalize";
import { plainUtxo, utxoKey } from "../parts/utxo";
import {
  keyWitnessTags,
  readTransaction,
  readWitnessArgument,
  verifies,
  writeWitnessSet,
} from "../sign";
import { ROLE_ORDER } from "../witnesses";
import {
  afterProblem,
  isDeadStep,
  isUnlandedStep,
  MAX_CONSOLIDATION_STEPS,
  MAX_PAYS,
  missingKeys,
  PLAN_RECORD_VERSION,
  planStatus,
  spentBefore,
  standsOnOf,
} from "./core";

// The record of a plan as data: what `toJSON()` returns and a store holds. The encoding keeps
// the shapes of the parts and of the transactions and writes every `bigint` as its decimal
// string, at its own field; the reader knows those fields and puts the `bigint`s back. A step's
// transaction is written as the JSON of a `BuiltTx`, without what its bytes and its recorded
// UTxOs give again, its witnesses as one witness set; the reader takes the bytes again, compares
// the hash, checks the recorded inputs against the body, works out what was left out and
// verifies every witness against the body. The reader is strict: content it does not know, or a
// record the state machine could not have written, is refused whole. The data of a build is
// encoded and read the same way, written whole, in the JSON of a `BuiltTx`. Nothing here is
// exported from the package.

export { PLAN_RECORD_VERSION };

/**
 * Content of a record or of encoded parts that this library does not read; the message names
 * it. The reader of a record turns it into TxPlanError INVALID_STATE (`recordVersion`).
 */
export class UnreadContent extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadContent";
  }
}

const unread = (message: string): never => {
  throw new UnreadContent(message);
};

/* ---------------------------------------------------------------------------------------------
 * Encoding
 * ------------------------------------------------------------------------------------------- */

/** An object that is not a list, `Map`, byte array or other built-in; also of another realm */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]";

/**
 * The value as plain JSON data: every `bigint` as its decimal string, members whose value is
 * `undefined` left out, `-0` as `0`. Anything else that JSON cannot hold is a bug of the caller.
 */
const plain = (value: unknown, path: string): unknown => {
  switch (typeof value) {
    case "bigint":
      return value.toString();
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value))
        throw new TypeError(`${path}: ${value} cannot be written as JSON`);
      return value === 0 ? 0 : value;
    case "object": {
      if (value === null) return null;
      if (Array.isArray(value))
        return value.map((item, i) => plain(item, `${path}[${i}]`));
      if (!isPlainObject(value))
        throw new TypeError(
          `${path}: a ${describeType(value)} cannot be written as JSON`,
        );
      const out: Record<string, unknown> = {};
      for (const [key, member] of Object.entries(value))
        if (member !== undefined) out[key] = plain(member, `${path}.${key}`);
      return out;
    }
    default:
      throw new TypeError(
        `${path}: a ${typeof value} cannot be written as JSON`,
      );
  }
};

const describeType = (value: object) =>
  value instanceof Map
    ? "Map"
    : value instanceof Uint8Array
      ? "Uint8Array"
      : (value.constructor?.name ?? "object");

/** The redeemer function a part holds, if it holds one */
const holdsFunction = (part: TxPart | LinkedPart) => {
  const witness = (part as { witness?: { redeemer?: { data?: unknown } } })
    .witness;
  const data = witness?.redeemer?.data as { type?: unknown } | undefined;
  return data?.type === "deferred";
};

/**
 * The parts as a record holds them: their own shapes, every `bigint` as its decimal string; a
 * part linked to an earlier step with its `link` as it is
 * @throws TxBuildError NOT_SERIALIZABLE, with the part's kind and label, at the first part that
 *   holds a redeemer function
 */
export const encodeParts = (
  parts: readonly (TxPart | LinkedPart)[],
): unknown[] =>
  parts.map((part, i) => {
    if (holdsFunction(part))
      throw new TxBuildError(
        "NOT_SERIALIZABLE",
        "the part's redeemer is a function of the final transaction, which cannot be written as data: give the redeemer data as a value to write this plan",
        {
          part: part.kind,
          ...(part.label !== undefined && { label: part.label }),
        },
      );
    return plain(part, `parts[${i}]`);
  });

/** The data of a build as a record holds it: plain JSON data, every `bigint` as its decimal string */
export const encodeBuilt = (built: BuiltTxData): unknown => {
  const { parts, ...rest } = built;
  return { ...(plain(rest, "built") as object), parts: encodeParts(parts) };
};

/** A value as a record holds it: plain JSON data, every `bigint` as its decimal string */
export const encodeValue = (value: unknown): unknown => plain(value, "value");

/**
 * Whether two values of JSON data are equal: lists member by member in their order, objects by
 * their members whatever their order
 */
export const sameJson = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((item, i) => sameJson(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) &&
      sameJson(left[key], right[key]),
  );
};

/* ---------------------------------------------------------------------------------------------
 * Reading: small checks
 * ------------------------------------------------------------------------------------------- */

/**
 * Whether a refusal quotes the values it names. The reader of a plan's record does; the JSON of a
 * transaction is read `unquoted`, and its refusals name paths and JavaScript types alone
 */
let quoting = true;

/**
 * Runs a reader whose refusals quote no value of what it reads: in place of a value they name its
 * JavaScript type, and in place of a member name that is not the library's, its place
 */
export const unquoted = <T>(read: () => T): T => {
  const before = quoting;
  quoting = false;
  try {
    return read();
  } finally {
    quoting = before;
  }
};

/** The place of the entry `key`, the `index`-th, of a map whose keys are data */
const entryPath = (path: string, key: string, index: number) =>
  quoting ? `${path}.${key}` : `${path}[${index}]`;

export const show = (value: unknown): string => {
  if (value === undefined) return "none";
  if (!quoting) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "a list";
    return typeof value === "object" ? "an object" : `a ${typeof value}`;
  }
  if (typeof value === "string")
    return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}…` : value);
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object" && value !== null) return "an object";
  return String(value);
};

export type Obj = Record<string, unknown>;

export const object = (value: unknown, path: string): Obj => {
  if (!isPlainObject(value)) unread(`${path} is ${show(value)}, not an object`);
  return value as Obj;
};

export const list = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) unread(`${path} is ${show(value)}, not a list`);
  return value as unknown[];
};

export const text = (value: unknown, path: string): string => {
  if (typeof value !== "string")
    unread(`${path} is ${show(value)}, not a text`);
  return value as string;
};

export const finite = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    unread(`${path} is ${show(value)}, not a number`);
  return value as number;
};

export const count = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    unread(`${path} is ${show(value)}, not a whole number of 0 or more`);
  return value as number;
};

export const flag = (value: unknown, path: string): boolean => {
  if (typeof value !== "boolean")
    unread(`${path} is ${show(value)}, not true or false`);
  return value as boolean;
};

export const texts = (value: unknown, path: string): string[] =>
  list(value, path).map((item, i) => text(item, `${path}[${i}]`));

const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;

/** A `bigint` written as its decimal string */
export const integer = (value: unknown, path: string): bigint => {
  if (typeof value !== "string" || !DECIMAL.test(value))
    unread(`${path} is ${show(value)}, not a decimal integer`);
  return BigInt(value as string);
};

/** Refuses a member that is not among those named */
export const known = (json: Obj, members: readonly string[], path: string) => {
  for (const key of Object.keys(json))
    if (!members.includes(key))
      unread(
        quoting
          ? `${path === "" ? "" : `${path}.`}${key}, a member this library does not know`
          : `${path === "" ? "" : `${path}: `}a member this library does not know`,
      );
};

export const optional = <T>(
  json: Obj,
  key: string,
  read: (value: unknown, path: string) => T,
  path: string,
): { [k: string]: T } =>
  json[key] === undefined ? {} : { [key]: read(json[key], `${path}.${key}`) };

const tagOf = (json: Obj, path: string) => text(json.type, `${path}.type`);

/* ---------------------------------------------------------------------------------------------
 * Reading: values shaped after the ledger's transaction. Read as they are; only the places that
 * hold a `bigint` are walked
 * ------------------------------------------------------------------------------------------- */

const plutusData = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "INTEGER":
      return { ...json, value: integer(json.value, `${path}.value`) };
    case "BYTES":
      text(json.value, `${path}.value`);
      return json;
    case "LIST":
      return {
        ...json,
        value: list(json.value, `${path}.value`).map((item, i) =>
          plutusData(item, `${path}.value[${i}]`),
        ),
      };
    case "MAP":
      return {
        ...json,
        value: list(json.value, `${path}.value`).map((pair, i) => {
          const at = `${path}.value[${i}]`;
          const [k, v, ...more] = list(pair, at);
          if (more.length > 0) unread(`${at} is not a pair`);
          return [plutusData(k, `${at}[0]`), plutusData(v, `${at}[1]`)];
        }),
      };
    case "CONSTR":
      return {
        ...json,
        alternative: integer(json.alternative, `${path}.alternative`),
        fields: list(json.fields, `${path}.fields`).map((item, i) =>
          plutusData(item, `${path}.fields[${i}]`),
        ),
      };
    default:
      return unread(`${path}: Plutus data of the type ${show(json.type)}`);
  }
};

/** Plutus data as a part holds it: CBOR hex as it is, or the tagged form */
const dataVariant = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "CBOR":
      text(json.hex, `${path}.hex`);
      return json;
    case "MANUAL":
      return { ...json, data: plutusData(json.data, `${path}.data`) };
    default:
      return unread(`${path}: data of the form ${show(json.type)}`);
  }
};

const metadatum = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "INT":
      return { ...json, value: integer(json.value, `${path}.value`) };
    case "BYTES":
      list(json.value, `${path}.value`).forEach((byte, i) =>
        count(byte, `${path}.value[${i}]`),
      );
      return json;
    case "STRING":
      text(json.value, `${path}.value`);
      return json;
    case "LIST":
      return {
        ...json,
        value: list(json.value, `${path}.value`).map((item, i) =>
          metadatum(item, `${path}.value[${i}]`),
        ),
      };
    case "MAP":
      return {
        ...json,
        value: list(json.value, `${path}.value`).map((pair, i) => {
          const at = `${path}.value[${i}]`;
          const [k, v, ...more] = list(pair, at);
          if (more.length > 0) unread(`${at} is not a pair`);
          return [metadatum(k, `${at}[0]`), metadatum(v, `${at}[1]`)];
        }),
      };
    default:
      return unread(`${path}: metadata of the type ${show(json.type)}`);
  }
};

const nativeScript = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  const type = tagOf(json, path);
  const body = object(json.value, `${path}.value`);
  const scripts = () =>
    list(body.native_scripts, `${path}.value.native_scripts`).map((item, i) =>
      nativeScript(item, `${path}.value.native_scripts[${i}]`),
    );
  switch (type) {
    case "SCRIPT_PUBKEY":
    case "TIMELOCK_START":
    case "TIMELOCK_EXPIRY":
      return json;
    case "SCRIPT_ALL":
    case "SCRIPT_ANY":
      return { ...json, value: { ...body, native_scripts: scripts() } };
    case "SCRIPT_N_OF_K":
      return {
        ...json,
        value: {
          ...body,
          n: integer(body.n, `${path}.value.n`),
          native_scripts: scripts(),
        },
      };
    default:
      return unread(`${path}: a native script of the type ${show(type)}`);
  }
};

const CERTIFICATES = new Set([
  "STAKE_REGISTRATION",
  "STAKE_DEREGISTRATION",
  "STAKE_DELEGATION",
  "POOL_REGISTRATION",
  "COMMITTEE_HOT_AUTH",
  "COMMITTEE_COLD_RESIGN",
  "DREP_DEREGISTRATION",
  "DREP_REGISTRATION",
  "DREP_UPDATE",
  "STAKE_AND_VOTE_DELEGATION",
  "STAKE_REGISTRATION_AND_DELEGATION",
  "STAKE_VOTE_REGISTRATION_AND_DELEGATION",
  "VOTE_DELEGATION",
  "VOTE_REGISTRATION_AND_DELEGATION",
]);

const certificateValue = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  const type = tagOf(json, path);
  if (type === "POOL_RETIREMENT") {
    const body = object(json.value, `${path}.value`);
    return {
      ...json,
      value: { ...body, epoch: integer(body.epoch, `${path}.value.epoch`) },
    };
  }
  if (!CERTIFICATES.has(type))
    unread(`${path}: a certificate of the type ${show(type)}`);
  return json;
};

const GOVERNANCE_ACTIONS = new Set([
  "PARAMETER_CHANGE_ACTION",
  "HARD_FORK_INITIATION_ACTION",
  "TREASURY_WITHDRAWALS_ACTION",
  "NO_CONFIDENCE_ACTION",
  "NEW_CONSTITUTION_ACTION",
  "INFO_ACTION",
]);

const governanceAction = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  const type = tagOf(json, path);
  if (type === "UPDATE_COMMITTEE_ACTION") {
    const body = object(json.value, `${path}.value`);
    const committee = object(body.committee, `${path}.value.committee`);
    const members = list(
      committee.members,
      `${path}.value.committee.members`,
    ).map((item, i) => {
      const at = `${path}.value.committee.members[${i}]`;
      const member = object(item, at);
      return {
        ...member,
        term_limit: integer(member.term_limit, `${at}.term_limit`),
      };
    });
    return {
      ...json,
      value: { ...body, committee: { ...committee, members } },
    };
  }
  if (!GOVERNANCE_ACTIONS.has(type))
    unread(`${path}: a governance action of the type ${show(type)}`);
  return json;
};

const proposalValue = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  return {
    ...json,
    governance_action: governanceAction(
      json.governance_action,
      `${path}.governance_action`,
    ),
  };
};

const dataOption = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "DATA_HASH":
      text(json.value, `${path}.value`);
      return json;
    case "DATA":
      return { ...json, value: dataVariant(json.value, `${path}.value`) };
    default:
      return unread(`${path}: a datum of the type ${show(json.type)}`);
  }
};

/** An output in the form of the transaction, or of an output part */
const outputValue = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  text(json.address, `${path}.address`);
  object(json.amount, `${path}.amount`);
  return json.plutus_data === undefined || json.plutus_data === null
    ? json
    : {
        ...json,
        plutus_data: dataOption(json.plutus_data, `${path}.plutus_data`),
      };
};

/** A list that the ledger's types allow to be `null` */
const nullableList = (
  value: unknown,
  path: string,
  read: (item: unknown, path: string) => unknown,
) =>
  value === undefined || value === null
    ? value
    : list(value, path).map((item, i) => read(item, `${path}[${i}]`));

const transaction = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  const body = object(json.body, `${path}.body`);
  const witnesses = object(json.witness_set, `${path}.witness_set`);
  const result: Obj = {
    ...json,
    body: {
      ...body,
      outputs: list(body.outputs, `${path}.body.outputs`).map((item, i) =>
        outputValue(item, `${path}.body.outputs[${i}]`),
      ),
      ...(body.certs !== undefined && {
        certs: nullableList(body.certs, `${path}.body.certs`, certificateValue),
      }),
      ...(body.collateral_return !== undefined && {
        collateral_return:
          body.collateral_return === null
            ? null
            : outputValue(
                body.collateral_return,
                `${path}.body.collateral_return`,
              ),
      }),
      ...(body.voting_proposals !== undefined && {
        voting_proposals: nullableList(
          body.voting_proposals,
          `${path}.body.voting_proposals`,
          proposalValue,
        ),
      }),
    },
    witness_set: {
      ...witnesses,
      ...(witnesses.native_scripts !== undefined && {
        native_scripts: nullableList(
          witnesses.native_scripts,
          `${path}.witness_set.native_scripts`,
          nativeScript,
        ),
      }),
      ...(witnesses.redeemers !== undefined && {
        redeemers: nullableList(
          witnesses.redeemers,
          `${path}.witness_set.redeemers`,
          (item, at) => {
            const redeemer = object(item, at);
            return {
              ...redeemer,
              data: dataVariant(redeemer.data, `${at}.data`),
            };
          },
        ),
      }),
    },
  };
  if (json.auxiliary_data !== undefined && json.auxiliary_data !== null) {
    const at = `${path}.auxiliary_data`;
    const aux = object(json.auxiliary_data, at);
    const metadata =
      aux.metadata === undefined || aux.metadata === null
        ? aux.metadata
        : Object.fromEntries(
            Object.entries(object(aux.metadata, `${at}.metadata`)).map(
              ([label, item], i) => [
                label,
                metadatum(item, entryPath(`${at}.metadata`, label, i)),
              ],
            ),
          );
    result.auxiliary_data = {
      ...aux,
      ...(aux.metadata !== undefined && { metadata }),
      ...(aux.native_scripts !== undefined && {
        native_scripts: nullableList(
          aux.native_scripts,
          `${at}.native_scripts`,
          nativeScript,
        ),
      }),
    };
  }
  return result;
};

const LANGUAGES = new Set(["V1", "V2", "V3"]);

/** The datum of a UTxO, by its type */
const datumValue = (value: unknown, path: string) => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "inline": {
      known(json, ["type", "data"], path);
      const data = object(json.data, `${path}.data`);
      known(data, ["type", "content"], `${path}.data`);
      if (data.type !== "CBOR")
        unread(`${path}.data: inline data of the type ${show(data.type)}`);
      return {
        type: "inline",
        data: {
          type: "CBOR",
          content: text(data.content, `${path}.data.content`),
        },
      };
    }
    case "hash":
      known(json, ["type", "hash"], path);
      return { type: "hash", hash: text(json.hash, `${path}.hash`) };
    default:
      return unread(`${path}: a datum of the type ${show(json.type)}`);
  }
};

/** The reference script of a UTxO, by its type */
const scriptValue = (value: unknown, path: string) => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "plutus": {
      known(json, ["type", "version", "code", "hash"], path);
      const version = text(json.version, `${path}.version`);
      if (!LANGUAGES.has(version))
        unread(`${path}.version: the Plutus version ${show(version)}`);
      return {
        type: "plutus",
        version,
        code: text(json.code, `${path}.code`),
        hash: text(json.hash, `${path}.hash`),
      };
    }
    case "native":
      known(json, ["type", "cbor", "hash"], path);
      return {
        type: "native",
        cbor: text(json.cbor, `${path}.cbor`),
        hash: text(json.hash, `${path}.hash`),
      };
    case "unknown":
      known(json, ["type", "scriptRef", "hash"], path);
      return {
        type: "unknown",
        scriptRef: text(json.scriptRef, `${path}.scriptRef`),
        ...optional(json, "hash", text, path),
      };
    default:
      return unread(`${path}: a script of the type ${show(json.type)}`);
  }
};

const UTXO_MEMBERS = [
  "txHash",
  "outputIndex",
  "address",
  "value",
  "datum",
  "script",
] as const;

/** The members of a built output: a UTxO's, and the marks of its part */
const BUILT_OUTPUT_MEMBERS = [...UTXO_MEMBERS, "label", "change"] as const;

/**
 * A UTxO in the builder's form, its quantities back as `bigint`s; with `marks`, a built output,
 * which may also carry its part's `label` and its `change` mark
 */
const utxoValue = (value: unknown, path: string, marks = false): Obj => {
  const json = object(value, path);
  known(json, marks ? BUILT_OUTPUT_MEMBERS : UTXO_MEMBERS, path);
  const assets = object(json.value, `${path}.value`);
  if (assets.lovelace === undefined) unread(`${path}.value holds no lovelace`);
  const utxo: Obj = {
    txHash: text(json.txHash, `${path}.txHash`),
    outputIndex: count(json.outputIndex, `${path}.outputIndex`),
    address: text(json.address, `${path}.address`),
    value: Object.fromEntries(
      Object.entries(assets).map(([unit, quantity], i) => [
        unit,
        integer(quantity, entryPath(`${path}.value`, unit, i)),
      ]),
    ),
    ...optional(json, "datum", datumValue, path),
    ...optional(json, "script", scriptValue, path),
  };
  if (marks) {
    Object.assign(utxo, optional(json, "label", text, path));
    if (json.change !== undefined) {
      if (json.change !== true)
        unread(`${path}.change is ${show(json.change)}, not true`);
      utxo.change = true;
    }
  }
  return utxo;
};

/** A built output: a UTxO with the marks of its part */
const builtOutputValue = (value: unknown, path: string) =>
  utxoValue(value, path, true);

const inputValue = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  text(json.transaction_id, `${path}.transaction_id`);
  count(json.index, `${path}.index`);
  return json;
};

/* ---------------------------------------------------------------------------------------------
 * Reading: parts
 * ------------------------------------------------------------------------------------------- */

const nativeSource = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "attached":
      return { ...json, script: nativeScript(json.script, `${path}.script`) };
    case "reference":
      inputValue(json.input, `${path}.input`);
      return json.utxo === undefined
        ? json
        : { ...json, utxo: utxoValue(json.utxo, `${path}.utxo`) };
    default:
      return unread(`${path}: a script source of the type ${show(json.type)}`);
  }
};

const plutusSource = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "attached":
      text(json.cbor, `${path}.cbor`);
      return json;
    case "reference":
      inputValue(json.input, `${path}.input`);
      return json.utxo === undefined
        ? json
        : { ...json, utxo: utxoValue(json.utxo, `${path}.utxo`) };
    default:
      return unread(`${path}: a script source of the type ${show(json.type)}`);
  }
};

const spendDatum = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "inline":
    case "none":
      return json;
    case "provided":
      return { ...json, data: dataVariant(json.data, `${path}.data`) };
    default:
      return unread(`${path}: a datum of the type ${show(json.type)}`);
  }
};

const witnessValue = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  switch (tagOf(json, path)) {
    case "none":
    case "key":
      return json;
    case "native":
      return { ...json, script: nativeSource(json.script, `${path}.script`) };
    case "plutus": {
      const redeemer = object(json.redeemer, `${path}.redeemer`);
      return {
        ...json,
        script: plutusSource(json.script, `${path}.script`),
        redeemer: {
          ...redeemer,
          data: dataVariant(redeemer.data, `${path}.redeemer.data`),
        },
        ...optional(json, "datum", spendDatum, path),
      };
    }
    default:
      return unread(`${path}: a witness of the type ${show(json.type)}`);
  }
};

type PartReader = {
  /** The members a part of the kind has besides `kind` and `label` */
  readonly members: readonly string[];
  /** Readers of the members whose values are walked or checked */
  readonly read?: Readonly<
    Record<string, (value: unknown, path: string) => unknown>
  >;
};

const resolvable = {
  input: inputValue,
  utxo: utxoValue,
} as const;

const PARTS: Readonly<Record<TxPart["kind"], PartReader>> = {
  spend: {
    members: ["input", "utxo", "witness"],
    read: { ...resolvable, witness: witnessValue },
  },
  referenceInput: { members: ["input", "utxo"], read: resolvable },
  collateral: { members: ["input", "utxo"], read: resolvable },
  collateralReturn: {
    members: ["address", "totalCollateral"],
    read: { address: text, totalCollateral: text },
  },
  output: {
    members: ["output", "embeddedDatum"],
    read: { output: outputValue, embeddedDatum: dataVariant },
  },
  mint: {
    members: ["policyId", "assets", "witness"],
    read: { policyId: text, assets: object, witness: witnessValue },
  },
  withdrawal: {
    members: ["rewardAddress", "amount", "witness"],
    read: { rewardAddress: text, amount: text, witness: witnessValue },
  },
  guard: {
    members: ["credential", "witness"],
    read: { credential: object, witness: witnessValue },
  },
  validity: {
    members: ["invalidBefore", "invalidHereafter", "from", "until"],
    read: {
      invalidBefore: text,
      invalidHereafter: text,
      from: finite,
      until: finite,
    },
  },
  metadata: {
    members: ["metadataLabel", "value"],
    read: { metadataLabel: text, value: metadatum },
  },
  auxiliaryScript: {
    members: ["script"],
    read: {
      script: (value, path) => {
        const json = object(value, path);
        switch (tagOf(json, path)) {
          case "native":
            return {
              ...json,
              script: nativeScript(json.script, `${path}.script`),
            };
          case "plutus":
            text(json.cbor, `${path}.cbor`);
            return json;
          default:
            return unread(`${path}: a script of the type ${show(json.type)}`);
        }
      },
    },
  },
  donation: { members: ["amount"], read: { amount: text } },
  treasuryValue: { members: ["amount"], read: { amount: text } },
  networkId: { members: ["networkId"], read: { networkId: object } },
  certificate: {
    members: ["certificate", "depositParameter", "witness"],
    read: {
      certificate: certificateValue,
      depositParameter: text,
      witness: witnessValue,
    },
  },
  vote: {
    members: ["voter", "votes", "witness"],
    read: { voter: object, votes: list, witness: witnessValue },
  },
  proposal: {
    members: ["proposal", "depositParameter", "witness"],
    read: {
      proposal: proposalValue,
      depositParameter: text,
      witness: witnessValue,
    },
  },
};

/** The members every part kind must have */
const REQUIRED: Readonly<Record<TxPart["kind"], readonly string[]>> = {
  spend: ["input", "witness"],
  referenceInput: ["input"],
  collateral: ["input"],
  collateralReturn: ["address"],
  output: ["output"],
  mint: ["policyId", "assets", "witness"],
  withdrawal: ["witness"],
  guard: ["credential", "witness"],
  validity: [],
  metadata: ["metadataLabel", "value"],
  auxiliaryScript: ["script"],
  donation: ["amount"],
  treasuryValue: ["amount"],
  networkId: ["networkId"],
  certificate: ["certificate", "witness"],
  vote: ["voter", "votes", "witness"],
  proposal: ["proposal", "witness"],
};

/** The members of a part linked to an earlier step besides `kind`, `label` and `link`, by kind */
const LINKED: Readonly<Record<LinkedPart["kind"], readonly string[]>> = {
  spend: ["witness"],
  referenceInput: [],
  collateral: [],
};

/** A link to an earlier step: `{ step, output }` or `{ step, change: true }` */
const linkValue = (value: unknown, path: string) => {
  const json = object(value, path);
  known(json, ["step", "output", "change"], path);
  const step = text(json.step, `${path}.step`);
  if (step === "") unread(`${path}.step is empty`);
  if ((json.output === undefined) === (json.change === undefined))
    unread(`${path} holds neither or both of output and change`);
  if (json.change !== undefined) {
    if (json.change !== true)
      unread(`${path}.change is ${show(json.change)}, not true`);
    return { step, change: true };
  }
  const output =
    typeof json.output === "number"
      ? count(json.output, `${path}.output`)
      : text(json.output, `${path}.output`);
  if (typeof output === "number" && output > 0xffff)
    unread(`${path}.output is ${output}, past the last position of an output`);
  return { step, output };
};

/**
 * A part linked to an earlier step: `link` in place of `input` and `utxo`, all the change only
 * in a spend by key
 */
const decodeLinkedPart = (json: Obj, path: string): LinkedPart => {
  const kind = json.kind as string;
  if (!Object.prototype.hasOwnProperty.call(LINKED, kind))
    unread(`${path}: a part of kind ${kind} linked to an earlier step`);
  const members = LINKED[kind as LinkedPart["kind"]];
  known(json, ["kind", "label", "link", ...members], path);
  for (const member of members)
    if (json[member] === undefined) unread(`${path}.${member} is missing`);
  const part: Obj = { kind };
  if (json.label !== undefined) part.label = text(json.label, `${path}.label`);
  const link = linkValue(json.link, `${path}.link`);
  part.link = link;
  if (json.witness !== undefined)
    part.witness = witnessValue(json.witness, `${path}.witness`);
  if (
    "change" in link &&
    (kind !== "spend" || (part.witness as { type?: unknown }).type !== "key")
  )
    unread(
      `${path}.link: all the change of a step in a part other than a spend by key`,
    );
  return freeze(part) as unknown as LinkedPart;
};

const decodePart = (
  value: unknown,
  path: string,
  links = false,
): TxPart | LinkedPart => {
  const json = object(value, path);
  const kind = json.kind;
  if (
    typeof kind !== "string" ||
    !Object.prototype.hasOwnProperty.call(PARTS, kind)
  )
    unread(`${path}: the part kind ${show(kind)}`);
  if (links && json.link !== undefined) return decodeLinkedPart(json, path);
  const reader = PARTS[kind as TxPart["kind"]];
  known(json, ["kind", "label", ...reader.members], path);
  for (const member of REQUIRED[kind as TxPart["kind"]])
    if (json[member] === undefined) unread(`${path}.${member} is missing`);
  const part: Obj = { kind };
  if (json.label !== undefined) part.label = text(json.label, `${path}.label`);
  for (const member of reader.members) {
    if (json[member] === undefined) continue;
    const read = reader.read?.[member];
    part[member] = read
      ? read(json[member], `${path}.${member}`)
      : json[member];
  }
  return freeze(part) as unknown as TxPart;
};

/**
 * The parts back from their encoding, frozen as the part builders make them. A part linked to
 * an earlier step is read only with `links`: the parts of a build never hold one, and without
 * it `link` is a member this library does not read
 * @throws UnreadContent for a part kind this library does not know, naming it; for a member of
 *   a part it does not know; and for a value it cannot read where a `bigint` or a member it
 *   reads stands; with `links`, for a link that is not `{ step, output }` or
 *   `{ step, change: true }`, for a part that holds a link beside `input` or `utxo`, and for
 *   all the change in a part other than a spend by key
 */
export function decodeParts(json: readonly unknown[]): TxPart[];
export function decodeParts(
  json: readonly unknown[],
  options: { links: true },
): (TxPart | LinkedPart)[];
export function decodeParts(
  json: readonly unknown[],
  options?: { links?: boolean },
): (TxPart | LinkedPart)[] {
  return list(json, "parts").map((item, i) =>
    decodePart(item, `parts[${i}]`, options?.links === true),
  );
}

/* ---------------------------------------------------------------------------------------------
 * Reading: the record
 * ------------------------------------------------------------------------------------------- */

const BUILT_MEMBERS = [
  "tx",
  "txHash",
  "prototype",
  "fee",
  "exUnits",
  "redeemers",
  "inputs",
  "selectedInputs",
  "referenceInputs",
  "outputs",
  "change",
  "collateral",
  "signers",
  "validity",
  "network",
  "warnings",
  "parts",
] as const;

/** The members of the data of a build as a plan's record writes it */
const BUILT_WITHOUT_PROTOTYPE = BUILT_MEMBERS.filter(
  (member) => member !== "prototype",
);

/** The members of the objects inside the data of a build, as `BuiltTxData` declares them */
const SIGNERS_MEMBERS = [
  "keyHashes",
  "keys",
  "byronAddresses",
  "nativeScripts",
] as const;
const REDEEMER_MEMBERS = [
  "tag",
  "index",
  "exUnits",
  "data",
  "part",
  "label",
] as const;
const COLLATERAL_MEMBERS = ["inputs", "total", "return"] as const;
const VALIDITY_MEMBERS = [
  "invalidBefore",
  "invalidHereafter",
  "from",
  "until",
] as const;
const NETWORK_MEMBERS = ["name", "networkId"] as const;
const WARNING_MEMBERS = ["code", "message", "part", "label"] as const;

/** An object holding only the members named */
const member = (value: unknown, members: readonly string[], path: string) => {
  const json = object(value, path);
  known(json, members, path);
  return json;
};

const exUnits = (value: unknown, path: string) => {
  const json = object(value, path);
  known(json, ["mem", "steps"], path);
  return {
    mem: integer(json.mem, `${path}.mem`),
    steps: integer(json.steps, `${path}.steps`),
  };
};

export const utxos = (value: unknown, path: string) =>
  list(value, path).map((item, i) => utxoValue(item, `${path}[${i}]`));

const builtOutputs = (value: unknown, path: string) =>
  list(value, path).map((item, i) => builtOutputValue(item, `${path}[${i}]`));

/**
 * The keys a transaction needs, each `{ keyHash, roles }` with roles this library knows: the same
 * keys, in the same order, as `keyHashes`. A signer is asked for these keys, and the witnesses
 * kept are theirs
 */
const requiredKeys = (
  value: unknown,
  keyHashes: readonly string[],
  path: string,
) => {
  const keys = list(value, path).map((item, i) => {
    const at = `${path}[${i}]`;
    const key = object(item, at);
    known(key, ["keyHash", "roles"], at);
    const roles = texts(key.roles, `${at}.roles`);
    roles.forEach((role, j) => {
      if (!Object.prototype.hasOwnProperty.call(ROLE_ORDER, role))
        unread(`${at}.roles[${j}]: the signer role ${show(role)}`);
    });
    return { keyHash: text(key.keyHash, `${at}.keyHash`), roles };
  });
  if (
    keys.length !== keyHashes.length ||
    keys.some(({ keyHash }, i) => keyHash !== keyHashes[i])
  )
    unread(`${path} does not name the keys of keyHashes, in their order`);
  return keys;
};

/**
 * The data of a build back from its encoding
 * @param prototype With false, the encoding without `prototype`, whose data comes back without
 *   it: the caller works it out from the bytes
 * @throws UnreadContent for content this library does not know or cannot read, naming it
 */
export function decodeBuilt(value: unknown, path: string): BuiltTxData;
export function decodeBuilt(
  value: unknown,
  path: string,
  prototype: false,
): Omit<BuiltTxData, "prototype">;
export function decodeBuilt(
  value: unknown,
  path: string,
  prototype = true,
): Omit<BuiltTxData, "prototype"> {
  const json = object(value, path);
  known(json, prototype ? BUILT_MEMBERS : BUILT_WITHOUT_PROTOTYPE, path);
  const signers = object(json.signers, `${path}.signers`);
  known(signers, SIGNERS_MEMBERS, `${path}.signers`);
  const keyHashes = texts(signers.keyHashes, `${path}.signers.keyHashes`);
  const built: Obj = {
    tx: text(json.tx, `${path}.tx`),
    txHash: text(json.txHash, `${path}.txHash`),
    ...(prototype && {
      prototype: transaction(json.prototype, `${path}.prototype`),
    }),
    fee: integer(json.fee, `${path}.fee`),
    exUnits: exUnits(json.exUnits, `${path}.exUnits`),
    redeemers: list(json.redeemers, `${path}.redeemers`).map((item, i) => {
      const at = `${path}.redeemers[${i}]`;
      const redeemer = object(item, at);
      known(redeemer, REDEEMER_MEMBERS, at);
      return {
        ...redeemer,
        exUnits: exUnits(redeemer.exUnits, `${at}.exUnits`),
        ...optional(redeemer, "part", decodePart, at),
      };
    }),
    inputs: utxos(json.inputs, `${path}.inputs`),
    selectedInputs: utxos(json.selectedInputs, `${path}.selectedInputs`),
    referenceInputs: utxos(json.referenceInputs, `${path}.referenceInputs`),
    outputs: builtOutputs(json.outputs, `${path}.outputs`),
    change: builtOutputs(json.change, `${path}.change`),
    signers: {
      ...signers,
      keyHashes,
      keys: requiredKeys(signers.keys, keyHashes, `${path}.signers.keys`),
      byronAddresses: texts(
        signers.byronAddresses,
        `${path}.signers.byronAddresses`,
      ),
      nativeScripts: list(
        signers.nativeScripts,
        `${path}.signers.nativeScripts`,
      ).map((item, i) =>
        nativeScript(item, `${path}.signers.nativeScripts[${i}]`),
      ),
    },
    network: member(json.network, NETWORK_MEMBERS, `${path}.network`),
    warnings: list(json.warnings, `${path}.warnings`).map((item, i) =>
      member(item, WARNING_MEMBERS, `${path}.warnings[${i}]`),
    ),
    parts: list(json.parts, `${path}.parts`).map((item, i) =>
      decodePart(item, `${path}.parts[${i}]`),
    ),
  };
  if (json.collateral !== undefined) {
    const at = `${path}.collateral`;
    const collateral = member(json.collateral, COLLATERAL_MEMBERS, at);
    built.collateral = {
      ...collateral,
      inputs: utxos(collateral.inputs, `${at}.inputs`),
      total: integer(collateral.total, `${at}.total`),
      ...(collateral.return !== undefined && {
        return: utxoValue(collateral.return, `${at}.return`),
      }),
    };
  }
  if (json.validity !== undefined)
    built.validity = member(
      json.validity,
      VALIDITY_MEMBERS,
      `${path}.validity`,
    );
  return built as unknown as BuiltTxData;
}

export const decodeNetwork = (value: unknown, path: string) => {
  if (typeof value === "string") {
    if (value === "") unread(`${path} is an empty text`);
    return value;
  }
  const json = object(value, path);
  text(json.name, `${path}.name`);
  if (json.networkId !== 0 && json.networkId !== 1)
    unread(`${path}.networkId is ${show(json.networkId)}, not 0 or 1`);
  const slots = object(json.slotConfig, `${path}.slotConfig`);
  for (const key of ["zeroTime", "zeroSlot", "slotLength"])
    finite(slots[key], `${path}.slotConfig.${key}`);
  return json as TxPlanJSON["network"];
};

export const decodeDeadlines = (value: unknown, path: string) => {
  const json = object(value, path);
  known(json, ["ttlMs", "expiryMarginMs", "confirmations"], path);
  const ttlMs = finite(json.ttlMs, `${path}.ttlMs`);
  if (ttlMs <= 0) unread(`${path}.ttlMs is ${ttlMs}, not above 0`);
  const expiryMarginMs = finite(json.expiryMarginMs, `${path}.expiryMarginMs`);
  if (expiryMarginMs < 0)
    unread(`${path}.expiryMarginMs is ${expiryMarginMs}, not 0 or more`);
  return {
    ttlMs,
    expiryMarginMs,
    confirmations: count(json.confirmations, `${path}.confirmations`),
  };
};

/* ---------------------------------------------------------------------------------------------
 * The record of a plan
 * ------------------------------------------------------------------------------------------- */

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
export const deliveredOf = (
  step: Pick<StepRecord, "status" | "sends" | "refused">,
) => OUT.has(step.status) || step.sends > step.refused;

/* ---------------------------------------------------------------------------------------------
 * A step's transaction in the record
 * ------------------------------------------------------------------------------------------- */

// A step's transaction is written as the JSON of a `BuiltTx` without what its bytes and its
// recorded UTxOs give again. The reader reads the prototype from the bytes, as `fromCbor` does,
// and `prototype` holds only the members of its body, witness set and auxiliary data that the
// build made otherwise (Plutus data given as a value is read from the bytes as its CBOR); where a
// member the bytes give is one the build's prototype lacks, the whole prototype, with `is_valid`.
// An entry that repeats one of the same transaction is written as its place: a spend, reference
// input or collateral part whose UTxO is the one `inputs`, `referenceInputs` or
// `collateral.inputs` holds under its out ref has its place in that list as its `input` and no
// `utxo`; a selected input is its place in `inputs`, a change output its place in `outputs`, a
// redeemer's part its place in `parts`. Anything else is written whole. The reader also takes
// the transaction written whole, as `toJSON()` of a `BuiltTx` writes it: how a transaction given
// to a plan is checked, and how records were written before.

/** The list of a transaction's UTxOs a part of each kind takes its UTxO from */
const LISTED: Readonly<Record<string, (built: Obj) => unknown>> = {
  spend: (built) => built.inputs,
  referenceInput: (built) => built.referenceInputs,
  collateral: (built) =>
    isPlainObject(built.collateral) ? built.collateral.inputs : [],
};

/** The out ref of a UTxO as JSON data, or undefined for what is no UTxO */
const refOf = (utxo: unknown) =>
  isPlainObject(utxo) &&
  typeof utxo.txHash === "string" &&
  typeof utxo.outputIndex === "number"
    ? `${utxo.txHash}#${utxo.outputIndex}`
    : undefined;

/** The place of each UTxO of a list by its out ref, the first where one is named twice */
const placesOf = (utxos: unknown) => {
  const places = new Map<string, number>();
  (Array.isArray(utxos) ? utxos : []).forEach((utxo, i) => {
    const ref = refOf(utxo);
    if (ref !== undefined && !places.has(ref)) places.set(ref, i);
  });
  return places;
};

/** The place of this UTxO in the list, when the list holds it as it is */
const placeIn = (
  utxos: unknown,
  places: Map<string, number>,
  utxo: unknown,
): number | undefined => {
  const ref = refOf(utxo);
  const place = ref === undefined ? undefined : places.get(ref);
  return place !== undefined && sameJson((utxos as unknown[])[place], utxo)
    ? place
    : undefined;
};

/** Whether two values are alike: members whose value is `undefined` count as absent */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a))
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => sameValue(item, b[i]))
    );
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = (value: Obj) =>
    Object.keys(value).filter((key) => value[key] !== undefined);
  const left = keys(a);
  return (
    left.length === keys(b).length &&
    left.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameValue(a[key], b[key]),
    )
  );
};

/** The members of a prototype a record may write in place of those its bytes give */
const SECTIONS = ["body", "witness_set", "auxiliary_data"] as const;

/**
 * What a record writes of a build's prototype, as JSON data: nothing when its bytes give it as
 * it is; else the members of its sections they give otherwise; else, when a member they give is
 * one the build's lacks, the whole prototype
 */
const prototypeWritten = (built: BuiltTxData): unknown => {
  const own = built.prototype as unknown as Obj;
  const read = readTxValue(readTransaction(built.tx))
    .prototype as unknown as Obj;
  if (sameValue(own, read)) return undefined;
  const whole = () => encodeValue(own);
  if (own.is_valid !== read.is_valid) return whole();
  const patch: Obj = {};
  for (const section of SECTIONS) {
    const mine = own[section];
    const theirs = read[section];
    if (sameValue(mine, theirs)) continue;
    if (!isPlainObject(mine) || !isPlainObject(theirs)) return whole();
    const members: Obj = {};
    for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)]))
      if (!sameValue(mine[key], theirs[key])) {
        if (mine[key] === undefined) return whole();
        members[key] = mine[key];
      }
    patch[section] = members;
  }
  return encodeValue(patch);
};

/**
 * What the record writes of each prototype it has written or read: computed once for a build,
 * whose data is not changed
 */
const WRITTEN = new WeakMap<BuiltTxData, { prototype: unknown }>();

/**
 * The data of a step's build as the record holds it: the encoding of a build with only what its
 * bytes do not give of its prototype, and the places of the entries it repeats
 */
const encodeStepBuilt = (built: BuiltTxData): Record<string, unknown> => {
  let written = WRITTEN.get(built);
  if (written === undefined) {
    written = { prototype: prototypeWritten(built) };
    WRITTEN.set(built, written);
  }
  const { prototype: _, ...json } = encodeBuilt(built) as Obj;
  const placesBy = new Map<string, Map<string, number>>();
  const places = (kind: string) => {
    let found = placesBy.get(kind);
    if (found === undefined) {
      found = placesOf(LISTED[kind]!(json));
      placesBy.set(kind, found);
    }
    return found;
  };
  let outputs: Map<string, number> | undefined;
  const outputPlaces = () => (outputs ??= placesOf(json.outputs));
  const parts = json.parts as Obj[];
  return {
    ...json,
    selectedInputs: (json.selectedInputs as unknown[]).map(
      (utxo) => placeIn(json.inputs, places("spend"), utxo) ?? utxo,
    ),
    change: (json.change as unknown[]).map(
      (utxo) => placeIn(json.outputs, outputPlaces(), utxo) ?? utxo,
    ),
    redeemers: (json.redeemers as Obj[]).map((redeemer) => {
      if (redeemer.part === undefined) return redeemer;
      const place = parts.findIndex((part) => sameJson(part, redeemer.part));
      return place < 0 ? redeemer : { ...redeemer, part: place };
    }),
    parts: parts.map((part) => {
      const listed = LISTED[part.kind as string];
      if (listed === undefined || part.utxo === undefined) return part;
      const utxos = listed(json);
      const place = placeIn(utxos, places(part.kind as string), part.utxo);
      const input = part.input as Obj | undefined;
      const utxo = part.utxo as Obj;
      if (
        place === undefined ||
        input?.transaction_id !== utxo.txHash ||
        input?.index !== utxo.outputIndex
      )
        return part;
      const { utxo: __, ...rest } = part;
      return { ...rest, input: place };
    }),
    ...(written.prototype !== undefined && { prototype: written.prototype }),
  };
};

/**
 * The prototype of a step's transaction, read from its bytes, with what the record wrote of it:
 * the whole prototype, or the members of its sections the build made otherwise
 * @throws UnreadContent for what it does not read
 */
const prototypeOfStep = (
  read: BuiltTxData["prototype"],
  written: unknown,
  path: string,
): BuiltTxData["prototype"] => {
  if (isPlainObject(written) && written.is_valid !== undefined)
    return transaction(written, path) as BuiltTxData["prototype"];
  if (written === undefined) return read;
  const patch = object(written, path);
  known(patch, SECTIONS, path);
  const json = encodeValue(read) as Obj;
  for (const section of SECTIONS) {
    if (patch[section] === undefined) continue;
    const members = object(patch[section], `${path}.${section}`);
    if (Object.keys(members).length === 0)
      unread(`${path}.${section} is empty: it is written only when it differs`);
    if (!isPlainObject(json[section]))
      unread(`${path}.${section}: the transaction has none`);
    json[section] = { ...(json[section] as Obj), ...members };
  }
  if (Object.keys(patch).length === 0)
    unread(`${path} is empty: it is written only when it differs`);
  return transaction(json, path) as BuiltTxData["prototype"];
};

/**
 * The encoding of a step's build with every place put back as the entry it names, ready for
 * the reader of a build
 * @throws UnreadContent for a place that names no entry, or a part that holds both a place and
 *   a UTxO
 */
const expandStepBuilt = (json: Obj, path: string): Obj => {
  // The lists are read first, so that a UTxO of another shape is named where it is written
  utxos(json.inputs, `${path}.inputs`);
  builtOutputs(json.outputs, `${path}.outputs`);
  utxos(json.referenceInputs, `${path}.referenceInputs`);
  if (isPlainObject(json.collateral) && json.collateral.inputs !== undefined)
    utxos(json.collateral.inputs, `${path}.collateral.inputs`);
  const entry = (
    items: unknown,
    place: unknown,
    at: string,
    what: string,
  ): unknown => {
    const all = list(items, `${path}.${what}`);
    if (!Number.isSafeInteger(place) || (place as number) < 0)
      unread(`${at} is ${show(place)}, not a place in ${what}`);
    if ((place as number) >= all.length)
      unread(
        `${at} is ${place as number}, and ${what} holds ${all.length} entries`,
      );
    return all[place as number];
  };
  const parts = list(json.parts, `${path}.parts`).map((item, i) => {
    const at = `${path}.parts[${i}]`;
    const part = object(item, at);
    const kind = part.kind;
    // A part of another kind is refused by the reader of parts
    if (
      typeof part.input !== "number" ||
      typeof kind !== "string" ||
      !Object.prototype.hasOwnProperty.call(LISTED, kind)
    )
      return part;
    const listed = LISTED[kind]!;
    if (part.utxo !== undefined) {
      utxoValue(part.utxo, `${at}.utxo`);
      unread(`${at} holds a utxo beside the place of its input`);
    }
    const what =
      kind === "spend"
        ? "inputs"
        : kind === "referenceInput"
          ? "referenceInputs"
          : "collateral.inputs";
    const utxo = object(
      entry(listed(json), part.input, `${at}.input`, what),
      `${path}.${what}[${part.input}]`,
    );
    return {
      ...part,
      input: { transaction_id: utxo.txHash, index: utxo.outputIndex },
      utxo,
    };
  });
  return {
    ...json,
    selectedInputs: list(json.selectedInputs, `${path}.selectedInputs`).map(
      (utxo, i) =>
        typeof utxo === "number"
          ? entry(json.inputs, utxo, `${path}.selectedInputs[${i}]`, "inputs")
          : utxo,
    ),
    change: list(json.change, `${path}.change`).map((utxo, i) =>
      typeof utxo === "number"
        ? entry(json.outputs, utxo, `${path}.change[${i}]`, "outputs")
        : utxo,
    ),
    parts,
  };
};

/**
 * The redeemers of a step's build whose part is written as its place in `parts`, without that
 * part, and the places: the parts are read first, and each such redeemer is then given the part
 * read
 * @throws UnreadContent for a place that names no part
 */
const redeemerPlaces = (json: Obj, path: string) => {
  const places = new Map<number, number>();
  const redeemers = list(json.redeemers, `${path}.redeemers`).map((item, i) => {
    const at = `${path}.redeemers[${i}]`;
    const redeemer = object(item, at);
    if (typeof redeemer.part !== "number") return redeemer;
    const count = list(json.parts, `${path}.parts`).length;
    const place = redeemer.part;
    if (!Number.isSafeInteger(place) || place < 0 || place >= count)
      unread(
        `${at}.part is ${show(place)}, not a place in parts, which holds ${count} entries`,
      );
    places.set(i, place);
    const { part: _, ...rest } = redeemer;
    return rest;
  });
  return { json: { ...json, redeemers }, places };
};

/* ---------------------------------------------------------------------------------------------
 * Writing
 * ------------------------------------------------------------------------------------------- */

export const encodeGiven = (given: StepGiven) => ({
  parts: encodeParts(given.parts),
  ...(given.options !== undefined && {
    options: encodeValue(given.options) as Record<string, unknown>,
  }),
});

const encodeStep = (step: StepRecord): TxStepJSON => ({
  name: step.name,
  ...(step.kind !== undefined && { kind: step.kind }),
  ...(step.added === true && { added: true as const }),
  status: step.status,
  txHash: step.txHash,
  ...(step.seen !== undefined && {
    seen: {
      slot: step.seen.slot,
      ...(step.seen.block !== undefined && { block: step.seen.block }),
    },
  }),
  ...(step.standsOn.length > 0 && { standsOn: [...step.standsOn] }),
  ...(step.after !== undefined && { after: [...step.after] }),
  ...(step.expirySource !== undefined && {
    expirySource: step.expirySource,
  }),
  sends: step.sends,
  refused: step.refused,
  tx: {
    kind: "BuiltTx",
    version: BUILT_TX_VERSION,
    txHash: step.txHash,
    built: encodeStepBuilt(step.built),
    // A prebuilt step's witnesses in the form they came in; those of a step the plan built
    // without the set tag
    ...(step.witnesses.length > 0 && {
      witnesses: writeWitnessSet(step.witnesses, step.tags ?? false),
    }),
    ...(step.extraKeyWitnesses !== undefined && {
      extraKeyWitnesses: step.extraKeyWitnesses,
    }),
    ...(deliveredOf(step) && { delivered: true as const }),
  },
  ...(step.given !== undefined && { given: encodeGiven(step.given) }),
});

const encodeBefore = (
  before: PlanBefore,
): NonNullable<TxPlanJSON["before"]> => ({
  final: [...before.final],
  open: before.open.map((entry) => ({
    step: entry.step,
    txHash: entry.txHash,
    spends: [...entry.spends],
    outputs: entry.outputs,
    ...(entry.until !== undefined && { until: entry.until }),
    ...(entry.seenBefore !== undefined && {
      seenBefore: {
        slot: entry.seenBefore.slot,
        ...(entry.seenBefore.block !== undefined && {
          block: entry.seenBefore.block,
        }),
      },
    }),
    ...(entry.plutus === true && { plutus: true as const }),
    ...(entry.pays !== undefined && { pays: [...entry.pays] }),
    ...(entry.paysMore !== undefined && { paysMore: entry.paysMore }),
    ...(entry.seen !== undefined && {
      seen: {
        slot: entry.seen.slot,
        ...(entry.seen.block !== undefined && { block: entry.seen.block }),
      },
    }),
  })),
});

/**
 * The record a store holds, from the record the state machine works on: plain JSON data in the
 * version this library writes
 * @throws TxBuildError NOT_SERIALIZABLE for a part that holds a redeemer function
 */
export const encodePlan = (record: PlanRecord): TxPlanJSON => ({
  kind: "TxPlan",
  version: PLAN_RECORD_VERSION,
  ...(record.id !== undefined && { id: record.id }),
  rev: record.rev,
  status: record.status,
  ...(record.stopped === true && { stopped: true as const }),
  ...(record.halted === true && { halted: true as const }),
  ...(record.replaces !== undefined && { replaces: record.replaces }),
  ...(record.replacedBy !== undefined && { replacedBy: record.replacedBy }),
  ...(record.before !== undefined && { before: encodeBefore(record.before) }),
  network: encodeValue(record.network) as TxPlanJSON["network"],
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

const PLAN_STATUSES: ReadonlySet<string> = new Set<TxPlanStatus>([
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

/**
 * The option `consolidate` as a plan records it: a flag, or `{ maxSteps? }` of 1 to
 * `MAX_CONSOLIDATION_STEPS`
 */
const consolidation = (
  value: unknown,
  path: string,
): boolean | { maxSteps?: number } => {
  if (typeof value === "boolean") return value;
  const json = object(value, path);
  known(json, ["maxSteps"], path);
  if (json.maxSteps === undefined) return {};
  const maxSteps = count(json.maxSteps, `${path}.maxSteps`);
  if (maxSteps < 1 || maxSteps > MAX_CONSOLIDATION_STEPS)
    unread(
      `${path}.maxSteps is ${show(maxSteps)}, not from 1 to ${MAX_CONSOLIDATION_STEPS}`,
    );
  return { maxSteps };
};

const PLAN_OPTIONS: Readonly<
  Record<string, (value: unknown, path: string) => unknown>
> = {
  knownUtxos: utxos,
  registeredPools: texts,
  extraKeyWitnesses: count,
  topUpCollateral: flag,
  collateralReturn: flag,
  consolidate: consolidation,
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

/** The out refs a body names in one of its sets, in its order */
const namedBy = (
  inputs: readonly Serialization.TransactionInput[] | undefined,
): string[] =>
  (inputs ?? []).map(
    (input) =>
      `${input.transactionId().toLowerCase()}#${Number(input.index())}`,
  );

const keysOf = (utxos: readonly Utxo[]) =>
  utxos.map((utxo) => utxoKey(utxo).toLowerCase());

/**
 * Whether the UTxOs a build records are those its body names: its inputs, the same out refs in
 * the same order; its collateral inputs, the same out refs; its reference inputs, out refs the
 * body reads, in its order (one whose data the build did not read has none to record)
 */
const listsProblem = (
  built: Omit<BuiltTxData, "prototype">,
  body: Serialization.TransactionBody,
): string | undefined => {
  const inputs = keysOf(built.inputs);
  const named = namedBy(body.inputs().values());
  if (
    inputs.length !== named.length ||
    inputs.some((key, i) => key !== named[i])
  )
    return "inputs are not the inputs of the transaction, in its order";
  const collateral = keysOf(built.collateral?.inputs ?? []);
  const puts = namedBy(body.collateral()?.values());
  if (
    collateral.length !== puts.length ||
    new Set(collateral).size !== collateral.length ||
    collateral.some((key) => !puts.includes(key))
  )
    return "collateral.inputs are not the collateral inputs of the transaction";
  const reads = namedBy(body.referenceInputs()?.values());
  let next = 0;
  for (const key of keysOf(built.referenceInputs)) {
    while (next < reads.length && reads[next] !== key) next += 1;
    if (next === reads.length)
      return "referenceInputs are not reference inputs of the transaction, in its order";
    next += 1;
  }
  return undefined;
};

/** Whether two UTxOs are one output: the same out ref, address, value, datum and script */
const sameOutput = (a: Utxo, b: Utxo) =>
  sameValue(encodeValue(plainUtxo(a)), encodeValue(plainUtxo(b)));

/**
 * Whether the outputs a build records are those its bytes make: each, by position, the same
 * out ref, address, value, datum (hash or inline) and reference script; and each change output
 * one of them. What bytes cannot say, a label and the change mark, is taken as recorded
 */
const outputsProblem = (
  built: Omit<BuiltTxData, "prototype">,
  made: readonly Utxo[],
): string | undefined => {
  if (built.outputs.length !== made.length)
    return `outputs are ${built.outputs.length}, and the transaction makes ${made.length}`;
  const at = built.outputs.findIndex(
    (output, i) => !sameOutput(output, made[i]!),
  );
  if (at >= 0) return `outputs[${at}] is not output ${at} of the transaction`;
  const change = built.change.findIndex((output) => {
    const own = made[output.outputIndex];
    return own === undefined || !sameOutput(output, own);
  });
  if (change >= 0)
    return `change[${change}] is not an output of the transaction`;
  return undefined;
};

/**
 * Whether the collateral a build records is what its bytes make: its return the same out ref,
 * address, value, datum and reference script as the body's collateral return (one recorded where
 * the body has none, or none where it has one, is refused), and its total the body's
 * `total_collateral`, else the lovelace of the collateral inputs the record states less that of
 * the body's return, as a build counts it. A transaction with no collateral inputs has nothing
 * to compare
 */
const collateralProblem = (
  built: Omit<BuiltTxData, "prototype">,
  fromBytes: ReturnType<typeof readTxValue>,
): string | undefined => {
  const { collateral } = built;
  const bodyReturn = fromBytes.collateralReturn;
  const stated = fromBytes.prototype.body.total_collateral;
  // No collateral inputs (the inputs are compared on their own): nothing can be forfeited
  if (collateral === undefined) return undefined;
  if (collateral.return === undefined) {
    if (bodyReturn !== undefined)
      return "collateral.return is not recorded, and the transaction has a collateral return";
  } else if (bodyReturn === undefined)
    return "collateral.return is recorded, and the transaction has no collateral return";
  else if (!sameOutput(collateral.return, bodyReturn))
    return "collateral.return is not the collateral return of the transaction";
  const total =
    stated !== undefined && stated !== null
      ? BigInt(stated)
      : collateral.inputs.reduce((sum, utxo) => sum + utxo.value.lovelace, 0n) -
        (bodyReturn?.value.lovelace ?? 0n);
  if (collateral.total !== total)
    return "collateral.total is not the total collateral of the transaction";
  return undefined;
};

/**
 * A step's transaction: its JSON read, its bytes read again and found unsigned, its hash
 * compared, its recorded inputs found to be those of its body, its recorded outputs those its
 * bytes make (a record that states another address, value, datum or script is refused), its
 * recorded collateral return and total those of its bytes, and every witness verified
 * against its body; its prototype read from its bytes with what the record wrote of it; with the
 * set tag of each of the two entries of its witnesses, else as its body writes its input set. It
 * takes the transaction as a plan's record writes it, and the JSON of a `BuiltTx` written whole,
 * whose prototype is taken as written
 * @throws UnreadContent for what it does not read
 */
export const decodeTx = (
  value: unknown,
  txHash: string,
  path: string,
): {
  built: BuiltTxData;
  witnesses: KeyWitness[];
  extraKeyWitnesses?: number;
  delivered: boolean;
  tags: KeyWitnessTags;
} => {
  const json = object(value, path);
  known(json, TX_MEMBERS, path);
  if (json.kind !== "BuiltTx")
    unread(`${path}.kind is ${show(json.kind)}, not "BuiltTx"`);
  if (json.version !== BUILT_TX_VERSION)
    unread(`${path}.version is ${show(json.version)}, not ${BUILT_TX_VERSION}`);
  if (text(json.txHash, `${path}.txHash`) !== txHash)
    unread(`${path}.txHash is not the step's txHash`);
  const at = `${path}.built`;
  const { prototype: kept, ...expanded } = expandStepBuilt(
    object(json.built, at),
    at,
  );
  const { json: written, places } = redeemerPlaces(expanded, at);
  const decoded = decodeBuilt(written, at, false);
  const read =
    places.size === 0
      ? decoded
      : {
          ...decoded,
          redeemers: decoded.redeemers.map((redeemer, i) =>
            places.has(i)
              ? {
                  ...redeemer,
                  part: decoded.parts[places.get(i)!] as BuiltRedeemer["part"],
                }
              : redeemer,
          ),
        };
  if (read.txHash !== txHash)
    unread(`${path}.built.txHash is not the step's txHash`);
  let raw: RawTx;
  let body: string;
  let signed: boolean;
  let taggedSets: boolean;
  try {
    raw = readTransaction(read.tx);
    body = raw.txId;
    taggedSets = raw.taggedSets;
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
  const lists = listsProblem(read, raw.body);
  if (lists !== undefined) unread(`${path}.built.${lists}`);
  let fromBytes: ReturnType<typeof readTxValue>;
  try {
    fromBytes = readTxValue(raw);
  } catch {
    return unread(
      `${at}.prototype: the transaction holds what this library does not read as a value`,
    );
  }
  const outputs = outputsProblem(read, fromBytes.outputs);
  if (outputs !== undefined) unread(`${path}.built.${outputs}`);
  const collateral = collateralProblem(read, fromBytes);
  if (collateral !== undefined) unread(`${path}.built.${collateral}`);
  const built: BuiltTxData = {
    ...read,
    prototype: prototypeOfStep(fromBytes.prototype, kept, `${at}.prototype`),
  };
  // A prototype read from the bytes alone is written so again, with no second reading
  if (kept === undefined) WRITTEN.set(built, { prototype: undefined });
  let witnesses: KeyWitness[] = [];
  let tags: Partial<KeyWitnessTags> = {};
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
    tags = keyWitnessTags(read.witnessSet);
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
    tags: {
      vkey: tags.vkey ?? taggedSets,
      bootstrap: tags.bootstrap ?? taggedSets,
    },
  };
};

const decodeGiven = (value: unknown, path: string): StepGiven => {
  const json = object(value, path);
  known(json, ["parts", "options"], path);
  let parts: (TxPart | LinkedPart)[];
  try {
    parts = decodeParts(list(json.parts, `${path}.parts`), { links: true });
  } catch (error) {
    // The reader of parts names a part from its own list: the message names it in the record
    if (error instanceof UnreadContent && error.message.startsWith("parts["))
      throw new UnreadContent(`${path}.${error.message}`);
    throw error;
  }
  return {
    parts,
    ...(json.options !== undefined && {
      options: decodeOptions(json.options, STEP_OPTIONS, `${path}.options`),
    }),
  };
};

/** The seen block of a step or of an entry */
const decodeSeen = (value: unknown, at: string) => {
  const read = object(value, at);
  known(read, ["slot", "block"], at);
  return {
    slot: finite(read.slot, `${at}.slot`),
    ...(read.block !== undefined && {
      block: text(read.block, `${at}.block`),
    }),
  };
};

const STEP_MEMBERS = [
  "name",
  "kind",
  "added",
  "status",
  "txHash",
  "seen",
  "standsOn",
  "after",
  "expirySource",
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
  if (
    json.kind !== undefined &&
    json.kind !== "consolidation" &&
    json.kind !== "prebuilt"
  )
    unread(`${path}.kind: the step kind ${show(json.kind)}`);
  if (json.added !== undefined && json.added !== true)
    unread(`${path}.added is ${show(json.added)}, not true`);
  const status = json.status;
  if (typeof status !== "string" || !STEP_STATUSES.has(status))
    unread(`${path}.status: the step status ${show(status)}`);
  const txHash = text(json.txHash, `${path}.txHash`);
  if (earlier.some((step) => step.txHash === txHash))
    unread(`${path}.txHash: the plan has the transaction ${txHash} before it`);
  const seen: StepRecord["seen"] =
    json.seen === undefined ? undefined : decodeSeen(json.seen, `${path}.seen`);
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
    ...(json.kind !== undefined && {
      kind: json.kind as "consolidation" | "prebuilt",
    }),
    ...(json.added === true && { added: true as const }),
    status: status as TxStepStatus,
    txHash,
    ...(seen !== undefined && { seen }),
    standsOn,
    ...(json.after !== undefined && {
      after: texts(json.after, `${path}.after`),
    }),
    ...(json.expirySource !== undefined && {
      expirySource: text(json.expirySource, `${path}.expirySource`),
    }),
    built: tx.built,
    witnesses: tx.witnesses,
    ...(tx.extraKeyWitnesses !== undefined && {
      extraKeyWitnesses: tx.extraKeyWitnesses,
    }),
    ...(json.given !== undefined && {
      given: decodeGiven(json.given, `${path}.given`),
    }),
    ...(json.kind === "prebuilt" && { tags: tx.tags }),
    sends,
    refused,
  };

  // What the state machine relies on. A step the plan built from parts always has given; one
  // with neither would be signed as the plan's own
  if (step.kind === undefined && step.given === undefined)
    unread(
      `${path} has neither kind nor given: a step the plan built from parts has given`,
    );
  if (step.kind === "consolidation" && step.given !== undefined)
    unread(`${path}.given is on a consolidation step`);
  // A consolidation step pays its payer's change address alone
  if (
    step.kind === "consolidation" &&
    new Set(step.built.outputs.map((output) => output.address)).size > 1
  )
    unread(
      `${path}: a consolidation step whose outputs are not all at one address`,
    );
  if (step.kind === "prebuilt" && step.given !== undefined)
    unread(`${path}.given is on a prebuilt step`);
  const spender = spentBefore(step.built, earlier);
  if (spender !== undefined)
    unread(
      `${path}: the transaction spends ${spender.outRef}, which the step ${show(spender.name)} before it spends`,
    );
  const sources = standsOnOf(step.built, earlier);
  if (
    new Set(standsOn).size !== standsOn.length ||
    sources.length !== standsOn.length ||
    sources.some((each) => !standsOn.includes(each))
  )
    unread(
      `${path}.standsOn names [${standsOn.join(", ")}], and the transaction spends, reads or puts up outputs of the earlier steps [${sources.join(", ")}]`,
    );
  const after = afterProblem(step, earlier);
  if (after !== undefined) unread(`${path}.after: ${after}`);
  const landedOrFailed =
    step.status === "included" ||
    step.status === "final" ||
    step.status === "failed";
  // A step keeps the block it was found in after a rollback; one never found has none
  if (landedOrFailed && seen === undefined)
    unread(`${path}.seen is missing on a step that is ${step.status}`);
  if (
    (step.status === "built" || step.status === "signed") &&
    seen !== undefined
  )
    unread(`${path}.seen is on a step that is ${step.status}`);
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
  // Orphaned only while a step it stands on will not land
  if (step.status === "orphaned" && !deadBelow)
    unread(
      `${path}.status is orphaned, and it stands on no step that will not land`,
    );
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
  "halted",
  "replaces",
  "replacedBy",
  "before",
  "network",
  "deadlines",
  "steps",
  "options",
] as const;

const TX_HASH = /^[0-9a-f]{64}$/;
const OUT_REF = /^[0-9a-f]{64}#(?:0|[1-9][0-9]*)$/;

/**
 * What a plan keeps of the plans before it: both lists; names not empty, each final name once;
 * each hash a transaction hash in lower case, none twice and none of a step of the plan; the out
 * refs spent not empty, each `txHash#index` once
 */
const decodeBefore = (
  value: unknown,
  steps: readonly StepRecord[],
): PlanBefore => {
  const json = object(value, "before");
  known(json, ["final", "open"], "before");
  if (json.final === undefined) unread("before.final is missing");
  if (json.open === undefined) unread("before.open is missing");
  const final = list(json.final, "before.final").map((name, i) =>
    nonEmpty(name, `before.final[${i}]`),
  );
  final.forEach((name, i) => {
    if (final.indexOf(name) !== i)
      unread(`before.final[${i}]: the name ${show(name)} is there before`);
  });
  const hashes = new Set(steps.map((step) => step.txHash.toLowerCase()));
  const open: BeforeEntry[] = [];
  list(json.open, "before.open").forEach((item, i) => {
    const at = `before.open[${i}]`;
    const entry = object(item, at);
    known(
      entry,
      [
        "step",
        "txHash",
        "spends",
        "outputs",
        "until",
        "seenBefore",
        "plutus",
        "pays",
        "paysMore",
        "seen",
      ],
      at,
    );
    // A record that holds no count of outputs was written before entries held one
    if (entry.outputs === undefined) unread(`${at}.outputs is missing`);
    if (entry.until !== undefined && entry.seenBefore !== undefined)
      unread(
        `${at} has until and seenBefore: time never settles what was found`,
      );
    if (entry.plutus !== undefined && entry.plutus !== true)
      unread(`${at}.plutus is neither true nor absent`);
    const pays =
      entry.pays === undefined ? undefined : texts(entry.pays, `${at}.pays`);
    if (pays !== undefined && (pays.length === 0 || pays.length > MAX_PAYS))
      unread(`${at}.pays holds from 1 to ${MAX_PAYS} addresses`);
    pays?.forEach((address, k) => {
      if (address === "") unread(`${at}.pays[${k}] is empty`);
      if (pays.indexOf(address) !== k)
        unread(`${at}.pays[${k}]: the address is there before`);
    });
    // A record written before entries held the addresses they pay is not read
    if (count(entry.outputs, `${at}.outputs`) > 0 !== (pays !== undefined))
      unread(`${at}.pays is there exactly when the transaction makes outputs`);
    // How many addresses past the 16 of `pays`: only beside a full `pays`, and with it no more
    // addresses than the transaction makes outputs
    const paysMore =
      entry.paysMore === undefined
        ? undefined
        : count(entry.paysMore, `${at}.paysMore`);
    if (paysMore !== undefined) {
      if (paysMore === 0)
        unread(`${at}.paysMore is 0, not a whole number above 0`);
      if (pays?.length !== MAX_PAYS)
        unread(
          `${at}.paysMore is there only beside ${MAX_PAYS} addresses in pays`,
        );
      if (MAX_PAYS + paysMore > count(entry.outputs, `${at}.outputs`))
        unread(`${at}.pays and paysMore count more addresses than outputs`);
    }
    const step = nonEmpty(entry.step, `${at}.step`);
    const txHash = text(entry.txHash, `${at}.txHash`);
    if (!TX_HASH.test(txHash))
      unread(`${at}.txHash is not a transaction hash in lower case`);
    if (open.some((each) => each.txHash === txHash))
      unread(`${at}.txHash: the transaction ${txHash} is there before`);
    if (hashes.has(txHash))
      unread(`${at}.txHash: the transaction ${txHash} is a step of the plan`);
    const spends = texts(entry.spends, `${at}.spends`);
    if (spends.length === 0)
      unread(`${at}.spends is empty: a transaction spends an input at least`);
    spends.forEach((outRef, k) => {
      if (!OUT_REF.test(outRef))
        unread(`${at}.spends[${k}] is not an out ref txHash#index`);
      if (spends.indexOf(outRef) !== k)
        unread(`${at}.spends[${k}]: the out ref ${outRef} is there before`);
    });
    open.push({
      step,
      txHash,
      spends,
      outputs: count(entry.outputs, `${at}.outputs`),
      ...(entry.until !== undefined && {
        until: finite(entry.until, `${at}.until`),
      }),
      ...(entry.seenBefore !== undefined && {
        seenBefore: decodeSeen(entry.seenBefore, `${at}.seenBefore`),
      }),
      ...(entry.plutus === true && { plutus: true as const }),
      ...(pays !== undefined && { pays }),
      ...(paysMore !== undefined && { paysMore }),
      ...(entry.seen !== undefined && {
        seen: decodeSeen(entry.seen, `${at}.seen`),
      }),
    });
  });
  return { final, open };
};

const decodeRecord = (json: Obj, id?: string): PlanRecord => {
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
  if (json.halted !== undefined && json.halted !== true)
    unread(`halted is ${show(json.halted)}, not true`);
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
  // The steps the plan was made with come first; every step added after them is marked
  if (steps[0]!.added === true)
    unread("steps[0].added is on a step of the first record");
  steps.forEach((step, i) => {
    if (i > 0 && step.added !== true && steps[i - 1]!.added === true)
      unread(`steps[${i}].added is missing on a step after an added step`);
  });
  const before =
    json.before === undefined ? undefined : decodeBefore(json.before, steps);
  // A plan made in place of another keeps what it must not land beside
  if (replaces !== undefined && before === undefined)
    unread("before is missing on a plan made in place of another");
  // An entry is seen only with the mark, written in the same record
  if (
    before?.open.some((entry) => entry.seen !== undefined) &&
    json.stopped !== true
  )
    unread(
      "stopped is missing on a plan that found a transaction of before.open",
    );
  const record: PlanRecord = {
    kind: "TxPlan",
    version: PLAN_RECORD_VERSION,
    ...(own !== undefined && { id: own }),
    rev,
    status: status as TxPlanStatus,
    ...(json.stopped === true && { stopped: true as const }),
    ...(json.halted === true && { halted: true as const }),
    ...(replaces !== undefined && { replaces }),
    ...(replacedBy !== undefined && { replacedBy }),
    ...(before !== undefined && { before }),
    network: decodeNetwork(json.network, "network"),
    deadlines: decodeDeadlines(json.deadlines, "deadlines"),
    steps,
    options: decodeOptions(json.options, PLAN_OPTIONS, "options"),
  };
  // A consolidation step pays a payer of the plan alone: the change address it pays is the
  // plan's payer's, or that of a step's own payer, whenever the record holds one
  const changeAddresses = new Set(
    [
      record.options.changeAddress,
      ...steps.map((step) => step.given?.options?.changeAddress),
    ].filter((address): address is string => typeof address === "string"),
  );
  if (changeAddresses.size > 0)
    steps.forEach((step, i) => {
      if (
        step.kind === "consolidation" &&
        step.built.outputs.some(
          (output) => !changeAddresses.has(output.address),
        )
      )
        unread(
          `steps[${i}]: a consolidation step that pays an address that is not the change address of a payer of the plan`,
        );
    });
  if (planStatus(record) !== record.status)
    unread(
      `status: the plan status ${show(status)}, which its steps and mark do not give`,
    );
  // A plan that came to stopped by its steps records it
  if (
    record.status === "stopped" &&
    record.stopped !== true &&
    record.halted !== true
  )
    unread("halted is missing on a plan that its steps stopped");
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
 * Reads the record of a plan from a store or from `toJSON()`: checks its kind and
 * version, reads every member strictly, reads each step's transaction again, and checks that the
 * state machine could have written it. `id`, when given, is the id the record must have.
 * @throws TxPlanError INVALID_STATE (`recordVersion`, not retryable) for another kind, another
 *   version, content this library does not know or cannot read, a transaction whose bytes are not
 *   of its hash, a witness that is not of its body, or statuses that do not fit together; the
 *   message names it
 */
export const readPlan = (json: unknown, id?: string): PlanRecord => {
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
    if (record.version === 1)
      unread(
        `the version 1: a record of a plan of one payment built anew in attempts, a format this library does not read; it reads version ${PLAN_RECORD_VERSION}`,
      );
    if (record.version !== PLAN_RECORD_VERSION)
      unread(
        `the version ${show(record.version)}: this library reads version ${PLAN_RECORD_VERSION}`,
      );
    return decodeRecord(record, id);
  } catch (error) {
    if (error instanceof UnreadContent) throw notRead(error.message, planId);
    throw error;
  }
};
