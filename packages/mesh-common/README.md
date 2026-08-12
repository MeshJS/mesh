# @meshsdk/common

Shared types, interfaces, and utilities for the Mesh SDK. This package defines the common contracts (interfaces) and data types used across all Mesh packages.

## Installation

```bash
npm install @meshsdk/common
```

## Overview

`@meshsdk/common` is the foundational package of the Mesh SDK. It contains:

- **Interfaces** — `IFetcher`, `ISubmitter`, `IEvaluator`, `IWallet`, `ISigner`
- **Types** — All Cardano data structure types (`UTxO`, `Asset`, `Protocol`, `PlutusData`, etc.)
- **Constants** — Network IDs, well-known asset unit strings
- **Utilities** — Shared helper functions for data conversion

## Core Interfaces

### `IFetcher`

Interface for providers that can fetch chain data.

```typescript
import type { IFetcher } from '@meshsdk/common';

class MyProvider implements IFetcher {
  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    // implementation
  }

  async fetchProtocolParameters(epoch?: number): Promise<Protocol> {
    // implementation
  }

  // ... other methods
}
```

**Methods:**

| Method | Description |
|---|---|
| `fetchAddressUTxOs(address, asset?)` | Fetch UTxOs at an address |
| `fetchAssetAddresses(asset)` | Fetch addresses holding an asset |
| `fetchAssetMetadata(asset)` | Fetch on-chain metadata for an asset |
| `fetchBlockInfo(hash)` | Fetch block information |
| `fetchCollectionAssets(policyId, cursor?)` | Paginate assets in a policy |
| `fetchHandleAddress(handle)` | Resolve ADA Handle to address |
| `fetchProtocolParameters(epoch?)` | Fetch protocol parameters |
| `fetchTxInfo(hash)` | Fetch transaction details |
| `fetchUTxOs(hash, index?)` | Fetch UTxOs by tx hash |

### `ISubmitter`

Interface for providers that can submit transactions.

```typescript
import type { ISubmitter } from '@meshsdk/common';

class MyProvider implements ISubmitter {
  async submitTx(tx: string): Promise<string> {
    // Submit CBOR-encoded transaction, return tx hash
  }
}
```

### `IEvaluator`

Interface for providers that can evaluate script execution units.

```typescript
import type { IEvaluator } from '@meshsdk/common';

class MyProvider implements IEvaluator {
  async evaluateTx(tx: string): Promise<Omit<Action, 'data'>[]> {
    // Evaluate Plutus script execution units
  }
}
```

### `IWallet`

Interface for wallet implementations providing signing and transaction capabilities.

**Key Methods:**

| Method | Description |
|---|---|
| `getBalance()` | Get wallet balance as asset list |
| `getChangeAddress()` | Get the change address |
| `getCollateral()` | Get collateral UTxOs |
| `getNetworkId()` | Get network ID (0=testnet, 1=mainnet) |
| `getUtxos()` | Get all wallet UTxOs |
| `signData(address, payload)` | Sign arbitrary data (CIP-8) |
| `signTx(unsignedTx, partialSign?)` | Sign a transaction |
| `submitTx(tx)` | Submit a signed transaction |

## Common Types

### `UTxO`

```typescript
interface UTxO {
  input: {
    outputIndex: number;
    txHash: string;
  };
  output: {
    address: string;
    amount: Asset[];
    dataHash?: string;
    plutusData?: string;
    scriptRef?: string;
    scriptHash?: string;
  };
}
```

### `Asset`

```typescript
interface Asset {
  unit: string;     // 'lovelace' or concatenation of policyId + assetNameHex
  quantity: string; // Amount as string to handle large integers
}
```

### `Protocol`

Represents Cardano protocol parameters including:
- `minFeeA`, `minFeeB` — Fee calculation coefficients
- `maxTxSize` — Maximum transaction size in bytes
- `maxValSize` — Maximum value size
- `keyDeposit` — Key registration deposit in lovelace
- `poolDeposit` — Pool registration deposit in lovelace
- `coinsPerUtxoSize` — Minimum UTxO value calculation
- `priceMem`, `priceStep` — Plutus execution unit prices
- `collateralPercent` — Required collateral percentage
- `maxCollateralInputs` — Maximum collateral inputs

### `PlutusData`

Union type representing all Plutus data constructors:
- `ConStr` — Constructor with fields
- `Integer` — Integer value
- `ByteString` — Hex-encoded byte string
- `List` — List of Plutus data
- `Map` — Map of Plutus data key-value pairs

### `Action` (Redeemer)

```typescript
interface Action {
  index: number;     // Script input/mint index
  budget: Budget;    // Execution units { mem: number, steps: number }
  tag: RedeemerTag;  // 'SPEND' | 'MINT' | 'CERT' | 'REWARD'
  data: Data;        // Redeemer data
}
```

## Utility Functions

### Asset Helpers

- `parseAssetUnit(unit: string): { policyId: string; assetName: string }` — Split an asset unit into policy ID and asset name
- `mergeAssets(assets: Asset[]): Asset[]` — Merge duplicate asset entries by summing quantities

### Serialization Helpers

- `fromUTF8(utf8: string): string` — Convert UTF-8 string to hex
- `toUTF8(hex: string): string` — Convert hex string to UTF-8
- `fromBytes(bytes: Uint8Array): string` — Convert byte array to hex string
- `toBytes(hex: string): Uint8Array` — Convert hex string to byte array

## Contributing

Please read the [Contributing Guide](../../CONTRIBUTING.md) before submitting pull requests.

## License

[Apache License 2.0](../../LICENSE.md)
