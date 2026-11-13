import type { BuiltTx } from "../builder";
import type { TxPart } from "../parts/types";
import type { AnchorKind, AttemptRecord, PlanRecord } from "./core";
import type { TxAttemptStatus, TxPlanJSON, TxPlanStatus } from "./types";
import { NOT_UNPAID, TxBuildError, TxPlanError } from "../errors";
import { freeze } from "../parts/normalize";
import { planStatus } from "./core";

// The record of a plan as data: what `toJSON()` returns and a store holds. The encoding keeps
// the shapes of the parts and of the record and writes every `bigint` as its decimal string, at
// its own field; the reader knows those fields and puts the `bigint`s back. The reader refuses a
// record it cannot read whole: a newer version, another kind, or content this library does not
// know. Nothing here is exported from the package.

/** The record format this library writes */
export const PLAN_RECORD_VERSION = 1;

/** A step from record version n to n + 1, applied to the record as read */
export type Migration = (
  json: Record<string, unknown>,
) => Record<string, unknown>;

/** The steps from version n to n + 1, by n; empty while only version 1 exists */
export const migrations: ReadonlyMap<number, Migration> = new Map();

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
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
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
const holdsFunction = (part: TxPart) => {
  const witness = (part as { witness?: { redeemer?: { data?: unknown } } })
    .witness;
  const data = witness?.redeemer?.data as { type?: unknown } | undefined;
  return data?.type === "deferred";
};

/**
 * The parts as a record holds them: their own shapes, every `bigint` as its decimal string
 * @throws TxBuildError NOT_SERIALIZABLE, with the part's kind and label, at the first part that
 *   holds a redeemer function
 */
export const encodeParts = (parts: readonly TxPart[]): unknown[] =>
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

const encodeBuilt = (built: BuiltTx): unknown => {
  const { parts, ...rest } = built;
  return { ...(plain(rest, "built") as object), parts: encodeParts(parts) };
};

const encodeAttempt = (attempt: AttemptRecord): unknown => {
  const { built, ...rest } = attempt;
  return {
    ...(plain(rest, "attempt") as object),
    ...(built !== undefined && { built: encodeBuilt(built) }),
  };
};

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
  ...(record.closing === true && { closing: true as const }),
  network: plain(record.network, "network") as TxPlanJSON["network"],
  deadlines: {
    ttlMs: record.deadlines.ttlMs,
    expiryMarginMs: record.deadlines.expiryMarginMs,
    confirmations: record.deadlines.confirmations,
  },
  attempts: record.attempts.map(encodeAttempt) as TxPlanJSON["attempts"],
  anchor: plain(record.anchor, "anchor"),
  parts: encodeParts(record.parts as TxPart[]),
  options: plain(record.options, "options") as Record<string, unknown>,
});

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

const show = (value: unknown): string => {
  if (value === undefined) return "none";
  if (typeof value === "string")
    return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}…` : value);
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object" && value !== null) return "an object";
  return String(value);
};

type Obj = Record<string, unknown>;

const object = (value: unknown, path: string): Obj => {
  if (!isPlainObject(value)) unread(`${path} is ${show(value)}, not an object`);
  return value as Obj;
};

const list = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) unread(`${path} is ${show(value)}, not a list`);
  return value as unknown[];
};

const text = (value: unknown, path: string): string => {
  if (typeof value !== "string")
    unread(`${path} is ${show(value)}, not a text`);
  return value as string;
};

const finite = (value: unknown, path: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    unread(`${path} is ${show(value)}, not a number`);
  return value as number;
};

const count = (value: unknown, path: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    unread(`${path} is ${show(value)}, not a whole number of 0 or more`);
  return value as number;
};

const texts = (value: unknown, path: string): string[] =>
  list(value, path).map((item, i) => text(item, `${path}[${i}]`));

const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;

/** A `bigint` written as its decimal string */
const integer = (value: unknown, path: string): bigint => {
  if (typeof value !== "string" || !DECIMAL.test(value))
    unread(`${path} is ${show(value)}, not a decimal integer`);
  return BigInt(value as string);
};

/** Refuses a member that is not among those named */
const known = (json: Obj, members: readonly string[], path: string) => {
  for (const key of Object.keys(json))
    if (!members.includes(key))
      unread(
        `${path === "" ? "" : `${path}.`}${key}, a member this library does not know`,
      );
};

const optional = <T>(
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
              ([label, item]) => [
                label,
                metadatum(item, `${at}.metadata.${label}`),
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

const utxoValue = (value: unknown, path: string): unknown => {
  const json = object(value, path);
  const input = object(json.input, `${path}.input`);
  text(input.txHash, `${path}.input.txHash`);
  count(input.outputIndex, `${path}.input.outputIndex`);
  const output = object(json.output, `${path}.output`);
  text(output.address, `${path}.output.address`);
  list(output.amount, `${path}.output.amount`);
  return json;
};

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

const decodePart = (value: unknown, path: string): TxPart => {
  const json = object(value, path);
  const kind = json.kind;
  if (
    typeof kind !== "string" ||
    !Object.prototype.hasOwnProperty.call(PARTS, kind)
  )
    unread(`${path}: the part kind ${show(kind)}`);
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
 * The parts back from their encoding, frozen as the part builders make them
 * @throws UnreadContent for a part kind this library does not know, naming it; for a member of
 *   a part it does not know; and for a value it cannot read where a `bigint` or a member it
 *   reads stands
 */
export const decodeParts = (json: readonly unknown[]): TxPart[] =>
  list(json, "parts").map((item, i) => decodePart(item, `parts[${i}]`));

/* ---------------------------------------------------------------------------------------------
 * Reading: the record
 * ------------------------------------------------------------------------------------------- */

const ATTEMPT_STATUSES: ReadonlySet<string> = new Set<TxAttemptStatus>([
  "built",
  "signed",
  "sent",
  "rejected",
  "included",
  "expired",
  "failed",
  "orphaned",
  "final",
]);

const PLAN_STATUSES: ReadonlySet<string> = new Set<TxPlanStatus>([
  ...(ATTEMPT_STATUSES as ReadonlySet<TxAttemptStatus>),
  "draft",
  "abandoned",
]);

const ANCHOR_KINDS: ReadonlySet<string> = new Set<AnchorKind>([
  "payer",
  "parts",
  "parent",
]);

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

const exUnits = (value: unknown, path: string) => {
  const json = object(value, path);
  return {
    ...json,
    mem: integer(json.mem, `${path}.mem`),
    steps: integer(json.steps, `${path}.steps`),
  };
};

const utxos = (value: unknown, path: string) =>
  list(value, path).map((item, i) => utxoValue(item, `${path}[${i}]`));

const decodeBuilt = (value: unknown, path: string): BuiltTx => {
  const json = object(value, path);
  known(json, BUILT_MEMBERS, path);
  const signers = object(json.signers, `${path}.signers`);
  const built: Obj = {
    tx: text(json.tx, `${path}.tx`),
    txHash: text(json.txHash, `${path}.txHash`),
    prototype: transaction(json.prototype, `${path}.prototype`),
    fee: integer(json.fee, `${path}.fee`),
    exUnits: exUnits(json.exUnits, `${path}.exUnits`),
    redeemers: list(json.redeemers, `${path}.redeemers`).map((item, i) => {
      const at = `${path}.redeemers[${i}]`;
      const redeemer = object(item, at);
      return {
        ...redeemer,
        exUnits: exUnits(redeemer.exUnits, `${at}.exUnits`),
        ...optional(redeemer, "part", decodePart, at),
      };
    }),
    inputs: utxos(json.inputs, `${path}.inputs`),
    selectedInputs: utxos(json.selectedInputs, `${path}.selectedInputs`),
    referenceInputs: utxos(json.referenceInputs, `${path}.referenceInputs`),
    outputs: utxos(json.outputs, `${path}.outputs`),
    change: utxos(json.change, `${path}.change`),
    signers: {
      ...signers,
      keyHashes: texts(signers.keyHashes, `${path}.signers.keyHashes`),
      keys: list(signers.keys, `${path}.signers.keys`),
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
    network: object(json.network, `${path}.network`),
    warnings: list(json.warnings, `${path}.warnings`),
    parts: list(json.parts, `${path}.parts`).map((item, i) =>
      decodePart(item, `${path}.parts[${i}]`),
    ),
  };
  if (json.collateral !== undefined) {
    const at = `${path}.collateral`;
    const collateral = object(json.collateral, at);
    built.collateral = {
      ...collateral,
      inputs: utxos(collateral.inputs, `${at}.inputs`),
      total: integer(collateral.total, `${at}.total`),
      ...(collateral.return !== undefined && {
        return: outputValue(collateral.return, `${at}.return`),
      }),
    };
  }
  if (json.validity !== undefined)
    built.validity = object(json.validity, `${path}.validity`);
  return built as unknown as BuiltTx;
};

const outRefValue = (value: unknown, path: string) => {
  const json = object(value, path);
  known(json, ["txHash", "outputIndex"], path);
  return {
    txHash: text(json.txHash, `${path}.txHash`),
    outputIndex: count(json.outputIndex, `${path}.outputIndex`),
  };
};

const ATTEMPT_MEMBERS = [
  "txHash",
  "reportedHash",
  "status",
  "until",
  "sends",
  "seen",
  "parents",
  "built",
  "anchors",
  "dependsOn",
  "keys",
  "witnesses",
  "refused",
  "plutus",
] as const;

const decodeAttempt = (value: unknown, path: string): AttemptRecord => {
  const json = object(value, path);
  known(json, ATTEMPT_MEMBERS, path);
  const status = json.status;
  if (typeof status !== "string" || !ATTEMPT_STATUSES.has(status))
    unread(`${path}.status: the attempt status ${show(status)}`);
  const attempt: Obj = {
    txHash: text(json.txHash, `${path}.txHash`),
    ...optional(json, "reportedHash", text, path),
    status,
    until: finite(json.until, `${path}.until`),
    sends: count(json.sends, `${path}.sends`),
  };
  if (json.seen !== undefined) {
    const at = `${path}.seen`;
    const seen = object(json.seen, at);
    known(seen, ["slot", "block"], at);
    attempt.seen = {
      slot: finite(seen.slot, `${at}.slot`),
      ...optional(seen, "block", text, at),
    };
  }
  if (json.parents !== undefined)
    attempt.parents = list(json.parents, `${path}.parents`).map((item, i) => {
      const at = `${path}.parents[${i}]`;
      const parent = object(item, at);
      known(parent, ["txHash", "until", "planId"], at);
      return {
        txHash: text(parent.txHash, `${at}.txHash`),
        until: finite(parent.until, `${at}.until`),
        ...optional(parent, "planId", text, at),
      };
    });
  if (json.built !== undefined)
    attempt.built = decodeBuilt(json.built, `${path}.built`);
  attempt.anchors = list(json.anchors, `${path}.anchors`).map((item, i) =>
    outRefValue(item, `${path}.anchors[${i}]`),
  );
  if (json.dependsOn !== undefined)
    attempt.dependsOn = texts(json.dependsOn, `${path}.dependsOn`);
  attempt.keys = texts(json.keys, `${path}.keys`);
  attempt.witnesses = list(json.witnesses, `${path}.witnesses`).map(
    (item, i) => {
      const at = `${path}.witnesses[${i}]`;
      const witness = object(item, at);
      known(witness, ["keyHash", "witness"], at);
      return {
        keyHash: text(witness.keyHash, `${at}.keyHash`),
        witness: text(witness.witness, `${at}.witness`),
      };
    },
  );
  attempt.refused = count(json.refused, `${path}.refused`);
  if (json.plutus !== undefined) {
    if (json.plutus !== true)
      unread(`${path}.plutus is ${show(json.plutus)}, not true`);
    attempt.plutus = true;
  }
  return attempt as unknown as AttemptRecord;
};

const decodeAnchor = (value: unknown, path: string): PlanRecord["anchor"] => {
  const json = object(value, path);
  known(json, ["anchors"], path);
  return {
    anchors: list(json.anchors, `${path}.anchors`).map((item, i) => {
      const at = `${path}.anchors[${i}]`;
      const entry = object(item, at);
      known(entry, ["utxo", "kind", "attempts"], at);
      const kind = entry.kind;
      if (typeof kind !== "string" || !ANCHOR_KINDS.has(kind))
        unread(`${at}.kind: the anchor kind ${show(kind)}`);
      return {
        utxo: utxoValue(entry.utxo, `${at}.utxo`) as never,
        kind: kind as AnchorKind,
        attempts: texts(entry.attempts, `${at}.attempts`),
      };
    }),
  };
};

const OPTIONS: Readonly<
  Record<string, (value: unknown, path: string) => unknown>
> = {
  sendAllTo: text,
  knownUtxos: utxos,
  fee: integer,
  registeredPools: texts,
  extraKeyWitnesses: count,
  changeAddress: text,
};

const decodeOptions = (value: unknown, path: string): Obj => {
  const json = object(value, path);
  known(json, Object.keys(OPTIONS), path);
  const options: Obj = {};
  for (const [key, read] of Object.entries(OPTIONS))
    if (json[key] !== undefined)
      options[key] = read(json[key], `${path}.${key}`);
  return options;
};

const decodeNetwork = (value: unknown, path: string) => {
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

const decodeDeadlines = (value: unknown, path: string) => {
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

const RECORD_MEMBERS = [
  "kind",
  "version",
  "id",
  "rev",
  "status",
  "closing",
  "network",
  "deadlines",
  "attempts",
  "anchor",
  "parts",
  "options",
] as const;

/** The content of a record whose kind and version are read already */
const decodeRecord = (json: Obj, version: number, id?: string): PlanRecord => {
  known(json, RECORD_MEMBERS, "");
  if (json.id !== undefined) {
    const own = text(json.id, "id");
    if (own === "") unread("id is an empty text");
  }
  if (id !== undefined && json.id !== id)
    unread(`id is ${show(json.id)}, where ${show(id)} was asked for`);
  const status = json.status;
  if (typeof status !== "string" || !PLAN_STATUSES.has(status))
    unread(`status: the plan status ${show(status)}`);
  const rev = count(json.rev, "rev");
  if (json.closing !== undefined && json.closing !== true)
    unread(`closing is ${show(json.closing)}, not true`);
  const record: PlanRecord = {
    kind: "TxPlan",
    version,
    ...(json.id !== undefined && { id: json.id as string }),
    rev,
    status: status as TxPlanStatus,
    ...(json.closing === true && { closing: true as const }),
    network: decodeNetwork(json.network, "network"),
    deadlines: decodeDeadlines(json.deadlines, "deadlines"),
    attempts: list(json.attempts, "attempts").map((item, i) =>
      decodeAttempt(item, `attempts[${i}]`),
    ),
    anchor: decodeAnchor(json.anchor, "anchor"),
    parts: decodeParts(list(json.parts, "parts")),
    options: decodeOptions(json.options, "options"),
  };

  // What the state machine relies on
  if (planStatus(record) !== record.status)
    unread(
      `status: the plan status ${show(status)}, which its attempts do not give`,
    );
  if ((rev === 0) !== (record.status === "draft"))
    unread(
      `rev is ${rev}: a draft has revision 0, and every other record one above it`,
    );
  if (record.status === "abandoned" && record.closing !== true)
    unread("closing is missing on an abandoned plan");
  const current = record.attempts[record.attempts.length - 1];
  if (
    current !== undefined &&
    current.built === undefined &&
    record.status !== "final" &&
    record.status !== "abandoned"
  )
    unread(
      `attempts[${record.attempts.length - 1}].built is missing on the current attempt of a plan that is not final or abandoned`,
    );
  return record;
};

/** How a record is read: the steps from each older version, and the version to reach */
export type RecordFormat = {
  readonly migrations: ReadonlyMap<number, Migration>;
  readonly version: number;
};

const notRead = (what: string, id: string | undefined) =>
  new TxPlanError(
    "INVALID_STATE",
    `the plan's record was not read: ${what}. It is left as it is, and nothing was built, signed, written or sent: use a version of this library that reads it. ${NOT_UNPAID}`,
    {
      details: { reason: "recordVersion" },
      ...(id !== undefined && { planId: id }),
    },
  );

/**
 * Reads a record in the given format: checks its kind and version, takes it through the steps
 * from its version to the format's, then checks and decodes its content.
 * @throws TxPlanError INVALID_STATE (`recordVersion`), naming what was not read
 */
export const readPlanWith = (
  json: unknown,
  format: RecordFormat,
  id?: string,
): PlanRecord => {
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
    const version = record.version;
    if (!Number.isSafeInteger(version) || (version as number) < 1)
      unread(
        `the version ${show(version)}: a record version is a whole number from 1`,
      );
    if ((version as number) > format.version)
      unread(
        `the version ${version as number}, newer than ${format.version}, the version this library reads`,
      );
    let current: Obj = record;
    for (let v = version as number; v < format.version; v++) {
      const step = format.migrations.get(v);
      if (step === undefined)
        unread(
          `the version ${v}: this library has no step from it to ${v + 1}`,
        );
      current = { ...step!(current), version: v + 1 };
    }
    return decodeRecord(current, format.version, id);
  } catch (error) {
    if (error instanceof UnreadContent) throw notRead(error.message, planId);
    throw error;
  }
};

/**
 * Reads a record from a store or from `toJSON()`: checks its kind and version, migrates an older
 * version, checks its content and decodes it. `id`, when given, is the id the record must have.
 * @throws TxPlanError INVALID_STATE (`recordVersion`, not retryable) for a newer version,
 *   another kind, or content this library does not know or cannot read, naming it
 */
export const readPlan = (json: unknown, id?: string): PlanRecord =>
  readPlanWith(json, { migrations, version: PLAN_RECORD_VERSION }, id);
