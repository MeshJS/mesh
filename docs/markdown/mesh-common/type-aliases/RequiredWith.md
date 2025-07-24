[**@meshsdk/common**](../README.md)

***

[@meshsdk/common](../globals.md) / RequiredWith

# Type Alias: RequiredWith\<T, K\>

> **RequiredWith**\<`T`, `K`\> = `Required`\<`T`\> & `{ [P in K]: Required<T[P]> }`

Defined in: types/transaction-builder/index.ts:115

## Type Parameters

### T

`T`

### K

`K` *extends* keyof `T`
