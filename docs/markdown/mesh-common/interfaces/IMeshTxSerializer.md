[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IMeshTxSerializer

# Interface: IMeshTxSerializer

Defined in: interfaces/serializer.ts:17

## Properties

### deserializer

> **deserializer**: [`IDeserializer`](IDeserializer.md)

Defined in: interfaces/serializer.ts:38

***

### parser

> **parser**: [`ITxParser`](ITxParser.md)

Defined in: interfaces/serializer.ts:39

***

### resolver

> **resolver**: [`IResolver`](IResolver.md)

Defined in: interfaces/serializer.ts:37

## Methods

### addSigningKeys()

> **addSigningKeys**(`txHex`, `signingKeys`): `string`

Defined in: interfaces/serializer.ts:26

#### Parameters

##### txHex

`string`

##### signingKeys

`string`[]

#### Returns

`string`

***

### serializeAddress()

> **serializeAddress**(`address`, `networkId?`): `string`

Defined in: interfaces/serializer.ts:28

#### Parameters

##### address

[`DeserializedAddress`](../type-aliases/DeserializedAddress.md)

##### networkId?

`0` | `1`

#### Returns

`string`

***

### serializeData()

> **serializeData**(`data`): `string`

Defined in: interfaces/serializer.ts:27

#### Parameters

##### data

[`BuilderData`](../type-aliases/BuilderData.md)

#### Returns

`string`

***

### serializeOutput()

> **serializeOutput**(`output`): `string`

Defined in: interfaces/serializer.ts:35

#### Parameters

##### output

[`Output`](../type-aliases/Output.md)

#### Returns

`string`

***

### serializePoolId()

> **serializePoolId**(`hash`): `string`

Defined in: interfaces/serializer.ts:29

#### Parameters

##### hash

`string`

#### Returns

`string`

***

### serializeRewardAddress()

> **serializeRewardAddress**(`stakeKeyHash`, `isScriptHash?`, `network_id?`): `string`

Defined in: interfaces/serializer.ts:30

#### Parameters

##### stakeKeyHash

`string`

##### isScriptHash?

`boolean`

##### network\_id?

`0` | `1`

#### Returns

`string`

***

### serializeTxBody()

> **serializeTxBody**(`txBuilderBody`, `protocolParams`): `string`

Defined in: interfaces/serializer.ts:18

#### Parameters

##### txBuilderBody

[`MeshTxBuilderBody`](../type-aliases/MeshTxBuilderBody.md)

##### protocolParams

[`Protocol`](../type-aliases/Protocol.md)

#### Returns

`string`

***

### serializeTxBodyWithMockSignatures()

> **serializeTxBodyWithMockSignatures**(`txBuilderBody`, `protocolParams`): `string`

Defined in: interfaces/serializer.ts:22

#### Parameters

##### txBuilderBody

[`MeshTxBuilderBody`](../type-aliases/MeshTxBuilderBody.md)

##### protocolParams

[`Protocol`](../type-aliases/Protocol.md)

#### Returns

`string`

***

### serializeValue()

> **serializeValue**(`value`): `string`

Defined in: interfaces/serializer.ts:36

#### Parameters

##### value

[`Asset`](../type-aliases/Asset.md)[]

#### Returns

`string`
