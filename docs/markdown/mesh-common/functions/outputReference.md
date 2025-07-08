[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / outputReference

# Function: outputReference()

> **outputReference**(`txHash`, `index`): [`OutputReference`](../type-aliases/OutputReference.md)

Defined in: data/json/aliases.ts:196

The utility function to create a Plutus Data output reference in JSON.
Note that it is updated since aiken version v1.1.0.
If you want to build the type before Chang, please use txOutRef instead.

## Parameters

### txHash

`string`

The transaction hash

### index

`number`

The index of the output

## Returns

[`OutputReference`](../type-aliases/OutputReference.md)

The Plutus Data output reference object
