# Core CST Patterns

Common patterns and recipes for `@meshsdk/core-cst`.

## Table of Contents

- [Address Operations](#address-operations)
- [Data Conversion](#data-conversion)
- [Script Operations](#script-operations)
- [Signature Verification](#signature-verification)
- [Transaction Inspection](#transaction-inspection)

---

## Address Operations

### Decompose Address to Components

```typescript
import { deserializeBech32Address } from '@meshsdk/core-cst';

const address = 'addr_test1qp...';
const components = deserializeBech32Address(address);

console.log('Payment Key Hash:', components.pubKeyHash);
console.log('Script Hash:', components.scriptHash);
console.log('Stake Key Hash:', components.stakeCredentialHash);

// Determine address type
if (components.pubKeyHash) {
  console.log('This is a key-based payment address');
} else if (components.scriptHash) {
  console.log('This is a script-based payment address');
}
```

### Build Address from Hashes

```typescript
import { serialzeAddress } from '@meshsdk/core-cst';

// Base address (payment + stake)
const baseAddress = serialzeAddress({
  pubKeyHash: 'abc123...',
  stakeCredentialHash: 'def456...',
}, 0);  // 0 = testnet

// Enterprise address (payment only)
const enterpriseAddress = serialzeAddress({
  pubKeyHash: 'abc123...',
}, 0);

// Script address
const scriptAddress = serialzeAddress({
  scriptHash: 'abc123...',
  stakeCredentialHash: 'def456...',
}, 0);
```

### Get Reward Address from Payment Address

```typescript
import { resolveRewardAddress } from '@meshsdk/core-cst';

const paymentAddress = 'addr_test1qp...';
const rewardAddress = resolveRewardAddress(paymentAddress);
// 'stake_test1uq...'
```

### Convert Address for On-Chain Use

```typescript
import {
  addrBech32ToPlutusDataHex,
  serializePlutusAddressToBech32,
} from '@meshsdk/core-cst';

// Address → Plutus data (for script parameters)
const address = 'addr_test1qp...';
const plutusDataHex = addrBech32ToPlutusDataHex(address);
// Use this in script datum/redeemer

// Plutus data → Address (deserialize from chain)
const bech32 = serializePlutusAddressToBech32(plutusDataHex, 0);
```

---

## Data Conversion

### Mesh Data to CBOR

```typescript
import { toPlutusData } from '@meshsdk/core-cst';

// Simple values
const intData = toPlutusData(42);
const bytesData = toPlutusData('deadbeef');  // hex string

// Constructor (like Haskell data types)
const myDatum = toPlutusData({
  alternative: 0,  // Constructor index
  fields: [
    'abc123',      // bytes
    42,            // integer
    [1, 2, 3],     // list
  ],
});

// Get CBOR hex
const cborHex = myDatum.toCbor();
```

### JSON to PlutusData

```typescript
import { fromJsonToPlutusData } from '@meshsdk/core-cst';

// Standard Cardano JSON format
const json = {
  constructor: 0,
  fields: [
    { bytes: 'abc123' },
    { int: 42 },
    { list: [{ int: 1 }, { int: 2 }] },
  ],
};

const plutusData = fromJsonToPlutusData(json);
```

### Parse On-Chain Datum

```typescript
import { parseDatumCbor } from '@meshsdk/core-cst';

// Define your datum type
interface MyDatum {
  constructor: number;
  fields: [
    { bytes: string },  // owner
    { int: string },    // amount
  ];
}

// Parse from CBOR
const datumCbor = 'd8799f...';  // From UTxO
const datum = parseDatumCbor<MyDatum>(datumCbor);

console.log('Owner:', datum.fields[0].bytes);
console.log('Amount:', datum.fields[1].int);
```

### BuilderData Conversion

```typescript
import { fromBuilderToPlutusData } from '@meshsdk/core-cst';

// From Mesh format
const meshData = fromBuilderToPlutusData({
  type: 'Mesh',
  content: { alternative: 0, fields: ['hello'] },
});

// From JSON format
const jsonData = fromBuilderToPlutusData({
  type: 'JSON',
  content: '{"constructor":0,"fields":[{"bytes":"hello"}]}',
});

// From CBOR format
const cborData = fromBuilderToPlutusData({
  type: 'CBOR',
  content: 'd8799f...',
});
```

### Data Hash Computation

```typescript
import { resolveDataHash } from '@meshsdk/core-cst';

// Hash Mesh-format data
const hash1 = resolveDataHash(
  { alternative: 0, fields: [] },
  'Mesh'
);

// Hash JSON-format data
const hash2 = resolveDataHash(
  { constructor: 0, fields: [] },
  'JSON'
);

// Hash CBOR-format data
const hash3 = resolveDataHash(
  'd8799f9fff',
  'CBOR'
);
```

---

## Script Operations

### Apply Parameters to Script

```typescript
import { applyParamsToScript } from '@meshsdk/core-cst';

// Original parameterized script (from Aiken/Plutus compilation)
const parameterizedScript = '59010100...';

// Apply single parameter
const script1 = applyParamsToScript(
  parameterizedScript,
  [{ bytes: 'abc123def456...' }],  // Owner pubkey hash
  'Mesh'
);

// Apply multiple parameters
const script2 = applyParamsToScript(
  parameterizedScript,
  [
    { bytes: 'abc123...' },  // Owner
    { int: 1000000 },        // Min amount
    { constructor: 0, fields: [] },  // Config
  ],
  'Mesh'
);
```

### Get Script Address and Hash

```typescript
import {
  resolvePlutusScriptAddress,
  resolvePlutusScriptHash,
  resolveNativeScriptAddress,
  resolveNativeScriptHash,
} from '@meshsdk/core-cst';

// Plutus script
const plutusScript = { code: '59010100...', version: 'V2' as const };
const plutusAddr = resolvePlutusScriptAddress(plutusScript, 0);
const plutusHash = resolvePlutusScriptHash(plutusAddr);

// Native script
const nativeScript = {
  type: 'all' as const,
  scripts: [
    { type: 'sig' as const, keyHash: 'abc...' },
    { type: 'sig' as const, keyHash: 'def...' },
  ],
};
const nativeAddr = resolveNativeScriptAddress(nativeScript, 0);
const nativeHash = resolveNativeScriptHash(nativeScript);
```

### Prepare Reference Script

```typescript
import { resolveScriptRef } from '@meshsdk/core-cst';

// For Plutus script
const plutusRefCbor = resolveScriptRef({
  code: '59010100...',
  version: 'V2',
});

// For Native script
const nativeRefCbor = resolveScriptRef({
  type: 'sig',
  keyHash: 'abc123...',
});

// Use in transaction output
// txBuilder.txOut(address, amount).txOutReferenceScript(plutusRefCbor)
```

### Normalize Script Encoding

```typescript
import { normalizePlutusScript } from '@meshsdk/core-cst';

// From any encoding to double-CBOR (standard on-chain format)
const normalized = normalizePlutusScript(scriptHex, 'DoubleCBOR');

// To single CBOR
const singleCbor = normalizePlutusScript(scriptHex, 'SingleCBOR');

// To raw flat bytes
const raw = normalizePlutusScript(scriptHex, 'PurePlutusScriptBytes');
```

---

## Signature Verification

### Verify CIP-8 Signature

```typescript
import { checkSignature } from '@meshsdk/core-cst';

// Signature from wallet.signData()
const signature = {
  key: 'a401010327200621...',
  signature: '845846a201276761...',
};

// Basic verification (signature is valid)
const isValid = await checkSignature(
  'Hello Cardano!',  // Original message
  signature
);

// With address verification (signer matches address)
const isValidWithAddr = await checkSignature(
  'Hello Cardano!',
  signature,
  'addr_test1qp...'  // Expected signer address
);

if (isValidWithAddr) {
  console.log('Signature valid and matches expected address');
}
```

### Authentication Flow

```typescript
import { checkSignature, generateNonce } from '@meshsdk/core-cst';

// Server: Generate challenge
const nonce = generateNonce(32);
const challenge = `Sign in to MyApp\nNonce: ${nonce}\nTime: ${Date.now()}`;

// Client: Sign with wallet
// const sig = await wallet.signData(address, challenge);

// Server: Verify signature
async function verifyLogin(
  address: string,
  challenge: string,
  signature: { key: string; signature: string }
) {
  // Verify signature
  const isValid = await checkSignature(challenge, signature, address);

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  // Verify nonce hasn't been used (implement your own store)
  const nonceMatch = challenge.match(/Nonce: (\w+)/);
  if (nonceMatch && usedNonces.has(nonceMatch[1])) {
    throw new Error('Nonce already used');
  }

  // Mark nonce as used
  if (nonceMatch) {
    usedNonces.add(nonceMatch[1]);
  }

  return { address, verified: true };
}
```

---

## Transaction Inspection

### Get Transaction Hash

```typescript
import { resolveTxHash } from '@meshsdk/core-cst';

const signedTxCbor = '84a400...';
const txHash = resolveTxHash(signedTxCbor);
// '3b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b7'
```

### Serialize Transaction

```typescript
import { CardanoSDKSerializer } from '@meshsdk/core-cst';

const serializer = new CardanoSDKSerializer();

// Serialize MeshTxBuilder body to CBOR
const txCbor = serializer.serializeTxBody(meshTxBuilderBody);

// Add signatures
const signedTx = serializer.addSigningKeys(txCbor, [
  privateKeyHex,  // Can be 64 or 68 chars (with 5820 prefix)
]);
```

### Deserialize Script Info

```typescript
import { CardanoSDKSerializer } from '@meshsdk/core-cst';

const serializer = new CardanoSDKSerializer();

// Get script hash and CBOR from Plutus script
const { scriptHash, scriptCbor } = serializer.deserializer.script
  .deserializePlutusScript({
    code: '59010100...',
    version: 'V2',
  });

// Get key hash from pool ID
const keyHash = serializer.deserializer.cert
  .deserializePoolId('pool1...');
```

---

## Using Cardano SDK Directly

```typescript
import { Cardano, Serialization, Crypto } from '@meshsdk/core-cst';

// Parse address
const address = Cardano.Address.fromBech32('addr_test1qp...');
const networkId = address.getNetworkId();

// Create transaction ID
const txId = Cardano.TransactionId('abc123...');

// Parse transaction
const tx = Serialization.Transaction.fromCbor('84a400...');
const body = tx.body();
const inputs = body.inputs();

// Crypto operations
const hash = Crypto.blake2b.hash('deadbeef', 32);
```
