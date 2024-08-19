import { bech32 } from "bech32";
import blake2b from "blake2b";

import { toBytes } from "../data";

export const resolveFingerprint = (policyId: string, assetName: string) => {
  return AssetFingerprint.fromParts(
    toBytes(policyId),
    toBytes(assetName),
  ).fingerprint();
};

const DATA = "asset";

export class AssetFingerprint {
  readonly hashBuf: Uint8Array;

  private constructor(hashBuf: Uint8Array) {
    this.hashBuf = hashBuf;
  }

  static fromHash(hash: Uint8Array): AssetFingerprint {
    return new AssetFingerprint(hash);
  }

  static fromParts(
    policyId: Uint8Array,
    assetName: Uint8Array,
  ): AssetFingerprint {
    // see https://github.com/cardano-foundation/CIPs/pull/64
    const hashBuf = blake2b(20)
      .update(new Uint8Array([...policyId, ...assetName]))
      .digest("binary");

    return AssetFingerprint.fromHash(hashBuf);
  }

  static fromBech32(fingerprint: string): AssetFingerprint {
    const { prefix, words } = bech32.decode(fingerprint);
    if (prefix !== DATA) {
      throw new Error("Invalid asset fingerprint");
    }

    const hashBuf = Buffer.from(bech32.fromWords(words));
    return AssetFingerprint.fromHash(hashBuf);
  }

  fingerprint(): string {
    const words = bech32.toWords(this.hashBuf);
    return bech32.encode(DATA, words);
  }

  hash(): string {
    return Buffer.from(this.hashBuf).toString("hex");
  }

  prefix(): string {
    return DATA;
  }

  // The last six characters of the data part form a checksum and contain no information
  checksum(): string {
    return this.fingerprint().slice(-6);
  }
}
