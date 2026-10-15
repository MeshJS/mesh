/**
 * Verification of the seller's CIP-8 authorization over `termsDigest`.
 *
 * The seller calls `wallet.signData(termsDigestHex)`; `extra.referenceKey` carries the
 * complete CBOR `COSE_Key` and `extra.referenceSignature` the complete CBOR `COSE_Sign1`.
 * Decoded directly from the raw COSE objects rather than via `@meshsdk/core-cst`'s
 * `checkSignature`: that helper accepts a blake2b-hashed payload match (the spec requires
 * `hashed = false` and an attached payload equal to `termsDigest`), skips the `alg`/`crv`/
 * `kid`/address-header checks, and only handles base addresses - an enterprise-address seller
 * (a valid key-credential address per the spec) could never pass it.
 */
import {
  Cbor,
  CborArray,
  CborBytes,
  CborMap,
  CborNegInt,
  CborSimple,
  CborText,
  CborUInt,
} from "@harmoniclabs/cbor";

import type { Signer } from "@meshsdk/core-cst";
import { DataSignature } from "@meshsdk/common";
import { Address, Crypto, signData } from "@meshsdk/core-cst";

import { addressCredentials } from "./datum";

/**
 * Produces a seller's `{referenceKey, referenceSignature}` over a `termsDigest`. This is a
 * resource-server/seller concern (the signature is issued into `PaymentRequirements.extra`
 * before the 402 challenge is sent) - exported as a convenience for Mesh-based resource
 * servers, not called by this package's own client/facilitator flows.
 */
export const signTermsDigest = (
  termsDigestHex: string,
  signer: Signer,
): DataSignature => signData(termsDigestHex, signer);

/**
 * Reads the COSE_Sign1's unprotected `hashed` header. Absent defaults to `false`, matching
 * both the COSE convention and Mesh's own `signData` (which always signs raw, unhashed).
 */
const isHashedPayload = (referenceSignatureHex: string): boolean => {
  const decoded = Cbor.parse(referenceSignatureHex);
  if (!(decoded instanceof CborArray) || decoded.array.length !== 4) {
    throw new Error("Invalid COSE_Sign1 structure");
  }
  const unprotected = decoded.array[1];
  if (!(unprotected instanceof CborMap)) {
    throw new Error("Invalid COSE_Sign1 unprotected header");
  }
  const hashedEntry = unprotected.map.find(
    (e) => e.k instanceof CborText && e.k.text === "hashed",
  );
  if (!hashedEntry) return false;
  return hashedEntry.v instanceof CborSimple && hashedEntry.v.simple === true;
};

const cborInt = (value: unknown): bigint | null => {
  if (value instanceof CborUInt) return BigInt(value.num);
  if (value instanceof CborNegInt) return BigInt(value.num);
  return null;
};

const mapGet = (map: CborMap, label: bigint | string): unknown => {
  const entry = map.map.find((e) =>
    typeof label === "string"
      ? e.k instanceof CborText && e.k.text === label
      : cborInt(e.k) === label,
  );
  return entry?.v;
};

const bytesHex = (value: unknown): string | null =>
  value instanceof CborBytes ? Buffer.from(value.bytes).toString("hex") : null;

const COSE_ALG_EDDSA = -8n;

/**
 * Verifies the seller's COSE authorization over `termsDigest`, bound to `sellerAddress`.
 * Implements the full checklist of the spec ("Seller-signed terms"):
 *
 * - `COSE_Key`: `kty = OKP (1)`, `alg = EdDSA (-8)`, `crv = Ed25519 (6)`, a 32-byte public
 *   key and no private material (`d`);
 * - `COSE_Sign1`: protected `alg = EdDSA (-8)` and the raw `sellerAddress`, unprotected
 *   `hashed = false`, an attached payload equal to `termsDigest`, a valid Ed25519
 *   `Sig_structure` over an empty external AAD, and equal `kid` values when both are present;
 * - `Blake2b-224(publicKey)` equal to the seller's payment-key credential (a script
 *   credential is invalid). Works for base and enterprise key addresses alike.
 */
export const verifySellerTermsSignature = async (
  referenceKeyHex: string,
  referenceSignatureHex: string,
  sellerAddressBech32: string,
  termsDigestHex: string,
): Promise<boolean> => {
  try {
    if (isHashedPayload(referenceSignatureHex)) return false;

    // --- COSE_Key ---
    const key = Cbor.parse(referenceKeyHex);
    if (!(key instanceof CborMap)) return false;
    if (cborInt(mapGet(key, 1n)) !== 1n) return false; // kty = OKP
    const keyAlg = mapGet(key, 3n);
    if (keyAlg !== undefined && cborInt(keyAlg) !== COSE_ALG_EDDSA)
      return false;
    if (cborInt(mapGet(key, -1n)) !== 6n) return false; // crv = Ed25519
    if (mapGet(key, -4n) !== undefined) return false; // private material present
    const publicKeyHex = bytesHex(mapGet(key, -2n));
    if (!publicKeyHex || publicKeyHex.length !== 64) return false;
    const keyKid = bytesHex(mapGet(key, 2n));

    // --- COSE_Sign1 ---
    const sign1 = Cbor.parse(referenceSignatureHex);
    if (!(sign1 instanceof CborArray) || sign1.array.length !== 4) return false;
    const [protectedBytes, unprotected, payload, signature] = sign1.array;
    if (
      !(protectedBytes instanceof CborBytes) ||
      !(unprotected instanceof CborMap)
    )
      return false;
    if (!(payload instanceof CborBytes) || !(signature instanceof CborBytes))
      return false;
    if (signature.bytes.length !== 64) return false;

    const protectedMap = Cbor.parse(Buffer.from(protectedBytes.bytes));
    if (!(protectedMap instanceof CborMap)) return false;
    if (cborInt(mapGet(protectedMap, 1n)) !== COSE_ALG_EDDSA) return false;
    const rawAddress = Address.fromBech32(sellerAddressBech32)
      .toBytes()
      .toLowerCase();
    if (bytesHex(mapGet(protectedMap, "address")) !== rawAddress) return false;

    if (
      Buffer.from(payload.bytes).toString("hex") !==
      termsDigestHex.toLowerCase()
    )
      return false;

    const signKid =
      bytesHex(mapGet(protectedMap, 4n)) ?? bytesHex(mapGet(unprotected, 4n));
    if (keyKid && signKid && keyKid !== signKid) return false;

    // --- key bound to the address's payment-key credential ---
    const sellerCredentials = addressCredentials(sellerAddressBech32);
    if (sellerCredentials.payment.isScript) return false;
    const publicKey = Crypto.Ed25519PublicKey.fromHex(
      publicKeyHex as Crypto.Ed25519PublicKeyHex,
    );
    if (publicKey.hash().hex() !== sellerCredentials.payment.hash) return false;

    // --- Ed25519 over Sig_structure = ["Signature1", protected, h'', payload] ---
    const sigStructure = Cbor.encode(
      new CborArray([
        new CborText("Signature1"),
        new CborBytes(protectedBytes.bytes),
        new CborBytes(new Uint8Array()),
        new CborBytes(payload.bytes),
      ]),
    ).toBuffer();
    return publicKey.verify(
      Crypto.Ed25519Signature.fromHex(
        Buffer.from(signature.bytes).toString(
          "hex",
        ) as Crypto.Ed25519SignatureHex,
      ),
      Buffer.from(sigStructure).toString("hex") as never,
    );
  } catch {
    return false;
  }
};
