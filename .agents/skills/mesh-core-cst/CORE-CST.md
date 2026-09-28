# Core CST API Reference

Complete API documentation for `@meshsdk/core-cst`.

## Table of Contents

- [Resolvers](#resolvers)
- [CardanoSDKSerializer](#cardanosdkserializer)
- [Message Signing](#message-signing)
- [Plutus Tools](#plutus-tools)
- [Data Utilities](#data-utilities)
- [Address Utilities](#address-utilities)
- [Re-exports](#re-exports)

---

## Resolvers

Functions to extract hashes and addresses from various inputs.

### resolveDataHash

Get the hash of Plutus data.

```typescript
function resolveDataHash(
  rawData: BuilderData['content'],
  type?: PlutusDataType  // 'Mesh' | 'JSON' | 'CBOR', default 'Mesh'
): string
```

**Example:**
```typescript
const hash = resolveDataHash({ constructor: 0, fields: [] });
// '923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec'
```

---

### resolvePaymentKeyHash

Extract payment key hash from a bech32 address.

```typescript
function resolvePaymentKeyHash(bech32: string): string
```

**Example:**
```typescript
const keyHash = resolvePaymentKeyHash('addr_test1qp...');
// 'abc123def456...'
```

---

### resolveStakeKeyHash

Extract stake key hash from a bech32 address.

```typescript
function resolveStakeKeyHash(bech32: string): string
```

**Works with:** Base addresses and reward addresses.

---

### resolveRewardAddress

Get the reward/stake address from a base address.

```typescript
function resolveRewardAddress(bech32: string): string
```

**Example:**
```typescript
const rewardAddr = resolveRewardAddress('addr_test1qp...');
// 'stake_test1uq...'
```

---

### resolvePlutusScriptAddress

Get the address of a Plutus script.

```typescript
function resolvePlutusScriptAddress(
  script: PlutusScript,  // { code: string, version: 'V1' | 'V2' | 'V3' }
  networkId?: number     // 0 = testnet, 1 = mainnet
): string
```

**Example:**
```typescript
const addr = resolvePlutusScriptAddress(
  { code: '59010100...', version: 'V2' },
  0
);
// 'addr_test1wz...'
```

---

### resolvePlutusScriptHash

Get script hash from an enterprise script address.

```typescript
function resolvePlutusScriptHash(bech32: string): string
```

---

### resolveNativeScriptAddress

Get address from a native script.

```typescript
function resolveNativeScriptAddress(
  script: NativeScript,
  networkId?: number
): string
```

**Example:**
```typescript
const addr = resolveNativeScriptAddress({
  type: 'all',
  scripts: [
    { type: 'sig', keyHash: 'abc...' },
    { type: 'sig', keyHash: 'def...' },
  ]
}, 0);
```

---

### resolveNativeScriptHash

Get hash of a native script.

```typescript
function resolveNativeScriptHash(script: NativeScript): string
```

---

### resolvePoolId

Convert pool key hash to pool ID (bech32).

```typescript
function resolvePoolId(hash: string): string
```

**Example:**
```typescript
const poolId = resolvePoolId('abc123...');
// 'pool1...'
```

---

### resolvePrivateKey

Derive private key from mnemonic words.

```typescript
function resolvePrivateKey(words: string[]): string
```

**Returns:** BIP32 root key in bech32 format (`xprv1...`)

---

### resolveTxHash

Get transaction hash from CBOR hex.

```typescript
function resolveTxHash(txHex: string): string
```

**Example:**
```typescript
const hash = resolveTxHash(signedTxCbor);
// '3b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b7'
```

---

### resolveScriptRef

Serialize a script for use as reference script.

```typescript
function resolveScriptRef(script: PlutusScript | NativeScript): string
```

**Returns:** CBOR hex suitable for `scriptRef` field in outputs.

---

### resolveScriptHashDRepId

Convert script hash to DRep ID (CIP-129).

```typescript
function resolveScriptHashDRepId(scriptHash: string): string
```

---

### resolveEd25519KeyHash

Get Ed25519 key hash from address.

```typescript
function resolveEd25519KeyHash(bech32: string): string
```

---

## CardanoSDKSerializer

Main serializer class implementing `IMeshTxSerializer`.

### Constructor

```typescript
class CardanoSDKSerializer {
  constructor(protocolParams?: Protocol)
}
```

### serializeTxBody

Serialize a MeshTxBuilder body to CBOR.

```typescript
serializeTxBody(
  txBuilderBody: MeshTxBuilderBody,
  protocolParams?: Protocol
): string
```

---

### serializeTxBodyWithMockSignatures

Serialize with mock signatures for fee calculation.

```typescript
serializeTxBodyWithMockSignatures(
  txBuilderBody: MeshTxBuilderBody,
  protocolParams: Protocol
): string
```

---

### addSigningKeys

Add signatures to a transaction.

```typescript
addSigningKeys(txHex: string, signingKeys: string[]): string
```

**Parameters:**
- `txHex` - Transaction CBOR
- `signingKeys` - Array of private key hex strings

---

### serializeData

Serialize BuilderData to CBOR.

```typescript
serializeData(data: BuilderData): string
```

---

### serializeAddress

Build address from components.

```typescript
serializeAddress(
  address: Partial<DeserializedAddress>,
  networkId?: 0 | 1
): string
```

**Example:**
```typescript
const addr = serializer.serializeAddress({
  pubKeyHash: 'abc123...',
  stakeCredentialHash: 'def456...',
}, 0);
```

---

### serializeRewardAddress

Build reward address from stake key hash.

```typescript
serializeRewardAddress(
  stakeKeyHash: string,
  isScriptHash?: boolean,
  networkId?: 0 | 1
): string
```

---

### serializePoolId

Convert key hash to pool ID.

```typescript
serializePoolId(hash: string): string
```

---

### serializeValue

Serialize asset array to CBOR.

```typescript
serializeValue(value: Asset[]): string
```

---

### serializeOutput

Serialize transaction output to CBOR.

```typescript
serializeOutput(output: Output): string
```

---

### deserializer

Nested object with deserialization methods.

```typescript
deserializer: {
  key: {
    deserializeAddress(bech32: string): DeserializedAddress
  },
  script: {
    deserializeNativeScript(script: NativeScript): DeserializedScript
    deserializePlutusScript(script: PlutusScript): DeserializedScript
  },
  cert: {
    deserializePoolId(poolId: string): string  // Returns key hash
  }
}
```

---

### resolver

Nested object with resolution methods.

```typescript
resolver: {
  keys: {
    resolveStakeKeyHash(bech32: string): string
    resolvePrivateKey(words: string[]): string
    resolveRewardAddress(bech32: string): string
    resolveEd25519KeyHash(bech32: string): string
  },
  tx: {
    resolveTxHash(txHex: string): string
  },
  data: {
    resolveDataHash(rawData, type?): string
  },
  script: {
    resolveScriptRef(script): string
  }
}
```

---

## Message Signing

CIP-8 COSE message signing utilities.

### signData

Sign data with a signer.

```typescript
function signData(data: string, signer: Signer): DataSignature
```

**Parameters:**
- `data` - String to sign (plain text or hex)
- `signer` - Object with `key` (Ed25519PrivateKey) and `address` (Address)

**Returns:**
```typescript
interface DataSignature {
  key: string;       // COSE_Key hex
  signature: string; // COSE_Sign1 hex
}
```

---

### checkSignature

Verify a CIP-8 signature.

```typescript
async function checkSignature(
  data: string,
  signature: DataSignature,
  address?: string  // Optional address to verify signer
): Promise<boolean>
```

**Example:**
```typescript
const isValid = await checkSignature(
  'Hello Cardano!',
  { key: 'a401...', signature: '845846...' },
  'addr_test1qp...'  // Verify this address signed it
);
```

---

### CoseSign1

Low-level COSE_Sign1 message builder.

```typescript
class CoseSign1 {
  static fromCbor(hex: string): CoseSign1

  getPayload(): Buffer | null
  verifySignature(options: { publicKeyBuffer: Buffer }): boolean
  createSigStructure(): Buffer
  buildMessage(signature: Buffer): Buffer
}
```

---

### generateNonce

Generate a random nonce for signing.

```typescript
function generateNonce(length?: number): string
```

---

## Plutus Tools

### applyParamsToScript

Apply parameters to a parameterized Plutus script.

```typescript
function applyParamsToScript(
  rawScript: string,       // Script CBOR hex
  params: object[] | Data[],
  type?: PlutusDataType    // 'Mesh' | 'JSON' | 'CBOR'
): string
```

**Example:**
```typescript
// Apply owner pubkey hash to a script
const applied = applyParamsToScript(
  parameterizedScriptHex,
  [{ bytes: ownerPubKeyHash }],
  'Mesh'
);
```

---

### normalizePlutusScript

Normalize script encoding format.

```typescript
function normalizePlutusScript(
  plutusScript: string,
  encoding: OutputEncoding
): string
```

**OutputEncoding:**
- `'SingleCBOR'` - One layer of CBOR encoding
- `'DoubleCBOR'` - Two layers (standard for on-chain)
- `'PurePlutusScriptBytes'` - Raw flat bytes

---

## Data Utilities

### toPlutusData

Convert Mesh Data type to PlutusData.

```typescript
function toPlutusData(data: Data): PlutusData
```

**Data Types:**
```typescript
type Data =
  | string           // Bytes (hex)
  | number           // Integer
  | bigint           // Integer
  | Data[]           // List
  | Map<Data, Data>  // Map
  | {                // Constructor
      alternative: number;
      fields: Data[];
    }
```

---

### fromBuilderToPlutusData

Convert BuilderData (Mesh/JSON/CBOR) to PlutusData.

```typescript
function fromBuilderToPlutusData(data: BuilderData): PlutusData
```

**BuilderData:**
```typescript
type BuilderData =
  | { type: 'Mesh'; content: Data }
  | { type: 'JSON'; content: string | object }
  | { type: 'CBOR'; content: string }
```

---

### fromPlutusDataToJson

Convert PlutusData to JSON format.

```typescript
function fromPlutusDataToJson(data: PlutusData): object
```

**JSON Format:**
```typescript
// Constructor
{ constructor: number, fields: object[] }

// Integer
{ int: number | string }

// Bytes
{ bytes: string }

// List
{ list: object[] }

// Map
{ map: [{ k: object, v: object }] }
```

---

### fromJsonToPlutusData

Convert JSON to PlutusData.

```typescript
function fromJsonToPlutusData(data: object): PlutusData
```

---

### parseDatumCbor

Parse datum CBOR to typed JSON.

```typescript
function parseDatumCbor<T = any>(datumCbor: string): T
```

---

### deserializePlutusData

Deserialize CBOR to PlutusData.

```typescript
function deserializePlutusData(plutusData: string): PlutusData
```

---

## Address Utilities

### deserializeBech32Address

Decompose bech32 address into components.

```typescript
function deserializeBech32Address(bech32Addr: string): DeserializedAddress
```

**Returns:**
```typescript
interface DeserializedAddress {
  pubKeyHash: string;              // Payment key hash (if key-based)
  scriptHash: string;              // Payment script hash (if script-based)
  stakeCredentialHash: string;     // Stake key hash
  stakeScriptCredentialHash: string; // Stake script hash
}
```

---

### serialzeAddress

Build bech32 address from components.

```typescript
function serialzeAddress(
  deserializedAddress: Partial<DeserializedAddress>,
  networkId?: number
): string
```

---

### scriptHashToBech32

Convert script hash to bech32 address.

```typescript
function scriptHashToBech32(
  scriptHash: string,
  stakeCredentialHash?: string,
  networkId?: number,
  isScriptStakeCredentialHash?: boolean
): string
```

---

### addrBech32ToPlutusDataHex

Convert address to Plutus data CBOR (for on-chain use).

```typescript
function addrBech32ToPlutusDataHex(bech32: string): string
```

---

### addrBech32ToPlutusDataObj

Convert address to Plutus data JSON object.

```typescript
function addrBech32ToPlutusDataObj<T>(bech32: string): T
```

---

### serializePlutusAddressToBech32

Convert Plutus data address back to bech32.

```typescript
function serializePlutusAddressToBech32(
  plutusHex: string,
  networkId?: number
): string
```

---

### scriptHashToRewardAddress

Convert script hash to reward address.

```typescript
function scriptHashToRewardAddress(hash: string, networkId?: number): string
```

---

### keyHashToRewardAddress

Convert key hash to reward address.

```typescript
function keyHashToRewardAddress(hash: string, networkId?: number): string
```

---

## Re-exports

The package re-exports from `@cardano-sdk`:

```typescript
// Namespace exports
export * as CardanoSDKUtil from '@cardano-sdk/util';
export * as Crypto from '@cardano-sdk/crypto';
export * as CardanoSDK from '@cardano-sdk/core';

// Direct exports
export { Cardano, Serialization } from '@cardano-sdk/core';
```

**Usage:**
```typescript
import { Cardano, Serialization, Crypto } from '@meshsdk/core-cst';

// Use Cardano SDK types directly
const txId = Cardano.TransactionId('abc123...');
const address = Cardano.Address.fromBech32('addr_test1...');
```
