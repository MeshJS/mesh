import { setInConwayEra } from "@cardano-sdk/core";
import {
  Bip32PrivateKey,
  Bip32PrivateKeyHex,
  ready,
} from "@cardano-sdk/crypto";
import * as BaseEncoding from "@scure/base";
import { mnemonicToEntropy } from "bip39";

import {
  DerivationPath,
  derivationPathVectorFromString,
  ISecretManager,
} from "../interfaces/secret-manager";
import { ISigner } from "../interfaces/signer";
import { BaseSigner } from "../signer/base-signer";

export class InMemoryBip32 implements ISecretManager {
  private bip32PrivateKey: Bip32PrivateKey;

  private constructor(privateKey: Bip32PrivateKey) {
    setInConwayEra(true);
    this.bip32PrivateKey = privateKey;
  }

  static async fromMnemonic(
    mnemonic: string[],
    password?: string,
  ): Promise<InMemoryBip32> {
    await ready();
    const entropy = mnemonicToEntropy(mnemonic.join(" "));
    const bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
      Buffer.from(entropy, "hex"),
      password || "",
    );
    return new InMemoryBip32(bip32PrivateKey);
  }

  static async fromEntropy(
    entropy: string,
    password?: string,
  ): Promise<InMemoryBip32> {
    await ready();
    const bip32PrivateKey = Bip32PrivateKey.fromBip39Entropy(
      Buffer.from(entropy, "hex"),
      password || "",
    );
    return new InMemoryBip32(bip32PrivateKey);
  }

  static fromKeyHex(keyHex: string): InMemoryBip32 {
    const bip32PrivateKey = Bip32PrivateKey.fromHex(
      keyHex as Bip32PrivateKeyHex,
    );
    return new InMemoryBip32(bip32PrivateKey);
  }

  static fromBech32(bech32: string): InMemoryBip32 {
    const bech32DecodedBytes = BaseEncoding.bech32.decodeToBytes(bech32).bytes;
    const bip32PrivateKey = Bip32PrivateKey.fromBytes(bech32DecodedBytes);
    return new InMemoryBip32(bip32PrivateKey);
  }

  /**
   * Get the Bip32 public key in hex format.
   * @returns {Promise<string>} A promise that resolves to the public key in hex format.
   */
  async getPublicKey(): Promise<string> {
    await ready();
    return this.bip32PrivateKey.toPublic().hex();
  }

  /**
   * Get an ISigner instance initialized with the current Bip32 private key.
   * @returns {Promise<ISigner>} A promise that resolves to an ISigner instance initialized with the current Bip32 private key.
   */
  async getSigner(derivationPath: DerivationPath): Promise<ISigner> {
    const path = Array.isArray(derivationPath)
      ? derivationPath
      : derivationPathVectorFromString(derivationPath);
    const bip32PrivateKey = this.bip32PrivateKey.derive(path);
    return BaseSigner.fromExtendedKeyHex(bip32PrivateKey.toRawKey().hex());
  }
}
