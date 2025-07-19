[**@meshsdk/provider**](../README.md)

***

[@meshsdk/provider](../globals.md) / OgmiosProvider

# Class: OgmiosProvider

Defined in: ogmios.ts:10

## Implements

- `IEvaluator`
- `ISubmitter`

## Constructors

### Constructor

> **new OgmiosProvider**(`baseUrl`): `OgmiosProvider`

Defined in: ogmios.ts:13

#### Parameters

##### baseUrl

`string`

#### Returns

`OgmiosProvider`

### Constructor

> **new OgmiosProvider**(`network`): `OgmiosProvider`

Defined in: ogmios.ts:14

#### Parameters

##### network

`"testnet"` | `"preview"` | `"preprod"` | `"mainnet"`

#### Returns

`OgmiosProvider`

## Methods

### evaluateTx()

> **evaluateTx**(`tx`): `Promise`\<`Omit`\<`Action`, `"data"`\>[]\>

Defined in: ogmios.ts:26

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

### onNextTx()

> **onNextTx**(`callback`): `Promise`\<() => `void`\>

Defined in: ogmios.ts:68

#### Parameters

##### callback

(`tx`) => `void`

#### Returns

`Promise`\<() => `void`\>

***

### submitTx()

> **submitTx**(`tx`): `Promise`\<`string`\>

Defined in: ogmios.ts:98

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
