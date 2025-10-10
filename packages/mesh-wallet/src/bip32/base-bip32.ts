import { Bip32PrivateKey, Bip32PrivateKeyHex } from "@cardano-sdk/crypto";
import * as BaseEncoding from "@scure/base";
import { mnemonicToEntropy } from "bip39";

import { IBip32 } from "../interfaces/bip32";
import { ISigner } from "../interfaces/signer";
import { BaseSigner } from "../signer/base-signer";

export type BaseBip32Constructor =
  | {
      type: "mnemonic";
      mnemonic: string[];
      password?: string;
    }
  | { type: "entropy"; entropy: string; password?: string }
  | { type: "keyHex"; keyHex: string }
  | { type: "bech32"; bech32: string };

export class BaseBip32 implements IBip32 {
  private bip32PrivateKey: Bip32PrivateKey;

  // Bip32 can be initialized with either a mnemonic array or a keyHex string
  constructor(constructorParams: BaseBip32Constructor) {
    if (constructorParams.type === "mnemonic") {
      const { mnemonic, password } = constructorParams;
      const entropy = mnemonicToEntropy(mnemonic.join(" "));
      this.bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
        Buffer.from(entropy, "hex"),
        password || "",
      );
    } else if (constructorParams.type === "entropy") {
      const { entropy, password } = constructorParams;
      this.bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
        Buffer.from(entropy, "hex"),
        password || "",
      );
    } else if (constructorParams.type === "keyHex") {
      const { keyHex } = constructorParams;
      this.bip32PrivateKey = Bip32PrivateKey.fromHex(
        keyHex as Bip32PrivateKeyHex,
      );
    } else if (constructorParams.type === "bech32") {
      const { bech32 } = constructorParams;
      const bech32DecodedBytes =
        BaseEncoding.bech32.decodeToBytes(bech32).bytes;
      this.bip32PrivateKey = Bip32PrivateKey.fromBytes(bech32DecodedBytes);
    } else {
      throw new Error("Invalid constructor parameters");
    }
  }

  /**
   * Derive a new IBip32 instance using the specified derivation path.
   * @param path The derivation path as an array of numbers.
   * @returns {IBip32} A new IBip32 instance derived from the current key using the specified path.
   */
  derive(path: number[]): IBip32 {
    return new BaseBip32({
      type: "keyHex",
      keyHex: this.bip32PrivateKey.derive(path).hex(),
    });
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
    return new BaseSigner({
      type: "extendedKeyHex",
      ed25519PrivateKeyHex: this.bip32PrivateKey.toRawKey().hex(),
    });
  }
}
