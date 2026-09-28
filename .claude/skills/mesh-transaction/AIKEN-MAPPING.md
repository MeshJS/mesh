# Aiken to MeshTxBuilder Mapping Guide

Reference for translating Aiken smart contract types into MeshTxBuilder transaction code.

## Two Data Format Systems

MeshJS has two parallel data format systems from `@meshsdk/common`. The convention observed across all 9 official MeshJS contract implementations:

| Scenario | Format | Keyword | Helpers | Type Parameter |
|----------|--------|---------|---------|----------------|
| **Datums** (always) | JSON | `constructor` | `conStr0()`, `conStr1()`, `conStr2()` | `"JSON"` (explicit) |
| **Redeemers** (empty, no fields) | Mesh | `alternative` | `mConStr0([])`, `mConStr1([])`, `mConStr2([])` | omit (default `"Mesh"`) |
| **Redeemers** (with fields) | JSON | `constructor` | `conStr0()` + typed wrappers | `"JSON"` + `DEFAULT_REDEEMER_BUDGET` |
| **Redeemers** (unused/`Data` type) | N/A | N/A | `""` (empty string) | omit |
| **Script params** | JSON | N/A | typed wrappers | `"JSON"` in `applyParamsToScript` |

**Note:** Some contracts (vesting, hello-world) use Mesh format (`mConStr0`) for simple datums without a type parameter. Both formats work for datums — the critical rule is **matching the type parameter to the format** (`"JSON"` for `conStr`, omit for `mConStr`).

```typescript
import {
  // JSON format helpers (for datums & complex redeemers)
  conStr0, conStr1, conStr2, conStr3, conStr,  // conStr(N, fields) for any index
  integer, byteString, builtinByteString,
  pubKeyAddress, scriptAddress,
  currencySymbol, tokenName, policyId, assetName,
  outputReference, txOutRef, assetClass,
  option, some, none,
  value, dict, tuple, pairs, assocMap, list,
  bool, posixTime, pubKeyHash, scriptHash,
  stringToHex,

  // Mesh format helpers (for empty redeemers & simple datums)
  mConStr0, mConStr1, mConStr2, mConStr3, mConStr,  // mConStr(N, fields) for any index
  mPubKeyAddress, mScriptAddress,
  mOutputReference, mTxOutRef, mAssetClass,
  mOption, mSome, mNone, mBool,
} from '@meshsdk/common';

// For reading on-chain datum
import { deserializeDatum, serializeAddressObj } from '@meshsdk/core';

// For script parameterization
import { applyParamsToScript } from '@meshsdk/core-cst';
```

---

## Aiken Type Mapping Table

### Primitive Types

| Aiken Type | JSON Format (datums) | Mesh Format (redeemers) |
|------------|---------------------|------------------------|
| `Int` | `integer(n)` | `n` (raw number) |
| `ByteArray` | `byteString("hex")` | `"hex"` (raw string) |
| `Bool` | `True` = `conStr1([])`, `False` = `conStr0([])` | `True` = `mConStr1([])`, `False` = `mConStr0([])` |
| `Void` / `()` | `conStr0([])` | `mConStr0([])` |
| `String` (hex-encoded) | `byteString("hex")` | `"hex"` |

### Constructor Types (Enums/Variants)

Aiken enum variants map to constructor indices starting at 0:

```
Aiken enum variant     -> constructor index -> JSON helper    -> Mesh helper
1st variant            -> 0                 -> conStr0(...)   -> mConStr0(...)
2nd variant            -> 1                 -> conStr1(...)   -> mConStr1(...)
3rd variant            -> 2                 -> conStr2(...)   -> mConStr2(...)
4th variant            -> 3                 -> conStr3(...)   -> mConStr3(...)
Nth variant            -> N                 -> conStr(N, ...) -> mConStr(N, ...)
```

For constructor indices beyond 3, use the generic functions:
```typescript
// Generic constructors for any index
conStr(4, [field1, field2])   // JSON format, constructor 4
mConStr(4, [field1, field2])  // Mesh format, constructor 4
```

### Address Types

| Aiken Type | JSON Format | Mesh Format |
|------------|------------|-------------|
| `Address` (pub key) | `pubKeyAddress(keyHash, stakeCredHash?)` | `mPubKeyAddress(keyHash, stakeCredHash?)` |
| `Address` (script) | `scriptAddress(scriptHash, stakeCredHash?)` | `mScriptAddress(scriptHash, stakeCredHash?)` |

### Option Type

| Aiken | JSON Format | Mesh Format |
|-------|------------|-------------|
| `Some(value)` | `conStr0([value])` or `some(value)` | `mConStr0([value])` or `mSome(value)` |
| `None` | `conStr1([])` or `none()` | `mConStr1([])` or `mNone()` |

### Common Compound Types

| Aiken Type | JSON Format | Mesh Format |
|------------|------------|-------------|
| `OutputReference` | `outputReference(txHash, index)` | `mOutputReference(txHash, index)` |
| `AssetClass` / `(PolicyId, AssetName)` | `assetClass(policyId, assetName)` | `mAssetClass(policyId, assetName)` |
| `Value` (multi-asset) | `value(assets)` | N/A (use raw structure) |
| `Dict<k, v>` / `Pairs<k, v>` | `dict(entries)` / `pairs(entries)` | N/A |
| `Tuple<a, b>` | `tuple([a, b])` | `[a, b]` (raw array) |

---

## Constructor Index Rules

When an Aiken type has multiple variants (like an enum), each variant gets a constructor index based on its **definition order**:

```aiken
// Aiken source
type Action {
  Mint          // constructor index 0
  Burn          // constructor index 1
  Transfer      // constructor index 2
}
```

Map to MeshJS:

```typescript
// As redeemer (Mesh format)
const mintRedeemer = mConStr0([]);     // Action::Mint
const burnRedeemer = mConStr1([]);     // Action::Burn
const transferRedeemer = mConStr2([]); // Action::Transfer

// As datum (JSON format) - less common for simple enums
const mintDatum = conStr0([]);
```

For variants with fields:

```aiken
type Datum {
  SimpleDatum { owner: ByteArray }                    // index 0
  TimeLocked { owner: ByteArray, deadline: Int }      // index 1
}
```

```typescript
// As datum (JSON format - convention for datums)
const simpleDatum = conStr0([byteString(ownerHash)]);
const timeLockedDatum = conStr1([byteString(ownerHash), integer(deadline)]);

// Usage with explicit "JSON" type
.txOutInlineDatumValue(timeLockedDatum, "JSON")
```

---

## Script Parameterization

When Aiken scripts take parameters via `applyParamsToScript`:

```typescript
import { applyParamsToScript } from '@meshsdk/core-cst';

// Parameters use JSON format with explicit "JSON" type
const parameterizedScript = applyParamsToScript(
  compiledCode,  // from blueprint (plutus.json)
  [
    byteString(ownerPkh),
    integer(42),
    pubKeyAddress(ownerPkh, stakeCredHash),
  ],
  "JSON"  // type parameter for the params
);

// Non-parametric scripts (no params):
const scriptCbor = applyParamsToScript(compiledCode, []);
```

**OutputReference parameter — V2 vs V3:**
```typescript
// Plutus V3 (Aiken v1.1.0+): direct constructor
const utxoParam = outputReference(txHash, outputIndex);

// Plutus V2 (pre-Chang): wrapped TransactionId constructor
const utxoParam = txOutRef(txHash, outputIndex);
```

---

## Reading On-Chain Datum

When spending a script UTxO, you often need to read and parse the existing datum:

```typescript
import { deserializeDatum, serializeAddressObj } from '@meshsdk/core';

// Parse inline datum from UTxO
const datum = deserializeDatum<MyDatumType>(utxo.output.plutusData!);

// Access fields by index (matches Aiken record field order)
const price = datum.fields[1].int;           // Integer field
const owner = datum.fields[0];               // Address/constructor field
const tokenName = datum.fields[3].bytes;     // ByteArray field

// Convert datum address object back to bech32 string
const sellerAddress = serializeAddressObj(datum.fields[0], networkId);

// Convert Value map back to Assets array
import { MeshValue } from '@meshsdk/common';
const assets = MeshValue.fromValue(datum.fields[2]).toAssets();
```

---

## Complete Examples

### Example 1: Vesting Contract

**Aiken types:**
```aiken
type VestingDatum {
  beneficiary: Address,
  deadline: Int,
}

type VestingRedeemer {
  Cancel
  Collect
}
```

**MeshTxBuilder code:**

```typescript
import { conStr0, integer, pubKeyAddress } from '@meshsdk/common';
import { mConStr0, mConStr1 } from '@meshsdk/common';

// --- Lock funds (datum = JSON format) ---
const vestingDatum = conStr0([
  pubKeyAddress(beneficiaryPkh, beneficiaryStakeCred),
  integer(deadlineSlot),
]);

const lockTx = await txBuilder
  .txOut(scriptAddress, [{ unit: 'lovelace', quantity: '10000000' }])
  .txOutInlineDatumValue(vestingDatum, "JSON")
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

// --- Collect funds (redeemer = Mesh format) ---
const collectRedeemer = mConStr1([]);  // VestingRedeemer::Collect (index 1)

const collectTx = await txBuilder
  .spendingPlutusScriptV3()
  .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount, scriptAddress)
  .txInScript(scriptCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(collectRedeemer)  // default "Mesh" type
  .requiredSignerHash(beneficiaryPkh)
  .invalidBefore(deadlineSlot)
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .txOut(beneficiaryAddr, [{ unit: 'lovelace', quantity: '10000000' }])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Example 2: Minting Policy with Token Name Validation

**Aiken types:**
```aiken
type MintAction {
  MintTokens { count: Int }
  BurnTokens
}
```

**MeshTxBuilder code:**

```typescript
import { mConStr0, mConStr1 } from '@meshsdk/common';

// Redeemer (Mesh format - convention for redeemers)
const mintRedeemer = mConStr0([5]);   // MintAction::MintTokens { count: 5 }
const burnRedeemer = mConStr1([]);    // MintAction::BurnTokens

// --- Mint ---
const mintTx = await txBuilder
  .mintPlutusScriptV3()
  .mint('5', policyId, assetNameHex)
  .mintingScript(mintingPolicyCbor)
  .mintRedeemerValue(mintRedeemer)  // default "Mesh" type
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .txOut(recipientAddress, [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: policyId + assetNameHex, quantity: '5' }
  ])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

// --- Burn ---
const burnTx = await txBuilder
  .mintPlutusScriptV3()
  .mint('-5', policyId, assetNameHex)
  .mintingScript(mintingPolicyCbor)
  .mintRedeemerValue(burnRedeemer)
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Example 3: Marketplace with Compound Datum

**Aiken types:**
```aiken
type ListingDatum {
  seller: Address,
  price: Int,
  policy_id: ByteArray,
  asset_name: ByteArray,
}

type MarketAction {
  Buy
  Cancel
  UpdatePrice { new_price: Int }
}
```

**MeshTxBuilder code:**

```typescript
import { conStr0, integer, byteString, pubKeyAddress } from '@meshsdk/common';
import { mConStr0, mConStr1, mConStr2 } from '@meshsdk/common';

// --- List an NFT (datum = JSON format) ---
const listingDatum = conStr0([
  pubKeyAddress(sellerPkh),
  integer(50_000_000),              // 50 ADA price
  byteString(nftPolicyId),
  byteString(nftAssetNameHex),
]);

const listTx = await txBuilder
  .txOut(marketplaceScriptAddr, [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: nftPolicyId + nftAssetNameHex, quantity: '1' }
  ])
  .txOutInlineDatumValue(listingDatum, "JSON")
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

// --- Buy (redeemer = Mesh format) ---
const buyRedeemer = mConStr0([]);  // MarketAction::Buy (index 0)

const buyTx = await txBuilder
  .spendingPlutusScriptV3()
  .txIn(listingUtxo.input.txHash, listingUtxo.input.outputIndex,
        listingUtxo.output.amount, marketplaceScriptAddr)
  .txInScript(marketplaceScriptCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(buyRedeemer)
  // Pay seller
  .txOut(sellerAddr, [{ unit: 'lovelace', quantity: '50000000' }])
  // Send NFT to buyer
  .txOut(buyerAddr, [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: nftPolicyId + nftAssetNameHex, quantity: '1' }
  ])
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .changeAddress(buyerAddr)
  .selectUtxosFrom(buyerUtxos)
  .complete();

// --- Update price (redeemer with field = Mesh format) ---
const updateRedeemer = mConStr2([75_000_000]);  // MarketAction::UpdatePrice { new_price: 75 ADA }

const updateTx = await txBuilder
  .spendingPlutusScriptV3()
  .txIn(listingUtxo.input.txHash, listingUtxo.input.outputIndex,
        listingUtxo.output.amount, marketplaceScriptAddr)
  .txInScript(marketplaceScriptCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(updateRedeemer)
  .requiredSignerHash(sellerPkh)
  // Re-list with updated datum
  .txOut(marketplaceScriptAddr, listingUtxo.output.amount)
  .txOutInlineDatumValue(
    conStr0([
      pubKeyAddress(sellerPkh),
      integer(75_000_000),  // Updated price
      byteString(nftPolicyId),
      byteString(nftAssetNameHex),
    ]),
    "JSON"
  )
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Example 4: Spend + Mint in Same Transaction

**MeshTxBuilder code:**

```typescript
import { mConStr0, mConStr1 } from '@meshsdk/common';
import { conStr0, pubKeyAddress, integer } from '@meshsdk/common';

// Spend from script AND mint in the same transaction
const tx = await txBuilder
  // --- Spending part ---
  .spendingPlutusScriptV3()
  .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount, scriptAddress)
  .txInScript(spendingScriptCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(mConStr0([]))  // spending redeemer (Mesh format)

  // --- Minting part ---
  .mintPlutusScriptV3()
  .mint('-1', burnPolicyId, burnAssetName)
  .mintingScript(mintingPolicyCbor)
  .mintRedeemerValue(mConStr1([]))  // burn redeemer (Mesh format)

  // --- Common ---
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .txOut(recipientAddress, [{ unit: 'lovelace', quantity: '5000000' }])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```
