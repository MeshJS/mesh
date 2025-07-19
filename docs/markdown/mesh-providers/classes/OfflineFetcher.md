[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / OfflineFetcher

# Class: OfflineFetcher

Defined in: offline/offline-fetcher.ts:65

OfflineFetcher implements the IFetcher interface to provide offline access to blockchain data.
This class allows working with pre-loaded blockchain data without requiring network connectivity.
It's useful for testing, development, and scenarios where offline operation is needed.

The class maintains internal storage for various blockchain data types:
- Account information
- UTXOs (Unspent Transaction Outputs)
- Asset addresses and metadata
- Block information
- Protocol parameters
- Transaction information

Example usage:
```typescript
import { OfflineFetcher } from '@meshsdk/core';

// Create a new instance
const fetcher = new OfflineFetcher();
//or const fetcher = new OfflineFetcher("mainnet");

// Add some blockchain data
fetcher.addAccount(address, accountInfo);
fetcher.addUTxOs(utxos);
fetcher.addSerializedTransaction("txHash");

// Use the fetcher with MeshWallet
const wallet = new MeshWallet({
  networkId: 0,
  fetcher: fetcher,
  key: {
    type: 'address',
    address: walletAddress
  }
});
```

## Implements

- `IFetcher`

## Constructors

### Constructor

> **new OfflineFetcher**(`network?`): `OfflineFetcher`

Defined in: offline/offline-fetcher.ts:75

#### Parameters

##### network?

`"testnet"` | `"preview"` | `"preprod"` | `"mainnet"`

#### Returns

`OfflineFetcher`

## Methods

### addAccount()

> **addAccount**(`address`, `accountInfo`): `void`

Defined in: offline/offline-fetcher.ts:482

Adds account information to the fetcher.

#### Parameters

##### address

`string`

Account address

##### accountInfo

`AccountInfo`

Account information

#### Returns

`void`

#### Throws

Error if address or account info invalid

***

### addAssetAddresses()

> **addAssetAddresses**(`asset`, `addresses`): `void`

Defined in: offline/offline-fetcher.ts:611

Adds asset address information to the fetcher.

#### Parameters

##### asset

`string`

Asset identifier

##### addresses

`AssetAddress`[]

Array of asset addresses

#### Returns

`void`

#### Throws

Error if asset or addresses invalid

***

### addAssetMetadata()

> **addAssetMetadata**(`asset`, `metadata`): `void`

Defined in: offline/offline-fetcher.ts:639

Adds asset metadata to the fetcher.

#### Parameters

##### asset

`string`

Asset identifier

##### metadata

`any`

Asset metadata

#### Returns

`void`

#### Throws

Error if asset or metadata invalid

***

### addBlock()

> **addBlock**(`blockInfo`): `void`

Defined in: offline/offline-fetcher.ts:862

Adds block information to the fetcher.

#### Parameters

##### blockInfo

`BlockInfo`

Block information

#### Returns

`void`

#### Throws

Error if block info invalid

***

### addCollectionAssets()

> **addCollectionAssets**(`assets`): `void`

Defined in: offline/offline-fetcher.ts:660

Adds collection assets to the fetcher.

#### Parameters

##### assets

`Asset`[]

Array of assets

#### Returns

`void`

#### Throws

Error if assets invalid

***

### addProtocolParameters()

> **addProtocolParameters**(`parameters`): `void`

Defined in: offline/offline-fetcher.ts:714

Adds protocol parameters to the fetcher.

#### Parameters

##### parameters

`Protocol`

Protocol parameters

#### Returns

`void`

#### Throws

Error if parameters invalid

***

### addSerializedTransaction()

> **addSerializedTransaction**(`txHex`): `void`

Defined in: offline/offline-fetcher.ts:918

Adds a serialized transaction to the fetcher, it's generates pseudo block in addition to transaction.
Removes spent UTxOs from the fetcher and adds new UTxOs from the transaction.

#### Parameters

##### txHex

`string`

Hexadecimal string of the transaction

#### Returns

`void`

#### Throws

Error if transaction hex invalid

***

### addTransaction()

> **addTransaction**(`txInfo`): `void`

Defined in: offline/offline-fetcher.ts:809

Adds transaction information to the fetcher.

#### Parameters

##### txInfo

`TransactionInfo`

Transaction information

#### Returns

`void`

#### Throws

Error if transaction info invalid

***

### addUTxOs()

> **addUTxOs**(`utxos`): `void`

Defined in: offline/offline-fetcher.ts:517

Adds UTXOs to the fetcher.

#### Parameters

##### utxos

`UTxO`[]

Array of UTXOs

#### Returns

`void`

#### Throws

Error if UTXOs invalid

***

### fetchAccountInfo()

> **fetchAccountInfo**(`address`): `Promise`\<`AccountInfo`\>

Defined in: offline/offline-fetcher.ts:97

Fetches account information for a given address.

#### Parameters

##### address

`string`

Address to fetch info for

#### Returns

`Promise`\<`AccountInfo`\>

Promise resolving to account information

#### Throws

Error if account not found

#### Implementation of

`IFetcher.fetchAccountInfo`

***

### fetchAddressAssets()

> **fetchAddressAssets**(`address`): `Promise`\<`Asset`[]\>

Defined in: offline/offline-fetcher.ts:175

Fetches all assets associated with an address.

#### Parameters

##### address

`string`

Address to fetch assets for

#### Returns

`Promise`\<`Asset`[]\>

Promise resolving to array of assets held by the address

***

### fetchAddressTxs()

> **fetchAddressTxs**(`address`, `options?`): `Promise`\<`TransactionInfo`[]\>

Defined in: offline/offline-fetcher.ts:123

WIP - NOT IMPLEMENTED

#### Parameters

##### address

`string`

##### options?

`IFetcherOptions`

#### Returns

`Promise`\<`TransactionInfo`[]\>

#### Implementation of

`IFetcher.fetchAddressTxs`

***

### fetchAddressUTxOs()

> **fetchAddressUTxOs**(`address`, `asset?`): `Promise`\<`UTxO`[]\>

Defined in: offline/offline-fetcher.ts:109

Fetches UTXOs for a given address, optionally filtered by asset.

#### Parameters

##### address

`string`

Address to fetch UTXOs for

##### asset?

`string`

Optional asset ID to filter UTXOs

#### Returns

`Promise`\<`UTxO`[]\>

Promise resolving to array of UTXOs

#### Implementation of

`IFetcher.fetchAddressUTxOs`

***

### fetchAssetAddresses()

> **fetchAssetAddresses**(`asset`): `Promise`\<`AssetAddress`[]\>

Defined in: offline/offline-fetcher.ts:135

Fetches addresses holding a specific asset.

#### Parameters

##### asset

`string`

Asset identifier

#### Returns

`Promise`\<`AssetAddress`[]\>

Promise resolving to array of asset addresses and quantities

#### Implementation of

`IFetcher.fetchAssetAddresses`

***

### fetchAssetMetadata()

> **fetchAssetMetadata**(`asset`): `Promise`\<`any`\>

Defined in: offline/offline-fetcher.ts:215

Fetches metadata for a specific asset.

#### Parameters

##### asset

`string`

Asset identifier

#### Returns

`Promise`\<`any`\>

Promise resolving to asset metadata

#### Throws

Error if asset metadata not found

#### Implementation of

`IFetcher.fetchAssetMetadata`

***

### fetchBlockInfo()

> **fetchBlockInfo**(`hash`): `Promise`\<`BlockInfo`\>

Defined in: offline/offline-fetcher.ts:227

Fetches information about a specific block.

#### Parameters

##### hash

`string`

Block hash

#### Returns

`Promise`\<`BlockInfo`\>

Promise resolving to block information

#### Throws

Error if block not found

#### Implementation of

`IFetcher.fetchBlockInfo`

***

### fetchCollectionAssets()

> **fetchCollectionAssets**(`policyId`, `cursor?`): `Promise`\<\{ `assets`: `Asset`[]; `next?`: `string` \| `number`; \}\>

Defined in: offline/offline-fetcher.ts:240

Fetches assets in a collection (by policy ID) with pagination.

#### Parameters

##### policyId

`string`

Policy ID of the collection

##### cursor?

Optional pagination cursor

`string` | `number`

#### Returns

`Promise`\<\{ `assets`: `Asset`[]; `next?`: `string` \| `number`; \}\>

Promise resolving to paginated assets and next cursor

#### Throws

Error if collection not found or invalid cursor

#### Implementation of

`IFetcher.fetchCollectionAssets`

***

### fetchGovernanceProposal()

> **fetchGovernanceProposal**(`txHash`, `certIndex`): `Promise`\<`any`\>

Defined in: offline/offline-fetcher.ts:336

#### Parameters

##### txHash

`string`

##### certIndex

`number`

#### Returns

`Promise`\<`any`\>

#### Implementation of

`IFetcher.fetchGovernanceProposal`

***

### fetchHandle()

> **fetchHandle**(`handle`): `Promise`\<`any`\>

Defined in: offline/offline-fetcher.ts:261

Fetches metadata for a handle.

#### Parameters

##### handle

`string`

Handle to fetch metadata for

#### Returns

`Promise`\<`any`\>

Promise resolving to handle metadata

#### Throws

Error if handle not found or invalid

***

### fetchHandleAddress()

> **fetchHandleAddress**(`handle`): `Promise`\<`string`\>

Defined in: offline/offline-fetcher.ts:277

Fetches address associated with a handle.

#### Parameters

##### handle

`string`

Handle to fetch address for

#### Returns

`Promise`\<`string`\>

Promise resolving to address

#### Throws

Error if no address found for handle

***

### fetchProtocolParameters()

> **fetchProtocolParameters**(`epoch?`): `Promise`\<`Protocol`\>

Defined in: offline/offline-fetcher.ts:296

Fetches protocol parameters for a specific epoch.

#### Parameters

##### epoch?

`number`

Epoch number

#### Returns

`Promise`\<`Protocol`\>

Promise resolving to protocol parameters

#### Throws

Error if parameters not found for epoch

#### Implementation of

`IFetcher.fetchProtocolParameters`

***

### fetchTxInfo()

> **fetchTxInfo**(`hash`): `Promise`\<`TransactionInfo`\>

Defined in: offline/offline-fetcher.ts:315

Fetches information about a specific transaction.

#### Parameters

##### hash

`string`

Transaction hash

#### Returns

`Promise`\<`TransactionInfo`\>

Promise resolving to transaction information

#### Throws

Error if transaction not found

#### Implementation of

`IFetcher.fetchTxInfo`

***

### fetchUTxOs()

> **fetchUTxOs**(`hash`): `Promise`\<`UTxO`[]\>

Defined in: offline/offline-fetcher.ts:327

Fetches all UTXOs associated with a specific transaction hash.

#### Parameters

##### hash

`string`

Transaction hash to fetch UTXOs for

#### Returns

`Promise`\<`UTxO`[]\>

Promise resolving to array of UTXOs associated with the transaction

#### Throws

Error if no UTXOs found for the transaction hash

#### Implementation of

`IFetcher.fetchUTxOs`

***

### get()

> **get**(`url`): `Promise`\<`any`\>

Defined in: offline/offline-fetcher.ts:348

HTTP GET method required by IFetcher interface but not implemented in OfflineFetcher.

#### Parameters

##### url

`string`

URL to fetch from

#### Returns

`Promise`\<`any`\>

#### Throws

Error always, as this fetcher operates offline

#### Implementation of

`IFetcher.get`

***

### toJSON()

> **toJSON**(): `string`

Defined in: offline/offline-fetcher.ts:356

Serializes fetcher data to JSON string.

#### Returns

`string`

JSON string containing all fetcher data

***

### fromJSON()

> `static` **fromJSON**(`json`): `OfflineFetcher`

Defined in: offline/offline-fetcher.ts:374

Creates an OfflineFetcher instance from JSON data.

#### Parameters

##### json

`string`

JSON string containing fetcher data

#### Returns

`OfflineFetcher`

New OfflineFetcher instance
