/**
 * CIP-8 admin-signature machinery for the `WithdrawDisputed` action: producing and verifying
 * the M-of-N admin signatures over a `DisputeWithdrawal{own_ref, buyer_value, seller_value}`
 * digest, exactly as `vested_pay.ak`'s `has_valid_admin_signature`/`cip8_sig_structure`/
 * `cbor_byte_string` compute and check them. Byte-for-byte ported (not just behaviorally
 * matched) since the validator recomputes and compares these bytes on-chain.
 */
import {
  Cbor,
  CborArray,
  CborBytes,
  CborMap,
  CborSimple,
  CborText,
} from "@harmoniclabs/cbor";
import { DataB, DataConstr, DataI, dataToCbor } from "@harmoniclabs/plutus-data";
import {
  blake2b,
  Crypto,
  Ed25519PublicKey,
  Ed25519Signature,
  getPublicKeyFromCoseKey,
  HexBlob,
} from "@meshsdk/core-cst";
import { DataSignature } from "@meshsdk/common";
import { MeshWallet } from "@meshsdk/wallet";

/** The 3 fields `has_valid_admin_signature` checks - not a combined COSE_Sign1 blob. */
export type AdminSignature = {
  verificationKey: string; // 32-byte Ed25519 pubkey, hex
  protectedHeaders: string; // raw CBOR bytes of the COSE_Sign1 protected header map, hex
  signature: string; // 64-byte Ed25519 signature, hex
};

/** `[(policyId, [(assetName, quantity)])]` - Aiken's `AssetValue` shape, used for dispute payouts. */
export type AssetValueEntry = { policyId: string; assets: { assetName: string; quantity: bigint }[] };

/** Cardano CIP-8 protected-header byte cap the validator enforces (`max_protected_headers_bytes`). */
export const MAX_PROTECTED_HEADERS_BYTES = 256;

/**
 * `cbor_byte_string`: minimal CBOR byte-string (major type 2) encoder, ported verbatim.
 * Cross-checked against the validator's own test vector: `cborByteString([0x01,0x02,0x03])` ===
 * `43010203` hex.
 */
export const cborByteString = (bytes: Uint8Array): Uint8Array => {
  const length = bytes.length;
  if (length < 24) {
    return Uint8Array.from([0x40 + length, ...bytes]);
  }
  if (length < 256) {
    return Uint8Array.from([0x58, length, ...bytes]);
  }
  if (length < 65536) {
    return Uint8Array.from([0x59, (length >> 8) & 0xff, length & 0xff, ...bytes]);
  }
  throw new Error("cborByteString: length must be < 65536");
};

const SIG_STRUCTURE_PREFIX = Uint8Array.from(
  Buffer.from("846a5369676e617475726531", "hex"),
);
const EMPTY_AAD = Uint8Array.from([0x40]);

/**
 * `cip8_sig_structure`: COSE `Sig_structure` for context "Signature1" with an empty external
 * AAD - `["Signature1", protectedHeaders, h'', payload]`. Cross-checked against the
 * validator's own test vector: `cip8SigStructure(hex("a10126"), hex("0001"))` ===
 * `846a5369676e61747572653143a1012640420001` hex.
 */
export const cip8SigStructure = (protectedHeaders: Uint8Array, payload: Uint8Array): Uint8Array =>
  Uint8Array.from([
    ...SIG_STRUCTURE_PREFIX,
    ...cborByteString(protectedHeaders),
    ...EMPTY_AAD,
    ...cborByteString(payload),
  ]);

/** Parses a Mesh `DataSignature` (from `wallet.signData`) into the 3 fields an `AdminSignature` needs. */
export const adminSignatureFromDataSignature = (ds: DataSignature): AdminSignature => {
  const decoded = Cbor.parse(ds.signature);
  if (!(decoded instanceof CborArray) || decoded.array.length !== 4) {
    throw new Error("Invalid COSE_Sign1 structure");
  }
  const protectedBytes = decoded.array[0];
  const signatureBytes = decoded.array[3];
  if (!(protectedBytes instanceof CborBytes) || !(signatureBytes instanceof CborBytes)) {
    throw new Error("Invalid COSE_Sign1 protected header or signature field");
  }
  return {
    verificationKey: getPublicKeyFromCoseKey(ds.key).toString("hex"),
    protectedHeaders: Buffer.from(protectedBytes.bytes).toString("hex"),
    signature: Buffer.from(signatureBytes.bytes).toString("hex"),
  };
};

/** Produces one admin's `AdminSignature` over `digestHex` via `wallet.signData`. */
export const signAdminIntent = async (digestHex: string, wallet: MeshWallet): Promise<AdminSignature> => {
  const ds = await wallet.signData(digestHex);
  return adminSignatureFromDataSignature(ds);
};

/**
 * Mirrors `has_valid_admin_signature`: verifies `signature` was produced by the key hashing to
 * `adminVkHashHex`, over `digestHex` in either raw or blake2b_224-hashed payload mode (matching
 * software vs. hardware-wallet CIP-8 signing conventions - exactly one mode must match).
 */
export const verifyAdminSignature = async (
  adminVkHashHex: string,
  digestHex: string,
  signature: AdminSignature,
): Promise<boolean> => {
  await Crypto.ready();
  if (Buffer.from(signature.protectedHeaders, "hex").length > MAX_PROTECTED_HEADERS_BYTES) return false;

  const vkHash = blake2b.hash(HexBlob(signature.verificationKey), 28);
  if (vkHash !== adminVkHashHex.toLowerCase()) return false;

  const hashedDigest = blake2b.hash(HexBlob(digestHex), 28);
  const publicKeyBuffer = Buffer.from(signature.verificationKey, "hex");
  const signatureBuffer = Buffer.from(signature.signature, "hex");
  const protectedHeaderBytes = Buffer.from(signature.protectedHeaders, "hex");

  const pk = new Ed25519PublicKey(publicKeyBuffer);
  const sig = new Ed25519Signature(signatureBuffer);

  for (const payloadHex of [digestHex, hashedDigest]) {
    const structure = cip8SigStructure(protectedHeaderBytes, Buffer.from(payloadHex, "hex"));
    if (pk.verify(sig, HexBlob(Buffer.from(structure).toString("hex")))) return true;
  }
  return false;
};

/**
 * Canonical (definite-length) CBOR unsigned-integer encoder, minimal-width per RFC 8949 - the
 * encoding Aiken's `cbor.serialise` uses for `Int`. Cross-checked against the validator's own
 * `cbor.serialise` output (see `assetValueToCanonicalCbor`'s doc comment).
 */
const cborUint = (n: bigint): Uint8Array => {
  if (n < 0n) throw new Error("cborUint: AssetValue quantities must be non-negative");
  if (n < 24n) return Uint8Array.from([Number(n)]);
  if (n < 256n) return Uint8Array.from([0x18, Number(n)]);
  if (n < 65536n) return Uint8Array.from([0x19, Number(n >> 8n), Number(n & 0xffn)]);
  if (n < 4294967296n) {
    return Uint8Array.from([0x1a, Number((n >> 24n) & 0xffn), Number((n >> 16n) & 0xffn), Number((n >> 8n) & 0xffn), Number(n & 0xffn)]);
  }
  const bytes = new Uint8Array(9);
  bytes[0] = 0x1b;
  for (let i = 0; i < 8; i++) bytes[8 - i] = Number((n >> BigInt(8 * i)) & 0xffn);
  return bytes;
};

/** Canonical (definite-length) CBOR map header for up to 255 entries - `AssetValue`'s levels never exceed this. */
const cborDefiniteMapHeader = (length: number): Uint8Array => {
  if (length < 24) return Uint8Array.from([0xa0 + length]);
  if (length < 256) return Uint8Array.from([0xb8, length]);
  throw new Error("cborDefiniteMapHeader: too many entries");
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));

/**
 * `AssetValue = Pairs<ByteArray, Pairs<ByteArray, Int>>` re-encoded byte-for-byte as Aiken's
 * `cbor.serialise` produces it. `Pairs<k, v>` is a native Plutus Data `Map`, and - unlike Data
 * `Constr`/`List` values, which Aiken always serialises with **indefinite**-length CBOR arrays
 * (`9f...ff`, confirmed via the stdlib's own `serialise_4`/`serialise_7` test vectors) - Aiken
 * serialises `Map`s with **definite**-length CBOR (`a1...`, confirmed via `serialise_9`:
 * `serialise([Pair(1, #"ff")]) == #"a10141ff"`). `@harmoniclabs/plutus-data`'s `dataToCbor`
 * emits **indefinite**-length maps for any non-empty `DataMap` (`bf...ff`), so it cannot be used
 * here: reusing it silently produced a digest the validator can never reproduce for a non-empty
 * `AssetValue`, so every WithdrawDisputed settlement with a real (non-zero) payout was rejected
 * on-chain despite every off-chain signature/verification step agreeing with itself. Confirmed
 * against the real deployed validator via `aiken check` on the pinned commit
 * (`d74b2c319228bcbef36632de37875c388dcee7ce`): `cbor.serialise([Pair(#"", 1500000)])` is
 * `a1401a0016e360`, never `bf401a0016e360ff`.
 */
const assetValueToCanonicalCbor = (entries: AssetValueEntry[]): Uint8Array => {
  const parts: Uint8Array[] = [cborDefiniteMapHeader(entries.length)];
  for (const entry of entries) {
    parts.push(cborByteString(Buffer.from(entry.policyId, "hex")));
    const inner: Uint8Array[] = [cborDefiniteMapHeader(entry.assets.length)];
    for (const asset of entry.assets) {
      inner.push(cborByteString(Buffer.from(asset.assetName, "hex")));
      inner.push(cborUint(asset.quantity));
    }
    parts.push(concatBytes(inner));
  }
  return concatBytes(parts);
};

/**
 * Computes the digest admins sign for `WithdrawDisputed`:
 * `blake2b_224(cbor.serialise(DisputeWithdrawal{own_ref, buyer_value, seller_value}))`. The
 * `DisputeWithdrawal` record is a single-constructor Aiken type, so it Plutus-Data-encodes as
 * `Constr(0, [own_ref, buyer_value, seller_value])` - `d879 9f <own_ref> <buyer_value>
 * <seller_value> ff` (tag 121 + indefinite array, matching `dataToCbor`'s `Constr` encoding,
 * which - unlike its `Map` encoding - was verified correct). `own_ref` uses `dataToCbor` (a
 * plain `Constr`); `buyer_value`/`seller_value` use `assetValueToCanonicalCbor` (see its doc
 * comment for why `dataToCbor` cannot be used for these two fields).
 */
export const computeDisputeWithdrawalDigest = async (
  ownRef: { txHash: string; outputIndex: number },
  buyerValue: AssetValueEntry[],
  sellerValue: AssetValueEntry[],
): Promise<string> => {
  await Crypto.ready();
  const ownRefData = new DataConstr(0, [new DataB(Buffer.from(ownRef.txHash, "hex")), new DataI(BigInt(ownRef.outputIndex))]);
  const ownRefCbor = Buffer.from(dataToCbor(ownRefData).toString(), "hex");
  const disputeWithdrawalCbor = Buffer.concat([
    Buffer.from("d8799f", "hex"),
    ownRefCbor,
    Buffer.from(assetValueToCanonicalCbor(buyerValue)),
    Buffer.from(assetValueToCanonicalCbor(sellerValue)),
    Buffer.from("ff", "hex"),
  ]);
  return blake2b.hash(HexBlob(disputeWithdrawalCbor.toString("hex")), 28);
};
