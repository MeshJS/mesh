import type {
  Budget,
  BuilderData,
  ExUnitsPrototype,
  NativeScript,
  NativeScriptPrototype,
  PlutusDataVariant,
} from "@meshsdk/common";
import {
  Address,
  CredentialType,
  NativeScript as CstNativeScript,
  deserializePlutusScript,
  fromBuilderToPlutusData,
  fromNativeScript,
  HexBlob,
  normalizePlutusScript,
  toNativeScript,
  toScriptRef,
} from "@meshsdk/core-cst";

import type { TxPartErrorCode } from "./errors";
import type {
  InputRef,
  NativeScriptInput,
  NativeScriptSource,
  OutputScript,
  OutRef,
  PartRedeemer,
  PlutusDataInput,
  PlutusScriptInput,
  PlutusScriptSource,
  RedeemerInput,
  StepChange,
  StepOutput,
  TxPart,
  Utxo,
} from "./types";
import type { UtxoProblem } from "./utxo";
import { TxPartError } from "./errors";
import { givenShape, shownValue } from "./shape";
import { addressOf, readUtxo, scriptSize, UtxoError, utxoKey } from "./utxo";

export { textShape } from "./shape";

/** Reports problems found while building one part */
export type PartContext = {
  readonly part: TxPart["kind"];
  readonly label?: string;
};

/** Throws a `TxPartError`; `cause` is the error the argument was rejected for, if caught */
export const fail = (
  ctx: PartContext,
  code: TxPartErrorCode,
  message: string,
  cause?: unknown,
): never => {
  throw new TxPartError(code, ctx.part, message, ctx.label, cause);
};

/** `{ label }` when a label is given, so parts carry no `undefined` fields */
export const labelOf = (label: string | undefined) =>
  label === undefined ? {} : { label };

/** Freezes a freshly built part, all the way down */
export const freeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      freeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

const HASH_32 = /^[0-9a-f]{64}$/;
const HASH_28 = /^[0-9a-f]{56}$/;
const HEX = /^(?:[0-9a-f]{2})*$/;
const HEX_ANY_CASE = /^(?:[0-9a-f]{2})*$/i;

export const isHash32 = (value: string) => HASH_32.test(value);
export const isHash28 = (value: string) => HASH_28.test(value);
export const isHex = (value: string) => HEX.test(value);

/** Whether a value is an object, not null */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Whether a value is a whole number of 0 or more: a safe integer, decimal digits or a bigint */
export const isWholeNumber = (value: unknown): boolean =>
  (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
  (typeof value === "string" && /^\d+$/.test(value)) ||
  (typeof value === "bigint" && value >= 0n);

/**
 * The context of a part builder's call, after checking its parameters: an object, with a label
 * that is a string when given
 */
export const partContext = (
  part: TxPart["kind"],
  params: unknown,
): PartContext => {
  if (!isObject(params))
    fail(
      { part },
      "INVALID_DATA",
      `expected an object of parameters; got ${params === null ? "null" : typeof params}`,
    );
  const { label } = params as { label?: unknown };
  if (label !== undefined && typeof label !== "string")
    fail(
      { part },
      "INVALID_DATA",
      `invalid label ${shownValue(label)}: expected a string`,
    );
  return { part, label: label as string | undefined };
};

/** The error code of a part for what is wrong with a UTxO it is given */
const UTXO_PROBLEM_CODE: Record<UtxoProblem, TxPartErrorCode> = {
  outRef: "INVALID_OUT_REF",
  address: "INVALID_ADDRESS",
  value: "INVALID_VALUE",
  datum: "INVALID_DATA",
  script: "INVALID_SCRIPT",
};

/**
 * Whether an input reference is the UTxO in full: its CBOR, a Mesh `UTxO`, or an object with
 * an `address` or a `value` beside its out ref
 */
const isFullUtxo = (ref: object | string) =>
  typeof ref === "string" ||
  "input" in ref ||
  "output" in ref ||
  "address" in ref ||
  "value" in ref;

/**
 * Normalises an input reference. A full UTxO, in any form the builder takes one, is checked
 * and copied into a `Utxo`, so later changes to the caller's object cannot reach the part; what
 * else the object carries (the `label` and `change` of a built output) is not the UTxO's.
 */
export const toResolvableInput = (
  ctx: PartContext,
  ref: InputRef,
): { input: { transaction_id: string; index: number }; utxo?: Utxo } => {
  if (typeof ref !== "string" && !isObject(ref))
    fail(
      ctx,
      "INVALID_OUT_REF",
      `expected an out ref { txHash, outputIndex } or a UTxO; got ${ref === null ? "null" : typeof ref}`,
    );
  if (!isFullUtxo(ref)) {
    const { txHash, outputIndex } = ref as OutRef;
    const transactionId =
      typeof txHash === "string" ? txHash.toLowerCase() : txHash;
    if (typeof transactionId !== "string" || !isHash32(transactionId))
      fail(
        ctx,
        "INVALID_OUT_REF",
        `invalid transaction hash: expected a 32-byte hash in hex; got ${shownValue(txHash)}`,
      );
    if (
      !Number.isInteger(outputIndex) ||
      outputIndex < 0 ||
      outputIndex > 0xffff
    )
      fail(
        ctx,
        "INVALID_OUT_REF",
        `invalid output index ${shownValue(outputIndex)}`,
      );
    return { input: { transaction_id: transactionId, index: outputIndex } };
  }
  let utxo: Utxo;
  try {
    utxo = readUtxo(ref);
  } catch (error) {
    if (!(error instanceof UtxoError)) throw error;
    return fail(ctx, UTXO_PROBLEM_CODE[error.kind], error.message, error);
  }
  return {
    input: { transaction_id: utxo.txHash, index: utxo.outputIndex },
    utxo,
  };
};

/**
 * Whether a value given where a part takes a UTxO is a link to an earlier step: an object with
 * a `step` member, which no form of a UTxO has
 */
export const isStepLink = (ref: unknown): boolean =>
  isObject(ref) && !Array.isArray(ref) && "step" in ref;

/**
 * Reads a link to an earlier step, `{ step, output }` or `{ step, change: true }`, into a copy
 * of its own. All the change is taken only where `change` allows it.
 */
export const toStepLink = (
  ctx: PartContext,
  ref: Record<string, unknown>,
  change: boolean,
): StepOutput | StepChange => {
  const expected =
    "a link { step, output } to an output of an earlier step" +
    (change ? ", or { step, change: true } to all its change" : "");
  const extra = Object.keys(ref).find(
    (key) => key !== "step" && key !== "output" && key !== "change",
  );
  if (extra !== undefined)
    fail(
      ctx,
      "INVALID_OUT_REF",
      `expected ${expected}; got one with a member ${extra}`,
    );
  const { step, output } = ref;
  if (typeof step !== "string" || step === "")
    fail(
      ctx,
      "INVALID_OUT_REF",
      `invalid step ${JSON.stringify(step) ?? String(step)}: expected the name of an earlier step`,
    );
  if ("change" in ref) {
    if (!change)
      fail(
        ctx,
        "INVALID_OUT_REF",
        `all the change of step "${step}" is taken by spend.pubKey only: link this part to one output, { step, output }`,
      );
    if (ref.change !== true || "output" in ref)
      fail(
        ctx,
        "INVALID_OUT_REF",
        `expected ${expected}; got change ${shownValue(ref.change)}${"output" in ref ? " with an output" : ""}`,
      );
    return { step: step as string, change: true };
  }
  if (!(
    typeof output === "string" ||
    (Number.isInteger(output) &&
      (output as number) >= 0 &&
      (output as number) <= 0xffff)
  ))
    fail(
      ctx,
      "INVALID_OUT_REF",
      `invalid output ${JSON.stringify(output) ?? String(output)} of step "${step}": expected the label of an output part, or the position of an output from 0`,
    );
  return { step: step as string, output: output as string | number };
};

export const outRefString = (input: {
  transaction_id: string;
  index: number;
}) => `${input.transaction_id}#${input.index}`;

/**
 * An address given to a part. A key may be given there by mistake, so a text that is no address
 * is told by its shape, never quoted
 */
export const parseAddress = (ctx: PartContext, address: string): Address => {
  const parsed = addressOf(address);
  if (!parsed)
    return fail(
      ctx,
      "INVALID_ADDRESS",
      `invalid address: expected an address in bech32, base58 or hex; got ${givenShape(address)}`,
    );
  return parsed;
};

/**
 * The text a part stores for an address, whatever text it was given in: bech32, or base58 for
 * a Byron address. The encoder reads only these, and one address then has one text.
 */
export const addressText = (address: Address): string =>
  address.asByron() ? address.toBase58() : address.toBech32();

/** The payment credential of an address; undefined for Byron addresses, which have none */
export const paymentCredential = (
  address: Address,
): { type: "key" | "script"; hash: string } | undefined => {
  const paymentPart = address.getProps().paymentPart;
  if (!paymentPart) return undefined;
  return {
    type: paymentPart.type === CredentialType.ScriptHash ? "script" : "key",
    hash: paymentPart.hash.toString(),
  };
};

const isBuilderData = (data: PlutusDataInput): data is BuilderData =>
  typeof data === "object" &&
  data !== null &&
  !Array.isArray(data) &&
  !(data instanceof Map) &&
  "content" in data &&
  (data.type === "Mesh" || data.type === "JSON" || data.type === "CBOR");

/**
 * Plutus data in its CBOR form, with its hash; throws the converter's own error for anything
 * that is not Plutus data
 */
export const encodePlutusData = (
  data: PlutusDataInput,
): { data: PlutusDataVariant & { type: "CBOR" }; hash: string } => {
  const plutusData = fromBuilderToPlutusData(
    isBuilderData(data) ? data : { type: "Mesh", content: data },
  );
  return {
    data: { type: "CBOR", hex: plutusData.toCbor().toString() },
    hash: plutusData.hash().toString(),
  };
};

/** Plutus data in its CBOR form, with its hash */
export const toPlutusData = (
  ctx: PartContext,
  data: PlutusDataInput,
): { data: PlutusDataVariant; hash: string } => {
  try {
    return encodePlutusData(data);
  } catch (error) {
    return fail(
      ctx,
      "INVALID_DATA",
      `invalid Plutus data: ${errorText(error)}`,
      error,
    );
  }
};

export const toExUnits = (
  ctx: PartContext,
  budget: Budget,
): ExUnitsPrototype => {
  if (!isObject(budget))
    fail(ctx, "INVALID_DATA", `invalid execution units ${shownValue(budget)}`);
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isSafeInteger(value) || value < 0)
      fail(
        ctx,
        "INVALID_DATA",
        `invalid execution units ${name}: ${shownValue(value)}`,
      );
  }
  return { mem: String(budget.mem), steps: String(budget.steps) };
};

/**
 * A redeemer as a part holds it: a value encoded and checked now; a function kept as it is, not
 * called, for assembly to call with the final transaction
 */
export const toRedeemer = (
  ctx: PartContext,
  redeemer: RedeemerInput,
): PartRedeemer => {
  if (!isObject(redeemer))
    fail(
      ctx,
      "INVALID_DATA",
      `invalid redeemer ${shownValue(redeemer)}: expected { data, exUnits }`,
    );
  const { data } = redeemer;
  return {
    data:
      typeof data === "function"
        ? { type: "deferred", build: data }
        : toPlutusData(ctx, data).data,
    ...(redeemer.exUnits && { exUnits: toExUnits(ctx, redeemer.exUnits) }),
  };
};

/**
 * A reward address given in bech32 or hex, with its stake credential; `address` is the text a
 * part stores for it. A text that is no reward address is told by its shape, never quoted
 */
export const toRewardAddress = (
  ctx: PartContext,
  rewardAddress: string,
): {
  address: string;
  credential: { type: "key" | "script"; hash: string };
} => {
  const parsed = addressOf(rewardAddress);
  const credential = parsed?.asReward()?.getPaymentCredential();
  if (!parsed || !credential)
    return fail(
      ctx,
      "INVALID_ADDRESS",
      `invalid reward address: expected a reward address in bech32 or hex; got ${givenShape(rewardAddress)}${parsed ? " that is not a reward address" : ""}`,
    );
  return {
    address: addressText(parsed),
    credential: {
      type: credential.type === CredentialType.ScriptHash ? "script" : "key",
      hash: credential.hash.toString(),
    },
  };
};

/** The stake credential of a reward address */
export const rewardCredential = (
  ctx: PartContext,
  rewardAddress: string,
): { type: "key" | "script"; hash: string } =>
  toRewardAddress(ctx, rewardAddress).credential;

/**
 * Checks that a credential is the one a witness can authorise: a key, or the script with the
 * given hash (when the hash is known).
 */
export const checkCredential = (
  ctx: PartContext,
  what: string,
  credential: { type: "key" | "script"; hash?: string },
  expected: { type: "key" } | { type: "script"; hash?: string },
) => {
  if (expected.type === "key" && credential.type === "script")
    fail(
      ctx,
      "WITNESS_MISMATCH",
      `${what} is locked by script ${credential.hash}, not by a key`,
    );
  if (expected.type === "script") {
    if (credential.type === "key")
      fail(ctx, "WITNESS_MISMATCH", `${what} is locked by a key, not a script`);
    if (expected.hash !== undefined && expected.hash !== credential.hash)
      fail(
        ctx,
        "WITNESS_MISMATCH",
        `${what} is locked by script ${credential.hash}, not by ${expected.hash}`,
      );
  }
};

/**
 * Fills in the hash of a script referenced by out ref alone from the credential it must match,
 * which is known from the address it witnesses.
 */
export const withKnownHash = <
  T extends PlutusScriptSource | NativeScriptSource,
>(
  source: T,
  credential: { type: "key" | "script"; hash?: string } | undefined,
): T =>
  source.scriptHash === undefined && credential?.type === "script"
    ? { ...source, scriptHash: credential.hash }
    : source;

/**
 * The script a reference output holds, as the UTxO describes it; one this library cannot read
 * cannot be used as a script
 */
const readScriptReference = (
  ctx: PartContext,
  utxo: Utxo,
): {
  script: Exclude<OutputScript, { type: "unknown" }>;
  scriptSize: number;
} => {
  const { script } = utxo;
  const outRef = utxoKey(utxo);
  if (!script)
    return fail(ctx, "INVALID_SCRIPT", `${outRef} holds no reference script`);
  if (script.type === "unknown")
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRef} holds a reference script this library cannot read`,
    );
  return { script, scriptSize: scriptSize(script) };
};

/** The Plutus versions a script is given in */
const PLUTUS_VERSIONS: readonly unknown[] = ["V1", "V2", "V3"];

/**
 * A Plutus version given, as an error names it: one of the versions as it is, anything else by
 * its shape, never the text
 */
const shownVersion = (version: unknown): string =>
  PLUTUS_VERSIONS.includes(version)
    ? String(version)
    : `${shownValue(version)}, not V1, V2 or V3`;

/** The start of an error about a Plutus script given in this version, the version shown */
export const invalidPlutusScript = (version: unknown): string =>
  PLUTUS_VERSIONS.includes(version)
    ? `invalid Plutus ${String(version)} script`
    : `invalid Plutus script of the version ${shownVersion(version)}`;

/**
 * Checks a value given for a script in a reference output against the output itself
 * @param shown How the error names the value given
 */
const agree = <T>(
  ctx: PartContext,
  name: string,
  given: T | undefined,
  actual: T,
  shown: (value: T) => string = String,
) => {
  if (given !== undefined && given !== actual)
    fail(
      ctx,
      "INVALID_SCRIPT",
      `${name} ${shown(given)} does not match the reference script's ${actual}`,
    );
};

const checkScriptHash = (ctx: PartContext, scriptHash?: string) => {
  if (scriptHash !== undefined && !isHash28(scriptHash))
    fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid script hash: expected a 28-byte script hash in hex; got ${shownValue(scriptHash)}`,
    );
};

const checkScriptSize = (ctx: PartContext, scriptSize?: number) => {
  if (
    scriptSize !== undefined &&
    (!Number.isSafeInteger(scriptSize) || scriptSize <= 0)
  )
    fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid script size ${shownValue(scriptSize)}`,
    );
};

/**
 * The code of an attached Plutus script in its double CBOR wrapping, the form the script's hash
 * is taken over. `code` may be the flat program or the program in any number of CBOR
 * byte-string wrappings, in hex of either case; anything else is INVALID_SCRIPT, reported as
 * `<what>: <reason>`.
 */
export const toPlutusScriptCode = (
  ctx: PartContext,
  code: string,
  what: string,
): string => {
  // The helper reads hex up to the first bad digit, so the part checks it first
  if (typeof code !== "string" || !HEX_ANY_CASE.test(code))
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `${what}: the code is not hex of whole bytes`,
    );
  try {
    return normalizePlutusScript(code, "DoubleCBOR");
  } catch (error) {
    return fail(ctx, "INVALID_SCRIPT", `${what}: ${errorText(error)}`, error);
  }
};

export const toPlutusScriptSource = (
  ctx: PartContext,
  script: PlutusScriptInput,
): PlutusScriptSource => {
  if (!isObject(script))
    fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid Plutus script ${shownValue(script)}: expected { code, version } or { reference }`,
    );
  if ("code" in script) {
    const what = invalidPlutusScript(script.version);
    const code = toPlutusScriptCode(ctx, script.code, what);
    try {
      const cbor = deserializePlutusScript(code, script.version)
        .toCbor()
        .toString();
      const scriptHash = toScriptRef({ code: cbor, version: script.version })
        .hash()
        .toString();
      return { type: "attached", version: script.version, cbor, scriptHash };
    } catch (error) {
      return fail(ctx, "INVALID_SCRIPT", `${what}: ${errorText(error)}`, error);
    }
  }

  const { reference, version, scriptHash, scriptSize } = script;
  checkScriptHash(ctx, scriptHash);
  checkScriptSize(ctx, scriptSize);
  const resolvable = toResolvableInput(ctx, reference);
  if (!resolvable.utxo)
    return {
      type: "reference",
      ...resolvable,
      version,
      scriptHash,
      scriptSize,
    };

  const held = readScriptReference(ctx, resolvable.utxo);
  if (held.script.type !== "plutus")
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRefString(resolvable.input)} holds a native script, not a Plutus one`,
    );
  agree(ctx, "version", version, held.script.version, shownVersion);
  agree(ctx, "script hash", scriptHash, held.script.hash);
  agree(ctx, "script size", scriptSize, held.scriptSize);
  return {
    type: "reference",
    ...resolvable,
    version: held.script.version,
    scriptHash: held.script.hash,
    scriptSize: held.scriptSize,
  };
};

export const toNativeScriptSource = (
  ctx: PartContext,
  script: NativeScriptInput,
): NativeScriptSource => {
  if (typeof script !== "string" && !isObject(script))
    fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid native script ${shownValue(script)}: expected a script, its CBOR or { reference }`,
    );
  if (typeof script === "string" || "type" in script) {
    let nativeScript: CstNativeScript;
    try {
      nativeScript =
        typeof script === "string"
          ? CstNativeScript.fromCbor(HexBlob(script))
          : toNativeScript(script);
      // A script of no known type converts to nothing
      if (!nativeScript)
        throw new Error(
          `unknown script type ${shownValue((script as { type?: unknown }).type)}`,
        );
    } catch (error) {
      return fail(
        ctx,
        "INVALID_SCRIPT",
        `invalid native script: ${errorText(error)}`,
        error,
      );
    }
    return {
      type: "attached",
      script: nativeScriptToPrototype(
        typeof script === "string"
          ? (fromNativeScript(nativeScript) as NativeScript)
          : script,
      ),
      cbor: nativeScript.toCbor().toString(),
      scriptHash: nativeScript.hash().toString(),
    };
  }

  const { reference, scriptHash, scriptSize } = script;
  checkScriptHash(ctx, scriptHash);
  checkScriptSize(ctx, scriptSize);
  const resolvable = toResolvableInput(ctx, reference);
  if (!resolvable.utxo)
    return { type: "reference", ...resolvable, scriptHash, scriptSize };

  const held = readScriptReference(ctx, resolvable.utxo);
  if (held.script.type !== "native")
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRefString(resolvable.input)} holds a Plutus script, not a native one`,
    );
  agree(ctx, "script hash", scriptHash, held.script.hash);
  agree(ctx, "script size", scriptSize, held.scriptSize);
  return {
    type: "reference",
    ...resolvable,
    scriptHash: held.script.hash,
    scriptSize: held.scriptSize,
  };
};

export const nativeScriptToPrototype = (
  script: NativeScript,
): NativeScriptPrototype => {
  switch (script.type) {
    case "sig":
      return { type: "SCRIPT_PUBKEY", value: { addr_keyhash: script.keyHash } };
    case "all":
      return {
        type: "SCRIPT_ALL",
        value: { native_scripts: script.scripts.map(nativeScriptToPrototype) },
      };
    case "any":
      return {
        type: "SCRIPT_ANY",
        value: { native_scripts: script.scripts.map(nativeScriptToPrototype) },
      };
    case "atLeast":
      return {
        type: "SCRIPT_N_OF_K",
        value: {
          n: BigInt(script.required),
          native_scripts: script.scripts.map(nativeScriptToPrototype),
        },
      };
    case "after":
      return { type: "TIMELOCK_START", value: { slot: script.slot } };
    case "before":
      return { type: "TIMELOCK_EXPIRY", value: { slot: script.slot } };
  }
};

/**
 * The text of a thrown value, for a message: an Error's message, a string as it is, a CIP-30
 * error (an object with a string `info`) by its info and its code, an object with a string
 * `message` by that message, and anything else as JSON, or as `String` when it has none
 */
export const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const { info, message, code } = error as Record<string, unknown>;
    const text =
      typeof info === "string"
        ? info
        : typeof message === "string"
          ? message
          : undefined;
    if (text !== undefined)
      return typeof code === "number" || typeof code === "string"
        ? `${text} (code ${code})`
        : text;
  }
  try {
    const json = JSON.stringify(error, (_, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    if (json !== undefined) return json;
  } catch {
    // A value JSON cannot write, such as one that holds itself
  }
  return String(error);
};
