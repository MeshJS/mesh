---
name: mesh-wallet
description: Use when integrating Cardano wallets with MeshJS SDK. Covers browser wallet connection (CIP-30) for Eternl, Nami, Lace, Flint, and Yoroi, headless server-side wallets from mnemonic or private keys, transaction signing, CIP-8 data signing for authentication, multi-signature workflows, and React wallet integration patterns.
license: Apache-2.0
metadata:
  author: MeshJS
  version: "1.0"
---

# Mesh SDK Wallet Skill

AI-assisted Cardano wallet integration using `@meshsdk/wallet`.

## Package Info

```bash
npm install @meshsdk/wallet
# or
npm install @meshsdk/core  # includes wallet + transaction + provider
```

## Two Wallet Types

| Type | Class | Use Case |
|------|-------|----------|
| **Browser** | `MeshCardanoBrowserWallet` | Web apps - connect to Eternl, Nami, Flint, etc. |
| **Headless** | `MeshCardanoHeadlessWallet` | Server-side, CLI, backend - from mnemonic/keys |

## Quick Reference

### Browser Wallet (CIP-30)

```typescript
import { MeshCardanoBrowserWallet } from '@meshsdk/wallet';

// List installed wallets
const wallets = MeshCardanoBrowserWallet.getInstalledWallets();
// → [{ id: 'eternl', name: 'Eternl', icon: '...', version: '...' }, ...]

// Connect to wallet
const wallet = await MeshCardanoBrowserWallet.enable('eternl');

// Get addresses (Bech32)
const addresses = await wallet.getUsedAddressesBech32();
const changeAddr = await wallet.getChangeAddressBech32();
const stakeAddrs = await wallet.getRewardAddressesBech32();

// Get UTxOs and balance (Mesh format)
const utxos = await wallet.getUtxosMesh();
const balance = await wallet.getBalanceMesh();
const collateral = await wallet.getCollateralMesh();

// Sign and submit
const signedTx = await wallet.signTxReturnFullTx(unsignedTxHex);
const txHash = await wallet.submitTx(signedTx);

// Sign data (CIP-8)
const signature = await wallet.signData(address, 'Hello Cardano!');
```

### Headless Wallet (Server-Side)

```typescript
import { MeshCardanoHeadlessWallet } from '@meshsdk/wallet';
import { BlockfrostProvider } from '@meshsdk/core';

const provider = new BlockfrostProvider('your-api-key');

// From mnemonic
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic: ['word1', 'word2', ...],  // 24 words
  networkId: 0,  // 0 = testnet, 1 = mainnet
  walletAddressType: 'Base',  // 'Base' or 'Enterprise'
  fetcher: provider,
  submitter: provider,
});

// Same API as browser wallet
const address = await wallet.getChangeAddressBech32();
const utxos = await wallet.getUtxosMesh();
const signedTx = await wallet.signTxReturnFullTx(unsignedTxHex);
```

## Files

- [WALLET.md](./WALLET.md) - Complete API reference
- [PATTERNS.md](./PATTERNS.md) - Common wallet patterns
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Error solutions

## CIP-30 Methods

Standard wallet interface methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `getNetworkId()` | `number` | 0 = testnet, 1 = mainnet |
| `getUtxos()` | `string[]` | UTxOs in CBOR hex |
| `getCollateral()` | `string[]` | Collateral UTxOs in CBOR hex |
| `getBalance()` | `string` | Balance in CBOR hex |
| `getUsedAddresses()` | `string[]` | Addresses in hex |
| `getUnusedAddresses()` | `string[]` | Addresses in hex |
| `getChangeAddress()` | `string` | Address in hex |
| `getRewardAddresses()` | `string[]` | Stake addresses in hex |
| `signTx(tx, partial)` | `string` | Witness set in CBOR hex |
| `signData(addr, data)` | `DataSignature` | CIP-8 signature |
| `submitTx(tx)` | `string` | Transaction hash |

## Mesh Extensions

Enhanced methods for better developer experience:

| Method | Returns | Description |
|--------|---------|-------------|
| `getUtxosMesh()` | `UTxO[]` | UTxOs in Mesh format |
| `getCollateralMesh()` | `UTxO[]` | Collateral in Mesh format |
| `getBalanceMesh()` | `Asset[]` | Balance in Mesh format |
| `getUsedAddressesBech32()` | `string[]` | Bech32 addresses |
| `getUnusedAddressesBech32()` | `string[]` | Bech32 addresses |
| `getChangeAddressBech32()` | `string` | Bech32 address |
| `getRewardAddressesBech32()` | `string[]` | Bech32 stake addresses |
| `signTxReturnFullTx(tx, partial)` | `string` | Full signed tx (not just witness) |

## Important Notes

1. **Browser wallet requires user interaction** - `enable()` prompts the user
2. **Headless wallet needs fetcher** - For UTxO queries and signing
3. **Network ID matters** - 0 for testnet/preprod, 1 for mainnet
4. **Collateral is auto-selected** - Returns smallest pure-ADA UTxO >= 5 ADA
