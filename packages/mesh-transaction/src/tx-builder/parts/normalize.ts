import type {
  Budget,
  BuilderData,
  ExUnitsPrototype,
  LanguageVersion,
  NativeScript,
  NativeScriptPrototype,
  PlutusDataVariant,
  UTxO,
} from "@meshsdk/common";
import {
  Address,
  CredentialType,
  NativeScript as CstNativeScript,
  Script as CstScript,
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
  PartRedeemer,
  PlutusDataInput,
  PlutusScriptInput,
  PlutusScriptSource,
  RedeemerInput,
  TxPart,
} from "./types";
import { TxPartError } from "./errors";

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

const isUtxo = (ref: InputRef): ref is UTxO => "input" in ref;

/** Whether a value is an object, not null */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Whether a value is a whole number of 0 or more: a safe integer, decimal digits or a bigint */
export const isWholeNumber = (value: unknown): boolean =>
  (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
  (typeof value === "string" && /^\d+$/.test(value)) ||
  (typeof value === "bigint" && value >= 0n);

/**
 * A unit of a UTxO's amount: `lovelace` (or the empty unit, read as lovelace across the
 * repository), or a policy id and an asset name of up to 32 bytes
 */
const UTXO_UNIT = /^(?:lovelace|[0-9a-fA-F]{56}(?:[0-9a-fA-F]{2}){0,32})?$/;

/**
 * What is wrong with the amount of a UTxO, or undefined when it is a list of assets, each with
 * a unit (`lovelace` or a policy id and asset name in hex) and a quantity in decimal digits
 */
export const utxoAmountProblem = (amount: unknown): string | undefined => {
  if (!Array.isArray(amount)) return "the amount is not a list of assets";
  for (const asset of amount as unknown[]) {
    if (!isObject(asset))
      return `an asset of the amount is not an object { unit, quantity }: ${String(asset)}`;
    const { unit, quantity } = asset;
    if (typeof unit !== "string" || !UTXO_UNIT.test(unit))
      return `invalid unit ${String(unit)}: expected lovelace or a policy id and an asset name in hex`;
    if (typeof quantity !== "string" || !/^\d+$/.test(quantity))
      return `invalid quantity ${String(quantity)} of ${unit}: expected decimal digits`;
  }
  return undefined;
};

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
      `invalid label ${String(label)}: expected a string`,
    );
  return { part, label: label as string | undefined };
};

/**
 * Normalises an input reference. A full UTxO is copied, so later changes to the caller's
 * object cannot reach the part, and the copy holds its address in canonical text and an amount
 * checked as a payer's UTxO is. The copy has `input` and `output` only: what else the object
 * carries (the `label` and `change` of a built output) is not the UTxO's.
 */
export const toResolvableInput = (ctx: PartContext, ref: InputRef) => {
  if (!isObject(ref) || (isUtxo(ref) && !isObject(ref.input)))
    fail(
      ctx,
      "INVALID_OUT_REF",
      `expected an out ref { txHash, outputIndex } or a UTxO { input, output }; got ${ref === null ? "null" : typeof ref}`,
    );
  const { txHash, outputIndex } = isUtxo(ref) ? ref.input : ref;
  const transactionId =
    typeof txHash === "string" ? txHash.toLowerCase() : txHash;
  if (typeof transactionId !== "string" || !isHash32(transactionId))
    fail(ctx, "INVALID_OUT_REF", `invalid transaction hash ${txHash}`);
  if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex > 0xffff)
    fail(ctx, "INVALID_OUT_REF", `invalid output index ${outputIndex}`);

  const input = { transaction_id: transactionId, index: outputIndex };
  if (!isUtxo(ref)) return { input };
  const outRef = `${transactionId}#${outputIndex}`;
  if (!isObject(ref.output))
    fail(
      ctx,
      "INVALID_VALUE",
      `the UTxO ${outRef} has no output { address, amount }`,
    );
  const amountProblem = utxoAmountProblem(ref.output.amount);
  if (amountProblem !== undefined)
    fail(ctx, "INVALID_VALUE", `the UTxO ${outRef}: ${amountProblem}`);
  let output: UTxO["output"];
  try {
    output = structuredClone(ref.output);
  } catch (error) {
    return fail(
      ctx,
      "INVALID_VALUE",
      `the UTxO ${outRef} cannot be copied: ${errorText(error)}`,
      error,
    );
  }
  const utxo: UTxO = { input: { txHash: transactionId, outputIndex }, output };
  utxo.output.address = addressText(parseAddress(ctx, utxo.output.address));
  return { input, utxo };
};

export const outRefString = (input: {
  transaction_id: string;
  index: number;
}) => `${input.transaction_id}#${input.index}`;

export const parseAddress = (ctx: PartContext, address: string): Address => {
  const parsed =
    typeof address === "string" ? Address.fromString(address) : null;
  if (!parsed)
    return fail(ctx, "INVALID_ADDRESS", `invalid address ${address}`);
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
    fail(ctx, "INVALID_DATA", `invalid execution units ${String(budget)}`);
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isSafeInteger(value) || value < 0)
      fail(ctx, "INVALID_DATA", `invalid execution units ${name}: ${value}`);
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
      `invalid redeemer ${String(redeemer)}: expected { data, exUnits }`,
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
 * part stores for it
 */
export const toRewardAddress = (
  ctx: PartContext,
  rewardAddress: string,
): {
  address: string;
  credential: { type: "key" | "script"; hash: string };
} => {
  const parsed =
    typeof rewardAddress === "string"
      ? Address.fromString(rewardAddress)
      : null;
  const credential = parsed?.asReward()?.getPaymentCredential();
  if (!parsed || !credential)
    return fail(
      ctx,
      "INVALID_ADDRESS",
      `invalid reward address ${rewardAddress}`,
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

/** A script held in a reference output, read from the output's script reference */
const readScriptReference = (
  ctx: PartContext,
  utxo: UTxO,
): { script: CstScript; scriptHash: string; scriptSize: number } => {
  const { scriptRef } = utxo.output;
  const outRef = `${utxo.input.txHash}#${utxo.input.outputIndex}`;
  if (!scriptRef)
    return fail(ctx, "INVALID_SCRIPT", `${outRef} holds no reference script`);
  try {
    const script = CstScript.fromCbor(HexBlob(scriptRef));
    return {
      script,
      scriptHash: script.hash().toString(),
      scriptSize: scriptRef.length / 2,
    };
  } catch (error) {
    return fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRef} holds an invalid reference script: ${errorText(error)}`,
      error,
    );
  }
};

const plutusVersionOf = (script: CstScript): LanguageVersion | undefined => {
  if (script.asPlutusV1()) return "V1";
  if (script.asPlutusV2()) return "V2";
  if (script.asPlutusV3()) return "V3";
  return undefined;
};

/** Checks a value given for a script in a reference output against the output itself */
const agree = <T>(
  ctx: PartContext,
  name: string,
  given: T | undefined,
  actual: T,
) => {
  if (given !== undefined && given !== actual)
    fail(
      ctx,
      "INVALID_SCRIPT",
      `${name} ${given} does not match the reference script's ${actual}`,
    );
};

const checkScriptHash = (ctx: PartContext, scriptHash?: string) => {
  if (scriptHash !== undefined && !isHash28(scriptHash))
    fail(ctx, "INVALID_SCRIPT", `invalid script hash ${scriptHash}`);
};

const checkScriptSize = (ctx: PartContext, scriptSize?: number) => {
  if (
    scriptSize !== undefined &&
    (!Number.isSafeInteger(scriptSize) || scriptSize <= 0)
  )
    fail(ctx, "INVALID_SCRIPT", `invalid script size ${scriptSize}`);
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
      `invalid Plutus script ${String(script)}: expected { code, version } or { reference }`,
    );
  if ("code" in script) {
    const code = toPlutusScriptCode(
      ctx,
      script.code,
      `invalid Plutus ${script.version} script`,
    );
    try {
      const cbor = deserializePlutusScript(code, script.version)
        .toCbor()
        .toString();
      const scriptHash = toScriptRef({ code: cbor, version: script.version })
        .hash()
        .toString();
      return { type: "attached", version: script.version, cbor, scriptHash };
    } catch (error) {
      return fail(
        ctx,
        "INVALID_SCRIPT",
        `invalid Plutus ${script.version} script: ${errorText(error)}`,
        error,
      );
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
  const heldVersion = plutusVersionOf(held.script);
  if (!heldVersion)
    fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRefString(resolvable.input)} holds a native script, not a Plutus one`,
    );
  agree(ctx, "version", version, heldVersion!);
  agree(ctx, "script hash", scriptHash, held.scriptHash);
  agree(ctx, "script size", scriptSize, held.scriptSize);
  return {
    type: "reference",
    ...resolvable,
    version: heldVersion,
    scriptHash: held.scriptHash,
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
      `invalid native script ${String(script)}: expected a script, its CBOR or { reference }`,
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
          `unknown script type ${String((script as { type?: unknown }).type)}`,
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
  if (!held.script.asNative())
    fail(
      ctx,
      "INVALID_SCRIPT",
      `${outRefString(resolvable.input)} holds a Plutus script, not a native one`,
    );
  agree(ctx, "script hash", scriptHash, held.scriptHash);
  agree(ctx, "script size", scriptSize, held.scriptSize);
  return {
    type: "reference",
    ...resolvable,
    scriptHash: held.scriptHash,
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
