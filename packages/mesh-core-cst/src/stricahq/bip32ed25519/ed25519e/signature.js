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

import { isBN } from "bn.js";
import { utils as _utils } from "elliptic";

const utils = _utils;
const assert = utils.assert;
const cachedProperty = utils.cachedProperty;
const parseBytes = utils.parseBytes;
/**
 * @param {EDDSA} eddsa - eddsa instance
 * @param {Array<Bytes>|Object} sig -
 * @param {Array<Bytes>|Point} [sig.R] - R point as Point or bytes
 * @param {Array<Bytes>|bn} [sig.S] - S scalar as bn or bytes
 * @param {Array<Bytes>} [sig.Rencoded] - R point encoded
 * @param {Array<Bytes>} [sig.Sencoded] - S scalar encoded
 */
function Signature(eddsa, sig) {
  this.eddsa = eddsa;

  if (typeof sig !== "object") sig = parseBytes(sig);

  if (Array.isArray(sig)) {
    sig = {
      R: sig.slice(0, eddsa.encodingLength),
      S: sig.slice(eddsa.encodingLength),
    };
  }

  assert(sig.R && sig.S, "Signature without R or S");

  if (eddsa.isPoint(sig.R)) this._R = sig.R;
  if (isBN(sig.S)) this._S = sig.S;

  this._Rencoded = Array.isArray(sig.R) ? sig.R : sig.Rencoded;
  this._Sencoded = Array.isArray(sig.S) ? sig.S : sig.Sencoded;
}

cachedProperty(Signature, "S", function S() {
  return this.eddsa.decodeInt(this.Sencoded());
});

cachedProperty(Signature, "R", function R() {
  return this.eddsa.decodePoint(this.Rencoded());
});

cachedProperty(Signature, "Rencoded", function Rencoded() {
  return this.eddsa.encodePoint(this.R());
});

cachedProperty(Signature, "Sencoded", function Sencoded() {
  return this.eddsa.encodeInt(this.S());
});

Signature.prototype.toBytes = function toBytes() {
  return this.Rencoded().concat(this.Sencoded());
};

Signature.prototype.toHex = function toHex() {
  return utils.encode(this.toBytes(), "hex").toUpperCase();
};

export { Signature };
