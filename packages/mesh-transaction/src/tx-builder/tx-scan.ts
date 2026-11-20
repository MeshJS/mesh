import { CborReader, HexBlob, Serialization } from "@meshsdk/core-cst";

/*
 * The bounds within which a transaction this library did not build is read, before any of it is
 * decoded into a value: its size, the depth of its nesting, and the work the value decoder of
 * `@cardano-sdk/core` would have with it. That decoder reads each array, map and tag with a
 * reader of its own and walks again all that is inside it, copying what is left of the reader's
 * bytes at each step: its time grows with the square of the depth of data, and with the bytes
 * of each container times the items inside it, and it calls itself once a level, so that a datum
 * 2 048 levels deep overflows a small stack. The walk here counts that work on the same library's
 * token reader, `Serialization.CborReader`, read one token at a time: it calls itself nowhere,
 * and walks the largest transaction in some tens of milliseconds. The keys of maps are not
 * judged: a node refuses a map that repeats a key since protocol version 9, and the decoder reads
 * one in its own way, the last value or, for the outputs of a body, both lists joined.
 */

const State = Serialization.CborReaderState;

/**
 * The largest transaction `fromCbor` reads, in bytes, when the builder was not given protocol
 * parameters: 16 384, the protocol's maximum transaction size (`maxTxSize`) on mainnet, preprod
 * and preview. A builder given parameters reads up to their `maxTxSize`. A node takes no larger
 * transaction, and the time the value decoder takes grows with the size of the data
 */
export const MAX_TX_BYTES = 16_384;

/**
 * The deepest nesting a transaction is read to: each array, map and tag is one level, the
 * transaction itself the first, and the items inside a byte string under tag 24 (an inline datum,
 * a reference script) count on from that tag. 1 024: the value decoder reads one datum of this
 * depth on a stack of about a browser's (`node --stack-size=400`), and overflows it at 2 048. The
 * bound keeps this library's own process safe; Plutus data, metadata and scripts that nest more
 * than about 730 levels deep are refused by the bound on work first, as their decoding takes more
 * than a second
 */
export const MAX_TX_DEPTH = 1024;

/**
 * The most work the value decoder may have with a transaction, as the walk counts it: for each
 * array and map, the items inside it times its bytes and `ITEM_WORK` more, and for each tag the
 * items inside it times its bytes and `TAG_ITEM_WORK` more, and `TAG_WORK`; each piece of a
 * string written in pieces is an item, as the decoder reads each piece again at each container
 * around it, and the string counts as a container of its pieces, which the decoder joins; the
 * items inside a byte string under tag 24 count for the containers inside it alone, as the
 * decoder reads them with a reader of their own. One unit is about 0.4 ns of decoding on a
 * laptop of 2026 (an Apple M3 Max, Node 26): the slowest transactions this lets through, of
 * every shape measured, decode in 0.4 to 1.1 s.
 * Transactions as wallets and contracts make them count at most two thousandths of it. Past it:
 * one datum of lists nested more than 728 levels deep, 16 384 bytes of datums of lists nested
 * more than 54 deep, or a list of more than 11 000 zeros 7 levels down
 */
export const MAX_TX_WORK = 2_000_000_000;

/** The work of each item inside an array or a map, beside its bytes: the decoder's steps */
const ITEM_WORK = 6_500;

/** The work of each item inside a tag: a constructor of Plutus data is read with two readers */
const TAG_ITEM_WORK = 12_500;

/**
 * The work of each tag beside its items: the decoder reads a constructor of Plutus data with
 * readers of its own, whatever it holds, in about 36 µs
 */
const TAG_WORK = 60_000;

/**
 * The longest address an output of a transaction, or a UTxO, is read with, in bytes. The value
 * decoder takes an address of any length, and one of the Byron era is written in base58, whose
 * time grows with the square of its length. Since Allegra the ledger refuses an output to a Byron
 * address whose attributes are longer than 64 bytes, so the longest it takes is about 110 bytes,
 * and no other address is longer than 60. 256: a transaction of 16 384 bytes whose every output
 * pays an address this long is read in about 0.1 s, one of 65 536 in about 0.25 s
 */
export const MAX_ADDRESS_BYTES = 256;

/** The tag of a byte string that holds a CBOR item */
const ENCODED_CBOR = 24;

/** A transaction that the walk refuses, with the reason in words that quote none of its bytes */
export class TxScanError extends Error {}

/** The refusal of what is not one well-formed item; `what` names it, as "a transaction" */
const malformed = (what = "a transaction") =>
  new TxScanError(`expected ${what} in CBOR hex: it is not well-formed CBOR`);

/** The bounds of a walk; `what` names the item in a refusal, as "the transaction" */
type Bounds = {
  readonly depth: number;
  readonly work: number;
  readonly what: string;
};

const hexOf = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** An array, a map or a tag, open while its items are read */
type Frame = {
  readonly tag: boolean;
  /** The offset after its head */
  readonly start: number;
  /** The items its reader had read when it opened */
  readonly before: number;
};

/** A reader over the bytes of the item, or over those of a byte string under tag 24 */
type Level = {
  readonly reader: CborReader;
  readonly size: number;
  readonly frames: Frame[];
  /** The level of the tag around the byte string; 0 for the item itself */
  readonly depth: number;
  /**
   * The items read so far: scalars, strings and containers, a tagged item once, and each piece
   * of a string written in pieces
   */
  items: number;
};

const levelOf = (bytes: Uint8Array, depth: number): Level => ({
  reader: new CborReader(HexBlob(hexOf(bytes))),
  size: bytes.length,
  frames: [],
  depth,
  items: 0,
});

/** What a walk found of one item */
type Walked = {
  /** The offset after the item */
  readonly end: number;
  /** The deepest nesting inside it, each array, map and tag one level */
  readonly depth: number;
  /** The work the value decoder has with it, as `MAX_TX_WORK` counts it */
  readonly work: number;
};

/**
 * Walks the first CBOR item of `bytes`, token by token on the reader, with no call of itself:
 * the stack is the same however deep the item nests. With `bounds`, it walks the CBOR inside each
 * byte string under tag 24 too, to its end, and refuses the item as soon as it is deeper, or more
 * work, than they let through; without, such a byte string is one item
 * @throws TxScanError past the bounds; the reader's error for bytes that are not well-formed
 */
const walk = (bytes: Uint8Array, bounds?: Bounds): Walked => {
  const levels: Level[] = [levelOf(bytes, 0)];
  let deepest = 0;
  let work = 0;
  const offset = (level: Level) =>
    level.size - level.reader.getBytesRemaining();
  const count = (more: number) => {
    work += more;
    if (bounds !== undefined && work > bounds.work)
      throw new TxScanError(
        `${bounds.what} carries more nested data than this library reads`,
      );
  };
  const close = (level: Level, frame: Frame, items: number) =>
    count(
      items *
        (offset(level) - frame.start + (frame.tag ? TAG_ITEM_WORK : ITEM_WORK)),
    );
  /** An item of the level is read: each tag around it closes with it */
  const read = (level: Level) => {
    level.items++;
    for (;;) {
      const top = level.frames[level.frames.length - 1];
      if (top === undefined || !top.tag) return;
      level.frames.pop();
      close(level, top, level.items - top.before - 1);
    }
  };
  const open = (level: Level, tag: boolean) => {
    level.frames.push({ tag, start: offset(level), before: level.items });
    const depth = level.depth + level.frames.length;
    if (depth <= deepest) return;
    deepest = depth;
    if (bounds !== undefined && depth > bounds.depth)
      throw new TxScanError(
        `${bounds.what} nests its items deeper than the ${bounds.depth} levels this library reads`,
      );
  };
  /**
   * Reads a string written in pieces, one piece at a time: each piece is an item of the level,
   * and counts for every container around it, as the decoder reads each piece again at each of
   * them. The string counts as a container of its pieces too: the decoder joins them copying
   * what is left of the string at each. The content of a byte string is returned, its pieces
   * joined
   */
  const pieces = (level: Level, text: boolean): Uint8Array => {
    const { reader } = level;
    const start = offset(level);
    const content: Uint8Array[] = [];
    if (text) reader.readStartIndefiniteLengthTextString();
    else reader.readStartIndefiniteLengthByteString();
    const end = text
      ? State.EndIndefiniteLengthTextString
      : State.EndIndefiniteLengthByteString;
    let taken = 0;
    while (reader.peekState() !== end) {
      if (text) reader.readTextString();
      else content.push(reader.readByteString());
      taken++;
    }
    if (text) reader.readEndIndefiniteLengthTextString();
    else reader.readEndIndefiniteLengthByteString();
    level.items += taken;
    count(taken * (offset(level) - start + ITEM_WORK));
    return Buffer.concat(content);
  };
  for (;;) {
    const level = levels[levels.length - 1]!;
    const { reader, frames } = level;
    if (frames.length === 0) {
      if (levels.length === 1) {
        if (level.items > 0)
          return { end: offset(level), depth: deepest, work };
      } else if (reader.getBytesRemaining() === 0) {
        // The byte string under tag 24 is read: one item of the level that holds it
        levels.pop();
        read(levels[levels.length - 1]!);
        continue;
      }
    }
    const state = reader.peekState();
    switch (state) {
      case State.StartArray:
        reader.readStartArray();
        open(level, false);
        break;
      case State.StartMap:
        reader.readStartMap();
        open(level, false);
        break;
      case State.EndArray:
      case State.EndMap: {
        if (state === State.EndArray) reader.readEndArray();
        else reader.readEndMap();
        const frame = frames.pop()!;
        close(level, frame, level.items - frame.before);
        read(level);
        break;
      }
      case State.Tag: {
        const tag = reader.readTag();
        open(level, true);
        count(TAG_WORK);
        const next = reader.peekState();
        if (
          bounds !== undefined &&
          Number(tag) === ENCODED_CBOR &&
          (next === State.ByteString ||
            next === State.StartIndefiniteLengthByteString)
        )
          levels.push(
            levelOf(
              next === State.ByteString
                ? reader.readByteString()
                : pieces(level, false),
              level.depth + frames.length,
            ),
          );
        break;
      }
      case State.StartIndefiniteLengthByteString:
      case State.StartIndefiniteLengthTextString:
        pieces(level, state === State.StartIndefiniteLengthTextString);
        read(level);
        break;
      default:
        // A scalar or a string of one piece: the reader passes it in one call
        reader.skipValue();
        read(level);
    }
  }
};

/** The walk of `bytes` with no bounds, or undefined where they do not start with one item */
const walked = (bytes: Uint8Array): Walked | undefined => {
  try {
    return walk(bytes);
  } catch {
    return undefined;
  }
};

/** Whether `bytes` are exactly one well-formed CBOR item, read with no call of itself */
export const isOneCborItem = (bytes: Uint8Array): boolean =>
  walked(bytes)?.end === bytes.length;

/**
 * The deepest nesting of the one CBOR item `bytes` hold, each array, map and tag one level, a
 * byte string one item whatever it holds; undefined where they are not one item
 */
export const itemDepth = (bytes: Uint8Array): number | undefined => {
  const found = walked(bytes);
  return found !== undefined && found.end === bytes.length
    ? found.depth
    : undefined;
};

/**
 * The most work the value decoder may have with the reference script of a UTxO, as the walk
 * counts it: a script of this work decodes in about 10 ms. A Plutus script is one byte string and
 * counts far below; a native script that nests 30 levels deep, or holds 600 keys, comes near it
 */
export const MAX_SCRIPT_WORK = 24_000_000;

/**
 * What a walk finds of `bytes`, the CBOR of a reference script `[language, script]`, before any
 * of it is decoded: `within` the bounds the value decoder reads one in, nested no deeper than
 * `MAX_TX_DEPTH` and no more work than `MAX_SCRIPT_WORK`; `past` them; or `malformed`, not one
 * well-formed item. A script of a UTxO is decoded only within them: anyone can send an output
 * that holds one past them
 */
export const scriptBounds = (
  bytes: Uint8Array,
): "within" | "past" | "malformed" => {
  try {
    const found = walk(bytes, {
      depth: MAX_TX_DEPTH,
      work: MAX_SCRIPT_WORK,
      what: "the script",
    });
    return found.end === bytes.length ? "within" : "malformed";
  } catch (error) {
    return error instanceof TxScanError ? "past" : "malformed";
  }
};

/** A transaction unspent output in CBOR, with the CBOR its output holds apart */
export type UtxoBytes = {
  /**
   * The same bytes with stand-ins in place of each inline datum and reference script written,
   * which a value decoder reads at no cost: the integer 0, and a Plutus script of no bytes
   */
  standIn: Uint8Array;
  /** The CBOR of the inline datum, as the output holds it, its chunks joined */
  inlineDatum?: Uint8Array;
  /** The CBOR of the reference script, `[language, script]`, its chunks joined */
  scriptRef?: Uint8Array;
};

/** What stands in for the byte string of an inline datum: `h'00'`, which holds the integer 0 */
const STAND_IN_DATUM = Uint8Array.of(0x41, 0x00);

/** What stands in for the byte string of a reference script: `h'820140'`, `[1, h'']` */
const STAND_IN_SCRIPT = Uint8Array.of(0x43, 0x82, 0x01, 0x40);

/** The byte string under tag 24 the reader is at, if it is at one: its content and offsets */
const encodedAt = (reader: CborReader, offset: () => number) => {
  if (
    reader.peekState() !== State.Tag ||
    Number(reader.peekTag()) !== ENCODED_CBOR
  )
    return undefined;
  reader.readTag();
  const next = reader.peekState();
  if (
    next !== State.ByteString &&
    next !== State.StartIndefiniteLengthByteString
  )
    return undefined;
  const start = offset();
  const content = reader.readByteString();
  return { start, end: offset(), content };
};

/**
 * Finds the inline datum and the reference script of a transaction unspent output
 * `[input, output]` in CBOR, from the offsets of the token reader, and writes the same bytes with
 * a stand-in for each, so that a value decoder reads the rest without reading data or a script
 * of any depth or work; neither is decoded. Of a key the map repeats, the last is found, as the
 * decoder reads it, and each has its stand-in. An output in the array form holds neither.
 * Undefined where the bytes do not start with one well-formed item; an output of a shape the
 * reader does not find is left as written, for the decoder to judge
 */
export const splitUtxoBytes = (bytes: Uint8Array): UtxoBytes | undefined => {
  if (walked(bytes) === undefined) return undefined;
  const reader = new CborReader(HexBlob(hexOf(bytes)));
  const offset = () => bytes.length - reader.getBytesRemaining();
  const found: Omit<UtxoBytes, "standIn"> = {};
  // The byte strings of inline datums and reference scripts, each replaced by its stand-in
  const replaced: { start: number; end: number; by: Uint8Array }[] = [];
  try {
    if (reader.peekState() !== State.StartArray) return { standIn: bytes };
    const items = reader.readStartArray();
    if (items !== 2 && items !== null) return { standIn: bytes };
    reader.skipValue();
    if (reader.peekState() !== State.StartMap) return { standIn: bytes };
    const pairs = reader.readStartMap();
    for (let pair = 0; pairs === null || pair < pairs; pair++) {
      if (reader.peekState() === State.EndMap) break;
      const key =
        reader.peekState() === State.UnsignedInteger
          ? reader.readUInt()
          : (reader.skipValue(), undefined);
      if (key === 3n) {
        const script = encodedAt(reader, offset);
        if (script) {
          found.scriptRef = script.content;
          replaced.push({ ...script, by: STAND_IN_SCRIPT });
        } else {
          delete found.scriptRef;
          reader.skipValue();
        }
      } else if (key === 2n && reader.peekState() === State.StartArray) {
        // [1, 24(h'…')], in a list of either kind of length; a datum hash after it is the datum
        delete found.inlineDatum;
        reader.readStartArray();
        const inline =
          reader.peekState() === State.UnsignedInteger &&
          reader.readUInt() === 1n
            ? encodedAt(reader, offset)
            : undefined;
        if (inline) {
          found.inlineDatum = inline.content;
          replaced.push({ ...inline, by: STAND_IN_DATUM });
        }
        while (reader.peekState() !== State.EndArray) reader.skipValue();
        reader.readEndArray();
      } else reader.skipValue();
    }
  } catch {
    return { standIn: bytes };
  }
  const pieces: Uint8Array[] = [];
  let from = 0;
  for (const { start, end, by } of replaced) {
    pieces.push(bytes.subarray(from, start), by);
    from = end;
  }
  pieces.push(bytes.subarray(from));
  return { standIn: Buffer.concat(pieces), ...found };
};

/** The length of the byte string the reader is at, read piece by piece; 0 for anything else */
const byteStringLength = (reader: CborReader): number => {
  const state = reader.peekState();
  if (state === State.ByteString) return reader.readByteString().length;
  if (state !== State.StartIndefiniteLengthByteString) {
    reader.skipValue();
    return 0;
  }
  reader.readStartIndefiniteLengthByteString();
  let length = 0;
  while (reader.peekState() !== State.EndIndefiniteLengthByteString)
    length += reader.readByteString().length;
  reader.readEndIndefiniteLengthByteString();
  return length;
};

/**
 * The longest address the outputs of a transaction pay, its collateral return among them, in
 * bytes, from a well-formed item: each entry of its body that is outputs or a collateral return
 * counts, a repeated one too, as the decoder joins two output lists, and so does each address of
 * an output that repeats its key
 */
const longestAddress = (bytes: Uint8Array): number => {
  const reader = new CborReader(HexBlob(hexOf(bytes)));
  let longest = 0;
  const output = () => {
    if (reader.peekState() === State.StartArray) {
      reader.readStartArray();
      if (reader.peekState() !== State.EndArray)
        longest = Math.max(longest, byteStringLength(reader));
      while (reader.peekState() !== State.EndArray) reader.skipValue();
      reader.readEndArray();
    } else if (reader.peekState() === State.StartMap) {
      reader.readStartMap();
      while (reader.peekState() !== State.EndMap) {
        const key =
          reader.peekState() === State.UnsignedInteger
            ? reader.readUInt()
            : (reader.skipValue(), undefined);
        if (key === 0n) longest = Math.max(longest, byteStringLength(reader));
        else reader.skipValue();
      }
      reader.readEndMap();
    } else reader.skipValue();
  };
  reader.readStartArray();
  if (reader.peekState() !== State.StartMap) return 0;
  reader.readStartMap();
  while (reader.peekState() !== State.EndMap) {
    const key =
      reader.peekState() === State.UnsignedInteger
        ? reader.readUInt()
        : (reader.skipValue(), undefined);
    if (key === 1n && reader.peekState() === State.StartArray) {
      reader.readStartArray();
      while (reader.peekState() !== State.EndArray) output();
      reader.readEndArray();
    } else if (key === 16n) output();
    else reader.skipValue();
  }
  return longest;
};

/**
 * The bytes of CBOR hex, refused past `maxBytes` before a byte is read; undefined for a value that
 * is not hex, which is left to the reader. `what` names it in the refusal
 */
const bytesWithin = (
  text: unknown,
  maxBytes: number,
  what: string,
): Uint8Array | undefined => {
  if (typeof text !== "string") return undefined;
  if (text.length > 2 * maxBytes)
    throw new TxScanError(
      `${what} is more than the ${maxBytes} bytes of the protocol's maximum transaction size`,
    );
  if (
    text.length === 0 ||
    text.length % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/.test(text)
  )
    return undefined;
  return Buffer.from(text, "hex");
};

/**
 * Walks a transaction given as CBOR hex and refuses one this library does not read in reasonable
 * time: larger than `maxBytes`, before a byte of it is read; not an array of four items, the form
 * of every era since Alonzo; not one well-formed CBOR item; nested deeper than `MAX_TX_DEPTH`;
 * more work for the value decoder than `MAX_TX_WORK`; or an output that pays an address longer
 * than `MAX_ADDRESS_BYTES`. A value that is not hex is left to the reader, which refuses it
 * @param maxBytes The largest transaction read: the `maxTxSize` of the protocol parameters the
 *   builder holds, else `MAX_TX_BYTES`
 * @returns the work the walk counted
 * @throws TxScanError with the reason, which quotes none of the text
 */
export const scanTransaction = (
  text: unknown,
  maxBytes = MAX_TX_BYTES,
): number | undefined => {
  const bytes = bytesWithin(text, maxBytes, "the transaction");
  if (bytes === undefined) return undefined;
  let found: Walked;
  try {
    const top = new CborReader(HexBlob(hexOf(bytes)));
    if (top.peekState() !== State.StartArray || top.readStartArray() !== 4)
      throw new TxScanError(
        "the transaction is not an array of four items (its body, witness set, validity flag and auxiliary data): the forms of earlier eras are not read",
      );
    found = walk(bytes, {
      depth: MAX_TX_DEPTH,
      work: MAX_TX_WORK,
      what: "the transaction",
    });
    if (found.end !== bytes.length) throw malformed();
    if (longestAddress(bytes) > MAX_ADDRESS_BYTES)
      throw new TxScanError(
        `the transaction pays an address longer than the ${MAX_ADDRESS_BYTES} bytes this library reads`,
      );
  } catch (error) {
    if (error instanceof TxScanError) throw error;
    throw malformed();
  }
  return found.work;
};

/**
 * Walks the witnesses of the JSON of a `BuiltTx`, a witness set in CBOR hex, within the bounds of
 * a transaction, before any of it is decoded: larger than `maxBytes`, nested deeper than
 * `MAX_TX_DEPTH`, or more work for the value decoder than `MAX_TX_WORK`. Text that is not hex, or
 * not one well-formed item, is left to the reader, which refuses it
 * @param maxBytes As `scanTransaction`
 * @throws TxScanError with the reason, which quotes none of the text
 */
export const scanWitnessSet = (
  text: unknown,
  maxBytes = MAX_TX_BYTES,
): void => {
  const bytes = bytesWithin(text, maxBytes, "the witness set");
  if (bytes === undefined) return;
  try {
    walk(bytes, {
      depth: MAX_TX_DEPTH,
      work: MAX_TX_WORK,
      what: "the witness set",
    });
  } catch (error) {
    if (error instanceof TxScanError) throw error;
  }
};
