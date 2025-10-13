import {
  Ed25519PrivateExtendedKeyHex,
  Ed25519PrivateKey,
  Ed25519PrivateNormalKeyHex,
  Ed25519Signature,
  Ed25519SignatureHex,
} from "@cardano-sdk/crypto";
import { HexBlob } from "@cardano-sdk/util";

import { ISigner } from "../interfaces/signer";

export class BaseSigner implements ISigner {
  private ed25519PrivateKey: Ed25519PrivateKey;

  private constructor(ed25519PrivateKey: Ed25519PrivateKey) {
    this.ed25519PrivateKey = ed25519PrivateKey;
  }

  static fromExtendedKeyHex(keyHex: string): BaseSigner {
    return new BaseSigner(
      Ed25519PrivateKey.fromExtendedHex(Ed25519PrivateExtendedKeyHex(keyHex)),
    );
  }

  static fromNormalKeyHex(keyHex: string): BaseSigner {
    return new BaseSigner(
      Ed25519PrivateKey.fromNormalHex(Ed25519PrivateNormalKeyHex(keyHex)),
    );
  }

  /**
   * Get the Ed25519 public key in hex format.
   * @returns {string} The public key in hex format.
   */
  getPublicKey(): Promise<string> {
    return Promise.resolve(this.ed25519PrivateKey.toPublic().hex());
  }

  /**
   * Get the Ed25519 public key hash in hex format.
   * @returns {string} The public key hash in hex format.
   */
  getPublicKeyHash(): Promise<string> {
    return Promise.resolve(this.ed25519PrivateKey.toPublic().hash().hex());
  }

  /**
   * Sign data using the Ed25519 private key.
   * @param data data to be signed in hex format
   * @returns {string} The signature in hex format.
   */
  sign(data: string): Promise<string> {
    return Promise.resolve(this.ed25519PrivateKey.sign(HexBlob(data)).hex());
  }

  /**
   * Verify a signature using the Ed25519 public key.
   * @param data The original data in hex format.
   * @param signature The signature to verify in hex format.
   * @returns {boolean} True if the signature is valid, false otherwise.
   */
  verify(data: string, signature: string): Promise<boolean> {
    return Promise.resolve(
      this.ed25519PrivateKey
        .toPublic()
        .verify(
          Ed25519Signature.fromHex(Ed25519SignatureHex(signature)),
          HexBlob(data),
        ),
    );
  }
}
