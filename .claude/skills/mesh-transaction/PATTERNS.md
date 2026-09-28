# Transaction Patterns

Common transaction patterns and recipes for `@meshsdk/transaction`.

## Table of Contents

- [Basic Transactions](#basic-transactions)
- [Script Transactions](#script-transactions)
- [Minting](#minting)
- [Staking](#staking)
- [Governance (Conway)](#governance-conway)
- [Advanced Patterns](#advanced-patterns)

---

## Basic Transactions

### Send ADA with Manual Inputs

```typescript
import { MeshTxBuilder } from '@meshsdk/transaction';

const txBuilder = new MeshTxBuilder();

const unsignedTx = txBuilder
  .txIn(
    '2cb57168ee66b68bd04a0d595060b546edf30c04ae1031b883c9ac797967dd85',
    0,
    [{ unit: 'lovelace', quantity: '10000000' }],
    'addr_test1qz...'
  )
  .txOut(
    'addr_test1qp...',
    [{ unit: 'lovelace', quantity: '5000000' }]
  )
  .changeAddress('addr_test1qz...')
  .completeSync();
```

### Send ADA with Auto Coin Selection

```typescript
import { MeshTxBuilder, BlockfrostProvider } from '@meshsdk/core';

const provider = new BlockfrostProvider('your-api-key');

const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
  evaluator: provider,
});

// Get wallet UTxOs
const utxos = await provider.fetchAddressUTxOs(walletAddress);

const unsignedTx = await txBuilder
  .txOut('addr_test1qp...', [
    { unit: 'lovelace', quantity: '5000000' }
  ])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

// Sign with wallet
const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);
```

### Send Multiple Assets

```typescript
const unsignedTx = await txBuilder
  .txOut('addr_test1qp...', [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: 'policyId' + 'assetNameHex', quantity: '100' }
  ])
  .txOut('addr_test1qr...', [
    { unit: 'lovelace', quantity: '3000000' }
  ])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Add Metadata

```typescript
const unsignedTx = await txBuilder
  .txOut('addr_test1qp...', [{ unit: 'lovelace', quantity: '2000000' }])
  .metadataValue(721, {
    [policyId]: {
      [assetName]: {
        name: 'My NFT',
        image: 'ipfs://...',
        description: 'An awesome NFT'
      }
    }
  })
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

---

## Script Transactions

### Spend from Plutus Script (Inline Datum)

```typescript
import { mConStr0 } from '@meshsdk/common';

const unsignedTx = await txBuilder
  // 1. Signal Plutus script version
  //    Static: .spendingPlutusScriptV3()
  //    Dynamic: .spendingPlutusScript("V3")
  //    Both are equivalent — use whichever you prefer
  .spendingPlutusScriptV3()
  // 2. Add the script UTxO
  .txIn(
    scriptUtxo.input.txHash,
    scriptUtxo.input.outputIndex,
    scriptUtxo.output.amount,
    scriptAddress
  )
  // 3. Provide the script
  .txInScript(scriptCbor)
  // 4. Signal inline datum is present
  .txInInlineDatumPresent()
  // 5. Provide redeemer (Mesh format — convention for redeemers)
  .txInRedeemerValue(mConStr0([]))
  // 6. Add collateral
  .txInCollateral(
    collateralUtxo.input.txHash,
    collateralUtxo.input.outputIndex,
    collateralUtxo.output.amount,
    collateralUtxo.output.address
  )
  // 7. Add output and complete
  .txOut(recipientAddress, [{ unit: 'lovelace', quantity: '5000000' }])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Spend from Plutus Script (Datum Hash)

When the UTxO was locked with `.txOutDatumHashValue()` (hash stored on-chain, not full datum), you must provide the full datum when spending:

```typescript
import { mConStr0 } from '@meshsdk/common';

const datum = mConStr0([ownerPubKeyHash]);

const unsignedTx = await txBuilder
  .spendingPlutusScriptV3()
  .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount, scriptAddress)
  .txInScript(scriptCbor)
  .txInDatumValue(datum)  // Must provide full datum for datum-hash UTxOs
  .txInRedeemerValue(mConStr0([]))
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .requiredSignerHash(ownerPubKeyHash)
  .txOut(recipientAddress, outputAmount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Spend with Unused Redeemer (Generic Data Type)

When the Aiken contract uses `_redeemer: Data` (not validated), pass an empty string:

```typescript
const unsignedTx = await txBuilder
  .spendingPlutusScriptV3()
  .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount, scriptAddress)
  .txInScript(scriptCbor)
  .spendingReferenceTxInInlineDatumPresent()
  .spendingReferenceTxInRedeemerValue("")  // Empty string for unused redeemer
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .txOut(recipientAddress, outputAmount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Use Reference Script

```typescript
const unsignedTx = await txBuilder
  .spendingPlutusScriptV3()
  .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex)
  // Reference script instead of inline
  .spendingTxInReference(
    refScriptUtxo.input.txHash,
    refScriptUtxo.input.outputIndex,
    scriptSize.toString(),  // Script size in bytes
    scriptHash
  )
  // These alias methods are equivalent to txInInlineDatumPresent() / txInRedeemerValue()
  .spendingReferenceTxInInlineDatumPresent()
  .spendingReferenceTxInRedeemerValue(redeemer)
  .txInCollateral(...)
  .txOut(...)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Lock Funds at Script Address

Two approaches for datum construction — both are valid:

**Mesh format (default type, simpler):**
```typescript
import { mConStr0 } from '@meshsdk/common';

// Mesh format: "alternative" keyword, primitive values directly
const datum = mConStr0([beneficiaryPubKeyHash, unlockTime]);
// Equivalent to: { alternative: 0, fields: [beneficiaryPubKeyHash, unlockTime] }

const unsignedTx = await txBuilder
  .txOut(scriptAddress, [{ unit: 'lovelace', quantity: '10000000' }])
  .txOutInlineDatumValue(datum)  // default type is "Mesh"
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

**JSON format (convention from real contracts, typed wrappers):**
```typescript
import { conStr0, byteString, integer, pubKeyAddress } from '@meshsdk/common';

// JSON format: "constructor" keyword, typed field wrappers
const datum = conStr0([
  pubKeyAddress(beneficiaryPkh),
  integer(unlockTime),
]);

const unsignedTx = await txBuilder
  .txOut(scriptAddress, [{ unit: 'lovelace', quantity: '10000000' }])
  .txOutInlineDatumValue(datum, "JSON")  // MUST specify "JSON"
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

See [AIKEN-MAPPING.md](./AIKEN-MAPPING.md) for complete Aiken type → datum/redeemer mapping.

---

## Minting

### Mint with Plutus Policy

```typescript
import { mConStr0 } from '@meshsdk/common';

const policyId = 'abc123...';
const assetName = '4d79546f6b656e';  // "MyToken" in hex

const unsignedTx = await txBuilder
  // 1. Signal Plutus minting (V3 for Conway, V2 for Babbage)
  .mintPlutusScriptV3()
  // 2. Add mint operation
  .mint('1', policyId, assetName)
  // 3. Provide minting policy
  .mintingScript(policyScriptCbor)
  // 4. Provide redeemer
  .mintRedeemerValue(mConStr0([]))
  // 5. Collateral for script execution
  .txInCollateral(...)
  // 6. Send minted token somewhere
  .txOut(recipientAddress, [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: policyId + assetName, quantity: '1' }
  ])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Mint with Native Script

```typescript
// Native script - no redeemer needed
const unsignedTx = await txBuilder
  .mint('100', policyId, assetName)
  .mintingScript(nativeScriptCbor)  // Native script CBOR
  .txOut(recipientAddress, [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: policyId + assetName, quantity: '100' }
  ])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Burn Tokens

```typescript
// Negative quantity = burn
const unsignedTx = await txBuilder
  .mintPlutusScriptV3()
  .mint('-50', policyId, assetName)  // Burn 50 tokens
  .mintingScript(policyScriptCbor)
  .mintRedeemerValue(mConStr1([]))  // Burn action (constructor index 1)
  .txInCollateral(...)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Mint Multiple Assets (Same Policy)

```typescript
const unsignedTx = await txBuilder
  .mintPlutusScriptV3()
  .mint('1', policyId, 'TokenA')
  .mintingScript(policyScriptCbor)
  .mintRedeemerValue(mConStr0([]))
  // Additional mints with same policy auto-group
  .mintPlutusScriptV3()
  .mint('5', policyId, 'TokenB')
  .mintingScript(policyScriptCbor)
  .mintRedeemerValue(mConStr0([]))  // Must be same redeemer for same policy
  .txInCollateral(...)
  .txOut(recipientAddress, [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: policyId + 'TokenA', quantity: '1' },
    { unit: policyId + 'TokenB', quantity: '5' }
  ])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

---

## Staking

### Register and Delegate Stake

```typescript
const unsignedTx = await txBuilder
  // Register stake address (2 ADA deposit)
  .registerStakeCertificate(stakeAddress)
  // Delegate to pool
  .delegateStakeCertificate(stakeAddress, poolId)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Withdraw Staking Rewards

```typescript
const rewards = await provider.fetchAccountInfo(stakeAddress);
const rewardAmount = rewards.withdrawableAmount;

const unsignedTx = await txBuilder
  .withdrawal(stakeAddress, rewardAmount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Withdraw with Script

```typescript
const unsignedTx = await txBuilder
  .withdrawalPlutusScriptV3()
  .withdrawal(scriptStakeAddress, rewardAmount)
  .withdrawalScript(withdrawalScriptCbor)
  .withdrawalRedeemerValue(redeemer)
  .txInCollateral(...)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Deregister Stake (Reclaim Deposit)

```typescript
const unsignedTx = await txBuilder
  .deregisterStakeCertificate(stakeAddress)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

---

## Governance (Conway)

### Register as DRep

```typescript
const anchor = {
  anchorUrl: 'https://example.com/drep-metadata.json',
  anchorDataHash: 'abc123...'  // Hash of metadata file
};

const unsignedTx = await txBuilder
  .drepRegistrationCertificate(
    drepId,
    anchor,
    '500000000000'  // 500 ADA deposit
  )
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Vote on Governance Action

```typescript
const voter = {
  type: 'DRep',
  drepId: 'drep1...'
};

const govActionId = {
  txHash: 'abc123...',
  txIndex: 0
};

const votingProcedure = {
  vote: 'Yes',
  anchor: {
    anchorUrl: 'https://example.com/rationale.json',
    anchorDataHash: 'xyz789...'
  }
};

const unsignedTx = await txBuilder
  .vote(voter, govActionId, votingProcedure)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Delegate Voting Power

```typescript
const drep = {
  type: 'DRepId',
  drepId: 'drep1...'
};
// Or: { type: 'AlwaysAbstain' }
// Or: { type: 'AlwaysNoConfidence' }

const unsignedTx = await txBuilder
  .voteDelegationCertificate(drep, stakeAddress)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

---

## Datum & Redeemer Construction

### Convention from Real MeshJS Contracts (9 contracts studied)

| Scenario | Format | Helpers | Type Param |
|----------|--------|---------|------------|
| **Datums** | JSON | `conStr0()` + `integer()`, `pubKeyAddress()`, etc. | `"JSON"` (explicit) |
| **Redeemers (empty)** | Mesh | `mConStr0([])`, `mConStr1([])`, etc. | omit (default) |
| **Redeemers (with fields)** | JSON | `conStr0()` + typed wrappers | `"JSON"`, `DEFAULT_REDEEMER_BUDGET` |
| **Redeemers (unused)** | N/A | `""` (empty string) | omit |

```typescript
import {
  // JSON helpers (datums & complex redeemers)
  conStr0, conStr1, integer, byteString, pubKeyAddress,
  // Mesh helpers (empty redeemers & simple datums)
  mConStr0, mConStr1, mConStr2,
  DEFAULT_REDEEMER_BUDGET,
} from '@meshsdk/common';

// Datum (JSON format) — typed wrappers + explicit "JSON" type
const datum = conStr0([pubKeyAddress(ownerPkh), integer(deadline)]);
txBuilder.txOutInlineDatumValue(datum, "JSON");

// Redeemer - empty (Mesh format, default type)
txBuilder.txInRedeemerValue(mConStr1([]));

// Redeemer - with fields (JSON format, explicit type + budget)
const complexRedeemer = conStr0([pubKeyAddress(recipientPkh), value(depositAmount)]);
txBuilder.txInRedeemerValue(complexRedeemer, "JSON", DEFAULT_REDEEMER_BUDGET);

// Redeemer - unused Data type (empty string)
txBuilder.spendingReferenceTxInRedeemerValue("");
```

### Reading On-Chain Datum

```typescript
import { deserializeDatum, serializeAddressObj } from '@meshsdk/core';

// Parse datum from UTxO's inline Plutus data
const datum = deserializeDatum<MyDatumType>(utxo.output.plutusData!);

// Access fields by index (matches Aiken record field order)
const priceField = datum.fields[1].int;       // Integer
const ownerField = datum.fields[0];           // Address object
const hashField = datum.fields[2].bytes;      // ByteArray

// Convert address object back to bech32
const address = serializeAddressObj(datum.fields[0], networkId);
```

### Combined Spend + Mint in Same Transaction

```typescript
import { mConStr0, mConStr1 } from '@meshsdk/common';

const tx = await txBuilder
  // --- Spending part ---
  .spendingPlutusScriptV3()
  .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex,
        scriptUtxo.output.amount, scriptAddress)
  .txInScript(spendingScriptCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(mConStr0([]))  // spending redeemer

  // --- Minting part ---
  .mintPlutusScriptV3()
  .mint('-1', burnPolicyId, burnAssetName)
  .mintingScript(mintingPolicyCbor)
  .mintRedeemerValue(mConStr1([]))  // burn redeemer

  // --- Common ---
  .txInCollateral(collateralHash, collateralIndex, collateralAmount, collateralAddr)
  .txOut(recipientAddress, [{ unit: 'lovelace', quantity: '5000000' }])
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

---

## Advanced Patterns

### Multi-Signature Transaction

```typescript
const unsignedTx = await txBuilder
  .txOut(recipientAddress, amount)
  .requiredSignerHash(signer1PubKeyHash)
  .requiredSignerHash(signer2PubKeyHash)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

// First signer signs partially
const partialSig1 = await wallet1.signTx(unsignedTx, true);  // partial = true

// Second signer signs
const fullySigned = await wallet2.signTx(partialSig1, true);

// Submit
const txHash = await wallet1.submitTx(fullySigned);
```

### Offline Transaction Building

```typescript
import { OfflineFetcher, MeshTxBuilder } from '@meshsdk/core';

const offlineFetcher = new OfflineFetcher('preprod');

// Cache UTxOs for offline use
offlineFetcher.cacheUtxos(cachedUtxos);

const txBuilder = new MeshTxBuilder({
  fetcher: offlineFetcher,
  params: {
    minFeeA: 44,
    minFeeB: 155381,
    coinsPerUtxoSize: 4310,
    // ... other protocol params
  }
});

const unsignedTx = await txBuilder
  .txOut(recipientAddress, amount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(cachedUtxos)
  .complete();
```

### Chained Transactions

Build transaction B that depends on output from transaction A (before A is on-chain):

```typescript
// Build first transaction
const txA = await txBuilder
  .txOut(scriptAddress, [{ unit: 'lovelace', quantity: '5000000' }])
  .txOutInlineDatumValue(datum)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();

// Get txA hash (before submission)
const txAHash = await wallet.signTx(txA);
const txAId = // derive from signed tx

// Build second transaction that spends from txA
const txB = await new MeshTxBuilder({ fetcher, submitter, evaluator })
  .chainTx(txAHash)  // Tell builder about pending tx
  .spendingPlutusScriptV3()
  .txIn(txAId, 0)  // Spend output from txA
  .txInScript(scriptCbor)
  .txInInlineDatumPresent()
  .txInRedeemerValue(redeemer)
  .inputForEvaluation({
    input: { txHash: txAId, outputIndex: 0 },
    output: { address: scriptAddress, amount: [...], ... }
  })
  .txInCollateral(...)
  .txOut(recipientAddress, amount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Deploy Reference Script

```typescript
const unsignedTx = await txBuilder
  .txOut(
    refScriptHolderAddress,
    [{ unit: 'lovelace', quantity: '10000000' }]  // Min UTxO for script
  )
  .txOutReferenceScript(scriptCbor, 'V2')  // Attach script as reference
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Time-Locked Transaction

```typescript
const currentSlot = await provider.fetchLatestSlot();
const lockUntilSlot = currentSlot + 3600;  // ~1 hour

const unsignedTx = await txBuilder
  .invalidBefore(lockUntilSlot)  // Valid only after this slot
  .txOut(recipientAddress, amount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```

### Hydra L2 Transaction

```typescript
const txBuilder = new MeshTxBuilder({
  isHydra: true,  // Zero fees for Hydra
  fetcher: hydraProvider,
  submitter: hydraProvider,
});

const unsignedTx = await txBuilder
  .txOut(recipientAddress, amount)
  .changeAddress(walletAddress)
  .selectUtxosFrom(utxos)
  .complete();
```
