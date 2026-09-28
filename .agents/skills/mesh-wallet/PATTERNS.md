# Wallet Patterns

Common wallet patterns and recipes for `@meshsdk/wallet`.

## Table of Contents

- [Browser Wallet](#browser-wallet)
- [Headless Wallet](#headless-wallet)
- [Signing Patterns](#signing-patterns)
- [Integration Patterns](#integration-patterns)

---

## Browser Wallet

### List and Connect to Wallet

```typescript
import { MeshCardanoBrowserWallet } from '@meshsdk/wallet';

// Get installed wallets
const installedWallets = MeshCardanoBrowserWallet.getInstalledWallets();
console.log('Available wallets:', installedWallets.map(w => w.name));

// Let user choose, then connect
const walletName = 'eternl';  // From user selection
const wallet = await MeshCardanoBrowserWallet.enable(walletName);

// Check network
const networkId = await wallet.getNetworkId();
console.log('Network:', networkId === 0 ? 'Testnet' : 'Mainnet');
```

### Get Wallet Info

```typescript
// Get all addresses
const usedAddresses = await wallet.getUsedAddressesBech32();
const changeAddress = await wallet.getChangeAddressBech32();
const stakeAddresses = await wallet.getRewardAddressesBech32();

console.log('Payment address:', usedAddresses[0]);
console.log('Change address:', changeAddress);
console.log('Stake address:', stakeAddresses[0]);

// Get balance
const balance = await wallet.getBalanceMesh();
const adaBalance = balance.find(a => a.unit === 'lovelace');
console.log('ADA Balance:', Number(adaBalance?.quantity || 0) / 1_000_000);

// Get UTxOs
const utxos = await wallet.getUtxosMesh();
console.log('UTxO count:', utxos.length);
```

### Build and Sign Transaction

```typescript
import { MeshTxBuilder } from '@meshsdk/transaction';

// Get wallet data
const utxos = await wallet.getUtxosMesh();
const changeAddress = await wallet.getChangeAddressBech32();

// Build transaction
const txBuilder = new MeshTxBuilder();
const unsignedTx = await txBuilder
  .txOut('addr_test1qp...', [{ unit: 'lovelace', quantity: '5000000' }])
  .changeAddress(changeAddress)
  .selectUtxosFrom(utxos)
  .complete();

// Sign with browser wallet
const signedTx = await wallet.signTxReturnFullTx(unsignedTx);

// Submit
const txHash = await wallet.submitTx(signedTx);
console.log('Transaction submitted:', txHash);
```

### Sign Data (CIP-8 Authentication)

```typescript
// Sign a message for authentication
const address = await wallet.getChangeAddressBech32();
const message = 'Sign in to MyDApp at ' + new Date().toISOString();

const signature = await wallet.signData(address, message);

console.log('Signature:', signature);
// { key: 'a401...', signature: '845846...' }

// Send signature to backend for verification
await fetch('/api/authenticate', {
  method: 'POST',
  body: JSON.stringify({ address, message, signature }),
});
```

### Connect with CIP Extensions

```typescript
// Connect with governance extension (CIP-95)
const wallet = await MeshCardanoBrowserWallet.enable('eternl', [
  { cip: 95 }
]);

// Now governance methods are available (if wallet supports)
```

---

## Headless Wallet

### Create from Mnemonic

```typescript
import { MeshCardanoHeadlessWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/core';

const provider = new BlockfrostProvider('your-api-key');

// 24-word mnemonic
const mnemonic = [
  'abandon', 'beauty', 'clever', 'double', 'energy', 'favorite',
  'garden', 'humble', 'ivory', 'jungle', 'kitchen', 'liberty',
  'monkey', 'noble', 'orange', 'puzzle', 'quantum', 'ribbon',
  'sunset', 'travel', 'useful', 'violin', 'window', 'yellow'
];

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  networkId: 0,  // Testnet
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});

const address = await wallet.getChangeAddressBech32();
console.log('Wallet address:', address);
```

### Create with BIP39 Password

```typescript
// Add extra security with BIP39 password
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  password: 'my-secret-passphrase',  // Extra security
  networkId: 1,  // Mainnet
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});
```

### Create Enterprise Wallet (No Staking)

```typescript
// Enterprise address - no staking capabilities
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  networkId: 0,
  walletAddressType: 'Enterprise',  // No stake key
  fetcher: provider,
  submitter: provider,
});
```

### Server-Side Transaction

```typescript
import { MeshTxBuilder } from '@meshsdk/transaction';

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({...});

// Get wallet data
const utxos = await wallet.getUtxosMesh();
const changeAddress = await wallet.getChangeAddressBech32();

// Build transaction
const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
  evaluator: provider,
});

const unsignedTx = await txBuilder
  .txOut(recipientAddress, [{ unit: 'lovelace', quantity: '10000000' }])
  .changeAddress(changeAddress)
  .selectUtxosFrom(utxos)
  .complete();

// Sign and submit (all server-side)
const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);

console.log('TX submitted:', txHash);
```

### Create from BIP32 Root Key

```typescript
// From bech32-encoded root key
const wallet = await MeshCardanoHeadlessWallet.fromBip32Root({
  bech32: 'xprv1...',  // BIP32 root private key
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});

// Or from hex
const wallet = await MeshCardanoHeadlessWallet.fromBip32RootHex({
  hex: 'a4b2c3...',  // BIP32 root private key hex
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});
```

---

## Signing Patterns

### Multi-Signature Transaction

```typescript
// Build transaction requiring multiple signers
const txBuilder = new MeshTxBuilder();
const unsignedTx = await txBuilder
  .txOut(recipient, amount)
  .requiredSignerHash(signer1PubKeyHash)
  .requiredSignerHash(signer2PubKeyHash)
  .changeAddress(changeAddr)
  .selectUtxosFrom(utxos)
  .complete();

// Signer 1 signs partially
const partialSig1 = await wallet1.signTxReturnFullTx(unsignedTx, true);

// Signer 2 signs
const fullySigned = await wallet2.signTxReturnFullTx(partialSig1, true);

// Submit
const txHash = await wallet1.submitTx(fullySigned);
```

### Low-Level Signing with CardanoSigner

```typescript
import { CardanoSigner } from '@meshsdk/wallet';
import { InMemoryBip32 } from '@meshsdk/wallet';

// Create BIP32 instance
const bip32 = await InMemoryBip32.fromMnemonic(mnemonic);

// Get signer for payment key
const paymentSigner = await bip32.getSigner("m/1852'/1815'/0'/0/0");

// Sign transaction
const signedTx = await CardanoSigner.signTx(
  unsignedTxHex,
  [paymentSigner],
  true  // Return full transaction
);
```

### Sign Data with Specific Key

```typescript
import { CardanoSigner, InMemoryBip32 } from '@meshsdk/wallet';
import { Cardano } from '@cardano-sdk/core';

const bip32 = await InMemoryBip32.fromMnemonic(mnemonic);
const signer = await bip32.getSigner("m/1852'/1815'/0'/0/0");

// Get address hex
const address = Cardano.Address.fromBech32('addr_test1...');
const addressHex = address.toBytes();

// Sign data
const signature = await CardanoSigner.signData(
  'Hello Cardano!',
  addressHex,
  signer
);
```

---

## Integration Patterns

### React Hook for Wallet Connection

```typescript
import { useState, useCallback } from 'react';
import { MeshCardanoBrowserWallet } from '@meshsdk/wallet';

function useWallet() {
  const [wallet, setWallet] = useState<MeshCardanoBrowserWallet | null>(null);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string>('');

  const connect = useCallback(async (walletName: string) => {
    try {
      const w = await MeshCardanoBrowserWallet.enable(walletName);
      const addr = await w.getChangeAddressBech32();
      setWallet(w);
      setAddress(addr);
      setConnected(true);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAddress('');
    setConnected(false);
  }, []);

  return { wallet, connected, address, connect, disconnect };
}
```

### Express.js Endpoint with Headless Wallet

```typescript
import express from 'express';
import { MeshCardanoHeadlessWallet } from '@meshsdk/wallet';
import { MeshTxBuilder, BlockfrostProvider } from '@meshsdk/core';

const app = express();
const provider = new BlockfrostProvider(process.env.BLOCKFROST_KEY!);

// Initialize wallet once at startup
let wallet: MeshCardanoHeadlessWallet;

async function initWallet() {
  wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
    mnemonic: process.env.WALLET_MNEMONIC!.split(' '),
    networkId: 0,
    walletAddressType: 'Base',
    fetcher: provider,
    submitter: provider,
  });
}

app.post('/api/send', async (req, res) => {
  const { recipient, amount } = req.body;

  const utxos = await wallet.getUtxosMesh();
  const changeAddress = await wallet.getChangeAddressBech32();

  const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });
  const unsignedTx = await txBuilder
    .txOut(recipient, [{ unit: 'lovelace', quantity: amount }])
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
  const txHash = await wallet.submitTx(signedTx);

  res.json({ txHash });
});

initWallet().then(() => app.listen(3000));
```

### Verify CIP-8 Signature

```typescript
import { CoseSign1 } from '@meshsdk/wallet';

function verifySignature(
  message: string,
  signature: { key: string; signature: string },
  expectedAddress: string
): boolean {
  try {
    const coseSign1 = CoseSign1.fromCbor(signature.signature);

    // Verify the signature is valid
    const isValid = coseSign1.verifySignature();

    // Verify the address matches
    const signedAddress = coseSign1.getAddress().toString('hex');
    // Compare with expected address

    return isValid;
  } catch (error) {
    return false;
  }
}
```

### Wallet with Custom Provider

```typescript
import { MeshCardanoHeadlessWallet } from '@meshsdk/wallet';

// Custom fetcher implementation
const customFetcher = {
  async fetchAddressUTxOs(address: string) {
    // Your custom implementation
    return [];
  },
  async fetchUTxOs(txHash: string) {
    // Your custom implementation
    return [];
  },
  // ... other IFetcher methods
};

// Custom submitter
const customSubmitter = {
  async submitTx(tx: string) {
    // Your custom implementation
    return 'tx-hash';
  },
};

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: customFetcher,
  submitter: customSubmitter,
});
```
