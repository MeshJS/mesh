[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / MaestroProvider

# Class: MaestroProvider

Defined in: maestro.ts:46

## Implements

- `IFetcher`
- `ISubmitter`
- `IEvaluator`
- `IListener`

## Constructors

### Constructor

> **new MaestroProvider**(`__namedParameters`): `MaestroProvider`

Defined in: maestro.ts:59

#### Parameters

##### \_\_namedParameters

`MaestroConfig`

#### Returns

`MaestroProvider`

## Properties

### submitUrl

> **submitUrl**: `string`

Defined in: maestro.ts:57

## Methods

### evaluateTx()

> **evaluateTx**(`cbor`): `Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

Defined in: maestro.ts:72

Evaluates the resources required to execute the transaction

#### Parameters

##### cbor

`string`

#### Returns

`Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

#### Implementation of

`IEvaluator.evaluateTx`

***

### fetchAccountInfo()

> **fetchAccountInfo**(`address`): `Promise`\<`AccountInfo`\>

Defined in: maestro.ts:104

Obtain information about a specific stake account.

#### Parameters

##### address

`string`

Wallet address to fetch account information

#### Returns

`Promise`\<`AccountInfo`\>

#### Implementation of

`IFetcher.fetchAccountInfo`

***

### fetchAddressAssets()

> **fetchAddressAssets**(`address`): `Promise`\<\{[`key`: `string`]: `string`; \}\>

Defined in: maestro.ts:136

Fetches the assets for a given address.

#### Parameters

##### address

`string`

The address to fetch assets for

#### Returns

`Promise`\<\{[`key`: `string`]: `string`; \}\>

A map of asset unit to quantity

***

### fetchAddressTxs()

> **fetchAddressTxs**(`address`, `option`): `Promise`\<`TransactionInfo`[]\>

Defined in: maestro.ts:195

Unimplemented - open for contribution

Transactions for an address. The `TransactionInfo` would only return the `hash`, `inputs`, and `outputs`.

#### Parameters

##### address

`string`

##### option

`IFetcherOptions` = `...`

#### Returns

`Promise`\<`TransactionInfo`[]\>

- partial TransactionInfo

#### Implementation of

`IFetcher.fetchAddressTxs`

***

### fetchAddressUTxOs()

> **fetchAddressUTxOs**(`address`, `asset?`): `Promise`\<`UTxO`[]\>

Defined in: maestro.ts:149

UTXOs of the address.

#### Parameters

##### address

`string`

The address to fetch UTXO

##### asset?

`string`

UTXOs of a given asset​

#### Returns

`Promise`\<`UTxO`[]\>

- Array of UTxOs

#### Implementation of

`IFetcher.fetchAddressUTxOs`

***

### fetchAssetAddresses()

> **fetchAssetAddresses**(`asset`): `Promise`\<`object`[]\>

Defined in: maestro.ts:207

Fetches the asset addresses for a given asset.

#### Parameters

##### asset

`string`

The asset to fetch addresses for

#### Returns

`Promise`\<`object`[]\>

#### Implementation of

`IFetcher.fetchAssetAddresses`

***

### fetchAssetMetadata()

> **fetchAssetMetadata**(`asset`): `Promise`\<`any`\>

Defined in: maestro.ts:253

Fetches the metadata for a given asset.

#### Parameters

##### asset

`string`

The asset to fetch metadata for

#### Returns

`Promise`\<`any`\>

The metadata for the asset

#### Implementation of

`IFetcher.fetchAssetMetadata`

***

### fetchBlockInfo()

> **fetchBlockInfo**(`hash`): `Promise`\<`BlockInfo`\>

Defined in: maestro.ts:282

Fetches the block information for a given block hash.

#### Parameters

##### hash

`string`

The block hash to fetch from

#### Returns

`Promise`\<`BlockInfo`\>

The block information

#### Implementation of

`IFetcher.fetchBlockInfo`

***

### fetchCollectionAssets()

> **fetchCollectionAssets**(`policyId`, `cursor?`): `Promise`\<\{ `assets`: `Asset`[]; `next`: `null` \| `string` \| `number`; \}\>

Defined in: maestro.ts:322

Fetches the list of assets for a given policy ID.

#### Parameters

##### policyId

`string`

The policy ID to fetch assets for

##### cursor?

`string`

The cursor for pagination

#### Returns

`Promise`\<\{ `assets`: `Asset`[]; `next`: `null` \| `string` \| `number`; \}\>

The list of assets and the next cursor

#### Implementation of

`IFetcher.fetchCollectionAssets`

***

### fetchGovernanceProposal()

> **fetchGovernanceProposal**(`txHash`, `certIndex`): `Promise`\<`GovernanceProposalInfo`\>

Defined in: maestro.ts:526

Unimplemented - open for contribution

Fetches the governance proposal information.

#### Parameters

##### txHash

`string`

The transaction hash of the proposal

##### certIndex

`number`

The certificate index of the proposal

#### Returns

`Promise`\<`GovernanceProposalInfo`\>

The governance proposal information

#### Implementation of

`IFetcher.fetchGovernanceProposal`

***

### fetchHandle()

> **fetchHandle**(`handle`): `Promise`\<`object`\>

Defined in: maestro.ts:350

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`object`\>

***

### fetchHandleAddress()

> **fetchHandleAddress**(`handle`): `Promise`\<`string`\>

Defined in: maestro.ts:370

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`string`\>

***

### fetchProtocolParameters()

> **fetchProtocolParameters**(`epoch`): `Promise`\<`Protocol`\>

Defined in: maestro.ts:397

Fetch the latest protocol parameters.

#### Parameters

##### epoch

`number` = `Number.NaN`

#### Returns

`Promise`\<`Protocol`\>

- Protocol parameters

#### Implementation of

`IFetcher.fetchProtocolParameters`

***

### fetchTxInfo()

> **fetchTxInfo**(`hash`): `Promise`\<`TransactionInfo`\>

Defined in: maestro.ts:464

Fetches the transaction information for a given transaction hash.

#### Parameters

##### hash

`string`

The transaction hash to fetch

#### Returns

`Promise`\<`TransactionInfo`\>

The transaction information

#### Implementation of

`IFetcher.fetchTxInfo`

***

### fetchUTxOs()

> **fetchUTxOs**(`hash`, `index?`): `Promise`\<`UTxO`[]\>

Defined in: maestro.ts:496

Get UTxOs for a given hash.

#### Parameters

##### hash

`string`

The transaction hash

##### index?

`number`

Optional - The output index for filtering post fetching

#### Returns

`Promise`\<`UTxO`[]\>

- Array of UTxOs

#### Implementation of

`IFetcher.fetchUTxOs`

***

### get()

> **get**(`url`): `Promise`\<`any`\>

Defined in: maestro.ts:533

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`any`\>

#### Implementation of

`IFetcher.get`

***

### onTxConfirmed()

> **onTxConfirmed**(`txHash`, `callback`, `limit`): `void`

Defined in: maestro.ts:551

Allow you to listen to a transaction confirmation. Upon confirmation, the callback will be called.

#### Parameters

##### txHash

`string`

The transaction hash to listen for confirmation

##### callback

() => `void`

The callback function to call when the transaction is confirmed

##### limit

`number` = `100`

The number of blocks to wait for confirmation

#### Returns

`void`

#### Implementation of

`IListener.onTxConfirmed`

***

### setSubmitTxToBytes()

> **setSubmitTxToBytes**(`value`): `void`

Defined in: maestro.ts:576

#### Parameters

##### value

`boolean`

#### Returns

`void`

***

### submitTx()

> **submitTx**(`tx`): `Promise`\<`string`\>

Defined in: maestro.ts:585

Submit a serialized transaction to the network.

#### Parameters

##### tx

`string`

The serialized transaction in hex to submit

#### Returns

`Promise`\<`string`\>

The transaction hash of the submitted transaction

#### Implementation of

`ISubmitter.submitTx`
