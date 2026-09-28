---
name: mesh-transaction
description: Use when building Cardano transactions with MeshJS SDK. Covers MeshTxBuilder API for sending ADA, minting NFTs and tokens, spending from Plutus scripts, staking, governance voting, DRep registration, and multi-sig patterns. Includes correct method ordering, coin selection, fee calculation, and troubleshooting common Cardano transaction errors.
license: Apache-2.0
metadata:
  author: MeshJS
  version: "1.0"
---

# Mesh SDK Transaction Skill

AI-assisted Cardano transaction building using `MeshTxBuilder` from `@meshsdk/transaction`.

## Package Info

```bash
npm install @meshsdk/transaction
# or
npm install @meshsdk/core  # includes transaction + wallet + provider
```

## Quick Reference

| Task | Method Chain |
|------|--------------|
| Send ADA | `txIn() -> txOut() -> changeAddress() -> complete()` |
| Mint tokens (Plutus) | `mintPlutusScriptV3() -> mint() -> mintingScript() -> mintRedeemerValue() -> ...` |
| Mint tokens (Native) | `mint() -> mintingScript() -> ...` |
| Script spending | `spendingPlutusScriptV3() -> txIn() -> txInScript() -> txInDatumValue() -> txInRedeemerValue() -> ...` |
| Stake delegation | `delegateStakeCertificate(rewardAddress, poolId)` |
| Withdraw rewards | `withdrawal(rewardAddress, coin) -> withdrawalScript() -> withdrawalRedeemerValue()` |
| Governance vote | `vote(voter, govActionId, votingProcedure)` |
| DRep registration | `drepRegistrationCertificate(drepId, anchor?, deposit?)` |

## Constructor Options

```typescript
import { MeshTxBuilder } from '@meshsdk/transaction';

const txBuilder = new MeshTxBuilder({
  fetcher?: IFetcher,      // For querying UTxOs (e.g., BlockfrostProvider)
  submitter?: ISubmitter,  // For submitting transactions
  evaluator?: IEvaluator,  // For script execution cost estimation
  serializer?: IMeshTxSerializer,  // Custom serializer
  selector?: IInputSelector,       // Custom coin selection
  isHydra?: boolean,       // Hydra L2 mode (zero fees)
  params?: Partial<Protocol>,  // Custom protocol parameters
  verbose?: boolean,       // Enable logging
});
```

## Completion Methods

| Method | Async | Balanced | Use Case |
|--------|-------|----------|----------|
| `complete()` | Yes | Yes | Production - auto coin selection, fee calculation |
| `completeSync()` | No | No | Testing - requires manual inputs/fee |
| `completeUnbalanced()` | No | No | Partial build for inspection |
| `completeSigning()` | No | N/A | Add signatures after complete() |

## Files

- [TRANSACTION.md](./TRANSACTION.md) - Complete API reference
- [PATTERNS.md](./PATTERNS.md) - Common transaction recipes
- [AIKEN-MAPPING.md](./AIKEN-MAPPING.md) - Aiken smart contract type → MeshTxBuilder mapping
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Error solutions

## Key Concepts

### Fluent API
All methods return `this` for chaining:
```typescript
txBuilder
  .txIn(hash, index)
  .txOut(address, amount)
  .changeAddress(addr)
  .complete();
```

### Script Versions

**Choose the version matching the script's Plutus version:**

| Version | Era | When to Use |
|---------|-----|-------------|
| V1 | Alonzo | Legacy scripts only |
| V2 | Babbage | Existing Babbage-era scripts |
| **V3** | **Conway** | **New scripts (current era, default choice)** |

`LanguageVersion` type = `"V1" | "V2" | "V3"`

Each script context has **two equivalent calling styles** — static shortcuts and dynamic version:

| Context | Static Shortcut | Dynamic Version |
|---------|----------------|-----------------|
| Spending | `spendingPlutusScriptV3()` | `spendingPlutusScript("V3")` |
| Minting | `mintPlutusScriptV3()` | `mintPlutusScript("V3")` |
| Withdrawal | `withdrawalPlutusScriptV3()` | `withdrawalPlutusScript("V3")` |
| Voting | `votePlutusScriptV3()` | `votePlutusScript("V3")` |

**Default to V3 for new Conway-era scripts.** Only use V2/V1 for scripts compiled against those specific Plutus versions.

### Data Types (Datum & Redeemer Formats)

Datum and redeemer values accept three formats via the `type` parameter:

**`"Mesh"` (default) — Use `alternative`, NOT `constructor`:**
```typescript
import { mConStr0, mConStr1 } from '@meshsdk/common';

// Mesh Data type uses "alternative" for ConstrPlutusData
const datum = { alternative: 0, fields: [42, "deadbeef"] };
// Or use helper: mConStr0([42, "deadbeef"])
// mConStr1([...]) for constructor index 1, etc.

.txOutInlineDatumValue(datum)           // default type is "Mesh"
.txOutInlineDatumValue(datum, "Mesh")   // explicit
```

**`"JSON"` — Cardano-CLI format, uses `constructor`:**
```typescript
import { conStr0, integer, byteString, pubKeyAddress } from '@meshsdk/common';

// JSON format uses "constructor" with typed field wrappers
const datum = conStr0([integer(42), byteString("deadbeef")]);
// Equivalent to: { constructor: 0, fields: [{ int: 42 }, { bytes: "deadbeef" }] }

.txOutInlineDatumValue(datum, "JSON")   // MUST specify "JSON"
```

**`"CBOR"` — Pre-serialized hex:**
```typescript
.txOutInlineDatumValue("d8799f182aff", "CBOR")
```

**Convention from real MeshJS contracts:**

| Scenario | Format | Helpers | Type Parameter |
|----------|--------|---------|----------------|
| **Datums** (always) | JSON | `conStr0()`, `integer()`, `pubKeyAddress()` | `"JSON"` (explicit) |
| **Redeemers** (empty, no fields) | Mesh | `mConStr0([])`, `mConStr1([])` | omit (default `"Mesh"`) |
| **Redeemers** (with fields) | JSON | `conStr0()` + typed wrappers | `"JSON"` + `DEFAULT_REDEEMER_BUDGET` |
| **Redeemers** (unused/`Data` type) | N/A | `""` (empty string) | omit |

**Note:** Some contracts use Mesh format (`mConStr0`) for simple datums without a type parameter. Both formats work — the critical rule is **matching the type parameter to the format**.

See [AIKEN-MAPPING.md](./AIKEN-MAPPING.md) for complete Aiken type → Mesh data mapping.

**CRITICAL:** If you omit the type parameter, the default is `"Mesh"`. Using `{ constructor: 0, ... }` without specifying `"JSON"` will cause errors.

### Reference Scripts
Use `*TxInReference()` methods to reference scripts stored on-chain instead of including them in the transaction (reduces tx size/fees).

## Important Notes

1. **Change address required** - `complete()` fails without `changeAddress()`
2. **Collateral required** - Script transactions need `txInCollateral()`
3. **Order matters** - Call `spendingPlutusScriptV3()` BEFORE `txIn()` for script inputs
4. **Coin selection** - Provide UTxOs via `selectUtxosFrom()` for auto-selection
5. **Datum format** - Default `"Mesh"` type uses `{ alternative: 0 }`, NOT `{ constructor: 0 }`. Use `"JSON"` type for `{ constructor: 0 }` (cardano-cli format)
6. **Script version** - Default to V3 for Conway-era scripts. Match the Plutus version the script was compiled with
