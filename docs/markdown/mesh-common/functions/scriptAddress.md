[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / scriptAddress

# Function: scriptAddress()

> **scriptAddress**(`bytes`, `stakeCredential?`, `isStakeScriptCredential?`): [`ScriptAddress`](../type-aliases/ScriptAddress.md)

Defined in: data/json/credentials.ts:99

The utility function to create a Plutus Data script address in JSON

## Parameters

### bytes

`string`

The validator hash in hex

### stakeCredential?

`string`

The staking credential in hex

### isStakeScriptCredential?

`boolean` = `false`

The flag to indicate if the stake credential is a script credential

## Returns

[`ScriptAddress`](../type-aliases/ScriptAddress.md)

The Plutus Data script address object
