# @meshsdk/core-cst

Cardano Serialization Tools (CST) package for Mesh SDK, built on top of `@cardano-sdk/*` and `@harmoniclabs/*` libraries. This package provides low-level serialization and deserialization utilities for Cardano blockchain data structures.

## Installation

```bash
npm install @meshsdk/core-cst
```

## Overview

This package is part of the [Mesh SDK](https://meshjs.dev/) ecosystem and serves as the core serialization layer using the Cardano SDK and HarmonicLabs libraries. It provides:

- **Type conversions** between Mesh internal types and Cardano SDK types
- **Transaction serialization** and deserialization utilities
- **Address utilities** for Cardano address handling
- **Cryptographic utilities** for key management and signing
- **Plutus data** serialization helpers

## Usage

```typescript
import {
  deserializeTx,
  serializeTx,
  toAddress,
  fromAddress,
  toPlutusData,
} from '@meshsdk/core-cst';

// Deserialize a CBOR-encoded transaction
const tx = deserializeTx(cborHex);

// Convert a bech32 address to Mesh Address type
const address = toAddress('addr1...');
```

## API Reference

### Transaction Utilities

#### `deserializeTx(tx: string): Transaction`

Deserializes a CBOR-encoded transaction hex string into a `Transaction` object.

**Parameters:**
- `tx` — CBOR hex string of the serialized transaction

**Returns:** Deserialized `Transaction` object

#### `serializeTx(tx: Transaction): string`

Serializes a `Transaction` object into a CBOR-encoded hex string.

**Parameters:**
- `tx` — The `Transaction` object to serialize

**Returns:** CBOR hex string

### Address Utilities

#### `toAddress(address: string): MeshAddress`

Converts a bech32 or hex-encoded Cardano address into a Mesh `Address` object.

**Parameters:**
- `address` — bech32 or hex address string

**Returns:** Mesh `Address` object

#### `fromAddress(address: MeshAddress): string`

Converts a Mesh `Address` object back to a bech32 string.

**Parameters:**
- `address` — Mesh `Address` object

**Returns:** bech32 address string

### Plutus Data Utilities

#### `toPlutusData(data: PlutusData): CstPlutusData`

Converts Mesh `PlutusData` into the Cardano SDK `PlutusData` format.

#### `fromPlutusData(data: CstPlutusData): PlutusData`

Converts Cardano SDK `PlutusData` into the Mesh `PlutusData` format.

## Contributing

Please read the [Contributing Guide](../../CONTRIBUTING.md) before submitting pull requests.

## License

[Apache License 2.0](../../LICENSE.md)
