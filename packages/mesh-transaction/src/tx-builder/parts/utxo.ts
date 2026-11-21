import type {
  LanguageVersion,
  NativeScriptPrototype,
  UTxO,
} from "@meshsdk/common";
import {
  Address,
  blake2b,
  CborReader,
  deserializeTxUnspentOutput,
  HexBlob,
  normalizePlutusScript,
  Serialization,
} from "@meshsdk/core-cst";

import type { UtxoBytes } from "../tx-scan";
import type {
  Assets,
  OutputDatum,
  OutputScript,
  OutRef,
  Utxo,
  UtxoInput,
} from "./types";
import { TxBuildError } from "../errors";
import {
  isOneCborItem,
  MAX_ADDRESS_BYTES,
  MAX_NATIVE_DEPTH,
  MAX_TX_BYTES,
  splitUtxoBytes,
} from "../tx-scan";
import { emptyValue, toAssets } from "../value";
import { givenShape, shownValue } from "./shape";

/*
 * The builder's UTxO form. Every UTxO the builder is given, as a `Utxo`, a Mesh `UTxO` or the
 * CBOR of a transaction unspent output, goes through `readUtxo`, which checks it and copies it
 * into a `Utxo` in normal form: hex in lower case, the address in bech32 (base58 for Byron),
 * lovelace first and tokens by unit, the reference script described with its hash, read from its
 * bytes and never decoded.
 */

/** What part of a UTxO a `UtxoError` is about, for a caller to map onto its own error code */
export type UtxoProblem = "outRef" | "address" | "value" | "datum" | "script";

/** A value that is not a UTxO, or not one a `Utxo` can hold; `kind` says which member is wrong */
export class UtxoError extends Error {
  readonly kind: UtxoProblem;

  constructor(kind: UtxoProblem, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "UtxoError";
    this.kind = kind;
  }
}

const problem = (kind: UtxoProblem, message: string, cause?: unknown) => {
  throw new UtxoError(kind, message, cause);
};

const HASH_32 = /^[0-9a-f]{64}$/i;
const HASH_28 = /^[0-9a-f]{56}$/i;
const HEX_BYTES = /^(?:[0-9a-f]{2})+$/i;
/** A token's unit: a policy id followed by an asset name of up to 32 bytes */
const TOKEN_UNIT = /^[0-9a-f]{56}(?:[0-9a-f]{2}){0,32}$/i;

/**
 * An asset unit for an error about its quantity: as given when it reads as one, else by its
 * shape, as it may be a key given by mistake
 */
const unitShown = (unit: unknown): string =>
  typeof unit === "string" &&
  (unit === "lovelace" || unit === "" || TOKEN_UNIT.test(unit))
    ? unit
    : shownValue(unit);
/** The largest quantity of lovelace or of a token an output can hold */
const MAX_QUANTITY = 2n ** 64n - 1n;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const reason = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** Whether a member of a Mesh output is set: neither missing, null nor empty */
const isSet = (value: unknown) =>
  value !== undefined && value !== null && value !== "";

/** Hex of whole bytes, in lower case */
const readHex = (
  kind: UtxoProblem,
  at: string,
  what: string,
  text: unknown,
): string => {
  if (typeof text !== "string" || !HEX_BYTES.test(text))
    return problem(kind, `${at}: ${what} is not hex of whole bytes`);
  return text.toLowerCase();
};

const readOutRefMembers = (txHash: unknown, outputIndex: unknown): OutRef => {
  if (typeof txHash !== "string" || !HASH_32.test(txHash))
    return problem(
      "outRef",
      `invalid transaction hash: expected a 32-byte hash in hex; got ${shownValue(txHash)}`,
    );
  if (
    typeof outputIndex !== "number" ||
    !Number.isInteger(outputIndex) ||
    outputIndex < 0 ||
    outputIndex > 0xffff
  )
    return problem("outRef", `invalid output index ${shownValue(outputIndex)}`);
  return { txHash: txHash.toLowerCase(), outputIndex };
};

const describe = (ref: OutRef) => `the UTxO ${utxoKey(ref)}`;

const addressText = (address: Address) =>
  address.asByron() ? address.toBase58() : address.toBech32();

/**
 * An address text read, or null for any other value. Bytes that are no address can still read as
 * one of a network that does not exist (the CBOR of a signing key file does): they are not taken
 * as an address
 */
export const addressOf = (text: unknown): Address | null => {
  if (typeof text !== "string") return null;
  let parsed: Address | null;
  try {
    parsed = Address.fromString(text);
  } catch {
    return null;
  }
  const networkId = parsed?.getNetworkId();
  return networkId === 0 || networkId === 1 ? parsed! : null;
};

const tooLong = (at: string) =>
  problem(
    "address",
    `${at}: its address is longer than the ${MAX_ADDRESS_BYTES} bytes this library reads`,
  );

/**
 * An address in bech32, base58 or hex, as canonical text; a reward address is refused, and so is
 * one longer than `MAX_ADDRESS_BYTES`, by the length of its text before it is parsed: base58
 * takes a time that grows with the square of it. A key may be given there by mistake, so a text
 * that is no address is told by its shape, never quoted, and the parser's error, which may quote
 * it, is not kept; nor is a reward address quoted, which the CBOR of a UTxO may hold
 */
const readAddress = (at: string, text: unknown): string => {
  if (typeof text === "string" && text.length > 2 * MAX_ADDRESS_BYTES)
    return tooLong(at);
  const parsed = addressOf(text);
  if (!parsed)
    return problem(
      "address",
      `${at}: invalid address: expected an address in bech32, base58 or hex; got ${givenShape(text)}`,
    );
  if (parsed.toBytes().length > 2 * MAX_ADDRESS_BYTES) return tooLong(at);
  // A reward address holds no UTxOs
  if (parsed.asReward())
    return problem(
      "address",
      `${at}: its address is a reward address, not a payment address`,
    );
  return addressText(parsed);
};

/**
 * Quantities by unit in normal form: lovelace first, tokens by unit, zero tokens left out. A
 * quantity, or the sum of a repeated unit, above what an output can hold is refused.
 */
const normalValue = (
  at: string,
  entries: Iterable<readonly [unknown, unknown]>,
): Assets => {
  const value = emptyValue();
  const tooLarge = (unit: string) =>
    problem(
      "value",
      `${at}: the quantity of ${unit} is above ${MAX_QUANTITY}, the most an output can hold`,
    );
  for (const [unit, quantity] of entries) {
    if (typeof quantity !== "bigint" || quantity < 0n)
      return problem(
        "value",
        `${at}: invalid quantity ${shownValue(quantity)} of ${unitShown(unit)}`,
      );
    if (unit === "lovelace") {
      value.coin += quantity;
      if (value.coin > MAX_QUANTITY) return tooLarge(unit);
      continue;
    }
    if (typeof unit !== "string" || !TOKEN_UNIT.test(unit))
      return problem(
        "value",
        `${at}: invalid unit ${shownValue(unit)}: expected lovelace or a policy id and an asset name in hex`,
      );
    const token = unit.toLowerCase();
    const sum = (value.assets.get(token) ?? 0n) + quantity;
    if (sum > MAX_QUANTITY) return tooLarge(token);
    value.assets.set(token, sum);
  }
  return toAssets(value);
};

/** Whether `hex` is exactly one well-formed CBOR item, with no bytes after it */
export const isOneItem = (hex: string) =>
  isOneCborItem(Buffer.from(hex, "hex"));

/**
 * The CBOR of an inline datum, kept byte for byte as the hex given: it is never decoded, and its
 * form is not judged
 */
const readInlineData = (at: string, what: string, content: unknown) =>
  readHex("datum", at, what, content);

/** The hash of a datum: blake2b-256 of its bytes as written */
export const dataHashOf = (data: string) =>
  blake2b.hash(HexBlob(data), 32).toString();

const inlineDatum = (content: string): OutputDatum => ({
  type: "inline",
  data: { type: "CBOR", content },
});

const hashDatum = (at: string, hash: unknown): OutputDatum => {
  if (typeof hash !== "string" || !HASH_32.test(hash))
    return problem(
      "datum",
      `${at}: invalid datum hash: expected a 32-byte hash in hex; got ${shownValue(hash)}`,
    );
  return { type: "hash", hash: hash.toLowerCase() };
};

const readDatum = (at: string, datum: unknown): OutputDatum => {
  if (!isObject(datum))
    return problem("datum", `${at}: invalid datum ${shownValue(datum)}`);
  if (datum.type === "hash") return hashDatum(at, datum.hash);
  if (datum.type === "inline") {
    const { data } = datum;
    if (!isObject(data) || data.type !== "CBOR")
      return problem(
        "datum",
        `${at}: an inline datum is { type: "inline", data: { type: "CBOR", content } }`,
      );
    return inlineDatum(readInlineData(at, "the datum", data.content));
  }
  return problem(
    "datum",
    `${at}: a datum of the type ${shownValue(datum.type)}: expected inline or hash`,
  );
};

/** Language tags of the CBOR of `[language, script]` */
const LANGUAGE_TAG: Record<LanguageVersion, string> = {
  V1: "01",
  V2: "02",
  V3: "03",
};

/** The Plutus versions by their tag in `[language, script]`; 0 is a native script */
const VERSION_OF_TAG: readonly (LanguageVersion | undefined)[] = [
  undefined,
  "V1",
  "V2",
  "V3",
];

const State = Serialization.CborReaderState;

const readScriptHash = (at: string, hash: unknown): string => {
  if (typeof hash !== "string" || !HASH_28.test(hash))
    return problem(
      "script",
      `${at}: invalid script hash: expected a 28-byte script hash in hex; got ${shownValue(hash)}`,
    );
  return hash.toLowerCase();
};

/** A reference script held as given, with the hash stated for it, if any: never decoded */
const unknownScript = (scriptRef: string, stated?: string): OutputScript => ({
  type: "unknown",
  scriptRef,
  ...(stated !== undefined && { hash: stated }),
});

/** The largest integer of 64 bits, the `n` of `[3, n, scripts]` as the ledger reads it */
const MAX_INT64 = 2n ** 63n - 1n;

/** A list of native scripts while it is read */
type ScriptList = {
  readonly scripts: NativeScriptPrototype[];
  /** Whether it stands for `[0, script]`, the list of the one script read */
  readonly top: boolean;
  readonly level: number;
};

/**
 * The native script `hex` holds whole, read as the ledger reads one, on the token reader of
 * `@cardano-sdk/core`, with no call of itself at any depth: `[0, key hash of 28 bytes]`,
 * `[1, scripts]`, `[2, scripts]`, `[3, n, scripts]`, `[4, slot]`, `[5, slot]`, each script and
 * each list of scripts of definite or indefinite length; its kind and a slot an unsigned integer
 * of up to 8 bytes, `n` an integer of 64 bits, in a form of any length. The script is in the form
 * `TxSigners.nativeScripts` lists. `depth` counts each array one level, `[0, script]` around it
 * the first, as the walk counts the CBOR of a reference script. The reader copies the bytes left
 * at each item, so the time grows with the square of the size, which the callers bound. Undefined
 * for anything else: what the ledger does not read, CBOR that is not well formed, and a key hash
 * written in pieces, which the ledger is not known to read
 */
const readNative = (
  hex: string,
): { script: NativeScriptPrototype; depth: number } | undefined => {
  try {
    const reader = new CborReader(HexBlob(hex));
    let depth = 1;
    const top: NativeScriptPrototype[] = [];
    // The lists being read, the innermost last
    const lists: ScriptList[] = [{ scripts: top, top: true, level: 1 }];
    /** Reads the end of the array of a script, which no other item may come before */
    const closed = () => {
      if (reader.peekState() !== State.EndArray) return false;
      reader.readEndArray();
      return true;
    };
    while (lists.length > 0) {
      const list = lists[lists.length - 1]!;
      if (list.top ? top.length === 1 : reader.peekState() === State.EndArray) {
        lists.pop();
        // The list, then the array of the script that holds it
        if (!list.top) {
          reader.readEndArray();
          if (!closed()) return undefined;
        }
        continue;
      }
      const level = list.level + 1;
      depth = Math.max(depth, level);
      if (reader.peekState() !== State.StartArray) return undefined;
      const length = reader.readStartArray();
      if (reader.peekState() !== State.UnsignedInteger) return undefined;
      const kind = reader.readUInt();
      if (kind > 5n) return undefined;
      if (length !== null && length !== (kind === 3n ? 3 : 2)) return undefined;
      if (kind === 0n) {
        if (reader.peekState() !== State.ByteString) return undefined;
        const key = reader.readByteString();
        if (key.length !== 28) return undefined;
        list.scripts.push({
          type: "SCRIPT_PUBKEY",
          value: { addr_keyhash: hexOf(key) },
        });
        if (!closed()) return undefined;
        continue;
      }
      if (kind >= 4n) {
        if (reader.peekState() !== State.UnsignedInteger) return undefined;
        const slot = reader.readUInt();
        list.scripts.push({
          type: kind === 4n ? "TIMELOCK_START" : "TIMELOCK_EXPIRY",
          value: { slot: slot.toString() },
        });
        if (!closed()) return undefined;
        continue;
      }
      let n = 0n;
      if (kind === 3n) {
        const state = reader.peekState();
        if (state === State.UnsignedInteger) n = reader.readUInt();
        else if (state === State.NegativeInteger)
          n = -1n - reader.readCborNegativeIntegerRepresentation();
        else return undefined;
        if (n > MAX_INT64 || n < -1n - MAX_INT64) return undefined;
      }
      if (reader.peekState() !== State.StartArray) return undefined;
      reader.readStartArray();
      const scripts: NativeScriptPrototype[] = [];
      list.scripts.push(
        kind === 1n
          ? { type: "SCRIPT_ALL", value: { native_scripts: scripts } }
          : kind === 2n
            ? { type: "SCRIPT_ANY", value: { native_scripts: scripts } }
            : { type: "SCRIPT_N_OF_K", value: { n, native_scripts: scripts } },
      );
      depth = Math.max(depth, level + 1);
      lists.push({ scripts, top: false, level: level + 1 });
    }
    return reader.getBytesRemaining() === 0
      ? { script: top[0]!, depth }
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The tag and the script of `[language, script]` in hex, read from its bytes, never with a value
 * decoder: an array of two items of definite length; a tag of 0 to 3 in one byte; for 0, one
 * native script of no more than `MAX_TX_BYTES`, read as the ledger reads one; for 1 to 3, one
 * byte string of definite length; nothing after. `script` is the item as written, `hashed` the
 * bytes its hash is taken over: the item of a native script, the content of the byte string of a
 * Plutus one. Undefined for anything else
 */
const readScriptRef = (
  given: string,
): { tag: number; script: string; hashed: string } | undefined => {
  try {
    const reader = new CborReader(HexBlob(given));
    const offset = () => given.length / 2 - reader.getBytesRemaining();
    if (
      reader.peekState() !== State.StartArray ||
      reader.readStartArray() !== 2
    )
      return undefined;
    if (reader.peekState() !== State.UnsignedInteger) return undefined;
    const before = offset();
    const tag = Number(reader.readUInt());
    if (offset() !== before + 1 || tag > 3) return undefined;
    const start = offset();
    const script = given.slice(2 * start);
    if (tag === 0) {
      // One in an output is part of a transaction, so none on chain is larger than one
      if (script.length / 2 > MAX_TX_BYTES) return undefined;
      if (!readNative(script)) return undefined;
      return { tag, script, hashed: script };
    }
    if (reader.peekState() !== State.ByteString) return undefined;
    const content = reader.readByteString();
    if (reader.getBytesRemaining() !== 0) return undefined;
    return { tag, script, hashed: hexOf(content) };
  } catch {
    return undefined;
  }
};

/**
 * A reference script as a `Utxo` holds it, from the CBOR of `[language, script]` in hex and
 * the hash stated for it, if any. It is never decoded: its language, its hash and its size are
 * read from its bytes, the hash as the ledger takes it, blake2b-224 of the tag and the script as
 * written: of a native script its CBOR as written, of a Plutus one the content of its byte
 * string, its head not hashed. A native script is read as the ledger reads one, in a time that
 * grows with its size, so a script of any depth is read at once. What this library cannot read
 * (another framing, a language it does not know, bytes after the script, CBOR that is not well
 * formed, a Plutus script in pieces, a native script larger than a transaction, `MAX_TX_BYTES`,
 * which no output on chain holds, an item after the language 0 that is not a native script as the
 * ledger reads one), and what it reads with a hash other than the stated one, is `unknown`: kept
 * as given, with the stated hash. So is a script whose bytes would not be written back as given,
 * since the described form must give the same bytes back.
 * @throws UtxoError (`script`) when `scriptRef` is not hex
 */
export const describeScriptRef = (
  scriptRef: string,
  statedHash?: string,
): OutputScript => {
  const given = readHex("script", "a reference script", "it", scriptRef);
  const stated = statedHash?.toLowerCase();
  const unknown = unknownScript(given, stated);
  const read = readScriptRef(given);
  if (read === undefined) return unknown;
  const hash = blake2b
    .hash(HexBlob(`0${read.tag}${read.hashed}`), 28)
    .toString();
  const version = VERSION_OF_TAG[read.tag];
  const described: OutputScript =
    version === undefined
      ? { type: "native", cbor: read.script, hash }
      : { type: "plutus", version, code: read.script, hash };
  if (stated !== undefined && stated !== described.hash) return unknown;
  if (scriptRefOf(described) !== given) return unknown;
  return described;
};

/** Reference scripts described, by the hash stated and the bytes */
type ScriptsRead = Map<string, OutputScript>;

/** `describeScriptRef`, taken from `scripts` where the same was described before */
const describedOnce = (
  scriptRef: string,
  statedHash: string | undefined,
  scripts: ScriptsRead | undefined,
): OutputScript => {
  if (scripts === undefined) return describeScriptRef(scriptRef, statedHash);
  const key = `${statedHash?.toLowerCase() ?? ""}:${scriptRef.toLowerCase()}`;
  const before = scripts.get(key);
  if (before) return { ...before };
  const described = describeScriptRef(scriptRef, statedHash);
  scripts.set(key, described);
  return { ...described };
};

/**
 * The native script a reference script holds, read from its bytes as `describeScriptRef` reads
 * it, in the form `TxSigners.nativeScripts` lists, with its hash: the keys it names are those a
 * native witness that runs it prices and asks for. Any number of keys is read. Undefined for what
 * is not a native script, and for one nested deeper than `MAX_NATIVE_DEPTH` as the walk counts
 * the levels of `[0, script]`: its form is a tree that this library and the application copy by
 * recursion
 */
export const heldNativeScript = (
  script: OutputScript | undefined,
): { script: NativeScriptPrototype; hash: string } | undefined => {
  if (script?.type !== "native") return undefined;
  const read = readNative(script.cbor);
  return read !== undefined && read.depth <= MAX_NATIVE_DEPTH
    ? { script: read.script, hash: script.hash }
    : undefined;
};

/** A reference script as the CBOR of `[language, script]` in hex, the form a Mesh `UTxO` holds */
export const scriptRefOf = (script: OutputScript): string => {
  switch (script.type) {
    case "unknown":
      return script.scriptRef;
    case "native":
      return `8200${script.cbor}`;
    case "plutus":
      return `82${LANGUAGE_TAG[script.version]}${script.code}`;
  }
};

/** Size in bytes of a reference script as the fee counts it: the CBOR of `[language, script]` */
export const scriptSize = (script: OutputScript): number =>
  scriptRefOf(script).length / 2;

/**
 * The size of a reference script as the ledger counts it toward `MAX_REF_SCRIPT_BYTES`, from the
 * CBOR of `[language, script]` in hex: of a native script the bytes after its language, of a
 * Plutus script the content of its byte string. Only the first items are read, with the token
 * reader, never the script. For what does not read so, bytes after the byte string of a Plutus
 * script among them, the size of the whole as given, no less than the ledger's
 */
export const countedScriptSize = (scriptRef: string): number => {
  const whole = scriptRef.length / 2;
  try {
    const reader = new CborReader(HexBlob(scriptRef));
    if (reader.readStartArray() !== 2) return whole;
    const language = reader.readUInt();
    if (language === 0n) return reader.getBytesRemaining();
    if (language > 3n || reader.peekState() !== State.ByteString) return whole;
    const content = reader.readByteString().length;
    return reader.getBytesRemaining() === 0 ? content : whole;
  } catch {
    return whole;
  }
};

/**
 * The out ref of a UTxO given in any form, as `txHash#index` in lower case, with the size of the
 * reference script it holds as `countedScriptSize` counts it, read without describing the script
 * and without reading the rest of the UTxO: for the bound on the reference scripts of a
 * transaction, before its UTxOs are read. Undefined for a UTxO without a script, and for what is
 * no UTxO this library reads, which its read refuses
 */
export const heldScriptSize = (
  given: unknown,
): { key: string; size: number } | undefined => {
  try {
    if (typeof given === "string") {
      if (given.length > 2 * MAX_TX_BYTES || !HEX_BYTES.test(given))
        return undefined;
      const split = splitUtxoBytes(Buffer.from(given, "hex"));
      if (!split?.outRef || !split.scriptRef || split.otherKey)
        return undefined;
      const { txHash, outputIndex } = split.outRef;
      return {
        key: `${txHash.toLowerCase()}#${outputIndex}`,
        size: countedScriptSize(hexOf(split.scriptRef)),
      };
    }
    if (!isObject(given)) return undefined;
    if (isObject(given.input) && isObject(given.output)) {
      const { scriptRef } = given.output;
      const { txHash, outputIndex } = given.input;
      if (typeof scriptRef !== "string" || !HEX_BYTES.test(scriptRef))
        return undefined;
      if (typeof txHash !== "string") return undefined;
      return {
        key: `${txHash.toLowerCase()}#${String(outputIndex)}`,
        size: countedScriptSize(scriptRef),
      };
    }
    const { script, txHash, outputIndex } = given;
    if (!isObject(script) || typeof txHash !== "string") return undefined;
    const key = `${txHash.toLowerCase()}#${String(outputIndex)}`;
    const text = (value: unknown) =>
      typeof value === "string" && HEX_BYTES.test(value) ? value : undefined;
    if (script.type === "native") {
      const cbor = text(script.cbor);
      return cbor === undefined ? undefined : { key, size: cbor.length / 2 };
    }
    if (script.type === "plutus") {
      const code = text(script.code);
      return code === undefined
        ? undefined
        : { key, size: countedScriptSize(`8201${code}`) };
    }
    const scriptRef = text(script.scriptRef);
    return scriptRef === undefined
      ? undefined
      : { key, size: countedScriptSize(scriptRef) };
  } catch {
    return undefined;
  }
};

/** The content of one CBOR byte string that is the whole of `hex`; undefined for anything else */
const byteStringContent = (hex: string): string | undefined => {
  try {
    const reader = new CborReader(HexBlob(hex));
    const content = reader.readByteString();
    return reader.getBytesRemaining() === 0
      ? Buffer.from(content).toString("hex")
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The code of a Plutus script in its double CBOR wrapping, as parts wrap it. Code already
 * wrapped twice is kept byte for byte, since the hash is taken over the bytes inside the outer
 * wrapping; code that is not a program this library knows is kept as given.
 */
const plutusCode = (at: string, code: unknown): string => {
  const given = readHex("script", at, "the code of the script", code);
  let flat: string;
  try {
    flat = normalizePlutusScript(given, "PurePlutusScriptBytes");
  } catch {
    return given;
  }
  const inner = byteStringContent(given);
  if (inner !== undefined && byteStringContent(inner) === flat) return given;
  return normalizePlutusScript(given, "DoubleCBOR");
};

/** A reference script given in the builder's form, read again from its bytes */
const readScript = (
  at: string,
  script: unknown,
  scripts?: ScriptsRead,
): OutputScript => {
  if (!isObject(script))
    return problem("script", `${at}: invalid script ${shownValue(script)}`);
  const stated =
    script.hash === undefined ? undefined : readScriptHash(at, script.hash);
  if (script.type === "unknown")
    return describedOnce(
      readHex("script", at, "the reference script", script.scriptRef),
      stated,
      scripts,
    );
  let scriptRef: string;
  if (script.type === "plutus") {
    const version = script.version as LanguageVersion;
    if (
      typeof version !== "string" ||
      !Object.prototype.hasOwnProperty.call(LANGUAGE_TAG, version)
    )
      return problem(
        "script",
        `${at}: unknown Plutus version ${shownValue(script.version)}: expected V1, V2 or V3`,
      );
    scriptRef = `82${LANGUAGE_TAG[version]}${plutusCode(at, script.code)}`;
  } else if (script.type === "native") {
    const cbor = readHex("script", at, "the native script", script.cbor);
    scriptRef = `8200${cbor}`;
  } else
    return problem(
      "script",
      `${at}: a script of the type ${shownValue(script.type)}: expected plutus, native or unknown`,
    );
  const described = describedOnce(scriptRef, undefined, scripts);
  if (described.type === "unknown")
    return problem("script", `${at}: the ${script.type} script cannot be read`);
  if (stated !== undefined && stated !== described.hash)
    return problem(
      "script",
      `${at}: script hash ${stated} is not the script's ${described.hash}`,
    );
  return described;
};

const withDatum = (datum: OutputDatum | undefined) =>
  datum === undefined ? {} : { datum };

const withScript = (script: OutputScript | undefined) =>
  script === undefined ? {} : { script };

/**
 * A UTxO from the CBOR of a transaction unspent output. Its inline datum and its reference script
 * are found by the token reader and kept as the bytes hold them; the decoder reads the rest with
 * stand-ins in their place, and the script is described as `describeScriptRef` describes one. A
 * UTxO of more than `MAX_TX_BYTES` is refused before it is read, and one whose out ref is of
 * another form than every writer's at its head (`outRefAtHead`); an output with a key other than
 * 0 to 3, which the ledger takes in no output, before the decoder runs, its out ref named where
 * the reader finds it
 */
const fromCbor = (cbor: string, scripts?: ScriptsRead): Utxo => {
  // Its output is part of a transaction: one longer than a transaction is refused before it is
  // read, as the token reader takes a time that grows with the square of its pieces
  if (cbor.length > 2 * MAX_TX_BYTES)
    return problem(
      "outRef",
      `not the CBOR of a transaction unspent output: it is more than the ${MAX_TX_BYTES} bytes of the protocol's maximum transaction size, of which its output is a part`,
    );
  // Its out ref is read at its head first: one written in pieces is refused before they are read
  if (HEX_BYTES.test(cbor)) outRefAtHead(cbor);
  let split: UtxoBytes | undefined;
  try {
    if (!HEX_BYTES.test(cbor)) throw new Error("the text is not hex");
    split = splitUtxoBytes(Buffer.from(cbor, "hex"));
    if (!split) throw new Error("it is not well-formed CBOR");
  } catch (error) {
    return problem(
      "outRef",
      `not the CBOR of a transaction unspent output: ${reason(error)}`,
      error,
    );
  }
  const { standIn, inlineDatum, scriptRef, outRef, otherKey } = split;
  // The ledger takes no output with such a key, and the decoder passes over its value: refused
  // before the decoder runs
  if (otherKey) {
    const named =
      outRef !== undefined &&
      HASH_32.test(outRef.txHash) &&
      outRef.outputIndex <= 0xffffn
        ? `${describe({ txHash: outRef.txHash, outputIndex: Number(outRef.outputIndex) })} is `
        : "";
    return problem(
      "outRef",
      `${named}not the CBOR of a transaction unspent output: its output has a key other than 0, 1, 2 and 3`,
    );
  }
  let unspent: ReturnType<typeof deserializeTxUnspentOutput>;
  try {
    unspent = deserializeTxUnspentOutput(hexOf(standIn));
  } catch (error) {
    return problem(
      "outRef",
      `not the CBOR of a transaction unspent output: ${reason(error)}`,
      error,
    );
  }
  return fromOutput(
    readOutRefMembers(
      unspent.input().transactionId().toString(),
      Number(unspent.input().index()),
    ),
    unspent.output(),
    {
      ...(inlineDatum && { datum: hexOf(inlineDatum) }),
      ...(scriptRef && { script: hexOf(scriptRef) }),
    },
    scripts,
  );
};

/**
 * A UTxO from its out ref and its output as decoded: what the output holds, byte for byte
 * @param held The CBOR of the inline datum and of the reference script, where the output was
 *   decoded with stand-ins in their place
 */
const fromOutput = (
  ref: OutRef,
  output: Serialization.TransactionOutput,
  held: { readonly datum?: string; readonly script?: string } = {},
  scripts?: ScriptsRead,
): Utxo => {
  const at = describe(ref);
  // Bounded before its text is written: base58 takes a time that grows with the square of it
  if (output.address().toBytes().length > 2 * MAX_ADDRESS_BYTES)
    return tooLong(at);
  const amount = output.amount();
  const datum = output.datum();
  const inline = held.datum ?? datum?.asInlineData()?.toCbor().toString();
  const dataHash = datum?.asDataHash()?.toString();
  const scriptRef = held.script ?? output.scriptRef()?.toCbor().toString();
  return {
    ...ref,
    address: readAddress(at, addressText(output.address())),
    value: normalValue(at, [
      ["lovelace", amount.coin()],
      ...(amount.multiasset() ?? new Map<string, bigint>()),
    ]),
    ...withDatum(
      inline !== undefined
        ? inlineDatum(readInlineData(at, "its inline datum", inline))
        : dataHash !== undefined
          ? hashDatum(at, dataHash)
          : undefined,
    ),
    ...withScript(
      scriptRef === undefined
        ? undefined
        : describedOnce(scriptRef, undefined, scripts),
    ),
  };
};

/** A quantity of a Mesh `amount`: decimal digits */
const meshQuantity = (at: string, unit: unknown, quantity: unknown) => {
  if (typeof quantity !== "string" || !/^\d+$/.test(quantity))
    return problem(
      "value",
      `${at}: invalid quantity ${shownValue(quantity)} of ${unitShown(unit)}: expected decimal digits`,
    );
  return BigInt(quantity);
};

const fromMesh = (
  given: Record<string, unknown>,
  scripts?: ScriptsRead,
): Utxo => {
  const { input, output } = given;
  if (!isObject(input))
    return problem("outRef", "a Mesh UTxO is an object { input, output }");
  const ref = readOutRefMembers(input.txHash, input.outputIndex);
  const at = describe(ref);
  if (!isObject(output))
    return problem("value", `${at} has no output { address, amount }`);
  const { address, amount, dataHash, plutusData, scriptRef, scriptHash } =
    output;
  if (!Array.isArray(amount))
    return problem("value", `${at}: the amount is not a list of assets`);
  // Array.from visits the holes of a sparse list, so a hole is refused as any bad asset is
  const entries = Array.from(amount as unknown[], (asset) => {
    if (!isObject(asset))
      return problem(
        "value",
        `${at}: an asset of the amount is not an object { unit, quantity }: ${shownValue(asset)}`,
      );
    // The empty unit is read as lovelace, as across the repository
    const unit = asset.unit === "" ? "lovelace" : asset.unit;
    return [unit, meshQuantity(at, asset.unit, asset.quantity)] as const;
  });

  let datum: OutputDatum | undefined;
  if (isSet(plutusData)) {
    const content = readInlineData(at, "its plutusData", plutusData);
    // A wrong datum would reach the evaluator, and a script judged on it can cost collateral
    if (
      isSet(dataHash) &&
      (typeof dataHash !== "string" ||
        dataHash.toLowerCase() !== dataHashOf(content))
    )
      return problem(
        "datum",
        `${at}: its dataHash, ${shownValue(dataHash)}, is not the hash of its plutusData`,
      );
    datum = inlineDatum(content);
  } else if (isSet(dataHash)) datum = hashDatum(at, dataHash);

  const stated = isSet(scriptHash) ? readScriptHash(at, scriptHash) : undefined;
  let script: OutputScript | undefined;
  if (isSet(scriptRef))
    script = describedOnce(
      readHex("script", at, "its scriptRef", scriptRef),
      stated,
      scripts,
    );
  // Without its bytes, a reference script cannot be priced
  else if (stated !== undefined)
    return problem(
      "script",
      `${at}: it states a reference script by its hash alone (scriptHash without scriptRef)`,
    );

  return {
    ...ref,
    address: readAddress(at, address),
    value: normalValue(at, entries),
    ...withDatum(datum),
    ...withScript(script),
  };
};

const fromOwn = (
  given: Record<string, unknown>,
  scripts?: ScriptsRead,
): Utxo => {
  const ref = readOutRefMembers(given.txHash, given.outputIndex);
  const at = describe(ref);
  const address = readAddress(at, given.address);
  const { value } = given;
  if (!isObject(value) || Array.isArray(value))
    return problem(
      "value",
      `${at}: its value is not an object of quantities by unit`,
    );
  // The members are read once, for the check and the sum alike. A member the reading would not
  // see (inherited, from a class, not enumerable, a symbol) is refused, not dropped
  const entries = Object.entries(value);
  const proto: unknown = Object.getPrototypeOf(value);
  if (
    (proto !== null && Object.getPrototypeOf(proto) !== null) ||
    Reflect.ownKeys(value).length !== entries.length
  )
    return problem(
      "value",
      `${at}: its value is not a plain object of quantities by unit`,
    );
  const lovelace = entries.find(([unit]) => unit === "lovelace")?.[1];
  if (typeof lovelace !== "bigint")
    return problem(
      "value",
      `${at}: its value has no lovelace as a bigint: ${shownValue(lovelace)}`,
    );
  return {
    ...ref,
    address,
    value: normalValue(at, entries),
    ...withDatum(
      given.datum === undefined ? undefined : readDatum(at, given.datum),
    ),
    ...withScript(
      given.script === undefined
        ? undefined
        : readScript(at, given.script, scripts),
    ),
  };
};

type Form = "cbor" | "mesh" | "own";

/**
 * The form a UTxO is given in: a string is CBOR, an object with `input` or `output` a Mesh
 * `UTxO`, an object with `txHash` a `Utxo`. An object with members of both is refused.
 */
const formOf = (given: unknown): Form => {
  if (typeof given === "string") return "cbor";
  if (!isObject(given))
    return problem(
      "outRef",
      `expected a UTxO; got ${given === null ? "null" : typeof given}`,
    );
  const mesh = "input" in given || "output" in given;
  if (mesh && ("txHash" in given || "address" in given || "value" in given))
    return problem(
      "outRef",
      "an object with the members of both a Mesh UTxO { input, output } and a Utxo { txHash, outputIndex, address, value }",
    );
  if (mesh) return "mesh";
  if ("txHash" in given) return "own";
  return problem(
    "outRef",
    "expected a Utxo { txHash, outputIndex, address, value }, a Mesh UTxO { input, output } or its CBOR",
  );
};

/**
 * A UTxO given in any form, checked and copied into a `Utxo` in normal form. Members that are
 * not a UTxO's are not copied, and the result shares nothing with what was given.
 * @throws UtxoError for a value that is not a UTxO, or not one a `Utxo` can hold
 */
export const readUtxo = (given: unknown): Utxo => readScripted(given);

/**
 * `readUtxo`, with the reference scripts described before by their bytes: one given again is
 * taken from there, not read again
 */
const readScripted = (given: unknown, scripts?: ScriptsRead): Utxo => {
  switch (formOf(given)) {
    case "cbor":
      return fromCbor(given as string, scripts);
    case "mesh":
      return fromMesh(given as Record<string, unknown>, scripts);
    case "own":
      return fromOwn(given as Record<string, unknown>, scripts);
  }
};

/**
 * Reads the start of `what`, the UTxO or its out ref, at the head of the CBOR of a transaction
 * unspent output: a list of two items written with its length, as every writer writes it
 * @throws UtxoError (`outRef`) for an item that is no list, a list of indefinite length, or one
 *   of another length
 */
const pairAt = (reader: CborReader, what: string) => {
  const items =
    reader.peekState() === State.StartArray
      ? reader.readStartArray()
      : undefined;
  if (items === 2) return;
  problem(
    "outRef",
    `not the CBOR of a transaction unspent output: ${what} is ${
      items === undefined
        ? "no list"
        : items === null
          ? "a list of indefinite length"
          : `a list of ${items} item${items === 1 ? "" : "s"}`
    }, not a list of two items of definite length`,
  );
};

/**
 * The out ref at the head of the CBOR of a transaction unspent output, `[[id, index], output]` in
 * hex, read from its first items on the token reader, the rest not read. The UTxO and its out ref
 * are lists of two items of definite length, the id one byte string of definite length, 32 bytes,
 * and the index an unsigned integer, as every writer writes them: any other is refused here,
 * before a piece of it is read, as the reader joins a string written in pieces in a time that
 * grows with the square of their number. Undefined only where its first items are not
 * well-formed CBOR, which the read of the whole refuses
 * @throws UtxoError (`outRef`) for lists, an id or an index of another form, and as
 *   `readOutRefMembers` for an id or an index of another value
 */
const outRefAtHead = (cbor: string): OutRef | undefined => {
  let txHash: string;
  let index: bigint;
  try {
    const reader = new CborReader(HexBlob(cbor));
    pairAt(reader, "the UTxO");
    pairAt(reader, "its out ref");
    const id = reader.peekState();
    if (id !== State.ByteString)
      return problem(
        "outRef",
        `invalid transaction hash: expected a 32-byte hash in hex; got ${
          id === State.StartIndefiniteLengthByteString
            ? "a byte string in pieces"
            : "an item that is not a byte string"
        }`,
      );
    txHash = hexOf(reader.readByteString());
    const at = reader.peekState();
    if (at !== State.UnsignedInteger && at !== State.NegativeInteger)
      return problem(
        "outRef",
        "invalid output index: expected a whole number from 0 to 65535; got an item that is not an integer",
      );
    index = reader.readInt();
  } catch (error) {
    if (error instanceof UtxoError) throw error;
    return undefined;
  }
  return readOutRefMembers(txHash, Number(index));
};

/**
 * The out ref of the CBOR of a transaction unspent output, read at its head (`outRefAtHead`);
 * undefined for a text longer than a transaction or not hex, and where its first items are not
 * well-formed CBOR, which the read of the whole UTxO refuses
 * @throws UtxoError as `outRefAtHead`
 */
const cborOutRef = (cbor: string): OutRef | undefined =>
  cbor.length > 2 * MAX_TX_BYTES || !HEX_BYTES.test(cbor)
    ? undefined
    : outRefAtHead(cbor);

/**
 * The out ref of a UTxO given in any form, as `utxoKey` writes it of the UTxO read whole, read
 * without the rest of it: of a `Utxo` and a Mesh `UTxO` their members, of the CBOR of a
 * transaction unspent output its first items
 * @throws UtxoError where there is none to read, as `readUtxo` throws it
 */
export const givenOutRef = (given: unknown): string => {
  if (typeof given === "string") {
    const ref = cborOutRef(given);
    // What has no out ref read so is no UTxO this library reads: its read tells why
    return utxoKey(ref ?? readUtxo(given));
  }
  if (formOf(given) === "own") {
    const { txHash, outputIndex } = given as Record<string, unknown>;
    return utxoKey(readOutRefMembers(txHash, outputIndex));
  }
  const { input } = given as Record<string, unknown>;
  if (!isObject(input))
    return problem("outRef", "a Mesh UTxO is an object { input, output }");
  return utxoKey(readOutRefMembers(input.txHash, input.outputIndex));
};

/** An object with only the members named that it has, each as it is */
const membersOf = (value: unknown, names: readonly string[]): unknown =>
  isObject(value) && !Array.isArray(value)
    ? Object.fromEntries(
        names.flatMap((name) =>
          value[name] === undefined ? [] : [[name, value[name]]],
        ),
      )
    : value;

/**
 * A UTxO given in any form with only the members it is read from, none of them read: a text as
 * it is; of a `Utxo` its out ref, address, value, datum and script; of a Mesh `UTxO` the out ref
 * of its `input`, and of its `output` the address, the amount (each asset its unit and
 * quantity), the datum and the reference script with their hashes
 */
export const utxoMembers = (given: unknown): unknown => {
  if (typeof given === "string" || !isObject(given)) return given;
  if (!("input" in given) && !("output" in given))
    return membersOf(given, [
      "txHash",
      "outputIndex",
      "address",
      "value",
      "datum",
      "script",
    ]);
  const output = membersOf(given.output, [
    "address",
    "amount",
    "dataHash",
    "plutusData",
    "scriptRef",
    "scriptHash",
  ]);
  const amount = isObject(output) ? output.amount : undefined;
  return {
    input: membersOf(given.input, ["txHash", "outputIndex"]),
    output: Array.isArray(amount)
      ? {
          ...(output as Record<string, unknown>),
          amount: Array.from(amount as unknown[], (asset) =>
            membersOf(asset, ["unit", "quantity"]),
          ),
        }
      : output,
  };
};

/** A UTxO as a text, equal for two UTxOs that hold the same */
export const utxoText = (utxo: Utxo) =>
  JSON.stringify(utxo, (_, value: unknown) =>
    typeof value === "bigint"
      ? `${value}n`
      : typeof value === "object" && value !== null && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)),
          )
        : value,
  );

/**
 * Two entries given for one out ref that differ: `key` the out ref, `at` their places. Two texts
 * of CBOR are not read to be compared: they name the output in different bytes, whatever they
 * hold
 */
export class UtxoTwiceError extends Error {
  readonly key: string;
  readonly at: readonly [number, number];
  /** How they differ, as the message ends: `and differ`, or `in different bytes` */
  readonly how: string;

  constructor(key: string, at: readonly [number, number], texts = false) {
    const how = texts ? "in different bytes" : "and differ";
    super(`two entries name the output ${key} ${how}`);
    this.name = "UtxoTwiceError";
    this.key = key;
    this.at = at;
    this.how = how;
  }
}

/** UTxOs given for out refs, placed by their out refs before any of them is read whole */
export type PlacedUtxos = {
  /** The first entry given for each out ref taken, with its place, in the order given */
  readonly first: ReadonlyMap<
    string,
    { readonly at: number; readonly given: unknown }
  >;
  /** Each later entry for one of those out refs that is not an entry given before it */
  readonly later: readonly {
    readonly key: string;
    readonly at: number;
    readonly given: unknown;
  }[];
  /** The out refs of the entries passed over, none of them read past its out ref */
  readonly passed: ReadonlySet<string>;
};

/**
 * What is wrong with the entry at `at`: the caller's error, with the reader's as its reason
 */
export type EntryRefused = (
  error: unknown,
  at: number,
  given: unknown,
) => never;

/**
 * Places UTxOs given in any form by their out refs, reading of each only its out ref
 * (`givenOutRef`): an entry for an out ref `named` does not take is passed over, never read
 * whole. Of the entries for one out ref, the first is the one counted and read; an object given
 * again, or the same text of CBOR, is the same entry. Two texts of CBOR for one out ref name it in
 * different bytes, and are refused unread, though they may hold the same: a text is read only once
 * for it, as each is read in a time that grows with the square of its pieces. The other entries
 * are read with the first by `readPlaced`, and must be the same UTxO
 * @param named The out refs taken, as `utxoKey` writes them; every one without it
 * @throws UtxoTwiceError for two texts of CBOR that name one out ref in different bytes
 * @throws what `refused` throws for an entry whose out ref cannot be read
 */
export const placeUtxos = (
  entries: readonly unknown[],
  refused: EntryRefused,
  named?: ReadonlySet<string>,
): PlacedUtxos => {
  const first = new Map<string, { at: number; given: unknown }>();
  const later: { key: string; at: number; given: unknown }[] = [];
  const passed = new Set<string>();
  const texts = new Map<string, { at: number; text: string }>();
  const objects = new Map<string, Set<unknown>>();
  // Each place, a hole of a sparse list among them: it is no UTxO
  for (let at = 0; at < entries.length; at++) {
    const given: unknown = entries[at];
    let key: string;
    try {
      key = givenOutRef(given);
    } catch (error) {
      return refused(error, at, given);
    }
    if (named && !named.has(key)) {
      passed.add(key);
      continue;
    }
    if (typeof given === "string") {
      const text = given.toLowerCase();
      const seen = texts.get(key);
      if (seen?.text === text) continue;
      if (seen) throw new UtxoTwiceError(key, [seen.at, at], true);
      texts.set(key, { at, text });
    } else {
      const seen = objects.get(key) ?? new Set<unknown>();
      if (seen.has(given)) continue;
      objects.set(key, seen.add(given));
    }
    if (first.has(key)) later.push({ key, at, given });
    else first.set(key, { at, given });
  }
  return { first, later, passed };
};

/**
 * Reads the UTxOs `placeUtxos` placed, by their out refs, in the order given. Each later entry is
 * read first, with the first entry for its out ref, and must hold the same: two that differ are
 * refused before the other entries are read. A reference script described for an entry before is
 * not read again
 * @throws UtxoTwiceError for a later entry that differs from the first
 * @throws what `refused` throws for an entry that is not a UTxO this library reads
 */
export const readPlaced = (
  placed: PlacedUtxos,
  refused: EntryRefused,
): Map<string, Utxo> => {
  const scripts: ScriptsRead = new Map();
  const read = (given: unknown, at: number): Utxo => {
    try {
      return readScripted(given, scripts);
    } catch (error) {
      return refused(error, at, given);
    }
  };
  const utxos = new Map<string, Utxo>();
  const firstOf = (key: string): Utxo => {
    const known = utxos.get(key);
    if (known) return known;
    const { at, given } = placed.first.get(key)!;
    const utxo = read(given, at);
    utxos.set(key, utxo);
    return utxo;
  };
  for (const { key, at, given } of placed.later)
    if (utxoText(firstOf(key)) !== utxoText(read(given, at)))
      throw new UtxoTwiceError(key, [placed.first.get(key)!.at, at]);
  return new Map(Array.from(placed.first.keys(), (key) => [key, firstOf(key)]));
};

/**
 * The out ref of an output given in any form: an out ref (a `Utxo` among them), a Mesh `UTxO`,
 * or the CBOR of a transaction unspent output. Only the out ref is read and checked.
 * @throws UtxoError (`outRef`) when there is no out ref to read
 */
export const readOutRef = (given: unknown): OutRef => {
  if (typeof given === "string") {
    const { txHash, outputIndex } = fromCbor(given);
    return { txHash, outputIndex };
  }
  if (!isObject(given))
    return problem(
      "outRef",
      `expected an out ref { txHash, outputIndex } or a UTxO; got ${given === null ? "null" : typeof given}`,
    );
  if ("input" in given) {
    const { input } = given;
    if (!isObject(input))
      return problem("outRef", "a Mesh UTxO is an object { input, output }");
    return readOutRefMembers(input.txHash, input.outputIndex);
  }
  return readOutRefMembers(given.txHash, given.outputIndex);
};

/**
 * An output of a decoded transaction as the UTxO it becomes, checked as any UTxO given is. Its
 * inline datum and its reference script are the bytes the transaction holds, not a value written
 * again
 * @throws UtxoError for an output a `Utxo` cannot hold
 */
export const outputAsUtxo = (
  txHash: string,
  outputIndex: number,
  output: Serialization.TransactionOutput,
): Utxo => fromOutput(readOutRefMembers(txHash, outputIndex), output);

/** The out ref of an output, with exactly the members `txHash` and `outputIndex` */
export const outRefOf = (ref: Readonly<OutRef>): OutRef => ({
  txHash: ref.txHash,
  outputIndex: ref.outputIndex,
});

/** An out ref as `txHash#index` */
export const utxoKey = (ref: Readonly<OutRef>): string =>
  `${ref.txHash}#${ref.outputIndex}`;

/** A copy of a `Utxo` with its own members only: the marks of a built output dropped */
export const plainUtxo = (utxo: Utxo): Utxo => ({
  txHash: utxo.txHash,
  outputIndex: utxo.outputIndex,
  address: utxo.address,
  value: { ...utxo.value },
  ...withDatum(
    utxo.datum?.type === "inline"
      ? inlineDatum(utxo.datum.data.content)
      : utxo.datum && { ...utxo.datum },
  ),
  ...withScript(utxo.script && { ...utxo.script }),
});

const UTXO_FORMS =
  "a Utxo { txHash, outputIndex, address, value }, a Mesh UTxO { input, output }, or the CBOR of a transaction unspent output in hex";

/**
 * A UTxO in the builder's form, from any form it is given in: a `Utxo`, a Mesh `UTxO`, or the
 * CBOR of a transaction unspent output in hex. It is what every part and option does with a
 * UTxO it is given: the value is checked and copied, and the result shares nothing with it.
 *
 * The result is in normal form: hex in lower case, the address in bech32 (base58 for Byron),
 * lovelace first and tokens by unit, a token of quantity zero left out, a reference script
 * described with its hash. The reference script is never decoded: its language, hash and size
 * are read from its bytes, so one of any depth is read at once (see `describeScriptRef`). Members
 * that are not a UTxO's (the `label` and `change` of a built output) are not copied.
 * @throws TxBuildError INVALID_OPTION `{ option: "utxo", value, allowed }`, `value` the
 *   JavaScript type of what was given, the reason as `cause`, for a value that is not a UTxO: a
 *   transaction hash, output index, address, unit or quantity that cannot be read; a reward
 *   address; a `dataHash` that is not the hash of the `plutusData` beside it; a `scriptHash`
 *   without a `scriptRef`; a script hash that is not the script's; text that is not the CBOR of a
 *   transaction unspent output, or the CBOR of one whose output has a key other than 0 to 3 or of
 *   more than `MAX_TX_BYTES` (16 384) bytes
 */
export const toUtxo = (given: UtxoInput): Utxo => {
  try {
    return readUtxo(given);
  } catch (error) {
    if (!(error instanceof UtxoError)) throw error;
    throw new TxBuildError("INVALID_OPTION", `invalid utxo: ${error.message}`, {
      details: {
        option: "utxo",
        value: given === null ? "null" : typeof given,
        allowed: UTXO_FORMS,
      },
      cause: error,
    });
  }
};

/**
 * A UTxO as a Mesh `UTxO`, the form providers, wallets and evaluators use, for an API that
 * takes one. Takes what `toUtxo` takes. Lovelace comes first in `amount`; an inline datum is
 * written as `plutusData` with its `dataHash`; a reference script as `scriptRef`, the CBOR of
 * `[language, script]`, with its `scriptHash`. Nothing a `Utxo` holds is lost.
 * @throws TxBuildError INVALID_OPTION as `toUtxo`
 */
export const toMeshUtxo = (given: UtxoInput): UTxO => {
  const utxo = toUtxo(given);
  const output: UTxO["output"] = {
    address: utxo.address,
    amount: Object.entries(utxo.value).map(([unit, quantity]) => ({
      unit,
      quantity: quantity.toString(),
    })),
  };
  if (utxo.datum?.type === "hash") output.dataHash = utxo.datum.hash;
  if (utxo.datum?.type === "inline") {
    output.dataHash = dataHashOf(utxo.datum.data.content);
    output.plutusData = utxo.datum.data.content;
  }
  if (utxo.script) {
    output.scriptRef = scriptRefOf(utxo.script);
    if (utxo.script.hash !== undefined) output.scriptHash = utxo.script.hash;
  }
  return {
    input: { txHash: utxo.txHash, outputIndex: utxo.outputIndex },
    output,
  };
};
