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
  HexBlob,
  nativeScriptPrototypeFromCardano,
  nativeScriptPrototypeToCardano,
  normalizePlutusScript,
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
import { firstItemEnd } from "../tx-scan";
import { TxPartError } from "./errors";
import { givenShape, shownValue } from "./shape";
import {
  addressOf,
  heldNativeScript,
  readUtxo,
  scriptSize,
  unknownNativeScript,
  unreadNativeWords,
  unreadScriptWords,
  UtxoError,
  utxoKey,
} from "./utxo";

export { textShape } from "./shape";

/** Hex of whole bytes, one or more */
const HEX_BYTES = /^(?:[0-9a-f]{2})+$/i;

/** Hex of an odd number of digits: read as bytes, its last digit would be dropped */
const ODD_HEX = /^[0-9a-f](?:[0-9a-f]{2})*$/i;

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
 * Plutus data or a native script given as CBOR in hex of whole bytes is one well-formed item
 * with nothing after it: its bytes are kept as given, and they must read as one item in the
 * transaction
 * @throws Error for anything else, quoting none of the bytes
 */
const checkOneItem = (content: string) => {
  const bytes = Buffer.from(content, "hex");
  const end = firstItemEnd(bytes);
  if (end === undefined)
    throw new Error(
      "the CBOR given is not one well-formed item: it is not well formed, or ends before its item does",
    );
  const after = bytes.length - end;
  if (after !== 0)
    throw new Error(
      `the CBOR given is not one item: ${after === 1 ? "1 byte follows" : `${after} bytes follow`} its first item`,
    );
};

/**
 * Plutus data or a native script given as CBOR in hex: hex of an odd number of digits is refused,
 * never read with its last digit dropped, and hex of whole bytes is one item (`checkOneItem`);
 * any other text is left to the decoder, which refuses it
 * @throws Error for hex of an odd number of digits, or bytes that are not one item, quoting none
 *   of it
 */
const checkGivenCbor = (content: string) => {
  if (ODD_HEX.test(content))
    throw new Error(
      "the CBOR given is not hex of whole bytes: it has an odd number of digits",
    );
  if (HEX_BYTES.test(content)) checkOneItem(content);
};

/**
 * Plutus data in its CBOR form, with its hash; throws the converter's own error for anything
 * that is not Plutus data. Plutus data given as CBOR is kept byte for byte, and is one
 * well-formed item with nothing after it, in hex of whole bytes (`checkGivenCbor`)
 */
export const encodePlutusData = (
  data: PlutusDataInput,
): { data: PlutusDataVariant & { type: "CBOR" }; hash: string } => {
  if (
    isBuilderData(data) &&
    data.type === "CBOR" &&
    typeof data.content === "string"
  )
    checkGivenCbor(data.content);
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
 * cannot be used as a script, and the refusal says why, in the words of `NATIVE_SCRIPT_UNREAD`
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
      unknownNativeScript(script)
        ? `${outRef} holds a native script whose keys this library does not read: ${unreadScriptWords(script)}`
        : `${outRef} holds a reference script this library cannot read: ${unreadScriptWords(script)}`,
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
    let structure: NativeScriptPrototype;
    try {
      if (typeof script === "string") {
        // Its bytes are kept as given (below): bytes after its item would reach the witness set
        checkGivenCbor(script);
        nativeScript = CstNativeScript.fromCbor(HexBlob(script));
        // Read from its bytes, its slots exact; the decoder also reads a guard, of a later era
        structure = structureOf(nativeScript);
        checkLedgerReads(structure);
        // Given as CBOR its structure is not written as, the script keeps the bytes given: its
        // hash is theirs
        const given = nativeScript.toCbor().toString().toLowerCase();
        if (nativeScriptPrototypeToCardano(structure).toCbor() !== given)
          structure = { ...structure, cbor: given };
      } else ({ structure, native: nativeScript } = nativeScriptOf(script));
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
      script: structure,
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
  // The keys it names are priced and asked for: a script whose keys are not read cannot run. A
  // native script is described only where it is read, so it is one nested too deep
  if (!heldNativeScript(held.script))
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRefString(resolvable.input)} holds a native script whose keys this library does not read: ${unreadNativeWords("depth")}`,
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

/** The last slot: the ledger reads a slot as an unsigned integer of 64 bits */
const MAX_SLOT = 2n ** 64n - 1n;
/** The largest `n` of an n-of-k script, an integer of 64 bits as the ledger reads it */
const MAX_INT64 = 2n ** 63n - 1n;

/** A whole number given in a native script: decimal digits, a safe integer or a bigint, exact */
const wholeNumberOf = (value: unknown, what: string): bigint => {
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return BigInt(value);
  if (typeof value === "bigint") return value;
  throw new Error(`${what} is not a whole number`);
};

/** The scripts of an `all`, `any` or `atLeast` script, each as a prototype */
const scriptsOf = (scripts: unknown): NativeScriptPrototype[] => {
  if (!Array.isArray(scripts))
    throw new Error(
      "the scripts of an all, any or atLeast script are not a list",
    );
  return scripts.map(nativeScriptToPrototype);
};

/**
 * The structure of a native script given as an object, checked: a key hash of 28 bytes in hex, a
 * slot and the `required` of `atLeast` whole numbers, taken exactly (a slot in decimal digits
 * may be past 2^53), the slot written in its decimal digits
 * @throws Error for anything else, quoting none of it
 */
export const nativeScriptToPrototype = (
  script: NativeScript,
): NativeScriptPrototype => {
  if (!isObject(script))
    throw new Error(`invalid native script ${shownValue(script)}`);
  switch (script.type) {
    case "sig":
      if (
        typeof script.keyHash !== "string" ||
        !/^[0-9a-f]{56}$/i.test(script.keyHash)
      )
        throw new Error(
          "the key hash of a sig script is not a 28-byte hash in hex",
        );
      return { type: "SCRIPT_PUBKEY", value: { addr_keyhash: script.keyHash } };
    case "all":
      return {
        type: "SCRIPT_ALL",
        value: { native_scripts: scriptsOf(script.scripts) },
      };
    case "any":
      return {
        type: "SCRIPT_ANY",
        value: { native_scripts: scriptsOf(script.scripts) },
      };
    case "atLeast":
      return {
        type: "SCRIPT_N_OF_K",
        value: {
          n: wholeNumberOf(
            script.required,
            "the required count of an atLeast script",
          ),
          native_scripts: scriptsOf(script.scripts),
        },
      };
    case "after":
    case "before":
      return {
        type: script.type === "after" ? "TIMELOCK_START" : "TIMELOCK_EXPIRY",
        value: {
          slot: wholeNumberOf(
            script.slot,
            "the slot of a time lock",
          ).toString(),
        },
      };
    default:
      throw new Error(
        `unknown script type ${shownValue((script as { type?: unknown }).type)}`,
      );
  }
};

/**
 * The structure of a native script the decoder read, its slots and `n` as its bytes write them
 * @throws Error for a script that holds a kind the ledger of this era does not read, quoting none
 *   of it
 */
const structureOf = (script: CstNativeScript): NativeScriptPrototype => {
  try {
    return nativeScriptPrototypeFromCardano(script);
  } catch {
    throw new Error(
      "it holds a kind of native script the ledger does not read in this era",
    );
  }
};

/**
 * Checks that the ledger reads a native script's structure: each slot from 0 to 2^64 - 1, an
 * unsigned integer of 64 bits, and the `n` of each n-of-k script an integer of 64 bits. A node
 * does not decode a transaction that holds any other
 * @throws Error for one it does not read, quoting none of it
 */
const checkLedgerReads = (script: NativeScriptPrototype): void => {
  switch (script.type) {
    case "TIMELOCK_START":
    case "TIMELOCK_EXPIRY": {
      const slot = BigInt(script.value.slot);
      if (slot < 0n)
        throw new Error(
          "the slot of a time lock is negative: the ledger reads a slot from 0 to 2^64 - 1",
        );
      if (slot > MAX_SLOT)
        throw new Error(
          "the slot of a time lock is past 2^64 - 1, the last slot the ledger reads",
        );
      return;
    }
    case "SCRIPT_N_OF_K": {
      const n = BigInt(script.value.n);
      if (n > MAX_INT64 || n < -1n - MAX_INT64)
        throw new Error(
          "the n of an atLeast script is not an integer of 64 bits, as the ledger reads it",
        );
      script.value.native_scripts.forEach(checkLedgerReads);
      return;
    }
    case "SCRIPT_ALL":
    case "SCRIPT_ANY":
      script.value.native_scripts.forEach(checkLedgerReads);
      return;
    default:
      return;
  }
};

/**
 * A native script given as an object: its structure (`nativeScriptToPrototype`), checked as the
 * ledger reads it, and the script written from that structure, its slots exact
 * @throws Error for one that is not a script the ledger reads, quoting none of it
 */
export const nativeScriptOf = (
  script: NativeScript,
): { structure: NativeScriptPrototype; native: CstNativeScript } => {
  const structure = nativeScriptToPrototype(script);
  checkLedgerReads(structure);
  return { structure, native: nativeScriptPrototypeToCardano(structure) };
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
