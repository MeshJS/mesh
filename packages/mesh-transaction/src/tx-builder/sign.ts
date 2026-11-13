import type { UTxO } from "@meshsdk/common";
import {
  Address,
  CborReader,
  CborWriter,
  CredentialType,
  Crypto,
  HexBlob,
  Serialization,
  Transaction,
  transactionPrototypeFromCardano,
} from "@meshsdk/core-cst";

import type { RequiredKeys } from "./payer";
import type { Collected, PartRef, SignerRole, TxSigners } from "./witnesses";
import { TxBuildError, TxIntentError } from "./errors";
import { errorText } from "./parts/normalize";
import { walletCodeOf } from "./payer";
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

/** Something that signs: a wallet, or a raw CIP-30 api (`signTx(tx, partialSign)`) */
export type Signer =
  | { signTxWitnesses(tx: string, keyHashes?: RequiredKeys): Promise<string> }
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
  const valueOf = (key: number) => entries.find((e) => e.key === key)?.value;
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

/** The witnesses of a set, vkey witnesses first */
const witnessesOf = (set: WitnessSet) => [
  ...(set.vkeys?.witnesses ?? []),
  ...(set.bootstraps?.witnesses ?? []),
];

/** A transaction read as its raw top-level items */
export type RawTx = {
  hex: string;
  transaction: Transaction;
  top: Container;
  witnessSet: WitnessSet;
  /** The blake2b-256 hash of the body bytes */
  txId: string;
  /** Whether the body writes its input set with the set tag */
  taggedSets: boolean;
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

const readRawTx = (hex: string): RawTx => {
  const transaction = Transaction.fromCbor(HexBlob(hex) as never);
  const top = readContainer(Buffer.from(hex, "hex"), "array");
  if (top.items.length < 3)
    throw new Error("a transaction has at least three items");
  return {
    hex,
    transaction,
    top,
    witnessSet: readWitnessSet(top.items[1]!),
    txId: Crypto.blake2b.hash(HexBlob(toHex(top.items[0]!)), 32).toString(),
    taggedSets: bodyUsesSetTag(top.items[0]!),
  };
};

/** The error for a `tx` argument that cannot be read as a transaction */
const invalidTx = (tx: unknown, cause?: unknown) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid tx: expected a transaction in CBOR hex${cause === undefined ? "" : `: ${errorText(cause)}`}`,
    {
      details: {
        option: "tx",
        value: tx,
        allowed: "a transaction in CBOR hex",
      },
      ...(cause !== undefined && { cause }),
    },
  );

/**
 * Reads `tx` as a transaction
 * @throws TxBuildError INVALID_OPTION for a value that is not the CBOR of a transaction whose
 *   vkey and bootstrap witnesses can be read
 */
export const readTransaction = (tx: unknown): RawTx => {
  if (!isHex(tx)) throw invalidTx(tx);
  try {
    return readRawTx(tx);
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

/**
 * A witness set holding only these witnesses: a vkey entry and a bootstrap entry, each when it
 * has a witness, with the set tag when `tagged`
 */
export const writeWitnessSet = (
  witnesses: readonly KeyWitness[],
  tagged: boolean,
): string => {
  const vkeys = witnesses.filter((w) => w.kind === "vkey");
  const bootstraps = witnesses.filter((w) => w.kind === "bootstrap");
  const writer = new CborWriter();
  writer.writeStartMap(
    (vkeys.length > 0 ? 1 : 0) + (bootstraps.length > 0 ? 1 : 0),
  );
  if (vkeys.length > 0)
    writer.writeInt(VKEYS).writeEncodedValue(writeEntry(vkeys, tagged));
  if (bootstraps.length > 0)
    writer
      .writeInt(BOOTSTRAPS)
      .writeEncodedValue(writeEntry(bootstraps, tagged));
  return toHex(writer.encode());
};

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
 * The transaction with these witnesses added to its witness set. Only the vkey and bootstrap
 * entries change; every other byte is kept. The witnesses must be new to it.
 */
export const withWitnesses = (
  raw: RawTx,
  added: readonly KeyWitness[],
): string => {
  if (added.length === 0) return raw.hex;
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
  // A new entry goes before the first larger key, written as the body writes its input set
  for (const key of [VKEYS, BOOTSTRAPS] as const) {
    if (held[key] || byKind[key].length === 0) continue;
    const at = entries.findIndex((e) => e.key > key);
    entries.splice(at === -1 ? entries.length : at, 0, {
      key,
      bytes: [
        new CborWriter().writeInt(key).encode(),
        writeEntry(byKind[key], raw.taggedSets),
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

/** The CIP-30 codes a signer's error is read by: TxSignError UserDeclined, APIError AccountChange */
const USER_DECLINED = 2;
const ACCOUNT_CHANGE = -4;

/** The error of a signer whose call rejected, read by its `code`, without instanceof */
const signerError = (error: unknown) => {
  const walletCode = walletCodeOf(error);
  if (walletCode === USER_DECLINED)
    return new TxIntentError(
      "SIGN_DECLINED",
      `the signer declined to sign: ${errorText(error)}`,
      { cause: error },
    );
  return new TxIntentError(
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

/** A wallet of the Mesh 1.9 kind: `getUtxosHex` of `MeshWallet`, `_walletInstance` of `BrowserWallet` */
const isMeshWallet = (signer: object) =>
  "getUtxosHex" in signer || "_walletInstance" in signer;

/** Calls the signer the way it takes a transaction to sign */
const callSigner = (signer: Signer, tx: string, keyHashes?: RequiredKeys) => {
  if (isFunction(signer, "signTxWitnesses")) {
    const { signTxWitnesses } = signer as Extract<
      Signer,
      { signTxWitnesses: unknown }
    >;
    return keyHashes === undefined
      ? signTxWitnesses.call(signer, tx)
      : signTxWitnesses.call(signer, tx, keyHashes);
  }
  const { signTx } = signer as Extract<Signer, { signTx: unknown }>;
  return isMeshWallet(signer)
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

/**
 * A signer's witnesses as a CBOR witness set, never the transaction. Calls
 * `signTxWitnesses(tx, keyHashes)` when the signer has it, else `signTx`: `signTx(tx, true, false)`
 * on a Mesh wallet, `signTx(tx, true)` on a CIP-30 api. A full transaction in the answer is reduced
 * to the witnesses it adds.
 * @param keyHashes The keys asked for. Only a signer with `signTxWitnesses` is handed the list;
 *   any other signer chooses its keys itself. The answer is returned whole and is not filtered
 *   by the list
 * @throws TxIntentError SIGN_DECLINED when the user declines; SIGNER_FAILED when the signer fails
 *   otherwise, or answers with something that is neither a witness set nor a transaction. The
 *   signer's own error is the `cause`.
 * @throws TxBuildError INVALID_OPTION for a `signer` with neither `signTxWitnesses` nor `signTx`,
 *   and for a `tx` that is not a transaction; the signer is not called
 */
export async function signWitnesses(
  signer: Signer,
  tx: string,
  keyHashes?: RequiredKeys,
): Promise<string> {
  if (!isFunction(signer, "signTxWitnesses") && !isFunction(signer, "signTx")) {
    const type = signer === null ? "null" : typeof signer;
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid signer: expected an object with signTxWitnesses or signTx; got ${type === "object" ? "an object without either" : type}`,
      {
        details: {
          option: "signer",
          value: type,
          allowed: "an object with signTxWitnesses or signTx",
        },
      },
    );
  }
  const raw = readTransaction(tx);
  let answer: unknown;
  try {
    answer = await callSigner(signer, tx, keyHashes);
  } catch (error) {
    throw signerError(error);
  }
  try {
    return answerWitnessSet(answer, raw);
  } catch (error) {
    throw new TxIntentError(
      "SIGNER_FAILED",
      `the signer answered with neither a witness set nor a transaction: ${errorText(error)}`,
      { details: { reason: "error" }, cause: error },
    );
  }
}

const invalidWitness = (
  argument: number,
  reason: "undecodable" | "wrongBody",
  message: string,
  extra: { keyHash?: string; cause?: unknown } = {},
) =>
  new TxIntentError("INVALID_WITNESS", message, {
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
 * @throws TxIntentError INVALID_WITNESS for the first argument that cannot be read, or holds a
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
 * Adds the vkey and bootstrap witnesses of each witness set or full transaction once. Only the
 * transaction's own witness set changes; every other element stays byte for byte.
 * @throws TxIntentError INVALID_WITNESS for an argument that cannot be decoded, or holding a
 *   witness that does not verify against the body; `details.argument` is the index of that
 *   argument among `witnesses`, counted from 0
 * @throws TxBuildError INVALID_OPTION for a `tx` that is not a transaction
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
 * @throws TxBuildError INVALID_OPTION for a `tx` that is not a transaction
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

/**
 * The signatures a serialized transaction needs, given the UTxOs it spends: for a co-signer or a
 * server checking a transaction it did not build
 * @param spent The UTxO of every input and collateral input. UTxOs of reference inputs may be
 *   given too: only then is a native script the transaction runs from one of them listed in
 *   `nativeScripts`
 * @throws TxBuildError UTXO_NOT_FOUND for an input or collateral input whose UTxO is not in
 *   `spent`; INVALID_OPTION for a `tx` that is not a transaction, and for a `spent` that is not
 *   a list
 */
export function requiredSigners(tx: string, spent: readonly UTxO[]): TxSigners {
  const raw = readTransaction(tx);
  if (!Array.isArray(spent))
    throw new TxBuildError(
      "INVALID_OPTION",
      "invalid spent: expected a list of UTxOs",
      {
        details: { option: "spent", value: spent, allowed: "a list of UTxOs" },
      },
    );
  return signersOf(bodySigners(raw, spent).collected);
}

/**
 * What a serialized transaction needs signed, as `requiredSigners` works it out, with the hashes
 * of the scripts its body calls for: the payment credentials of its spent inputs, its minted
 * policies, the script credentials of its withdrawals, certificates and voters, and the policy
 * hashes of its proposals
 * @throws TxBuildError UTXO_NOT_FOUND for an input or collateral input whose UTxO is not in
 *   `spent`; INVALID_OPTION for a body that cannot be read
 */
export const bodySigners = (
  raw: RawTx,
  spent: readonly UTxO[],
): { collected: Collected; scripts: Set<string> } => {
  const tx = raw.hex;
  // Only the body is decoded, and without its proposals: of those only the policy hash is
  // needed, read below from the actions as they are
  const proposals = raw.transaction.body().proposalProcedures()?.values() ?? [];
  let body: ReturnType<typeof transactionPrototypeFromCardano>["body"];
  try {
    const items = Serialization.TransactionBody.fromCbor(
      raw.transaction.body().toCbor(),
    );
    items.setProposalProcedures(undefined as never);
    body = transactionPrototypeFromCardano(
      new Transaction(items, new Serialization.TransactionWitnessSet()),
    ).body;
  } catch (error) {
    throw invalidTx(tx, error);
  }
  const given = new Map<string, UTxO>();
  for (const utxo of spent)
    given.set(outRefKey(utxo.input.txHash, utxo.input.outputIndex), utxo);
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
  /** Each body item needs its keys like a part of its kind, without a label */
  const item = (kind: PartRef["kind"]): PartRef => {
    collected.partKeys = new Set();
    return { kind };
  };
  // Hashes of the scripts the transaction runs, to tell which reference scripts run
  const scripts = new Set<string>();
  const credential = (
    value: { type: "KEY" | "SCRIPT"; value: string } | undefined,
    part: PartRef,
    role: SignerRole,
  ) => {
    if (value?.type === "SCRIPT") scripts.add(value.value);
    else addCredential(collected, value, part, role);
  };

  for (const utxo of inputs) {
    addAddress(collected, utxo, item("spend"), "input");
    const payment = Address.fromString(utxo.output.address)?.getProps()
      .paymentPart;
    if (payment?.type === CredentialType.ScriptHash)
      scripts.add(payment.hash.toString());
  }
  for (const utxo of collateral)
    addAddress(collected, utxo, item("collateral"), "collateral");
  for (const keyHash of body.required_signers ?? [])
    addKey(collected, keyHash, item("guard"), "guard");
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
      item("withdrawal"),
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
    const part = { ...item("certificate"), certificate };
    if (certificateCredential(certificate)?.type === "SCRIPT")
      scripts.add(certificateCredential(certificate)!.value);
    else certificateKeys(collected, part);
  }
  for (const { voter } of body.voting_procedures ?? []) {
    if (voter.type === "STAKING_POOL")
      addKey(collected, voter.value, item("vote"), "vote");
    else credential(voter.value, item("vote"), "vote");
  }
  for (const proposal of proposals) {
    const action = proposal.toCore().governanceAction;
    if ("policyHash" in action && action.policyHash)
      scripts.add(action.policyHash.toString());
  }
  for (const policyId of Object.keys(body.mint ?? {})) scripts.add(policyId);

  // Native scripts the witness set holds, then those held by given UTxOs the transaction reads
  for (const native of raw.transaction.witnessSet().nativeScripts()?.values() ??
    [])
    addNativeScript(collected, nativeScriptEntry(native));
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const native = nativeScriptRef(
      given.get(outRefKey(input.transaction_id, input.index)),
    );
    if (native && scripts.has(native.hash)) addNativeScript(collected, native);
  }
  return { collected, scripts };
};
