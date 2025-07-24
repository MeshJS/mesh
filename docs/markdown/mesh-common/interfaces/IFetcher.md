[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IFetcher

# Interface: IFetcher

Defined in: interfaces/fetcher.ts:26

Fetcher interface defines end points to query blockchain data.

## Methods

### fetchAccountInfo()

> **fetchAccountInfo**(`address`): `Promise`\<[`AccountInfo`](../type-aliases/AccountInfo.md)\>

Defined in: interfaces/fetcher.ts:27

#### Parameters

##### address

`string`

#### Returns

`Promise`\<[`AccountInfo`](../type-aliases/AccountInfo.md)\>

***

### fetchAddressTxs()

> **fetchAddressTxs**(`address`, `options?`): `Promise`\<[`TransactionInfo`](../type-aliases/TransactionInfo.md)[]\>

Defined in: interfaces/fetcher.ts:29

#### Parameters

##### address

`string`

##### options?

[`IFetcherOptions`](../type-aliases/IFetcherOptions.md)

#### Returns

`Promise`\<[`TransactionInfo`](../type-aliases/TransactionInfo.md)[]\>

***

### fetchAddressUTxOs()

> **fetchAddressUTxOs**(`address`, `asset?`): `Promise`\<[`UTxO`](../type-aliases/UTxO.md)[]\>

Defined in: interfaces/fetcher.ts:28

#### Parameters

##### address

`string`

##### asset?

`string`

#### Returns

`Promise`\<[`UTxO`](../type-aliases/UTxO.md)[]\>

***

### fetchAssetAddresses()

> **fetchAssetAddresses**(`asset`): `Promise`\<`object`[]\>

Defined in: interfaces/fetcher.ts:33

#### Parameters

##### asset

`string`

#### Returns

`Promise`\<`object`[]\>

***

### fetchAssetMetadata()

> **fetchAssetMetadata**(`asset`): `Promise`\<`any`\>

Defined in: interfaces/fetcher.ts:36

#### Parameters

##### asset

`string`

#### Returns

`Promise`\<`any`\>

***

### fetchBlockInfo()

> **fetchBlockInfo**(`hash`): `Promise`\<[`BlockInfo`](../type-aliases/BlockInfo.md)\>

Defined in: interfaces/fetcher.ts:37

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<[`BlockInfo`](../type-aliases/BlockInfo.md)\>

***

### fetchCollectionAssets()

> **fetchCollectionAssets**(`policyId`, `cursor?`): `Promise`\<\{ `assets`: [`Asset`](../type-aliases/Asset.md)[]; `next?`: `null` \| `string` \| `number`; \}\>

Defined in: interfaces/fetcher.ts:38

#### Parameters

##### policyId

`string`

##### cursor?

`string` | `number`

#### Returns

`Promise`\<\{ `assets`: [`Asset`](../type-aliases/Asset.md)[]; `next?`: `null` \| `string` \| `number`; \}\>

***

### fetchGovernanceProposal()

> **fetchGovernanceProposal**(`txHash`, `certIndex`): `Promise`\<[`GovernanceProposalInfo`](../type-aliases/GovernanceProposalInfo.md)\>

Defined in: interfaces/fetcher.ts:45

#### Parameters

##### txHash

`string`

##### certIndex

`number`

#### Returns

`Promise`\<[`GovernanceProposalInfo`](../type-aliases/GovernanceProposalInfo.md)\>

***

### fetchProtocolParameters()

> **fetchProtocolParameters**(`epoch`): `Promise`\<[`Protocol`](../type-aliases/Protocol.md)\>

Defined in: interfaces/fetcher.ts:42

#### Parameters

##### epoch

`number`

#### Returns

`Promise`\<[`Protocol`](../type-aliases/Protocol.md)\>

***

### fetchTxInfo()

> **fetchTxInfo**(`hash`): `Promise`\<[`TransactionInfo`](../type-aliases/TransactionInfo.md)\>

Defined in: interfaces/fetcher.ts:43

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<[`TransactionInfo`](../type-aliases/TransactionInfo.md)\>

***

### fetchUTxOs()

> **fetchUTxOs**(`hash`, `index?`): `Promise`\<[`UTxO`](../type-aliases/UTxO.md)[]\>

Defined in: interfaces/fetcher.ts:44

#### Parameters

##### hash

`string`

##### index?

`number`

#### Returns

`Promise`\<[`UTxO`](../type-aliases/UTxO.md)[]\>

***

### get()

> **get**(`url`): `Promise`\<`any`\>

Defined in: interfaces/fetcher.ts:49

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`any`\>
