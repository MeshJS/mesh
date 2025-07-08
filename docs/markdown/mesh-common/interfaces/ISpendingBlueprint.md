[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / ISpendingBlueprint

# Interface: ISpendingBlueprint

Defined in: types/blueprint/spending.ts:4

## Properties

### address

> **address**: `string`

Defined in: types/blueprint/spending.ts:9

***

### cbor

> **cbor**: `string`

Defined in: types/blueprint/spending.ts:7

***

### hash

> **hash**: `string`

Defined in: types/blueprint/spending.ts:8

***

### isStakeScriptCredential

> **isStakeScriptCredential**: `boolean`

Defined in: types/blueprint/spending.ts:11

***

### networkId

> **networkId**: `number`

Defined in: types/blueprint/spending.ts:6

***

### stakeHash?

> `optional` **stakeHash**: `string`

Defined in: types/blueprint/spending.ts:10

***

### version

> **version**: `"V1"` \| `"V2"` \| `"V3"`

Defined in: types/blueprint/spending.ts:5

## Methods

### noParamScript()

> **noParamScript**(`compiledCode`): `this`

Defined in: types/blueprint/spending.ts:17

#### Parameters

##### compiledCode

`string`

#### Returns

`this`

***

### paramScript()

> **paramScript**(`compiledCode`, `params`, `paramsType`): `this`

Defined in: types/blueprint/spending.ts:12

#### Parameters

##### compiledCode

`string`

##### params

`string`[]

##### paramsType

[`PlutusDataType`](../type-aliases/PlutusDataType.md)

#### Returns

`this`
