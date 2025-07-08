[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / BrowserWallet

# Class: BrowserWallet

Defined in: browser/browser-wallet.ts:58

Browser Wallet provides a set of APIs to interact with the blockchain. This wallet is compatible with Mesh transaction builders.

These wallets APIs are in accordance to CIP-30, which defines the API for apps to communicate with the user's wallet. Additional utility functions provided for developers that are useful for building applications.
```javascript
import { BrowserWallet } from '@meshsdk/core';

const wallet = await BrowserWallet.enable('eternl');
```

## Implements

- `IWallet`

## Properties

### \_walletInstance

> `readonly` **\_walletInstance**: `WalletInstance`

Defined in: browser/browser-wallet.ts:62

***

### \_walletName

> `readonly` **\_walletName**: `string`

Defined in: browser/browser-wallet.ts:63

***

### walletInstance

> **walletInstance**: `WalletInstance`

Defined in: browser/browser-wallet.ts:59

## Methods

### getAssets()

> **getAssets**(): `Promise`\<`AssetExtended`[]\>

Defined in: browser/browser-wallet.ts:423

A helper function to get the assets in the wallet.

#### Returns

`Promise`\<`AssetExtended`[]\>

a list of assets

#### Implementation of

`IWallet.getAssets`

***

### getBalance()

> **getBalance**(): `Promise`\<`Asset`[]\>

Defined in: browser/browser-wallet.ts:159

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

> **getChangeAddress**(): `Promise`\<`string`\>

Defined in: browser/browser-wallet.ts:169

Returns an address owned by the wallet that should be used as a change address to return leftover assets during transaction creation back to the connected wallet.

#### Returns

`Promise`\<`string`\>

an address

#### Implementation of

`IWallet.getChangeAddress`

***

### getCollateral()

> **getCollateral**(): `Promise`\<`UTxO`[]\>

Defined in: browser/browser-wallet.ts:182

This function shall return a list of one or more UTXOs (unspent transaction outputs) controlled by the wallet that are required to reach AT LEAST the combined ADA value target specified in amount AND the best suitable to be used as collateral inputs for transactions with plutus script inputs (pure ADA-only UTXOs).

If this cannot be attained, an error message with an explanation of the blocking problem shall be returned. NOTE: wallets are free to return UTXOs that add up to a greater total ADA value than requested in the amount parameter, but wallets must never return any result where UTXOs would sum up to a smaller total ADA value, instead in a case like that an error message must be returned.

#### Returns

`Promise`\<`UTxO`[]\>

a list of UTXOs

#### Implementation of

`IWallet.getCollateral`

***

### getCollateralUnspentOutput()

> **getCollateralUnspentOutput**(`limit`): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: browser/browser-wallet.ts:389

Get a list of UTXOs to be used as collateral inputs for transactions with plutus script inputs.

This is used in transaction building.

#### Parameters

##### limit

`number` = `DEFAULT_PROTOCOL_PARAMETERS.maxCollateralInputs`

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

a list of UTXOs

***

### getDRep()

> **getDRep**(): `Promise`\<`undefined` \| \{ `dRepIDCip105`: `string`; `publicKey`: `string`; `publicKeyHash`: `string`; \}\>

Defined in: browser/browser-wallet.ts:483

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

Defined in: browser/browser-wallet.ts:192

Return a list of supported CIPs of the wallet.

#### Returns

`Promise`\<`number`[]\>

a list of CIPs

#### Implementation of

`IWallet.getExtensions`

***

### getLovelace()

> **getLovelace**(): `Promise`\<`string`\>

Defined in: browser/browser-wallet.ts:447

A helper function to get the lovelace balance in the wallet.

#### Returns

`Promise`\<`string`\>

lovelace balance

#### Implementation of

`IWallet.getLovelace`

***

### getNetworkId()

> **getNetworkId**(): `Promise`\<`number`\>

Defined in: browser/browser-wallet.ts:207

Returns the network ID of the currently connected account. 0 is testnet and 1 is mainnet but other networks can possibly be returned by wallets. Those other network ID values are not governed by CIP-30. This result will stay the same unless the connected account has changed.

#### Returns

`Promise`\<`number`\>

network ID

#### Implementation of

`IWallet.getNetworkId`

***

### getPolicyIdAssets()

> **getPolicyIdAssets**(`policyId`): `Promise`\<`AssetExtended`[]\>

Defined in: browser/browser-wallet.ts:460

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

Defined in: browser/browser-wallet.ts:470

A helper function to get the policy IDs of all the assets in the wallet.

#### Returns

`Promise`\<`string`[]\>

a list of policy IDs

#### Implementation of

`IWallet.getPolicyIds`

***

### getPubDRepKey()

> **getPubDRepKey**(): `Promise`\<`undefined` \| `string`\>

Defined in: browser/browser-wallet.ts:519

The connected wallet account provides the account's public DRep Key, derivation as described in CIP-0105.
These are used by the client to identify the user's on-chain CIP-1694 interactions, i.e. if a user has registered to be a DRep.

#### Returns

`Promise`\<`undefined` \| `string`\>

wallet account's public DRep Key

***

### getRegisteredPubStakeKeys()

> **getRegisteredPubStakeKeys**(): `Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

Defined in: browser/browser-wallet.ts:531

#### Returns

`Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

#### Implementation of

`IWallet.getRegisteredPubStakeKeys`

***

### getRewardAddresses()

> **getRewardAddresses**(): `Promise`\<`string`[]\>

Defined in: browser/browser-wallet.ts:216

Returns a list of reward addresses owned by the wallet. A reward address is a stake address that is used to receive rewards from staking, generally starts from `stake` prefix.

#### Returns

`Promise`\<`string`[]\>

a list of reward addresses

#### Implementation of

`IWallet.getRewardAddresses`

***

### getUnregisteredPubStakeKeys()

> **getUnregisteredPubStakeKeys**(): `Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

Defined in: browser/browser-wallet.ts:562

#### Returns

`Promise`\<`undefined` \| \{ `pubStakeKeyHashes`: `string`[]; `pubStakeKeys`: `string`[]; \}\>

#### Implementation of

`IWallet.getUnregisteredPubStakeKeys`

***

### getUnusedAddresses()

> **getUnusedAddresses**(): `Promise`\<`string`[]\>

Defined in: browser/browser-wallet.ts:226

Returns a list of unused addresses controlled by the wallet.

#### Returns

`Promise`\<`string`[]\>

a list of unused addresses

#### Implementation of

`IWallet.getUnusedAddresses`

***

### getUsedAddress()

> **getUsedAddress**(): `Promise`\<`Address`\>

Defined in: browser/browser-wallet.ts:376

Get a used address of type Address from the wallet.

This is used in transaction building.

#### Returns

`Promise`\<`Address`\>

an Address object

***

### getUsedAddresses()

> **getUsedAddresses**(): `Promise`\<`string`[]\>

Defined in: browser/browser-wallet.ts:238

Returns a list of used addresses controlled by the wallet.

#### Returns

`Promise`\<`string`[]\>

a list of used addresses

#### Implementation of

`IWallet.getUsedAddresses`

***

### getUsedUTxOs()

> **getUsedUTxOs**(): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: browser/browser-wallet.ts:413

Get a list of UTXOs to be used for transaction building.

This is used in transaction building.

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

a list of UTXOs

***

### getUtxos()

> **getUtxos**(): `Promise`\<`UTxO`[]\>

Defined in: browser/browser-wallet.ts:248

Return a list of all UTXOs (unspent transaction outputs) controlled by the wallet.

#### Returns

`Promise`\<`UTxO`[]\>

a list of UTXOs

#### Implementation of

`IWallet.getUtxos`

***

### signData()

> **signData**(`payload`, `address?`, `convertFromUTF8?`): `Promise`\<`DataSignature`\>

Defined in: browser/browser-wallet.ts:260

This endpoint utilizes the [CIP-8 - Message Signing](https://cips.cardano.org/cips/cip8/) to sign arbitrary data, to verify the data was signed by the owner of the private key.

#### Parameters

##### payload

`string`

the data to be signed

##### address?

`string`

optional, if not provided, the first staking address will be used

##### convertFromUTF8?

`boolean` = `true`

#### Returns

`Promise`\<`DataSignature`\>

a signature

#### Implementation of

`IWallet.signData`

***

### signTx()

> **signTx**(`unsignedTx`, `partialSign`): `Promise`\<`string`\>

Defined in: browser/browser-wallet.ts:289

Requests user to sign the provided transaction (tx). The wallet should ask the user for permission, and if given, try to sign the supplied body and return a signed transaction. partialSign should be true if the transaction provided requires multiple signatures.

#### Parameters

##### unsignedTx

`string`

a transaction in CBOR

##### partialSign

`boolean` = `false`

if the transaction is signed partially

#### Returns

`Promise`\<`string`\>

a signed transaction in CBOR

#### Implementation of

`IWallet.signTx`

***

### signTxs()

> **signTxs**(`unsignedTxs`, `partialSign`): `Promise`\<`string`[]\>

Defined in: browser/browser-wallet.ts:304

Experimental feature - sign multiple transactions at once (Supported wallet(s): Typhon)

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

Defined in: browser/browser-wallet.ts:365

Submits the signed transaction to the blockchain network.

As wallets should already have this ability to submit transaction, we allow apps to request that a transaction be sent through it. If the wallet accepts the transaction and tries to send it, it shall return the transaction ID for the app to track. The wallet can return error messages or failure if there was an error in sending it.

#### Parameters

##### tx

`string`

#### Returns

`Promise`\<`string`\>

a transaction hash

#### Implementation of

`IWallet.submitTx`

***

### addBrowserWitnesses()

> `static` **addBrowserWitnesses**(`unsignedTx`, `witnesses`): `string`

Defined in: browser/browser-wallet.ts:624

#### Parameters

##### unsignedTx

`string`

##### witnesses

`string`

#### Returns

`string`

***

### enable()

> `static` **enable**(`walletName`, `extensions`): `Promise`\<`BrowserWallet`\>

Defined in: browser/browser-wallet.ts:129

This is the entrypoint to start communication with the user's wallet. The wallet should request the user's permission to connect the web page to the user's wallet, and if permission has been granted, the wallet will be returned and exposing the full API for the app to use.

Query BrowserWallet.getInstalledWallets() to get a list of available wallets, then provide the wallet name for which wallet the user would like to connect with.

#### Parameters

##### walletName

`string`

the name of the wallet to enable (e.g. "eternl", "begin")

##### extensions

`Extension`[] = `[]`

optional, a list of CIPs that the wallet should support

#### Returns

`Promise`\<`BrowserWallet`\>

WalletInstance

***

### getAvailableWallets()

> `static` **getAvailableWallets**(`__namedParameters`): `Promise`\<`Wallet`[]\>

Defined in: browser/browser-wallet.ts:76

Returns a list of wallets installed on user's device. Each wallet is an object with the following properties:
- A name is provided to display wallet's name on the user interface.
- A version is provided to display wallet's version on the user interface.
- An icon is provided to display wallet's icon on the user interface.

#### Parameters

##### \_\_namedParameters

###### injectFn?

() => `Promise`\<`void`\> = `undefined`

#### Returns

`Promise`\<`Wallet`[]\>

a list of wallet names

***

### getInstalledWallets()

> `static` **getInstalledWallets**(): `Wallet`[]

Defined in: browser/browser-wallet.ts:96

Returns a list of wallets installed on user's device. Each wallet is an object with the following properties:
- A name is provided to display wallet's name on the user interface.
- A version is provided to display wallet's version on the user interface.
- An icon is provided to display wallet's icon on the user interface.

#### Returns

`Wallet`[]

a list of wallet names

***

### getSupportedExtensions()

> `static` **getSupportedExtensions**(`wallet`): `object`[]

Defined in: browser/browser-wallet.ts:652

#### Parameters

##### wallet

`string`

#### Returns

`object`[]
