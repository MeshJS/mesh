import {
  Ed25519PrivateExtendedKeyHex,
  Ed25519PrivateKey,
  Ed25519PrivateNormalKeyHex,
  Ed25519Signature,
  Ed25519SignatureHex,
} from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { ISigner } from "../interfaces/signer";

type CardanoSignerConstructor =
  | {
      type: "extendedKeyHex";
      ed25519PrivateKeyHex: string;
    }
  | { type: "normalKeyHex"; ed25519PrivateKeyHex: string };

export class CardanoSigner implements ISigner {
  private ed25519PrivateKey: Ed25519PrivateKey;

  // Signer can be initialized with either an extendedKeyHex or a normalKeyHex
  constructor(constructorParams: CardanoSignerConstructor) {
    if (constructorParams.type === "extendedKeyHex") {
      const { ed25519PrivateKeyHex } = constructorParams;
      this.ed25519PrivateKey = Ed25519PrivateKey.fromExtendedHex(
        Ed25519PrivateExtendedKeyHex(ed25519PrivateKeyHex),
      );
    } else if (constructorParams.type === "normalKeyHex") {
      const { ed25519PrivateKeyHex } = constructorParams;
      this.ed25519PrivateKey = Ed25519PrivateKey.fromNormalHex(
        Ed25519PrivateNormalKeyHex(ed25519PrivateKeyHex),
      );
    } else {
      throw new Error("Invalid constructor parameters");
    }
  }

  /**
   * Get the Ed25519 public key in hex format.
   * @returns {string} The public key in hex format.
   */
  getPublicKey(): string {
    return this.ed25519PrivateKey.toPublic().hex();
  }

  /**
   * Sign data using the Ed25519 private key.
   * @param data data to be signed in hex format
   * @returns {string} The signature in hex format.
   */
  sign(data: string): string {
    return this.ed25519PrivateKey.sign(HexBlob(data)).hex();
  }

  /**
   * Verify a signature using the Ed25519 public key.
   * @param data The original data in hex format.
   * @param signature The signature to verify in hex format.
   * @returns {boolean} True if the signature is valid, false otherwise.
   */
  verify(data: string, signature: string): boolean {
    return this.ed25519PrivateKey
      .toPublic()
      .verify(
        Ed25519Signature.fromHex(Ed25519SignatureHex(signature)),
        HexBlob(data),
      );
  }
}
