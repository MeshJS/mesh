[**@meshsdk/core-cst**](../README.md)

***

[@meshsdk/core-cst](../globals.md) / CardanoSDKSerializer

# Class: CardanoSDKSerializer

Defined in: packages/mesh-core-cst/src/serializer/index.ts:136

## Implements

- `IMeshTxSerializer`

## Constructors

### Constructor

> **new CardanoSDKSerializer**(`protocolParams?`): `CardanoSDKSerializer`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:139

#### Parameters

##### protocolParams?

`Protocol`

#### Returns

`CardanoSDKSerializer`

## Properties

### deserializer

> **deserializer**: `IDeserializer`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:242

#### Implementation of

`IMeshTxSerializer.deserializer`

***

### parser

> **parser**: `ITxParser`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:546

#### Implementation of

`IMeshTxSerializer.parser`

***

### protocolParams

> **protocolParams**: `Protocol`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:137

***

### resolver

> **resolver**: `IResolver`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:313

#### Implementation of

`IMeshTxSerializer.resolver`

## Methods

### addSigningKeys()

> **addSigningKeys**(`txHex`, `signingKeys`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:455

#### Parameters

##### txHex

`string`

##### signingKeys

`string`[]

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.addSigningKeys`

***

### serializeAddress()

> **serializeAddress**(`address`, `networkId?`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:160

#### Parameters

##### address

`Partial`\<`DeserializedAddress`\>

##### networkId?

`0` | `1`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeAddress`

***

### serializeData()

> **serializeData**(`data`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:237

#### Parameters

##### data

`BuilderData`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeData`

***

### serializeOutput()

> **serializeOutput**(`output`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:491

#### Parameters

##### output

`Output`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeOutput`

***

### serializePoolId()

> **serializePoolId**(`hash`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:156

#### Parameters

##### hash

`string`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializePoolId`

***

### serializeRewardAddress()

> **serializeRewardAddress**(`stakeKeyHash`, `isScriptHash?`, `network_id?`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:143

#### Parameters

##### stakeKeyHash

`string`

##### isScriptHash?

`boolean`

##### network\_id?

`0` | `1`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeRewardAddress`

***

### serializeTxBody()

> **serializeTxBody**(`txBuilderBody`, `protocolParams?`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:436

#### Parameters

##### txBuilderBody

`MeshTxBuilderBody`

##### protocolParams?

`Protocol`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeTxBody`

***

### serializeTxBodyWithMockSignatures()

> **serializeTxBodyWithMockSignatures**(`txBuilderBody`, `protocolParams`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:447

#### Parameters

##### txBuilderBody

`MeshTxBuilderBody`

##### protocolParams

`Protocol`

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeTxBodyWithMockSignatures`

***

### serializeValue()

> **serializeValue**(`value`): `string`

Defined in: packages/mesh-core-cst/src/serializer/index.ts:487

#### Parameters

##### value

`Asset`[]

#### Returns

`string`

#### Implementation of

`IMeshTxSerializer.serializeValue`
