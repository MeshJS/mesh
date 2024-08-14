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

import elliptic from "elliptic";

const utils = elliptic.utils;
const assert = utils.assert;
const parseBytes = utils.parseBytes;
// const cachedProperty = utils.cachedProperty;
export class KeyPair {
  constructor(eddsa, params) {
    this.eddsa = eddsa;
    this._secret = parseBytes(params.secret);
    if (eddsa.isPoint(params.pub)) {
      this._pub = params.pub;
    } else {
      this._pubBytes = parseBytes(params.pub);
    }
  }
  static fromPublic(eddsa, pub) {
    if (pub instanceof KeyPair) {
      return pub;
    }
    return new KeyPair(eddsa, { pub });
  }
  static fromSecret(eddsa, secret) {
    if (secret instanceof KeyPair) {
      return secret;
    }
    return new KeyPair(eddsa, { secret });
  }
  secret() {
    return this._secret.slice(0, 32);
  }
  sign(message) {
    assert(this._secret, "KeyPair can only verify");
    return this.eddsa.signExtended(message, this);
  }
  verify(message, sig) {
    return this.eddsa.verify(message, sig, this);
  }

  pub() {
    if (this._pubBytes) {
      return this.eddsa.decodePoint(this._pubBytes)
    }
    return this.eddsa.g.mul(this.kl());
  }

  pubBytes() {
    return this.eddsa.encodePoint(this.pub());
  }

  privBytes() {
    return this._secret;
  }

  priv() {
    return this.eddsa.decodeInt(this.privBytes());
  }

  kl() {
    return this.eddsa.decodeInt(this.privBytes().slice(0, 32));
  }

  messagePrefix() {
    return this._secret.slice(32, 64);
  }
}

// cachedProperty(KeyPair, "pubBytes", function pubBytes() {
//   return this.eddsa.encodePoint(this.pub());
// });

// cachedProperty(KeyPair, "pub", function pub() {
//   if (this._pubBytes) {
//     return this.eddsa.decodePoint(this._pubBytes);
//   }
//   return this.eddsa.g.mul(this.kl());
// });

// cachedProperty(KeyPair, "privBytes", function privBytes() {
//   return this._secret;
// });

// cachedProperty(KeyPair, "priv", function priv() {
//   return this.eddsa.decodeInt(this.privBytes());
// });

// cachedProperty(KeyPair, "kl", function priv() {
//   return this.eddsa.decodeInt(this.privBytes().slice(0, 32));
// });

// cachedProperty(KeyPair, "messagePrefix", function messagePrefix() {
//   return this._secret.slice(32, 64);
// });



// module.exports = KeyPair;
