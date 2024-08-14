import { hash28 } from "./utils";

import { EDDSA } from "./ed25519e";

const eddsa = new EDDSA();

export default class PublicKey {
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
