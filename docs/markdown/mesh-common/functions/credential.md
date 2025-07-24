[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / credential

# Function: credential()

> **credential**(`hash`, `isScriptCredential`): [`Credential`](../type-aliases/Credential.md)

Defined in: data/json/credentials.ts:115

The utility function to create a Plutus Data credential in JSON

## Parameters

### hash

`string`

The pub key hash or script hash

### isScriptCredential

`boolean` = `false`

Indicate if the credential is script hash (false for pub key hash)

## Returns

[`Credential`](../type-aliases/Credential.md)

Plutus Data credential object
