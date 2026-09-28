/**
 * Verification of the seller's CIP-8 authorization over `termsDigest`.
 *
 * The seller calls `wallet.signData(termsDigestHex)`; `extra.referenceKey` carries the
 * complete CBOR `COSE_Key` and `extra.referenceSignature` the complete CBOR `COSE_Sign1`.
 * Wraps `@meshsdk/core-cst`'s `checkSignature` (Ed25519 signature verification, bound to the
 * seller address's payment-key credential via `Blake2b-224(publicKey)`), plus an explicit
 * check of the COSE unprotected `hashed` header.
 *
 * `checkSignature` alone accepts either a raw or a blake2b-hashed payload match, which is
 * looser than the spec: it requires the COSE `hashed` header to be exactly `false` (payload =
 * `termsDigest` itself, not its hash) to rule out a signature-substitution edge case - a
 * signature legitimately produced elsewhere in "hashed" mode over the same 28-byte value
 * would otherwise verify here too. `@meshsdk/core-cst` doesn't expose the parsed header, so
 * it's decoded directly here from the raw COSE_Sign1 CBOR.
 */
import { Cbor, CborArray, CborMap, CborSimple, CborText } from "@harmoniclabs/cbor";
import { checkSignature, signData, type Signer } from "@meshsdk/core-cst";
import { DataSignature } from "@meshsdk/common";

/**
 * Produces a seller's `{referenceKey, referenceSignature}` over a `termsDigest`. This is a
 * resource-server/seller concern (the signature is issued into `PaymentRequirements.extra`
 * before the 402 challenge is sent) - exported as a convenience for Mesh-based resource
 * servers, not called by this package's own client/facilitator flows.
 */
export const signTermsDigest = (termsDigestHex: string, signer: Signer): DataSignature =>
  signData(termsDigestHex, signer);

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
  const hashedEntry = unprotected.map.find((e) => e.k instanceof CborText && e.k.text === "hashed");
  if (!hashedEntry) return false;
  return hashedEntry.v instanceof CborSimple && hashedEntry.v.simple === true;
};

/** Verifies the seller's COSE authorization over `termsDigest`, bound to `sellerAddress`. */
export const verifySellerTermsSignature = async (
  referenceKeyHex: string,
  referenceSignatureHex: string,
  sellerAddressBech32: string,
  termsDigestHex: string,
): Promise<boolean> => {
  try {
    if (isHashedPayload(referenceSignatureHex)) return false;
    return await checkSignature(
      termsDigestHex,
      { key: referenceKeyHex, signature: referenceSignatureHex },
      sellerAddressBech32,
    );
  } catch {
    return false;
  }
};
