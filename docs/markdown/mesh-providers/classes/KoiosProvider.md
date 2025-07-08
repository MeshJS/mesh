[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / KoiosProvider

# Class: KoiosProvider

Defined in: koios.ts:39

## Implements

- `IFetcher`
- `IListener`
- `ISubmitter`

## Constructors

### Constructor

> **new KoiosProvider**(`baseUrl`): `KoiosProvider`

Defined in: koios.ts:43

#### Parameters

##### baseUrl

`string`

#### Returns

`KoiosProvider`

### Constructor

> **new KoiosProvider**(`network`, `token`, `version?`): `KoiosProvider`

Defined in: koios.ts:44

#### Parameters

##### network

[`KoiosSupportedNetworks`](../type-aliases/KoiosSupportedNetworks.md)

##### token

`string`

##### version?

`number`

#### Returns

`KoiosProvider`

## Methods

### fetchAccountInfo()

> **fetchAccountInfo**(`address`): `Promise`\<`AccountInfo`\>

Defined in: koios.ts:81

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

Defined in: koios.ts:111

Fetches the assets for a given address.

#### Parameters

##### address

`string`

The address to fetch assets for

#### Returns

`Promise`\<\{[`key`: `string`]: `string`; \}\>

A map of asset unit to quantity

***

### fetchAddressTransactions()

> **fetchAddressTransactions**(`address`): `Promise`\<`TransactionInfo`[]\>

Defined in: koios.ts:532

Deprecated, use fetchAddressTxs instead

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`TransactionInfo`[]\>

- partial TransactionInfo

***

### fetchAddressTxs()

> **fetchAddressTxs**(`address`, `option`): `Promise`\<`TransactionInfo`[]\>

Defined in: koios.ts:122

Unimplemented - open for contribution, see blockfrost.ts for reference

#### Parameters

##### address

`string`

##### option

`IFetcherOptions` = `DEFAULT_FETCHER_OPTIONS`

#### Returns

`Promise`\<`TransactionInfo`[]\>

#### Implementation of

`IFetcher.fetchAddressTxs`

***

### fetchAddressUTxOs()

> **fetchAddressUTxOs**(`address`, `asset?`): `Promise`\<`UTxO`[]\>

Defined in: koios.ts:157

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

Defined in: koios.ts:188

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

Defined in: koios.ts:220

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

Defined in: koios.ts:246

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

> **fetchCollectionAssets**(`policyId`): `Promise`\<\{ `assets`: `Asset`[]; \}\>

Defined in: koios.ts:283

Fetches the list of assets for a given policy ID.

#### Parameters

##### policyId

`string`

The policy ID to fetch assets for

#### Returns

`Promise`\<\{ `assets`: `Asset`[]; \}\>

The list of assets and the next cursor

#### Implementation of

`IFetcher.fetchCollectionAssets`

***

### fetchGovernanceProposal()

> **fetchGovernanceProposal**(`txHash`, `certIndex`): `Promise`\<`GovernanceProposalInfo`\>

Defined in: koios.ts:447

#### Parameters

##### txHash

`string`

##### certIndex

`number`

#### Returns

`Promise`\<`GovernanceProposalInfo`\>

#### Implementation of

`IFetcher.fetchGovernanceProposal`

***

### fetchHandle()

> **fetchHandle**(`handle`): `Promise`\<`any`\>

Defined in: koios.ts:303

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`any`\>

***

### fetchHandleAddress()

> **fetchHandleAddress**(`handle`): `Promise`\<`string`\>

Defined in: koios.ts:320

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`string`\>

***

### fetchProtocolParameters()

> **fetchProtocolParameters**(`epoch`): `Promise`\<`Protocol`\>

Defined in: koios.ts:345

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

Defined in: koios.ts:391

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

Defined in: koios.ts:422

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

Defined in: koios.ts:459

A generic method to fetch data from a URL.

#### Parameters

##### url

`string`

The URL to fetch data from

#### Returns

`Promise`\<`any`\>

- The data fetched from the URL

#### Implementation of

`IFetcher.get`

***

### onTxConfirmed()

> **onTxConfirmed**(`txHash`, `callback`, `limit`): `void`

Defined in: koios.ts:502

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

### post()

> **post**(`url`, `body`, `headers`): `Promise`\<`any`\>

Defined in: koios.ts:478

A generic method to post data to a URL.

#### Parameters

##### url

`string`

The URL to fetch data from

##### body

`any`

Payload

##### headers

Specify headers, default: { "Content-Type": "application/json" }

###### Content-Type

`string` = `"application/json"`

#### Returns

`Promise`\<`any`\>

- Data

***

### submitTx()

> **submitTx**(`tx`): `Promise`\<`string`\>

Defined in: koios.ts:541

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
