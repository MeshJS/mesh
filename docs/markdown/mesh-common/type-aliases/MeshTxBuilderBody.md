[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / MeshTxBuilderBody

# Type Alias: MeshTxBuilderBody

> **MeshTxBuilderBody** = `object`

Defined in: types/transaction-builder/index.ts:21

## Properties

### certificates

> **certificates**: [`Certificate`](Certificate.md)[]

Defined in: types/transaction-builder/index.ts:32

***

### chainedTxs

> **chainedTxs**: `string`[]

Defined in: types/transaction-builder/index.ts:42

***

### changeAddress

> **changeAddress**: `string`

Defined in: types/transaction-builder/index.ts:29

***

### collateralReturnAddress?

> `optional` **collateralReturnAddress**: `string`

Defined in: types/transaction-builder/index.ts:48

***

### collaterals

> **collaterals**: [`PubKeyTxIn`](PubKeyTxIn.md)[]

Defined in: types/transaction-builder/index.ts:25

***

### expectedByronAddressWitnesses

> **expectedByronAddressWitnesses**: `string`[]

Defined in: types/transaction-builder/index.ts:46

***

### expectedNumberKeyWitnesses

> **expectedNumberKeyWitnesses**: `number`

Defined in: types/transaction-builder/index.ts:45

***

### extraInputs

> **extraInputs**: [`UTxO`](UTxO.md)[]

Defined in: types/transaction-builder/index.ts:36

***

### fee

> **fee**: [`Quantity`](Quantity.md)

Defined in: types/transaction-builder/index.ts:24

***

### inputs

> **inputs**: [`TxIn`](TxIn.md)[]

Defined in: types/transaction-builder/index.ts:22

***

### inputsForEvaluation

> **inputsForEvaluation**: `Record`\<`string`, [`UTxO`](UTxO.md)\>

Defined in: types/transaction-builder/index.ts:43

***

### metadata

> **metadata**: [`TxMetadata`](TxMetadata.md)

Defined in: types/transaction-builder/index.ts:30

***

### mints

> **mints**: [`MintParam`](MintParam.md)[]

Defined in: types/transaction-builder/index.ts:28

***

### network

> **network**: [`Network`](Network.md) \| `number`[][]

Defined in: types/transaction-builder/index.ts:44

***

### outputs

> **outputs**: [`Output`](Output.md)[]

Defined in: types/transaction-builder/index.ts:23

***

### referenceInputs

> **referenceInputs**: [`RefTxIn`](RefTxIn.md)[]

Defined in: types/transaction-builder/index.ts:27

***

### requiredSignatures

> **requiredSignatures**: `string`[]

Defined in: types/transaction-builder/index.ts:26

***

### selectionConfig

> **selectionConfig**: `object`

Defined in: types/transaction-builder/index.ts:37

#### includeTxFees

> **includeTxFees**: `boolean`

#### strategy

> **strategy**: [`UtxoSelectionStrategy`](UtxoSelectionStrategy.md)

#### threshold

> **threshold**: `string`

***

### signingKey

> **signingKey**: `string`[]

Defined in: types/transaction-builder/index.ts:35

***

### totalCollateral?

> `optional` **totalCollateral**: [`Quantity`](Quantity.md)

Defined in: types/transaction-builder/index.ts:47

***

### validityRange

> **validityRange**: [`ValidityRange`](ValidityRange.md)

Defined in: types/transaction-builder/index.ts:31

***

### votes

> **votes**: [`Vote`](Vote.md)[]

Defined in: types/transaction-builder/index.ts:34

***

### withdrawals

> **withdrawals**: [`Withdrawal`](Withdrawal.md)[]

Defined in: types/transaction-builder/index.ts:33
