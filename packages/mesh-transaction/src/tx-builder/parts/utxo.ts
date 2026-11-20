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
  MAX_TX_BYTES,
  MAX_TX_DEPTH,
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

/** The head of a CBOR item: its major type, its argument, undefined for an indefinite length */
type Head = { major: number; value: bigint | undefined; next: number };

/** The head of the item at `at`, read from the bytes; undefined where it is not well formed */
const headAt = (bytes: Uint8Array, at: number): Head | undefined => {
  const initial = bytes[at];
  if (initial === undefined) return undefined;
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info < 24) return { major, value: BigInt(info), next: at + 1 };
  if (info === 31) return { major, value: undefined, next: at + 1 };
  if (info > 27) return undefined;
  const size = 2 ** (info - 24);
  if (at + 1 + size > bytes.length) return undefined;
  let value = 0n;
  for (let i = 1; i <= size; i++)
    value = (value << 8n) | BigInt(bytes[at + i]!);
  return { major, value, next: at + 1 + size };
};

/** The largest integer of 64 bits, the `n` of `[3, n, scripts]` as the ledger reads it */
const MAX_INT64 = 2n ** 63n - 1n;

/** A list of native scripts while it is read */
type ScriptList = {
  readonly scripts: NativeScriptPrototype[];
  /** The scripts left to read in a list of definite length; undefined for indefinite length */
  left: number | undefined;
  /** Whether the script that holds the list is of indefinite length: a break follows the list */
  readonly closes: boolean;
  readonly level: number;
};

/**
 * The native script the bytes hold whole, read as the ledger reads one, with no call of itself at
 * any depth and in a time that grows with their size: `[0, key hash of 28 bytes]`,
 * `[1, scripts]`, `[2, scripts]`, `[3, n, scripts]`, `[4, slot]`, `[5, slot]`, each script and
 * each list of scripts of definite or indefinite length; its kind and a slot an unsigned integer
 * of up to 8 bytes, `n` an integer of 64 bits, in a form of any length. The script is in the form
 * `TxSigners.nativeScripts` lists. `depth` counts each array one level, `[0, script]` around it
 * the first, as the walk counts the CBOR of a reference script. Undefined for anything else: what
 * the ledger does not read, and a key hash written in pieces, which the ledger is not known to read
 */
const readNative = (
  bytes: Uint8Array,
): { script: NativeScriptPrototype; depth: number } | undefined => {
  let at = 0;
  let depth = 1;
  const top: NativeScriptPrototype[] = [];
  // The lists being read, the innermost last; the script itself is the one script of a list
  const lists: ScriptList[] = [
    { scripts: top, left: 1, closes: false, level: 1 },
  ];
  const uint = () => {
    const head = headAt(bytes, at);
    if (head?.major !== 0 || head.value === undefined) return undefined;
    at = head.next;
    return head.value;
  };
  /** Reads the break that ends a script of indefinite length */
  const closed = () => bytes[at++] === 0xff;
  while (lists.length > 0) {
    const list = lists[lists.length - 1]!;
    if (list.left === 0 || (list.left === undefined && bytes[at] === 0xff)) {
      if (list.left === undefined) at++;
      lists.pop();
      if (list.closes && !closed()) return undefined;
      continue;
    }
    if (list.left !== undefined) list.left--;
    const level = list.level + 1;
    depth = Math.max(depth, level);
    const open = headAt(bytes, at);
    if (open?.major !== 4) return undefined;
    at = open.next;
    const kind = uint();
    if (kind === undefined || kind > 5n) return undefined;
    if (open.value !== undefined && open.value !== (kind === 3n ? 3n : 2n))
      return undefined;
    const indefinite = open.value === undefined;
    if (kind === 0n) {
      const key = headAt(bytes, at);
      if (key?.major !== 2 || key.value !== 28n || key.next + 28 > bytes.length)
        return undefined;
      at = key.next + 28;
      list.scripts.push({
        type: "SCRIPT_PUBKEY",
        value: { addr_keyhash: hexOf(bytes.subarray(key.next, at)) },
      });
    } else if (kind >= 4n) {
      const slot = uint();
      if (slot === undefined) return undefined;
      list.scripts.push({
        type: kind === 4n ? "TIMELOCK_START" : "TIMELOCK_EXPIRY",
        value: { slot: slot.toString() },
      });
    } else {
      let n = 0n;
      if (kind === 3n) {
        const required = headAt(bytes, at);
        if (
          required === undefined ||
          (required.major !== 0 && required.major !== 1) ||
          required.value === undefined ||
          required.value > MAX_INT64
        )
          return undefined;
        n = required.major === 0 ? required.value : -1n - required.value;
        at = required.next;
      }
      const inner = headAt(bytes, at);
      if (inner?.major !== 4) return undefined;
      at = inner.next;
      const scripts: NativeScriptPrototype[] = [];
      list.scripts.push(
        kind === 1n
          ? { type: "SCRIPT_ALL", value: { native_scripts: scripts } }
          : kind === 2n
            ? { type: "SCRIPT_ANY", value: { native_scripts: scripts } }
            : { type: "SCRIPT_N_OF_K", value: { n, native_scripts: scripts } },
      );
      depth = Math.max(depth, level + 1);
      lists.push({
        scripts,
        left: inner.value === undefined ? undefined : Number(inner.value),
        closes: indefinite,
        level: level + 1,
      });
      continue;
    }
    if (indefinite && !closed()) return undefined;
  }
  return at === bytes.length ? { script: top[0]!, depth } : undefined;
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
      if (!readNative(Buffer.from(script, "hex"))) return undefined;
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

/**
 * The native script a reference script holds, read from its bytes as `describeScriptRef` reads
 * it, in the form `TxSigners.nativeScripts` lists, with its hash: the keys it names are those a
 * native witness that runs it prices and asks for. Any number of keys is read. Undefined for what
 * is not a native script, and for one nested deeper than `MAX_TX_DEPTH` as the walk counts the
 * levels of `[0, script]`: its form is a tree that this library and the application walk by
 * recursion
 */
export const heldNativeScript = (
  script: OutputScript | undefined,
): { script: NativeScriptPrototype; hash: string } | undefined => {
  if (script?.type !== "native") return undefined;
  const read = readNative(Buffer.from(script.cbor, "hex"));
  return read !== undefined && read.depth <= MAX_TX_DEPTH
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
const readScript = (at: string, script: unknown): OutputScript => {
  if (!isObject(script))
    return problem("script", `${at}: invalid script ${shownValue(script)}`);
  const stated =
    script.hash === undefined ? undefined : readScriptHash(at, script.hash);
  if (script.type === "unknown")
    return describeScriptRef(
      readHex("script", at, "the reference script", script.scriptRef),
      stated,
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
  const described = describeScriptRef(scriptRef);
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
 * stand-ins in their place, and the script is described as `describeScriptRef` describes one. An
 * output with a key other than 0 to 3, which the ledger takes in no output, is refused before
 * the decoder runs, its out ref named where the reader finds it
 */
const fromCbor = (cbor: string): Utxo => {
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
  // The decoder would read what follows such a key one place off, a script at a key's place
  // among them, and decode it: refused before it runs
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
      scriptRef === undefined ? undefined : describeScriptRef(scriptRef),
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

const fromMesh = (given: Record<string, unknown>): Utxo => {
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
    script = describeScriptRef(
      readHex("script", at, "its scriptRef", scriptRef),
      stated,
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

const fromOwn = (given: Record<string, unknown>): Utxo => {
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
      given.script === undefined ? undefined : readScript(at, given.script),
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
export const readUtxo = (given: unknown): Utxo => {
  switch (formOf(given)) {
    case "cbor":
      return fromCbor(given as string);
    case "mesh":
      return fromMesh(given as Record<string, unknown>);
    case "own":
      return fromOwn(given as Record<string, unknown>);
  }
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
 *   JavaScript type of what was given, the reason as `cause`, for a value that is not a UTxO: a transaction hash, output index, address, unit or
 *   quantity that cannot be read; a reward address; a `dataHash` that is not the hash of the
 *   `plutusData` beside it; a `scriptHash` without a `scriptRef`; a script hash that is not the
 *   script's; text that is not the CBOR of a transaction unspent output, or the CBOR of one whose
 *   output has a key other than 0 to 3
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
