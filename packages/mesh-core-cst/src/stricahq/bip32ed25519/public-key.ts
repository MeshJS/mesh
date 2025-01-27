
import { EDDSA } from "./ed25519e/eddsa";
import { hash28 } from "./utils";

const eddsa = new EDDSA();

class PublicKey {
  pubKey: Buffer;

  constructor(pubKey: Buffer) {
    this.pubKey = pubKey;
  }

  toBytes(): Buffer {
    return this.pubKey;
  }

  hash(): Buffer {
    return hash28(this.pubKey);
  }

  verify(signature: Buffer, data: Buffer) {
    const keyPair = eddsa.keyFromPublic(this.pubKey.toString("hex"));
    return keyPair.verify(data.toString("hex"), signature.toString("hex"));
  }
}

export { PublicKey };
