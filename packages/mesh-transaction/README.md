# @meshsdk/transaction

Transaction building utilities for the Mesh SDK. This package provides a high-level API for constructing, signing, and managing Cardano transactions.

## Installation

```bash
npm install @meshsdk/transaction
```

## Overview

The `@meshsdk/transaction` package exposes the primary transaction builder classes used to compose Cardano transactions:

- **MeshTxBuilder** — Lower-level, composable transaction builder with full control
- **Transaction** — Higher-level, fluent API for common transaction patterns

## Usage

### MeshTxBuilder

`MeshTxBuilder` provides a composable, lower-level API for building transactions with full control over inputs, outputs, scripts, and metadata.

```typescript
import { MeshTxBuilder } from '@meshsdk/transaction';
import { BlockfrostProvider } from '@meshsdk/provider';

const provider = new BlockfrostProvider('YOUR_PROJECT_ID');

const txBuilder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
  evaluator: provider,
});

// Build a simple ADA transfer
const unsignedTx = await txBuilder
  .txIn(
    'TX_HASH',
    0,            // tx output index
    [{ unit: 'lovelace', quantity: '5000000' }],
    'addr1...'    // input address
  )
  .txOut('addr1_recipient...', [{ unit: 'lovelace', quantity: '2000000' }])
  .changeAddress('addr1_change...')
  .complete();

console.log(unsignedTx); // CBOR hex of unsigned transaction
```

#### Minting Tokens

```typescript
const unsignedTx = await txBuilder
  .txIn(txHash, 0, inputValue, address)
  .mint([{ assetName: 'MeshToken', quantity: '1' }], policyId)
  .mintingScript(nativeScriptCbor)
  .txOut(recipientAddress, [{ unit: policyId + assetNameHex, quantity: '1' }])
  .changeAddress(changeAddress)
  .complete();
```

#### Using Plutus Scripts

```typescript
const unsignedTx = await txBuilder
  .txIn(collateralTxHash, 0, collateralValue, walletAddress)
  .txInCollateral(collateralTxHash, 0, collateralValue, walletAddress)
  .spendingPlutusScriptV2()
  .txIn(scriptTxHash, 0, scriptUtxoValue, scriptAddress)
  .txInInlineDatumPresent()
  .txInRedeemerValue(redeemer)
  .txOut(recipientAddress, outputValue)
  .changeAddress(walletAddress)
  .requiredSignerHash(pubKeyHash)
  .complete();
```

### Transaction (High-Level API)

The `Transaction` class provides a simpler, fluent API for the most common transaction patterns.

```typescript
import { Transaction } from '@meshsdk/transaction';

const tx = new Transaction({ initiator: wallet });

// Send ADA
await tx
  .sendLovelace('addr1_recipient...', '5000000')
  .setChangeAddress('addr1_change...')
  .build();

// Send assets
await tx
  .sendAssets('addr1_recipient...', [
    { unit: 'lovelace', quantity: '2000000' },
    { unit: 'policyId.assetName', quantity: '1' },
  ])
  .build();
```

## API Reference

### MeshTxBuilder

#### Constructor Options

```typescript
interface MeshTxBuilderOptions {
  fetcher?: IFetcher;       // For resolving inputs
  submitter?: ISubmitter;   // For submitting transactions
  evaluator?: IEvaluator;   // For evaluating Plutus scripts
  serializer?: IMeshTxSerializer; // Custom serializer (defaults to CSL or CST)
  isHydra?: boolean;        // Enable Hydra head mode
  params?: Partial<Protocol>; // Override protocol parameters
  verbose?: boolean;        // Enable verbose logging
}
```

#### Input Methods

- `txIn(txHash, txIndex, amount, address)` — Add a transaction input
- `txInCollateral(txHash, txIndex, amount, address)` — Add a collateral input
- `readOnlyTxInReference(txHash, txIndex)` — Add a read-only reference input
- `spendingPlutusScriptV1()` / `spendingPlutusScriptV2()` / `spendingPlutusScriptV3()` — Set Plutus version for next input
- `txInScript(scriptCbor)` — Attach inline spending script
- `txInDatumValue(datum)` — Set datum value for script input
- `txInInlineDatumPresent()` — Use inline datum from UTxO
- `txInRedeemerValue(redeemer, exUnits?)` — Set redeemer for script input

#### Output Methods

- `txOut(address, amount)` — Add a transaction output
- `txOutDatumHashValue(datum)` — Attach datum hash to output
- `txOutInlineDatumValue(datum)` — Attach inline datum to output
- `txOutReferenceScript(scriptCbor, version?)` — Attach reference script to output

#### Minting Methods

- `mint(amount, policy)` — Add minting entry
- `mintingScript(scriptCbor)` — Attach native/Plutus minting script
- `mintRedeemerValue(redeemer, exUnits?)` — Set minting redeemer
- `mintTxInReference(txHash, txIndex)` — Use reference script for minting

#### Certificate & Staking Methods

- `registerStakeCertificate(rewardAddress)` — Register a stake address
- `deregisterStakeCertificate(rewardAddress)` — Deregister a stake address
- `delegateStakeCertificate(rewardAddress, poolId)` — Delegate stake to a pool
- `withdrawal(rewardAddress, lovelace)` — Add a reward withdrawal

#### Metadata

- `metadataValue(tag, metadata)` — Attach transaction metadata

#### Finalization

- `changeAddress(address)` — Set the change output address
- `validFrom(slot)` — Set transaction validity start slot
- `invalidBefore(slot)` — Alias for `validFrom`
- `validTo(slot)` — Set transaction validity end slot (TTL)
- `invalidHereafter(slot)` — Alias for `validTo`
- `requiredSignerHash(pubKeyHash)` — Add required signer
- `signingKey(skeyHex)` — Add signing key for auto-signing
- `complete(options?)` — Finalize and serialize the transaction
- `completeSigning()` — Apply any attached signing keys

## Contributing

Please read the [Contributing Guide](../../CONTRIBUTING.md) before submitting pull requests.

## License

[Apache License 2.0](../../LICENSE.md)
