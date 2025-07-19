[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / CreateMeshWalletOptions

# Type Alias: CreateMeshWalletOptions

> **CreateMeshWalletOptions** = `object`

Defined in: mesh/index.ts:35

## Properties

### accountIndex?

> `optional` **accountIndex**: `number`

Defined in: mesh/index.ts:61

***

### accountType?

> `optional` **accountType**: [`AccountType`](AccountType.md)

Defined in: mesh/index.ts:63

***

### fetcher?

> `optional` **fetcher**: `IFetcher`

Defined in: mesh/index.ts:37

***

### key

> **key**: \{ `bech32`: `string`; `type`: `"root"`; \} \| \{ `payment`: `string`; `stake?`: `string`; `type`: `"cli"`; \} \| \{ `type`: `"mnemonic"`; `words`: `string`[]; \} \| \{ `bip32Bytes`: `Uint8Array`; `type`: `"bip32Bytes"`; \} \| \{ `address`: `string`; `type`: `"address"`; \}

Defined in: mesh/index.ts:39

***

### keyIndex?

> `optional` **keyIndex**: `number`

Defined in: mesh/index.ts:62

***

### networkId

> **networkId**: `0` \| `1`

Defined in: mesh/index.ts:36

***

### submitter?

> `optional` **submitter**: `ISubmitter`

Defined in: mesh/index.ts:38
