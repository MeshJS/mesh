[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / pubKeyAddress

# Function: pubKeyAddress()

> **pubKeyAddress**(`bytes`, `stakeCredential?`, `isStakeScriptCredential?`): [`PubKeyAddress`](../type-aliases/PubKeyAddress.md)

Defined in: data/json/credentials.ts:82

The utility function to create a Plutus Data public key address in JSON

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

[`PubKeyAddress`](../type-aliases/PubKeyAddress.md)

The Plutus Data public key address object
