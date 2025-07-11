[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IWithdrawalBlueprint

# Interface: IWithdrawalBlueprint

Defined in: types/blueprint/withdrawal.ts:4

## Properties

### address

> **address**: `string`

Defined in: types/blueprint/withdrawal.ts:9

***

### cbor

> **cbor**: `string`

Defined in: types/blueprint/withdrawal.ts:7

***

### hash

> **hash**: `string`

Defined in: types/blueprint/withdrawal.ts:8

***

### networkId

> **networkId**: `number`

Defined in: types/blueprint/withdrawal.ts:6

***

### version

> **version**: `"V1"` \| `"V2"` \| `"V3"`

Defined in: types/blueprint/withdrawal.ts:5

## Methods

### noParamScript()

> **noParamScript**(`compiledCode`): `this`

Defined in: types/blueprint/withdrawal.ts:15

#### Parameters

##### compiledCode

`string`

#### Returns

`this`

***

### paramScript()

> **paramScript**(`compiledCode`, `params`, `paramsType`): `this`

Defined in: types/blueprint/withdrawal.ts:10

#### Parameters

##### compiledCode

`string`

##### params

`string`[]

##### paramsType

[`PlutusDataType`](../type-aliases/PlutusDataType.md)

#### Returns

`this`
