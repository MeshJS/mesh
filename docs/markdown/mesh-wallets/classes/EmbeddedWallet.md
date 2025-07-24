[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / EmbeddedWallet

# Class: EmbeddedWallet

Defined in: embedded/index.ts:199

## Extends

- [`WalletStaticMethods`](WalletStaticMethods.md)

## Constructors

### Constructor

> **new EmbeddedWallet**(`options`): `EmbeddedWallet`

Defined in: embedded/index.ts:204

#### Parameters

##### options

[`CreateEmbeddedWalletOptions`](../type-aliases/CreateEmbeddedWalletOptions.md)

#### Returns

`EmbeddedWallet`

#### Overrides

[`WalletStaticMethods`](WalletStaticMethods.md).[`constructor`](WalletStaticMethods.md#constructor)

## Properties

### cryptoIsReady

> **cryptoIsReady**: `boolean` = `false`

Defined in: embedded/index.ts:202

## Methods

### getAccount()

> **getAccount**(`accountIndex`, `keyIndex`): [`Account`](../type-aliases/Account.md)

Defined in: embedded/index.ts:239

#### Parameters

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

[`Account`](../type-aliases/Account.md)

***

### getNetworkId()

> **getNetworkId**(): `number`

Defined in: embedded/index.ts:285

Get wallet network ID.

#### Returns

`number`

network ID

***

### init()

> **init**(): `Promise`\<`void`\>

Defined in: embedded/index.ts:234

#### Returns

`Promise`\<`void`\>

***

### signData()

> **signData**(`address`, `payload`, `accountIndex`, `keyIndex`): `DataSignature`

Defined in: embedded/index.ts:297

This endpoint utilizes the [CIP-8 - Message Signing](https://cips.cardano.org/cips/cip8/) to sign arbitrary data, to verify the data was signed by the owner of the private key.

#### Parameters

##### address

`string`

bech32 address to sign the data with

##### payload

`string`

the data to be signed

##### accountIndex

`number` = `0`

account index (default: 0)

##### keyIndex

`number` = `0`

#### Returns

`DataSignature`

a signature

***

### signTx()

> **signTx**(`unsignedTx`, `accountIndex`, `keyIndex`, `accountType`): `VkeyWitness`

Defined in: embedded/index.ts:337

This endpoints sign the provided transaction (unsignedTx) with the private key of the owner.

#### Parameters

##### unsignedTx

`string`

a transaction in CBOR

##### accountIndex

`number` = `0`

account index (default: 0)

##### keyIndex

`number` = `0`

key index (default: 0)

##### accountType

[`AccountType`](../type-aliases/AccountType.md) = `"payment"`

type of the account (default: payment)

#### Returns

`VkeyWitness`

VkeyWitness

***

### addWitnessSets()

> `static` **addWitnessSets**(`txHex`, `witnesses`): `string`

Defined in: embedded/index.ts:182

#### Parameters

##### txHex

`string`

##### witnesses

`VkeyWitness`[]

#### Returns

`string`

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`addWitnessSets`](WalletStaticMethods.md#addwitnesssets)

***

### bip32BytesToPrivateKeyHex()

> `static` **bip32BytesToPrivateKeyHex**(`bip32Bytes`): `string`

Defined in: embedded/index.ts:104

#### Parameters

##### bip32Bytes

`Uint8Array`

#### Returns

`string`

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`bip32BytesToPrivateKeyHex`](WalletStaticMethods.md#bip32bytestoprivatekeyhex)

***

### generateMnemonic()

> `static` **generateMnemonic**(`strength`): `string`[]

Defined in: embedded/index.ts:177

#### Parameters

##### strength

`number` = `256`

#### Returns

`string`[]

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`generateMnemonic`](WalletStaticMethods.md#generatemnemonic)

***

### getAddresses()

> `static` **getAddresses**(`paymentKey`, `stakingKey`, `networkId`): `object`

Defined in: embedded/index.ts:109

#### Parameters

##### paymentKey

`Ed25519PrivateKey`

##### stakingKey

`Ed25519PrivateKey`

##### networkId

`number` = `0`

#### Returns

`object`

##### baseAddress

> **baseAddress**: `Address`

##### enterpriseAddress

> **enterpriseAddress**: `Address`

##### rewardAddress

> **rewardAddress**: `Address`

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`getAddresses`](WalletStaticMethods.md#getaddresses)

***

### getDRepKey()

> `static` **getDRepKey**(`dRepKey`, `networkId`): `object`

Defined in: embedded/index.ts:149

#### Parameters

##### dRepKey

`Ed25519PrivateKey`

##### networkId

`number` = `0`

#### Returns

`object`

##### dRepIDBech32

> **dRepIDBech32**: `DRepID`

##### dRepIDCip105

> **dRepIDCip105**: `string`

##### dRepIDHash

> **dRepIDHash**: `Ed25519KeyHashHex`

##### pubDRepKey

> **pubDRepKey**: `string`

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`getDRepKey`](WalletStaticMethods.md#getdrepkey)

***

### mnemonicToPrivateKeyHex()

> `static` **mnemonicToPrivateKeyHex**(`words`): `string`

Defined in: embedded/index.ts:88

#### Parameters

##### words

`string`[]

#### Returns

`string`

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`mnemonicToPrivateKeyHex`](WalletStaticMethods.md#mnemonictoprivatekeyhex)

***

### privateKeyBech32ToPrivateKeyHex()

> `static` **privateKeyBech32ToPrivateKeyHex**(`_bech32`): `string`

Defined in: embedded/index.ts:82

#### Parameters

##### \_bech32

`string`

#### Returns

`string`

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`privateKeyBech32ToPrivateKeyHex`](WalletStaticMethods.md#privatekeybech32toprivatekeyhex)

***

### signingKeyToHexes()

> `static` **signingKeyToHexes**(`paymentKey`, `stakeKey`): \[`string`, `string`\]

Defined in: embedded/index.ts:94

#### Parameters

##### paymentKey

`string`

##### stakeKey

`string`

#### Returns

\[`string`, `string`\]

#### Inherited from

[`WalletStaticMethods`](WalletStaticMethods.md).[`signingKeyToHexes`](WalletStaticMethods.md#signingkeytohexes)
