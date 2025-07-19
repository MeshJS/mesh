[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / mPubKeyAddress

# Function: mPubKeyAddress()

> **mPubKeyAddress**(`bytes`, `stakeCredential?`, `isStakeScriptCredential?`): [`MPubKeyAddress`](../type-aliases/MPubKeyAddress.md)

Defined in: data/mesh/credentials.ts:81

The utility function to create a Mesh Data public key address

## Parameters

### bytes

`string`

The public key hash in hex

### stakeCredential?

`string`

The staking credential in hex

### isStakeScriptCredential?

`boolean` = `false`

The flag to indicate if the credential is a script credential

## Returns

[`MPubKeyAddress`](../type-aliases/MPubKeyAddress.md)

The Mesh Data public key address object
