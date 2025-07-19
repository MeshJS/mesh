[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / mScriptAddress

# Function: mScriptAddress()

> **mScriptAddress**(`bytes`, `stakeCredential?`, `isStakeScriptCredential?`): [`MScriptAddress`](../type-aliases/MScriptAddress.md)

Defined in: data/mesh/credentials.ts:98

The utility function to create a Mesh Data script address

## Parameters

### bytes

`string`

The validator hash in hex

### stakeCredential?

`string`

The staking credential in hex

### isStakeScriptCredential?

`boolean` = `false`

The flag to indicate if the credential is a script credential

## Returns

[`MScriptAddress`](../type-aliases/MScriptAddress.md)

The Mesh Data script address object
