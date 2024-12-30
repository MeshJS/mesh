/* eslint-disable no-bitwise */
import { Buffer } from "buffer";
import BN from "bn.js";

import { EDDSA } from "./ed25519e/eddsa";
import { PublicKey } from "./public-key";
import { HARDENED_OFFSET, hmac512 } from "./utils";

const eddsa = new EDDSA();

class Bip32PublicKey {
  protected xpub: Buffer;

  constructor(xpub: Buffer) {
    this.xpub = xpub;
  }

  derive(index: number) {
    const pk = this.xpub.subarray(0, 32);
    const cc = this.xpub.subarray(32, 64);

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

    const chainCode = i.subarray(32, 64);
    const zl = z.subarray(0, 32);

    const left = new BN(zl.subarray(0, 28), 16, "le").mul(new BN(8));

    const p = eddsa.g.mul(left);
    const pp = eddsa.decodePoint(pk.toString("hex"));
    const point = pp.add(p);

    return new Bip32PublicKey(
      Buffer.concat([Buffer.from(eddsa.encodePoint(point)), chainCode]),
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

export { Bip32PublicKey };