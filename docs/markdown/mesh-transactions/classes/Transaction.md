[**@meshsdk/transaction**](../README.md)

***

[@meshsdk/transaction](../globals.md) / Transaction

# Class: Transaction

Defined in: mesh-transaction/src/transaction/index.ts:46

Deprecated - Use `MeshTxBuilder` instead

## Constructors

### Constructor

> **new Transaction**(`options`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:51

#### Parameters

##### options

[`TransactionOptions`](../interfaces/TransactionOptions.md)

#### Returns

`Transaction`

## Properties

### initiator

> **initiator**: `IInitiator`

Defined in: mesh-transaction/src/transaction/index.ts:48

***

### isCollateralNeeded

> **isCollateralNeeded**: `boolean` = `false`

Defined in: mesh-transaction/src/transaction/index.ts:49

***

### txBuilder

> **txBuilder**: [`MeshTxBuilder`](MeshTxBuilder.md)

Defined in: mesh-transaction/src/transaction/index.ts:47

## Methods

### build()

> **build**(`balanced`): `Promise`\<`string`\>

Defined in: mesh-transaction/src/transaction/index.ts:714

#### Parameters

##### balanced

`Boolean` = `true`

#### Returns

`Promise`\<`string`\>

***

### burnAsset()

> **burnAsset**(`forgeScript`, `asset`, `redeemer?`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:524

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### forgeScript

`string` | `UTxO` | `PlutusScript`

##### asset

`Asset`

##### redeemer?

`Pick`\<`Action`, `"data"`\> & `object`

#### Returns

`Transaction`

***

### delegateStake()

> **delegateStake**(`rewardAddress`, `poolId`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:670

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### rewardAddress

`string`

##### poolId

`string`

#### Returns

`Transaction`

***

### deregisterStake()

> **deregisterStake**(`rewardAddress`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:682

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### rewardAddress

`string`

#### Returns

`Transaction`

***

### mintAsset()

> **mintAsset**(`forgeScript`, `mint`, `redeemer?`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:367

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### forgeScript

`string` | `UTxO` | `PlutusScript`

##### mint

`Mint`

##### redeemer?

`Pick`\<`Action`, `"data"`\> & `object`

#### Returns

`Transaction`

***

### mintPlutusScript()

> `protected` **mintPlutusScript**(`script`): [`MeshTxBuilder`](MeshTxBuilder.md)

Defined in: mesh-transaction/src/transaction/index.ts:731

#### Parameters

##### script

`PlutusScript`

#### Returns

[`MeshTxBuilder`](MeshTxBuilder.md)

***

### redeemValue()

> **redeemValue**(`options`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:291

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### options

###### datum?

`UTxO` \| `Data`

###### redeemer?

`Pick`\<`Action`, `"data"`\> & `object`

###### script

`UTxO` \| `PlutusScript`

###### value

`UTxO`

#### Returns

`Transaction`

***

### registerPool()

> **registerPool**(`params`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:700

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### params

`PoolParams`

#### Returns

`Transaction`

***

### registerStake()

> **registerStake**(`rewardAddress`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:691

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### rewardAddress

`string`

#### Returns

`Transaction`

***

### retirePool()

> **retirePool**(`poolId`, `epochNo`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:709

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### poolId

`string`

##### epochNo

`number`

#### Returns

`Transaction`

***

### sendAssets()

> **sendAssets**(`recipient`, `assets`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:133

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### recipient

`Recipient`

The recipient of the output.

##### assets

The assets to send. Provide string for lovelace and Asset[] for tokens and/or lovelace.

`string` | `Asset`[]

#### Returns

`Transaction`

The transaction builder.

#### See

[https://meshjs.dev/apis/transaction#sendAssets](https://meshjs.dev/apis/transaction#sendAssets)

***

### sendLovelace()

> **sendLovelace**(`recipient`, `lovelace`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:175

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Use sendAssets instead:
```ts
this.sendAssets(recipient, lovelace);
```

Deprecation reason - Unnecessary implementation which might cause confusion.

#### Parameters

##### recipient

`Recipient`

The recipient of the transaction.

##### lovelace

`string`

The amount of lovelace to send.

#### Returns

`Transaction`

The Transaction object.

#### See

[https://meshjs.dev/apis/transaction#sendAda](https://meshjs.dev/apis/transaction#sendAda)

***

### sendToken()

> **sendToken**(`recipient`, `ticker`, `amount`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:197

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Please use sendAssets with helper function to obtain token unit instead:
```ts
const assets = [{ unit: SUPPORTED_TOKENS.GIMBAL, quantity: "100" }]
transaction.sendAssets(recipient, assets)
```

Deprecation reason - Required maintenance on tokens.

#### Parameters

##### recipient

`Recipient`

The recipient of the transaction.

##### ticker

The ticker of the token to send.

`"LQ"` | `"MIN"` | `"NTX"` | `"iBTC"` | `"iETH"` | `"iUSD"` | `"MILK"` | `"AGIX"` | `"MELD"` | `"INDY"` | `"CLAY"` | `"MCOS"` | `"DING"` | `"GERO"` | `"NMKR"` | `"PAVIA"` | `"HOSKY"` | `"YUMMI"` | `"C3"` | `"GIMBAL"` | `"SUNDAE"` | `"GREENS"` | `"GENS"` | `"SOCIETY"` | `"DJED"` | `"SHEN"` | `"WMT"` | `"COPI"`

##### amount

`string`

The amount of the token to send.

#### Returns

`Transaction`

The Transaction object.

#### See

[https://meshjs.dev/apis/transaction#sendToken](https://meshjs.dev/apis/transaction#sendToken)

***

### sendValue()

> **sendValue**(`recipient`, `value`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:216

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

```ts
const assets = value.output.amount;
this.sendAssets(recipient, assets);
```
Deprecation reason - Unnecessary implementation which might cause confusion.

#### Parameters

##### recipient

`Recipient`

The recipient of the output.

##### value

`UTxO`

The UTxO value of the output.

#### Returns

`Transaction`

The Transaction object.

***

### setChangeAddress()

> **setChangeAddress**(`changeAddress`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:552

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Sets the change address for the transaction.

#### Parameters

##### changeAddress

`string`

The change address.

#### Returns

`Transaction`

The Transaction object.

***

### setCollateral()

> **setCollateral**(`collateral`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:566

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Sets the collateral for the transaction.

#### Parameters

##### collateral

`UTxO`[]

Set the UTxO for collateral.

#### Returns

`Transaction`

The Transaction object.

***

### setMetadata()

> **setMetadata**(`label`, `metadata`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:652

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

 Add a JSON metadata entry to the transaction.

#### Parameters

##### label

`number`

The label to use for the metadata entry.

##### metadata

The value to use for the metadata entry.

`object` | `Metadatum`

#### Returns

`Transaction`

The Transaction object.

#### See

[https://meshjs.dev/apis/transaction#setMetadata](https://meshjs.dev/apis/transaction#setMetadata)

***

### setNativeScriptInput()

> **setNativeScriptInput**(`script`, `utxo`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:269

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Sets the native script for the transaction.

#### Parameters

##### script

`NativeScript`

The native script to spend from.

##### utxo

`UTxO`

The UTxO attached to the script.

#### Returns

`Transaction`

The Transaction object.

***

### setNetwork()

> **setNetwork**(`network`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:587

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Sets the network to use, this is mainly to know the cost models to be used to calculate script integrity hash

#### Parameters

##### network

The specific network this transaction is being built for ("testnet" | "preview" | "preprod" | "mainnet")

`"testnet"` | `"preview"` | `"preprod"` | `"mainnet"`

#### Returns

`Transaction`

The Transaction object.

***

### setRequiredSigners()

> **setRequiredSigners**(`addresses`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:601

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

Sets the required signers for the transaction.

#### Parameters

##### addresses

`string`[]

The addresses of the required signers.

#### Returns

`Transaction`

The Transaction object.

***

### setTimeToExpire()

> **setTimeToExpire**(`slot`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:621

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

 Set the time to live for the transaction.

#### Parameters

##### slot

`string`

The slot number to expire the transaction at.

#### Returns

`Transaction`

The Transaction object.

#### See

[https://meshjs.dev/apis/transaction#setTimeLimit](https://meshjs.dev/apis/transaction#setTimeLimit)

***

### setTimeToStart()

> **setTimeToStart**(`slot`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:636

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

 Sets the start slot for the transaction.

#### Parameters

##### slot

`string`

The start slot for the transaction.

#### Returns

`Transaction`

The Transaction object.

#### See

[https://meshjs.dev/apis/transaction#setTimeLimit](https://meshjs.dev/apis/transaction#setTimeLimit)

***

### setTxInputs()

> **setTxInputs**(`inputs`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:228

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### inputs

`UTxO`[]

The inputs to set.

#### Returns

`Transaction`

The transaction.

***

### setTxRefInputs()

> **setTxRefInputs**(`inputs`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:249

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### inputs

`UTxO`[]

The reference inputs to set.

#### Returns

`Transaction`

The transaction.

***

### spendingPlutusScript()

> `protected` **spendingPlutusScript**(`script`): [`MeshTxBuilder`](MeshTxBuilder.md)

Defined in: mesh-transaction/src/transaction/index.ts:746

#### Parameters

##### script

`PlutusScript`

#### Returns

[`MeshTxBuilder`](MeshTxBuilder.md)

***

### withdrawRewards()

> **withdrawRewards**(`rewardAddress`, `lovelace`): `Transaction`

Defined in: mesh-transaction/src/transaction/index.ts:661

[Deprecated] - `Transaction` class is on planning for V2.
Use `MeshTxBuilder` instead for tx-building for now.

#### Parameters

##### rewardAddress

`string`

##### lovelace

`string`

#### Returns

`Transaction`

***

### attachMetadata()

> `static` **attachMetadata**(`cborTx`, `cborTxMetadata`): `string`

Defined in: mesh-transaction/src/transaction/index.ts:56

#### Parameters

##### cborTx

`string`

##### cborTxMetadata

`string`

#### Returns

`string`

***

### deattachMetadata()

> `static` **deattachMetadata**(`cborTx`): `string`

Defined in: mesh-transaction/src/transaction/index.ts:78

#### Parameters

##### cborTx

`string`

#### Returns

`string`

***

### maskMetadata()

> `static` **maskMetadata**(`cborTx`): `string`

Defined in: mesh-transaction/src/transaction/index.ts:83

#### Parameters

##### cborTx

`string`

#### Returns

`string`

***

### readMetadata()

> `static` **readMetadata**(`cborTx`): `string`

Defined in: mesh-transaction/src/transaction/index.ts:106

#### Parameters

##### cborTx

`string`

#### Returns

`string`

***

### writeMetadata()

> `static` **writeMetadata**(`cborTx`, `cborTxMetadata`): `string`

Defined in: mesh-transaction/src/transaction/index.ts:111

#### Parameters

##### cborTx

`string`

##### cborTxMetadata

`string`

#### Returns

`string`
