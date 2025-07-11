[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / MeshWallet

# Class: MeshWallet

Defined in: mesh/index.ts:93

Mesh Wallet provides a set of APIs to interact with the blockchain. This wallet is compatible with Mesh transaction builders.

There are 4 types of keys that can be used to create a wallet:
- root: A private key in bech32 format, generally starts with `xprv1`
- cli: CLI generated keys starts with `5820`. Payment key is required, and the stake key is optional.
- mnemonic: A list of 24 words
- address: A bech32 address that can be used to create a read-only wallet, generally starts with `addr` or `addr_test1`

```javascript
import { MeshWallet, BlockfrostProvider } from '@meshsdk/core';

const provider = new BlockfrostProvider('<BLOCKFROST_API_KEY>');

const wallet = new MeshWallet({
  networkId: 0,
  fetcher: provider,
  submitter: provider,
  key: {
    type: 'mnemonic',
    words: ["solution","solution","solution","solution","solution",","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution","solution"],
  },
});
```

Please call `await wallet.init()` after creating the wallet to fetch the addresses from the wallet.

## Implements

- `IWallet`

## Constructors

### Constructor

> **new MeshWallet**(`options`): `MeshWallet`

Defined in: mesh/index.ts:115

#### Parameters

##### options

[`CreateMeshWalletOptions`](../type-aliases/CreateMeshWalletOptions.md)

#### Returns

`MeshWallet`

## Properties

### addresses

> **addresses**: `object` = `{}`

Defined in: mesh/index.ts:102

#### baseAddress?

> `optional` **baseAddress**: `Address`

#### baseAddressBech32?

> `optional` **baseAddressBech32**: `string`

#### dRepIDBech32?

> `optional` **dRepIDBech32**: `DRepID`

#### dRepIDCip105?

> `optional` **dRepIDCip105**: `string`

#### dRepIDHash?

> `optional` **dRepIDHash**: `Ed25519KeyHashHex`

#### enterpriseAddress?

> `optional` **enterpriseAddress**: `Address`

#### enterpriseAddressBech32?

> `optional` **enterpriseAddressBech32**: `string`

#### pubDRepKey?

> `optional` **pubDRepKey**: `string`

#### rewardAddress?

> `optional` **rewardAddress**: `Address`

#### rewardAddressBech32?

> `optional` **rewardAddressBech32**: `string`

## Methods

### createCollateral()

> **createCollateral**(): `Promise`\<`string`\>

Defined in: mesh/index.ts:631

A helper function to create a collateral input for a transaction.

#### Returns

`Promise`\<`string`\>

a transaction hash

***

### getAddresses()

> **getAddresses**(): `object`

Defined in: mesh/index.ts:185

Returns all derived addresses from the wallet.

#### Returns

`object`

a list of addresses

##### baseAddress?

> `optional` **baseAddress**: `Address`

##### baseAddressBech32?

> `optional` **baseAddressBech32**: `string`

##### dRepIDBech32?

> `optional` **dRepIDBech32**: `DRepID`

##### dRepIDCip105?

> `optional` **dRepIDCip105**: `string`

##### dRepIDHash?

> `optional` **dRepIDHash**: `Ed25519KeyHashHex`

##### enterpriseAddress?

> `optional` **enterpriseAddress**: `Address`

##### enterpriseAddressBech32?

> `optional` **enterpriseAddressBech32**: `string`

##### pubDRepKey?

> `optional` **pubDRepKey**: `string`

##### rewardAddress?

> `optional` **rewardAddress**: `Address`

##### rewardAddressBech32?

> `optional` **rewardAddressBech32**: `string`

***

### getAssets()

> **getAssets**(): `Promise`\<`AssetExtended`[]\>

Defined in: mesh/index.ts:550

A helper function to get the assets in the wallet.

#### Returns

`Promise`\<`AssetExtended`[]\>

a list of assets

#### Implementation of

`IWallet.getAssets`

***

### getBalance()

> **getBalance**(): `Promise`\<`Asset`[]\>

Defined in: mesh/index.ts:196

Returns a list of assets in the wallet. This API will return every assets in the wallet. Each asset is an object with the following properties:
- A unit is provided to display asset's name on the user interface.
- A quantity is provided to display asset's quantity on the user interface.

#### Returns

`Promise`\<`Asset`[]\>

a list of assets and their quantities

#### Implementation of

`IWallet.getBalance`

***

### getChangeAddress()

> **getChangeAddress**(`addressType`): `Promise`\<`string`\>

Defined in: mesh/index.ts:229

Returns an address owned by the wallet that should be used as a change address to return leftover assets during transaction creation back to the connected wallet.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

#### Returns

`Promise`\<`string`\>

an address

#### Implementation of

`IWallet.getChangeAddress`

***

### getCollateral()

> **getCollateral**(`addressType`): `Promise`\<`UTxO`[]\>

Defined in: mesh/index.ts:249

This function shall return a list of one or more UTXOs (unspent transaction outputs) controlled by the wallet that are required to reach AT LEAST the combined ADA value target specified in amount AND the best suitable to be used as collateral inputs for transactions with plutus script inputs (pure ADA-only UTXOs).

If this cannot be attained, an error message with an explanation of the blocking problem shall be returned. NOTE: wallets are free to return UTXOs that add up to a greater total ADA value than requested in the amount parameter, but wallets must never return any result where UTXOs would sum up to a smaller total ADA value, instead in a case like that an error message must be returned.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

the type of address to fetch UTXOs from (default: payment)

#### Returns

`Promise`\<`UTxO`[]\>

a list of UTXOs

#### Implementation of

`IWallet.getCollateral`

***

### getCollateralUnspentOutput()

> **getCollateralUnspentOutput**(`addressType`): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: mesh/index.ts:277

Get a list of UTXOs to be used as collateral inputs for transactions with plutus script inputs.

This is used in transaction building.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

the type of address to fetch UTXOs from (default: payment)

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

a list of UTXOs

***

### getDRep()

> **getDRep**(): `Promise`\<`undefined` \| \{ `dRepIDCip105`: `string`; `publicKey`: `string`; `publicKeyHash`: `string`; \}\>

Defined in: mesh/index.ts:312

The connected wallet account provides the account's public DRep Key, derivation as described in CIP-0105.
These are used by the client to identify the user's on-chain CIP-1694 interactions, i.e. if a user has registered to be a DRep.

#### Returns

`Promise`\<`undefined` \| \{ `dRepIDCip105`: `string`; `publicKey`: `string`; `publicKeyHash`: `string`; \}\>

DRep object

#### Implementation of

`IWallet.getDRep`

***

### getExtensions()

> **getExtensions**(): `Promise`\<`number`[]\>

Defined in: mesh/index.ts:265

Return a list of supported CIPs of the wallet.

#### Returns

`Promise`\<`number`[]\>

a list of CIPs

#### Implementation of

`IWallet.getExtensions`

***

### getLovelace()

> **getLovelace**(): `Promise`\<`string`\>

Defined in: mesh/index.ts:574

A helper function to get the lovelace balance in the wallet.

#### Returns

`Promise`\<`string`\>

lovelace balance

#### Implementation of

`IWallet.getLovelace`

***

### getNetworkId()

> **getNetworkId**(): `Promise`\<`number`\>

Defined in: mesh/index.ts:340

Returns the network ID of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by CIP-30. This result will stay the same unless the connected account has changed.

#### Returns

`Promise`\<`number`\>

network ID

#### Implementation of

`IWallet.getNetworkId`

***

### getPolicyIdAssets()

> **getPolicyIdAssets**(`policyId`): `Promise`\<`AssetExtended`[]\>

Defined in: mesh/index.ts:587

A helper function to get the assets of a specific policy ID in the wallet.

#### Parameters

##### policyId

`string`

#### Returns

`Promise`\<`AssetExtended`[]\>

a list of assets

#### Implementation of

`IWallet.getPolicyIdAssets`

***

### getPolicyIds()

> **getPolicyIds**(): `Promise`\<`string`[]\>

Defined in: mesh/index.ts:597

A helper function to get the policy IDs of all the assets in the wallet.

#### Returns

`Promise`\<`string`[]\>

a list of policy IDs

#### Implementation of

`IWallet.getPolicyIds`

***

### getPubDRepKey()

> **getPubDRepKey**(): `object`

Defined in: mesh/index.ts:640

#### Returns

`object`

##### dRepIDBech32

> **dRepIDBech32**: `undefined` \| `string`

##### dRepIDCip105

> **dRepIDCip105**: `undefined` \| `string`

##### dRepIDHash

> **dRepIDHash**: `undefined` \| `string`

##### pubDRepKey

> **pubDRepKey**: `undefined` \| `string`

***

### getRegisteredPubStakeKeys()

> **getRegisteredPubStakeKeys**(): `Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

Defined in: mesh/index.ts:604

#### Returns

`Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

#### Implementation of

`IWallet.getRegisteredPubStakeKeys`

***

### getRewardAddresses()

> **getRewardAddresses**(): `Promise`\<`string`[]\>

Defined in: mesh/index.ts:349

Returns a list of reward addresses owned by the wallet. A reward address is a stake address that is used to receive rewards from staking, generally starts from `stake` prefix.

#### Returns

`Promise`\<`string`[]\>

a list of reward addresses

#### Implementation of

`IWallet.getRewardAddresses`

***

### getUnregisteredPubStakeKeys()

> **getUnregisteredPubStakeKeys**(): `Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

Defined in: mesh/index.ts:615

#### Returns

`Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

#### Implementation of

`IWallet.getUnregisteredPubStakeKeys`

***

### getUnspentOutputs()

> **getUnspentOutputs**(`addressType`): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: mesh/index.ts:527

Get a list of UTXOs to be used for transaction building.

This is used in transaction building.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

the type of address to fetch UTXOs from (default: payment)

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

a list of UTXOs

***

### getUnusedAddresses()

> **getUnusedAddresses**(): `Promise`\<`string`[]\>

Defined in: mesh/index.ts:358

Returns a list of unused addresses controlled by the wallet.

#### Returns

`Promise`\<`string`[]\>

a list of unused addresses

#### Implementation of

`IWallet.getUnusedAddresses`

***

### getUsedAddress()

> **getUsedAddress**(`addressType`): `Address`

Defined in: mesh/index.ts:511

Get a used address of type Address from the wallet.

This is used in transaction building.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

the type of address to fetch UTXOs from (default: payment)

#### Returns

`Address`

an Address object

***

### getUsedAddresses()

> **getUsedAddresses**(): `Promise`\<`string`[]\>

Defined in: mesh/index.ts:367

Returns a list of used addresses controlled by the wallet.

#### Returns

`Promise`\<`string`[]\>

a list of used addresses

#### Implementation of

`IWallet.getUsedAddresses`

***

### getUsedUTxOs()

> **getUsedUTxOs**(`addressType`): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: mesh/index.ts:379

Get a list of UTXOs to be used for transaction building.

This is used in transaction building.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

the type of address to fetch UTXOs from (default: payment)

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

a list of UTXOs

***

### getUtxos()

> **getUtxos**(`addressType`): `Promise`\<`UTxO`[]\>

Defined in: mesh/index.ts:392

Return a list of all UTXOs (unspent transaction outputs) controlled by the wallet.

#### Parameters

##### addressType

`GetAddressType` = `"payment"`

the type of address to fetch UTXOs from (default: payment)

#### Returns

`Promise`\<`UTxO`[]\>

a list of UTXOs

#### Implementation of

`IWallet.getUtxos`

***

### init()

> **init**(): `Promise`\<`void`\>

Defined in: mesh/index.ts:174

Initializes the wallet. This is a required call as fetching addresses from the wallet is an async operation.

#### Returns

`Promise`\<`void`\>

void

***

### signData()

> **signData**(`payload`, `address?`): `Promise`\<`DataSignature`\>

Defined in: mesh/index.ts:404

This endpoint utilizes the [CIP-8 - Message Signing](https://cips.cardano.org/cips/cip8/) to sign arbitrary data, to verify the data was signed by the owner of the private key.

#### Parameters

##### payload

`string`

the payload to sign

##### address?

`string`

the address to use for signing (optional)

#### Returns

`Promise`\<`DataSignature`\>

a signature

#### Implementation of

`IWallet.signData`

***

### signTx()

> **signTx**(`unsignedTx`, `partialSign`): `Promise`\<`string`\>

Defined in: mesh/index.ts:430

Requests user to sign the provided transaction (tx). The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction. partialSign should be true if the transaction provided requires multiple signatures.

#### Parameters

##### unsignedTx

`string`

a transaction in CBOR

##### partialSign

`boolean` = `false`

if the transaction is partially signed (default: false)

#### Returns

`Promise`\<`string`\>

a signed transaction in CBOR

#### Implementation of

`IWallet.signTx`

***

### signTxs()

> **signTxs**(`unsignedTxs`, `partialSign`): `Promise`\<`string`[]\>

Defined in: mesh/index.ts:467

Experimental feature - sign multiple transactions at once.

#### Parameters

##### unsignedTxs

`string`[]

array of unsigned transactions in CborHex string

##### partialSign

`boolean` = `false`

if the transactions are signed partially

#### Returns

`Promise`\<`string`[]\>

array of signed transactions CborHex string

#### Implementation of

`IWallet.signTxs`

***

### submitTx()

> **submitTx**(`tx`): `Promise`\<`string`\>

Defined in: mesh/index.ts:494

Submits the signed transaction to the blockchain network.

As wallets should already have this ability to submit transaction, we allow apps to request that a transaction be sent through it. If the wallet accepts the transaction and tries to send it, it shall return the transaction ID for the app to track. The wallet can return error messages or failure if there was an error in sending it.

#### Parameters

##### tx

`string`

a signed transaction in CBOR

#### Returns

`Promise`\<`string`\>

a transaction hash

#### Implementation of

`IWallet.submitTx`

***

### brew()

> `static` **brew**(`privateKey`, `strength`): `string` \| `string`[]

Defined in: mesh/index.ts:660

Generate mnemonic or private key

#### Parameters

##### privateKey

`boolean` = `false`

return private key if true

##### strength

`number` = `256`

#### Returns

`string` \| `string`[]

a transaction hash
