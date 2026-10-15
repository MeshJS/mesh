/**
 * The Masumi compatibility identifier (`extra.blockchainIdentifier`): an LZString-compressed
 * `sellerIdentifier.buyerNonce.referenceSignature.referenceKey.contractAddress` text that lets
 * Masumi tooling locate the payment. The issuer returns it; client and facilitator rebuild it
 * from the other fields and require an exact match (spec: "Identity and compatibility identifier").
 */
import LZString from "lz-string";

import { PaymentRequirementsExtraMasumi } from "../types/payment-requirements";

export const buildIdentifierText = (input: {
  sellerNonce: string;
  agentIdentifier?: string | null;
  buyerNonce: string;
  referenceSignature: string;
  referenceKey: string;
  contractAddress: string;
}): string =>
  [
    input.sellerNonce + (input.agentIdentifier ?? ""),
    input.buyerNonce,
    input.referenceSignature,
    input.referenceKey,
    input.contractAddress,
  ].join(".");

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

/** `hex(LZString.compressToUint8Array(identifierText))`. */
export const encodeBlockchainIdentifier = (identifierText: string): string =>
  toHex(LZString.compressToUint8Array(identifierText));

/** Inverse of `encodeBlockchainIdentifier`; returns `null` for anything that does not decompress. */
export const decodeBlockchainIdentifier = (
  identifierHex: string,
): string | null => {
  if (!/^([0-9a-f]{2})+$/.test(identifierHex)) return null;
  const text = LZString.decompressFromUint8Array(
    Uint8Array.from(Buffer.from(identifierHex, "hex")),
  );
  return typeof text === "string" && text.length > 0 ? text : null;
};

/** Rebuilds the identifier the issuer should have sent for these requirements. */
export const expectedBlockchainIdentifier = (
  extra: PaymentRequirementsExtraMasumi,
  contractAddress: string,
): string =>
  encodeBlockchainIdentifier(
    buildIdentifierText({
      sellerNonce: extra.terms!.sellerNonce,
      agentIdentifier: extra.terms!.agentIdentifier,
      buyerNonce: extra.terms!.buyerNonce,
      referenceSignature: extra.referenceSignature!,
      referenceKey: extra.referenceKey!,
      contractAddress,
    }),
  );
