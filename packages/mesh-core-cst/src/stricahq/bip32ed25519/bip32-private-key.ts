/* eslint-disable no-bitwise */

import { Buffer } from "buffer";
import BN from "bn.js";
import { pbkdf2 } from "pbkdf2";

import { Bip32PublicKey } from "./bip32-public-key";
import { EDDSA } from "./ed25519e/eddsa";
import { PrivateKey } from "./private-key";
import { HARDENED_OFFSET, hmac512 } from "./utils";

const eddsa = new EDDSA();

class Bip32PrivateKey {
  protected xprv: Buffer;

  constructor(xprv: Buffer) {
    this.xprv = xprv;
  }

  static fromEntropy(entropy: Buffer): Promise<Bip32PrivateKey> {
    return new Promise((resolve, reject) => {
      pbkdf2("", entropy, 4096, 96, "sha512", (err, xprv) => {
        if (err) {
          reject(err);
        }
        // The lowest three bits of the first octet are cleared
        // 248 or 0xf8 or 0b11111000
        xprv[0]! &= 0b11111000;
        // the highest bit of the last octet is cleared
        // 31 or 0x1f or 0b00011111
        // AND the third highest bit is cleared too
        xprv[31]! &= 0b00011111;
        // and the second highest bit of the last octet is set
        // 64 or 0x40 or 0b01000000
        xprv[31]! |= 0b01000000;
        resolve(new Bip32PrivateKey(xprv));
      });
    });
  }

  derive(index: number) {
    const kl = this.xprv.subarray(0, 32);
    const kr = this.xprv.subarray(32, 64);
    const cc = this.xprv.subarray(64, 96);

    let z;
    let i;
    if (index < HARDENED_OFFSET) {
      const data = Buffer.allocUnsafe(1 + 32 + 4);
      data.writeUInt32LE(index, 1 + 32);

      const keyPair = eddsa.keyFromSecret(kl.toString("hex"));
      const vk = Buffer.from(keyPair.pubBytes());
      vk.copy(data, 1);

      data[0] = 0x02;
      z = hmac512(cc, data);
      data[0] = 0x03;
      i = hmac512(cc, data);
    } else {
      const data = Buffer.allocUnsafe(1 + 64 + 4);
      data.writeUInt32LE(index, 1 + 64);
      kl.copy(data, 1);
      kr.copy(data, 1 + 32);

      data[0] = 0x00;
      z = hmac512(cc, data);
      data[0] = 0x01;
      i = hmac512(cc, data);
    }

    const chainCode = i.slice(32, 64);
    const zl = z.slice(0, 32);
    const zr = z.slice(32, 64);

    const left = new BN(kl, 16, "le")
      .add(new BN(zl.slice(0, 28), 16, "le").mul(new BN(8)))
      .toArrayLike(Buffer, "le", 32);
    let right = new BN(kr, 16, "le")
      .add(new BN(zr, 16, "le"))
      .toArrayLike(Buffer, "le")
      .slice(0, 32);

    if (right.length !== 32) {
      right = Buffer.from(right.toString("hex").padEnd(32, "0"), "hex");
    }

    const xprv = Buffer.concat([left, right, chainCode]);
    return new Bip32PrivateKey(xprv);
  }

  deriveHardened(index: number) {
    return this.derive(index + HARDENED_OFFSET);
  }

  derivePath(path: string) {
    const splitPath = path.split("/");
    // @ts-ignore
    return splitPath.reduce((hdkey, indexStr, i) => {
      if (i === 0 && indexStr === "m") {
        return hdkey;
      }
      if (indexStr.slice(-1) === `'`) {
        const index = parseInt(indexStr.slice(0, -1), 10);
        return hdkey.deriveHardened(index);
      }
      const index = parseInt(indexStr, 10);
      return hdkey.derive(index);
    }, this);
  }

  toBip32PublicKey() {
    const keyPair = eddsa.keyFromSecret(this.xprv.slice(0, 32).toString("hex"));
    const vk = Buffer.from(keyPair.pubBytes());
    return new Bip32PublicKey(Buffer.concat([vk, this.xprv.slice(64, 96)]));
  }

  toBytes(): Buffer {
    return this.xprv;
  }

  toPrivateKey(): PrivateKey {
    const keyPair = eddsa.keyFromSecret(this.xprv.slice(0, 64));
    return new PrivateKey(Buffer.from(keyPair.privBytes()));
  }
}

export { Bip32PrivateKey };
