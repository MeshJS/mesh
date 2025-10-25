import { setInConwayEra } from "@cardano-sdk/core";
import {
  Ed25519PrivateExtendedKeyHex,
  Ed25519PrivateKey,
  Ed25519PrivateNormalKeyHex,
  Ed25519Signature,
  Ed25519SignatureHex,
} from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { ISigner } from "../interfaces/signer";

/**
 * BaseSigner provides functionalities to sign and verify data using Ed25519 keys.
 * It supports construction from both extended and normal private key hex formats.
 */

export class BaseSigner implements ISigner {
  private ed25519PrivateKey: Ed25519PrivateKey;

  private constructor(ed25519PrivateKey: Ed25519PrivateKey) {
    setInConwayEra(true);
    this.ed25519PrivateKey = ed25519PrivateKey;
  }

  /**
   * Create a BaseSigner instance from an Ed25519 private key in extended hex format.
   * @param keyHex Ed25519 private key in extended hex format
   * @returns {BaseSigner} A BaseSigner instance
   */
  static fromExtendedKeyHex(keyHex: string): BaseSigner {
    return new BaseSigner(
      Ed25519PrivateKey.fromExtendedHex(Ed25519PrivateExtendedKeyHex(keyHex)),
    );
  }

  /**
   * Create a BaseSigner instance from an Ed25519 private key in normal hex format.
   * @param keyHex Ed25519 private key in normal hex format
   * @returns {BaseSigner} A BaseSigner instance
   */
  static fromNormalKeyHex(keyHex: string): BaseSigner {
    return new BaseSigner(
      Ed25519PrivateKey.fromNormalHex(Ed25519PrivateNormalKeyHex(keyHex)),
    );
  }

  static fromKeyHex(keyHex: string): BaseSigner {
    // Extended key is 64 bytes (128 hex chars), normal key is 32 bytes (64 hex chars)
    const hexLength = keyHex.length;

    if (hexLength === 128) {
      return this.fromExtendedKeyHex(keyHex);
    } else if (hexLength === 64) {
      return this.fromNormalKeyHex(keyHex);
    } else {
      throw new Error(
        `Invalid key length: ${hexLength}. Expected 64 (normal key) or 128 (extended key) hex characters.`,
      );
    }
  }

  /**
   * Get the Ed25519 public key in hex format.
   * @returns {Promise<string>} A promise that resolves to the public key in hex format.
   */
  async getPublicKey(): Promise<string> {
    return this.ed25519PrivateKey.toPublic().hex();
  }

  /**
   * Get the Ed25519 public key hash in hex format.
   * @returns {Promise<string>} A promise that resolves to the public key hash in hex format.
   */
  async getPublicKeyHash(): Promise<string> {
    return this.ed25519PrivateKey.toPublic().hash().hex();
  }

  /**
   * Sign data using the Ed25519 private key.
   * @param data data to be signed in hex format
   * @returns {Promise<string>} A promise that resolves to the signature in hex format.
   */
  async sign(data: string): Promise<string> {
    return this.ed25519PrivateKey.sign(HexBlob(data)).hex();
  }

  /**
   * Verify a signature using the Ed25519 public key.
   * @param data The original data in hex format.
   * @param signature The signature to verify in hex format.
   * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise.
   */
  async verify(data: string, signature: string): Promise<boolean> {
    return this.ed25519PrivateKey
      .toPublic()
      .verify(
        Ed25519Signature.fromHex(Ed25519SignatureHex(signature)),
        HexBlob(data),
      );
  }
}
