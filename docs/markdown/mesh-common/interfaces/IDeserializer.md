[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IDeserializer

# Interface: IDeserializer

Defined in: interfaces/serializer.ts:71

## Properties

### cert

> **cert**: `object`

Defined in: interfaces/serializer.ts:79

#### deserializePoolId()

> **deserializePoolId**(`poolId`): `string`

##### Parameters

###### poolId

`string`

##### Returns

`string`

***

### key

> **key**: `object`

Defined in: interfaces/serializer.ts:72

#### deserializeAddress()

> **deserializeAddress**(`bech32`): [`DeserializedAddress`](../type-aliases/DeserializedAddress.md)

##### Parameters

###### bech32

`string`

##### Returns

[`DeserializedAddress`](../type-aliases/DeserializedAddress.md)

***

### script

> **script**: `object`

Defined in: interfaces/serializer.ts:75

#### deserializeNativeScript()

> **deserializeNativeScript**(`script`): [`DeserializedScript`](../type-aliases/DeserializedScript.md)

##### Parameters

###### script

[`NativeScript`](../type-aliases/NativeScript.md)

##### Returns

[`DeserializedScript`](../type-aliases/DeserializedScript.md)

#### deserializePlutusScript()

> **deserializePlutusScript**(`script`): [`DeserializedScript`](../type-aliases/DeserializedScript.md)

##### Parameters

###### script

[`PlutusScript`](../type-aliases/PlutusScript.md)

##### Returns

[`DeserializedScript`](../type-aliases/DeserializedScript.md)
