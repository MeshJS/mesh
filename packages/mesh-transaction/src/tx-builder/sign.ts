import type { TransactionPrototype } from "@meshsdk/common";
import {
  Address,
  CborReader,
  CborWriter,
  CredentialType,
  Crypto,
  HexBlob,
  keyWitnessSetTags,
  Serialization,
  Transaction,
  transactionPrototypeFromCardano,
} from "@meshsdk/core-cst";

import type { Utxo, UtxoInput } from "./parts/types";
import type { PlacedUtxos } from "./parts/utxo";
import type { RequiredKeys } from "./payer";
import type { Collected, SignerRole, TxSigners } from "./witnesses";
import { TxBuildError, TxPlanError } from "./errors";
import { errorText } from "./parts/normalize";
import { heldValue } from "./parts/shape";
import {
  heldScriptSize,
  placeUtxos,
  readPlaced,
  UtxoTwiceError,
} from "./parts/utxo";
import { walletCodeOf } from "./payer";
import { checkConwayKeys, MAX_REF_SCRIPT_BYTES, TxScanError } from "./tx-scan";
import {
  addAddress,
  addCredential,
  addKey,
  addNativeScript,
  certificateKeys,
  emptyCollected,
  nativeScriptEntry,
  nativeScriptRef,
  signersOf,
} from "./witnesses";

/** A key a signer of transaction hashes is asked for, with every role it is asked in */
export type AskedKey = {
  /** The key hash (blake2b-224 of the public key), in lower-case hex */
  readonly keyHash: string;
  /**
   * Why the key is asked for, each role once: the roles the transaction needs its signature in,
   * in the order of the members of `SignerRole`, then `"nativeScript"` when a native script the
   * transaction runs names the key. A key with `"nativeScript"` alone is not required: the
   * script may be satisfied without it. Empty when the caller named the key and not why
   * (`signWitnesses` with key hashes)
   */
  readonly roles: readonly (SignerRole | "nativeScript")[];
};

/** What a signer of transaction hashes is asked: one call for one transaction */
export type TxHashRequest = {
  /**
   * The hash to sign: blake2b-256 of the transaction's body, 32 bytes in lower-case hex. It is
   * signed as its 32 bytes, not as its hex text, and nothing else is to be signed
   */
  readonly txHash: string;
  /**
   * The keys asked for, without those that have signed already: the keys the transaction needs,
   * then those only its native scripts name. Absent only when `signWitnesses` is called without
   * key hashes: the signer then chooses its keys itself
   */
  readonly keys?: readonly AskedKey[];
  /**
   * The transaction `txHash` is the hash of, in CBOR hex, for a signer that checks what it signs
   */
  readonly tx: string;
  /** The signal of the call that asks, if it has one: the signer may stop its own request on it */
  readonly signal?: AbortSignal;
};

/** A signature of a transaction hash, with the public key it verifies with */
export type TxHashSignature = {
  /** The Ed25519 public key, 32 bytes in hex */
  readonly vkey: string;
  /** The Ed25519 signature of the 32 bytes of `txHash`, 64 bytes in hex */
  readonly signature: string;
};

/**
 * A signer that signs the hash of a transaction and needs to know nothing else of it: a key
 * service, a hardware module, a remote signer. `keySigner(key)` makes one over a private key.
 *
 * `signTxHash` answers with a signature for each key asked for that it holds, and with an empty
 * list when it holds none; it is not called when no key is left to sign. Every signature is
 * verified against `txHash` with its `vkey` before it is used, and the key hash is always taken
 * from `vkey`: an answer that is not such a list, or a signature that does not verify, is
 * SIGNER_FAILED. To decline, throw `new TxPlanError("SIGN_DECLINED", reason)`; anything else
 * thrown is SIGNER_FAILED with it as the `cause`, and its message is quoted: keep secrets out of
 * it. A signer that needs the whole transaction and answers with a CBOR witness set implements
 * `signTxWitnesses(tx, keyHashes?)` instead.
 */
export type TxHashSigner = {
  signTxHash(request: TxHashRequest): Promise<readonly TxHashSignature[]>;
};

/**
 * The callback form of a signer of transaction hashes: the function is called exactly as
 * `signTxHash` of a `TxHashSigner` is, with the same request, and its answer and its errors are
 * read the same way. It is called without a `this`
 */
export type SignTxHash = (
  request: TxHashRequest,
) => Promise<readonly TxHashSignature[]>;

/**
 * Something that signs. The forms are told apart by their methods, the first found in this order:
 * - `signTxWitnesses(tx, keyHashes?)`: a Mesh wallet, or own code that takes the transaction and
 *   answers with a CBOR witness set;
 * - `signTxHash(request)`: a signer of transaction hashes, `keySigner(key)` among them;
 * - `signTx(tx, partialSign?)`: a CIP-30 api, or a Mesh 1.9 wallet.
 *
 * A function with none of these methods is a signer of transaction hashes in its callback form
 * (`SignTxHash`). A private key is not a signer as it is: `keySigner(key)` makes one of it.
 */
export type Signer =
  | { signTxWitnesses(tx: string, keyHashes?: RequiredKeys): Promise<string> }
  | TxHashSigner
  | SignTxHash
  | {
      signTx(
        tx: string,
        partialSign?: boolean,
        returnFullTx?: boolean,
      ): Promise<string>;
    };

/* ---------------------------------------------------------------------------------------------
 * Reading and writing CBOR as raw items, so that what is not changed keeps its bytes
 * ------------------------------------------------------------------------------------------- */

const State = Serialization.CborReaderState;
/** Witness-set keys of vkey and bootstrap witnesses */
const VKEYS = 0;
const BOOTSTRAPS = 2;
/** The first byte of CBOR null */
const NULL = 0xf6;
/** The CBOR tag of a set */
const SET_TAG = 258;

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const readerOf = (bytes: Uint8Array) => new CborReader(HexBlob(toHex(bytes)));
const concat = (...chunks: Uint8Array[]) =>
  new Uint8Array(Buffer.concat(chunks));
const isHex = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length % 2 === 0 &&
  /^[0-9a-fA-F]*$/.test(value);

const expectFinished = (reader: CborReader) => {
  if (reader.peekState() !== State.Finished)
    throw new Error("unexpected bytes after the CBOR item");
};

/** The items of an array or the keys and values of a map, each as written */
type Container = {
  /** Every byte before the first item */
  header: Uint8Array;
  items: Uint8Array[];
  /** Every byte after the last item: the break of an indefinite length */
  trailer: Uint8Array;
  definite: boolean;
  /** Whether the container carries the set tag */
  tagged: boolean;
};

/** Reads an array, or a map (its keys and values in turn), as raw items */
const readContainer = (
  bytes: Uint8Array,
  kind: "array" | "map",
  { tag = false } = {},
): Container => {
  const reader = readerOf(bytes);
  let tagged = false;
  if (tag && reader.peekState() === State.Tag) {
    const found = Number(reader.readTag());
    if (found !== SET_TAG) throw new Error(`unexpected CBOR tag ${found}`);
    tagged = true;
  }
  const state = reader.peekState();
  if (state !== (kind === "array" ? State.StartArray : State.StartMap))
    throw new Error(`expected a CBOR ${kind}`);
  const length =
    kind === "array" ? reader.readStartArray() : reader.readStartMap();
  const count = length === null ? undefined : length * (kind === "map" ? 2 : 1);
  const items: Uint8Array[] = [];
  const end = kind === "array" ? State.EndArray : State.EndMap;
  while (
    count === undefined ? reader.peekState() !== end : items.length < count
  )
    items.push(reader.readEncodedValue());
  if (kind === "array") reader.readEndArray();
  else reader.readEndMap();
  expectFinished(reader);
  const inner = items.reduce((size, item) => size + item.length, 0);
  const trailerLength = length === null ? 1 : 0;
  const headerLength = bytes.length - inner - trailerLength;
  return {
    header: bytes.slice(0, headerLength),
    items,
    trailer: bytes.slice(bytes.length - trailerLength),
    definite: length !== null,
    tagged,
  };
};

const readUint = (bytes: Uint8Array) => {
  const reader = readerOf(bytes);
  if (reader.peekState() !== State.UnsignedInteger)
    throw new Error("expected an unsigned integer as a witness-set key");
  const value = Number(reader.readUInt());
  expectFinished(reader);
  return value;
};

const readBytes = (reader: CborReader, what: string, size?: number) => {
  if (
    reader.peekState() !== State.ByteString &&
    reader.peekState() !== State.StartIndefiniteLengthByteString
  )
    throw new Error(`expected the ${what} as a byte string`);
  const bytes = reader.readByteString();
  if (size !== undefined && bytes.length !== size)
    throw new Error(`the ${what} is ${bytes.length} bytes, not ${size}`);
  return toHex(bytes);
};

/** A vkey or bootstrap witness, with the hash of its key */
export type KeyWitness = {
  kind: "vkey" | "bootstrap";
  /** The public key, 32 bytes in hex */
  vkey: string;
  /** The Ed25519 signature, 64 bytes in hex */
  signature: string;
  /** Of a bootstrap witness: the chain code, 32 bytes in hex */
  chainCode?: string;
  /** Of a bootstrap witness: the address attributes, in hex */
  attributes?: string;
  /** The blake2b-224 hash of the public key */
  keyHash: string;
};

const readWitness = (
  bytes: Uint8Array,
  kind: KeyWitness["kind"],
): KeyWitness => {
  const reader = readerOf(bytes);
  if (reader.peekState() !== State.StartArray)
    throw new Error(`expected a ${kind} witness as an array`);
  const length = reader.readStartArray();
  const fields = kind === "vkey" ? 2 : 4;
  if (length !== null && length !== fields)
    throw new Error(`a ${kind} witness has ${fields} fields, not ${length}`);
  const vkey = readBytes(reader, "public key", 32);
  const signature = readBytes(reader, "signature", 64);
  const witness: KeyWitness = {
    kind,
    vkey,
    signature,
    keyHash: Crypto.blake2b.hash(HexBlob(vkey), 28).toString(),
  };
  if (kind === "bootstrap") {
    witness.chainCode = readBytes(reader, "chain code", 32);
    witness.attributes = readBytes(reader, "attributes");
  }
  if (reader.peekState() !== State.EndArray)
    throw new Error(`a ${kind} witness has more than ${fields} fields`);
  reader.readEndArray();
  expectFinished(reader);
  return witness;
};

/** A vkey or bootstrap entry of a witness set: its witnesses and the form it is written in */
type WitnessEntry = Container & { witnesses: KeyWitness[] };

const readWitnessEntry = (
  bytes: Uint8Array,
  kind: KeyWitness["kind"],
): WitnessEntry => {
  const list = readContainer(bytes, "array", { tag: true });
  return { ...list, witnesses: list.items.map((w) => readWitness(w, kind)) };
};

/** A witness set read as raw entries, with its vkey and bootstrap entries decoded */
export type WitnessSet = {
  map: Container;
  entries: { key: number; keyBytes: Uint8Array; value: Uint8Array }[];
  vkeys?: WitnessEntry;
  bootstraps?: WitnessEntry;
};

const readWitnessSet = (bytes: Uint8Array): WitnessSet => {
  const map = readContainer(bytes, "map");
  const entries: WitnessSet["entries"] = [];
  for (let i = 0; i < map.items.length; i += 2)
    entries.push({
      key: readUint(map.items[i]!),
      keyBytes: map.items[i]!,
      value: map.items[i + 1]!,
    });
  // Of a key the set repeats, the last entry, as the value decoder reads it
  const valueOf = (key: number) =>
    [...entries].reverse().find((e) => e.key === key)?.value;
  const vkeys = valueOf(VKEYS);
  const bootstraps = valueOf(BOOTSTRAPS);
  return {
    map,
    entries,
    ...(vkeys && { vkeys: readWitnessEntry(vkeys, "vkey") }),
    ...(bootstraps && {
      bootstraps: readWitnessEntry(bootstraps, "bootstrap"),
    }),
  };
};

/**
 * Whether a witness set repeats a key, any key: witnesses written into it would stand in one of
 * its entries, and which of them a reader takes is not known to the writer. One rule with the
 * wallets of this library (`addVKeyWitnessesToTransaction` of `@meshsdk/core-cst`)
 */
export const repeatsKey = (set: WitnessSet): boolean =>
  new Set(set.entries.map((e) => e.key)).size !== set.entries.length;

/**
 * Refuses witnesses added to a witness set that repeats a key (`repeatsKey`), with the message of
 * the wallets
 * @throws TxBuildError INVALID_OPTION (`tx`)
 */
export const refuseRepeatedKey = (set: WitnessSet): void => {
  if (!repeatsKey(set)) return;
  throw new TxBuildError(
    "INVALID_OPTION",
    "the witness set of the transaction repeats a key, and a reader may take another entry than the one a witness is written into: none is written",
    {
      details: {
        option: "tx",
        value: "string",
        allowed: "a transaction in CBOR hex",
      },
    },
  );
};

/** The witnesses of a set, vkey witnesses first */
const witnessesOf = (set: WitnessSet) => [
  ...(set.vkeys?.witnesses ?? []),
  ...(set.bootstraps?.witnesses ?? []),
];

/** A transaction read as its raw top-level items, nothing of it decoded into a value */
export type RawItems = {
  hex: string;
  top: Container;
  witnessSet: WitnessSet;
  /** The blake2b-256 hash of the body bytes */
  txId: string;
  /** Whether the body writes its input set with the set tag */
  taggedSets: boolean;
};

/**
 * A transaction read as its raw top-level items, and its parts decoded into values once. Each
 * decode of a part takes a time that grows with the data it carries, so the parts are read here
 * and never decoded again; they are shared, and nothing changes them
 */
export type RawTx = RawItems & {
  body: Serialization.TransactionBody;
  witnesses: Serialization.TransactionWitnessSet;
  auxiliaryData?: Serialization.AuxiliaryData;
  /** The validity flag: true for a transaction of three items, which has none */
  isValid: boolean;
};

const bodyUsesSetTag = (body: Uint8Array) => {
  const reader = readerOf(body);
  const length = reader.readStartMap();
  for (let i = 0; length === null || i < length; i++) {
    if (length === null && reader.peekState() === State.EndMap) break;
    const key = reader.readUInt();
    if (key === 0n) return reader.peekState() === State.Tag;
    reader.skipValue();
  }
  return false;
};

const readRawItems = (hex: string): RawItems => {
  const top = readContainer(Buffer.from(hex, "hex"), "array");
  // A transaction is an array of definite length: the body, the witness set, the validity
  // flag when it has four items, and the auxiliary data or null
  if (!top.definite || top.items.length < 3 || top.items.length > 4)
    throw new Error(
      "a transaction is an array of three or four items, of definite length",
    );
  return {
    hex,
    top,
    witnessSet: readWitnessSet(top.items[1]!),
    txId: Crypto.blake2b.hash(HexBlob(toHex(top.items[0]!)), 32).toString(),
    taggedSets: bodyUsesSetTag(top.items[0]!),
  };
};

const readRawTx = (hex: string): RawTx => {
  const items = readRawItems(hex);
  const [body, witnessSet, ...rest] = items.top.items;
  let isValid = true;
  if (rest.length === 2) {
    const reader = readerOf(rest.shift()!);
    isValid = reader.readBoolean();
    expectFinished(reader);
  }
  const auxiliaryData = rest[0]![0] === NULL ? undefined : rest[0]!;
  // A key of a later era, or of none, is refused before a value decoder reads its value
  checkConwayKeys(body!, witnessSet!);
  return {
    ...items,
    body: Serialization.TransactionBody.fromCbor(HexBlob(toHex(body!))),
    witnesses: Serialization.TransactionWitnessSet.fromCbor(
      HexBlob(toHex(witnessSet!)),
    ),
    ...(auxiliaryData && {
      auxiliaryData: Serialization.AuxiliaryData.fromCbor(
        HexBlob(toHex(auxiliaryData)),
      ),
    }),
    isValid,
  };
};

/**
 * The error for a `tx` argument that cannot be read as a transaction. A private key may be given
 * there by mistake, so `details.value` names only its JavaScript type, never the value
 */
const invalidTx = (tx: unknown, cause?: unknown) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid tx: expected a transaction in CBOR hex${cause === undefined ? "" : `: ${errorText(cause)}`}`,
    {
      details: {
        option: "tx",
        value: tx === null ? "null" : typeof tx,
        allowed: "a transaction in CBOR hex",
      },
      ...(cause !== undefined && { cause }),
    },
  );

/**
 * Reads `tx` as a transaction, its parts decoded once. A key the Conway ledger does not read, of
 * its body, an output or its witness set, is refused before they are decoded (`checkConwayKeys`)
 * @throws TxBuildError INVALID_OPTION for a value that is not the CBOR of a transaction whose
 *   vkey and bootstrap witnesses can be read, and for one with such a key
 */
export const readTransaction = (tx: unknown): RawTx => {
  if (!isHex(tx)) throw invalidTx(tx);
  try {
    return readRawTx(tx);
  } catch (error) {
    if (error instanceof TxScanError)
      throw new TxBuildError("INVALID_OPTION", `invalid tx: ${error.message}`, {
        details: {
          option: "tx",
          value: "string",
          allowed: "a transaction in CBOR hex",
        },
      });
    throw invalidTx(tx, error);
  }
};

/**
 * Reads `tx` as the raw items of a transaction, with its vkey and bootstrap witnesses, which the
 * value decoder judges as it judges them in a whole transaction; nothing else is decoded
 * @throws TxBuildError INVALID_OPTION as `readTransaction`
 */
export const readTransactionItems = (tx: unknown): RawItems => {
  if (!isHex(tx)) throw invalidTx(tx);
  try {
    const items = readRawItems(tx);
    const { vkeys, bootstraps } = items.witnessSet;
    for (const item of vkeys?.items ?? [])
      Serialization.VkeyWitness.fromCbor(HexBlob(toHex(item)));
    for (const item of bootstraps?.items ?? [])
      Serialization.BootstrapWitness.fromCbor(HexBlob(toHex(item)));
    return items;
  } catch (error) {
    throw invalidTx(tx, error);
  }
};

/**
 * The vkey and bootstrap witnesses of a witness set or of a full transaction, told apart by
 * value: a CBOR map or a CBOR array. Nothing else of it is read.
 * @throws Error for a value that is neither, or whose witnesses cannot be read
 */
export const readWitnessArgument = (
  value: unknown,
): {
  witnessSet: WitnessSet;
  witnesses: KeyWitness[];
  isTransaction: boolean;
} => {
  if (!isHex(value)) throw new Error("expected CBOR in hex");
  const bytes = Buffer.from(value, "hex");
  const state = readerOf(bytes).peekState();
  if (state === State.StartMap) {
    const witnessSet = readWitnessSet(bytes);
    return {
      witnessSet,
      witnesses: witnessesOf(witnessSet),
      isTransaction: false,
    };
  }
  if (state === State.StartArray) {
    const top = readContainer(bytes, "array");
    if (top.items.length < 3 || top.items.length > 4)
      throw new Error("a transaction has three or four items");
    readContainer(top.items[0]!, "map");
    const witnessSet = readWitnessSet(top.items[1]!);
    return {
      witnessSet,
      witnesses: witnessesOf(witnessSet),
      isTransaction: true,
    };
  }
  throw new Error(
    "expected a witness set (a CBOR map) or a transaction (a CBOR array)",
  );
};

const writeWitness = (witness: KeyWitness) => {
  const writer = new CborWriter();
  writer.writeStartArray(witness.kind === "vkey" ? 2 : 4);
  writer.writeByteString(Buffer.from(witness.vkey, "hex"));
  writer.writeByteString(Buffer.from(witness.signature, "hex"));
  if (witness.kind === "bootstrap") {
    writer.writeByteString(Buffer.from(witness.chainCode!, "hex"));
    writer.writeByteString(Buffer.from(witness.attributes!, "hex"));
  }
  return writer.encode();
};

/** A new witness-set entry: definite length, with the set tag when `tagged` */
const writeEntry = (witnesses: readonly KeyWitness[], tagged: boolean) => {
  const writer = new CborWriter();
  if (tagged) writer.writeTag(SET_TAG);
  writer.writeStartArray(witnesses.length);
  return concat(writer.encode(), ...witnesses.map(writeWitness));
};

/** An entry with witnesses appended, in the form it has: its tag and its kind of length */
const appendToEntry = (entry: WitnessEntry, added: readonly KeyWitness[]) => {
  const header = entry.definite
    ? (() => {
        const writer = new CborWriter();
        if (entry.tagged) writer.writeTag(SET_TAG);
        writer.writeStartArray(entry.items.length + added.length);
        return writer.encode();
      })()
    : entry.header;
  return concat(
    header,
    ...entry.items,
    ...added.map(writeWitness),
    entry.trailer,
  );
};

/** Whether the vkey entry and the bootstrap entry of a witness set are written with the set tag */
export type KeyWitnessTags = { vkey: boolean; bootstrap: boolean };

const bothTags = (tagged: boolean | KeyWitnessTags): KeyWitnessTags =>
  typeof tagged === "boolean" ? { vkey: tagged, bootstrap: tagged } : tagged;

/**
 * How a witness set writes its key witnesses: the set tag of its vkey entry and of its bootstrap
 * entry, each when the entry holds a witness
 */
export const keyWitnessTags = (set: WitnessSet): Partial<KeyWitnessTags> => ({
  ...(set.vkeys !== undefined &&
    set.vkeys.witnesses.length > 0 && { vkey: set.vkeys.tagged }),
  ...(set.bootstraps !== undefined &&
    set.bootstraps.witnesses.length > 0 && {
      bootstrap: set.bootstraps.tagged,
    }),
});

/**
 * A witness set holding only these witnesses: a vkey entry and a bootstrap entry, each when it
 * has a witness, with the set tag when `tagged`, which may differ between the two
 */
export const writeWitnessSet = (
  witnesses: readonly KeyWitness[],
  tagged: boolean | KeyWitnessTags,
): string => {
  const tags = bothTags(tagged);
  const vkeys = witnesses.filter((w) => w.kind === "vkey");
  const bootstraps = witnesses.filter((w) => w.kind === "bootstrap");
  const writer = new CborWriter();
  writer.writeStartMap(
    (vkeys.length > 0 ? 1 : 0) + (bootstraps.length > 0 ? 1 : 0),
  );
  if (vkeys.length > 0)
    writer.writeInt(VKEYS).writeEncodedValue(writeEntry(vkeys, tags.vkey));
  if (bootstraps.length > 0)
    writer
      .writeInt(BOOTSTRAPS)
      .writeEncodedValue(writeEntry(bootstraps, tags.bootstrap));
  return toHex(writer.encode());
};

/**
 * The key hashes witnesses sign for: those of their vkey witnesses. A bootstrap witness signs for
 * a Byron address the transaction spends from, never for a key hash, whatever key made it: the
 * ledger takes it for the address its key and attributes make
 */
export const keysSignedBy = (
  witnesses: readonly {
    readonly kind: KeyWitness["kind"];
    readonly keyHash: string;
  }[],
): Set<string> =>
  new Set(witnesses.filter((w) => w.kind === "vkey").map((w) => w.keyHash));

/** Keeps a witness of each public key once, leaving out those `held` has, in order */
export const newWitnesses = (
  witnesses: readonly KeyWitness[],
  held: readonly KeyWitness[] = [],
): KeyWitness[] => {
  const seen = new Set(held.map((w) => `${w.kind} ${w.vkey}`));
  return witnesses.filter((w) => {
    const key = `${w.kind} ${w.vkey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * The transaction without its vkey and bootstrap witnesses: the unsigned transaction of a signed
 * one. A vkey or bootstrap entry that holds a witness is taken out; one that holds none stays, so
 * that a witness added later is written into it, in its form: one rule with the wallets of this
 * library (`keyWitnessSetTags` of `@meshsdk/core-cst`), a set the transaction holds keeps its
 * form, empty or not. Only the witness set changes: its other entries stay byte for byte and in
 * their order, and its header is written again when it states a length. The body and everything
 * after the witness set stay byte for byte. A transaction with no witness is returned as it is,
 * and so is one whose witness set repeats a key (`repeatsKey`): no entry of it is taken out, and
 * no witness is written into it
 */
export const withoutKeyWitnesses = (raw: RawItems): string => {
  const { witnessSet, top } = raw;
  if (repeatsKey(witnessSet)) return raw.hex;
  const kept = witnessSet.entries.filter(
    (e) =>
      (e.key !== VKEYS && e.key !== BOOTSTRAPS) ||
      readWitnessEntry(e.value, e.key === VKEYS ? "vkey" : "bootstrap").items
        .length === 0,
  );
  if (kept.length === witnessSet.entries.length) return raw.hex;
  const { map } = witnessSet;
  const header = map.definite
    ? new CborWriter().writeStartMap(kept.length).encode()
    : map.header;
  const newSet = concat(
    header,
    ...kept.flatMap((e) => [e.keyBytes, e.value]),
    map.trailer,
  );
  return toHex(
    concat(
      top.header,
      top.items[0]!,
      newSet,
      ...top.items.slice(2),
      top.trailer,
    ),
  );
};

/**
 * The transaction with these witnesses added to its witness set. Only the vkey and bootstrap
 * entries change; every other byte is kept. The witnesses must be new to it.
 * @param tagged Whether a vkey entry and a bootstrap entry the transaction does not have yet are
 *   written with the set tag; as the body writes its input set when left out
 */
export const withWitnesses = (
  raw: RawTx,
  added: readonly KeyWitness[],
  tagged: boolean | KeyWitnessTags = raw.taggedSets,
): string => {
  if (added.length === 0) return raw.hex;
  refuseRepeatedKey(raw.witnessSet);
  const tags = bothTags(tagged);
  const { witnessSet, top } = raw;
  const byKind = {
    [VKEYS]: added.filter((w) => w.kind === "vkey"),
    [BOOTSTRAPS]: added.filter((w) => w.kind === "bootstrap"),
  };
  const held = {
    [VKEYS]: witnessSet.vkeys,
    [BOOTSTRAPS]: witnessSet.bootstraps,
  };
  const entries = witnessSet.entries.map(({ key, keyBytes, value }) => {
    const entry = key === VKEYS || key === BOOTSTRAPS ? held[key] : undefined;
    const more = entry ? byKind[key as typeof VKEYS | typeof BOOTSTRAPS] : [];
    return {
      key,
      bytes: [keyBytes, more.length > 0 ? appendToEntry(entry!, more) : value],
    };
  });
  // A new entry goes before the first larger key, with the set tag `tagged` gives it
  for (const key of [VKEYS, BOOTSTRAPS] as const) {
    if (held[key] || byKind[key].length === 0) continue;
    const at = entries.findIndex((e) => e.key > key);
    entries.splice(at === -1 ? entries.length : at, 0, {
      key,
      bytes: [
        new CborWriter().writeInt(key).encode(),
        writeEntry(byKind[key], key === VKEYS ? tags.vkey : tags.bootstrap),
      ],
    });
  }
  const count = entries.length;
  const map = witnessSet.map;
  const mapHeader =
    map.definite && count !== witnessSet.entries.length
      ? new CborWriter().writeStartMap(count).encode()
      : map.header;
  const newSet = concat(
    mapHeader,
    ...entries.flatMap((e) => e.bytes),
    map.trailer,
  );
  return toHex(
    concat(
      top.header,
      top.items[0]!,
      newSet,
      ...top.items.slice(2),
      top.trailer,
    ),
  );
};

/** Whether a witness's signature over the transaction id verifies with its key */
export const verifies = (witness: KeyWitness, txId: string) => {
  try {
    return Crypto.Ed25519PublicKey.fromHex(
      witness.vkey as Crypto.Ed25519PublicKeyHex,
    ).verify(
      Crypto.Ed25519Signature.fromHex(
        witness.signature as Crypto.Ed25519SignatureHex,
      ),
      HexBlob(txId),
    );
  } catch {
    return false;
  }
};

/* ---------------------------------------------------------------------------------------------
 * Signing
 * ------------------------------------------------------------------------------------------- */

/**
 * The CIP-30 codes a signer's error is read by: TxSignError UserDeclined, APIError AccountChange
 */
const USER_DECLINED = 2;
const ACCOUNT_CHANGE = -4;

/**
 * The error of a signer whose call rejected, read by its `code`, without instanceof. A signer's
 * own SIGN_DECLINED is raised again as a new error, with it as the `cause`: the error the caller
 * gets may be given the context of a plan, and the signer's is left as it was thrown
 */
const signerError = (error: unknown) => {
  const walletCode = walletCodeOf(error);
  if (walletCode === USER_DECLINED || TxPlanError.is(error, "SIGN_DECLINED"))
    return new TxPlanError(
      "SIGN_DECLINED",
      `the signer declined to sign: ${errorText(error)}`,
      { cause: error },
    );
  return new TxPlanError(
    "SIGNER_FAILED",
    `the signer failed: ${errorText(error)}`,
    {
      details: {
        reason: walletCode === ACCOUNT_CHANGE ? "accountChanged" : "error",
        ...(walletCode !== undefined && { walletCode }),
      },
      cause: error,
    },
  );
};

const isFunction = (value: unknown, name: string) =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  typeof (value as Record<string, unknown>)[name] === "function";

/**
 * A wallet given as a submitter, by its wallet methods: what it throws on `submitTx` is never a
 * refusal of the ledger
 */
export const isWallet = (value: object) =>
  isFunction(value, "getChangeAddress") ||
  isFunction(value, "signTxWitnesses") ||
  isFunction(value, "signTx");

/**
 * A wallet of the Mesh 1.9 kind: `getUtxosHex` of `MeshWallet`, `_walletInstance` of
 * `BrowserWallet`
 */
const isMeshWallet = (signer: object) =>
  "getUtxosHex" in signer || "_walletInstance" in signer;

/**
 * How a signer is asked, by its methods, the first found: `signTxWitnesses`, `signTxHash`, then
 * `signTx` of a Mesh 1.9 wallet or of a CIP-30 api; a function with none of them is the callback
 * form of `signTxHash`
 * @returns undefined for a value that cannot sign
 */
export const signerForm = (
  value: unknown,
): "witnesses" | "hash" | "callback" | "mesh" | "cip30" | undefined => {
  if (isFunction(value, "signTxWitnesses")) return "witnesses";
  if (isFunction(value, "signTxHash")) return "hash";
  if (isFunction(value, "signTx"))
    return isMeshWallet(value as object) ? "mesh" : "cip30";
  if (typeof value === "function") return "callback";
  return undefined;
};

/**
 * Whether a signer is asked with the hash of the transaction: `signTxHash` or its callback form.
 * False for a signer whose methods cannot be read: asking it is SIGNER_FAILED
 */
export const signsHashes = (signer: Signer) => {
  let form: ReturnType<typeof signerForm>;
  try {
    form = signerForm(signer);
  } catch {
    return false;
  }
  return form === "hash" || form === "callback";
};

/** A signer by its shape: one of the forms of `Signer` */
export const canSign = (value: unknown): value is Signer =>
  signerForm(value) !== undefined;

/**
 * The payer of a build or a plan as the signer of a call that names none: an object of any form
 * of payer, a wallet or a snapshot, with a method `canSign` accepts. An address, and an object
 * without such a method, sign nothing
 */
export const payerSigner = (payer: unknown): Signer | undefined =>
  typeof payer === "object" && payer !== null && canSign(payer)
    ? payer
    : undefined;

/**
 * The SIGNER_FAILED of a signer that cannot be asked: reading the method it is asked through
 * threw, or it has none left. What was thrown is neither the error nor its `cause`
 */
export const unreadableSigner = (reason: "threw" | "none") =>
  new TxPlanError(
    "SIGNER_FAILED",
    reason === "threw"
      ? "the signer could not be asked: reading the method it signs with threw"
      : "the signer could not be asked: it has no signTxWitnesses, signTxHash or signTx, and is not a function",
    { details: { reason: "error" } },
  );

/**
 * How a signer is asked, read when it is asked
 * @throws TxPlanError SIGNER_FAILED when the read throws or finds no form
 */
const formWhenAsked = (signer: unknown) => {
  let form: ReturnType<typeof signerForm>;
  try {
    form = signerForm(signer);
  } catch {
    throw unreadableSigner("threw");
  }
  if (form === undefined) throw unreadableSigner("none");
  return form;
};

const SIGNER_ALLOWED =
  "an object with signTxWitnesses, signTxHash or signTx, or a function that signs a transaction hash";
const SIGNERS_ALLOWED =
  "a signer (signTxWitnesses, signTxHash, signTx, or a function that signs a transaction hash), or a list of them";

/** The JavaScript type of a value, with `null` told apart */
const typeOf = (value: unknown) => (value === null ? "null" : typeof value);

/** What a value given as a signer is, named by its type only */
const signerKind = (value: unknown) => {
  const type = typeOf(value);
  return type === "object" ? "an object without any of them" : type;
};

/**
 * The error for a value given where a signer goes. Something given as a signer may be or hold a
 * key, so the message and `details.value` name only its JavaScript type, never the value
 * @param option `signer` for one signer, `signers` for one signer or a list of them
 * @param entry Of a list given as `signers`: the index of the entry that cannot sign
 */
export const invalidSigner = (
  option: "signer" | "signers",
  value: unknown,
  entry?: number,
) => {
  const allowed = option === "signer" ? SIGNER_ALLOWED : SIGNERS_ALLOWED;
  const given = entry === undefined ? value : (value as unknown[])[entry];
  const got =
    entry === undefined
      ? signerKind(value)
      : `a list whose entry ${entry} is ${signerKind(given)}`;
  // A string may be a private key: say where a key goes, without the text
  const hint =
    typeof given === "string"
      ? "; a private key is given as keySigner(key)"
      : "";
  return new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${got}${hint}`,
    { details: { option, value: typeOf(value), allowed } },
  );
};

/**
 * The signers a call gives, one or a list, checked by their shape
 * @returns The signers in order; undefined for none (undefined or an empty list)
 * @throws TxBuildError INVALID_OPTION (`signers`) for a value or an entry that cannot sign
 */
export const toSigners = (signers: unknown): Signer[] | undefined => {
  if (signers === undefined) return undefined;
  if (!Array.isArray(signers)) {
    if (!canSign(signers)) throw invalidSigner("signers", signers);
    return [signers];
  }
  const entry = signers.findIndex((value) => !canSign(value));
  if (entry !== -1) throw invalidSigner("signers", signers, entry);
  // An empty list gives no signer
  return signers.length === 0 ? undefined : (signers as Signer[]);
};

/**
 * Calls a signer that takes the transaction, the way it takes it; one with `signTxWitnesses` is
 * handed the hashes of the keys asked for
 */
const callSigner = (
  signer: Signer,
  form: "witnesses" | "mesh" | "cip30",
  tx: string,
  keys?: readonly AskedKey[],
) => {
  if (form === "witnesses") {
    const { signTxWitnesses } = signer as Extract<
      Signer,
      { signTxWitnesses: unknown }
    >;
    return keys === undefined
      ? signTxWitnesses.call(signer, tx)
      : signTxWitnesses.call(
          signer,
          tx,
          keys.map(({ keyHash }) => keyHash),
        );
  }
  const { signTx } = signer as Extract<Signer, { signTx: unknown }>;
  return form === "mesh"
    ? signTx.call(signer, tx, true, false)
    : signTx.call(signer, tx, true);
};

/** A signer's answer as a witness set of its vkey and bootstrap witnesses */
const answerWitnessSet = (answer: unknown, raw: RawTx): string => {
  if (answer === "") return "a0";
  const { witnessSet, witnesses, isTransaction } = readWitnessArgument(answer);
  if (!isTransaction) {
    // The vkey and bootstrap entries as the signer wrote them, nothing else
    const kept = witnessSet.entries.filter(
      (e) => e.key === VKEYS || e.key === BOOTSTRAPS,
    );
    const writer = new CborWriter().writeStartMap(kept.length);
    for (const entry of kept)
      writer.writeEncodedValue(entry.keyBytes).writeEncodedValue(entry.value);
    return toHex(writer.encode());
  }
  // A full transaction: only the witnesses `tx` does not hold yet
  const added = newWitnesses(witnesses, witnessesOf(raw.witnessSet));
  const tagged = (witnessSet.vkeys ?? witnessSet.bootstraps)?.tagged ?? false;
  return writeWitnessSet(added, tagged);
};

/** The SIGNER_FAILED of an answer of a signer of hashes that cannot be used */
const unusableSignatures = (what: string) =>
  new TxPlanError("SIGNER_FAILED", `the signer answered with ${what}`, {
    details: { reason: "error" },
  });

/**
 * The `vkey` and `signature` of each entry of the answer of a signer of hashes, copied once.
 * The answer is read by index and length only, never through its own methods; a getter, a
 * proxy or anything else that throws while it is read makes the answer unusable, and what it
 * threw is neither the error nor its `cause`
 */
const readHashAnswer = (answer: unknown) => {
  let entries: { vkey: unknown; signature: unknown }[];
  try {
    if (!Array.isArray(answer)) return undefined;
    const list = answer as unknown[];
    const length = list.length;
    entries = [];
    for (let index = 0; index < length; index++) {
      const entry = list[index];
      if (typeof entry === "object" && entry !== null) {
        const { vkey, signature } = entry as Record<string, unknown>;
        entries.push({ vkey, signature });
      } else entries.push({ vkey: undefined, signature: undefined });
    }
  } catch {
    throw unusableSignatures("a list that could not be read");
  }
  return entries;
};

/**
 * The witnesses of the answer of a signer of hashes, each verified against the transaction's
 * hash with its own key; the key hash is taken from the key. Neither the answer nor a value in
 * it is quoted in an error
 */
const hashAnswerWitnesses = async (
  answer: unknown,
  raw: RawTx,
): Promise<KeyWitness[]> => {
  const entries = readHashAnswer(answer);
  if (entries === undefined)
    throw unusableSignatures(
      `a value of type ${typeOf(answer)}, not a list of { vkey, signature }`,
    );
  await Crypto.ready();
  const witnesses: KeyWitness[] = [];
  for (const [index, { vkey, signature }] of entries.entries()) {
    if (!isHex(vkey) || vkey.length !== 64)
      throw unusableSignatures(
        `entry ${index}, whose vkey is not a public key of 32 bytes in hex`,
      );
    if (!isHex(signature) || signature.length !== 128)
      throw unusableSignatures(
        `entry ${index}, whose signature is not 64 bytes in hex`,
      );
    const witness: KeyWitness = {
      kind: "vkey",
      vkey: vkey.toLowerCase(),
      signature: signature.toLowerCase(),
      keyHash: Crypto.blake2b.hash(HexBlob(vkey.toLowerCase()), 28).toString(),
    };
    if (!verifies(witness, raw.txId))
      throw unusableSignatures(
        `a signature of key ${witness.keyHash} (entry ${index}) that does not verify against the transaction's hash`,
      );
    witnesses.push(witness);
  }
  return newWitnesses(witnesses);
};

/** Asks a signer of hashes, in either form, and returns its verified signatures as a witness set */
const askHashSigner = async (
  signer: Signer,
  form: "hash" | "callback",
  raw: RawTx,
  keys: readonly AskedKey[] | undefined,
  signal: AbortSignal | undefined,
): Promise<string> => {
  // Nothing is left to sign: the signer is not asked
  if (keys !== undefined && keys.length === 0) return "a0";
  // A copy frozen at every level: the signer can change nothing the caller holds
  const request: TxHashRequest = Object.freeze({
    txHash: raw.txId,
    ...(keys !== undefined && {
      keys: Object.freeze(
        keys.map(({ keyHash, roles }) =>
          Object.freeze({
            keyHash: keyHash.toLowerCase(),
            roles: Object.freeze([...roles]),
          }),
        ),
      ),
    }),
    tx: raw.hex,
    ...(signal !== undefined && { signal }),
  });
  let answer: unknown;
  try {
    answer =
      form === "hash"
        ? await (signer as TxHashSigner).signTxHash(request)
        : await (signer as SignTxHash)(request);
  } catch (error) {
    throw signerError(error);
  }
  return writeWitnessSet(await hashAnswerWitnesses(answer, raw), false);
};

/**
 * Asks one signer for its witnesses of a transaction, as `signWitnesses` does
 * @param signer A value `canSign` accepts
 * @param keys The keys asked for: a signer with `signTxWitnesses` is handed their hashes, a
 *   signer of hashes the list with the roles, and is not asked when it is empty
 * @param signal Handed to a signer of hashes in its request
 * @throws TxPlanError SIGNER_FAILED also for a signer whose method throws when it is read, or
 *   that has none left when it is asked
 */
export const askSigner = async (
  signer: Signer,
  raw: RawTx,
  { keys, signal }: { keys?: readonly AskedKey[]; signal?: AbortSignal } = {},
): Promise<string> => {
  const form = formWhenAsked(signer);
  if (form === "hash" || form === "callback")
    return askHashSigner(signer, form, raw, keys, signal);
  let answer: unknown;
  try {
    answer = await callSigner(signer, form, raw.hex, keys);
  } catch (error) {
    throw signerError(error);
  }
  try {
    return answerWitnessSet(answer, raw);
  } catch (error) {
    throw new TxPlanError(
      "SIGNER_FAILED",
      `the signer answered with neither a witness set nor a transaction: ${errorText(error)}`,
      { details: { reason: "error" }, cause: error },
    );
  }
};

const KEY_HASHES_ALLOWED = "a list of key hashes in hex";

/**
 * A signer's witnesses as a CBOR witness set, never the transaction. Calls
 * `signTxWitnesses(tx, keyHashes)` when the signer has it; else `signTxHash({ txHash, keys, tx })`,
 * or the signer itself when it is a function, each of whose signatures is verified against the
 * transaction's hash; else `signTx`: `signTx(tx, true, false)` on a Mesh wallet,
 * `signTx(tx, true)` on a CIP-30 api. A full transaction in the answer is reduced to the
 * witnesses it adds. The witness set is written in the form of the transaction's: its vkey and
 * its bootstrap entries with the set tag 258 when the transaction's own are, or, for an entry it
 * does not hold, when its body's inputs are (`keyWitnessSetTags` of `@meshsdk/core-cst`), so that
 * merged into it, it leaves the transaction the size its fee was priced for.
 * @param keyHashes The keys asked for. A signer with `signTxWitnesses` is handed the list; a
 *   signer of hashes is handed it as `keys`, one entry per hash in the same order, each with
 *   empty `roles` since the call does not say why, and is not asked when it is empty; without
 *   the list its request has no `keys`. Any other signer chooses its keys itself. The answer is
 *   returned whole and is not filtered by the list
 * @throws TxPlanError SIGN_DECLINED when the user declines (CIP-30 code 2) or the signer throws
 *   `TxPlanError` SIGN_DECLINED; SIGNER_FAILED when the signer fails otherwise, answers with
 *   something that is neither a witness set nor a transaction, or (a signer of hashes) with
 *   something that is not a list of `{ vkey, signature }` or holds a signature that does not
 *   verify. The signer's own error is the `cause`.
 * @throws TxBuildError INVALID_OPTION for a `signer` that is none of the forms of `Signer` (a
 *   private key given as it is among them: `keySigner(key)` makes a signer of it), for a
 *   `keyHashes` that is not a list of texts, and for a `tx` that is not a transaction; the signer
 *   is not called. `details.value` is only the JavaScript type of what was given, never the
 *   value: something passed as a signer or as `tx` may be or hold a key, and `details` is data a
 *   logger prints
 */
export async function signWitnesses(
  signer: Signer,
  tx: string,
  keyHashes?: RequiredKeys,
): Promise<string> {
  if (!canSign(signer)) throw invalidSigner("signer", signer);
  if (keyHashes !== undefined) {
    const entry = Array.isArray(keyHashes)
      ? keyHashes.findIndex((hash) => typeof hash !== "string")
      : -2;
    if (entry !== -1)
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid keyHashes: expected ${KEY_HASHES_ALLOWED}; got ${
          entry === -2
            ? `a value of type ${typeOf(keyHashes)}`
            : `a list whose entry ${entry} is of type ${typeOf(keyHashes[entry])}`
        }`,
        {
          details: {
            option: "keyHashes",
            value: typeOf(keyHashes),
            allowed: KEY_HASHES_ALLOWED,
          },
        },
      );
  }
  const raw = readTransaction(tx);
  const answer = await askSigner(signer, raw, {
    keys: keyHashes?.map((keyHash) => ({ keyHash, roles: [] })),
  });
  // Written in the form the transaction's own witness sets take, whatever form the signer used
  return writeWitnessSet(
    witnessesOf(readWitnessSet(Buffer.from(answer, "hex"))),
    keyWitnessSetTags(raw.hex),
  );
}

const invalidWitness = (
  argument: number,
  reason: "undecodable" | "wrongBody",
  message: string,
  extra: { keyHash?: string; cause?: unknown } = {},
) =>
  new TxPlanError("INVALID_WITNESS", message, {
    details: {
      reason,
      argument,
      ...(extra.keyHash !== undefined && { keyHash: extra.keyHash }),
    },
    ...(extra.cause !== undefined && { cause: extra.cause }),
  });

/**
 * The witnesses of the arguments that a transaction does not hold yet, each once, every one
 * checked against its body
 * @param raw The transaction, as `readTransaction` reads it
 * @throws TxPlanError INVALID_WITNESS for the first argument that cannot be read, or holds a
 *   witness that does not verify; `details.argument` is its index in `witnesses`
 */
export const witnessesToAdd = async (
  raw: RawTx,
  witnesses: readonly unknown[],
): Promise<KeyWitness[]> => {
  await Crypto.ready();
  const added: KeyWitness[] = [];
  for (const [argument, value] of witnesses.entries()) {
    let read: KeyWitness[];
    try {
      read = readWitnessArgument(value).witnesses;
    } catch (error) {
      throw invalidWitness(
        argument,
        "undecodable",
        `witness argument ${argument} is neither a witness set nor a transaction: ${errorText(error)}`,
        { cause: error },
      );
    }
    for (const witness of newWitnesses(read, [
      ...witnessesOf(raw.witnessSet),
      ...added,
    ])) {
      if (!verifies(witness, raw.txId))
        throw invalidWitness(
          argument,
          "wrongBody",
          `witness argument ${argument} holds a signature of key ${witness.keyHash} that is not of this transaction's body`,
          { keyHash: witness.keyHash },
        );
      added.push(witness);
    }
  }
  return added;
};

/**
 * Asks one signer for its witnesses of a transaction, as a plan and a `BuiltTx` do: the
 * keys not signed yet are handed to it as `askSigner` hands them, and a signer of hashes is not
 * asked when none is left
 * @param keys The keys asked for, without those that have signed
 * @param body The body as the error of a witness that is not of it names it
 * @returns The witnesses of its answer that `raw` does not hold, each verified against the body;
 *   which of them to keep is `countedWitnesses`'s
 * @throws TxPlanError SIGN_DECLINED, SIGNER_FAILED as `askSigner`; SIGNER_FAILED for an answer
 *   that holds a witness of another body, with the INVALID_WITNESS as the `cause`
 */
export const signerWitnesses = async (
  signer: Signer,
  raw: RawTx,
  { keys, signal }: { keys: readonly AskedKey[]; signal?: AbortSignal },
  body = "the transaction's body",
): Promise<KeyWitness[]> => {
  const answer = await askSigner(signer, raw, { keys, signal });
  try {
    return await witnessesToAdd(raw, [answer]);
  } catch (error) {
    throw new TxPlanError(
      "SIGNER_FAILED",
      `the signer answered with a witness that is not of ${body}`,
      { details: { reason: "error" }, cause: error },
    );
  }
};

/**
 * The witnesses offered for a transaction that it keeps, in order: each key once of each kind
 * (vkey and bootstrap), none of a kind and a key `held` has; vkey witnesses of the keys the fee
 * counts, and `extraKeys` more of other keys over everything held; bootstrap witnesses up to
 * `bootstraps`, the held ones counted. A witness kept past these numbers would put the fee below
 * the minimum
 * @param held The witnesses the transaction holds already
 * @param keys The keys the fee counts a witness for: `countedKeys` of its signers
 * @param bootstraps The bootstrap witnesses the fee counts: one per Byron address spent from
 */
export const countedWitnesses = (
  offered: readonly KeyWitness[],
  held: readonly KeyWitness[],
  {
    keys,
    extraKeys = 0,
    bootstraps,
  }: { keys: ReadonlySet<string>; extraKeys?: number; bootstraps: number },
): KeyWitness[] => {
  let others = held.filter(
    (w) => w.kind === "vkey" && !keys.has(w.keyHash),
  ).length;
  let byron = held.filter((w) => w.kind === "bootstrap").length;
  // A key once of each kind: a vkey witness and a bootstrap witness of one key are two witnesses,
  // for a Shelley address and for a Byron address of that key
  const seen = new Set(held.map((w) => `${w.kind} ${w.keyHash}`));
  const kept: KeyWitness[] = [];
  for (const witness of offered) {
    if (seen.has(`${witness.kind} ${witness.keyHash}`)) continue;
    if (witness.kind === "bootstrap") {
      if (byron >= bootstraps) continue;
      byron++;
    } else if (!keys.has(witness.keyHash)) {
      if (others >= extraKeys) continue;
      others++;
    }
    seen.add(`${witness.kind} ${witness.keyHash}`);
    kept.push(witness);
  }
  return kept;
};

/**
 * What a payer asked when a call names no signer gives that is offered for keeping: its witnesses
 * of the keys it was asked for in that call, and bootstrap witnesses (`countedWitnesses` caps
 * those). A witness of any other key is dropped, even where the fee counts one more: the other
 * keys come from the signers a call names and from `addWitnesses`
 * @param asked The keys the payer was asked for in the call
 */
export const payerWitnesses = (
  offered: readonly KeyWitness[],
  asked: readonly { readonly keyHash: string }[],
): KeyWitness[] => {
  const keys = new Set(asked.map(({ keyHash }) => keyHash));
  return offered.filter((w) => w.kind === "bootstrap" || keys.has(w.keyHash));
};

/**
 * Whether a payer asked when a call names no signer has nothing left to give, whatever its form:
 * no key it could be asked for is left, and no bootstrap witness the fee counts is missing
 * @param left The keys it would be asked for: those that have not signed yet
 * @param held The witnesses the transaction holds
 * @param bootstraps The bootstrap witnesses the fee counts: one per Byron address spent from
 */
export const payerHasNothingLeft = (
  left: readonly unknown[],
  held: readonly KeyWitness[],
  bootstraps: number,
) =>
  left.length === 0 &&
  held.filter((w) => w.kind === "bootstrap").length >= bootstraps;

/**
 * Adds the vkey and bootstrap witnesses of each witness set or full transaction once. Only the
 * transaction's own witness set changes; every other element stays byte for byte.
 * @throws TxPlanError INVALID_WITNESS for an argument that cannot be decoded, or holding a
 *   witness that does not verify against the body; `details.argument` is the index of that
 *   argument among `witnesses`, counted from 0
 * @throws TxBuildError INVALID_OPTION for a `tx` that is not a transaction, or whose witness set
 *   repeats a key (`refuseRepeatedKey`); `details.value` is only the JavaScript type of what was
 *   given
 */
export async function addWitnesses(
  tx: string,
  ...witnesses: string[]
): Promise<string> {
  const raw = readTransaction(tx);
  return withWitnesses(raw, await witnessesToAdd(raw, witnesses));
}

/**
 * Key hashes whose vkey witness in `tx` verifies against its body
 * @throws TxBuildError INVALID_OPTION for a `tx` that is not a transaction; `details.value` is
 *   only the JavaScript type of what was given
 */
export async function signedKeyHashes(tx: string): Promise<string[]> {
  const raw = readTransaction(tx);
  await Crypto.ready();
  const hashes = new Set<string>();
  for (const witness of raw.witnessSet.vkeys?.witnesses ?? [])
    if (verifies(witness, raw.txId)) hashes.add(witness.keyHash);
  return Array.from(hashes);
}

/* ---------------------------------------------------------------------------------------------
 * Who must sign a serialized transaction
 * ------------------------------------------------------------------------------------------- */

const outRefKey = (txHash: string, index: number) =>
  `${txHash.toLowerCase()}#${index}`;

/** The credential a certificate is witnessed by, when it is not a pool certificate */
const certificateCredential = (
  certificate: Parameters<typeof certificateKeys>[1]["certificate"],
) => {
  switch (certificate.type) {
    case "POOL_REGISTRATION":
    case "POOL_RETIREMENT":
      return undefined;
    case "COMMITTEE_HOT_AUTH":
    case "COMMITTEE_COLD_RESIGN":
      return certificate.value.committee_cold_credential;
    case "DREP_REGISTRATION":
    case "DREP_DEREGISTRATION":
    case "DREP_UPDATE":
      return certificate.value.voting_credential;
    default:
      return certificate.value.stake_credential;
  }
};

/** The out refs a body spends and reads, as `txHash#index` in lower case */
export const spentAndRead = (body: Serialization.TransactionBody): string[] =>
  [...body.inputs().values(), ...(body.referenceInputs()?.values() ?? [])].map(
    (input) =>
      `${input.transactionId().toString().toLowerCase()}#${input.index()}`,
  );

/**
 * The out refs a body names, as `txHash#index` in lower case: those it spends, puts up as
 * collateral and reads
 */
export const namedOutRefs = (
  body: Serialization.TransactionBody,
): Set<string> =>
  new Set([
    ...spentAndRead(body),
    ...(body.collateral()?.values() ?? []).map(
      (input) =>
        `${input.transactionId().toString().toLowerCase()}#${input.index()}`,
    ),
  ]);

/**
 * Counts the reference scripts the UTxOs of a transaction's spent and reference inputs hold, `refs`
 * their out refs as `txHash#index` in lower case, from the UTxO given first for each, in any form;
 * no script is described, so a transaction past the bound is refused before its UTxOs are read
 */
export const refScriptCounter = (refs: Iterable<string>) => {
  const wanted = new Set(refs);
  const given = new Set<string>();
  let size = 0;
  return {
    /** Counts `utxo`, the UTxO given first for the out ref `key`; another out ref is not counted */
    add(key: string, utxo: unknown): void {
      if (!wanted.has(key) || given.has(key)) return;
      given.add(key);
      size += heldScriptSize(utxo)?.size ?? 0;
    },
    /** Counts the first UTxO of each out ref placed */
    addPlaced(placed: PlacedUtxos): void {
      for (const [key, { given: utxo }] of placed.first) this.add(key, utxo);
    },
    /**
     * Past `MAX_REF_SCRIPT_BYTES`, the bytes counted and why the transaction is refused, in the
     * words of a node: their whole size where the UTxO of every out ref is counted, else that they
     * are more than the bound; undefined within it
     */
    past(): { size: number; why: string } | undefined {
      if (size <= MAX_REF_SCRIPT_BYTES) return undefined;
      return {
        size,
        why: refScriptsBeyond(size, given.size === wanted.size)!,
      };
    },
  };
};

/**
 * Why a transaction whose spent and reference inputs hold `size` bytes of reference scripts is
 * refused, in the words of a node; undefined within `MAX_REF_SCRIPT_BYTES`
 * @param whole Whether `size` is all they hold, else only what is known of it
 */
export const refScriptsBeyond = (
  size: number,
  whole = true,
): string | undefined =>
  size <= MAX_REF_SCRIPT_BYTES
    ? undefined
    : whole
      ? `its spent and reference inputs hold ${size} bytes of reference scripts, more than the ${MAX_REF_SCRIPT_BYTES} a node takes in one transaction (ConwayTxRefScriptsSizeTooBig)`
      : `its spent and reference inputs hold more than the ${MAX_REF_SCRIPT_BYTES} bytes of reference scripts a node takes in one transaction (ConwayTxRefScriptsSizeTooBig)`;

/** The refusal of a transaction read whose reference scripts are past the bound */
export const refScriptsRefused = (tx: unknown, past: string) =>
  new TxBuildError("INVALID_OPTION", `invalid tx: ${past}`, {
    details: {
      option: "tx",
      value: tx === null ? "null" : typeof tx,
      allowed: "a transaction in CBOR hex",
    },
  });

/**
 * The signatures a serialized transaction needs, given the UTxOs it spends: for a co-signer or a
 * server checking a transaction it did not build. Each key comes with the roles it is needed in,
 * as the build of the same transaction gives them
 * @param spent The UTxO of every input and collateral input, each in any form the builder takes
 *   a UTxO in. UTxOs of reference inputs may be given too: only then is a native script the
 *   transaction runs from one of them listed in `nativeScripts`. An entry for an out ref the
 *   transaction does not name is passed over, its out ref alone read; two that name one output
 *   must hold the same, and two texts of CBOR for one output be one text
 * @throws TxBuildError UTXO_NOT_FOUND for an input or collateral input whose UTxO is not in
 *   `spent`; INVALID_OPTION for a `tx` that is not a transaction, or holds a key of its body, an
 *   output or its witness set the Conway ledger does not read, for one whose spent and
 *   reference inputs hold more than `MAX_REF_SCRIPT_BYTES` of reference scripts in the UTxOs of
 *   `spent`, counted before they are read whole, and for a `spent` that is not a list or holds an
 *   entry that is not a UTxO (an address that does not parse among them), or two entries that
 *   name one output and differ
 */
export function requiredSigners(
  tx: string,
  spent: readonly UtxoInput[],
): TxSigners {
  const raw = readTransaction(tx);
  if (!Array.isArray(spent))
    throw new TxBuildError(
      "INVALID_OPTION",
      "invalid spent: expected a list of UTxOs",
      {
        details: {
          option: "spent",
          value: heldValue(spent),
          allowed: "a list of UTxOs",
        },
      },
    );
  // Each entry read as a payer's UTxO is: an entry whose address cannot be read would
  // otherwise drop the key that signs for it, an answer that is silently short
  const refused = (error: unknown, _: number, entry: unknown): never => {
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid spent: an entry is not a UTxO: ${errorText(error)}`,
      {
        details: {
          option: "spent",
          value: typeOf(entry),
          allowed: "a list of UTxOs",
        },
        cause: error,
      },
    );
  };
  let utxos: Utxo[];
  try {
    // Only the entries for the out refs the body names are read, each out ref once
    const placed = placeUtxos(spent, refused, namedOutRefs(raw.body));
    // The reference scripts are bounded as a node bounds them, before a UTxO is read whole
    const counter = refScriptCounter(spentAndRead(raw.body));
    counter.addPlaced(placed);
    const past = counter.past();
    if (past) throw refScriptsRefused(tx, past.why);
    utxos = Array.from(readPlaced(placed, refused).values());
  } catch (error) {
    if (!(error instanceof UtxoTwiceError)) throw error;
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid spent: ${error.message}`,
      {
        details: {
          option: "spent",
          value: "object",
          allowed:
            "a list of UTxOs in which the entries that name one output are alike",
        },
      },
    );
  }
  return signersOf(bodySigners(raw, utxos).collected);
}

/**
 * The body of a transaction as a value, without its proposals, its outputs and its collateral
 * return: of the proposals only the policy hash is needed, read from the actions as they are,
 * and the outputs need no signature (the value decoder does not read an output at a Byron
 * address)
 * @throws TxBuildError INVALID_OPTION for a body that cannot be read
 */
const bodyToSign = (raw: RawTx): TransactionPrototype["body"] => {
  try {
    const items = Serialization.TransactionBody.fromCbor(raw.body.toCbor());
    items.setProposalProcedures(undefined as never);
    items.setOutputs([]);
    items.setCollateralReturn(undefined as never);
    return transactionPrototypeFromCardano(
      new Transaction(items, new Serialization.TransactionWitnessSet()),
    ).body;
  } catch (error) {
    throw invalidTx(raw.hex, error);
  }
};

/**
 * What a serialized transaction needs signed, as `requiredSigners` works it out, with the hashes
 * of the scripts its body calls for: the payment credentials of its spent inputs, its minted
 * policies, the script credentials of its withdrawals, certificates and voters, and the policy
 * hashes of its proposals
 * @param body The body as a value, when the caller has read it already; else it is read here
 * @throws TxBuildError UTXO_NOT_FOUND for an input or collateral input whose UTxO is not in
 *   `spent`; INVALID_OPTION for a body that cannot be read
 */
export const bodySigners = (
  raw: RawTx,
  spent: readonly Utxo[],
  body: TransactionPrototype["body"] = bodyToSign(raw),
): { collected: Collected; scripts: Set<string> } => {
  const proposals = raw.body.proposalProcedures()?.values() ?? [];
  const given = new Map<string, Utxo>();
  for (const utxo of spent)
    given.set(outRefKey(utxo.txHash, utxo.outputIndex), utxo);
  const utxoOf = (input: { transaction_id: string; index: number }) => {
    const utxo = given.get(outRefKey(input.transaction_id, input.index));
    if (utxo) return utxo;
    throw new TxBuildError(
      "UTXO_NOT_FOUND",
      `the UTxO of ${input.transaction_id}#${input.index}, which the transaction spends, is not given in spent`,
      {
        details: {
          input: { txHash: input.transaction_id, outputIndex: input.index },
        },
      },
    );
  };
  const inputs = body.inputs.map(utxoOf);
  const collateral = (body.collateral ?? []).map(utxoOf);

  const collected = emptyCollected();
  // Hashes of the scripts the transaction runs, to tell which reference scripts run
  const scripts = new Set<string>();
  const credential = (
    value: { type: "KEY" | "SCRIPT"; value: string } | undefined,
    role: SignerRole,
  ) => {
    if (value?.type === "SCRIPT") scripts.add(value.value);
    else addCredential(collected, value, role);
  };

  for (const utxo of inputs) {
    addAddress(collected, utxo, "input");
    const payment = Address.fromString(utxo.address)?.getProps().paymentPart;
    if (payment?.type === CredentialType.ScriptHash)
      scripts.add(payment.hash.toString());
  }
  for (const utxo of collateral) addAddress(collected, utxo, "collateral");
  for (const keyHash of body.required_signers ?? [])
    addKey(collected, keyHash, "guard");
  for (const rewardAddress of Object.keys(body.withdrawals ?? {})) {
    const account = Address.fromString(rewardAddress)
      ?.asReward()
      ?.getPaymentCredential();
    if (!account) continue;
    credential(
      {
        type: account.type === CredentialType.KeyHash ? "KEY" : "SCRIPT",
        value: account.hash.toString(),
      },
      "withdrawal",
    );
  }
  for (const certificate of body.certs ?? []) {
    // Certificate 0, a stake registration without its deposit, takes no witness
    if (
      certificate.type === "STAKE_REGISTRATION" &&
      (certificate.value.coin === null || certificate.value.coin === undefined)
    )
      continue;
    if (certificateCredential(certificate)?.type === "SCRIPT")
      scripts.add(certificateCredential(certificate)!.value);
    else certificateKeys(collected, { certificate });
  }
  for (const { voter } of body.voting_procedures ?? []) {
    if (voter.type === "STAKING_POOL") addKey(collected, voter.value, "vote");
    else credential(voter.value, "vote");
  }
  for (const proposal of proposals) {
    const action = proposal.toCore().governanceAction;
    if ("policyHash" in action && action.policyHash)
      scripts.add(action.policyHash.toString());
  }
  for (const policyId of Object.keys(body.mint ?? {})) scripts.add(policyId);

  // Native scripts the witness set holds, then those held by given UTxOs the transaction reads:
  // the keys of one are read only where the transaction runs it, known by its hash
  for (const native of raw.witnesses.nativeScripts()?.values() ?? [])
    addNativeScript(collected, nativeScriptEntry(native));
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const utxo = given.get(outRefKey(input.transaction_id, input.index));
    if (utxo?.script?.type !== "native" || !scripts.has(utxo.script.hash))
      continue;
    const native = nativeScriptRef(utxo);
    if (native) addNativeScript(collected, native);
  }
  return { collected, scripts };
};
