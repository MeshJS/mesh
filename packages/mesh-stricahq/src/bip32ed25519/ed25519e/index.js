/**
 * Copyright 2021 Ashish Prajapati
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * *** Includes code to override elliptic.js implementation for ed25519 ***
 *
 * LICENSE
 *
 * This software is licensed under the MIT License.
 *
 * Copyright Fedor Indutny, 2014.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

import hash from "hash.js";
import elliptic from "elliptic";

const utils = elliptic.utils;
const parseBytes = utils.parseBytes;
import { KeyPair } from "./key";
import { Signature } from "./signature";

export class EDDSA {
  constructor() {
    if (!(this instanceof EDDSA)) return new EDDSA();

    const curve = elliptic.curves.ed25519.curve;
    this.curve = curve;
    this.g = curve.g;
    this.g.precompute(curve.n.bitLength() + 1);

    this.pointClass = curve.point().constructor;
    this.encodingLength = Math.ceil(curve.n.bitLength() / 8);
    this.hash = hash.sha512;
  }
  /**
   * @param {Array|String} message - message bytes
   * @param {Array|String|KeyPair} secret - secret bytes or a keypair
   * @returns {Signature} - signature
   */
  signExtended(message, secret) {
    message = parseBytes(message);
    const key = this.keyFromSecret(secret);
    const r = this.hashInt(key.messagePrefix(), message);
    const R = this.g.mul(r);
    const Rencoded = this.encodePoint(R);
    const s_ = this.hashInt(Rencoded, key.pubBytes(), message).mul(key.kl());
    const S = r.add(s_).umod(this.curve.n);
    return this.makeSignature({ R, S, Rencoded });
  }
  /**
   * @param {Array} message - message bytes
   * @param {Array|String|Signature} sig - sig bytes
   * @param {Array|String|Point|KeyPair} pub - public key
   * @returns {Boolean} - true if public key matches sig of message
   */
  verify(message, sig, pub) {
    message = parseBytes(message);
    sig = this.makeSignature(sig);
    const key = this.keyFromPublic(pub);
    const h = this.hashInt(sig.Rencoded(), key.pubBytes(), message);
    const SG = this.g.mul(sig.S());
    const RplusAh = sig.R().add(key.pub().mul(h));
    return RplusAh.eq(SG);
  }
  hashInt() {
    const hash = this.hash();
    for (let i = 0; i < arguments.length; i++) hash.update(arguments[i]);
    return utils.intFromLE(hash.digest()).umod(this.curve.n);
  }
  keyFromPublic(pub) {
    return KeyPair.fromPublic(this, utils.parseBytes(pub));
  }
  keyFromSecret(secret) {
    return KeyPair.fromSecret(this, utils.parseBytes(secret));
  }
  makeSignature(sig) {
    if (typeof sig === "object") {
      if (sig instanceof Signature) return sig
    };
    return new Signature(this, sig);
  }
  /**
   * * https://tools.ietf.org/html/draft-josefsson-eddsa-ed25519-03#section-5.2
   *
   * EDDSA defines methods for encoding and decoding points and integers. These are
   * helper convenience methods, that pass along to utility functions implied
   * parameters.
   *
   */
  encodePoint(point) {
    const enc = point.getY().toArray("le", this.encodingLength);
    enc[this.encodingLength - 1] |= point.getX().isOdd() ? 0x80 : 0;
    return enc;
  }
  decodePoint(bytes) {
    bytes = utils.parseBytes(bytes);

    const lastIx = bytes.length - 1;
    const normed = bytes.slice(0, lastIx).concat(bytes[lastIx] & ~0x80);
    const xIsOdd = (bytes[lastIx] & 0x80) !== 0;

    const y = utils.intFromLE(normed);
    return this.curve.pointFromY(y, xIsOdd);
  }
  encodeInt(num) {
    return num.toArray("le", this.encodingLength);
  }
  decodeInt(bytes) {
    return utils.intFromLE(bytes);
  }
  isPoint(val) {
    return val instanceof this.pointClass;
  }
}













