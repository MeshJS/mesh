import { CborReader, HexBlob, Serialization } from "@meshsdk/core-cst";

/*
 * The bounds within which a transaction this library did not build is read, before any of it is
 * decoded into a value: its size, the depth of its nesting, the work the value decoder of
 * `@cardano-sdk/core` would have with it, and the length of the addresses its outputs pay. That
 * decoder reads each array, map and tag with a reader of its own and walks again all that is
 * inside it, copying what is left of the reader's bytes at each token, each piece of a string
 * written in pieces among them: its time grows with the square of the depth of data, and with the
 * bytes of each container times the items inside it, and it calls itself once a level, so that a
 * datum 2 048 levels deep overflows a small stack. The walk here counts that work on the same
 * library's token reader, `Serialization.CborReader`, read one token at a time: it calls itself
 * nowhere, and walks the largest transaction in some tens of milliseconds (65 536 bytes in about
 * 0.1 s). The keys of maps are not judged: a node refuses a map that repeats a key since protocol
 * version 9, and the decoder reads one in its own way, the last value or, for the outputs of a
 * body, both lists joined.
 *
 * The count against the decoders a foreign transaction meets, `fromCbor` end to end, the worst of
 * three runs in plain Node (an Apple M3 Max, Node 26, `@cardano-sdk/core` 0.46.12): Plutus data in
 * the witness set, inline and in redeemers; metadata; native scripts in the witness set, in the
 * auxiliary data and as reference scripts; strings in pieces; tokens, outputs, mints, signers and
 * withdrawals. Of the 59 shapes of 80 ms or more, each decodes in 0.21 to 1.39 times 0.42 ns a
 * unit: nested data and metadata at 0.8 to 1.4, flat lists, maps, outputs and redeemers at 0.5 to
 * 1.2, strings in pieces at 0.3 to 1.1, native scripts at 0.2 to 0.5, as they are counted for
 * more than their decoder spends. The largest of each family the bound lets through decodes in
 * 0.16 to 0.94 s.
 *
 * The walk refuses what is not well-formed CBOR (RFC 8949): what the token reader refuses, and a
 * simple value below 32 written in two bytes, which it takes.
 *
 * The reference script of a UTxO is never decoded: its language, its hash and its size are read
 * from its bytes, and a native one, of no more than `MAX_TX_BYTES`, as the ledger reads one, on
 * the token reader with no call of itself; so are the keys it names, where it nests no deeper
 * than `MAX_NATIVE_DEPTH`, and where the signers of a transaction are read from the UTxOs given
 * with it, only for a script it runs, and one it runs whose keys are not read is refused. The
 * token reader copies the bytes left at each item, so the time grows with the square of a
 * script's size, and of the pieces of a string written in pieces: a UTxO in CBOR is read only up
 * to `MAX_TX_BYTES`, and the reference scripts of a transaction only up to `MAX_REF_SCRIPT_BYTES`
 * in all, counted before any of its UTxOs is read whole. On the
 * laptop above, with `@cardano-sdk/core` 0.47.1, three runs, the worst: a UTxO that holds the
 * slowest native script of about 16 KB is read in 38 ms, its keys in 55 ms; a UTxO in CBOR of
 * 16 384 bytes whose strings are written in empty pieces in up to 120 ms (75 ms for its script,
 * 120 ms for a policy id, an asset name or a datum hash; up to 150 ms on a loaded machine), 185 ms
 * where it is counted and then read, and one longer than `MAX_TX_BYTES` (64 KB, 256 KB, 1 MB) is
 * refused in less than 0.1 ms; a payment from a payer of 40 UTxOs that each hold such a script in
 * 1.0 s, from a provider, a wallet or a snapshot, and of 40 UTxOs in pieces in 2.0 to 4.8 s; a
 * transaction that runs 13 distinct native scripts of 15 643 bytes from its reference inputs
 * (203 359 bytes, the most the bound lets through) in 0.68 s by `requiredSigners`, 0.74 s by
 * `fromCbor`, 1.27 s by `plan` as a step given built, its record 4.2 MB; one that runs 235 is
 * refused in 26, 32 and 56 ms. A step at both bounds at once, 13 scripts of 204 800 bytes in all
 * and data at the bound on work, in 1.39 s by `requiredSigners`, 1.60 s by `fromCbor`, 3.38 s by
 * `plan`, its record 4.4 MB. A UTxO in CBOR whose output has a
 * key other than 0 to 3 is refused before the decoder runs: the ledger takes no such output. So is
 * a transaction whose body, outputs or witness set hold a key the Conway ledger does not read
 * (`checkConwayKeys`), by every reader of a whole transaction.
 *
 * What the bounds admit is read on a stack of about a browser's (`node --stack-size=400`, each
 * measure in a fresh process) by `fromCbor` and `requiredSigners`, but a form copied or written by
 * recursion overflows it sooner, with the runtime's `RangeError`. In metadata, an inline datum and
 * the datum of a redeemer, lists may overflow it from about 400 levels where the JSON of the
 * object is written or read back (`toJSON`, `restore`) and in `plan` as a step given built; maps
 * from about 240; constructors, in the datums, from about 400; lists or constructors and maps
 * nested in each other from about 300. Each is a margin below the least measured: at the edge a
 * run passes or fails by a level, and an item at the bottom of the data takes a level. Data of the
 * witness set and the native scripts of the witness set and of the auxiliary data went through
 * those paths at the deepest the bounds admit. Other paths and shapes were not measured.
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
 * bound keeps the decoder within such a stack; a copy or the JSON of the data read is not (see
 * above). Data is refused by the bound on work long before, as its decoding would take more than a
 * second: one datum of lists nested past 728 levels (752 of definite lists), constructors past 434
 * (868 levels), maps past 523, metadata past 729, a native script past 303 (606 levels). 1 024
 * levels are reached by byte strings under tag 24 nested in each other, which the decoder does not
 * unfold
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
 * every shape measured, decode in 0.16 to 0.94 s. The real transactions of the tests count 0.02
 * to 0.26 % of it; lawful heavy ones 5 to 11 %: an order book of 120 orders in one datum, a mint
 * of 40 assets with their metadata, outputs of many tokens near 16 384 bytes, 60 datums in the
 * witness set. Past it: one datum of lists nested more than 728 levels deep, 16 384 bytes of
 * datums of lists nested more than 55 deep, a list of more than 10 607 zeros 7 levels down, or
 * 16 384 bytes of constructors with no fields more than 9 lists down
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
 * The deepest a native reference script nests, as the walk counts the levels of `[0, script]`,
 * for the keys it names to be read: 512. Its form is a tree that this library and the application
 * copy and write by recursion (`structuredClone`, JSON), so on a stack of about a browser's
 * (`node --stack-size=400`) each path that reads its keys, a build, `fromCbor`, `requiredSigners`,
 * a step given built and their records, runs through to 622 levels and fails from 642, in a fresh
 * process. There, at 512, the application may stand 575 frames deep when it writes the
 * JSON of such a transaction, plans or builds it, 825 when it restores one, and about 2 700 when it
 * reads one. A script deeper is described and spent, its keys not read: where the signers of a
 * transaction are read, one it runs is refused (`NATIVE_SCRIPT_UNREAD`)
 */
export const MAX_NATIVE_DEPTH = 512;

/**
 * The most bytes of reference scripts the UTxOs a transaction spends and reads may hold in all, as
 * the Conway ledger bounds them (`maxRefScriptSizePerTx`, 200 KiB): past it a node refuses the
 * transaction (`ConwayTxRefScriptsSizeTooBig`). Each out ref counts once, and each script as the
 * ledger counts it: a native script's CBOR, the bytes of a Plutus script
 */
export const MAX_REF_SCRIPT_BYTES = 204_800;

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
  readonly bytes: Uint8Array;
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
  bytes,
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
 * @throws TxScanError past the bounds; an Error for bytes that are not well-formed: the reader's,
 *   and for a simple value below 32 written in two bytes, which the reader takes
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
      case State.SimpleValue: {
        // A simple value below 32 written in two bytes is not well formed (RFC 8949, 3.3), and
        // the reader takes it: refused as the reader refuses what is not well formed
        const before = offset(level);
        if (reader.readSimpleValue() < 32 && offset(level) - before === 2)
          throw new Error("a simple value below 32 in two bytes");
        read(level);
        break;
      }
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
  /** The out ref, `[transaction id, index]`, where the token reader finds one */
  outRef?: { txHash: string; outputIndex: bigint };
  /**
   * Set where the output is a map with a key other than 0, 1, 2 or 3, read as the value decoder
   * reads a key, a key 3 in a longer form being 3: the ledger takes no such output, and the
   * decoder passes over the value of such a key
   */
  otherKey?: true;
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
 * decoder reads it, and each has its stand-in. An output in the array form holds neither. A key
 * other than 0 to 3 is marked, and the output read no further. Undefined where the bytes do not
 * start with one well-formed item; an output of a shape the reader does not find is left as
 * written, for the decoder to judge
 */
export const splitUtxoBytes = (bytes: Uint8Array): UtxoBytes | undefined => {
  if (walked(bytes) === undefined) return undefined;
  const reader = new CborReader(HexBlob(hexOf(bytes)));
  const offset = () => bytes.length - reader.getBytesRemaining();
  const found: Omit<UtxoBytes, "standIn"> = {};
  // The byte strings of inline datums and reference scripts, each replaced by its stand-in
  const replaced: { start: number; end: number; by: Uint8Array }[] = [];
  /** The out ref `[transaction id, index]` the reader is at, kept where it reads as one */
  const readInput = () => {
    if (reader.peekState() !== State.StartArray) {
      reader.skipValue();
      return;
    }
    const items = reader.readStartArray();
    const state = reader.peekState();
    if (
      items === 2 &&
      (state === State.ByteString ||
        state === State.StartIndefiniteLengthByteString)
    ) {
      const txHash = hexOf(reader.readByteString());
      if (reader.peekState() === State.UnsignedInteger)
        found.outRef = { txHash, outputIndex: reader.readUInt() };
    }
    while (reader.peekState() !== State.EndArray) reader.skipValue();
    reader.readEndArray();
  };
  try {
    if (reader.peekState() !== State.StartArray) return { standIn: bytes };
    const items = reader.readStartArray();
    if (items !== 2 && items !== null) return { standIn: bytes };
    readInput();
    if (reader.peekState() !== State.StartMap) return { standIn: bytes };
    const pairs = reader.readStartMap();
    for (let pair = 0; pairs === null || pair < pairs; pair++) {
      if (reader.peekState() === State.EndMap) break;
      const key =
        reader.peekState() === State.UnsignedInteger
          ? reader.readUInt()
          : undefined;
      if (key === undefined || key > 3n)
        return { standIn: bytes, ...found, otherKey: true };
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
 * The keys of a transaction body the Conway ledger reads: 0 to 22 but 6, 10 and 12, which it
 * does not know. Those of a later era (23 sub-transactions, 25 direct deposits, 26 balance
 * intervals) the value decoder of `@cardano-sdk/core` reads, and any other it passes over with its
 * value
 */
const CONWAY_BODY_KEYS: ReadonlySet<bigint> = new Set(
  [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map(
    BigInt,
  ),
);

/** The keys of a witness set the Conway ledger reads: 0 to 7 */
const MAX_WITNESS_KEY = 7n;

/** The keys of an output in the map form the Conway ledger reads: 0 to 3 */
const MAX_OUTPUT_KEY = 3n;

/**
 * Reads the keys of the map the reader is at, each an unsigned integer `takes` takes, its value
 * read by `value`, else skipped; refused with `refused` for any other key
 */
const readKeys = (
  reader: CborReader,
  takes: (key: bigint) => boolean,
  refused: string,
  value: (key: bigint) => void = () => reader.skipValue(),
) => {
  reader.readStartMap();
  while (reader.peekState() !== State.EndMap) {
    if (reader.peekState() !== State.UnsignedInteger)
      throw new TxScanError(refused);
    const key = reader.readUInt();
    if (!takes(key)) throw new TxScanError(refused);
    value(key);
  }
  reader.readEndMap();
};

/**
 * Refuses a transaction whose body, an output of it (its collateral return among them) or its
 * witness set holds a key the Conway ledger does not read, before a value decoder runs: read on
 * the token reader, each value skipped but the outputs'. A node refuses such a transaction, and
 * the value decoder would read the fields of a later era, or pass over a key with its value. What
 * is not a map where one is read is left to the decoder, which refuses it
 * @param body The CBOR of the body
 * @param witnessSet The CBOR of the witness set
 * @throws TxScanError with the reason, which quotes none of the bytes
 */
export const checkConwayKeys = (
  body: Uint8Array,
  witnessSet: Uint8Array,
): void => {
  // An output of the array form has no keys
  const output = (reader: CborReader) => {
    if (reader.peekState() === State.StartMap)
      readKeys(
        reader,
        (key) => key <= MAX_OUTPUT_KEY,
        "an output of the transaction has a key other than 0, 1, 2 and 3, which the Conway ledger does not read",
      );
    else reader.skipValue();
  };
  try {
    const reader = new CborReader(HexBlob(hexOf(body)));
    if (reader.peekState() === State.StartMap)
      readKeys(
        reader,
        (key) => CONWAY_BODY_KEYS.has(key),
        "the body of the transaction has a key the Conway ledger does not read (a field of a later era, or none)",
        (key) => {
          if (key === 16n) output(reader);
          else if (key !== 1n || reader.peekState() !== State.StartArray)
            reader.skipValue();
          else {
            reader.readStartArray();
            while (reader.peekState() !== State.EndArray) output(reader);
            reader.readEndArray();
          }
        },
      );
    const set = new CborReader(HexBlob(hexOf(witnessSet)));
    if (set.peekState() === State.StartMap)
      readKeys(
        set,
        (key) => key <= MAX_WITNESS_KEY,
        "the witness set of the transaction has a key other than 0 to 7, which the Conway ledger does not read",
      );
  } catch (error) {
    if (error instanceof TxScanError) throw error;
  }
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
