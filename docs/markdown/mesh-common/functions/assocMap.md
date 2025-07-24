[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / assocMap

# Function: assocMap()

> **assocMap**\<`K`, `V`\>(`mapItems`, `validation`): [`AssocMap`](../type-aliases/AssocMap.md)\<`K`, `V`\>

Defined in: data/json/primitives.ts:153

The utility function to create a Plutus Data association map in JSON

## Type Parameters

### K

`K`

### V

`V`

## Parameters

### mapItems

\[`K`, `V`\][]

The items map in array

### validation

`boolean` = `true`

Default true - If current data construction would perform validation (introducing this flag due to possible performance issue in loop validation)

## Returns

[`AssocMap`](../type-aliases/AssocMap.md)\<`K`, `V`\>

The Plutus Data association map object
