# Wallet API Reference

Complete API documentation for `@meshsdk/wallet`.

## Table of Contents

- [MeshCardanoBrowserWallet](#meshcardanobrowserwallet)
- [MeshCardanoHeadlessWallet](#meshcardanoheadlesswallet)
- [CardanoSigner](#cardanosigner)
- [InMemoryBip32](#inmemorybip32)
- [Types](#types)

---

## MeshCardanoBrowserWallet

Browser-based wallet for connecting to CIP-30 compatible wallets (Eternl, Nami, Flint, Lace, etc.).

### Static Methods

#### getInstalledWallets
Get list of wallets installed in the browser.

```typescript
static getInstalledWallets(): Wallet[]
```

**Returns:**
```typescript
interface Wallet {
  id: string;      // Wallet identifier (e.g., 'eternl', 'nami')
  name: string;    // Display name
  icon: string;    // Base64 icon
  version: string; // API version
}
```

**Example:**
```typescript
const wallets = MeshCardanoBrowserWallet.getInstalledWallets();
// [{ id: 'eternl', name: 'Eternl', icon: 'data:image/...', version: '0.1.0' }]
```

#### enable
Connect to a wallet. Prompts user for permission.

```typescript
static async enable(
  walletName: string,
  extensions?: Extension[]
): Promise<MeshCardanoBrowserWallet>
```

**Parameters:**
- `walletName` - Wallet ID from `getInstalledWallets()` (e.g., 'eternl', 'nami')
- `extensions` - Optional CIP extensions to request (e.g., `[{ cip: 95 }]`)

**Example:**
```typescript
const wallet = await MeshCardanoBrowserWallet.enable('eternl');
// With governance extension
const wallet = await MeshCardanoBrowserWallet.enable('eternl', [{ cip: 95 }]);
```

### Instance Methods

#### getNetworkId
Get the network the wallet is connected to.

```typescript
async getNetworkId(): Promise<number>
```

**Returns:** `0` for testnet, `1` for mainnet

---

#### getUtxos / getUtxosMesh
Get wallet UTxOs.

```typescript
async getUtxos(): Promise<string[]>        // CBOR hex format
async getUtxosMesh(): Promise<UTxO[]>      // Mesh format
```

**Example:**
```typescript
const utxos = await wallet.getUtxosMesh();
// [{
//   input: { txHash: 'abc...', outputIndex: 0 },
//   output: { address: 'addr...', amount: [{ unit: 'lovelace', quantity: '5000000' }] }
// }]
```

---

#### getCollateral / getCollateralMesh
Get collateral UTxOs (for script transactions).

```typescript
async getCollateral(): Promise<string[]>    // CBOR hex format
async getCollateralMesh(): Promise<UTxO[]>  // Mesh format
```

**Note:** Returns the smallest pure-ADA UTxO with at least 5 ADA.

---

#### getBalance / getBalanceMesh
Get wallet balance.

```typescript
async getBalance(): Promise<string>         // CBOR hex format
async getBalanceMesh(): Promise<Asset[]>    // Mesh format
```

**Example:**
```typescript
const balance = await wallet.getBalanceMesh();
// [{ unit: 'lovelace', quantity: '15000000' }, { unit: 'abc...', quantity: '100' }]
```

---

#### getUsedAddresses / getUsedAddressesBech32
Get addresses that have been used.

```typescript
async getUsedAddresses(): Promise<string[]>       // Hex format
async getUsedAddressesBech32(): Promise<string[]> // Bech32 format
```

---

#### getUnusedAddresses / getUnusedAddressesBech32
Get addresses that haven't been used yet.

```typescript
async getUnusedAddresses(): Promise<string[]>       // Hex format
async getUnusedAddressesBech32(): Promise<string[]> // Bech32 format
```

---

#### getChangeAddress / getChangeAddressBech32
Get address for receiving change.

```typescript
async getChangeAddress(): Promise<string>       // Hex format
async getChangeAddressBech32(): Promise<string> // Bech32 format
```

---

#### getRewardAddresses / getRewardAddressesBech32
Get stake/reward addresses.

```typescript
async getRewardAddresses(): Promise<string[]>       // Hex format
async getRewardAddressesBech32(): Promise<string[]> // Bech32 format
```

**Example:**
```typescript
const stakeAddr = await wallet.getRewardAddressesBech32();
// ['stake_test1uq...']
```

---

#### signTx / signTxReturnFullTx
Sign a transaction.

```typescript
async signTx(tx: string, partialSign?: boolean): Promise<string>
async signTxReturnFullTx(tx: string, partialSign?: boolean): Promise<string>
```

**Parameters:**
- `tx` - Transaction in CBOR hex format
- `partialSign` - If `true`, allows partial signing (for multi-sig)

**Returns:**
- `signTx` - Witness set only (CBOR hex)
- `signTxReturnFullTx` - Full transaction with witnesses (CBOR hex)

**Example:**
```typescript
// Get full signed transaction (recommended)
const signedTx = await wallet.signTxReturnFullTx(unsignedTxHex);

// For multi-sig (partial signing)
const partialSig = await wallet.signTxReturnFullTx(unsignedTxHex, true);
```

---

#### signData
Sign arbitrary data (CIP-8).

```typescript
async signData(addressBech32: string, data: string): Promise<DataSignature>
```

**Parameters:**
- `addressBech32` - Address to sign with (bech32)
- `data` - Data to sign (string or hex)

**Returns:**
```typescript
interface DataSignature {
  key: string;       // COSE key (hex)
  signature: string; // COSE signature (hex)
}
```

**Example:**
```typescript
const address = await wallet.getChangeAddressBech32();
const sig = await wallet.signData(address, 'Hello Cardano!');
// { key: 'a401...', signature: '845846...' }
```

---

#### submitTx
Submit a signed transaction.

```typescript
async submitTx(tx: string): Promise<string>
```

**Parameters:**
- `tx` - Signed transaction in CBOR hex

**Returns:** Transaction hash

---

## MeshCardanoHeadlessWallet

Server-side wallet for backend/CLI use. Created from mnemonic, keys, or credentials.

### Static Factory Methods

#### fromMnemonic
Create wallet from 24-word mnemonic.

```typescript
static async fromMnemonic(config: {
  mnemonic: string[];        // 24 words
  password?: string;         // Optional BIP39 password
  networkId: number;         // 0 = testnet, 1 = mainnet
  walletAddressType: 'Base' | 'Enterprise';
  fetcher?: IFetcher;
  submitter?: ISubmitter;
}): Promise<MeshCardanoHeadlessWallet>
```

**Example:**
```typescript
const wallet = await MeshCardanoHeadlessWallet.fromMnemonic({
  mnemonic: [
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'abandon',
    'abandon', 'abandon', 'abandon', 'abandon', 'abandon', 'about'
  ],
  networkId: 0,
  walletAddressType: 'Base',
  fetcher: provider,
  submitter: provider,
});
```

---

#### fromBip32Root
Create wallet from BIP32 root key (bech32 format).

```typescript
static async fromBip32Root(config: {
  bech32: string;            // BIP32 root key in bech32
  networkId: number;
  walletAddressType: 'Base' | 'Enterprise';
  fetcher?: IFetcher;
  submitter?: ISubmitter;
}): Promise<MeshCardanoHeadlessWallet>
```

---

#### fromBip32RootHex
Create wallet from BIP32 root key (hex format).

```typescript
static async fromBip32RootHex(config: {
  hex: string;               // BIP32 root key in hex
  networkId: number;
  walletAddressType: 'Base' | 'Enterprise';
  fetcher?: IFetcher;
  submitter?: ISubmitter;
}): Promise<MeshCardanoHeadlessWallet>
```

---

#### fromCredentialSources
Create wallet from explicit credential sources.

```typescript
static async fromCredentialSources(config: {
  paymentCredentialSource: CredentialSource;
  stakeCredentialSource?: CredentialSource;
  drepCredentialSource?: CredentialSource;
  networkId: number;
  walletAddressType: 'Base' | 'Enterprise';
  fetcher?: IFetcher;
  submitter?: ISubmitter;
}): Promise<MeshCardanoHeadlessWallet>
```

### Instance Methods

Same as `MeshCardanoBrowserWallet`:
- `getNetworkId()`
- `getUtxos()` / `getUtxosMesh()`
- `getCollateral()` / `getCollateralMesh()`
- `getBalance()` / `getBalanceMesh()`
- `getUsedAddresses()` / `getUsedAddressesBech32()`
- `getUnusedAddresses()` / `getUnusedAddressesBech32()`
- `getChangeAddress()` / `getChangeAddressBech32()`
- `getRewardAddresses()` / `getRewardAddressesBech32()`
- `signTx()` / `signTxReturnFullTx()`
- `signData()`
- `submitTx()`

**Note:** Headless wallet is stateless - it doesn't track used/unused addresses. All address methods return the main wallet address.

---

## CardanoSigner

Low-level signing utilities.

### signTx
Sign a transaction with explicit signers.

```typescript
static async signTx(
  tx: string,
  signers: ISigner[],
  returnFullTx?: boolean
): Promise<string>
```

**Parameters:**
- `tx` - Transaction CBOR hex
- `signers` - Array of signer instances
- `returnFullTx` - If `true`, return full tx; otherwise witness set only

---

### signData
Sign data (CIP-8) with explicit signer.

```typescript
static async signData(
  data: string,
  addressHex: string,
  signer: ISigner
): Promise<DataSignature>
```

---

## InMemoryBip32

BIP32 key derivation and management.

### Static Factory Methods

#### fromMnemonic
Create from mnemonic phrase.

```typescript
static async fromMnemonic(
  mnemonic: string[],
  password?: string
): Promise<InMemoryBip32>
```

---

#### fromEntropy
Create from entropy.

```typescript
static async fromEntropy(
  entropy: string,
  password?: string
): Promise<InMemoryBip32>
```

---

#### fromKeyHex
Create from BIP32 private key hex.

```typescript
static fromKeyHex(keyHex: string): InMemoryBip32
```

---

#### fromBech32
Create from bech32-encoded BIP32 key.

```typescript
static fromBech32(bech32: string): InMemoryBip32
```

### Instance Methods

#### getPublicKey
Get BIP32 public key.

```typescript
async getPublicKey(): Promise<string>  // Hex format
```

---

#### getSigner
Get a signer for a derivation path.

```typescript
async getSigner(derivationPath: DerivationPath): Promise<ISigner>
```

**Example:**
```typescript
const signer = await bip32.getSigner("m/1852'/1815'/0'/0/0");
```

---

## Types

### UTxO
```typescript
interface UTxO {
  input: {
    txHash: string;
    outputIndex: number;
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

### Asset
```typescript
interface Asset {
  unit: string;      // 'lovelace' or policyId + assetName
  quantity: string;
}
```

### DataSignature
```typescript
interface DataSignature {
  key: string;       // COSE_Key hex
  signature: string; // COSE_Sign1 hex
}
```

### Extension
```typescript
interface Extension {
  cip: number;  // CIP number (e.g., 95 for governance)
}
```

### CredentialSource
```typescript
type CredentialSource =
  | { type: 'secretManager'; secretManager: ISecretManager }
  | { type: 'pubKeyHash'; pubKeyHash: string }
  | { type: 'scriptHash'; scriptHash: string };
```

### CardanoHeadlessWalletConfig
```typescript
interface CardanoHeadlessWalletConfig {
  addressSource: AddressSource;
  networkId: number;  // 0 = testnet, 1 = mainnet
  walletAddressType: 'Base' | 'Enterprise';
  fetcher?: IFetcher;
  submitter?: ISubmitter;
}
```
