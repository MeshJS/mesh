import { bech32 } from "bech32";

import { Crypto, HexBlob } from "@meshsdk/core-cst";

import type { TxHashRequest, TxHashSignature, TxHashSigner } from "./sign";
import { TxBuildError } from "./errors";
import { readTransaction } from "./sign";

/*
 * A signer over one private key. The key is read from text once and kept in a closure. Nothing
 * that reads or uses it puts the text, a part of it or an error of another library into an error
 * it throws: the messages are fixed, and name only the form and the length of what was given.
 */

/** Bech32 prefixes of a 32-byte Ed25519 signing key */
const NORMAL_PREFIXES: readonly string[] = [
  "ed25519_sk",
  "addr_sk",
  "stake_sk",
  "drep_sk",
  "cc_cold_sk",
  "cc_hot_sk",
  "pool_sk",
  "policy_sk",
  "addr_shared_sk",
  "stake_shared_sk",
];
/** The bech32 prefix of a 64-byte extended signing key */
const EXTENDED_PREFIX = "ed25519e_sk";
/**
 * Bech32 prefixes of an extended signing key with its chain code (96 bytes), or with its public
 * key and chain code (128 bytes)
 */
const CHAINED_PREFIXES: readonly string[] = [
  "addr_xsk",
  "stake_xsk",
  "drep_xsk",
  "cc_cold_xsk",
  "cc_hot_xsk",
  "pool_xsk",
  "addr_shared_xsk",
  "stake_shared_xsk",
];
/** Prefixes of root and account keys, which need a derivation path */
const DERIVING = /^(?:(?:root|acct)(?:_shared)?_x?sk|xprv)$/;
/**
 * The length limit of the bech32 reader: the format's own maximum, not a key's length, which is
 * checked after decoding
 */
const BECH32_LIMIT = 1023;
/** The word counts of a BIP-39 mnemonic */
const MNEMONIC_WORDS: readonly number[] = [12, 15, 18, 21, 24];

const ALLOWED =
  "an Ed25519 signing key: hex of 32 bytes, or of 64 for an extended key; the cborHex of a cardano-cli signing key file (5820..., or 5880... for an extended key); or bech32 ed25519_sk, ed25519e_sk, or the CIP-5 prefix of a signing key (addr_sk, addr_xsk, stake_sk, stake_xsk, drep_sk, ...)";

/** The JavaScript type of a value, with `null` told apart */
const typeOf = (value: unknown) => (value === null ? "null" : typeof value);

/**
 * The error for a key that cannot be used. `got` is a fixed text naming the form and the length
 * of what was given: never the text, a part of it, or another error
 * @param type The JavaScript type of what was given
 */
const invalidKey = (got: string, type = "string") =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid key: expected ${ALLOWED}; got ${got}`,
    {
      details: { option: "key", value: type, allowed: ALLOWED },
    },
  );

/** The error for a request a key signer cannot sign; `got` is a fixed text */
const invalidRequest = (
  option: string,
  value: unknown,
  allowed: string,
  got: string,
) =>
  new TxBuildError(
    "INVALID_OPTION",
    `invalid ${option}: expected ${allowed}; got ${got}`,
    {
      details: { option, value: typeOf(value), allowed },
    },
  );

/** A key as read from text */
type ReadKey = {
  kind: "normal" | "extended";
  /** 32 bytes of a normal key, 64 of an extended one */
  bytes: Uint8Array;
  /** The public key the text states along with the key, when it states one */
  publicKey?: Uint8Array;
};

/**
 * Whether 64 bytes have the bits of an extended Ed25519 key's scalar: the clamp of its first half
 */
const clamped = (bytes: Uint8Array) =>
  (bytes[0]! & 0x07) === 0 && (bytes[31]! & 0xc0) === 0x40;

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Reads a key in hex: plain, or the cborHex of a cardano-cli signing key file */
const readHexKey = (text: string): ReadKey => {
  if (text.length % 2 !== 0)
    throw invalidKey(`hex of ${plural(text.length, "digit")}, an odd number`);
  const bytes = new Uint8Array(Buffer.from(text, "hex"));
  const head = text.slice(0, 4).toLowerCase();
  if (bytes.length === 32) return { kind: "normal", bytes };
  if (bytes.length === 64) return { kind: "extended", bytes };
  if (bytes.length === 34 && head === "5820")
    return { kind: "normal", bytes: bytes.slice(2) };
  if (bytes.length === 130 && head === "5880")
    return {
      kind: "extended",
      bytes: bytes.slice(2, 66),
      publicKey: bytes.slice(66, 98),
    };
  if (bytes.length === 96)
    throw invalidKey(
      "hex of 96 bytes: a key with a chain code, which may be a root or an account key and needs a derivation path; give it to a wallet",
    );
  throw invalidKey(`hex of ${plural(bytes.length, "byte")}`);
};

/** Reads a key in bech32, by its prefix and length */
const readBech32Key = (text: string): ReadKey => {
  const decoded = bech32.decodeUnsafe(text, BECH32_LIMIT);
  const words = decoded && bech32.fromWordsUnsafe(decoded.words);
  if (!decoded || !words)
    throw invalidKey(
      `text of ${plural(text.length, "character")} that is neither hex nor bech32 with a valid checksum`,
    );
  const { prefix } = decoded;
  const bytes = new Uint8Array(words);
  if (DERIVING.test(prefix))
    throw invalidKey(
      `a key with the prefix ${prefix}, which needs a derivation path; give it to a wallet`,
    );
  if (NORMAL_PREFIXES.includes(prefix)) {
    if (bytes.length === 32) return { kind: "normal", bytes };
  } else if (prefix === EXTENDED_PREFIX) {
    if (bytes.length === 64) return { kind: "extended", bytes };
  } else if (CHAINED_PREFIXES.includes(prefix)) {
    if (bytes.length === 96)
      return { kind: "extended", bytes: bytes.slice(0, 64) };
    if (bytes.length === 128)
      return {
        kind: "extended",
        bytes: bytes.slice(0, 64),
        publicKey: bytes.slice(64, 96),
      };
  } else
    throw invalidKey(
      `bech32 with the prefix ${prefix}, which is not of a signing key read here`,
    );
  throw invalidKey(
    `a key with the prefix ${prefix} of ${plural(bytes.length, "byte")}`,
  );
};

/**
 * Reads a private key from text, checking all that can be checked without the crypto library
 * @throws TxBuildError INVALID_OPTION (`key`) that holds nothing of the text
 */
const readKey = (key: unknown): ReadKey => {
  if (typeof key !== "string")
    throw invalidKey(`a value of type ${typeOf(key)}`, typeOf(key));
  const text = key.trim();
  if (text === "") throw invalidKey("an empty text");
  if (/\s/.test(text)) {
    const words = text.split(/\s+/);
    // Only text shaped as a mnemonic is called one: a key file or a broken line is not
    if (
      MNEMONIC_WORDS.includes(words.length) &&
      words.every((word) => /^[a-z]+$/.test(word))
    )
      throw invalidKey(
        `text of ${plural(words.length, "word")}: a mnemonic needs a derivation path; give it to a wallet`,
      );
    throw invalidKey(
      `text of ${plural(text.length, "character")} with whitespace inside: give the key's hex, the cborHex of a key file, or its bech32`,
    );
  }
  const read = /^[0-9a-fA-F]+$/.test(text)
    ? readHexKey(text)
    : readBech32Key(text);
  // An unclamped scalar gives signatures that do not verify
  if (read.kind === "extended" && !clamped(read.bytes))
    throw invalidKey(
      "64 bytes that are not an extended Ed25519 key: the first 32 are not a clamped scalar",
    );
  return read;
};

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

/** The key ready to sign, with its public key and its hash */
type Started = {
  privateKey: Crypto.Ed25519PrivateKey;
  vkey: string;
  keyHash: string;
};

/**
 * Makes the library key. For an extended key, first the checks that need the crypto library:
 * that the key is not a 32-byte key followed by its public key (read as an extended key, one
 * signature of it would give the key away), and that a public key stated with it is its own
 */
const start = async (read: ReadKey): Promise<Started> => {
  await Crypto.ready();
  if (read.kind === "extended") {
    const seed = Crypto.Ed25519PrivateKey.fromNormalBytes(
      read.bytes.slice(0, 32),
    );
    if (seed.toPublic().hex() === toHex(read.bytes.slice(32)))
      throw invalidKey(
        "64 bytes that are a 32-byte key followed by its public key, not an extended key; give the first 32 bytes",
      );
  }
  const privateKey =
    read.kind === "normal"
      ? Crypto.Ed25519PrivateKey.fromNormalBytes(read.bytes)
      : Crypto.Ed25519PrivateKey.fromExtendedBytes(read.bytes);
  const publicKey = privateKey.toPublic();
  if (read.publicKey !== undefined && toHex(read.publicKey) !== publicKey.hex())
    throw invalidKey(
      "a key file whose public key is not the public key of its signing key",
    );
  return {
    privateKey,
    vkey: publicKey.hex(),
    keyHash: publicKey.hash().hex(),
  };
};

const HASH_ALLOWED = "the hash of a transaction body, 32 bytes in hex";

const REQUEST_ALLOWED = "{ txHash, keys?, tx }";
const KEYS_ALLOWED = "a list of { keyHash, roles }";

/** Whether a value is a list; a revoked proxy is not */
const isList = (value: unknown) => {
  try {
    return Array.isArray(value);
  } catch {
    return false;
  }
};

/** The key hash of an entry of a request's `keys`, in lower case, if it has one */
const hashOf = (asked: unknown) => {
  if (typeof asked !== "object" || asked === null) return undefined;
  const { keyHash } = asked as Record<string, unknown>;
  return typeof keyHash === "string" ? keyHash.toLowerCase() : undefined;
};

/**
 * The key hashes a request's `keys` name, read by index without calling a method of the list: a
 * list that cannot be read is INVALID_OPTION, never another error
 */
const askedHashes = (keys: unknown[]) => {
  try {
    const hashes: (string | undefined)[] = [];
    for (let i = 0, length = keys.length; i < length; i++)
      hashes.push(hashOf(keys[i]));
    return hashes;
  } catch {
    throw invalidRequest(
      "keys",
      keys,
      KEYS_ALLOWED,
      "a list whose entries cannot be read",
    );
  }
};

/** The members of a request, read once: a request whose members cannot be read is INVALID_OPTION */
const membersOf = (request: object) => {
  try {
    const { txHash, tx, keys } = request as Record<string, unknown>;
    return { txHash, tx, keys };
  } catch {
    throw invalidRequest(
      "request",
      request,
      REQUEST_ALLOWED,
      "an object whose members cannot be read",
    );
  }
};

/**
 * The hash a request asks to be signed, in lower case, when it is the hash of the body of the
 * transaction the request shows
 * @throws TxBuildError INVALID_OPTION (`request`, `txHash`, `tx`, `keys`) otherwise
 */
const requestedHash = (request: unknown) => {
  if (typeof request !== "object" || request === null)
    throw invalidRequest(
      "request",
      request,
      REQUEST_ALLOWED,
      `a value of type ${typeOf(request)}`,
    );
  const { txHash, tx, keys } = membersOf(request);
  if (typeof txHash !== "string" || !/^[0-9a-fA-F]{64}$/.test(txHash))
    throw invalidRequest(
      "txHash",
      txHash,
      HASH_ALLOWED,
      typeof txHash === "string"
        ? `text of ${plural(txHash.length, "character")}`
        : `a value of type ${typeOf(txHash)}`,
    );
  if (keys !== undefined && !isList(keys))
    throw invalidRequest(
      "keys",
      keys,
      KEYS_ALLOWED,
      `a value of type ${typeOf(keys)}`,
    );
  let bodyHash: string;
  try {
    bodyHash = readTransaction(tx).txId;
  } catch {
    // The reader's error quotes the value given: a fixed text takes its place
    throw invalidRequest(
      "tx",
      tx,
      "a transaction in CBOR hex",
      `a value of type ${typeOf(tx)} that is not a transaction`,
    );
  }
  if (bodyHash !== txHash.toLowerCase())
    throw invalidRequest(
      "txHash",
      txHash,
      HASH_ALLOWED,
      "a hash that is not the hash of the body of tx",
    );
  return {
    txHash: bodyHash,
    keys: keys === undefined ? undefined : askedHashes(keys as unknown[]),
  };
};

/**
 * A signer over one Ed25519 signing key, for every place that takes `signers`. It signs a
 * transaction's hash when the hash of its key is among the request's `keys`, whatever their
 * roles, and answers with nothing when it is not; asked without `keys`
 * (`signWitnesses(signer, tx)`), it signs. It signs only a `txHash` that is the hash of the body
 * of the `tx` it is shown: any other request is TxBuildError INVALID_OPTION, which a caller of
 * signers reads as SIGNER_FAILED.
 *
 * The key is read here, once, and kept inside the signer: it is no property of it, and is in no
 * error, trace event or plan record. `JSON.stringify(signer)` is `{}`.
 *
 * An extended key is checked further at its first use, before anything is signed: that it is not
 * a 32-byte key followed by its public key, and that the public key a key file states with it is
 * its own. Either check failing is INVALID_OPTION (`key`) from `signTxHash`, every time, and
 * nothing is signed.
 *
 * @param key The key as text; spaces around it are dropped:
 *   - hex of 32 bytes, or of 64 bytes for an extended key;
 *   - the `cborHex` of a cardano-cli signing key file: `5820…`, or `5880…` for an extended key
 *     (with its public key, which is checked, and its chain code);
 *   - bech32 `ed25519_sk` or `ed25519e_sk`;
 *   - bech32 with the CIP-5 prefix of a key that signs: `addr_sk`, `stake_sk`, `drep_sk`,
 *     `cc_cold_sk`, `cc_hot_sk`, `pool_sk`, `policy_sk`, `addr_shared_sk`, `stake_shared_sk`, and
 *     the extended `addr_xsk`, `stake_xsk`, `drep_xsk`, `cc_cold_xsk`, `cc_hot_xsk`, `pool_xsk`,
 *     `addr_shared_xsk`, `stake_shared_xsk` (with their chain code, which is not used; of 128
 *     bytes, with their public key, which is checked, before the chain code).
 *   A mnemonic, a root key (`xprv`, `root_xsk`) and an account key (`acct_xsk`) need a derivation
 *   path and are refused: they are a wallet's. So are 64 bytes that are a 32-byte key followed by
 *   its public key: give the first 32 bytes.
 * @throws TxBuildError INVALID_OPTION (`option: "key"`) for anything else, at this call.
 *   `details.value` is only the JavaScript type of what was given, the message names only its
 *   form and length, and the error has no `cause`: the text given is in none of them
 */
export function keySigner(key: string): TxHashSigner {
  const read = readKey(key);
  let started: Promise<Started> | undefined;
  return Object.freeze({
    async signTxHash(
      request: TxHashRequest,
    ): Promise<readonly TxHashSignature[]> {
      const { txHash, keys } = requestedHash(request);
      started ??= start(read);
      const { privateKey, vkey, keyHash } = await started;
      // Its own key is looked for by hash; the roles do not change what it signs
      if (keys !== undefined && !keys.includes(keyHash)) return [];
      return [{ vkey, signature: privateKey.sign(HexBlob(txHash)).hex() }];
    },
  });
}
