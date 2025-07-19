[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / ISigner

# Interface: ISigner

Defined in: interfaces/signer.ts:3

## Extended by

- [`IWallet`](IWallet.md)

## Methods

### signData()

> **signData**(`payload`, `address?`): `Promise`\<[`DataSignature`](../type-aliases/DataSignature.md)\>

Defined in: interfaces/signer.ts:4

#### Parameters

##### payload

`string`

##### address?

`string`

#### Returns

`Promise`\<[`DataSignature`](../type-aliases/DataSignature.md)\>

***

### signTx()

> **signTx**(`unsignedTx`, `partialSign?`): `Promise`\<`string`\>

Defined in: interfaces/signer.ts:5

#### Parameters

##### unsignedTx

`string`

##### partialSign?

`boolean`

#### Returns

`Promise`\<`string`\>

***

### signTxs()

> **signTxs**(`unsignedTxs`, `partialSign?`): `Promise`\<`string`[]\>

Defined in: interfaces/signer.ts:6

#### Parameters

##### unsignedTxs

`string`[]

##### partialSign?

`boolean`

#### Returns

`Promise`\<`string`[]\>
