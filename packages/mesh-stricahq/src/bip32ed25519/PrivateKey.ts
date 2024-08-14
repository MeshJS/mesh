import { Buffer } from "buffer";
import { sha512 } from "./utils";
import PublicKey from "./PublicKey";

import { EDDSA } from "./ed25519e";

const eddsa = new EDDSA();

export default class PrivateKey {
  private privKey: Buffer;

  constructor(privKey: Buffer) {
    this.privKey = privKey;
  }

  static fromSecretKey(secretKey: Buffer): PrivateKey {
    let extendedSecret = sha512(secretKey);
    extendedSecret[0]! &= 0b1111_1000;
    extendedSecret[31]! &= 0b0011_1111;
    extendedSecret[31]! |= 0b0100_0000;
    return new PrivateKey(extendedSecret);
  }

  toBytes(): Buffer {
    return this.privKey;
  }

  toPublicKey(): PublicKey {
    const keyPair = eddsa.keyFromSecret(this.privKey);
    return new PublicKey(Buffer.from(keyPair.pubBytes()));
  }

  sign(data: Buffer): Buffer {
    const keyPair = eddsa.keyFromSecret(this.privKey);
    const signature = keyPair.sign(data.toString("hex"));
    return Buffer.from(signature.toBytes());
  }

  verify(signature: Buffer, message: Buffer) {
    const keyPair = eddsa.keyFromSecret(this.privKey);
    return keyPair.verify(message.toString("hex"), signature.toString("hex"));
  }
}
