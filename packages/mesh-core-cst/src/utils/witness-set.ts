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

const readItems = (bytes: Uint8Array, kind: "array" | "map"): Items => {
  const reader = readerOf(bytes);
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

type WitnessSetEntry = { key: bigint; keyBytes: Uint8Array; value: Uint8Array };

/** A transaction as its items, and the entries of its witness set, each as written */
const readTransactionItems = (txHex: string) => {
  const top = readItems(Buffer.from(txHex, "hex"), "array");
  if (!top.definite || top.items.length < 3 || top.items.length > 4)
    throw new Error(
      "a transaction is an array of three or four items, of definite length",
    );
  const set = readItems(top.items[1]!, "map");
  const entries: WitnessSetEntry[] = [];
  for (let i = 0; i < set.items.length; i += 2)
    entries.push({
      key: readerOf(set.items[i]!).readUInt(),
      keyBytes: set.items[i]!,
      value: set.items[i + 1]!,
    });
  return { top, set, entries };
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
 * The transaction with these vkey witnesses added to its vkey witness set, in the form
 * `keyWitnessSetTags` gives: a set the transaction holds keeps its form, and a new one takes the
 * form of the body's inputs. A witness of a key the transaction holds a witness of, or given
 * twice, is added once. Only the vkey entry of the witness set is written: the body, the other
 * entries of the witness set, the validity flag and the auxiliary data keep their bytes, so the
 * transaction's hash does not change. The transaction is returned as it is when nothing is added
 * @param txHex A transaction in CBOR hex
 * @throws Error for what is not a transaction, and for a witness set that repeats the key of its
 *   vkey witnesses: a reader may take another entry than the one written into, and none is
 */
export const addVKeyWitnessesToTransaction = (
  txHex: string,
  witnesses: readonly VkeyWitness[],
): string => {
  Transaction.fromCbor(TxCBOR(txHex));
  const tx = readTransactionItems(txHex);
  const at = tx.entries.findIndex((e) => e.key === VKEYS);
  if (tx.entries.filter((e) => e.key === VKEYS).length > 1)
    throw new Error(
      "the witness set of the transaction repeats the key of its vkey witnesses: none is added",
    );
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
  // The witnesses held keep their bytes; the set is written in the form `tagsOf` gives
  const vkeys = writtenWithSetTag(tagsOf(tx).vkey, () => {
    const set = CborSet.fromCore([], VkeyWitness.fromCore);
    set.setValues([...held, ...added]);
    return set.toCbor();
  });
  const entries = tx.entries.map((e) => [e.keyBytes, e.value]);
  const value = Buffer.from(vkeys, "hex");
  if (at === -1) {
    // A new entry goes before the first larger key
    const before = tx.entries.findIndex((e) => e.key > VKEYS);
    entries.splice(before === -1 ? entries.length : before, 0, [
      new CborWriter().writeInt(VKEYS).encode(),
      value,
    ]);
  } else entries[at] = [tx.entries[at]!.keyBytes, value];
  const { top, set } = tx;
  const header =
    set.definite && at === -1
      ? new CborWriter().writeStartMap(entries.length).encode()
      : set.header;
  const witnessSet = Buffer.concat([header, ...entries.flat(), set.trailer]);
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
