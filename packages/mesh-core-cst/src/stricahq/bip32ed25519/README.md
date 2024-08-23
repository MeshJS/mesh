> This package is by [Strica](https://github.com/StricaHQ/bip32ed25519) 

<p align="center">
  <a href="https://strica.io/" target="_blank">
    <img src="https://docs.strica.io/images/logo.png" width="200">
  </a>
</p>

# Bip32Ed25519

Pure javascript implementation of [Bip32Ed25519](https://ieeexplore.ieee.org/document/7966967), used for Cardano blockchain key pair.

- Create extended keys with Bip39 mnemonic entropy
- Soft and hard derivation
- Derive keys with user friendly API
- Sign and verify data

## Installation

### yarn/npm

```sh
yarn add @stricahq/bip32ed25519
```

### Browser

```html
<script src="[use jsDelivr or Unpkg]"></script>

// access bip32ed25519 global variable
```

## Usage Example

```js
import { Bip32PrivateKey } from "@stricahq/bip32ed25519";

... // Bip39 entropy from mnemonics
const rootKey = await Bip32PrivateKey.fromEntropy(entropy);
...

// hardened derivation
const accountKey = rootKey
      .derive(2147483648 + 1852) // purpose
      .derive(2147483648 + 1815) // coin type
      .derive(2147483648 + 0); // account index

const spendingKey = accountKey
      .derive(0) // chain
      .derive(0) // payment key index
      .toPrivateKey();

const pubKey = spendingKey
      .toPublicKey()
      .toBytes();
```
Checkout tests and API doc for more details

## API Doc
Find the API documentation [here](https://docs.strica.io/lib/bip32ed25519)

## Used by
[Typhon Wallet](https://typhonwallet.io)

# License
Copyright 2021 Strica

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.