[**@meshsdk/transaction**](../README.md)

***

[@meshsdk/transaction](../globals.md) / TxParser

# Class: TxParser

Defined in: mesh-transaction/src/tx-parser/index.ts:8

TxParser class to parse transaction hex strings and resolve UTxOs.

It is used for either manipulating transactions or for unit testing transaction buildings.

## Constructors

### Constructor

> **new TxParser**(`serializer`, `fetcher?`): `TxParser`

Defined in: mesh-transaction/src/tx-parser/index.ts:9

#### Parameters

##### serializer

`IMeshTxSerializer`

##### fetcher?

`IFetcher`

#### Returns

`TxParser`

## Properties

### fetcher?

> `optional` **fetcher**: `IFetcher`

Defined in: mesh-transaction/src/tx-parser/index.ts:11

***

### serializer

> **serializer**: `IMeshTxSerializer`

Defined in: mesh-transaction/src/tx-parser/index.ts:10

## Methods

### getBuilderBody()

> **getBuilderBody**(): `MeshTxBuilderBody`

Defined in: mesh-transaction/src/tx-parser/index.ts:59

#### Returns

`MeshTxBuilderBody`

***

### getBuilderBodyWithoutChange()

> **getBuilderBodyWithoutChange**(): `MeshTxBuilderBody`

Defined in: mesh-transaction/src/tx-parser/index.ts:61

#### Returns

`MeshTxBuilderBody`

***

### parse()

> **parse**(`txHex`, `providedUtxos`): `Promise`\<`MeshTxBuilderBody`\>

Defined in: mesh-transaction/src/tx-parser/index.ts:14

#### Parameters

##### txHex

`string`

##### providedUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`MeshTxBuilderBody`\>

***

### toTester()

> **toTester**(): `TxTester`

Defined in: mesh-transaction/src/tx-parser/index.ts:64

#### Returns

`TxTester`
