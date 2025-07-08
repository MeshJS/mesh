[**@meshsdk/core-cst**](../README.md)

***

[@meshsdk/core-cst](../globals.md) / checkSignature

# Function: checkSignature()

> **checkSignature**(`data`, `The`, `address?`): `Promise`\<`boolean`\>

Defined in: packages/mesh-core-cst/src/message-signing/check-signature.ts:24

Check the signature of a given data string

## Parameters

### data

`string`

The data string to verify the signature against

### The

`DataSignature`

signature obtained by `signData`

### address?

`string`

Optional Bech32 string of a stake, stake_test1, addr, or addr_test1 address. If provided, this function will validate the signer's address against this value.

## Returns

`Promise`\<`boolean`\>

boolean
