import { Bip32PrivateKey, Bip32PrivateKeyHex } from "@cardano-sdk/crypto";
import { mnemonicToEntropy } from "bip39";

import { IBip32 } from "../interfaces/bip32";
import { ISigner } from "../interfaces/signer";
import { CardanoSigner } from "../signer/cardano-signer";

type CardanoBip32Constructor =
  | {
      type: "mnemonic";
      mnemonic: string[];
      password?: string;
    }
  | { type: "entropy"; entropy: string; password?: string }
  | { type: "keyHex"; keyHex: string };

class CardanoBip32 implements IBip32 {
  private bip32PrivateKey: Bip32PrivateKey;

  // Bip32 can be initialized with either a mnemonic array or a keyHex string
  constructor(constructorParams: CardanoBip32Constructor) {
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
    this.bip32PrivateKey = this.bip32PrivateKey.derive(path);
    return this;
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
    return new CardanoSigner({
      type: "extendedKeyHex",
      ed25519PrivateKeyHex: this.bip32PrivateKey.toRawKey().hex(),
    });
  }
}
export default CardanoBip32;
