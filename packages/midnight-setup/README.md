# @meshsdk/midnight-setup

<div align="center">
  <h3>🚀 The fastest way to build on Midnight Network</h3>
  <p>Pre-built smart contract + Complete API + Ready-to-use code snippets</p>
  
  [![npm version](https://img.shields.io/npm/v/@meshsdk/midnight-setup.svg)](https://www.npmjs.com/package/@meshsdk/midnight-setup)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
</div>

---

## ⚡ Quick Start (2 minutes)

### Step 1: Install

```bash
npm install @meshsdk/midnight-setup \
  @midnight-ntwrk/dapp-connector-api@3.0.0 \
  @midnight-ntwrk/midnight-js-fetch-zk-config-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-http-client-proof-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-indexer-public-data-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-level-private-state-provider@2.0.2 \
  @midnight-ntwrk/midnight-js-network-id@2.0.2
```

**What happens automatically:**
- ✅ ZK parameters are downloaded to `.cache/midnight/zk-params/`
- ✅ All dependencies are installed
- ✅ Your project is ready to use Midnight Network

> **Note:** The ZK params download (~50MB) runs automatically after installation. If it fails, you can run it manually:
> ```bash
> sh node_modules/@meshsdk/midnight-setup/fetch-zk-params.sh
> ```

### Step 2: Install Lace Beta Wallet

Download and install: [Lace Beta Wallet for Midnight](https://chromewebstore.google.com/detail/lace-beta/djcdfchkaijggdjokfomholkalbffgil)

1. Create a new wallet
2. Switch to **Midnight Testnet** in settings
3. Make sure you have at least one account

### Step 3: Setup Your Project (Copy Required Files)

See the **"🎯 Complete Hello World"** section below for all the files you need to copy.

### Step 4: Run Your dApp

```bash
npm run dev
```

Open http://localhost:5173 and click "Deploy New Contract"

**That's it! You have a working Midnight dApp!** 🎉

---

## 🚀 Quick Deploy - One Code Block

```typescript
import { MidnightSetupAPI } from '@meshsdk/midnight-setup';
import { setupProviders } from './providers'; // See below ⬇️

async function deployMyContract() {
  // 1. Setup providers (wallet connection)
  const providers = await setupProviders();
  
  // 2. Deploy contract
  const api = await MidnightSetupAPI.deployMidnightSetupContract(providers);
  
  // 3. Read the state
  const state = await api.getLedgerState();
  
  console.log('✅ Contract deployed at:', api.deployedContractAddress);
  console.log('💬 Message:', state.ledgerState?.message);
  // Output: "Made with ❤️ by MeshJS team!"
}
```

---

## 🎯 Complete Hello World - Copy & Paste These Files

Here's a **complete working dApp** you can copy and paste. Create these files in your project:

### File Structure
```
my-midnight-dapp/
├── src/
│   ├── lib/
│   │   └── providers.ts          ← Copy this
│   ├── hooks/
│   │   └── useMidnightContract.ts ← Copy this
│   ├── App.tsx                    ← Copy this
│   ├── polyfills.ts              ← Copy this
│   └── main.tsx                   ← Update this
├── index.html
├── vite.config.ts                 ← Update this
└── package.json
```

### 📄 File 1: `src/polyfills.ts`
```typescript
import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window.global || window;
window.process = window.process || { env: {} };

export { Buffer };
```

### 📄 File 2: `src/lib/providers.ts`
```typescript
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { MidnightSetupContractProviders } from '@meshsdk/midnight-setup';

export async function setupProviders(): Promise<MidnightSetupContractProviders> {
  // Connect to Lace Wallet
  const wallet = window.midnight?.mnLace;
  if (!wallet) {
    throw new Error('Please install Lace Beta Wallet for Midnight Network');
  }

  // Enable wallet and get state
  const walletAPI = await wallet.enable();
  const walletState = await walletAPI.state();
  const uris = await wallet.serviceUriConfig();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'my-dapp-state',
    }),
    zkConfigProvider: new FetchZkConfigProvider(
      window.location.origin,
      fetch.bind(window)
    ),
    proofProvider: httpClientProofProvider(uris.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(
      uris.indexerUri,
      uris.indexerWsUri
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

// TypeScript declaration for window.midnight
declare global {
  interface Window {
    midnight?: {
      mnLace?: any;
    };
  }
}
```

### 📄 File 3: `src/hooks/useMidnightContract.ts`
```typescript
import { useState, useCallback } from 'react';
import { MidnightSetupAPI, type DeployedMidnightSetupAPI } from '@meshsdk/midnight-setup';
import { setupProviders } from '../lib/providers';

export function useMidnightContract() {
  const [api, setApi] = useState<DeployedMidnightSetupAPI | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deployContract = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const providers = await setupProviders();
      const newApi = await MidnightSetupAPI.deployMidnightSetupContract(providers);
      setApi(newApi);
      return newApi;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deploy';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const joinContract = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      const providers = await setupProviders();
      const newApi = await MidnightSetupAPI.joinMidnightSetupContract(providers, address);
      setApi(newApi);
      return newApi;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    api,
    loading,
    error,
    deployContract,
    joinContract,
  };
}
```

### 📄 File 4: `src/App.tsx`
```typescript
import { useState, useEffect } from 'react';
import { useMidnightContract } from './hooks/useMidnightContract';

function App() {
  const { api, loading, error, deployContract, joinContract } = useMidnightContract();
  const [message, setMessage] = useState<string>('');
  const [contractAddress, setContractAddress] = useState('');

  // Read contract state when API is ready
  useEffect(() => {
    if (api) {
      api.getLedgerState().then(state => {
        setMessage(state.ledgerState?.message || '');
      });
    }
  }, [api]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ 
        background: 'white', 
        padding: '40px', 
        borderRadius: '16px', 
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxWidth: '500px',
        width: '100%'
      }}>
        <h1 style={{ 
          margin: '0 0 10px 0', 
          fontSize: '28px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          🌙 My Midnight dApp
        </h1>
        <p style={{ color: '#666', margin: '0 0 30px 0' }}>
          Built with @meshsdk/midnight-setup
        </p>

        {/* Deploy new contract */}
        {!api && (
          <div style={{ marginBottom: '20px' }}>
            <button 
              onClick={deployContract} 
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 24px',
                fontSize: '16px',
                fontWeight: '600',
                color: 'white',
                background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {loading ? '⏳ Deploying...' : '🚀 Deploy New Contract'}
            </button>

            <div style={{ 
              margin: '20px 0', 
              padding: '20px 0',
              borderTop: '1px solid #eee',
              borderBottom: '1px solid #eee'
            }}>
              <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
                Or join existing contract:
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Contract address"
                  value={contractAddress}
                  onChange={(e) => setContractAddress(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '14px',
                    border: '2px solid #e0e0e0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                  onBlur={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
                />
                <button
                  onClick={() => joinContract(contractAddress)}
                  disabled={loading || !contractAddress}
                  style={{
                    padding: '10px 20px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'white',
                    background: (loading || !contractAddress) ? '#ccc' : '#667eea',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: (loading || !contractAddress) ? 'not-allowed' : 'pointer',
                  }}
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show error */}
        {error && (
          <div style={{ 
            padding: '12px', 
            background: '#fee', 
            color: '#c00', 
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            ❌ {error}
          </div>
        )}

        {/* Show contract info */}
        {api && (
          <div style={{ 
            padding: '20px', 
            background: 'linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%)', 
            borderRadius: '8px',
            border: '2px solid #48bb78'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#2f855a' }}>
              ✅ Contract Connected
            </h3>
            <div style={{ fontSize: '14px', color: '#2d3748' }}>
              <p style={{ margin: '8px 0' }}>
                <strong>📍 Address:</strong><br />
                <code style={{ 
                  background: 'white', 
                  padding: '4px 8px', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  display: 'inline-block',
                  marginTop: '4px',
                  wordBreak: 'break-all'
                }}>
                  {api.deployedContractAddress}
                </code>
              </p>
              <p style={{ margin: '12px 0' }}>
                <strong>💬 Message:</strong><br />
                <span style={{
                  background: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  marginTop: '4px'
                }}>
                  {message || 'Loading...'}
                </span>
              </p>
            </div>
          </div>
        )}

        <div style={{ 
          marginTop: '30px', 
          paddingTop: '20px', 
          borderTop: '1px solid #eee',
          textAlign: 'center',
          color: '#999',
          fontSize: '12px'
        }}>
          Made with ❤️ by MeshJS Team
        </div>
      </div>
    </div>
  );
}

export default App;
```

### 📄 File 5: `src/main.tsx`
```typescript
import './polyfills'; // ← Add this FIRST
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 📄 File 6: `vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
    },
  },
});
```

### 📄 File 7: `package.json` dependencies
```json
{
  "dependencies": {
    "@meshsdk/midnight-setup": "^1.0.0",
    "@midnight-ntwrk/dapp-connector-api": "3.0.0",
    "@midnight-ntwrk/midnight-js-fetch-zk-config-provider": "2.0.2",
    "@midnight-ntwrk/midnight-js-http-client-proof-provider": "2.0.2",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider": "2.0.2",
    "@midnight-ntwrk/midnight-js-level-private-state-provider": "2.0.2",
    "@midnight-ntwrk/midnight-js-network-id": "2.0.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "buffer": "^6.0.3",
    "process": "^0.11.10"
  }
}
```

### 🚀 Run Your dApp

```bash
# 1. Install all dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open http://localhost:5173 in your browser
# 4. Make sure Lace Beta Wallet is installed
# 5. Click "Deploy New Contract"
```

**That's it!** You now have a fully working Midnight Network dApp. 🎉

---

## 📋 Ready-to-Use Code Snippets

### 1. Provider Setup (Copy this helper function)

Create `src/lib/providers.ts`:

```typescript
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import type { MidnightSetupContractProviders } from '@meshsdk/midnight-setup';

export async function setupProviders(): Promise<MidnightSetupContractProviders> {
  // Connect to Lace Wallet
  const wallet = window.midnight?.mnLace;
  if (!wallet) {
    throw new Error('Please install Lace Beta Wallet for Midnight Network');
  }

  // Enable wallet and get state
  const walletAPI = await wallet.enable();
  const walletState = await walletAPI.state();
  const uris = await wallet.serviceUriConfig();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'my-dapp-state',
    }),
    zkConfigProvider: new FetchZkConfigProvider(
      window.location.origin,
      fetch.bind(window)
    ),
    proofProvider: httpClientProofProvider(uris.proverServerUri),
    publicDataProvider: indexerPublicDataProvider(
      uris.indexerUri,
      uris.indexerWsUri
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

**Save this file once, use it everywhere in your project.** ✅

---

### 2. React Hook (Copy & Paste - Production Ready)

Create `src/hooks/useMidnightContract.ts`:

```typescript
import { useState, useCallback } from 'react';
import { MidnightSetupAPI, type DeployedMidnightSetupAPI } from '@meshsdk/midnight-setup';
import { setupProviders } from '../lib/providers';

export function useMidnightContract() {
  const [api, setApi] = useState<DeployedMidnightSetupAPI | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deployContract = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const providers = await setupProviders();
      const newApi = await MidnightSetupAPI.deployMidnightSetupContract(providers);
      setApi(newApi);
      return newApi;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deploy';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const joinContract = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      const providers = await setupProviders();
      const newApi = await MidnightSetupAPI.joinMidnightSetupContract(providers, address);
      setApi(newApi);
      return newApi;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    api,
    loading,
    error,
    deployContract,
    joinContract,
  };
}
```

**Usage in your component:**

```typescript
import { useMidnightContract } from './hooks/useMidnightContract';

function MyComponent() {
  const { api, loading, error, deployContract } = useMidnightContract();

  return (
    <div>
      <button onClick={deployContract} disabled={loading}>
        {loading ? 'Deploying...' : 'Deploy Contract'}
      </button>
      {error && <p>Error: {error}</p>}
      {api && <p>Contract: {api.deployedContractAddress}</p>}
    </div>
  );
}
```

---

### 3. Complete React Component (Copy & Run)

```typescript
import { useState, useEffect } from 'react';
import { useMidnightContract } from './hooks/useMidnightContract';

export function MidnightDApp() {
  const { api, loading, error, deployContract, joinContract } = useMidnightContract();
  const [message, setMessage] = useState<string>('');
  const [contractAddress, setContractAddress] = useState('');

  // Read contract state when API is ready
  useEffect(() => {
    if (api) {
      api.getLedgerState().then(state => {
        setMessage(state.ledgerState?.message || '');
      });
    }
  }, [api]);

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>My Midnight dApp</h1>

      {/* Deploy new contract */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={deployContract} 
          disabled={loading || !!api}
          style={{ padding: '10px 20px', marginRight: '10px' }}
        >
          {loading ? 'Deploying...' : 'Deploy New Contract'}
        </button>

        {/* Or join existing */}
        <div style={{ marginTop: '10px' }}>
          <input
            type="text"
            placeholder="Contract address to join"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            style={{ padding: '8px', width: '300px' }}
          />
          <button
            onClick={() => joinContract(contractAddress)}
            disabled={loading || !contractAddress || !!api}
            style={{ padding: '8px 16px', marginLeft: '10px' }}
          >
            Join Contract
          </button>
        </div>
      </div>

      {/* Show error */}
      {error && (
        <div style={{ padding: '10px', background: '#fee', color: '#c00', borderRadius: '4px' }}>
          Error: {error}
        </div>
      )}

      {/* Show contract info */}
      {api && (
        <div style={{ padding: '15px', background: '#efe', borderRadius: '4px' }}>
          <h3>✅ Contract Ready</h3>
          <p><strong>Address:</strong> {api.deployedContractAddress}</p>
          <p><strong>Message:</strong> {message}</p>
        </div>
      )}
    </div>
  );
}
```

**This component is production-ready. Just import and use it!** 🎉

---

## 🔥 Common Use Cases (Copy These)

### Deploy and Save Address

```typescript
const api = await MidnightSetupAPI.deployMidnightSetupContract(providers);

// Save to localStorage for later use
localStorage.setItem('myContractAddress', api.deployedContractAddress);

console.log('✅ Deployed:', api.deployedContractAddress);
```

### Load Existing Contract

```typescript
const savedAddress = localStorage.getItem('myContractAddress');

if (savedAddress) {
  const api = await MidnightSetupAPI.joinMidnightSetupContract(
    providers,
    savedAddress
  );
  console.log('✅ Reconnected to contract');
}
```

### Read Contract State

```typescript
// Get full contract state
const contractState = await api.getContractState();
console.log('Raw data:', contractState.data);
console.log('Block:', contractState.blockHeight);

// Get parsed ledger state (easier to use)
const ledgerState = await api.getLedgerState();
console.log('Message:', ledgerState.ledgerState?.message);
```

### Listen to State Changes (Real-time)

```typescript
api.state.subscribe({
  next: (state) => {
    console.log('State updated:', state);
    // Update your UI here
  },
  error: (err) => {
    console.error('State error:', err);
  }
});
```

### With Logging (for Development)

```typescript
import pino from 'pino';

const logger = pino({ level: 'debug' });

const api = await MidnightSetupAPI.deployMidnightSetupContract(
  providers,
  logger
);

// Now you'll see detailed logs in console
```

---

## 🎨 Next.js Example (App Router)

Create `app/midnight/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { MidnightSetupAPI } from '@meshsdk/midnight-setup';
import { setupProviders } from '@/lib/providers';

export default function MidnightPage() {
  const [status, setStatus] = useState('');

  const deployContract = async () => {
    try {
      setStatus('Deploying...');
      
      const providers = await setupProviders();
      const api = await MidnightSetupAPI.deployMidnightSetupContract(providers);
      
      setStatus(`✅ Deployed at: ${api.deployedContractAddress}`);
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
  };

  return (
    <main className="p-8">
      <h1 className="text-2xl mb-4">Midnight dApp</h1>
      <button 
        onClick={deployContract}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Deploy Contract
      </button>
      {status && <p className="mt-4">{status}</p>}
    </main>
  );
}
```

---

## 🛠️ Vite + React Setup

### 1. Install Vite polyfills

```bash
npm install buffer process
```

### 2. Create `src/polyfills.ts`:

```typescript
import { Buffer } from 'buffer';

window.Buffer = Buffer;
window.global = window.global || window;
window.process = window.process || { env: {} };

export { Buffer };
```

### 3. Import in `src/main.tsx`:

```typescript
import './polyfills'; // Add this first
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 4. Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
    },
  },
});
```

---

## 📦 What's Included

This package gives you everything you need:

- ✅ **Pre-compiled Smart Contract** - No need to learn Compact
- ✅ **Complete TypeScript API** - Full type safety
- ✅ **Wallet Integration** - Works with Lace Beta Wallet
- ✅ **State Management** - Private & public state handling
- ✅ **Zero Configuration** - Just install and use

---

## 📚 API Reference

### `MidnightSetupAPI.deployMidnightSetupContract(providers, logger?)`

Deploy a new contract.

**Parameters:**
- `providers: MidnightSetupContractProviders` - Required (see provider setup above)
- `logger?: Logger` - Optional Pino logger

**Returns:** `Promise<MidnightSetupAPI>`

**Example:**
```typescript
const api = await MidnightSetupAPI.deployMidnightSetupContract(providers);
```

---

### `MidnightSetupAPI.joinMidnightSetupContract(providers, address, logger?)`

Connect to existing contract.

**Parameters:**
- `providers: MidnightSetupContractProviders` - Required
- `address: string` - Contract address
- `logger?: Logger` - Optional

**Returns:** `Promise<MidnightSetupAPI>`

**Example:**
```typescript
const api = await MidnightSetupAPI.joinMidnightSetupContract(
  providers,
  '0x123abc...'
);
```

---

### `api.getContractState()`

Get raw contract state.

**Returns:** `Promise<ContractStateData>`

```typescript
const state = await api.getContractState();
// {
//   address: string,
//   data: unknown,
//   blockHeight?: string,
//   blockHash?: string,
//   error?: string
// }
```

---

### `api.getLedgerState()`

Get parsed ledger state.

**Returns:** `Promise<LedgerStateData>`

```typescript
const ledger = await api.getLedgerState();
// {
//   address: string,
//   ledgerState?: {
//     message: string | null
//   },
//   blockHeight?: string,
//   error?: string
// }
```

---

### `api.deployedContractAddress`

Get contract address.

**Type:** `string`

```typescript
console.log(api.deployedContractAddress);
// "0x123abc..."
```

---

### `api.state`

Observable for state changes.

**Type:** `Observable<DerivedMidnightSetupContractState>`

```typescript
api.state.subscribe(state => {
  console.log('New state:', state);
});
```

---

## 🔐 TypeScript Types

All types are fully exported:

```typescript
import type {
  MidnightSetupAPI,
  DeployedMidnightSetupAPI,
  MidnightSetupContractProviders,
  ContractStateData,
  LedgerStateData,
  DerivedMidnightSetupContractState,
  TokenCircuitKeys,
} from '@meshsdk/midnight-setup';
```

---

## 🔗 Resources

- 📖 [Midnight Network Docs](https://docs.midnight.network)
- 💬 [MeshJS Discord](https://discord.gg/meshjs)
- 🐛 [Report Issues](https://github.com/MeshJS/midnight-setup/issues)
- 💻 [Source Code](https://github.com/MeshJS/midnight-setup)
- 🌐 [MeshJS Website](https://meshjs.dev)

---

## 📄 License

MIT © [MeshJS Team](https://github.com/MeshJS)

---

## ⚡ Start Building Now

```bash
npm install @meshsdk/midnight-setup
```

Copy the code snippets above and start building your Midnight dApp in minutes! 🚀

**Questions?** [Open an issue](https://github.com/MeshJS/midnight-setup/issues) and we'll help you.

---

<div align="center">
  <p>Made with ❤️ by <a href="https://github.com/MeshJS">MeshJS Team</a></p>
</div>
