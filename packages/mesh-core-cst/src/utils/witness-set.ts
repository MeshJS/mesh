import { inConwayEra, Serialization, setInConwayEra } from "@cardano-sdk/core";

import {
  CborReader,
  CborSet,
  CborWriter,
  HexBlob,
  Transaction,
  TransactionWitnessSet,
  TxCBOR,
  VkeyWitness,
} from "../types";

const State = Serialization.CborReaderState;
/** The witness-set keys of the vkey and of the bootstrap witnesses */
const VKEYS = 0n;
const BOOTSTRAPS = 2n;
/** The CBOR tag of a set */
const SET_TAG = 258;

/** Whether the vkey and the bootstrap witness sets of a transaction carry the set tag 258 */
export type KeyWitnessSetTags = { vkey: boolean; bootstrap: boolean };

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const readerOf = (bytes: Uint8Array) => new CborReader(HexBlob(toHex(bytes)));

/** An array, or a map (its keys and values in turn), with its items as written */
type Items = {
  /** Every byte before the first item */
  header: Uint8Array;
  items: Uint8Array[];
  /** Every byte after the last item: the break of an indefinite length */
  trailer: Uint8Array;
  definite: boolean;
};

const readItems = (
  bytes: Uint8Array,
  kind: "array" | "map",
  hex?: string,
): Items => {
  const reader =
    hex === undefined ? readerOf(bytes) : new CborReader(HexBlob(hex));
  if (
    reader.peekState() !==
    (kind === "array" ? State.StartArray : State.StartMap)
  )
    throw new Error(`expected a CBOR ${kind}`);
  const length =
    kind === "array" ? reader.readStartArray() : reader.readStartMap();
  const header = bytes.subarray(0, bytes.length - reader.getBytesRemaining());
  const count = length === null ? undefined : length * (kind === "map" ? 2 : 1);
  const end = kind === "array" ? State.EndArray : State.EndMap;
  const items: Uint8Array[] = [];
  while (
    count === undefined ? reader.peekState() !== end : items.length < count
  )
    items.push(reader.readEncodedValue());
  const trailer = bytes.subarray(bytes.length - reader.getBytesRemaining());
  if (kind === "array") reader.readEndArray();
  else reader.readEndMap();
  if (reader.peekState() !== State.Finished)
    throw new Error("unexpected bytes after the CBOR item");
  return { header, items, trailer, definite: length !== null };
};

/** An entry of a witness set: its key, and the key and the value as written */
export type WitnessSetEntry = {
  key: bigint;
  keyBytes: Uint8Array;
  value: Uint8Array;
};

/**
 * A transaction read as its items, and its witness set as its entries, each as written: what
 * `withKeyWitnesses` and `withoutKeyWitnesses` write into, read once
 */
export type TransactionItems = {
  /** The transaction in CBOR hex, as given */
  hex: string;
  /** The items of the transaction: the body, the witness set, the flag if any, the data */
  top: Items;
  set: Items;
  entries: WitnessSetEntry[];
};

/** The key of a witness-set entry: an unsigned integer, and nothing after it */
const readKey = (bytes: Uint8Array) => {
  const reader = readerOf(bytes);
  if (reader.peekState() !== State.UnsignedInteger)
    throw new Error("expected an unsigned integer as a witness-set key");
  const key = reader.readUInt();
  if (reader.peekState() !== State.Finished)
    throw new Error("unexpected bytes after the CBOR item");
  return key;
};

/**
 * A transaction read as its items, and the entries of its witness set, each as written: an array
 * of three or four items of definite length, its witness set a map whose keys are unsigned
 * integers. Nothing of it is decoded into a value
 * @param txHex A transaction in CBOR hex
 * @throws Error for what is not so
 */
export const readTransactionItems = (txHex: string): TransactionItems => {
  const top = readItems(Buffer.from(txHex, "hex"), "array", txHex);
  if (!top.definite || top.items.length < 3 || top.items.length > 4)
    throw new Error(
      "a transaction is an array of three or four items, of definite length",
    );
  const set = readItems(top.items[1]!, "map");
  const entries: WitnessSetEntry[] = [];
  for (let i = 0; i < set.items.length; i += 2)
    entries.push({
      key: readKey(set.items[i]!),
      keyBytes: set.items[i]!,
      value: set.items[i + 1]!,
    });
  return { hex: txHex, top, set, entries };
};

const REPEATED_KEY =
  "the witness set of the transaction repeats a key, and a reader may take another entry than the one a witness is written into: none is written";

const repeatsKey = ({ entries }: TransactionItems) =>
  new Set(entries.map((e) => e.key)).size !== entries.length;

/**
 * The form a vkey or a bootstrap entry of a witness set is written in. True or false: an array of
 * definite length with the set tag 258 or without, written as the writer of `@cardano-sdk/core`
 * writes it. A text: the entry holding no witness, in CBOR hex, for another form, its set tag
 * written in a longer form or its array of indefinite length (`keyWitnessEntryForm`)
 */
export type KeyWitnessEntryForm = boolean | string;

/** The forms of the vkey entry and of the bootstrap entry of a witness set */
export type KeyWitnessEntryForms = {
  vkey?: KeyWitnessEntryForm;
  bootstrap?: KeyWitnessEntryForm;
};

/** Key witnesses to write into a witness set, each as the CBOR of one witness */
export type KeyWitnessesCbor = {
  vkeys?: readonly Uint8Array[];
  bootstraps?: readonly Uint8Array[];
};

/** A vkey or bootstrap entry as written: the bytes of its set tag, none without one, its array */
type Entry = { tag: Uint8Array; array: Items };

const readEntry = (bytes: Uint8Array): Entry => {
  const reader = readerOf(bytes);
  let after = 0;
  if (reader.peekState() === State.Tag) {
    const tag = Number(reader.readTag());
    if (tag !== SET_TAG) throw new Error(`unexpected CBOR tag ${tag}`);
    after = bytes.length - reader.getBytesRemaining();
  }
  return {
    tag: bytes.subarray(0, after),
    array: readItems(bytes.subarray(after), "array"),
  };
};

/**
 * An entry with these witnesses after those it holds, in its form: its set tag as written, the
 * head and the break of an array of indefinite length as written, and for an array of definite
 * length a head of its new count, which the writer of `@cardano-sdk/core` writes in the shortest
 * form. The witnesses it holds keep their bytes
 */
const appended = (
  bytes: Uint8Array,
  added: readonly Uint8Array[],
): Uint8Array => {
  if (added.length === 0) return bytes;
  const { tag, array } = readEntry(bytes);
  const head = array.definite
    ? new CborWriter()
        .writeStartArray(array.items.length + added.length)
        .encode()
    : array.header;
  return Buffer.concat([tag, head, ...array.items, ...added, array.trailer]);
};

/** An entry holding no witness, in a form */
const emptyEntry = (form: KeyWitnessEntryForm): Uint8Array => {
  if (typeof form === "string") {
    const bytes = Buffer.from(form, "hex");
    if (readEntry(bytes).array.items.length > 0)
      throw new Error("the form of an entry holds a witness");
    return bytes;
  }
  const writer = new CborWriter();
  if (form) writer.writeTag(SET_TAG);
  return writer.writeStartArray(0).encode();
};

/**
 * The form of a vkey or a bootstrap entry of a witness set (`KeyWitnessEntryForm`): true or false
 * for an array of definite length with the set tag in its shortest form or without a tag, the
 * entry holding no witness for any other form, its tag as written, the head and the break of an
 * array of indefinite length as written
 * @param entry The entry in CBOR hex
 * @throws Error for what is not an array, with or without the set tag
 */
export const keyWitnessEntryForm = (entry: string): KeyWitnessEntryForm => {
  const { tag, array } = readEntry(Buffer.from(entry, "hex"));
  const plainTag =
    tag.length === 0 ||
    toHex(tag) === new CborWriter().writeTag(SET_TAG).encodeAsHex();
  if (array.definite && plainTag) return tag.length > 0;
  const head = array.definite
    ? new CborWriter().writeStartArray(0).encode()
    : array.header;
  return toHex(Buffer.concat([tag, head, array.trailer]));
};

/**
 * A vkey or a bootstrap entry holding these witnesses, in a form
 * @param witnesses Each the CBOR of one witness, written as given
 */
export const keyWitnessEntry = (
  form: KeyWitnessEntryForm,
  witnesses: readonly Uint8Array[],
): Uint8Array => appended(emptyEntry(form), witnesses);

/**
 * The transaction with a witness set of these entries: its header written again when it states
 * a length and the count changes, every other byte of the transaction kept
 */
const withEntries = (tx: TransactionItems, entries: WitnessSetEntry[]) => {
  const { top, set } = tx;
  const header =
    set.definite && entries.length !== tx.entries.length
      ? new CborWriter().writeStartMap(entries.length).encode()
      : set.header;
  const witnessSet = Buffer.concat([
    header,
    ...entries.flatMap((e) => [e.keyBytes, e.value]),
    set.trailer,
  ]);
  return toHex(
    Buffer.concat([
      top.header,
      top.items[0]!,
      witnessSet,
      ...top.items.slice(2),
      top.trailer,
    ]),
  );
};

/** The witnesses written into the entries of a transaction read as its items */
const spliced = (
  tx: TransactionItems,
  added: KeyWitnessesCbor,
  forms: KeyWitnessEntryForms,
): string => {
  if (repeatsKey(tx)) throw new Error(REPEATED_KEY);
  const entries = [...tx.entries];
  let inputs: boolean | undefined;
  for (const [key, witnesses, form] of [
    [VKEYS, added.vkeys ?? [], forms.vkey],
    [BOOTSTRAPS, added.bootstraps ?? [], forms.bootstrap],
  ] as const) {
    if (witnesses.length === 0) continue;
    const at = entries.findIndex((e) => e.key === key);
    if (at !== -1) {
      const held = entries[at]!;
      entries[at] = { ...held, value: appended(held.value, witnesses) };
      continue;
    }
    // A new entry goes before the first larger key, in the form asked for, else in the form of
    // the body's inputs
    const value = keyWitnessEntry(
      form ?? (inputs ??= inputsTagged(tx.top.items[0]!)),
      witnesses,
    );
    const before = entries.findIndex((e) => e.key > key);
    entries.splice(before === -1 ? entries.length : before, 0, {
      key,
      keyBytes: new CborWriter().writeInt(key).encode(),
      value,
    });
  }
  return withEntries(tx, entries);
};

/**
 * The transaction with these vkey and bootstrap witnesses written into its witness set: the one
 * writer of key witnesses into a transaction, of the wallets of `@meshsdk/wallet`, of the emulator
 * and of the builder's signing. Each is written after those an entry the transaction holds, in
 * the entry's form; an entry the transaction does not hold is written in the form `forms` gives,
 * else in the form of the body's inputs, with the set tag 258 or without, before the first larger
 * key. Only these entries are written: the body, the other entries of the witness set, the
 * validity flag and the auxiliary data keep their bytes, so the hash does not change. A head that
 * states a count that changes is written again, by the writer of `@cardano-sdk/core`, in its
 * shortest form. The witnesses are written as given: none is left out as one held already
 * @param tx A transaction in CBOR hex, or as `readTransactionItems` reads it
 * @param added Each witness as its CBOR
 * @throws Error for what is not a transaction, and for a witness set that repeats a key, any key:
 *   a reader may take another entry than the one written into, and none is
 */
export const withKeyWitnesses = (
  tx: string | TransactionItems,
  added: KeyWitnessesCbor,
  forms: KeyWitnessEntryForms = {},
): string => {
  if ((added.vkeys?.length ?? 0) + (added.bootstraps?.length ?? 0) === 0)
    return typeof tx === "string" ? tx : tx.hex;
  return spliced(
    typeof tx === "string" ? readTransactionItems(tx) : tx,
    added,
    forms,
  );
};

/**
 * The transaction without its vkey and bootstrap witnesses: an entry that holds a witness is
 * taken out, one that holds none stays in its form, so that a witness added later is written into
 * it. Every other byte stays: the header of the witness set is written again when it states a
 * length and the count changes. A transaction without such an entry, and one whose witness set
 * repeats a key, are returned as they are
 * @param given A transaction in CBOR hex, or as `readTransactionItems` reads it
 */
export const withoutKeyWitnesses = (
  given: string | TransactionItems,
): string => {
  const tx = typeof given === "string" ? readTransactionItems(given) : given;
  if (repeatsKey(tx)) return tx.hex;
  const kept = tx.entries.filter(
    (e) =>
      (e.key !== VKEYS && e.key !== BOOTSTRAPS) ||
      readEntry(e.value).array.items.length === 0,
  );
  return kept.length === tx.entries.length ? tx.hex : withEntries(tx, kept);
};

/** Whether a transaction body writes its inputs with the set tag */
const inputsTagged = (body: Uint8Array): boolean => {
  const reader = readerOf(body);
  const length = reader.readStartMap();
  for (let i = 0; length === null || i < length; i++) {
    if (length === null && reader.peekState() === State.EndMap) break;
    if (reader.readUInt() === 0n) return reader.peekState() === State.Tag;
    reader.skipValue();
  }
  return false;
};

const tagsOf = ({
  top,
  entries,
}: ReturnType<typeof readTransactionItems>): KeyWitnessSetTags => {
  const inputs = inputsTagged(top.items[0]!);
  // Of a key the set repeats, the last entry, as the decoder reads it
  const held = (key: bigint) => {
    const entry = [...entries].reverse().find((e) => e.key === key);
    return entry === undefined
      ? inputs
      : readerOf(entry.value).peekState() === State.Tag;
  };
  return { vkey: held(VKEYS), bootstrap: held(BOOTSTRAPS) };
};

/**
 * The form of the vkey and of the bootstrap witness sets of a transaction, with the set tag 258
 * or without: a set the transaction holds keeps its own form, and a set it does not hold yet
 * takes the form of the body's inputs. Witnesses written in this form leave the transaction the
 * size its fee was priced for: a body written without tags is priced for witnesses without tags
 * @param txHex A transaction in CBOR hex
 */
export const keyWitnessSetTags = (txHex: string): KeyWitnessSetTags =>
  tagsOf(readTransactionItems(txHex));

/**
 * Runs a synchronous writing of `@cardano-sdk/core` with its set-tag flag (`inConwayEra`, which
 * every set it writes reads) pinned to `tagged`, and restores the flag after, also when the
 * writing throws. Nothing is awaited between the two, so no other writing sees the pinned value
 */
const writtenWithSetTag = (tagged: boolean, write: () => string): string => {
  const previous = inConwayEra;
  setInConwayEra(tagged);
  try {
    return write();
  } finally {
    setInConwayEra(previous);
  }
};

/**
 * The transaction with these vkey witnesses added to its vkey witness set, as `withKeyWitnesses`
 * writes them: a set the transaction holds keeps its form (its set tag 258 or none, its kind of
 * length), and a new one takes the form of the body's inputs. A witness of a key the transaction
 * holds a witness of, or given twice, is added once. Only the vkey entry of the witness set is
 * written: the body, the other entries of the witness set, the validity flag and the auxiliary
 * data keep their bytes, so the transaction's hash does not change. The transaction is returned
 * as it is when nothing is added
 * @param txHex A transaction in CBOR hex
 * @throws Error for what is not a transaction, and for a witness set that repeats a key, any key:
 *   a reader may take another entry than the one written into, and none is
 */
export const addVKeyWitnessesToTransaction = (
  txHex: string,
  witnesses: readonly VkeyWitness[],
): string => {
  Transaction.fromCbor(TxCBOR(txHex));
  const tx = readTransactionItems(txHex);
  const at = tx.entries.findIndex((e) => e.key === VKEYS);
  if (repeatsKey(tx)) throw new Error(REPEATED_KEY);
  const held =
    at === -1
      ? []
      : CborSet.fromCbor(
          HexBlob(toHex(tx.entries[at]!.value)),
          VkeyWitness.fromCbor,
        ).values();
  const keys = new Set(held.map((witness) => witness.vkey()));
  const added: VkeyWitness[] = [];
  for (const witness of witnesses) {
    if (keys.has(witness.vkey())) continue;
    keys.add(witness.vkey());
    added.push(witness);
  }
  if (added.length === 0) return txHex;
  return spliced(
    tx,
    { vkeys: added.map((witness) => Buffer.from(witness.toCbor(), "hex")) },
    {},
  );
};

/**
 * A witness set holding only these vkey witnesses, in the form `keyWitnessSetTags` gives for the
 * transaction they sign, so that merged into it, it leaves the transaction the size its fee was
 * priced for; `a0` for none
 * @param txHex The transaction the witnesses sign, in CBOR hex
 */
export const vkeyWitnessSetFor = (
  txHex: string,
  witnesses: readonly VkeyWitness[],
): string => {
  const witnessSet = new TransactionWitnessSet();
  if (witnesses.length === 0) return witnessSet.toCbor();
  witnessSet.setVkeys(
    CborSet.fromCore(
      witnesses.map((witness) => witness.toCore()),
      VkeyWitness.fromCore,
    ),
  );
  return writtenWithSetTag(keyWitnessSetTags(txHex).vkey, () =>
    witnessSet.toCbor(),
  );
};

/**
 * The transaction with the vkey witnesses of a witness set added, as
 * `addVKeyWitnessesToTransaction` adds them
 * @param txHex A transaction in CBOR hex
 * @param vkeyWitnessSet A witness set in CBOR hex; its other witnesses are not added
 */
export const addVKeyWitnessSetToTransaction = (
  txHex: string,
  vkeyWitnessSet: string,
): string =>
  addVKeyWitnessesToTransaction(
    txHex,
    TransactionWitnessSet.fromCbor(HexBlob(vkeyWitnessSet)).vkeys()?.values() ??
      [],
  );
