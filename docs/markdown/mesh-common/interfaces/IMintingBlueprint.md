[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IMintingBlueprint

# Interface: IMintingBlueprint

Defined in: types/blueprint/minting.ts:4

## Properties

### cbor

> **cbor**: `string`

Defined in: types/blueprint/minting.ts:6

***

### hash

> **hash**: `string`

Defined in: types/blueprint/minting.ts:7

***

### version

> **version**: `"V1"` \| `"V2"` \| `"V3"`

Defined in: types/blueprint/minting.ts:5

## Methods

### noParamScript()

> **noParamScript**(`compiledCode`): `this`

Defined in: types/blueprint/minting.ts:13

#### Parameters

##### compiledCode

`string`

#### Returns

`this`

***

### paramScript()

> **paramScript**(`compiledCode`, `params`, `paramsType`): `this`

Defined in: types/blueprint/minting.ts:8

#### Parameters

##### compiledCode

`string`

##### params

`string`[]

##### paramsType

[`PlutusDataType`](../type-aliases/PlutusDataType.md)

#### Returns

`this`
