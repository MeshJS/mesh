import { Bip32PrivateKey } from "@cardano-sdk/crypto";
import base32 from "base32-encoding";
import { mnemonicToEntropy } from "bip39";

import { IBip32 } from "../interfaces/bip32";

class CardanoBip32 implements IBip32 {
  private bip32PrivateKey: Bip32PrivateKey;

  constructor(mnemonic: string[], password?: string);
  constructor(keyHex: string, password?: string);

  // Actual implementation of the constructor
  constructor(mnemonicOrKeyHex: string[] | string, password: string = "") {
    if (Array.isArray(mnemonicOrKeyHex)) {
      // Handle mnemonic case
      const entropy = mnemonicToEntropy(mnemonicOrKeyHex.join(" "));
      this.bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
        Buffer.from(entropy, "hex"),
        password,
      );
    } else if (typeof mnemonicOrKeyHex === "string") {
      // Handle keyHex case
      this.bip32PrivateKey = Bip32PrivateKey.fromHex(mnemonicOrKeyHex);
    } else {
      throw new Error(
        "Invalid constructor arguments, expected mnemonic array or keyHex string.",
      );
    }
  }
  /**
   * Get the Bip32 public key in hex format.
   * @returns {string} The public key in hex format.
   */
  getPublicKey(): string {
    return this.bip32PrivateKey.toPublic().hex();
  }
  derive(path: number[]): IBip32 {
    throw new Error("Method not implemented.");
  }
  sign(data: string): string {
    throw new Error("Method not implemented.");
  }
  verify(data: string, signature: string): boolean {
    throw new Error("Method not implemented.");
  }
}
export default CardanoBip32;
