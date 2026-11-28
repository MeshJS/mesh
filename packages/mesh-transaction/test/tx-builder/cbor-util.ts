import { CborReader, Crypto, HexBlob, Serialization } from "@meshsdk/core-cst";

import type { TestKey } from "./hash-signer-util";

/*
 * Transactions written byte by byte, so that their encoding is exactly the one a test names: a
 * body with tagged sets, with plain arrays, or of indefinite length with 8-byte integers and its
 * keys out of order; witness sets with a tagged, a plain or an indefinite-length list. Keys come
 * from `testKey` and are never printed.
 */

export const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** The blake2b hash of the bytes a hex text stands for */
export const blake = (text: string, size: 28 | 32) =>
  Crypto.blake2b.hash(HexBlob(text), size).toString();

/** The CBOR head of a major type with the shortest form of `n` */
export const head = (major: number, n: number) => {
  const m = major << 5;
  if (n < 24) return hex(Uint8Array.of(m | n));
  if (n < 0x100) return hex(Uint8Array.of(m | 24, n));
  if (n < 0x10000) return hex(Uint8Array.of(m | 25, n >> 8, n & 0xff));
  const b = Buffer.alloc(5);
  b[0] = m | 26;
  b.writeUInt32BE(n, 1);
  return hex(b);
};
export const uint = (n: number) => head(0, n);
/** An unsigned integer in the 8-byte form: not the shortest */
export const uint64 = (n: number | bigint) => {
  const b = Buffer.alloc(9);
  b[0] = 0x1b;
  b.writeBigUInt64BE(BigInt(n), 1);
  return hex(b);
};
export const bytes = (text: string) => head(2, text.length / 2) + text;
/** A byte string of indefinite length, in chunks of `size` bytes */
export const chunkedBytes = (text: string, size = 1) => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size * 2)
    chunks.push(bytes(text.slice(i, i + size * 2)));
  return `5f${chunks.join("")}ff`;
};
export const arr = (...items: string[]) =>
  head(4, items.length) + items.join("");
export const arrIndef = (...items: string[]) => `9f${items.join("")}ff`;
export const map = (...pairs: [string, string][]) =>
  head(5, pairs.length) + pairs.flat().join("");
export const mapIndef = (...pairs: [string, string][]) =>
  `bf${pairs.flat().join("")}ff`;
export const tag258 = (item: string) => `d90102${item}`;

/** The CRC-32 a Byron address writes after its payload */
const crc32 = (text: string) => {
  let crc = 0xffffffff;
  for (const byte of Buffer.from(text, "hex")) {
    crc ^= byte;
    for (let k = 0; k < 8; k++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
};
/**
 * The bytes of a Byron address of the test networks whose derivation path attribute holds
 * `pathBytes` bytes: 51 bytes more than that, from 24 to 255
 */
export const byronAddress = (pathBytes: number) => {
  const payload = arr(
    bytes("ab".repeat(28)),
    map(
      [uint(1), bytes(bytes("cd".repeat(pathBytes)))],
      [uint(2), bytes(uint(1))],
    ),
    uint(0),
  );
  return arr(`d818${bytes(payload)}`, uint(crc32(payload)));
};
/** Constructor 0 of Plutus data around these fields, as a definite list */
export const constr0 = (...fields: string[]) => `d879${arr(...fields)}`;
/** Constructor 0 of Plutus data around these fields, as a list of indefinite length */
export const constr0Indef = (...fields: string[]) =>
  `d879${arrIndef(...fields)}`;

/** A vkey witness in the usual form */
export const vkeyWitness = (key: TestKey, txHash: string) =>
  arr(bytes(key.vkey), bytes(key.sign(txHash)));

/** The transaction the inputs of `body` come from */
export const TX_IN = "11".repeat(32);

/** The form of a body: tagged sets, plain arrays, or an odd encoding */
export type BodyForm = "tagged" | "plain" | "odd";

/**
 * A transaction body paying 3 ada to `to` from input `TX_IN#i` of each `i` of `inputs`
 * @param form `tagged`: sets with the set tag and an output as a map; `plain`: arrays and an
 *   output as an array; `odd`: an indefinite-length map with its keys out of order, an
 *   indefinite-length input list and 8-byte integers
 * @param to The address paid, in hex
 * @param extra More entries of the body, as key and value in hex
 */
export const body = (
  form: BodyForm,
  {
    inputs = [0],
    to,
    fee = 170_000,
    extra = [],
  }: {
    inputs?: number[];
    to: string;
    fee?: number;
    extra?: [string, string][];
  },
) => {
  const ins = inputs.map((i) => arr(bytes(TX_IN), uint(i)));
  if (form === "tagged")
    return map(
      [uint(0), tag258(arr(...ins))],
      [uint(1), arr(map([uint(0), bytes(to)], [uint(1), uint(3_000_000)]))],
      [uint(2), uint(fee)],
      ...extra,
    );
  if (form === "plain")
    return map(
      [uint(0), arr(...ins)],
      [uint(1), arr(arr(bytes(to), uint(3_000_000)))],
      [uint(2), uint(fee)],
      ...extra,
    );
  return mapIndef(
    [uint(2), uint64(fee)],
    [uint(1), arrIndef(arr(bytes(to), uint64(3_000_000)))],
    [uint(0), arrIndef(...ins)],
    ...extra,
  );
};

/** The hash of a body: blake2b-256 of its bytes */
export const txHashOf = (bodyHex: string) => blake(bodyHex, 32);

/** A transaction of four items */
export const tx = (
  bodyHex: string,
  witnessSetHex: string = map(),
  { valid = "f5", aux = "f6" }: { valid?: string; aux?: string } = {},
) => arr(bodyHex, witnessSetHex, valid, aux);

/** The top-level items of a transaction, each as hex */
export const topItems = (txHex: string) => {
  const reader = new CborReader(HexBlob(txHex));
  const length = reader.readStartArray();
  const items: string[] = [];
  const end = Serialization.CborReaderState.EndArray;
  while (length === null ? reader.peekState() !== end : items.length < length)
    items.push(hex(reader.readEncodedValue()));
  return items;
};

/** A transaction marked as failing: its validity flag false, its other items as written */
export const markedFailing = (txHex: string) => {
  const [bodyHex, witnessSetHex, , aux] = topItems(txHex);
  return tx(bodyHex!, witnessSetHex, { valid: "f4", aux });
};

/** The key-value pairs of a CBOR map, each as hex */
export const mapPairs = (mapHex: string) => {
  const reader = new CborReader(HexBlob(mapHex));
  const length = reader.readStartMap();
  const pairs: [string, string][] = [];
  const end = Serialization.CborReaderState.EndMap;
  while (length === null ? reader.peekState() !== end : pairs.length < length)
    pairs.push([
      hex(reader.readEncodedValue()),
      hex(reader.readEncodedValue()),
    ]);
  return pairs;
};

/** The witness-set entry of a key of a transaction, as hex; undefined when it has none */
export const witnessEntry = (txHex: string, key: number) =>
  mapPairs(topItems(txHex)[1]!).find(([k]) => k === uint(key))?.[1];
