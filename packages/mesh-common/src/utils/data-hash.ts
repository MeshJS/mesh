import { blake2b } from "blakejs";

import { toBytes } from "../data";
import { LanguageVersion } from "../types";

export const hashDrepAnchor = (jsonLD: object): string => {
  const jsonHash = blake2b(JSON.stringify(jsonLD, null, 2), undefined, 32);
  return Buffer.from(jsonHash).toString("hex");
};

/**
 * Language tag bytes prepended to the script bytes when hashing a Plutus
 * script, as defined by the Cardano ledger (CIP-0057 / plutus script hash):
 * script_hash = blake2b_224(tag || script_bytes).
 */
export const PLUTUS_LANGUAGE_TAGS: Record<LanguageVersion, number> = {
  V1: 0x01,
  V2: 0x02,
  V3: 0x03,
};

/**
 * Hash a Plutus script from its CBOR hex (the form produced by Aiken
 * blueprints and stored in `PlutusScript.code`).
 *
 * The ledger hashes the serialised script bytes exactly as they appear in
 * the CBOR byte string — the bytes must NOT be unwrapped/decoded first.
 * Hashing the unwrapped UPLC bytes instead produces a different hash, which
 * derives wrong script addresses and policy ids (see MeshJS/mesh#763).
 *
 * @param scriptCbor The script CBOR hex (e.g. a blueprint's `compiledCode`)
 * @param version The Plutus language version of the script
 * @returns The 56-character hex script hash
 */
export const hashPlutusScript = (
  scriptCbor: string,
  version: LanguageVersion,
): string => {
  const tag = PLUTUS_LANGUAGE_TAGS[version];
  if (tag === undefined) {
    throw new Error(`Invalid Plutus script version: ${version}`);
  }
  const scriptBytes = toBytes(scriptCbor);
  const preimage = new Uint8Array(scriptBytes.length + 1);
  preimage[0] = tag;
  preimage.set(scriptBytes, 1);
  const hash = blake2b(preimage, undefined, 28);
  return Buffer.from(hash).toString("hex");
};
