# Scalus emulator for Mesh

A local ledger implementing Mesh's `IFetcher`, `ISubmitter` and `IEvaluator`.
Requires Scalus 1.2.0 or newer. The provider reads protocol parameters, cost
models and decoded UTxOs from the same emulator that validates transactions.

```ts
import { MeshTxBuilder } from "@meshsdk/core";
import { ScalusEmulator } from "@meshsdk/scalus-emulator";

// initialUtxos is a Mesh UTxO[]. The default network is preview.
const provider = await ScalusEmulator.create(initialUtxos);
const params = await provider.fetchProtocolParameters();
const builder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
  evaluator: provider,
  params,
});
```

For an existing emulator, construction remains synchronous:

```ts
import { CardanoInfo, Emulator } from "scalus";

import { ScalusEmulator } from "@meshsdk/scalus-emulator";

const emulator = Emulator.create(CardanoInfo.preprod());
const provider = new ScalusEmulator(emulator);
```

## Migrating from the old constructor

Replace `new ScalusEmulator(utxos, slotConfig, options)` with
`await ScalusEmulator.create(utxos, cardanoInfo)`. Use `CardanoInfo.preview()`,
`preprod()` or `mainnet()` for a standard network. For a private network, use
`CardanoInfo.custom(network, slotConfig, protocolParams)`. Custom protocol
parameters and cost models belong in that `CardanoInfo`. Pass the result of
`provider.fetchProtocolParameters()` as the builder's `params` option, as in the
example above, so building, evaluation and ledger validation use the same
configuration. The old separate
`protocolParams` and `costModels` options are removed.

`provider.emulator` exposes the underlying ledger for seeding, snapshots,
slot control and assertions. Initial UTxOs preserve inline datums, datum
hashes and reference scripts. Following Mesh's UTxO convention, `plutusData`
means the datum is inline; a supplied `dataHash` must match it. A resolved
hash-datum output must carry `dataHash` only. Mesh reference scripts use their
raw script CBOR and the adapter handles the ledger's tag-24 wrapper.

Explorer/history methods remain unsupported and reject with an explicit error.
`fetchProtocolParameters` reports the emulator's transaction-building parameters;
Mesh defaults supply block-level fields that Scalus's public API does not expose.

## ESM and CommonJS

Both package formats load Scalus lazily with native `import()`. CommonJS callers
can use `require("@meshsdk/scalus-emulator")`, then await `ScalusEmulator.create()`.
Do not use `require("scalus")`: Scalus is ESM-only. Scalus remains a direct runtime
dependency. Node.js 20 or newer is required by Scalus 1.2.

## Browser builds

Scalus 1.2 uses Web Crypto and can be included in browser bundles. The package
checks cover Node ESM, CommonJS and a headless-browser runtime. A browser bundle
of the combined Mesh dependency graph still needs the standard Buffer, crypto,
stream and events shims used by the package harness.

## Tests

After building workspace dependencies:

```sh
npm test --workspace @meshsdk/scalus-emulator
SCALUS_TARBALL=/path/to/scalus-1.2.0.tgz npm run test:scalus-packages
```

The tests build, evaluate, sign and submit a context-reading Plutus V3 spend,
exercise payment/minting/rejection flows and verify parameter and UTxO conversion.
Jest runs with VM modules enabled so it tests the actual ESM dependency.
