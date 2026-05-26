# @meshsdk/wallet

Wallet utilities and implementations for the Mesh SDK. This package provides browser wallet integrations, embedded wallet support, and read-only wallet capabilities for Cardano dApps.

## Installation

```bash
npm install @meshsdk/wallet
```

## Overview

The `@meshsdk/wallet` package provides three main wallet implementations:

- **BrowserWallet** — Integrates with CIP-30 compliant browser extension wallets (Eternl, Nami, Flint, etc.)
- **MeshWallet** — A fully-featured embedded wallet with mnemonic/private key support
- **ReadOnlyWallet** — A read-only wallet for monitoring addresses without signing capability

## Usage

### BrowserWallet

Connect to a browser extension wallet that implements the [CIP-30](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0030) standard.

```typescript
import { BrowserWallet } from '@meshsdk/wallet';

// Get list of installed wallets
const wallets = await BrowserWallet.getInstalledWallets();

// Connect to a specific wallet
const wallet = await BrowserWallet.enable('eternl');

// Get wallet addresses
const address = await wallet.getChangeAddress();
const addresses = await wallet.getUsedAddresses();

// Get balance
const balance = await wallet.getBalance();

// Get UTxOs
const utxos = await wallet.getUtxos();

// Sign and submit a transaction
const signedTx = await wallet.signTx(unsignedTxCbor);
const txHash = await wallet.submitTx(signedTx);
```

### MeshWallet

A full-featured, embedded wallet that can be used in Node.js or browser environments without requiring a browser extension.

```typescript
import { MeshWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/provider';

const provider = new BlockfrostProvider('YOUR_PROJECT_ID');

// Initialize from mnemonic phrase
const wallet = new MeshWallet({
  networkId: 0, // 0 = testnet, 1 = mainnet
  fetcher: provider,
  submitter: provider,
  key: {
    type: 'mnemonic',
    words: ['word1', 'word2', '...'], // 24-word mnemonic
  },
});

// Initialize from private key
const walletFromKey = new MeshWallet({
  networkId: 1,
  fetcher: provider,
  submitter: provider,
  key: {
    type: 'root',
    bech32: 'xprv1...',
  },
});

// Generate a new mnemonic
const mnemonic = MeshWallet.brew();
console.log(mnemonic); // ['word1', 'word2', ...]

// Get wallet address
const address = await wallet.getChangeAddress();

// Get UTxOs
const utxos = await wallet.getUtxos();

// Sign a transaction
const signedTx = await wallet.signTx(unsignedTxCbor);

// Submit a transaction
const txHash = await wallet.submitTx(signedTx);
```

### ReadOnlyWallet

A wallet for read-only access — useful for querying balances and UTxOs without private key access.

```typescript
import { ReadOnlyWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/provider';

const provider = new BlockfrostProvider('YOUR_PROJECT_ID');

const wallet = new ReadOnlyWallet({
  address: 'addr1...',
  fetcher: provider,
});

const utxos = await wallet.getUtxos();
const balance = await wallet.getBalance();
```

## API Reference

### BrowserWallet

#### Static Methods

- `BrowserWallet.getInstalledWallets(): Promise<WalletInfo[]>` — Returns list of available browser wallet extensions
- `BrowserWallet.enable(walletName: string, extensions?: number[]): Promise<BrowserWallet>` — Enables and connects to a wallet by name

#### Instance Methods

- `getBalance(): Promise<Asset[]>` — Returns the full balance as a list of assets
- `getChangeAddress(): Promise<string>` — Returns the wallet's change address
- `getCollateral(): Promise<UTxO[]>` — Returns UTxOs designated as collateral
- `getNetworkId(): Promise<number>` — Returns the network ID (0=testnet, 1=mainnet)
- `getRewardAddresses(): Promise<string[]>` — Returns staking/reward addresses
- `getUnusedAddresses(): Promise<string[]>` — Returns unused payment addresses
- `getUsedAddresses(): Promise<string[]>` — Returns used payment addresses
- `getUtxos(): Promise<UTxO[]>` — Returns all UTxOs controlled by the wallet
- `signData(address: string, payload: string): Promise<DataSignature>` — Signs arbitrary data
- `signTx(unsignedTx: string, partialSign?: boolean): Promise<string>` — Signs a transaction
- `submitTx(tx: string): Promise<string>` — Submits a signed transaction

### MeshWallet

#### Static Methods

- `MeshWallet.brew(strength?: number): string[]` — Generates a new BIP39 mnemonic phrase

#### Constructor Options

```typescript
interface MeshWalletOptions {
  networkId: number;          // 0 for testnet, 1 for mainnet
  fetcher?: IFetcher;         // Provider for fetching chain data
  submitter?: ISubmitter;     // Provider for submitting transactions
  evaluator?: IEvaluator;     // Provider for evaluating scripts
  key: {
    type: 'mnemonic';         // Use BIP39 mnemonic
    words: string[];          // 24-word mnemonic array
  } | {
    type: 'root';             // Use root private key
    bech32: string;           // bech32-encoded xprv key
  } | {
    type: 'cli';              // Use cardano-cli key format
    payment: string;          // Payment signing key (hex or bech32)
    stake?: string;           // Stake signing key (optional)
  } | {
    type: 'address';          // Read-only mode from address
    address: string[];        // Array of addresses to track
  };
}
```

## Contributing

Please read the [Contributing Guide](../../CONTRIBUTING.md) before submitting pull requests.

## License

[Apache License 2.0](../../LICENSE.md)
