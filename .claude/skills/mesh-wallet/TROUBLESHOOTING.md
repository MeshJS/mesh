# Wallet Troubleshooting

Common errors and solutions for `@meshsdk/wallet`.

## Table of Contents

- [Connection Errors](#connection-errors)
- [Signing Errors](#signing-errors)
- [Network Errors](#network-errors)
- [Headless Wallet Errors](#headless-wallet-errors)
- [Common Mistakes](#common-mistakes)

---

## Connection Errors

### "Wallet not found" / "No wallet installed"

**Error:**
```
Error: Wallet 'eternl' not found
```

**Cause:** The wallet extension is not installed or not detected.

**Solution:**
```typescript
// Check installed wallets first
const installed = MeshCardanoBrowserWallet.getInstalledWallets();
console.log('Available:', installed.map(w => w.id));

// Only enable if installed
if (installed.some(w => w.id === 'eternl')) {
  const wallet = await MeshCardanoBrowserWallet.enable('eternl');
}
```

---

### "User rejected the request"

**Error:**
```
Error: User rejected the request
```

**Cause:** User declined the connection prompt in their wallet.

**Solution:**
```typescript
try {
  const wallet = await MeshCardanoBrowserWallet.enable('eternl');
} catch (error) {
  if (error.message.includes('rejected')) {
    // Show user-friendly message
    console.log('Please approve the connection in your wallet');
  }
}
```

---

### "Window.cardano is undefined"

**Error:**
```
TypeError: Cannot read property 'eternl' of undefined
```

**Cause:** Running in Node.js or SSR context where `window` doesn't exist.

**Solution:**
```typescript
// Check for browser environment
if (typeof window !== 'undefined' && window.cardano) {
  const wallet = await MeshCardanoBrowserWallet.enable('eternl');
} else {
  console.log('Browser wallet not available in this environment');
}

// For Next.js, use dynamic import
const WalletConnect = dynamic(() => import('./WalletConnect'), { ssr: false });
```

---

## Signing Errors

### "User declined to sign"

**Error:**
```
Error: User declined to sign the transaction
```

**Cause:** User rejected signing in their wallet popup.

**Solution:**
```typescript
try {
  const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
} catch (error) {
  if (error.message.includes('declined')) {
    // Let user know they need to sign
    console.log('Transaction signing was cancelled');
  }
}
```

---

### "Invalid witness" / "Signature verification failed"

**Error:**
```
Error: Invalid witness
```

**Cause:** Transaction was modified after signing, or signed with wrong key.

**Solution:**
```typescript
// Ensure you're using the same transaction hex throughout
const unsignedTx = await txBuilder.complete();

// Don't modify unsignedTx between building and signing
const signedTx = await wallet.signTxReturnFullTx(unsignedTx);

// Don't re-serialize or modify signedTx before submitting
const txHash = await wallet.submitTx(signedTx);
```

---

### "Missing required signer"

**Error:**
```
Error: Missing required signer for key hash: abc123...
```

**Cause:** Transaction requires a signature that the wallet can't provide.

**Solution:**
```typescript
// Check if wallet owns the required key
const addresses = await wallet.getUsedAddressesBech32();
console.log('Wallet addresses:', addresses);

// For multi-sig, use partial signing
const partialSig = await wallet.signTxReturnFullTx(unsignedTx, true);
// Then have other parties sign
```

---

### "Address mismatch in signData"

**Error:**
```
Error: Address does not belong to wallet
```

**Cause:** Trying to sign data with an address the wallet doesn't control.

**Solution:**
```typescript
// Use an address from the wallet
const address = await wallet.getChangeAddressBech32();
const signature = await wallet.signData(address, 'message');

// Don't use arbitrary addresses
// const signature = await wallet.signData('addr_test1qp...', 'message'); // Wrong!
```

---

## Network Errors

### "Network mismatch"

**Error:**
```
Error: Network mismatch - wallet on testnet, transaction for mainnet
```

**Cause:** Building transaction for wrong network.

**Solution:**
```typescript
// Check wallet's network first
const networkId = await wallet.getNetworkId();
console.log('Network:', networkId === 0 ? 'Testnet' : 'Mainnet');

// Build transaction for correct network
const txBuilder = new MeshTxBuilder({
  fetcher: provider,  // Provider should match network
});
```

---

### "Submit failed: Network error"

**Error:**
```
Error: Failed to submit transaction: network error
```

**Cause:** Wallet can't reach the blockchain node.

**Solution:**
```typescript
// Retry with exponential backoff
async function submitWithRetry(wallet, tx, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await wallet.submitTx(tx);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

---

## Headless Wallet Errors

### "Invalid mnemonic"

**Error:**
```
Error: Invalid mnemonic phrase
```

**Cause:** Mnemonic has wrong word count, invalid words, or wrong format.

**Solution:**
```typescript
// Mnemonic must be array of 24 words
const mnemonic = [
  'word1', 'word2', 'word3', 'word4', 'word5', 'word6',
  'word7', 'word8', 'word9', 'word10', 'word11', 'word12',
  'word13', 'word14', 'word15', 'word16', 'word17', 'word18',
  'word19', 'word20', 'word21', 'word22', 'word23', 'word24'
];

// Not a string
// const mnemonic = 'word1 word2 word3...'; // Wrong!

// Not 12 words (unless specifically supported)
// const mnemonic = ['word1', ..., 'word12']; // Wrong for Cardano!
```

---

### "Fetcher required for UTxO operations"

**Error:**
```
Error: Fetcher not configured
```

**Cause:** Headless wallet needs a fetcher to query UTxOs.

**Solution:**
```typescript
import { BlockfrostProvider } from '@meshsdk/core';

const provider = new BlockfrostProvider('your-api-key');

const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: provider,    // Required for getUtxos
  submitter: provider,  // Required for submitTx
});
```

---

### "Empty UTxO set"

**Error:**
```
Error: No UTxOs available
```

**Cause:** Wallet has no funds, or fetcher is pointing to wrong network.

**Solution:**
```typescript
// Verify address matches expected
const address = await wallet.getChangeAddressBech32();
console.log('Address:', address);

// Check UTxOs
const utxos = await wallet.getUtxosMesh();
console.log('UTxO count:', utxos.length);

// If empty, verify:
// 1. Address has received funds
// 2. Provider network matches wallet networkId
// 3. Provider API key is valid
```

---

### "Invalid BIP32 root key"

**Error:**
```
Error: Invalid bech32 root key
```

**Cause:** Root key is malformed or wrong format.

**Solution:**
```typescript
// Bech32 format should start with xprv
const wallet = await MeshCardanoHeadlessWallet.fromBip32Root({
  bech32: 'xprv1qp....',  // Must be valid bech32
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});

// For hex format, use fromBip32RootHex
const wallet = await MeshCardanoHeadlessWallet.fromBip32RootHex({
  hex: 'a4b2c3...',  // Raw hex bytes
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});
```

---

## Common Mistakes

### Using hex addresses instead of bech32

**Wrong:**
```typescript
// Hex address in signData
const sig = await wallet.signData('00a1b2c3...', 'message');
```

**Correct:**
```typescript
// Use bech32 address
const address = await wallet.getChangeAddressBech32();
const sig = await wallet.signData(address, 'message');
```

---

### Not awaiting async methods

**Wrong:**
```typescript
const wallet = MeshCardanoBrowserWallet.enable('eternl');  // Missing await!
const address = wallet.getChangeAddressBech32();  // Returns Promise, not string
```

**Correct:**
```typescript
const wallet = await MeshCardanoBrowserWallet.enable('eternl');
const address = await wallet.getChangeAddressBech32();
```

---

### Using signTx instead of signTxReturnFullTx

**Wrong:**
```typescript
const signedTx = await wallet.signTx(unsignedTx);
await wallet.submitTx(signedTx);  // Fails! signTx returns witness set only
```

**Correct:**
```typescript
const signedTx = await wallet.signTxReturnFullTx(unsignedTx);
await wallet.submitTx(signedTx);  // Works - full transaction with witnesses
```

---

### Wrong network ID

**Wrong:**
```typescript
// Using mainnet ID with testnet provider
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  networkId: 1,  // Mainnet
  fetcher: testnetProvider,  // Testnet provider!
  ...
});
```

**Correct:**
```typescript
// Match network ID with provider
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic,
  networkId: 0,  // Testnet
  fetcher: testnetProvider,  // Testnet provider
  ...
});
```

---

### Forgetting to check collateral

**Wrong:**
```typescript
// Assume collateral exists for script tx
const collateral = await wallet.getCollateralMesh();
// Use in transaction without checking
```

**Correct:**
```typescript
const collateral = await wallet.getCollateralMesh();
if (collateral.length === 0) {
  throw new Error('No collateral available. Set collateral in your wallet.');
}
```

---

## Debug Tips

### Log wallet state

```typescript
async function debugWallet(wallet) {
  console.log('Network:', await wallet.getNetworkId());
  console.log('Change Address:', await wallet.getChangeAddressBech32());
  console.log('Used Addresses:', await wallet.getUsedAddressesBech32());
  console.log('Stake Address:', await wallet.getRewardAddressesBech32());

  const balance = await wallet.getBalanceMesh();
  console.log('Balance:', balance);

  const utxos = await wallet.getUtxosMesh();
  console.log('UTxO count:', utxos.length);
  console.log('Total ADA:', utxos.reduce((sum, u) => {
    const lovelace = u.output.amount.find(a => a.unit === 'lovelace');
    return sum + BigInt(lovelace?.quantity || 0);
  }, BigInt(0)) / BigInt(1_000_000));
}
```

### Check wallet type

```typescript
// Browser wallet vs headless wallet
if (wallet instanceof MeshCardanoBrowserWallet) {
  console.log('Browser wallet - user must approve');
} else if (wallet instanceof MeshCardanoHeadlessWallet) {
  console.log('Headless wallet - signs automatically');
}
```

