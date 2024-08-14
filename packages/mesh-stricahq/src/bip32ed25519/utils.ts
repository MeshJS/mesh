import { Buffer } from "buffer";
import { blake2b } from "blakejs";
import * as hashJs from "hash.js";

export const hash28 = function (data: Buffer): Buffer {
  const hash = blake2b(data, undefined, 28);
  return Buffer.from(hash);
};

export const hmac512 = function (key: Buffer, data: Buffer): Buffer {
  const digest = hashJs
    .hmac(hashJs.sha512 as any, key)
    .update(data)
    .digest();
  return Buffer.from(digest);
};

export const sha512 = function (data: Buffer): Buffer {
  const digest = hashJs.sha512().update(data).digest();
  return Buffer.from(digest);
};

export const HARDENED_OFFSET = 0x80000000;
