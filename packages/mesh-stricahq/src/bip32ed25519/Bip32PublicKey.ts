/* eslint-disable no-bitwise */
import { Buffer } from "buffer";
import BN from "bn.js";
import PublicKey from "./PublicKey";
import { hmac512, HARDENED_OFFSET } from "./utils";

import { EDDSA } from "./ed25519e";

const eddsa = new EDDSA();

export default class Bip32PublicKey {
  protected xpub: Buffer;

  constructor(xpub: Buffer) {
    this.xpub = xpub;
  }

  derive(index: number) {
    const pk = this.xpub.slice(0, 32);
    const cc = this.xpub.slice(32, 64);

    const data = Buffer.allocUnsafe(1 + 32 + 4);
    data.writeUInt32LE(index, 1 + 32);

    let z;
    let i;
    if (index < HARDENED_OFFSET) {
      pk.copy(data, 1);
      data[0] = 0x02;
      z = hmac512(cc, data);
      data[0] = 0x03;
      i = hmac512(cc, data);
    } else {
      throw new Error("can not derive hardened public key");
    }

    const chainCode = i.slice(32, 64);
    const zl = z.slice(0, 32);

    const left = new BN(zl.slice(0, 28), 16, "le").mul(new BN(8));

    const p = eddsa.g.mul(left);
    const pp = eddsa.decodePoint(pk.toString("hex"));
    const point = pp.add(p);

    return new Bip32PublicKey(
      Buffer.concat([Buffer.from(eddsa.encodePoint(point)), chainCode])
    );
  }

  toPublicKey(): PublicKey {
    const key = eddsa.keyFromPublic(this.xpub.slice(0, 32));
    return new PublicKey(Buffer.from(key.pubBytes()));
  }

  toBytes(): Buffer {
    return this.xpub;
  }

  static fromBytes(xpub: Buffer): Bip32PublicKey {
    return new Bip32PublicKey(xpub);
  }
}
