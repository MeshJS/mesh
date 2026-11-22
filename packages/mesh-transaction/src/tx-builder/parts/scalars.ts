import type {
  MetadatumPrototype,
  NativeScript,
  PlutusScript,
} from "@meshsdk/common";
import { deserializePlutusScript } from "@meshsdk/core-cst";

import {
  checkCredential,
  errorText,
  fail,
  freeze,
  invalidPlutusScript,
  isHash28,
  labelOf,
  parseAddress,
  partContext,
  PartContext,
  paymentCredential,
  toNativeScriptSource,
  toPlutusScriptCode,
} from "./normalize";
import { shownValue } from "./shape";
import {
  AuxiliaryScriptPart,
  DonationPart,
  GuardPart,
  MetadataPart,
  MetadataValueInput,
  NativeScriptSource,
  NetworkIdPart,
  PartParams,
  TreasuryValuePart,
  ValidityPart,
} from "./types";

/** What `guard.pubKey` takes: the key by its hash, or by an address whose payment key it is */
export type GuardPubKeyParams = PartParams &
  (
    | {
        /** Hash of the verification key, in hex */
        keyHash: string;
      }
    | {
        /**
         * A payment address whose payment key must sign, in bech32 or hex; its stake part is
         * not read
         */
        address: string;
      }
  );

/** The builders of guard parts, by the kind of the credential */
export interface GuardBuilders {
  /**
   * A required signer: a key whose signature the transaction needs, given as its hash or as an
   * address whose payment key it is; the build rejects a hash that is one of the transaction's
   * script hashes (INVALID_GUARD)
   * @throws TxPartError WITNESS_MISMATCH for a script address
   * @throws TxPartError INVALID_ADDRESS for a string that is no address, a reward address or a
   *   Byron address: neither has a payment key; name a stake key by `keyHash`
   * @throws TxPartError INVALID_DATA for a key hash that is not 28 bytes in hex, for `keyHash`
   *   and `address` given together and for neither
   */
  pubKey(params: GuardPubKeyParams): GuardPart;
}

/**
 * Guards of the transaction. Today one form: a key that must sign (Conway's required_signers;
 * scripts read it among the signatories)
 */
export const guard: GuardBuilders = {
  pubKey: (params: GuardPubKeyParams): GuardPart => {
    const ctx = partContext("guard", params);
    const { keyHash, address } = params as {
      keyHash?: unknown;
      address?: unknown;
    };
    if (keyHash !== undefined && address !== undefined)
      fail(ctx, "INVALID_DATA", "give either keyHash or address, not both");
    let value: string;
    if (address !== undefined) {
      const parsed = parseAddress(ctx, address as string);
      // Checked before the credential is read: the library reports a reward address's stake
      // credential as its payment part
      if (parsed.asReward() || parsed.asByron())
        fail(
          ctx,
          "INVALID_ADDRESS",
          `${String(address)} is a ${parsed.asReward() ? "reward" : "Byron"} address, which has no payment key; name a key by keyHash`,
        );
      const credential = paymentCredential(parsed)!;
      checkCredential(ctx, `address ${String(address)}`, credential, {
        type: "key",
      });
      value = credential.hash;
    } else if (keyHash !== undefined) {
      value = typeof keyHash === "string" ? keyHash.toLowerCase() : "";
      if (!isHash28(value))
        fail(
          ctx,
          "INVALID_DATA",
          `invalid key hash: expected a 28-byte key hash in hex; got ${shownValue(keyHash)}`,
        );
    } else return fail(ctx, "INVALID_DATA", "give keyHash or address");
    return freeze({
      kind: "guard",
      credential: { type: "KEY", value },
      witness: { type: "key" },
      ...labelOf(params.label),
    });
  },
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
    fail(ctx, "INVALID_DATA", `invalid ${name} slot ${shownValue(slot)}`);
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
    : shownValue(time);

/** What `validity` takes: each bound in either form, or left open */
export interface ValidityParams extends PartParams {
  /** Earliest time the transaction is valid at */
  from?: number | bigint | Date;
  /** Latest time the transaction is valid at */
  until?: number | bigint | Date;
  /** First slot the transaction is valid in */
  invalidBefore?: bigint | number;
  /** First slot the transaction is no longer valid in */
  invalidHereafter?: bigint | number;
}

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
 * @throws TxPartError INVALID_DATA for no bound given, a bound given both ways, a time that is
 *   not a whole number of milliseconds from 0 to 2^53 - 1, a slot that is not a whole number
 *   from 0 to 1e11 (above that it looks like POSIX milliseconds), or a lower bound not before
 *   the upper one
 * @example validity({ until: Date.now() + 10 * 60_000 })
 */
export const validity = (params: ValidityParams): ValidityPart => {
  const ctx = partContext("validity", params);
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

/** What `metadata` takes */
export interface MetadataParams extends PartParams {
  /** The entry's metadata label, e.g. `721n` for token metadata */
  metadataLabel: bigint | number;
  /**
   * The entry: integers, strings (at most 64 bytes each), byte arrays, lists, and maps or plain
   * objects
   */
  value: MetadataValueInput;
}

/** Add a metadata entry. */
export const metadata = (params: MetadataParams): MetadataPart => {
  const ctx = partContext("metadata", params);
  const { metadataLabel } = params;
  if (
    (typeof metadataLabel !== "bigint" &&
      !Number.isSafeInteger(metadataLabel)) ||
    metadataLabel < 0 ||
    BigInt(metadataLabel) > MAX_METADATA_INT
  )
    fail(
      ctx,
      "INVALID_DATA",
      `invalid metadata label ${shownValue(metadataLabel)}`,
    );
  return freeze({
    kind: "metadata",
    metadataLabel: BigInt(metadataLabel).toString(),
    value: toMetadatum(ctx, params.value, String(metadataLabel)),
    ...labelOf(params.label),
  });
};

/** The metadata label of CIP-20 transaction messages */
const MESSAGE_LABEL = 674;

/**
 * A text cut into lines of at most 64 bytes of UTF-8, only between code points: every line but
 * the last takes as many whole code points as fit. A text that fits is one line, an empty text
 * one empty line.
 */
const messageLines = (text: string): string[] => {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= MAX_METADATA_BYTES) return [text];
  const lines: string[] = [];
  let line = "";
  let bytes = 0;
  // A string iterates by code point, so a surrogate pair is never split
  for (const char of text) {
    const size = encoder.encode(char).length;
    if (bytes + size > MAX_METADATA_BYTES) {
      lines.push(line);
      line = "";
      bytes = 0;
    }
    line += char;
    bytes += size;
  }
  lines.push(line);
  return lines;
};

/** What `message` takes */
export interface MessageParams extends PartParams {
  /** The message: one text, or a list of texts, each cut on its own */
  text: string | readonly string[];
}

/**
 * A CIP-20 message (metadata label 674), each text split into lines of at most 64 bytes at
 * character boundaries. A character is a Unicode code point, so a cut never splits one; the
 * lines of a text put together give it back. Lines keep the order given, and nothing is trimmed.
 * An empty string is one empty line. A transaction holds one entry per metadata label: a second
 * message, or a `metadata` part with label 674, is DUPLICATE_PART when it is assembled.
 * @throws TxPartError INVALID_DATA for a `text` that is neither a string nor a list of strings,
 *   and for an empty list
 * @example message({ text: "Invoice #42 paid" })
 */
export const message = (params: MessageParams): MetadataPart => {
  const ctx = partContext("metadata", params);
  const { text } = params;
  const texts: unknown[] = typeof text === "string" ? [text] : [];
  if (Array.isArray(text)) {
    if (text.length === 0)
      fail(ctx, "INVALID_DATA", "a message needs at least one text");
    texts.push(...text);
  } else if (typeof text !== "string")
    fail(
      ctx,
      "INVALID_DATA",
      `invalid message text ${shownValue(text)}: expected a string or a list of strings`,
    );
  const lines = texts.flatMap((entry, i) => {
    if (typeof entry !== "string")
      return fail(
        ctx,
        "INVALID_DATA",
        `invalid message text at ${i}: ${shownValue(entry)} is not a string`,
      );
    return messageLines(entry);
  });
  return metadata({
    metadataLabel: MESSAGE_LABEL,
    value: { msg: lines },
    ...labelOf(params.label),
  });
};

/** What `auxiliaryScript` takes */
export interface AuxiliaryScriptParams extends PartParams {
  /**
   * A native script, or a Plutus script (`{ code, version }`, the code flat or in one or two
   * CBOR wrappings)
   */
  script: NativeScript | PlutusScript;
}

/** Publish a script in the transaction's auxiliary data, alongside its metadata. */
export const auxiliaryScript = (
  params: AuxiliaryScriptParams,
): AuxiliaryScriptPart => {
  const ctx = partContext("auxiliaryScript", params);
  const { script } = params;
  if (typeof script !== "object" || script === null)
    fail(
      ctx,
      "INVALID_SCRIPT",
      `invalid script ${shownValue(script)}: expected a native script or { code, version }`,
    );
  if ("code" in script) {
    const what = invalidPlutusScript(script.version);
    const code = toPlutusScriptCode(ctx, script.code, what);
    let cbor = "";
    try {
      cbor = deserializePlutusScript(code, script.version).toCbor().toString();
    } catch (error) {
      fail(ctx, "INVALID_SCRIPT", `${what}: ${errorText(error)}`, error);
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
    fail(ctx, "INVALID_VALUE", `invalid amount ${shownValue(amount)}`);
  return amount.toString();
};

/** What `donation` takes */
export interface DonationParams extends PartParams {
  /** Lovelace donated; more than zero */
  amount: bigint;
}

/** Donate lovelace to the treasury. */
export const donation = (params: DonationParams): DonationPart => {
  const ctx = partContext("donation", params);
  return freeze({
    kind: "donation",
    amount: toCoin(ctx, params.amount, { allowZero: false }),
    ...labelOf(params.label),
  });
};

/** What `treasuryValue` takes */
export interface TreasuryValueParams extends PartParams {
  /** The treasury value in lovelace */
  amount: bigint;
}

/** State the current treasury value. The ledger rejects the transaction unless it matches. */
export const treasuryValue = (
  params: TreasuryValueParams,
): TreasuryValuePart => {
  const ctx = partContext("treasuryValue", params);
  return freeze({
    kind: "treasuryValue",
    amount: toCoin(ctx, params.amount, { allowZero: true }),
    ...labelOf(params.label),
  });
};

/** What `networkId` takes */
export interface NetworkIdParams extends PartParams {
  /** `"mainnet"`, or `"testnet"` for every test network */
  network: "mainnet" | "testnet";
}

/** Pin the network the transaction is meant for; the ledger rejects it on any other. */
export const networkId = (params: NetworkIdParams): NetworkIdPart => {
  const ctx = partContext("networkId", params);
  if (params.network !== "mainnet" && params.network !== "testnet")
    fail(
      ctx,
      "INVALID_DATA",
      `invalid network: expected "mainnet" or "testnet"; got ${shownValue(params.network)}`,
    );
  return freeze({
    kind: "networkId",
    networkId: { type: params.network === "mainnet" ? "MAINNET" : "TESTNET" },
    ...labelOf(params.label),
  });
};
