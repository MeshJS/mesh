[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IResolver

# Interface: IResolver

Defined in: interfaces/serializer.ts:50

## Properties

### data

> **data**: `object`

Defined in: interfaces/serializer.ts:60

#### resolveDataHash()

> **resolveDataHash**(`rawData`, `type?`): `string`

##### Parameters

###### rawData

`object` | [`Data`](../type-aliases/Data.md)

###### type?

[`PlutusDataType`](../type-aliases/PlutusDataType.md)

##### Returns

`string`

***

### keys

> **keys**: `object`

Defined in: interfaces/serializer.ts:51

#### resolveEd25519KeyHash()

> **resolveEd25519KeyHash**(`bech32`): `string`

##### Parameters

###### bech32

`string`

##### Returns

`string`

#### resolvePrivateKey()

> **resolvePrivateKey**(`words`): `string`

##### Parameters

###### words

`string`[]

##### Returns

`string`

#### resolveRewardAddress()

> **resolveRewardAddress**(`bech32`): `string`

##### Parameters

###### bech32

`string`

##### Returns

`string`

#### resolveStakeKeyHash()

> **resolveStakeKeyHash**(`bech32`): `string`

##### Parameters

###### bech32

`string`

##### Returns

`string`

***

### script

> **script**: `object`

Defined in: interfaces/serializer.ts:66

#### resolveScriptRef()

> **resolveScriptRef**(`script`): `string`

##### Parameters

###### script

[`NativeScript`](../type-aliases/NativeScript.md) | [`PlutusScript`](../type-aliases/PlutusScript.md)

##### Returns

`string`

***

### tx

> **tx**: `object`

Defined in: interfaces/serializer.ts:57

#### resolveTxHash()

> **resolveTxHash**(`txHex`): `string`

##### Parameters

###### txHex

`string`

##### Returns

`string`
