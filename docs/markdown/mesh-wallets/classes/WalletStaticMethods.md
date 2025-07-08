[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / WalletStaticMethods

# Class: WalletStaticMethods

Defined in: embedded/index.ts:81

## Extended by

- [`EmbeddedWallet`](EmbeddedWallet.md)

## Constructors

### Constructor

> **new WalletStaticMethods**(): `WalletStaticMethods`

#### Returns

`WalletStaticMethods`

## Methods

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

***

### bip32BytesToPrivateKeyHex()

> `static` **bip32BytesToPrivateKeyHex**(`bip32Bytes`): `string`

Defined in: embedded/index.ts:104

#### Parameters

##### bip32Bytes

`Uint8Array`

#### Returns

`string`

***

### generateMnemonic()

> `static` **generateMnemonic**(`strength`): `string`[]

Defined in: embedded/index.ts:177

#### Parameters

##### strength

`number` = `256`

#### Returns

`string`[]

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

***

### mnemonicToPrivateKeyHex()

> `static` **mnemonicToPrivateKeyHex**(`words`): `string`

Defined in: embedded/index.ts:88

#### Parameters

##### words

`string`[]

#### Returns

`string`

***

### privateKeyBech32ToPrivateKeyHex()

> `static` **privateKeyBech32ToPrivateKeyHex**(`_bech32`): `string`

Defined in: embedded/index.ts:82

#### Parameters

##### \_bech32

`string`

#### Returns

`string`

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
