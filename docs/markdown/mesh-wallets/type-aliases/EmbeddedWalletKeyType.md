[**@meshsdk/wallet**](../README.md)

***

[@meshsdk/wallet](../globals.md) / EmbeddedWalletKeyType

# Type Alias: EmbeddedWalletKeyType

> **EmbeddedWalletKeyType** = \{ `bech32`: `string`; `type`: `"root"`; \} \| \{ `payment`: `string`; `stake?`: `string`; `type`: `"cli"`; \} \| \{ `type`: `"mnemonic"`; `words`: `string`[]; \} \| \{ `bip32Bytes`: `Uint8Array`; `type`: `"bip32Bytes"`; \}

Defined in: embedded/index.ts:57
