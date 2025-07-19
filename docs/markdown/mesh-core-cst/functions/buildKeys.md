[**@meshsdk/core-cst**](../README.md)

***

[@meshsdk/core-cst](../globals.md) / buildKeys

# Function: buildKeys()

> **buildKeys**(`privateKeyHex`, `accountIndex`, `keyIndex`): `object`

Defined in: packages/mesh-core-cst/src/utils/builder.ts:108

Build a set of keys from a given private key

NOTE - Must be called after `await Crypto.Ready()`

## Parameters

### privateKeyHex

The BIP32 private key hex to derive keys from

`string` | \[`string`, `string`\]

### accountIndex

`number`

The account index to derive keys for

### keyIndex

`number` = `0`

The key index to derive keys for

## Returns

`object`

The payment and stake keys, and optionally the dRep key if a Bip32PrivateKey is provided

### dRepKey?

> `optional` **dRepKey**: `Ed25519PrivateKey`

### paymentKey

> **paymentKey**: `Ed25519PrivateKey`

### stakeKey

> **stakeKey**: `Ed25519PrivateKey`
