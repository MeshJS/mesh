# @meshsdk/provider

Blockchain data providers for the Mesh SDK. This package offers ready-to-use integrations with popular Cardano blockchain data providers, enabling seamless interaction with the Cardano network.

## Installation

```bash
npm install @meshsdk/provider
```

## Overview

The `@meshsdk/provider` package implements the `IFetcher`, `ISubmitter`, and `IEvaluator` interfaces from `@meshsdk/common`, providing a unified API regardless of which underlying provider you choose.

## Supported Providers

| Provider | Fetcher | Submitter | Evaluator |
|---|---|---|---|
| [Blockfrost](https://blockfrost.io/) | ✅ | ✅ | ✅ |
| [Maestro](https://www.gomaestro.org/) | ✅ | ✅ | ✅ |
| [Koios](https://www.koios.rest/) | ✅ | ✅ | ❌ |
| [U5C (UTxO RPC)](https://utxorpc.org/) | ✅ | ✅ | ✅ |
| [Yaci](https://github.com/bloxbean/yaci-devkit) | ✅ | ✅ | ✅ |

## Usage

### Blockfrost

```typescript
import { BlockfrostProvider } from '@meshsdk/provider';

const provider = new BlockfrostProvider('YOUR_BLOCKFROST_PROJECT_ID');

// Fetch UTxOs at an address
const utxos = await provider.fetchAddressUTxOs('addr1...');

// Submit a signed transaction
const txHash = await provider.submitTx(signedTxCbor);
```

### Maestro

```typescript
import { MaestroProvider } from '@meshsdk/provider';

const provider = new MaestroProvider({
  network: 'Mainnet',
  apiKey: 'YOUR_MAESTRO_API_KEY',
  turboSubmit: false,
});

const utxos = await provider.fetchAddressUTxOs('addr1...');
```

### Koios

```typescript
import { KoiosProvider } from '@meshsdk/provider';

const provider = new KoiosProvider('api', 'YOUR_KOIOS_API_TOKEN');

const utxos = await provider.fetchAddressUTxOs('addr1...');
```

### U5C (UTxO RPC)

```typescript
import { U5CProvider } from '@meshsdk/provider';

const provider = new U5CProvider({
  url: 'https://your-utxorpc-endpoint',
  headers: {
    'dmtr-api-key': 'YOUR_API_KEY',
  },
});
```

### Yaci (Local Devnet)

```typescript
import { YaciProvider } from '@meshsdk/provider';

const provider = new YaciProvider('http://localhost:8080/api/v1');
```

## API Reference

### Common Interface Methods

All providers implement a common set of methods:

#### Fetcher Methods

- `fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]>` — Fetch UTxOs at an address, optionally filtered by asset
- `fetchAssetAddresses(asset: string): Promise<{ address: string; quantity: string }[]>` — Fetch addresses holding a specific asset
- `fetchAssetMetadata(asset: string): Promise<AssetMetadata>` — Fetch metadata for an asset
- `fetchBlockInfo(hash: string): Promise<BlockInfo>` — Fetch block information by hash
- `fetchCollectionAssets(policyId: string, cursor?: string | number): Promise<{ assets: Asset[]; next?: string | number }>` — Fetch assets in a policy collection
- `fetchHandleAddress(handle: string): Promise<string>` — Resolve an ADA Handle to an address
- `fetchProtocolParameters(epoch?: number): Promise<Protocol>` — Fetch current protocol parameters
- `fetchTxInfo(hash: string): Promise<TransactionInfo>` — Fetch transaction information
- `fetchUTxOs(hash: string, index?: number): Promise<UTxO[]>` — Fetch UTxOs by transaction hash

#### Submitter Methods

- `submitTx(tx: string): Promise<string>` — Submit a signed CBOR transaction, returns tx hash

#### Evaluator Methods

- `evaluateTx(tx: string): Promise<Omit<Action, 'data'>[]>` — Evaluate script execution units for a transaction

## Contributing

Please read the [Contributing Guide](../../CONTRIBUTING.md) before submitting pull requests.

## License

[Apache License 2.0](../../LICENSE.md)
