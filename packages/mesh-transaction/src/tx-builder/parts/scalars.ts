import type {
  MetadatumPrototype,
  NativeScript,
  PlutusScript,
} from "@meshsdk/common";
import { deserializePlutusScript } from "@meshsdk/core-cst";

import {
  errorText,
  fail,
  freeze,
  isHash28,
  labelOf,
  PartContext,
  toNativeScriptSource,
} from "./normalize";
import {
  AuxiliaryScriptPart,
  DonationPart,
  MetadataPart,
  MetadataValueInput,
  NativeScriptSource,
  NetworkIdPart,
  RequiredSignerPart,
  TreasuryValuePart,
  ValidityPart,
} from "./types";

/**
 * Require a key's signature. The key need not unlock anything; scripts of the transaction can
 * check that it signed.
 * @param params.keyHash Hash of the verification key, in hex
 * @param params.label Name echoed in errors about this part
 */
export const requiredSigner = (params: {
  keyHash: string;
  label?: string;
}): RequiredSignerPart => {
  const ctx: PartContext = { part: "requiredSigner", label: params.label };
  const keyHash =
    typeof params.keyHash === "string" ? params.keyHash.toLowerCase() : "";
  if (!isHash28(keyHash))
    fail(ctx, "INVALID_DATA", `invalid key hash ${params.keyHash}`);
  return freeze({ kind: "requiredSigner", keyHash, ...labelOf(params.label) });
};

const toSlot = (
  ctx: PartContext,
  name: string,
  slot: bigint | number | undefined,
): bigint | undefined => {
  if (slot === undefined) return undefined;
  if (
    (typeof slot !== "bigint" && !Number.isSafeInteger(slot)) ||
    slot < 0 ||
    BigInt(slot) >= 2n ** 64n
  )
    fail(ctx, "INVALID_DATA", `invalid ${name} slot ${slot}`);
  return BigInt(slot);
};

/**
 * Limit the slots the transaction is valid in. Either bound may be left open.
 * @param params.invalidBefore First slot the transaction is valid in
 * @param params.invalidHereafter First slot the transaction is no longer valid in
 * @param params.label Name echoed in errors about this part
 */
export const validity = (params: {
  invalidBefore?: bigint | number;
  invalidHereafter?: bigint | number;
  label?: string;
}): ValidityPart => {
  const ctx: PartContext = { part: "validity", label: params.label };
  const from = toSlot(ctx, "invalidBefore", params.invalidBefore);
  const to = toSlot(ctx, "invalidHereafter", params.invalidHereafter);
  if (from === undefined && to === undefined)
    fail(ctx, "INVALID_DATA", "neither bound is given");
  if (from !== undefined && to !== undefined && from >= to)
    fail(
      ctx,
      "INVALID_DATA",
      `invalidBefore ${from} is not before invalidHereafter ${to}`,
    );
  return freeze({
    kind: "validity",
    ...(from !== undefined && { invalidBefore: from.toString() }),
    ...(to !== undefined && { invalidHereafter: to.toString() }),
    ...labelOf(params.label),
  });
};

/** Text and byte strings in metadata are at most 64 bytes */
const MAX_METADATA_BYTES = 64;
/** Metadata integers range over what CBOR can encode: -2^64 to 2^64-1 */
const MAX_METADATA_INT = 2n ** 64n - 1n;
const MIN_METADATA_INT = -(2n ** 64n);

const toMetadatum = (
  ctx: PartContext,
  value: MetadataValueInput,
  path: string,
): MetadatumPrototype => {
  const invalid = (reason: string) =>
    fail(ctx, "INVALID_DATA", `metadata at ${path}: ${reason}`);
  if (typeof value === "bigint" || typeof value === "number") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      return invalid(`${value} is not a safe integer; pass a bigint`);
    const int = BigInt(value);
    if (int > MAX_METADATA_INT || int < MIN_METADATA_INT)
      return invalid(`${value} is out of range`);
    return { type: "INT", value: int };
  }
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).length > MAX_METADATA_BYTES)
      return invalid(`text longer than ${MAX_METADATA_BYTES} bytes`);
    return { type: "STRING", value };
  }
  if (value instanceof Uint8Array) {
    if (value.length > MAX_METADATA_BYTES)
      return invalid(`bytes longer than ${MAX_METADATA_BYTES}`);
    return { type: "BYTES", value: Array.from(value) };
  }
  if (Array.isArray(value))
    return {
      type: "LIST",
      value: value.map((item, i) => toMetadatum(ctx, item, `${path}[${i}]`)),
    };
  if (value instanceof Map)
    return {
      type: "MAP",
      value: Array.from(value, ([key, item]) => [
        toMetadatum(ctx, key, `${path} key`),
        toMetadatum(ctx, item, `${path}[${String(key)}]`),
      ]),
    };
  if (typeof value === "object" && value !== null)
    return {
      type: "MAP",
      value: Object.entries(value).map(([key, item]) => [
        toMetadatum(ctx, key, `${path} key`),
        toMetadatum(ctx, item, `${path}.${key}`),
      ]),
    };
  return invalid(`unsupported value ${String(value)}`);
};

/**
 * Add a metadata entry.
 * @param params.metadataLabel The entry's metadata label, e.g. `721n` for token metadata
 * @param params.value The entry: integers, strings (at most 64 bytes each), byte arrays, lists,
 *   and maps or plain objects
 * @param params.label Name echoed in errors about this part
 */
export const metadata = (params: {
  metadataLabel: bigint | number;
  value: MetadataValueInput;
  label?: string;
}): MetadataPart => {
  const ctx: PartContext = { part: "metadata", label: params.label };
  const { metadataLabel } = params;
  if (
    (typeof metadataLabel !== "bigint" &&
      !Number.isSafeInteger(metadataLabel)) ||
    metadataLabel < 0 ||
    BigInt(metadataLabel) > MAX_METADATA_INT
  )
    fail(ctx, "INVALID_DATA", `invalid metadata label ${metadataLabel}`);
  return freeze({
    kind: "metadata",
    metadataLabel: BigInt(metadataLabel).toString(),
    value: toMetadatum(ctx, params.value, String(metadataLabel)),
    ...labelOf(params.label),
  });
};

/**
 * Publish a script in the transaction's auxiliary data, alongside its metadata.
 * @param params.script A native script, or a Plutus script (`{ code, version }`)
 * @param params.label Name echoed in errors about this part
 */
export const auxiliaryScript = (params: {
  script: NativeScript | PlutusScript;
  label?: string;
}): AuxiliaryScriptPart => {
  const ctx: PartContext = { part: "auxiliaryScript", label: params.label };
  const { script } = params;
  if ("code" in script) {
    let cbor = "";
    try {
      cbor = deserializePlutusScript(script.code, script.version)
        .toCbor()
        .toString();
    } catch (error) {
      fail(
        ctx,
        "INVALID_SCRIPT",
        `invalid Plutus ${script.version} script: ${errorText(error)}`,
      );
    }
    return freeze({
      kind: "auxiliaryScript",
      script: { type: "plutus", version: script.version, cbor },
      ...labelOf(params.label),
    });
  }
  // A script given as an object is always attached
  const source = toNativeScriptSource(ctx, script) as Extract<
    NativeScriptSource,
    { type: "attached" }
  >;
  return freeze({
    kind: "auxiliaryScript",
    script: { type: "native", script: source.script },
    ...labelOf(params.label),
  });
};

const toCoin = (
  ctx: PartContext,
  amount: bigint,
  { allowZero }: { allowZero: boolean },
): string => {
  if (typeof amount !== "bigint" || amount < (allowZero ? 0n : 1n))
    fail(ctx, "INVALID_VALUE", `invalid amount ${amount}`);
  return amount.toString();
};

/**
 * Donate lovelace to the treasury.
 * @param params.amount Lovelace donated; more than zero
 * @param params.label Name echoed in errors about this part
 */
export const donation = (params: {
  amount: bigint;
  label?: string;
}): DonationPart => {
  const ctx: PartContext = { part: "donation", label: params.label };
  return freeze({
    kind: "donation",
    amount: toCoin(ctx, params.amount, { allowZero: false }),
    ...labelOf(params.label),
  });
};

/**
 * State the current treasury value. The ledger rejects the transaction unless it matches.
 * @param params.amount The treasury value in lovelace
 * @param params.label Name echoed in errors about this part
 */
export const treasuryValue = (params: {
  amount: bigint;
  label?: string;
}): TreasuryValuePart => {
  const ctx: PartContext = { part: "treasuryValue", label: params.label };
  return freeze({
    kind: "treasuryValue",
    amount: toCoin(ctx, params.amount, { allowZero: true }),
    ...labelOf(params.label),
  });
};

/**
 * Pin the network the transaction is meant for; the ledger rejects it on any other.
 * @param params.network `"mainnet"`, or `"testnet"` for every test network
 * @param params.label Name echoed in errors about this part
 */
export const networkId = (params: {
  network: "mainnet" | "testnet";
  label?: string;
}): NetworkIdPart => {
  const ctx: PartContext = { part: "networkId", label: params.label };
  if (params.network !== "mainnet" && params.network !== "testnet")
    fail(ctx, "INVALID_DATA", `invalid network ${params.network}`);
  return freeze({
    kind: "networkId",
    networkId: { type: params.network === "mainnet" ? "MAINNET" : "TESTNET" },
    ...labelOf(params.label),
  });
};
