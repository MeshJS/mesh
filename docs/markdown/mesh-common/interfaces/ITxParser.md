[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / ITxParser

# Interface: ITxParser

Defined in: interfaces/serializer.ts:42

## Methods

### getBuilderBody()

> **getBuilderBody**(): [`MeshTxBuilderBody`](../type-aliases/MeshTxBuilderBody.md)

Defined in: interfaces/serializer.ts:46

#### Returns

[`MeshTxBuilderBody`](../type-aliases/MeshTxBuilderBody.md)

***

### getBuilderBodyWithoutChange()

> **getBuilderBodyWithoutChange**(): [`MeshTxBuilderBody`](../type-aliases/MeshTxBuilderBody.md)

Defined in: interfaces/serializer.ts:47

#### Returns

[`MeshTxBuilderBody`](../type-aliases/MeshTxBuilderBody.md)

***

### getRequiredInputs()

> **getRequiredInputs**(`txHex`): [`TxInput`](../type-aliases/TxInput.md)[]

Defined in: interfaces/serializer.ts:43

#### Parameters

##### txHex

`string`

#### Returns

[`TxInput`](../type-aliases/TxInput.md)[]

***

### parse()

> **parse**(`txHex`, `resolvedUtxos?`): `void`

Defined in: interfaces/serializer.ts:44

#### Parameters

##### txHex

`string`

##### resolvedUtxos?

[`UTxO`](../type-aliases/UTxO.md)[]

#### Returns

`void`

***

### toTester()

> **toTester**(): [`TxTester`](../classes/TxTester.md)

Defined in: interfaces/serializer.ts:45

#### Returns

[`TxTester`](../classes/TxTester.md)
