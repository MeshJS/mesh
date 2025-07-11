[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / AppWallet

# Class: AppWallet

Defined in: app/index.ts:35

## Implements

- `ISigner`
- `ISubmitter`

## Constructors

### Constructor

> **new AppWallet**(`options`): `AppWallet`

Defined in: app/index.ts:40

#### Parameters

##### options

[`CreateAppWalletOptions`](../type-aliases/CreateAppWalletOptions.md)

#### Returns

`AppWallet`

## Methods

### getCollateralUnspentOutput()

> **getCollateralUnspentOutput**(`accountIndex`, `addressType`): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: app/index.ts:92

Get a list of UTXOs to be used as collateral inputs for transactions with plutus script inputs.

This is used in transaction building.

#### Parameters

##### accountIndex

`number` = `0`

##### addressType

`GetAddressType` = `"payment"`

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

a list of UTXOs

***

### getEnterpriseAddress()

> **getEnterpriseAddress**(`accountIndex`, `keyIndex`): `string`

Defined in: app/index.ts:120

#### Parameters

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

`string`

***

### getNetworkId()

> **getNetworkId**(): `number`

Defined in: app/index.ts:135

#### Returns

`number`

***

### getPaymentAddress()

> **getPaymentAddress**(`accountIndex`, `keyIndex`): `string`

Defined in: app/index.ts:125

#### Parameters

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

`string`

***

### getRewardAddress()

> **getRewardAddress**(`accountIndex`, `keyIndex`): `string`

Defined in: app/index.ts:130

#### Parameters

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

`string`

***

### getUnspentOutputs()

> **getUnspentOutputs**(`accountIndex`, `addressType`): `Promise`\<`TransactionUnspentOutput`[]\>

Defined in: app/index.ts:151

#### Parameters

##### accountIndex

`number` = `0`

##### addressType

`GetAddressType` = `"payment"`

#### Returns

`Promise`\<`TransactionUnspentOutput`[]\>

***

### getUsedAddress()

> **getUsedAddress**(`accountIndex`, `keyIndex`, `addressType`): `Address`

Defined in: app/index.ts:139

#### Parameters

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

##### addressType

`GetAddressType` = `"payment"`

#### Returns

`Address`

***

### init()

> **init**(): `Promise`\<`void`\>

Defined in: app/index.ts:79

Initializes the wallet. This is a required call as fetching addresses from the wallet is an async operation.

#### Returns

`Promise`\<`void`\>

void

***

### signData()

> **signData**(`address`, `payload`, `accountIndex`, `keyIndex`): `Promise`\<`DataSignature`\>

Defined in: app/index.ts:171

#### Parameters

##### address

`string`

##### payload

`string`

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

`Promise`\<`DataSignature`\>

#### Implementation of

`ISigner.signData`

***

### signTx()

> **signTx**(`unsignedTx`, `partialSign`, `accountIndex`, `keyIndex`): `Promise`\<`string`\>

Defined in: app/index.ts:186

#### Parameters

##### unsignedTx

`string`

##### partialSign

`boolean` = `false`

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

`Promise`\<`string`\>

#### Implementation of

`ISigner.signTx`

***

### signTxs()

> **signTxs**(`unsignedTxs`, `partialSign`): `Promise`\<`string`[]\>

Defined in: app/index.ts:229

#### Parameters

##### unsignedTxs

`string`[]

##### partialSign

`boolean`

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

`ISigner.signTxs`

***

### signTxSync()

> **signTxSync**(`unsignedTx`, `partialSign`, `accountIndex`, `keyIndex`): `string`

Defined in: app/index.ts:216

#### Parameters

##### unsignedTx

`string`

##### partialSign

`boolean` = `false`

##### accountIndex

`number` = `0`

##### keyIndex

`number` = `0`

#### Returns

`string`

***

### submitTx()

> **submitTx**(`tx`): `Promise`\<`string`\>

Defined in: app/index.ts:236

#### Parameters

##### tx

`string`

#### Returns

`Promise`\<`string`\>

#### Implementation of

`ISubmitter.submitTx`

***

### brew()

> `static` **brew**(`strength`): `string`[]

Defined in: app/index.ts:245

#### Parameters

##### strength

`number` = `256`

#### Returns

`string`[]
