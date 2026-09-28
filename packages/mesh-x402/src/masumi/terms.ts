/**
 * Masumi commitment/terms digest computation and deadline-gap validation.
 *
 * Digest logic ported from `x402-foundation/x402`'s reference implementation
 * (`typescript/packages/mechanisms/cardano/src/exact/masumi/digests.ts`, Apache-2.0) so the
 * two implementations produce byte-identical digests for the same inputs.
 */
import { sha256 } from "@noble/hashes/sha2.js";

import {
  InputCommitment,
  MasumiTerms,
  PaymentRequirements,
  PaymentRequirementsExtraMasumi,
} from "../types/payment-requirements";
import { masumiDeadlineIntervalsHold } from "./constants";
import { jcs } from "./jcs";

const INPUT_HASH_DOMAIN = "masumi:x402:input:v1\n";
const TERMS_DIGEST_DOMAIN = "masumi:x402:terms:v1\n";

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** `SHA-256(UTF-8(domain) || UTF-8(JCS(value)))` as lowercase hex - the shape both Masumi digests share. */
const domainDigest = (domain: string, value: unknown): string => {
  const body = encoder.encode(jcs(value));
  const prefix = encoder.encode(domain);
  const buffer = new Uint8Array(prefix.length + body.length);
  buffer.set(prefix, 0);
  buffer.set(body, prefix.length);
  return toHex(sha256(buffer));
};

const base64UrlDecode = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("Commitment raw content is not unpadded base64url");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(base64, "base64");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Commitment raw content is not canonical unpadded base64url");
  }
  return Uint8Array.from(decoded);
};

/** Serializes one commitment part to the bytes its `digest` covers. */
export const commitmentPartBytes = (part: {
  canonicalization: "jcs" | "raw";
  content?: unknown;
}): Uint8Array => {
  if (part.content === undefined) {
    throw new Error("Commitment part carries no content to digest");
  }
  if (part.canonicalization === "raw") {
    if (typeof part.content !== "string") {
      throw new Error("Commitment raw content must be an unpadded base64url string");
    }
    return base64UrlDecode(part.content);
  }
  return encoder.encode(jcs(part.content));
};

/** Lowercase hex SHA-256 of a commitment part's bytes. */
export const commitmentPartDigest = (part: {
  canonicalization: "jcs" | "raw";
  content?: unknown;
}): string => toHex(sha256(commitmentPartBytes(part)));

/**
 * Recomputes `inputCommitment.digest` from the commitment's manifest - the commitment with
 * every part's `content` and the top-level `digest` omitted. Because the manifest excludes
 * `content` by construction, a part whose content the issuer left off the wire does not
 * change the result.
 */
export const computeInputHash = (commitment: InputCommitment): string => {
  const manifest = {
    version: commitment.version,
    algorithm: commitment.algorithm,
    parts: commitment.parts.map((part) => ({
      name: part.name,
      canonicalization: part.canonicalization,
      mediaType: part.mediaType,
      digest: part.digest,
    })),
  };
  return domainDigest(INPUT_HASH_DOMAIN, manifest);
};

/**
 * The seller-signed terms object: `terms` plus the seven fields projected from the
 * top-level `PaymentRequirements`. This member list is normative for this scheme version -
 * `termsDigest` is only reproducible when both sides agree on it exactly.
 */
export type MasumiSignedTerms = MasumiTerms & {
  scheme: string;
  assetTransferMethod: string;
  network: string;
  contractAddress: string;
  amount: string;
  asset: string;
  maxTimeoutSeconds: number;
};

/** Reconstructs `signedTerms` from the terms and the requirements they were issued against. */
export const buildSignedTerms = (
  extra: PaymentRequirementsExtraMasumi,
  requirements: PaymentRequirements,
): MasumiSignedTerms => {
  if (!extra.terms) throw new Error("Masumi payment requirements are missing `extra.terms`");
  return {
    ...extra.terms,
    scheme: requirements.scheme,
    assetTransferMethod: extra.assetTransferMethod,
    network: requirements.network,
    contractAddress: requirements.payTo,
    amount: requirements.amount,
    asset: requirements.asset,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
  };
};

/** Computes the `termsDigest` the seller authorizes with `signData`. */
export const computeTermsDigest = (signedTerms: MasumiSignedTerms): string =>
  domainDigest(TERMS_DIGEST_DOMAIN, signedTerms);

/**
 * Validates the four deadlines are strictly ordered with their minimum required gaps. See
 * `masumiDeadlineIntervalsHold` in `./constants` for the gap values.
 */
export const checkDeadlineOrdering = (terms: MasumiTerms): boolean =>
  masumiDeadlineIntervalsHold(
    BigInt(terms.payByTime),
    BigInt(terms.submitResultTime),
    BigInt(terms.unlockTime),
    BigInt(terms.externalDisputeUnlockTime),
  );
