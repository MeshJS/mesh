/*
 * A walk over the bytes of a transaction before any of it is decoded into a value. Decoders read
 * a map that repeats a key in different ways: one joins the values, another keeps the last, a
 * third refuses it. A transaction whose maps can be read in more than one way cannot be shown
 * truly, so it is refused, as is one too large or nested too deep to be decoded in reasonable
 * time.
 */

/**
 * The largest transaction `fromCbor` reads, in bytes, when the builder was not given protocol
 * parameters: 16 384, the protocol's maximum transaction size (`maxTxSize`) on mainnet, preprod
 * and preview. A builder given parameters reads up to their `maxTxSize`. A node takes no larger
 * transaction, and the time the value decoder takes grows with the size of the data
 */
export const MAX_TX_BYTES = 16_384;

/**
 * The deepest nesting `fromCbor` reads: each array, map and tag is one level, the transaction
 * itself the first, and the items inside a byte string that holds CBOR (an inline datum, a
 * reference script) count on from the tag of that string. The data of a datum or a redeemer
 * starts at the fifth to the seventh level and keeps more than fifty of its own, more than
 * twenty constructors one inside another. The time the value decoder takes for one datum grows
 * with the square of its depth, so the limit is kept near what data needs
 */
export const MAX_TX_DEPTH = 64;

/**
 * The most work the value decoder may have with the data of a transaction, counted by the walk:
 * for each array, map, tag and byte string holding CBOR inside data (Plutus data, metadata,
 * scripts), the items inside it times its bytes. The decoder reads each such container with a
 * reader of its own, and copies what is left of that reader's bytes for each item it passes, so
 * its time follows this count: about a third of a second for each 10^9 on a laptop, up to two
 * thirds for maps. The limit keeps the time near a second. A transaction as wallets and
 * contracts make them counts below a million, and 16 384 bytes of data in one flat list about
 * 5 * 10^8. Data that nests most of its bytes deep is what goes past it: one datum of 16 384
 * bytes nested seven levels around them, of 8 192 bytes nested thirty
 */
export const MAX_TX_WORK = 2_000_000_000;

const TOO_MUCH_DATA =
  "the transaction carries more nested data than this library reads";

/** The tag of a byte string that holds a CBOR item */
const ENCODED_CBOR = 24;

/** A transaction that the walk refuses, with the reason in words that quote none of its bytes */
export class TxScanError extends Error {}

/**
 * What a container is in the transaction, which tells whether its keys are compared and what its
 * items are
 */
type Role =
  | "top"
  | "tx"
  | "body"
  | "inBody"
  | "witnessSet"
  | "redeemers"
  | "redeemer"
  | "aux"
  | "auxMap"
  | "metadata"
  | "plain";

/** The roles whose maps may not repeat a key, each with the place a message names */
const CHECKED: Partial<Record<Role, string>> = {
  body: "its body",
  inBody: "its body",
  witnessSet: "its witness set",
  redeemers: "the redeemers of its witness set",
  aux: "its auxiliary data",
  auxMap: "its auxiliary data",
  metadata: "its auxiliary data",
};

/** The head of a CBOR item */
type Head = {
  major: number;
  /** The argument: a value, a length or a tag number; undefined for an indefinite length */
  value: number | bigint | undefined;
  /** The offset after the head */
  next: number;
  /** The simple value 31 of major type 7: the end of an indefinite length */
  isBreak: boolean;
};

const malformed = () =>
  new TxScanError(
    "expected a transaction in CBOR hex: it is not well-formed CBOR",
  );

/** Reads the head at `at`, before `limit`; undefined where the bytes are not well-formed */
const readHead = (
  bytes: Uint8Array,
  at: number,
  limit: number,
): Head | undefined => {
  if (at >= limit) return undefined;
  const initial = bytes[at]!;
  const major = initial >> 5;
  const info = initial & 0x1f;
  if (info < 24) return { major, value: info, next: at + 1, isBreak: false };
  if (info === 31) {
    if (major === 7)
      return { major, value: undefined, next: at + 1, isBreak: true };
    if (major >= 2 && major <= 5)
      return { major, value: undefined, next: at + 1, isBreak: false };
    return undefined;
  }
  if (info > 27) return undefined;
  const size = 1 << (info - 24);
  if (at + 1 + size > limit) return undefined;
  let value = 0n;
  for (let i = 0; i < size; i++)
    value = (value << 8n) | BigInt(bytes[at + 1 + i]!);
  return {
    major,
    value: value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value,
    next: at + 1 + size,
    isBreak: false,
  };
};

/** The length a head states, when it fits before `limit` */
const lengthOf = (head: Head, limit: number) =>
  typeof head.value === "number" && head.next + head.value <= limit
    ? head.value
    : undefined;

/** The major type of a byte string and of an array */
const BYTES = 2;
const ARRAY = 4;

/**
 * What the item after a tag of Plutus data must be: a byte string after the tags of a big
 * integer (2 and 3), a list after the tag of a constructor (121 to 127, 1280 to 1400, and 102 for
 * the general form). Undefined for a tag Plutus data does not use
 */
const plutusTagHolds = (tag: number | bigint): number | undefined => {
  const n = Number(tag);
  if (n === 2 || n === 3) return BYTES;
  if ((n >= 121 && n <= 127) || (n >= 1280 && n <= 1400) || n === 102)
    return ARRAY;
  return undefined;
};

/** One CBOR item as `walkItem` found it */
type WalkedItem = {
  /** The offset after the item */
  end: number;
  /** The deepest nesting inside it: each array, map and tag one level */
  depth: number;
};

/**
 * Walks the CBOR item at `start` without recursion and without decoding it into a value: the
 * time it takes grows with the bytes alone. With `plutus`, the item must also be Plutus data in
 * its shape: integers, byte strings, lists, maps and the tags of big integers and constructors,
 * never a text, a float or a simple value. Undefined where the bytes from `start` are not one
 * such item
 */
const walkItem = (
  bytes: Uint8Array,
  start: number,
  plutus: boolean,
): WalkedItem | undefined => {
  // The items left in each open container, -1 for an indefinite length; the item itself first
  const left: number[] = [1];
  let depth = 0;
  // The major type the item after a tag of Plutus data must have
  let expected: number | undefined;
  const done = () => {
    for (;;) {
      const top = left.length - 1;
      if (top < 0 || left[top] === -1) return;
      left[top]!--;
      if (left[top] !== 0) return;
      left.pop();
    }
  };
  const open = (items: number) => {
    left.push(items);
    depth = Math.max(depth, left.length - 1);
  };
  let at = start;
  while (left.length > 0) {
    const head = readHead(bytes, at, bytes.length);
    if (!head) return undefined;
    at = head.next;
    if (head.isBreak) {
      if (left[left.length - 1] !== -1) return undefined;
      left.pop();
      done();
      continue;
    }
    if (plutus) {
      if (expected !== undefined && head.major !== expected) return undefined;
      expected = undefined;
    }
    switch (head.major) {
      case 2:
      case 3: {
        if (plutus && head.major === 3) return undefined;
        if (head.value === undefined)
          for (;;) {
            const chunk = readHead(bytes, at, bytes.length);
            if (!chunk) return undefined;
            at = chunk.next;
            if (chunk.isBreak) break;
            const length =
              chunk.major === head.major
                ? lengthOf(chunk, bytes.length)
                : undefined;
            if (length === undefined) return undefined;
            at += length;
          }
        else {
          const length = lengthOf(head, bytes.length);
          if (length === undefined) return undefined;
          at += length;
        }
        done();
        break;
      }
      case 4:
      case 5: {
        if (head.value === undefined) {
          open(-1);
          break;
        }
        if (typeof head.value !== "number") return undefined;
        const items = head.value * (head.major === 5 ? 2 : 1);
        if (items > bytes.length - at) return undefined;
        if (items === 0) done();
        else open(items);
        break;
      }
      case 6:
        if (plutus) {
          expected = plutusTagHolds(head.value!);
          if (expected === undefined) return undefined;
        }
        open(1);
        break;
      default:
        if (plutus && head.major === 7) return undefined;
        done();
    }
  }
  return { end: at, depth };
};

/**
 * The offset after the CBOR item at `start`, found without recursion and without decoding the
 * item into a value: the time it takes grows with the bytes alone. Undefined where the bytes
 * from `start` are not one well-formed item
 */
export const itemEnd = (bytes: Uint8Array, start = 0): number | undefined =>
  walkItem(bytes, start, false)?.end;

/** What `notPlutusData` says of one item of Plutus data with bytes after it */
export const BYTES_AFTER_DATA = "bytes follow the data";

/**
 * Why `bytes` are not exactly one item of Plutus data, found by a walk that decodes nothing, in
 * a time that grows with the bytes alone however deep the data nests; undefined when they are
 * one. It judges the shape of the data, which is all a ledger asks of it
 */
export const notPlutusData = (bytes: Uint8Array): string | undefined => {
  const walked = walkItem(bytes, 0, true);
  if (walked) return walked.end === bytes.length ? undefined : BYTES_AFTER_DATA;
  return itemEnd(bytes) === undefined
    ? "it is not well-formed CBOR"
    : "it holds what Plutus data does not: a text, a float, a simple value or a tag of no integer or constructor";
};

/**
 * The deepest nesting of the one CBOR item `bytes` hold, each array, map and tag one level, found
 * without recursion; undefined where they are not one well-formed item
 */
export const itemDepth = (bytes: Uint8Array): number | undefined => {
  const walked = walkItem(bytes, 0, false);
  return walked && walked.end === bytes.length ? walked.depth : undefined;
};

/** A transaction unspent output in CBOR, with the CBOR its output holds apart */
export type UtxoBytes = {
  /**
   * The same bytes with an inline datum in place of the one written: the integer 0, which a
   * value decoder reads at no cost
   */
  standIn: Uint8Array;
  /** The CBOR of the inline datum, as the output holds it, its chunks joined */
  inlineDatum?: Uint8Array;
  /** The CBOR of the reference script, `[language, script]`, its chunks joined */
  scriptRef?: Uint8Array;
};

/** What stands in for the byte string of an inline datum: `h'00'`, which holds the integer 0 */
const STAND_IN_DATUM = Uint8Array.of(0x41, 0x00);

/**
 * The content of the byte string at `at` and the offset after it, its chunks joined; undefined
 * when there is no byte string there
 */
const byteStringAt = (
  bytes: Uint8Array,
  at: number,
): { content: Uint8Array; end: number } | undefined => {
  const head = readHead(bytes, at, bytes.length);
  if (!head || head.isBreak || head.major !== BYTES) return undefined;
  if (head.value !== undefined) {
    const length = lengthOf(head, bytes.length);
    if (length === undefined) return undefined;
    return {
      content: bytes.subarray(head.next, head.next + length),
      end: head.next + length,
    };
  }
  const chunks: Uint8Array[] = [];
  let next = head.next;
  for (;;) {
    const chunk = readHead(bytes, next, bytes.length);
    if (!chunk) return undefined;
    if (chunk.isBreak)
      return { content: Buffer.concat(chunks), end: chunk.next };
    const length =
      chunk.major === BYTES ? lengthOf(chunk, bytes.length) : undefined;
    if (length === undefined) return undefined;
    chunks.push(bytes.subarray(chunk.next, chunk.next + length));
    next = chunk.next + length;
  }
};

/** The byte string under tag 24 at `at`, where the bytes hold one; undefined otherwise */
const encodedAt = (bytes: Uint8Array, at: number) => {
  const tag = readHead(bytes, at, bytes.length);
  if (!tag || tag.major !== 6 || tag.value !== ENCODED_CBOR) return undefined;
  const string = byteStringAt(bytes, tag.next);
  return string && { start: tag.next, ...string };
};

/**
 * Finds, without decoding anything, the inline datum and the reference script of a transaction
 * unspent output `[input, output]` in CBOR, and writes the same bytes with a stand-in for the
 * datum, so that a value decoder reads the rest without reading data of any depth. An output in
 * the array form holds neither. Undefined where the bytes are not one well-formed item; an output
 * of a shape this walk does not know is left as written, for the decoder to judge
 */
export const splitUtxoBytes = (bytes: Uint8Array): UtxoBytes | undefined => {
  if (itemEnd(bytes) === undefined) return undefined;
  const top = readHead(bytes, 0, bytes.length)!;
  if (top.major !== ARRAY || (top.value !== 2 && top.value !== undefined))
    return { standIn: bytes };
  const outputStart = itemEnd(bytes, top.next);
  const output =
    outputStart === undefined
      ? undefined
      : readHead(bytes, outputStart, bytes.length);
  if (!output || output.isBreak || output.major !== 5)
    return { standIn: bytes };
  const found: Omit<UtxoBytes, "standIn"> = {};
  // The byte strings of inline datums, which the stand-in replaces: a repeated key is left to the
  // decoder, which reads the last
  const datums: { start: number; end: number }[] = [];
  let at = output.next;
  for (
    let pair = 0;
    output.value === undefined || pair < output.value;
    pair++
  ) {
    const key = readHead(bytes, at, bytes.length);
    if (!key || key.isBreak) break;
    const valueStart = itemEnd(bytes, at)!;
    const valueEnd = itemEnd(bytes, valueStart);
    if (valueEnd === undefined) break;
    if (key.major === 0 && key.value === 3) {
      const script = encodedAt(bytes, valueStart);
      if (script) found.scriptRef = script.content;
    }
    if (key.major === 0 && key.value === 2) {
      // [1, 24(h'…')], in a list of either kind of length
      const option = readHead(bytes, valueStart, bytes.length);
      const kind =
        option && option.major === ARRAY && !option.isBreak
          ? readHead(bytes, option.next, bytes.length)
          : undefined;
      const inline =
        kind && kind.major === 0 && kind.value === 1
          ? encodedAt(bytes, kind.next)
          : undefined;
      if (inline) {
        found.inlineDatum = inline.content;
        datums.push({ start: inline.start, end: inline.end });
      }
    }
    at = valueEnd;
  }
  const pieces: Uint8Array[] = [];
  let from = 0;
  for (const { start, end } of datums) {
    pieces.push(bytes.subarray(from, start), STAND_IN_DATUM);
    from = end;
  }
  pieces.push(bytes.subarray(from));
  return { standIn: Buffer.concat(pieces), ...found };
};

const hexOf = (bytes: Uint8Array, from: number, to: number) =>
  Buffer.from(bytes.subarray(from, to)).toString("hex");

/**
 * The value of the item at `start..end`, as a text in which two items are equal when they are
 * the same value: an integer whatever the width it is written in, a byte or text string whatever
 * its chunks, arrays and maps item by item whatever their kind of length, a tag with its number.
 * The item was walked already, so it is well-formed and its depth is bounded
 */
const keyText = (bytes: Uint8Array, start: number, end: number): string => {
  const out: string[] = [];
  // The open containers: the items left in each, -1 for an indefinite length
  const left: number[] = [];
  const done = () => {
    for (;;) {
      const top = left.length - 1;
      if (top < 0 || left[top] === -1) return;
      left[top]!--;
      if (left[top] !== 0) return;
      left.pop();
      out.push(")");
    }
  };
  let at = start;
  while (at < end) {
    const from = at;
    const head = readHead(bytes, at, end)!;
    at = head.next;
    if (head.isBreak) {
      left.pop();
      out.push(")");
      done();
      continue;
    }
    switch (head.major) {
      case 0:
      case 1:
        out.push(`${head.major}:${head.value!.toString()}`);
        done();
        break;
      case 2:
      case 3: {
        let content = "";
        if (head.value === undefined) {
          for (;;) {
            const chunk = readHead(bytes, at, end)!;
            at = chunk.next;
            if (chunk.isBreak) break;
            content += hexOf(bytes, at, at + (chunk.value as number));
            at += chunk.value as number;
          }
        } else {
          content = hexOf(bytes, at, at + (head.value as number));
          at += head.value as number;
        }
        out.push(`${head.major}:${content}`);
        done();
        break;
      }
      case 4:
      case 5: {
        const items =
          head.value === undefined
            ? -1
            : (head.value as number) * (head.major === 5 ? 2 : 1);
        out.push(`${head.major}(`);
        if (items === 0) {
          out.push(")");
          done();
        } else left.push(items);
        break;
      }
      case 6:
        out.push(`6:${head.value!.toString()}(`);
        left.push(1);
        break;
      default:
        out.push(`7:${hexOf(bytes, from, head.next)}`);
        done();
    }
  }
  return out.join(",");
};

/** A container, a tag or a byte string holding CBOR, open while its items are walked */
type Frame = {
  kind: "array" | "map" | "tag" | "encoded";
  /** The items left, -1 for an indefinite length; a map counts its keys and its values */
  left: number;
  depth: number;
  role: Role;
  /** The offset its items end before at the latest: the end of a byte string holding CBOR */
  limit: number;
  /** The items walked so far */
  walked: number;
  /** The offset of the item being walked */
  itemStart: number;
  /**
   * The keys of a map whose keys are compared, each as `keyText` gives it; of redeemers in the
   * array form, the purpose of each
   */
  keys?: Set<string>;
  /** The key of the value being walked, in a map whose keys are compared */
  lastKey?: string;
  /** A tag's number */
  tag?: number | bigint;
  /** The offset of its first item */
  start: number;
  /** The items walked in the whole transaction before its first */
  itemsBefore: number;
};

/** The key 5 of a witness set, its redeemers, as `keyText` writes it */
const REDEEMERS_KEY = "0:5";
/** The key 0 of tagged auxiliary data, its metadata, as `keyText` writes it */
const METADATA_KEY = "0:0";

/** The role of the item a container walks next */
const roleOfItem = (frame: Frame): Role => {
  switch (frame.role) {
    case "top":
      return "tx";
    case "tx":
      return frame.walked === 0
        ? "body"
        : frame.walked === 1
          ? "witnessSet"
          : frame.walked === 3
            ? "aux"
            : "plain";
    case "body":
    case "inBody":
      return "inBody";
    case "witnessSet":
      return frame.walked % 2 === 1 && frame.lastKey === REDEEMERS_KEY
        ? "redeemers"
        : "plain";
    case "redeemers":
      // In the array form each item is a redeemer, [tag, index, data, units]
      return frame.kind === "array" ? "redeemer" : "plain";
    case "aux":
      // A map of metadata, an array [metadata, scripts], or a tagged map whose key 0 is metadata
      return frame.kind === "tag"
        ? "auxMap"
        : frame.kind === "array" && frame.walked === 0
          ? "metadata"
          : "plain";
    case "auxMap":
      return frame.walked % 2 === 1 && frame.lastKey === METADATA_KEY
        ? "metadata"
        : "plain";
    default:
      return "plain";
  }
};

/**
 * Walks the bytes of a transaction once, without recursion, and refuses one that cannot be read
 * in a single way, or in reasonable time:
 * - that is not an array of four items, the form of every era since Alonzo;
 * - nested deeper than `MAX_TX_DEPTH` anywhere, the items inside a byte string that holds CBOR
 *   included, and with such a byte string written in chunks;
 * - with a map that repeats a key, keys compared by value: the body and every map inside it (not
 *   inside its byte strings), the witness set itself, the redeemers of the witness set (the keys
 *   of the map form, the tag and index of each item of the array form; not their data), and the
 *   auxiliary data, its metadata map in each of its three forms. Plutus data may repeat the keys
 *   of its maps, so the data of datums and redeemers is not compared;
 * - that is not one well-formed CBOR item. A byte string that holds CBOR that is not well-formed
 *   is passed over, and the decoder judges it.
 * @throws TxScanError with the reason, which quotes none of the bytes
 */
const scanBytes = (bytes: Uint8Array) => {
  const stack: Frame[] = [
    {
      kind: "array",
      left: 1,
      depth: 0,
      role: "top",
      limit: bytes.length,
      walked: 0,
      itemStart: 0,
      start: 0,
      itemsBefore: 0,
    },
  ];
  let at = 0;
  // The items walked so far, and the work the value decoder does for the containers closed
  let items = 0;
  let work = 0;

  /**
   * A container is closed at `at`: the value decoder copies what is left of its bytes for each
   * item inside it, so its work is its items times its bytes
   */
  const closed = (frame: Frame) => {
    if (frame.role !== "plain" && frame.role !== "metadata") return;
    work += (items - frame.itemsBefore) * (at - frame.start);
    if (work > MAX_TX_WORK) throw new TxScanError(TOO_MUCH_DATA);
  };

  /** An item of the innermost container is walked: a key is compared, the count goes down */
  const itemDone = () => {
    const frame = stack[stack.length - 1]!;
    items++;
    if (frame.keys && frame.kind === "map" && frame.walked % 2 === 0) {
      const key = keyText(bytes, frame.itemStart, at);
      if (frame.keys.has(key))
        throw new TxScanError(
          `a map in ${CHECKED[frame.role]} repeats a key, which decoders read in different ways`,
        );
      frame.keys.add(key);
      frame.lastKey = key;
    }
    // A redeemer of the array form names its purpose by its first two items, its tag and index
    if (
      frame.role === "redeemer" &&
      frame.kind === "array" &&
      frame.walked === 1
    ) {
      const purposes = stack[stack.length - 2]!.keys!;
      const purpose = keyText(bytes, frame.start, at);
      if (purposes.has(purpose))
        throw new TxScanError(
          "the redeemers of its witness set name one purpose twice, which decoders read in different ways",
        );
      purposes.add(purpose);
    }
    frame.walked++;
    if (frame.left > 0) frame.left--;
  };

  /** Bytes that are not well-formed: in a byte string that holds CBOR, the walk goes on after it */
  const notWellFormed = () => {
    const index = stack.map((f) => f.kind).lastIndexOf("encoded");
    if (index === -1) throw malformed();
    at = stack[index]!.limit;
    stack.length = index;
    itemDone();
  };

  const open = (
    frame: Omit<Frame, "walked" | "itemStart" | "start" | "itemsBefore">,
  ) => {
    if (frame.depth > MAX_TX_DEPTH)
      throw new TxScanError(
        `the transaction nests its items deeper than the ${MAX_TX_DEPTH} levels this library reads`,
      );
    stack.push({
      ...frame,
      walked: 0,
      itemStart: at,
      start: at,
      itemsBefore: items,
    });
  };

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const { limit } = frame;
    if (frame.left === 0) {
      stack.pop();
      if (stack.length === 0) break;
      // What is left of a byte string after the CBOR it holds is passed over with it
      if (frame.kind === "encoded") at = limit;
      closed(frame);
      itemDone();
      continue;
    }
    const head = readHead(bytes, at, limit);
    if (!head) {
      notWellFormed();
      continue;
    }
    if (head.isBreak) {
      // A break ends an indefinite length only, and never stands between a key and its value
      if (
        frame.left !== -1 ||
        (frame.kind === "map" && frame.walked % 2 === 1)
      ) {
        notWellFormed();
        continue;
      }
      at = head.next;
      stack.pop();
      closed(frame);
      itemDone();
      continue;
    }
    frame.itemStart = at;
    const role = roleOfItem(frame);
    const depth = frame.depth + 1;
    if (role === "tx" && !(head.major === 4 && head.value === 4))
      throw new TxScanError(
        "the transaction is not an array of four items (its body, witness set, validity flag and auxiliary data): the forms of earlier eras are not read",
      );
    switch (head.major) {
      case 0:
      case 1:
        at = head.next;
        itemDone();
        break;
      case 2:
      case 3: {
        if (head.value === undefined) {
          // No encoder writes the CBOR a byte string holds in chunks, and the decoder joins them
          if (
            head.major === 2 &&
            frame.kind === "tag" &&
            frame.tag === ENCODED_CBOR
          )
            throw new TxScanError(
              "the transaction writes a byte string that holds CBOR (tag 24) in chunks, which no encoder does",
            );
          // A string in chunks: each a string of the same type with a stated length
          let next = head.next;
          for (;;) {
            const chunk = readHead(bytes, next, limit);
            const length =
              chunk && !chunk.isBreak && chunk.major === head.major
                ? lengthOf(chunk, limit)
                : undefined;
            if (chunk?.isBreak) {
              next = chunk.next;
              break;
            }
            if (length === undefined) {
              next = -1;
              break;
            }
            next = chunk!.next + length;
          }
          if (next === -1) notWellFormed();
          else {
            at = next;
            itemDone();
          }
          break;
        }
        const length = lengthOf(head, limit);
        if (length === undefined) {
          notWellFormed();
          break;
        }
        at = head.next;
        if (
          head.major === 2 &&
          frame.kind === "tag" &&
          frame.tag === ENCODED_CBOR
        ) {
          // The CBOR the string holds is walked for its depth, its keys are not compared
          stack.push({
            kind: "encoded",
            left: 1,
            depth: frame.depth,
            role: "plain",
            limit: at + length,
            walked: 0,
            itemStart: at,
            start: at,
            itemsBefore: items,
          });
          break;
        }
        at += length;
        itemDone();
        break;
      }
      case 4:
      case 5: {
        const items =
          head.value === undefined
            ? -1
            : typeof head.value === "number"
              ? head.value * (head.major === 5 ? 2 : 1)
              : Infinity;
        // Each item takes a byte at least
        if (items > limit - head.next) {
          notWellFormed();
          break;
        }
        at = head.next;
        open({
          kind: head.major === 4 ? "array" : "map",
          left: items,
          depth,
          role,
          limit,
          ...(((head.major === 5 && CHECKED[role] !== undefined) ||
            (head.major === 4 && role === "redeemers")) && {
            keys: new Set<string>(),
          }),
        });
        break;
      }
      case 6:
        if (head.value === undefined) {
          notWellFormed();
          break;
        }
        at = head.next;
        open({ kind: "tag", left: 1, depth, role, limit, tag: head.value });
        break;
      default:
        // A simple value or a float, whose bytes the head counts
        at = head.next;
        itemDone();
    }
  }
  if (at !== bytes.length) throw malformed();
  return work;
};

/**
 * Walks a transaction given as CBOR hex, as `scanBytes` says, and refuses one larger than
 * `maxBytes`; a value that is not hex is left to the reader, which refuses it
 * @param maxBytes The largest transaction read: the `maxTxSize` of the protocol parameters the
 *   builder holds, else `MAX_TX_BYTES`
 * @throws TxScanError with the reason, which quotes none of the text
 */
export const scanTransaction = (
  text: unknown,
  maxBytes = MAX_TX_BYTES,
): number | undefined => {
  if (typeof text !== "string") return undefined;
  if (text.length > 2 * maxBytes)
    throw new TxScanError(
      `the transaction is more than the ${maxBytes} bytes of the protocol's maximum transaction size`,
    );
  if (
    text.length === 0 ||
    text.length % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/.test(text)
  )
    return undefined;
  return scanBytes(Buffer.from(text, "hex"));
};
