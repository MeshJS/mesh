[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / IEvaluator

# Interface: IEvaluator

Defined in: interfaces/evaluator.ts:3

## Methods

### evaluateTx()

> **evaluateTx**(`tx`, `additionalUtxos?`, `additionalTxs?`): `Promise`\<`Omit`\<[`Action`](../type-aliases/Action.md), `"data"`\>[]\>

Defined in: interfaces/evaluator.ts:4

#### Parameters

##### tx

`string`

##### additionalUtxos?

[`UTxO`](../type-aliases/UTxO.md)[]

##### additionalTxs?

`string`[]

#### Returns

`Promise`\<`Omit`\<[`Action`](../type-aliases/Action.md), `"data"`\>[]\>
