# @meshsdk/devnet

A lightweight, single-process Cardano devnet for local development.

It runs an HTTP server that speaks MeshSDK's `IFetcher` + `ISubmitter`
interfaces, so you can point any `MeshTxBuilder` / `MeshWallet` at it
exactly the way you'd point them at Blockfrost or Maestro — except
there is **no Blockfrost, no external service, and no `cardano-node`
binary**. The devnet *is* the chain.

The goal is the same as
[`yaci-devkit`](https://github.com/bloxbean/yaci-devkit) but without
the JVM, Docker, or Postgres: a pure-TypeScript node you can boot in
~3 seconds, fund a wallet, build & sign a real Cardano CBOR
transaction, validate it against Conway-era ledger rules and watch it
land in a block.

> **Status:** works end-to-end for **basic ADA / native-asset UTxO
> transactions and Plutus V1/V2/V3 smart-contract transactions
> (spending + minting scripts, collateral validation, ExUnit budget
> enforcement)**. Certificates, withdrawals and governance are *not*
> implemented yet — see [Roadmap](#roadmap) for the honest list.

---

## Table of contents

1. [Why this exists](#why-this-exists)
2. [Quick start](#quick-start)
3. [Architecture](#architecture)
4. [Workflow — sign & submit a tx with `MeshTxBuilder`](#workflow--sign--submit-a-tx-with-meshtxbuilder)
5. [CLI reference](#cli-reference)
6. [HTTP API reference](#http-api-reference)
7. [Configuration](#configuration)
8. [Project layout](#project-layout)
9. [Build, dev, test scripts](#build-dev-test-scripts)
10. [Roadmap](#roadmap)
11. [Honest limitations & known issues](#honest-limitations--known-issues)
12. [References](#references)

---

## Why this exists

Cardano devs today have three realistic choices for local testing:

| Tool | Stack | Cold-boot |
|---|---|---|
| `cardano-node` + `cardano-cli` | Haskell binary, `db/` directory, ~6 GB RAM | minutes |
| `yaci-devkit` | Java + Docker + Postgres | ~30 s |
| Blockfrost / Maestro testnet | Network round-trip, signup, rate limits | n/a (remote) |

`@meshsdk/devnet` is a fourth option: a Node.js process. You install it,
run `npm run dev`, and you have a chain.

Inspirations and credits:

- [`IntersectMBO/cardano-ledger`](https://github.com/IntersectMBO/cardano-ledger) — the source of truth for rule names (`UTXO`, `UTXOW`, `LEDGER`)
- [`txpipe/pallas`](https://github.com/txpipe/pallas) — Rust ledger primitives, used as a cross-reference for CBOR shapes
- [`HarmonicLabs/cardano-ledger-ts`](https://github.com/HarmonicLabs/cardano-ledger-ts) — the TypeScript CBOR/ledger types we delegate parsing to
- [`MeshJS`](https://github.com/MeshJS/mesh) — the wallet & transaction-builder ecosystem this devnet plugs into
- [`bloxbean/yaci-devkit`](https://github.com/bloxbean/yaci-devkit) — the design we're aiming at (just simpler)

---

## Quick start

```bash
cd packages/mesh-devnet
npm install
npm run build:mesh      # tsc → dist/
npm run dev             # ts-node → boots on http://localhost:4000
# or: npx mesh-devnet start
```

You'll see a banner with five pre-funded wallets (10 000 ADA each):

```
Pre-funded Wallets  (test keys — never use on mainnet)
  [0] addr_test1vrj07epw66rtv3x9evuuyvxzfv8g5hv9quqewx7auvjnemqsd7zy3
       10000 ADA   cli-key: 5820aaaaaaaaaaaaaaaa…
  [1] addr_test1vpujgcun6m9y4k75p4slfy5kxwgw2452l2ec6fnryuja42cw9v92z
       10000 ADA   cli-key: 5820bbbbbbbbbbbbbbbb…
  ...
```

In another terminal, run the smoke test — it builds, signs and submits a
real Cardano CBOR transaction with `MeshTxBuilder`, then waits for the
block:

```bash
npm run selftest -- --from 0 --to 1 --ada 5
```

Expected output:

```
selftest OK
  from   : addr_test1vrj07epw66rtv3x9evuuyvxzfv8g5hv9quqewx7auvjnemqsd7zy3
  to     : addr_test1vpujgcun6m9y4k75p4slfy5kxwgw2452l2ec6fnryuja42cw9v92z
  amount : 5 ADA
  txHash : c727cd24522a1833c87be3b8bfb39513ea345afb57764b941f215ba94a554f06
  receiver balance after: 10005000000 lovelace (10005 ADA)
```

---

## Architecture

```
                ┌────────────────────────────────────────────────┐
                │                mesh-devnet                     │
                │                                                │
   POST /tx ──▶ │  TransactionValidator  (UTXO/UTXOW rules)      │
                │            │                                   │
                │            ▼                                   │
                │      Mempool (Map<txHash, MempoolEntry>)       │
                │            │                                   │
                │            ▼                                   │
                │      BlockProducer (slot ticker)               │
                │            │                                   │
                │            ▼                                   │
                │      LedgerState (UTxO Map + block list)       │
                │            ▲                                   │
                │            │                                   │
   GET  /utxos ─┴──── HTTP API (Express) ──── /tx /params /tip   │
                                                                 │
        ┌────────────────────────────────────────────────────────┘
        │
        ▼
   DevnetProvider (implements IFetcher + ISubmitter + IListener)
        │
        ▼
   MeshTxBuilder / MeshWallet  (your dApp / scripts)
```

Each component is a single file (~50–500 LOC), no inheritance, no DI:

| File | Purpose | Maps to in real Cardano |
|---|---|---|
| `src/crypto.ts` | blake2b-256 / -224 + Ed25519 | `cardano-crypto-class` |
| `src/config.ts` | Conway protocol params + network identity | `shelley-genesis.json` + `protocol-parameters.json` |
| `src/types.ts` | Internal `UTxO`/`Tx`/`Block` shapes | `Cardano.Ledger.Conway.{Tx,UTxO}` |
| `src/genesis.ts` | 5 deterministic test wallets + initial UTxOs | Shelley genesis UTxOs |
| `src/ledger/state.ts` | In-memory UTxO Map + chain | `LedgerState` + `ChainDB` |
| `src/ledger/validator.ts` | UTXO/UTXOW/LEDGER rule set | `Cardano.Ledger.Conway.Rules.*` |
| `src/mempool.ts` | Map of validated pending txs | `ouroboros-network` mempool |
| `src/producer.ts` | Slot ticker + block sealer | Praos consensus + block forging |
| `src/api/server.ts` | HTTP routes | local equivalent of `cardano-submit-api` + `cardano-db-sync` |
| `src/provider.ts` | MeshSDK `IFetcher` + `ISubmitter` adapter | client-side equivalent of `BlockfrostProvider` |
| `src/tx-builder.ts` | Helper that returns a configured `MeshWallet` + `MeshTxBuilder` | n/a (Mesh-side) |
| `src/index.ts` | `commander` CLI + banner | n/a (operator UX) |

---

## Workflow — sign & submit a tx with `MeshTxBuilder`

The point of the devnet: developers should not need to learn anything
new. Pass the `DevnetProvider` to MeshSDK and everything works.

```typescript
// 1. Boot the devnet in one terminal:
//    npm run dev

// 2. In your dApp / script:
import { MeshTxBuilder, MeshWallet } from '@meshsdk/core';
import { DevnetProvider }            from '@meshsdk/devnet/provider';

// 3. Plug DevnetProvider in wherever you'd plug BlockfrostProvider.
const provider = new DevnetProvider('http://localhost:3000');

// 4. Pull protocol params + the pre-funded genesis wallets straight from the
//    devnet — no manual JSON files, no faucet sign-up.
const params  = await provider.fetchProtocolParameters();
const wallets = await provider.getWallets();

// 5. Build a MeshWallet from the genesis cli-key envelope (5820<seed>).
//    The genesis funds the *enterprise* address (no stake key), so we pass
//    'enterprise' explicitly when fetching UTxOs and the change address.
const wallet = new MeshWallet({
  networkId: 0,                      // 0 = testnet → addr_test1…
  fetcher:   provider,               // IFetcher
  submitter: provider,               // ISubmitter
  key: { type: 'cli', payment: wallets[0].privateKeyCli },
});
await wallet.init();

const utxos  = await wallet.getUtxos('enterprise');
const change = await wallet.getChangeAddress('enterprise');

// 6. Build with MeshTxBuilder. Identical to mainnet — Mesh handles fee
//    estimation, input selection, witness assembly, and CBOR encoding.
const builder  = new MeshTxBuilder({ fetcher: provider, submitter: provider, params });
const unsigned = await builder
  .txOut(wallets[1].address, [{ unit: 'lovelace', quantity: '5000000' }])
  .changeAddress(change)
  .selectUtxosFrom(utxos)
  .complete();                       // CBOR-hex string

// 7. Sign & submit.
const signed = await wallet.signTx(unsigned);
const txHash = await provider.submitTx(signed);

// 8. Wait for inclusion (default slot length = 1 s).
await new Promise<void>((resolve, reject) => {
  provider.onTxConfirmed(txHash, () => resolve(), 30);
  setTimeout(() => reject(new Error('not confirmed')), 30_000);
});

console.log('done →', txHash);
```

Or use the bundled helper to skip the `MeshWallet` boilerplate:

```typescript
import { meshFromGenesisSeed } from '@meshsdk/devnet/tx-builder';

const { wallet, builder } = await meshFromGenesisSeed(provider, params, seedHex);
```

---

## CLI reference

```
mesh-devnet [command] [options]
```

| Command | Description |
|---|---|
| `start` *(default)* | Start the devnet node + HTTP API |
| `wallets` | List pre-funded genesis wallets from a running devnet |
| `tip` | Show the chain tip |
| `utxos <address>` | Show UTxOs at an address |
| `topup <address> <ada>` | Faucet — fund any address (devnet only) |
| `selftest [--from N --to N --ada N]` | Build + sign + submit + confirm a real tx via MeshTxBuilder |

`start` flags:

| Flag | Default | Meaning |
|---|---|---|
| `-p, --port <n>` | `3000` | HTTP API port |
| `--slot-length <ms>` | `1000` | ms per slot |
| `--epoch-length <slots>` | `100` | slots per epoch |
| `--min-fee-a <n>` | `44` | linear fee coefficient |
| `--min-fee-b <n>` | `155381` | constant fee coefficient |
| `--coins-per-utxo-byte <n>` | `4310` | min-ADA coefficient |

---

## HTTP API reference

All responses are JSON unless noted. Submit endpoint accepts raw CBOR
(`application/cbor`) **or** JSON `{"cbor": "<hex>"}`.

| Method | Path | Returns |
|---|---|---|
| `GET`  | `/health` | `{ ok, networkMagic, networkId, era }` |
| `GET`  | `/tip` | current slot, block height, hash, epoch, network identity |
| `GET`  | `/params` | Mesh-shaped `Protocol` (numeric where Mesh expects numbers) |
| `GET`  | `/utxos/:address` | array of UTxOs (filterable with `?asset=<unit>`) |
| `GET`  | `/utxo/:txHash/:idx` | single UTxO (powers `IFetcher.fetchUTxOs`) |
| `GET`  | `/tx/:hash` | full transaction info incl. resolved inputs |
| `GET`  | `/tx/:hash/utxos` | inputs + outputs of a tx |
| `GET`  | `/address/:addr/txs` | every tx that touched the address |
| `GET`  | `/block/latest` | latest sealed block |
| `GET`  | `/block/:id` | block by hash or height |
| `GET`  | `/block/:id/txs` | tx hashes in a block |
| `POST` | `/tx/submit` | validates + queues; returns `{ txHash }` |
| `GET`  | `/mempool` | `{ size, txs[] }` |
| `GET`  | `/wallets` | five genesis wallets (priv/pub keys + cli-key envelope) |
| `POST` | `/topup/:address/:lovelace` | faucet (bypasses validation) |

---

## Configuration

The devnet reads two env vars at startup:

| Var | Default | Effect |
|---|---|---|
| `CARDANO_DEVNET_MAGIC` | `42` | Network magic (matches `yaci-devkit`) |
| `CARDANO_DEVNET_NETWORK_ID` | `0` | `0` → `addr_test1…` (testnet). `1` → `addr1…` (mainnet-style) |

Example:

```bash
CARDANO_DEVNET_MAGIC=1097911063 CARDANO_DEVNET_NETWORK_ID=0 npm run dev
```

(`1097911063` is the magic of `cardano-cli`'s default testnet — useful
if you want existing tooling to think we're a real testnet.)

Conway protocol parameters live in `src/config.ts` and mirror the
preview / preprod testnets, so transactions built against this devnet
will pass the same protocol checks on those public testnets.

---

## Project layout

```
packages/mesh-devnet/
├─ src/
│  ├─ index.ts             # CLI entry point + banner
│  ├─ config.ts            # Conway params + network identity
│  ├─ crypto.ts            # blake2b + Ed25519
│  ├─ types.ts             # internal Tx/UTxO/Block/Witness types
│  ├─ genesis.ts           # 5 pre-funded test wallets
│  ├─ mempool.ts           # in-memory mempool
│  ├─ producer.ts          # slot-tick block producer
│  ├─ provider.ts          # MeshSDK IFetcher + ISubmitter adapter
│  ├─ tx-builder.ts        # meshFromGenesisSeed() helper
│  ├─ ledger/
│  │  ├─ state.ts          # UTxO Map + chain history
│  │  ├─ validator.ts      # UTXO/UTXOW/LEDGER/UTXOS rule set
│  │  ├─ script-context.ts # PlutusData ScriptContext builder (V2 + V3)
│  │  ├─ plutus-eval.ts    # CEK machine wrapper (Machine.eval)
│  │  └─ native-script.ts  # Native script evaluation (timelock / multisig)
│  └─ api/
│     └─ server.ts         # Express HTTP routes
├─ tests/
│  ├─ validator.test.ts    # UTXO/UTXOW/LEDGER rule unit tests
│  ├─ script-context.test.ts # PlutusData encoding tests
│  └─ plutus-eval.test.ts  # CEK machine evaluation tests
├─ dist/                   # tsc output (gitignored)
├─ vitest.config.ts
├─ tsconfig.json
├─ package.json
└─ README.md
```

Source is **~2 400 LOC of TypeScript** (src) + **~500 LOC of tests**.

---

## Build, dev, test scripts

The runtime is **`ts-node`** (ESM mode); the build tool is **`tsc`**; the test
runner is **`vitest`**.

| Script | What it does |
|---|---|
| `npm run build:mesh` | `tsc` → emits `dist/*.js` + `.d.ts` + source maps |
| `npm run dev` | `node --loader ts-node/esm src/index.ts start` — runs straight from TypeScript, no precompile |
| `npm start` | `node dist/index.js start` — runs the compiled output (use this in production) |
| `npx mesh-devnet` | same CLI after install: `start`, `wallets`, `tip`, `selftest`, … |
| `npm test` | `vitest run` — runs all unit tests once (validator, ScriptContext, CEK eval) |
| `npm run test:watch` | `vitest` — watch mode, re-runs on save |
| `npm run e2e` | end-to-end smoke test via `MeshTxBuilder` against a running devnet |
| `npm run selftest` | runs the `selftest` command via ts-node against a running devnet |
| `npm run wallets` | lists the genesis wallets from a running devnet |
| `npm run tip` | dumps the chain tip |
| `npm run clean` | `rm -rf dist` |

`ts-node` is configured for ESM in `tsconfig.json`:

```jsonc
{
  "ts-node": {
    "esm": true,
    "experimentalSpecifierResolution": "node",
    "transpileOnly": true
  }
}
```

`transpileOnly: true` means dev startup is ~1 s vs ~6 s with full
type-checking on every reload. Run `npm run build:mesh` before publishing
to make sure the project still type-checks cleanly.

---

## Roadmap

Be honest about what's actually working.

### ✅ Done & verified end-to-end

- [x] Genesis: 5 deterministic pre-funded wallets, addresses byte-for-byte match `cardano-ledger-ts`
- [x] Conway-era protocol parameters (preview/preprod values) exposed via `/params`
- [x] Network identity (magic 42 default, network ID 0) configurable via env vars
- [x] In-memory UTxO ledger state with O(1) lookups
- [x] Slot ticker + block producer (1 s slots, 100-slot epochs by default)
- [x] Block hash = `blake2b-256(prevHash ‖ slot ‖ height ‖ bodyHash)` where `bodyHash = blake2b-256(concat(txBodyHashes))`
- [x] Mempool (Map keyed by txHash, drained per slot)
- [x] HTTP API for tip, params, UTxOs, blocks, txs, mempool, wallets, faucet
- [x] CBOR transaction parsing via `@harmoniclabs/cardano-ledger-ts` (with a defensive auxiliary-data normaliser)
- [x] **UTXO rule set** (Conway era):
  - [x] U1 inputs ≠ ∅
  - [x] U2 inputs ⊆ dom(utxo)
  - [x] U3 no duplicate inputs
  - [x] U4 TTL not exceeded
  - [x] U5 validity-start reached
  - [x] U6 size ≤ maxTxSize
  - [x] U7 outputs + fee non-negative
  - [x] U8 outputs ≥ minADA *(approximate — see limitations)*
  - [x] U9 fee ≥ minFee
  - [x] U10 value preservation (incl. multi-asset eq when no mint)
- [x] **UTXOW rule set**:
  - [x] W1 every vkey witness signature verifies (Ed25519 over `blake2b256(CBOR(body))`)
  - [x] W2 every key-locked input has a matching witness
  - [x] W3 every `required_signers` hash has a matching witness
- [x] **LEDGER (network) rules**:
  - [x] N1 `network_id` field matches protocol network
  - [x] N2 every output address lives on this network
- [x] `DevnetProvider` implements MeshSDK `IFetcher` + `ISubmitter` + `IListener`
- [x] Genesis wallets exposed in CIP-5 `payment.skey` envelope (`5820<seed>`) → drop straight into `MeshWallet({ key: { type: 'cli', payment } })`
- [x] `meshFromGenesisSeed()` helper → `{ wallet, builder }` in one call
- [x] `mesh-devnet selftest` command builds + signs + submits + confirms a real CBOR tx through `MeshTxBuilder`
- [x] **UTXOS rule set** (Plutus + native script execution — Conway/Babbage):
  - [x] S1 collateral inputs present and cover `collateralPercent`% of fee
  - [x] S2 collateral inputs are all key-locked (not script-locked)
  - [x] S3 spending scripts: script resolved from witness set or reference input, datum resolved from inline / witness datums, **CEK machine evaluation** via `@harmoniclabs/plutus-machine`
  - [x] S4 minting scripts: policy id resolved, redeemer matched by sorted policy index, CEK evaluation
  - [x] S5 native scripts: full `sig / all / any / atLeast / after / before` timelock support
  - [x] S6 cumulative ExUnits ≤ `maxTxExMem` / `maxTxExSteps`
- [x] **PlutusData ScriptContext builder** (`src/ledger/script-context.ts`):
  - [x] V2 `ScriptContext = Constr 0 [TxInfo(12 fields), ScriptPurpose]` — full `makeIsDataIndexed` encoding
  - [x] V3 `ScriptContext = Constr 0 [TxInfo(16 fields), Redeemer, ScriptInfo]` — bare `Lovelace` fee, `MintValue`, governance placeholders
  - [x] Address encoding for all Shelley address types (enterprise/base/pointer, key/script payment, key/script staking)
  - [x] `POSIXTimeRange` with NegInf/Finite/PosInf bounds
  - [x] Datum resolution (inline → decode CBOR; hash → witness-set lookup)
  - [x] Reference-input scripts surfaced from UTxO set via `scriptRefHash` / `scriptRefVersion` on `TxOutput`
- [x] **Vitest test suite** (`npm test`, 40 tests, all green):
  - [x] `tests/validator.test.ts` — U1–U10, W1–W3, N2, minFee scaling
  - [x] `tests/script-context.test.ts` — address encoding, POSIXTimeRange, datum hash round-trip, V2/V3 field counts, fee-type difference
  - [x] `tests/plutus-eval.test.ts` — result shape, budget zeroing, always-succeeds script evaluation

### 🟡 Partial / approximate

- [ ] **`minAda` calculation is approximate.** We estimate the serialised output size instead of CBOR-encoding it. A tx that just-barely passes our check might be rejected on real Cardano (or vice versa) by a few hundred lovelace.
- [ ] **Mempool admission has no per-account quota / size limit.** Send infinite txs and we'll happily queue them.
- [ ] **Fees are burned, not pooled.** Real Cardano credits fees to the reward pot; we just track `feesCollected` per block and forget them.
- [ ] **Block hash format is custom**, not `blake2b-256(CBOR(realHeader))`. Tools that try to *re-derive* the hash from a header CBOR will get a different value.
- [ ] **`fetchTxInfo` returns `size: 0`** because we discard the raw CBOR after validation. (Trivial to fix — store it.)
- [ ] **No pagination** on `/address/:addr/txs` or `/mempool`.

### ❌ Not implemented

- [ ] **`IEvaluator.evaluateTx`** for the `DevnetProvider` — `estimatePlutusExUnits` in `plutus-eval.ts` is ready; needs a provider adapter that maps MeshSDK's `Evaluator` interface to our CEK machine.
- [ ] **Stake delegation** — registering stake keys, delegating to pools. Without this, base addresses (`addr_test1q…`) can't be funded the same way enterprise addresses are.
- [ ] **Reward calculation** — even a no-op (zero rewards) would make `wallet.getRewardAddresses()` non-empty.
- [ ] **Stake-pool registration / retirement**
- [ ] **Withdrawals** (`tx_body.withdrawals`)
- [ ] **Certificates** (`stake_registration`, `pool_registration`, etc.) — the field is parsed and discarded.
- [ ] **Conway governance** — DReps, votes, proposals, treasury withdrawals. `IFetcher.fetchGovernanceProposal` currently throws.
- [ ] **Reference inputs existence check** — the field is parsed; UTxO existence is not enforced during basic (non-script) tx validation.
- [ ] **Auxiliary-data hash check** — body's `aux_data_hash` is not verified against the actual aux-data bytes. Real Conway `validateMetadata` requires this.
- [ ] **Persistent storage** — restart wipes the chain. (`yaci-devkit` uses H2; `cardano-node` uses LMDB.) In-memory is fine for testing, painful for long-running scenarios.
- [ ] **Real Ouroboros consensus** — we're a single producer with no slot leader VRF, no chain-selection, no roll-back. Acceptable for a devnet.
- [ ] **CIP-30 wallet bridge** — no WebSocket / message-port bridge so `BrowserWallet.enable('Lace')` can talk to us directly. (Workaround: dApp talks to `DevnetProvider` directly via fetch.)
- [ ] **Chainsync / blockfetch over the Ouroboros mini-protocol** — would let `pallas`-based tooling, `cardano-db-sync` and Ogmios index the devnet like any real peer.
- [ ] **V3 `ScriptInfo.SpendingScript` datum field** — currently always encoded as `Nothing`; for full V3 correctness the resolved datum should be embedded in `ScriptInfo` rather than passed separately.

---

## Honest limitations & known issues

> The codebase is small (~1 600 LOC). Small ≠ done. Here's what that
> means in practice.

1. **"Conway-era ledger" is a partial truth.** We implement the
   `UTXO`, `UTXOW`, a sliver of `LEDGER`, and the Plutus/native-script
   `UTXOS` rule (spending + minting scripts, collateral, ExUnit budget).
   We do not implement `DELPL` (delegation), `POOL`,
   `RATIFY`/`ENACT`/`TALLY` (governance), `EPOCH`, or `RUPD` (reward
   updates). For ADA-only, native-asset and smart-contract UTxO
   transfers, that's enough; for governance or staking, it isn't.

2. **The CBOR parser has a known bug we work around.**
   `@harmoniclabs/cardano-ledger-ts`'s Conway `AuxiliaryData` decoder
   throws on the canonical `Tag(259, {})` shape that `MeshTxBuilder`
   emits. We pre-process the tx CBOR in `validator.ts:normaliseTxCbor`
   and replace position 3 with `null` when it can't be parsed. The
   body bytes (and therefore the body hash, tx ID, and witness
   signatures) are never modified, so this is correctness-preserving
   for the validation rules we *do* check — but it means we silently
   drop aux data we can't parse and never verify it against
   `body.auxiliary_data_hash`.

3. **`minAda` is heuristic.** The `coinsPerUtxoSize` formula in
   Conway is `coinsPerUTxOByte × (utxoEntrySize + len(CBOR(output)))`.
   We approximate the second term with a closed-form size estimate
   instead of doing a real CBOR encode. The error is usually a few
   bytes; in pathological cases (very wide multi-assets) it could be
   tens of bytes, i.e. ~hundreds of lovelace. If that matters for your
   tests, run them against a real testnet too.

4. **The faucet bypasses the validator.** `POST /topup/:addr/:lovelace`
   injects a UTxO directly into the ledger state. It does compute the
   correct address bytes (so the resulting UTxO is spendable), but it
   doesn't enforce min-ADA, max-Val-size, or any other rule. Don't
   read anything into a tx that succeeds because of a faucet UTxO.

5. **State is in-memory.** `Ctrl-C` wipes the chain. If you need a
   persistent devnet across restarts, this isn't it yet.

6. **Block hash format is custom.** It's blake2b-256, but it's
   blake2b-256 of `prevHash ‖ slot(8B BE) ‖ height(8B BE) ‖ bodyHash`,
   not `blake2b-256(CBOR(realHeader))`. Anything that tries to
   reconstruct the hash from a header CBOR will get a different
   value. (We don't even emit a header CBOR.)

7. **`@meshsdk/core` pulls in `cardano-serialization-lib` (WASM).**
   The "lightweight" pitch is true for the devnet itself (~50 MB of
   deps for the server-side code path), less true for the
   `DevnetProvider` import on the client side, which transitively
   loads the `core-cst` WASM blob. If you only want the server, import
   from `@meshsdk/devnet/types` and `@meshsdk/devnet/config` and skip
   the provider.

8. **Single producer, no rollback.** There is no possibility of a
   chain reorg or rollback. Code that depends on rollback semantics
   (e.g. `cardano-db-sync`-style indexers) won't be exercised.

9. **Test coverage is unit-level only.** `npm test` runs 40 unit
   tests covering ledger rules, PlutusData encoding, and CEK machine
   invocation. Integration tests with real Plutus contracts compiled
   by Aiken or PlutusTx are not yet included — you should cross-check
   your contract against a real testnet for full confidence.

If any of those numbers makes the difference between "this is useful
to me" and "this isn't", file an issue — most of them are small,
self-contained changes.

---

## References

| Repo | What we use it for |
|---|---|
| [`IntersectMBO/cardano-ledger`](https://github.com/IntersectMBO/cardano-ledger) | Source-of-truth rule names + Conway CDDL |
| [`IntersectMBO/cardano-node`](https://github.com/IntersectMBO/cardano-node) | Reference for protocol-parameter shape and slot/epoch semantics |
| [`txpipe/pallas`](https://github.com/txpipe/pallas) | Cross-reference for CBOR encoding edge cases |
| [`HarmonicLabs/cardano-ledger-ts`](https://github.com/HarmonicLabs/cardano-ledger-ts) | TypeScript ledger types — used for parsing & address construction |
| [`HarmonicLabs/plutus-machine`](https://github.com/HarmonicLabs/plutus-machine) | CEK machine for Plutus V1/V2/V3 evaluation — wired in via `src/ledger/plutus-eval.ts` |
| [`MeshJS`](https://github.com/MeshJS/mesh) | Wallet + transaction builder we plug into |
| [`bloxbean/yaci-devkit`](https://github.com/bloxbean/yaci-devkit) | Design inspiration — same job, JVM-based |
| [`input-output-hk/cardano-js-sdk`](https://github.com/input-output-hk/cardano-js-sdk) | TS SDK reference; we don't depend on it |

---

## License

ISC. Test keys are public, deterministic, and **must not** be reused
on any real network.
