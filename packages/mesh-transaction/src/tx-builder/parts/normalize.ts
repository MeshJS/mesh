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

/**
 * Normalises an input reference. A full UTxO is copied, so later changes to the caller's
 * object cannot reach the part, and the copy holds its address in canonical text. The copy has
 * `input` and `output` only: what else the object carries (the `label` and `change` of a built
 * output) is not the UTxO's.
 */
export const toResolvableInput = (ctx: PartContext, ref: InputRef) => {
  const { txHash, outputIndex } = isUtxo(ref) ? ref.input : ref;
  const transactionId =
    typeof txHash === "string" ? txHash.toLowerCase() : txHash;
  if (typeof transactionId !== "string" || !isHash32(transactionId))
    fail(ctx, "INVALID_OUT_REF", `invalid transaction hash ${txHash}`);
  if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex > 0xffff)
    fail(ctx, "INVALID_OUT_REF", `invalid output index ${outputIndex}`);

  const input = { transaction_id: transactionId, index: outputIndex };
  if (!isUtxo(ref)) return { input };
  const utxo: UTxO = {
    input: { txHash: transactionId, outputIndex },
    output: structuredClone(ref.output),
  };
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

/** Plutus data in its CBOR form, with its hash */
export const toPlutusData = (
  ctx: PartContext,
  data: PlutusDataInput,
): { data: PlutusDataVariant; hash: string } => {
  try {
    const plutusData = fromBuilderToPlutusData(
      isBuilderData(data) ? data : { type: "Mesh", content: data },
    );
    return {
      data: { type: "CBOR", hex: plutusData.toCbor().toString() },
      hash: plutusData.hash().toString(),
    };
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
  for (const [name, value] of Object.entries(budget)) {
    if (!Number.isSafeInteger(value) || value < 0)
      fail(ctx, "INVALID_DATA", `invalid execution units ${name}: ${value}`);
  }
  return { mem: String(budget.mem), steps: String(budget.steps) };
};

export const toRedeemer = (
  ctx: PartContext,
  redeemer: RedeemerInput,
): PartRedeemer => ({
  data: toPlutusData(ctx, redeemer.data).data,
  ...(redeemer.exUnits && { exUnits: toExUnits(ctx, redeemer.exUnits) }),
});

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
  if (typeof script === "string" || "type" in script) {
    let nativeScript: CstNativeScript;
    try {
      nativeScript =
        typeof script === "string"
          ? CstNativeScript.fromCbor(HexBlob(script))
          : toNativeScript(script);
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

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
