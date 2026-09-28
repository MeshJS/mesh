# Troubleshooting Guide

Common errors and solutions when using `@meshsdk/transaction`.

## Table of Contents

- [Build Errors](#build-errors)
- [Script Errors](#script-errors)
- [Coin Selection Errors](#coin-selection-errors)
- [Submission Errors](#submission-errors)
- [Common Mistakes](#common-mistakes)

---

## Build Errors

### "Change address is not set"

**Error:**
```
Error: Change address is not set, utxo selection cannot be done without this
```

**Cause:** `complete()` requires a change address for coin selection.

**Solution:**
```typescript
txBuilder
  .txOut(...)
  .changeAddress(yourWalletAddress)  // Add this
  .selectUtxosFrom(utxos)
  .complete();
```

---

### "Transaction information is incomplete while no fetcher instance is provided"

**Error:**
```
Error: Transaction information is incomplete while no fetcher instance is provided. Provide a `fetcher`.
```

**Cause:** Input UTxOs are missing amount/address info and no fetcher is available to look them up.

**Solutions:**

1. **Provide complete input info:**
```typescript
txBuilder.txIn(
  txHash,
  txIndex,
  [{ unit: 'lovelace', quantity: '5000000' }],  // amount
  'addr_test1...'  // address
);
```

2. **Or provide a fetcher:**
```typescript
const txBuilder = new MeshTxBuilder({
  fetcher: new BlockfrostProvider('api-key')
});
```

---

### "Only KeyHash address is supported for utxo selection"

**Error:**
```
Error: Only KeyHash address is supported for utxo selection
```

**Cause:** `selectUtxosFrom()` received UTxOs with script addresses.

**Solution:** Filter to only include pubkey-controlled UTxOs:
```typescript
const pubKeyUtxos = utxos.filter(utxo => {
  // Only include UTxOs you can sign for
  return !utxo.output.scriptRef && !utxo.output.dataHash;
});
txBuilder.selectUtxosFrom(pubKeyUtxos);
```

---

### "Couldn't find value information for txHash#txIndex"

**Error:**
```
Error: Couldn't find value information for abc123...#0
```

**Cause:** The fetcher couldn't find the specified UTxO on-chain.

**Possible causes:**
1. Wrong txHash or txIndex
2. UTxO already spent
3. Transaction not yet confirmed
4. Wrong network

**Solution:**
```typescript
// Verify UTxO exists
const utxos = await provider.fetchUTxOs(txHash);
console.log(utxos);  // Check if it exists and has correct index
```

---

## Script Errors

### "Script input does not contain datum information"

**Error:**
```
Error: queueInput: Script input does not contain datum information
```

**Cause:** Plutus script inputs require datum but none was provided.

**Solution:**
```typescript
txBuilder
  .spendingPlutusScriptV3()
  .txIn(txHash, txIndex)
  .txInScript(scriptCbor)
  .txInDatumValue(datum)  // Provide datum
  // OR
  .txInInlineDatumPresent()  // If UTxO has inline datum
  .txInRedeemerValue(redeemer);
```

---

### "Script input does not contain redeemer information"

**Error:**
```
Error: queueInput: Script input does not contain redeemer information
```

**Cause:** Plutus script inputs require redeemer.

**Solution:**
```typescript
txBuilder
  .spendingPlutusScriptV3()
  .txIn(txHash, txIndex)
  .txInScript(scriptCbor)
  .txInDatumValue(datum)
  .txInRedeemerValue(redeemer)  // Add this
```

---

### "Script input does not contain script information"

**Error:**
```
Error: queueInput: Script input does not contain script information
```

**Cause:** Plutus script input missing the script itself.

**Solution:**
```typescript
txBuilder
  .spendingPlutusScriptV3()
  .txIn(txHash, txIndex)
  .txInScript(scriptCbor)  // Add inline script
  // OR
  .spendingTxInReference(refTxHash, refIndex, size, hash)  // Use reference script
```

---

### "Evaluate redeemers failed"

**Error:**
```
Error: Evaluate redeemers failed: <message>
```

**Causes:**
1. Script validation failed (logic error in script)
2. Wrong datum or redeemer format
3. Missing required signer
4. Time constraints not met

**Debug steps:**

1. **Check datum/redeemer format:**
```typescript
// Ensure correct format
.txInDatumValue(datum, 'Mesh')  // or 'JSON' or 'CBOR'
.txInRedeemerValue(redeemer, 'Mesh')
```

2. **Add required signers:**
```typescript
.requiredSignerHash(pubKeyHash)
```

3. **Check time constraints:**
```typescript
.invalidBefore(startSlot)
.invalidHereafter(endSlot)
```

4. **Enable verbose logging:**
```typescript
const txBuilder = new MeshTxBuilder({
  verbose: true,  // See detailed logs
  // ...
});
```

---

### "Tx evaluation failed" (Missing collateral)

**Cause:** Script transactions require collateral.

**Solution:**
```typescript
txBuilder
  .spendingPlutusScriptV3()
  .txIn(...)
  // ...
  .txInCollateral(  // Add collateral
    collateralUtxo.input.txHash,
    collateralUtxo.input.outputIndex,
    collateralUtxo.output.amount,
    collateralUtxo.output.address
  )
```

**Collateral requirements:**
- Must be pure ADA (no native assets)
- Usually 150% of estimated script execution cost
- Typically 5 ADA is enough for most scripts

---

## Coin Selection Errors

### "Insufficient funds"

**Error:**
```
InputSelectionError: Insufficient funds
```

**Causes:**
1. Not enough ADA to cover outputs + fees
2. Not enough native assets
3. Min UTxO requirements not met

**Solutions:**

1. **Check your UTxOs:**
```typescript
const utxos = await provider.fetchAddressUTxOs(address);
const totalAda = utxos.reduce((sum, u) => {
  const lovelace = u.output.amount.find(a => a.unit === 'lovelace');
  return sum + BigInt(lovelace?.quantity || 0);
}, 0n);
console.log('Total ADA:', totalAda / 1_000_000n);
```

2. **Ensure outputs meet min UTxO:**
```typescript
// Each output needs minimum ~1 ADA + more for assets
.txOut(address, [
  { unit: 'lovelace', quantity: '2000000' },  // 2 ADA minimum
  { unit: tokenId, quantity: '100' }
])
```

3. **Reduce number of outputs or consolidate UTxOs first**

---

### "Token bundle size exceeds limit"

**Error:**
```
Error: Token bundle size exceeds limit
```

**Cause:** Too many native assets in a single output.

**Solution:** Split assets across multiple outputs:
```typescript
// Instead of one output with 50 tokens:
.txOut(address, [
  { unit: 'lovelace', quantity: '5000000' },
  ...first25Tokens
])
.txOut(address, [
  { unit: 'lovelace', quantity: '5000000' },
  ...next25Tokens
])
```

---

### "Max tx size exceeded"

**Error:**
```
Error: Max tx size exceeded
```

**Causes:**
1. Too many inputs/outputs
2. Large inline datums
3. Large scripts (use reference scripts instead)

**Solutions:**

1. **Use reference scripts:**
```typescript
// Instead of inline script
.txInScript(largePlutusScript)

// Use reference
.spendingTxInReference(refTxHash, refIndex, scriptSize, scriptHash)
```

2. **Use datum hash instead of inline:**
```typescript
.txOutDatumHashValue(datum)  // Instead of inline
```

3. **Split into multiple transactions**

---

## Submission Errors

### "BadInputsUTxO"

**Error:**
```
SubmitTxError: BadInputsUTxO
```

**Cause:** One or more inputs don't exist on-chain.

**Possible reasons:**
1. Transaction already submitted (inputs spent)
2. Wrong network
3. Transaction that created the UTxO not yet confirmed

**Solution:** Wait for previous tx to confirm, or check network.

---

### "ValueNotConservedUTxO"

**Error:**
```
SubmitTxError: ValueNotConservedUTxO
```

**Cause:** Inputs don't equal outputs + fee (value conservation violated).

**Usually indicates:**
1. Missing mint operation
2. Wrong fee calculation
3. Bug in coin selection

**Solution:** Use `complete()` which handles this automatically.

---

### "FeeTooSmallUTxO"

**Error:**
```
SubmitTxError: FeeTooSmallUTxO
```

**Cause:** Manually set fee is too low.

**Solution:** Let `complete()` calculate fee, or increase manual fee:
```typescript
.setFee('300000')  // Increase fee
```

---

### "OutsideValidityIntervalUTxO"

**Error:**
```
SubmitTxError: OutsideValidityIntervalUTxO
```

**Cause:** Current slot is outside the transaction's validity interval.

**Solution:** Adjust validity interval:
```typescript
const currentSlot = await provider.fetchLatestSlot();
txBuilder
  .invalidBefore(currentSlot - 100)  // Buffer for propagation
  .invalidHereafter(currentSlot + 3600)  // Valid for ~1 hour
```

---

## Common Mistakes

### Wrong Order of Method Calls

**Wrong:**
```typescript
txBuilder
  .txIn(hash, index)  // Too late - already a PubKey input
  .spendingPlutusScriptV3()  // This won't work!
```

**Correct:**
```typescript
txBuilder
  .spendingPlutusScriptV3()  // FIRST - signals script input
  .txIn(hash, index)          // THEN - add the input
```

Same applies to `mintPlutusScriptV2()` before `mint()`, etc.

---

### Forgetting to Complete

**Wrong:**
```typescript
const tx = txBuilder
  .txIn(...)
  .txOut(...)
  .changeAddress(...);  // Missing .complete()
```

**Correct:**
```typescript
const tx = await txBuilder
  .txIn(...)
  .txOut(...)
  .changeAddress(...)
  .complete();  // Don't forget this!
```

---

### Mixing Sync and Async

**Wrong:**
```typescript
const tx = txBuilder.complete();  // Missing await!
```

**Correct:**
```typescript
const tx = await txBuilder.complete();  // complete() is async
// OR for sync (no balancing)
const tx = txBuilder.completeSync();
```

---

### Not Resetting Builder

**Issue:** Reusing builder without reset includes previous state.

**Solution:**
```typescript
txBuilder.reset();  // Clear state before new transaction
// Or create new instance
const newTxBuilder = new MeshTxBuilder({ ... });
```

---

### Wrong Datum Type

**Issue:** Script expects different datum format.

**Check your script's datum type and match it:**
```typescript
import { mConStr0 } from '@meshsdk/common';

// Mesh Data type: use "alternative", NOT "constructor"
const datum = {
  alternative: 0,  // ConstrPlutusData index
  fields: [ownerPubKeyHash, deadline]
};
// Or: const datum = mConStr0([ownerPubKeyHash, deadline]);
.txInDatumValue(datum)  // default type is "Mesh"
```

---

### Using "constructor" Instead of "alternative" (Datum Format Mix-Up)

**Issue:** Transaction fails or produces wrong datum when using `{ constructor: 0, fields: [...] }` with the default Mesh data type.

**Cause:** The Mesh SDK has THREE datum formats. The **default is `"Mesh"`**, which uses `alternative` — NOT `constructor`:

| Format | Keyword | Field Values | Example |
|--------|---------|-------------|---------|
| `"Mesh"` (default) | `alternative` | Primitives directly | `{ alternative: 0, fields: [42, "hex"] }` |
| `"JSON"` (cardano-cli) | `constructor` | Typed wrappers | `{ constructor: 0, fields: [{ int: 42 }, { bytes: "hex" }] }` |
| `"CBOR"` | N/A | Hex string | `"d8799f182aff"` |

**Wrong:**
```typescript
// WRONG - "constructor" with default Mesh type
.txOutInlineDatumValue({ constructor: 0, fields: [{ int: 42 }] })
```

**Correct:**
```typescript
import { mConStr0 } from '@meshsdk/common';

// Option 1: Mesh format with "alternative"
.txOutInlineDatumValue({ alternative: 0, fields: [42] })

// Option 2: Use Mesh helper
.txOutInlineDatumValue(mConStr0([42]))

// Option 3: If you MUST use "constructor", specify "JSON" type explicitly
.txOutInlineDatumValue({ constructor: 0, fields: [{ int: 42 }] }, "JSON")
```

---

### Missing "JSON" Type Parameter for JSON-Format Datums

**Issue:** Datum appears correct but script validation fails or datum doesn't match expected hash.

**Cause:** Using JSON-format datum helpers (`conStr0()`, `integer()`, etc.) without specifying `"JSON"` as the type parameter. The default type is `"Mesh"`, which interprets the structure differently.

**Wrong:**
```typescript
import { conStr0, integer } from '@meshsdk/common';

const datum = conStr0([integer(42)]);
.txOutInlineDatumValue(datum)  // BUG: defaults to "Mesh" type!
```

**Correct:**
```typescript
import { conStr0, integer } from '@meshsdk/common';

const datum = conStr0([integer(42)]);
.txOutInlineDatumValue(datum, "JSON")  // Must specify "JSON"
```

**Rule:** If you use `conStr0/conStr1/conStr2` or typed wrappers like `integer()`, `byteString()`, `pubKeyAddress()` — always pass `"JSON"` as the type parameter. If you use `mConStr0/mConStr1/mConStr2` with raw primitives — the default `"Mesh"` type is correct.

---

### Using Wrong Helpers for Data Format

**Issue:** Mixing JSON-format helpers with Mesh type parameter or vice versa.

**Cause:** Two parallel helper systems exist in `@meshsdk/common`:

| Helpers | Format | Type Param | Used For |
|---------|--------|------------|----------|
| `conStr0()`, `integer()`, `byteString()`, `pubKeyAddress()` | JSON | `"JSON"` | Datums (convention) |
| `mConStr0()`, `mConStr1()`, raw primitives | Mesh | `"Mesh"` (default) | Redeemers (convention) |

**Wrong combinations:**
```typescript
// WRONG: Mesh helper with "JSON" type
.txOutInlineDatumValue(mConStr0([42]), "JSON")

// WRONG: JSON helper with default "Mesh" type
.txInRedeemerValue(conStr0([integer(42)]))
```

**Correct combinations:**
```typescript
// Datum: JSON helpers + "JSON" type
.txOutInlineDatumValue(conStr0([integer(42)]), "JSON")

// Redeemer: Mesh helpers + default type (omit or "Mesh")
.txInRedeemerValue(mConStr0([42]))
```

---

### Using Empty String for Unused/Generic Redeemers

**Issue:** Unsure what to pass as redeemer when the Aiken script uses `_redeemer: Data` (ignores the redeemer).

**Cause:** Some scripts accept a generic `Data` type redeemer and don't validate it. Real MeshJS contracts use an empty string `""` for these.

**Solution:**
```typescript
// When the script ignores the redeemer (e.g., _redeemer: Data)
.txInRedeemerValue("")   // Empty string — valid for unused redeemers
.mintRedeemerValue("")   // Also works for minting
```

**When to use each redeemer approach:**

| Script Redeemer Type | What to Pass | Example |
|---------------------|-------------|---------|
| Named enum, no fields (e.g., `Cancel`, `Buy`) | `mConStr0([])`, `mConStr1([])` | `mConStr1([])` for 2nd variant |
| Named enum with fields (e.g., `Update { price: Int }`) | `conStr0([integer(n)])` + `"JSON"` + `DEFAULT_REDEEMER_BUDGET` | Complex redeemer |
| `_redeemer: Data` (unused/ignored) | `""` (empty string) | Script doesn't check it |

---

## Debug Checklist

When transactions fail:

1. **Enable verbose mode:**
   ```typescript
   new MeshTxBuilder({ verbose: true, ... })
   ```

2. **Check the built transaction:**
   ```typescript
   const tx = await txBuilder.complete();
   console.log(txBuilder.meshTxBuilderBody);
   ```

3. **Verify UTxOs exist:**
   ```typescript
   const utxos = await provider.fetchUTxOs(txHash);
   ```

4. **Check wallet balance:**
   ```typescript
   const balance = await provider.fetchAddressUTxOs(address);
   ```

5. **Verify script hash matches:**
   ```typescript
   // Ensure you're spending to/from the correct script address
   ```

6. **Test on testnet first:**
   ```typescript
   // Use preview/preprod before mainnet
   ```
