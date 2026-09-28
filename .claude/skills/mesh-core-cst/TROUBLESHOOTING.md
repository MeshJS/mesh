# Core CST Troubleshooting

Common errors and solutions for `@meshsdk/core-cst`.

## Table of Contents

- [Address Errors](#address-errors)
- [Data Conversion Errors](#data-conversion-errors)
- [Script Errors](#script-errors)
- [Signature Errors](#signature-errors)
- [Serialization Errors](#serialization-errors)
- [Common Mistakes](#common-mistakes)

---

## Address Errors

### "Invalid address" / "Failed to parse address"

**Error:**
```
Error: Invalid address
```

**Cause:** The address string is malformed or not a valid bech32 address.

**Solution:**
```typescript
import { deserializeBech32Address } from '@meshsdk/core-cst';

// Validate address before using
function isValidAddress(addr: string): boolean {
  try {
    deserializeBech32Address(addr);
    return true;
  } catch {
    return false;
  }
}

// Check address format
const address = 'addr_test1qp...';
if (!address.startsWith('addr') && !address.startsWith('stake')) {
  throw new Error('Not a Cardano address');
}
```

---

### "Couldn't resolve payment key hash from address"

**Error:**
```
Error: Couldn't resolve payment key hash from address: addr_test1...
```

**Cause:** The address doesn't have a payment key hash (might be a reward address).

**Solution:**
```typescript
import { resolvePaymentKeyHash, resolveStakeKeyHash } from '@meshsdk/core-cst';

const address = 'stake_test1uq...';  // This is a reward address!

// Check address type first
if (address.startsWith('stake')) {
  // Use stake key hash resolver instead
  const stakeHash = resolveStakeKeyHash(address);
} else {
  const paymentHash = resolvePaymentKeyHash(address);
}
```

---

### "Couldn't resolve reward address"

**Error:**
```
Error: Couldn't resolve reward address from address: addr_test1wz...
```

**Cause:** Enterprise addresses don't have stake credentials.

**Solution:**
```typescript
import { deserializeBech32Address, resolveRewardAddress } from '@meshsdk/core-cst';

const address = 'addr_test1wz...';  // Enterprise address

// Check if address has stake credential
const { stakeCredentialHash } = deserializeBech32Address(address);

if (stakeCredentialHash) {
  const rewardAddr = resolveRewardAddress(address);
} else {
  console.log('This is an enterprise address with no stake key');
}
```

---

## Data Conversion Errors

### "Malformed Plutus data json"

**Error:**
```
Error: Malformed Plutus data json
```

**Cause:** JSON doesn't match expected Cardano Plutus data format.

**Solution:**
```typescript
import { fromJsonToPlutusData } from '@meshsdk/core-cst';

// Wrong - plain JSON
const wrong = { owner: 'abc', amount: 100 };

// Correct - Cardano Plutus JSON format
const correct = {
  constructor: 0,
  fields: [
    { bytes: 'abc123' },
    { int: 100 },
  ],
};

const data = fromJsonToPlutusData(correct);
```

**Valid JSON formats:**
```typescript
// Integer
{ int: 42 }
{ int: '999999999999999999' }  // String for large numbers

// Bytes
{ bytes: 'deadbeef' }  // Hex string

// List
{ list: [{ int: 1 }, { int: 2 }] }

// Map
{ map: [{ k: { int: 1 }, v: { bytes: 'abc' } }] }

// Constructor
{ constructor: 0, fields: [...] }
```

---

### "Malformed builder data"

**Error:**
```
Error: Malformed builder data, expected types of, Mesh, CBOR or JSON
```

**Cause:** BuilderData has invalid or missing `type` field.

**Solution:**
```typescript
import { fromBuilderToPlutusData } from '@meshsdk/core-cst';

// Wrong - missing type
const wrong = { content: { alternative: 0, fields: [] } };

// Correct - with type
const correct = {
  type: 'Mesh' as const,
  content: { alternative: 0, fields: [] },
};

const data = fromBuilderToPlutusData(correct);
```

---

### "Invalid constructor data found"

**Error:**
```
Error: Invalid constructor data found
```

**Cause:** PlutusData parsing failed due to malformed CBOR.

**Solution:**
```typescript
import { parseDatumCbor, deserializePlutusData } from '@meshsdk/core-cst';

const datumCbor = 'd8799f...';

// Validate CBOR first
try {
  const data = deserializePlutusData(datumCbor);
  console.log('Valid PlutusData');
} catch (e) {
  console.log('Invalid CBOR:', e);
}
```

---

## Script Errors

### "Unsupported Plutus version"

**Error:**
```
Error: Unsupported Plutus version or invalid Plutus script bytes
```

**Cause:** Script has unsupported version or is not valid Plutus bytecode.

**Solution:**
```typescript
import { applyParamsToScript } from '@meshsdk/core-cst';

// Check script is double-CBOR encoded (standard format)
// Script should start with 59 (CBOR byte string) or 82/83 (array)

// If script is from Aiken, it's usually double-CBOR
// If script is raw flat, you may need to encode it first

import { normalizePlutusScript } from '@meshsdk/core-cst';

// Normalize to expected format
const normalized = normalizePlutusScript(rawScript, 'DoubleCBOR');
const applied = applyParamsToScript(normalized, params, 'Mesh');
```

---

### "Script source not provided"

**Error:**
```
Error: Script source not provided for plutus script mint
```

**Cause:** Transaction building requires script but none was provided.

**Solution:**
This error comes from the serializer during transaction building. Ensure you provide script source:

```typescript
// When building with MeshTxBuilder
txBuilder
  .mint('1', policyId, tokenName)
  .mintingScript(plutusScript.code)  // Provide script!
  .mintRedeemerValue(redeemer)
```

---

## Signature Errors

### "Invalid signature" / checkSignature returns false

**Cause:** Signature doesn't match data or was signed by different key.

**Solution:**
```typescript
import { checkSignature, isHexString, stringToHex } from '@meshsdk/common';

// Ensure data format matches what was signed
const originalData = 'Hello Cardano!';

// If wallet signed hex, you need to verify with hex
const isValid = await checkSignature(
  originalData,  // Plain text or hex, library handles both
  signature
);

// Check data encoding
console.log('Data as hex:', stringToHex(originalData));
console.log('Is hex?:', isHexString(originalData));
```

---

### Signature address mismatch

**Error:** `checkSignature` returns false when address provided.

**Cause:** The signing key doesn't match the provided address.

**Solution:**
```typescript
import { checkSignature } from '@meshsdk/core-cst';

// The address must match the signing key
// For base addresses, either payment or stake key can sign

// Verify with payment address
const isValid = await checkSignature(data, sig, paymentAddress);

// Or verify with stake/reward address
const isValid2 = await checkSignature(data, sig, rewardAddress);

// If signing with stake key, use stake address for verification
```

---

## Serialization Errors

### "Error serializing inputs"

**Error:**
```
Error: Error serializing inputs: ...
```

**Cause:** Transaction inputs are malformed or missing required fields.

**Solution:**
```typescript
// Ensure all inputs have required fields
const input = {
  type: 'PubKey',
  txIn: {
    txHash: 'abc123...',  // 64 char hex
    txIndex: 0,           // number
    address: 'addr_test1...',
    amount: [{ unit: 'lovelace', quantity: '5000000' }],
  },
};

// For script inputs, also need:
const scriptInput = {
  type: 'Script',
  txIn: { ... },
  scriptTxIn: {
    scriptSource: { type: 'Provided', script: { code: '...', version: 'V2' } },
    datumSource: { type: 'Inline' },  // or { type: 'Provided', data: ... }
    redeemer: { data: { ... }, exUnits: { mem: '...', steps: '...' } },
  },
};
```

---

### "Duplicate input added to tx body"

**Error:**
```
Error: Duplicate input added to tx body
```

**Cause:** Same UTxO added as input twice.

**Solution:**
```typescript
// Deduplicate inputs before serializing
const uniqueInputs = inputs.filter((input, index, self) =>
  index === self.findIndex(i =>
    i.txIn.txHash === input.txIn.txHash &&
    i.txIn.txIndex === input.txIn.txIndex
  )
);
```

---

## Common Mistakes

### Using wrong hex format

**Wrong:**
```typescript
// Using base64 instead of hex
const hash = resolveDataHash('SGVsbG8=');  // This is base64!
```

**Correct:**
```typescript
// Use hex encoding
const hash = resolveDataHash('48656c6c6f');  // Hex for "Hello"

// Or use Mesh Data format for strings
const hash = resolveDataHash({ bytes: '48656c6c6f' }, 'JSON');
```

---

### Mixing network IDs

**Wrong:**
```typescript
// Using mainnet address with testnet networkId
const addr = serialzeAddress({
  pubKeyHash: resolvePaymentKeyHash('addr1q...')  // Mainnet!
}, 0);  // Testnet!
```

**Correct:**
```typescript
// Match network ID to address prefix
const address = 'addr_test1qp...';
const networkId = address.includes('_test') ? 0 : 1;

const newAddr = serialzeAddress(components, networkId);
```

---

### Forgetting async for checkSignature

**Wrong:**
```typescript
const isValid = checkSignature(data, sig);  // Returns Promise!
if (isValid) { ... }  // Always truthy!
```

**Correct:**
```typescript
const isValid = await checkSignature(data, sig);
if (isValid) { ... }
```

---

### Using wrong script version

**Wrong:**
```typescript
// V1 script with V2 features
const script = { code: v2CompiledScript, version: 'V1' };  // Wrong version!
```

**Correct:**
```typescript
// Match version to script compilation
const script = { code: v2CompiledScript, version: 'V2' };

// Check Aiken blueprint for version
// "version": "Plutus V2" → use 'V2'
```

---

## Debug Tips

### Inspect PlutusData

```typescript
import { fromPlutusDataToJson, deserializePlutusData } from '@meshsdk/core-cst';

// Decode and inspect datum
const data = deserializePlutusData(cborHex);
const json = fromPlutusDataToJson(data);
console.log(JSON.stringify(json, null, 2));
```

### Validate CBOR

```typescript
import { Serialization } from '@meshsdk/core-cst';

// Check if valid transaction CBOR
try {
  Serialization.Transaction.fromCbor(txHex);
  console.log('Valid transaction CBOR');
} catch (e) {
  console.log('Invalid CBOR:', e);
}
```

### Check Address Type

```typescript
import { Cardano } from '@meshsdk/core-cst';

const address = Cardano.Address.fromBech32('addr_test1...');
const props = address.getProps();

console.log('Network:', props.networkId);
console.log('Type:', props.type);
console.log('Payment:', props.paymentPart);
console.log('Delegation:', props.delegationPart);
```
