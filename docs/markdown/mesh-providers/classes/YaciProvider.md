[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / YaciProvider

# Class: YaciProvider

Defined in: yaci.ts:45

Yaci DevKit is a development tool designed for rapid and efficient Cardano blockchain development. It allows developers to create and destroy custom Cardano devnets in seconds, providing fast feedback loops and simplifying the iteration process.

Get started:
```typescript
import { YaciProvider } from "@meshsdk/core";
const provider = new YaciProvider('<YACI_URL>', '<OPTIONAL_ADMIN_URL>');
```

## Implements

- `IFetcher`
- `IListener`
- `ISubmitter`
- `IEvaluator`

## Constructors

### Constructor

> **new YaciProvider**(`baseUrl`, `adminUrl?`): `YaciProvider`

Defined in: yaci.ts:55

Set the URL of the instance.

#### Parameters

##### baseUrl

`string` = `"https://yaci-node.meshjs.dev/api/v1/"`

The base URL of the instance.

##### adminUrl?

`string`

#### Returns

`YaciProvider`

## Methods

### addressTopup()

> **addressTopup**(`address`, `amount`): `Promise`\<`void`\>

Defined in: yaci.ts:621

Topup address with ADA

#### Parameters

##### address

`string`

Address to topup

##### amount

`string`

Amount to topup

#### Returns

`Promise`\<`void`\>

***

### evaluateTx()

> **evaluateTx**(`txHex`): `Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

Defined in: yaci.ts:543

Evaluates the resources required to execute the transaction

#### Parameters

##### txHex

`string`

#### Returns

`Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

#### Implementation of

`IEvaluator.evaluateTx`

***

### fetchAccountInfo()

> **fetchAccountInfo**(`address`): `Promise`\<`AccountInfo`\>

Defined in: yaci.ts:73

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

Defined in: yaci.ts:158

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

Defined in: yaci.ts:210

Unimplemented - open for contribution

Transactions for an address. The `TransactionInfo` would only return the `hash`, `inputs`, and `outputs`.

#### Parameters

##### address

`string`

The address to fetch transactions for

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

Defined in: yaci.ts:171

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

Defined in: yaci.ts:222

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

Defined in: yaci.ts:254

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

Defined in: yaci.ts:277

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

> **fetchCollectionAssets**(`policyId`, `cursor`): `Promise`\<\{ `assets`: `Asset`[]; `next`: `null` \| `string` \| `number`; \}\>

Defined in: yaci.ts:312

Fetches the list of assets for a given policy ID.

#### Parameters

##### policyId

`string`

The policy ID to fetch assets for

##### cursor

`number` = `1`

The cursor for pagination

#### Returns

`Promise`\<\{ `assets`: `Asset`[]; `next`: `null` \| `string` \| `number`; \}\>

The list of assets and the next cursor

#### Implementation of

`IFetcher.fetchCollectionAssets`

***

### fetchGovernanceProposal()

> **fetchGovernanceProposal**(`txHash`, `certIndex`): `Promise`\<`GovernanceProposalInfo`\>

Defined in: yaci.ts:463

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

Defined in: yaci.ts:336

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`object`\>

***

### fetchHandleAddress()

> **fetchHandleAddress**(`handle`): `Promise`\<`string`\>

Defined in: yaci.ts:340

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`string`\>

***

### fetchProtocolParameters()

> **fetchProtocolParameters**(`epoch`): `Promise`\<`Protocol`\>

Defined in: yaci.ts:360

Fetch the latest protocol parameters.

#### Parameters

##### epoch

`number` = `Number.NaN`

Optional - The epoch to fetch protocol parameters for

#### Returns

`Promise`\<`Protocol`\>

- Protocol parameters

#### Implementation of

`IFetcher.fetchProtocolParameters`

***

### fetchTxInfo()

> **fetchTxInfo**(`hash`): `Promise`\<`TransactionInfo`\>

Defined in: yaci.ts:401

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

Defined in: yaci.ts:430

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

Defined in: yaci.ts:470

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`any`\>

#### Implementation of

`IFetcher.get`

***

### getDevnetInfo()

> **getDevnetInfo**(): `Promise`\<`void`\>

Defined in: yaci.ts:582

#### Returns

`Promise`\<`void`\>

***

### getGenesisByEra()

> **getGenesisByEra**(`era`): `Promise`\<`void`\>

Defined in: yaci.ts:599

#### Parameters

##### era

`string`

#### Returns

`Promise`\<`void`\>

***

### onTxConfirmed()

> **onTxConfirmed**(`txHash`, `callback`, `limit`): `void`

Defined in: yaci.ts:488

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

### submitTx()

> **submitTx**(`txHex`): `Promise`\<`string`\>

Defined in: yaci.ts:518

Submit a serialized transaction to the network.

#### Parameters

##### txHex

`string`

#### Returns

`Promise`\<`string`\>

The transaction hash of the submitted transaction

#### Implementation of

`ISubmitter.submitTx`
