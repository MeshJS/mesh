[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / U5CProvider

# Class: U5CProvider

Defined in: utxo-rpc.ts:118

A UTxO RPC Provider for [MeshJS](https://meshjs.dev/) Transaction Builder Library.

Example usage of how to use the UTxO RPC provider with Mesh to build and submit a transaction.
```
// Step #1
// Import Mesh SDK and UTxO RPC provider
import { Transaction, MeshWallet, U5CProvider } from "@meshsdk/core";

async function main() {
  // Step #2
  // Create a new U5C provider
  const provider = new U5CProvider({
    url: "http://localhost:50051",
    headers: {
      "dmtr-api-key": "<api-key>",
    },
  });

  // Step #3
  // Create a new wallet from a mnemonic
  const wallet = new MeshWallet({
    networkId: 0, // 0: testnet, 1: mainnet
    fetcher: provider,
    submitter: provider,
    key: {
      type: "mnemonic",
      words: [
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
        "solution",
      ],
    },
  });

  // Optional: Print the wallet address
  console.log(wallet.getChangeAddress());

  // Optional: Print the wallet utxos
  console.log(await provider.fetchAddressUTxOs(wallet.getChangeAddress()));

  // Step #4
  // Create an example transaction that sends 5 ADA to an address
  const tx = new Transaction({
    initiator: wallet,
    verbose: false,
  }).sendLovelace(
    "addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr",
    "5000000"
  );
  const unsignedTx = await tx.build();

  // Step #5
  // Sign the transaction
  const signedTx = await wallet.signTx(unsignedTx);

  // Step #6
  // Submit the transaction to the blockchain network
  const txId = await provider.submitTx(signedTx);

  // Optional: Print the transaction ID
  console.log("Transaction ID", txId);
}

main().catch(console.error);
```

## Implements

- `IFetcher`
- `ISubmitter`
- `IEvaluator`
- `IListener`

## Constructors

### Constructor

> **new U5CProvider**(`__namedParameters`): `U5CProvider`

Defined in: utxo-rpc.ts:129

Constructor initializes the query and submit clients with provided URL and optional headers.

#### Parameters

##### \_\_namedParameters

###### headers?

`Record`\<`string`, `string`\>

###### url

`string`

#### Returns

`U5CProvider`

## Methods

### awaitTransactionConfirmation()

> **awaitTransactionConfirmation**(`txId`, `timeout?`): `Promise`\<`boolean`\>

Defined in: utxo-rpc.ts:419

Waits for transaction confirmation within a given timeout.

#### Parameters

##### txId

`string`

The transaction hash.

##### timeout?

`number`

Optional timeout in milliseconds.

#### Returns

`Promise`\<`boolean`\>

True if the transaction is confirmed within the timeout, otherwise false.

***

### evaluateTx()

> **evaluateTx**(`tx`): `Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

Defined in: utxo-rpc.ts:179

Evaluates the resources required to execute the transaction

#### Parameters

##### tx

`string`

The transaction to evaluate

#### Returns

`Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

#### Implementation of

`IEvaluator.evaluateTx`

***

### fetchAccountInfo()

> **fetchAccountInfo**(`address`): `Promise`\<`AccountInfo`\>

Defined in: utxo-rpc.ts:223

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

Defined in: utxo-rpc.ts:227

#### Parameters

##### address

`string`

#### Returns

`Promise`\<\{[`key`: `string`]: `string`; \}\>

***

### fetchAddressTxs()

> **fetchAddressTxs**(`address`, `option`): `Promise`\<`TransactionInfo`[]\>

Defined in: utxo-rpc.ts:274

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

Defined in: utxo-rpc.ts:240

Fetches the UTxOs for a given address.

#### Parameters

##### address

`string`

The address to fetch UTxOs for

##### asset?

`string`

The asset to filter UTxOs by (optional)

#### Returns

`Promise`\<`UTxO`[]\>

UTxOs for the given address

#### Implementation of

`IFetcher.fetchAddressUTxOs`

***

### fetchAssetAddresses()

> **fetchAssetAddresses**(`asset`): `Promise`\<`object`[]\>

Defined in: utxo-rpc.ts:288

Unimplemented - open for contribution

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

Defined in: utxo-rpc.ts:300

Unimplemented - open for contribution

Fetches the metadata for a given asset.

#### Parameters

##### asset

`string`

The asset to fetch metadata for

#### Returns

`Promise`\<`any`\>

#### Implementation of

`IFetcher.fetchAssetMetadata`

***

### fetchBlockInfo()

> **fetchBlockInfo**(`hash`): `Promise`\<`BlockInfo`\>

Defined in: utxo-rpc.ts:310

Unimplemented - open for contribution

Fetches the block information for a given block hash.

#### Parameters

##### hash

`string`

The block hash to fetch block information for

#### Returns

`Promise`\<`BlockInfo`\>

#### Implementation of

`IFetcher.fetchBlockInfo`

***

### fetchCollectionAssets()

> **fetchCollectionAssets**(`policyId`, `cursor?`): `Promise`\<\{ `assets`: `Asset`[]; `next?`: `null` \| `string` \| `number`; \}\>

Defined in: utxo-rpc.ts:321

Unimplemented - open for contribution

Fetches the collection assets for a given policy ID.

#### Parameters

##### policyId

`string`

The policy ID to fetch collection assets for

##### cursor?

The cursor to fetch the next set of assets (optional)

`string` | `number`

#### Returns

`Promise`\<\{ `assets`: `Asset`[]; `next?`: `null` \| `string` \| `number`; \}\>

#### Implementation of

`IFetcher.fetchCollectionAssets`

***

### fetchGovernanceProposal()

> **fetchGovernanceProposal**(`txHash`, `certIndex`): `Promise`\<`GovernanceProposalInfo`\>

Defined in: utxo-rpc.ts:397

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

Defined in: utxo-rpc.ts:334

Unimplemented - open for contribution

Fetches the information (AssetMetadata) for a given handle.

#### Parameters

##### handle

`string`

The handle to fetch information for

#### Returns

`Promise`\<`object`\>

***

### fetchHandleAddress()

> **fetchHandleAddress**(`handle`): `Promise`\<`string`\>

Defined in: utxo-rpc.ts:344

Unimplemented - open for contribution

Resolve the handle's address from the handle.

#### Parameters

##### handle

`string`

The handle to resolve

#### Returns

`Promise`\<`string`\>

***

### fetchProtocolParameters()

> **fetchProtocolParameters**(`epoch`): `Promise`\<`Protocol`\>

Defined in: utxo-rpc.ts:353

Unimplemented - open for contribution

Fetches protocol parameters

#### Parameters

##### epoch

`number` = `Number.NaN`

#### Returns

`Promise`\<`Protocol`\>

#### Implementation of

`IFetcher.fetchProtocolParameters`

***

### fetchTxInfo()

> **fetchTxInfo**(`hash`): `Promise`\<`TransactionInfo`\>

Defined in: utxo-rpc.ts:367

Unimplemented - open for contribution

Fetches transaction info for a given hash.

#### Parameters

##### hash

`string`

The transaction hash

#### Returns

`Promise`\<`TransactionInfo`\>

#### Implementation of

`IFetcher.fetchTxInfo`

***

### fetchUTxOs()

> **fetchUTxOs**(`hash`, `index?`): `Promise`\<`UTxO`[]\>

Defined in: utxo-rpc.ts:377

Not complete - open for contribution

Fetches output UTxOs of a given transaction hash.

#### Parameters

##### hash

`string`

The transaction hash

##### index?

`number`

#### Returns

`Promise`\<`UTxO`[]\>

#### Implementation of

`IFetcher.fetchUTxOs`

***

### get()

> **get**(`url`): `Promise`\<`any`\>

Defined in: utxo-rpc.ts:409

Unimplemented - open for contribution

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

Defined in: utxo-rpc.ts:153

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

> **submitTx**(`tx`): `Promise`\<`string`\>

Defined in: utxo-rpc.ts:213

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
