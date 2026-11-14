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

import type { Utxo, UtxoInput } from "./parts/types";
import type { RequiredKeys } from "./payer";
import type { Collected, PartRef, SignerRole, TxSigners } from "./witnesses";
import { TxBuildError, TxPlanError } from "./errors";
import { errorText } from "./parts/normalize";
import { readUtxo } from "./parts/utxo";
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

/** What a signer of transaction hashes is asked: one call for one transaction */
export type TxHashRequest = {
  /**
   * The hash to sign: blake2b-256 of the transaction's body, 32 bytes in lower-case hex. It is
   * signed as its 32 bytes, not as its hex text, and nothing else is to be signed
   */
  readonly txHash: string;
  /**
   * The keys asked for, as key hashes (blake2b-224 of the public key) in lower-case hex: the
   * keys the transaction needs and those its native scripts name that have not signed yet.
   * Absent only when `signWitnesses` is called without `keyHashes`: the signer then chooses its
   * keys itself
   */
  readonly keyHashes?: readonly string[];
  /** The transaction `txHash` is the hash of, in CBOR hex, for a signer that checks what it signs */
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

/** A wallet of the Mesh 1.9 kind: `getUtxosHex` of `MeshWallet`, `_walletInstance` of `BrowserWallet` */
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

/** Whether a signer is asked with the hash of the transaction: `signTxHash` or its callback form */
export const signsHashes = (signer: Signer) => {
  const form = signerForm(signer);
  return form === "hash" || form === "callback";
};

/** A signer by its shape: one of the forms of `Signer` */
export const canSign = (value: unknown): value is Signer =>
  signerForm(value) !== undefined;

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

/** Calls a signer that takes the transaction, the way it takes it */
const callSigner = (
  signer: Signer,
  form: "witnesses" | "mesh" | "cip30",
  tx: string,
  keyHashes?: RequiredKeys,
) => {
  if (form === "witnesses") {
    const { signTxWitnesses } = signer as Extract<
      Signer,
      { signTxWitnesses: unknown }
    >;
    return keyHashes === undefined
      ? signTxWitnesses.call(signer, tx)
      : signTxWitnesses.call(signer, tx, keyHashes);
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
  keyHashes: RequiredKeys | undefined,
  signal: AbortSignal | undefined,
): Promise<string> => {
  // Nothing is left to sign: the signer is not asked
  if (keyHashes !== undefined && keyHashes.length === 0) return "a0";
  const request: TxHashRequest = Object.freeze({
    txHash: raw.txId,
    ...(keyHashes !== undefined && {
      keyHashes: Object.freeze(keyHashes.map((hash) => hash.toLowerCase())),
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
 * @param keyHashes The keys asked for, handed to a signer with `signTxWitnesses` or of hashes
 * @param signal Handed to a signer of hashes in its request
 */
export const askSigner = async (
  signer: Signer,
  raw: RawTx,
  {
    keyHashes,
    signal,
  }: { keyHashes?: RequiredKeys; signal?: AbortSignal } = {},
): Promise<string> => {
  const form = signerForm(signer)!;
  if (form === "hash" || form === "callback")
    return askHashSigner(signer, form, raw, keyHashes, signal);
  let answer: unknown;
  try {
    answer = await callSigner(signer, form, raw.hex, keyHashes);
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

/**
 * A signer's witnesses as a CBOR witness set, never the transaction. Calls
 * `signTxWitnesses(tx, keyHashes)` when the signer has it; else `signTxHash({ txHash, keyHashes,
 * tx })`, or the signer itself when it is a function, each of whose signatures is verified
 * against the transaction's hash; else `signTx`: `signTx(tx, true, false)` on a Mesh wallet,
 * `signTx(tx, true)` on a CIP-30 api. A full transaction in the answer is reduced to the
 * witnesses it adds.
 * @param keyHashes The keys asked for. A signer with `signTxWitnesses` or of hashes is handed the
 *   list, and a signer of hashes is not asked when it is empty; any other signer chooses its keys
 *   itself. The answer is returned whole and is not filtered by the list
 * @throws TxPlanError SIGN_DECLINED when the user declines (CIP-30 code 2) or the signer throws
 *   `TxPlanError` SIGN_DECLINED; SIGNER_FAILED when the signer fails otherwise, answers with
 *   something that is neither a witness set nor a transaction, or (a signer of hashes) with
 *   something that is not a list of `{ vkey, signature }` or holds a signature that does not
 *   verify. The signer's own error is the `cause`.
 * @throws TxBuildError INVALID_OPTION for a `signer` that is none of the forms of `Signer` (a
 *   private key given as it is among them: `keySigner(key)` makes a signer of it), and for a `tx`
 *   that is not a transaction; the signer is not called. For the signer, `details.value` is only
 *   the JavaScript type of what was given, never the value: something passed as a signer may
 *   hold keys, and `details` is data a logger prints
 */
export async function signWitnesses(
  signer: Signer,
  tx: string,
  keyHashes?: RequiredKeys,
): Promise<string> {
  if (!canSign(signer)) throw invalidSigner("signer", signer);
  return askSigner(signer, readTransaction(tx), { keyHashes });
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
 * Adds the vkey and bootstrap witnesses of each witness set or full transaction once. Only the
 * transaction's own witness set changes; every other element stays byte for byte.
 * @throws TxPlanError INVALID_WITNESS for an argument that cannot be decoded, or holding a
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
 * @param spent The UTxO of every input and collateral input, each in any form the builder takes
 *   a UTxO in. UTxOs of reference inputs may be given too: only then is a native script the
 *   transaction runs from one of them listed in `nativeScripts`
 * @throws TxBuildError UTXO_NOT_FOUND for an input or collateral input whose UTxO is not in
 *   `spent`; INVALID_OPTION for a `tx` that is not a transaction, and for a `spent` that is not
 *   a list or holds an entry that is not a UTxO (an address that does not parse among them)
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
        details: { option: "spent", value: spent, allowed: "a list of UTxOs" },
      },
    );
  // Each entry read as a payer's UTxO is: an entry whose address cannot be read would
  // otherwise drop the key that signs for it, an answer that is silently short
  const utxos = (spent as readonly unknown[]).map((entry) => {
    try {
      return readUtxo(entry);
    } catch (error) {
      throw new TxBuildError(
        "INVALID_OPTION",
        `invalid spent: an entry is not a UTxO: ${errorText(error)}`,
        {
          details: {
            option: "spent",
            value: entry,
            allowed: "a list of UTxOs",
          },
          cause: error,
        },
      );
    }
  });
  return signersOf(bodySigners(raw, utxos).collected);
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
  spent: readonly Utxo[],
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
    const payment = Address.fromString(utxo.address)?.getProps().paymentPart;
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
