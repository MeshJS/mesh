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
  toPlutusScriptCode,
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

/** Slots above this are taken for POSIX milliseconds given by mistake */
const MAX_SLOT = 100_000_000_000n;

const toSlot = (
  ctx: PartContext,
  name: string,
  slot: bigint | number | undefined,
  /** The argument that takes the same bound as a time */
  timeName: string,
): bigint | undefined => {
  if (slot === undefined) return undefined;
  if (
    (typeof slot !== "bigint" && !Number.isSafeInteger(slot)) ||
    slot < 0 ||
    BigInt(slot) >= 2n ** 64n
  )
    fail(ctx, "INVALID_DATA", `invalid ${name} slot ${slot}`);
  if (BigInt(slot) > MAX_SLOT)
    fail(
      ctx,
      "INVALID_DATA",
      `${name} ${slot} looks like POSIX milliseconds, not a slot; give a time as ${timeName}`,
    );
  return BigInt(slot);
};

/** POSIX milliseconds as a number: a safe integer, 0 or more, whichever form it is given in */
const toTime = (
  ctx: PartContext,
  name: string,
  time: number | bigint | Date | undefined,
): number | undefined => {
  if (time === undefined) return undefined;
  // A bigint beyond 2^53 - 1 converts to a number that is no safe integer: refused, not rounded
  const ms =
    time instanceof Date
      ? time.getTime()
      : typeof time === "bigint"
        ? Number(time)
        : time;
  if (typeof ms !== "number" || !Number.isSafeInteger(ms) || ms < 0)
    fail(
      ctx,
      "INVALID_DATA",
      `invalid ${name} ${describeTime(time)}: expected POSIX milliseconds, a whole number from 0 to ${Number.MAX_SAFE_INTEGER}, as a number, a bigint or a Date`,
    );
  return ms;
};

const describeTime = (time: unknown) =>
  time instanceof Date
    ? `Date ${Number.isNaN(time.getTime()) ? "(invalid)" : time.getTime()}`
    : typeof time === "string"
      ? JSON.stringify(time)
      : String(time);

/**
 * Limit when the transaction is valid, by POSIX time (`from`, `until`) or by slot
 * (`invalidBefore`, `invalidHereafter`); each bound in either form, or left open. Times are
 * POSIX milliseconds, given as a number, a bigint (for example a deadline decoded from a datum)
 * or a Date, and are converted to slots when the transaction is built, with the builder's
 * network. One rounding rule: the interval a script sees lies within [from, until]. `from`
 * becomes the first slot starting at or after it, so the script's lower bound is >= `from`; a
 * script that requires its lower bound to be strictly after a deadline gets
 * `from: deadline + 1`. `until` becomes the slot containing it, so the script's (open) upper
 * bound is <= `until`. For "valid from now" leave `from` out: `from: Date.now()` is valid from
 * the next slot only (VALID_FROM_FUTURE), and nodes check it against their lagging tip.
 * @param params.from Earliest time the transaction is valid at
 * @param params.until Latest time the transaction is valid at
 * @param params.invalidBefore First slot the transaction is valid in
 * @param params.invalidHereafter First slot the transaction is no longer valid in
 * @param params.label Name echoed in errors about this part
 * @throws TxPartError INVALID_DATA for no bound given, a bound given both ways, a time that is
 *   not a whole number of milliseconds from 0 to 2^53 - 1, a slot that is not a whole number
 *   from 0 to 1e11 (above that it looks like POSIX milliseconds), or a lower bound not before
 *   the upper one
 * @example validity({ until: Date.now() + 10 * 60_000 })
 */
export const validity = (params: {
  from?: number | bigint | Date;
  until?: number | bigint | Date;
  invalidBefore?: bigint | number;
  invalidHereafter?: bigint | number;
  label?: string;
}): ValidityPart => {
  const ctx: PartContext = { part: "validity", label: params.label };
  const before = toSlot(ctx, "invalidBefore", params.invalidBefore, "from");
  const hereafter = toSlot(
    ctx,
    "invalidHereafter",
    params.invalidHereafter,
    "until",
  );
  const from = toTime(ctx, "from", params.from);
  const until = toTime(ctx, "until", params.until);
  if (from !== undefined && before !== undefined)
    fail(
      ctx,
      "INVALID_DATA",
      "the lower bound is given both ways: give from or invalidBefore",
    );
  if (until !== undefined && hereafter !== undefined)
    fail(
      ctx,
      "INVALID_DATA",
      "the upper bound is given both ways: give until or invalidHereafter",
    );
  if (
    from === undefined &&
    until === undefined &&
    before === undefined &&
    hereafter === undefined
  )
    fail(ctx, "INVALID_DATA", "neither bound is given");
  if (before !== undefined && hereafter !== undefined && before >= hereafter)
    fail(
      ctx,
      "INVALID_DATA",
      `invalidBefore ${before} is not before invalidHereafter ${hereafter}`,
    );
  if (from !== undefined && until !== undefined && from >= until)
    fail(ctx, "INVALID_DATA", `from ${from} is not before until ${until}`);
  return freeze({
    kind: "validity",
    ...(before !== undefined && { invalidBefore: before.toString() }),
    ...(hereafter !== undefined && { invalidHereafter: hereafter.toString() }),
    ...(from !== undefined && { from }),
    ...(until !== undefined && { until }),
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
 * @param params.script A native script, or a Plutus script (`{ code, version }`, the code flat
 *   or in one or two CBOR wrappings)
 * @param params.label Name echoed in errors about this part
 */
export const auxiliaryScript = (params: {
  script: NativeScript | PlutusScript;
  label?: string;
}): AuxiliaryScriptPart => {
  const ctx: PartContext = { part: "auxiliaryScript", label: params.label };
  const { script } = params;
  if ("code" in script) {
    const code = toPlutusScriptCode(
      ctx,
      script.code,
      `invalid Plutus ${script.version} script`,
    );
    let cbor = "";
    try {
      cbor = deserializePlutusScript(code, script.version).toCbor().toString();
    } catch (error) {
      fail(
        ctx,
        "INVALID_SCRIPT",
        `invalid Plutus ${script.version} script: ${errorText(error)}`,
        error,
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
