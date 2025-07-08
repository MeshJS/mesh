[**@meshsdk/core-cst**](../README.md)

***

[@meshsdk/core-cst](../globals.md) / normalizePlutusScript

# Function: normalizePlutusScript()

> **normalizePlutusScript**(`plutusScript`, `encoding`): `string`

Defined in: packages/mesh-core-cst/src/plutus-tools/index.ts:121

Normalizes a Plutus script by extracting its pure Plutus bytes and applying a specified encoding.

## Parameters

### plutusScript

`string`

The Plutus script to be normalized as a Uint8Array.

### encoding

[`OutputEncoding`](../type-aliases/OutputEncoding.md)

The desired encoding for the output.

## Returns

`string`

The normalized Plutus script.

## Description

This function performs the following steps:
1. Extracts the pure Plutus bytes in hex from the input script.
2. Applies the specified encoding to the pure Plutus bytes.

## Note

- This function is useful for standardizing the format of Plutus scripts, ensuring they are in a consistent state for further processing or comparison.
- The normalization process does not modify the logical content of the script, only its representation.
