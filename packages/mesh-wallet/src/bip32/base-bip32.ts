import { Bip32PrivateKey, Bip32PrivateKeyHex } from "@cardano-sdk/crypto";
import * as BaseEncoding from "@scure/base";
import { mnemonicToEntropy } from "bip39";

import { IBip32 } from "../interfaces/bip32";
import { ISigner } from "../interfaces/signer";
import { BaseSigner } from "../signer/base-signer";

export class BaseBip32 implements IBip32 {
  private bip32PrivateKey: Bip32PrivateKey;

  private constructor(privateKey: Bip32PrivateKey) {
    this.bip32PrivateKey = privateKey;
  }

  static fromMnemonic(mnemonic: string[], password?: string): BaseBip32 {
    const entropy = mnemonicToEntropy(mnemonic.join(" "));
    const bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
      Buffer.from(entropy, "hex"),
      password || "",
    );
    return new BaseBip32(bip32PrivateKey);
  }

  static fromEntropy(entropy: string, password?: string): BaseBip32 {
    const bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
      Buffer.from(entropy, "hex"),
      password || "",
    );
    return new BaseBip32(bip32PrivateKey);
  }

  static fromKeyHex(keyHex: string): BaseBip32 {
    const bip32PrivateKey = Bip32PrivateKey.fromHex(
      keyHex as Bip32PrivateKeyHex,
    );
    return new BaseBip32(bip32PrivateKey);
  }

  static fromBech32(bech32: string): BaseBip32 {
    const bech32DecodedBytes = BaseEncoding.bech32.decodeToBytes(bech32).bytes;
    const bip32PrivateKey = Bip32PrivateKey.fromBytes(bech32DecodedBytes);
    return new BaseBip32(bip32PrivateKey);
  }

  /**
   * Derive a new IBip32 instance using the specified derivation path.
   * @param path The derivation path as an array of numbers.
   * @returns {IBip32} A new IBip32 instance derived from the current key using the specified path.
   */
  derive(path: number[]): IBip32 {
    return new BaseBip32(this.bip32PrivateKey.derive(path));
  }

  /**
   * Get the Bip32 public key in hex format.
   * @returns {string} The public key in hex format.
   */
  getPublicKey(): string {
    return this.bip32PrivateKey.toPublic().hex();
  }

  /**
   * Get an ISigner instance initialized with the current Bip32 private key.
   * @returns {ISigner} An ISigner instance initialized with the current Bip32 private key.
   */
  toSigner(): ISigner {
    return BaseSigner.fromExtendedKeyHex(this.bip32PrivateKey.toRawKey().hex());
  }
}
