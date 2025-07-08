[**@meshsdk/contract**](../README.md)

***

[@meshsdk/contract](../globals.md) / MeshHelloWorldContract

# Class: MeshHelloWorldContract

Defined in: mesh-contract/src/hello-world/offchain.ts:21

## Extends

- `MeshTxInitiator`

## Constructors

### Constructor

> **new MeshHelloWorldContract**(`inputs`): `MeshHelloWorldContract`

Defined in: mesh-contract/src/hello-world/offchain.ts:25

#### Parameters

##### inputs

`MeshTxInitiatorInput`

#### Returns

`MeshHelloWorldContract`

#### Overrides

`MeshTxInitiator.constructor`

## Properties

### fetcher?

> `optional` **fetcher**: `IFetcher`

Defined in: mesh-contract/src/common.ts:23

#### Inherited from

`MeshTxInitiator.fetcher`

***

### languageVersion

> **languageVersion**: `"V1"` \| `"V2"` \| `"V3"` = `"V2"`

Defined in: mesh-contract/src/common.ts:28

#### Inherited from

`MeshTxInitiator.languageVersion`

***

### mesh

> **mesh**: `MeshTxBuilder`

Defined in: mesh-contract/src/common.ts:22

#### Inherited from

`MeshTxInitiator.mesh`

***

### networkId

> **networkId**: `number` = `0`

Defined in: mesh-contract/src/common.ts:26

#### Inherited from

`MeshTxInitiator.networkId`

***

### scriptAddress

> **scriptAddress**: `string`

Defined in: mesh-contract/src/hello-world/offchain.ts:23

***

### scriptCbor

> **scriptCbor**: `string`

Defined in: mesh-contract/src/hello-world/offchain.ts:22

***

### stakeCredential?

> `optional` **stakeCredential**: `string`

Defined in: mesh-contract/src/common.ts:25

#### Inherited from

`MeshTxInitiator.stakeCredential`

***

### version

> **version**: `number` = `2`

Defined in: mesh-contract/src/common.ts:27

#### Inherited from

`MeshTxInitiator.version`

***

### wallet?

> `optional` **wallet**: `IWallet`

Defined in: mesh-contract/src/common.ts:24

#### Inherited from

`MeshTxInitiator.wallet`

## Methods

### \_getUtxoByTxHash()

> `protected` **\_getUtxoByTxHash**(`txHash`, `scriptCbor?`): `Promise`\<`undefined` \| `UTxO`\>

Defined in: mesh-contract/src/common.ts:197

#### Parameters

##### txHash

`string`

##### scriptCbor?

`string`

#### Returns

`Promise`\<`undefined` \| `UTxO`\>

#### Inherited from

`MeshTxInitiator._getUtxoByTxHash`

***

### getAddressUtxosWithMinLovelace()

> `protected` **getAddressUtxosWithMinLovelace**(`walletAddress`, `lovelace`, `providedUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:147

#### Parameters

##### walletAddress

`string`

##### lovelace

`number`

##### providedUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getAddressUtxosWithMinLovelace`

***

### getAddressUtxosWithToken()

> `protected` **getAddressUtxosWithToken**(`walletAddress`, `assetHex`, `userUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:164

#### Parameters

##### walletAddress

`string`

##### assetHex

`string`

##### userUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getAddressUtxosWithToken`

***

### getScriptAddress()

> **getScriptAddress**(`scriptCbor`): `string`

Defined in: mesh-contract/src/common.ts:69

#### Parameters

##### scriptCbor

`string`

#### Returns

`string`

#### Inherited from

`MeshTxInitiator.getScriptAddress`

***

### getScriptCbor()

> **getScriptCbor**(): `string`

Defined in: mesh-contract/src/hello-world/offchain.ts:31

#### Returns

`string`

***

### getUtxoByTxHash()

> **getUtxoByTxHash**(`txHash`): `Promise`\<`undefined` \| `UTxO`\>

Defined in: mesh-contract/src/hello-world/offchain.ts:84

#### Parameters

##### txHash

`string`

#### Returns

`Promise`\<`undefined` \| `UTxO`\>

***

### getWalletCollateral()

> `protected` **getWalletCollateral**(): `Promise`\<`undefined` \| `UTxO`\>

Defined in: mesh-contract/src/common.ts:107

#### Returns

`Promise`\<`undefined` \| `UTxO`\>

#### Inherited from

`MeshTxInitiator.getWalletCollateral`

***

### getWalletDappAddress()

> `protected` **getWalletDappAddress**(): `Promise`\<`undefined` \| `string`\>

Defined in: mesh-contract/src/common.ts:93

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Inherited from

`MeshTxInitiator.getWalletDappAddress`

***

### getWalletInfoForTx()

> `protected` **getWalletInfoForTx**(): `Promise`\<\{ `collateral`: `UTxO`; `utxos`: `UTxO`[]; `walletAddress`: `string`; \}\>

Defined in: mesh-contract/src/common.ts:181

#### Returns

`Promise`\<\{ `collateral`: `UTxO`; `utxos`: `UTxO`[]; `walletAddress`: `string`; \}\>

#### Inherited from

`MeshTxInitiator.getWalletInfoForTx`

***

### getWalletUtxosWithMinLovelace()

> `protected` **getWalletUtxosWithMinLovelace**(`lovelace`, `providedUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:115

#### Parameters

##### lovelace

`number`

##### providedUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getWalletUtxosWithMinLovelace`

***

### getWalletUtxosWithToken()

> `protected` **getWalletUtxosWithToken**(`assetHex`, `userUtxos`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:131

#### Parameters

##### assetHex

`string`

##### userUtxos

`UTxO`[] = `[]`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.getWalletUtxosWithToken`

***

### lockAsset()

> **lockAsset**(`assets`): `Promise`\<`string`\>

Defined in: mesh-contract/src/hello-world/offchain.ts:40

#### Parameters

##### assets

`Asset`[]

#### Returns

`Promise`\<`string`\>

***

### queryUtxos()

> `protected` **queryUtxos**(`walletAddress`): `Promise`\<`UTxO`[]\>

Defined in: mesh-contract/src/common.ts:85

#### Parameters

##### walletAddress

`string`

#### Returns

`Promise`\<`UTxO`[]\>

#### Inherited from

`MeshTxInitiator.queryUtxos`

***

### signSubmitReset()

> `protected` **signSubmitReset**(): `Promise`\<`undefined` \| `string`\>

Defined in: mesh-contract/src/common.ts:78

#### Returns

`Promise`\<`undefined` \| `string`\>

#### Inherited from

`MeshTxInitiator.signSubmitReset`

***

### unlockAsset()

> **unlockAsset**(`scriptUtxo`, `message`): `Promise`\<`string`\>

Defined in: mesh-contract/src/hello-world/offchain.ts:54

#### Parameters

##### scriptUtxo

`UTxO`

##### message

`string`

#### Returns

`Promise`\<`string`\>
