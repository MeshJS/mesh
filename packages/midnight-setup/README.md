<div align="center">
  <h3> The fastest way to build on Midnight Network</h3>
  <p>Pre-built smart contract + Complete API + Ready-to-use code snippets</p>
  
  [![npm version](https://img.shields.io/npm/v/@meshsdk/midnight-setup.svg)](https://www.npmjs.com/package/@meshsdk/midnight-setup)
  [![License: MIT](https://img.shields.io/badge/License-Apache2.0-yellow.svg)](https://opensource.org/licenses/Apache2.0)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
</div>

---

> Source repository with a full React integration example and a Compact contract: https://github.com/MeshJS/midnight-setup

---

## Installation

```bash
npm install @meshsdk/midnight-setup
```

**For Midnight Network projects, you'll also need these providers, if you already have them, skip this section:**

```bash
npm install \
  @midnight-ntwrk/dapp-connector-api@3.0.0 \
  @midnight-ntwrk/midnight-js-fetch-zk-config-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-http-client-proof-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-indexer-public-data-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-level-private-state-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-network-id@2.0.2
```

---

## Features

- **Type-safe SDK** - Full TypeScript support
- **Provider abstraction** - Easy wallet and network integration
- **Contract state management** - Query contract and ledger states
- **Flexible contract support** - Works with any Midnight smart contract
- **Lightweight** - Only 10.4 KB package size
- **ESM & CJS** - Supports both module systems

---

## Quick Start

### 1. Setup Providers

```typescript
import { FetchZkConfigProvider } from "@midnight-ntwrk/midnight-js-fetch-zk-config-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";

import type { MidnightSetupContractProviders } from "@meshsdk/midnight-setup";

export async function setupProviders(): Promise<MidnightSetupContractProviders> {
  const wallet = window.midnight?.mnLace;
  if (!wallet) {
    throw new Error("Please install Lace Beta Wallet for Midnight Network");
  }

  const walletAPI = await wallet.enable();
  const walletState = await walletAPI.state();
  const uris = await wallet.serviceUriConfig();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "my-dapp-state",
    }),
    zkConfigProvider: new FetchZkConfigProvider(
      window.location.origin,
      fetch.bind(window),
    ),
    proofProvider: httpClientProofProvider(uris.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(
      uris.indexerUri,
      uris.indexerWsUri,
    ),
    walletProvider: {
      coinPublicKey: walletState.coinPublicKey,
      encryptionPublicKey: walletState.encryptionPublicKey,
      balanceTx: (tx, newCoins) => {
        return walletAPI.balanceAndProveTransaction(tx, newCoins);
      },
    },
    midnightProvider: {
      submitTx: (tx) => {
        return walletAPI.submitTransaction(tx);
      },
    },
  };
}
```

### 2. Deploy a Contract

```typescript
import { MidnightSetupAPI } from "@meshsdk/midnight-setup";

import { setupProviders } from "./providers";

async function deployContract() {
  const providers = await setupProviders();
  const contractInstance = new MyContract({});

  const api = await MidnightSetupAPI.deployContract(
    providers,
    contractInstance,
  );

  console.log("Contract deployed at:", api.deployedContractAddress);
  return api;
}
```

### 3. Join Existing Contract

```typescript
async function joinContract(contractAddress: string) {
  const providers = await setupProviders();
  const contractInstance = new MyContract({});

  const api = await MidnightSetupAPI.joinContract(
    providers,
    contractInstance,
    contractAddress,
  );

  return api;
}
```

### 4. Read Contract State

```typescript
// Get contract state
const contractState = await api.getContractState();
console.log("Contract data:", contractState.data);

// Get ledger state
const ledgerState = await api.getLedgerState();
console.log("Message:", ledgerState.ledgerState?.message);
```

---

## API Reference

### MidnightSetupAPI

#### Static Methods

**`deployContract(providers, contractInstance, logger?)`**

Deploys a new smart contract to Midnight Network.

**Parameters:**

- `providers: MidnightSetupContractProviders` - Network and wallet providers
- `contractInstance: ContractInstance` - Your compiled contract instance
- `logger?: Logger` - Optional Pino logger

**Returns:** `Promise<MidnightSetupAPI>`

---

**`joinContract(providers, contractInstance, contractAddress, logger?)`**

Connects to an existing deployed contract.

**Parameters:**

- `providers: MidnightSetupContractProviders` - Network and wallet providers
- `contractInstance: ContractInstance` - Your compiled contract instance
- `contractAddress: string` - Address of the deployed contract
- `logger?: Logger` - Optional Pino logger

**Returns:** `Promise<MidnightSetupAPI>`

---

#### Instance Methods

**`getContractState()`** - Gets the current state of the contract

**Returns:** `Promise<ContractStateData>`

**`getLedgerState()`** - Gets and parses the ledger state

**Returns:** `Promise<LedgerStateData>`

---

## TypeScript Types

```typescript
import type {
  ContractInstance,
  ContractStateData,
  DeployedContract,
  DeployedMidnightSetupAPI,
  LedgerStateData,
  MidnightSetupContractProviders,
} from "@meshsdk/midnight-setup";
```

---

## Requirements

- Node.js v18 or higher
- Midnight Lace Wallet browser extension
- TypeScript (recommended)

---

## Links

- [Source Repository](https://github.com/MeshJS/midnight-setup)
- [MeshJS Website](https://meshjs.dev)
- [Midnight Network](https://midnight.network)
- [Midnight Documentation](https://docs.midnight.network)
- [npm Package](https://www.npmjs.com/package/@meshsdk/midnight-setup)

---

## Contributing

Contributions are welcome! Please visit the [source repository](https://github.com/MeshJS/midnight-setup).

---

## License

Apache2.0 © [MeshJS Team](https://github.com/MeshJS)

See [LICENSE](./LICENSE) for more information.

---

## Support

- [Report Issues](https://github.com/MeshJS/midnight-setup/issues)
- [Discord Community](https://discord.gg/hBJNSwXE2S)
- [Twitter](https://twitter.com/meshsdk)

---

<div align="center">
  <p><img src="https://meshjs.dev/logo-mesh/black/logo-mesh-vector.svg" alt="MeshJS Logo" width="30" height="20" style="vertical-align: middle; margin-right: 8px;" /> Powered by <a href="https://meshjs.dev/">MeshJS Team</a></p>
  <p>Built with ❤️ on Midnight Network</p>
</div>
