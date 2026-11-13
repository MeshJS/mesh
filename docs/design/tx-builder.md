# Design: `TxBuilder`

**Status:** implemented in `packages/mesh-transaction/src/tx-builder/`: `assembleTxPrototype`,
`TxBuilder`, `TxPlan` with its stores (`TxPlanStore`, `memoryPlanStore`, `checkPlanStore`),
and the free signing functions. `MeshTxBuilder` is `@deprecated` and builds on `TxBuilder`. This
document is the design record for that work; the [package README][readme] holds the recipes.

## Problem

`MeshTxBuilder` kept a transaction as mutable builder state (`MeshTxBuilderBody`), filled it in
through modal call chains, and went from that state to CBOR inside the serializer. Four things
followed:

- What a call means depends on the calls before it, so a misplaced call type-checks and fails at
  `complete()`, far from where it was made.
- Redeemer indices were positions in arrays the builder sorted by hand, once per purpose, and the
  result was only checked when the transaction reached a ledger.
- The completed transaction is a hex string: the fee, the selected inputs, the execution units
  and the collateral can only be read back by decoding it.
- A transaction once sent has no state beyond its hash. After a lost answer, whether to resend,
  rebuild or wait is left to the application, and a rebuild can pay twice.

The part builders (`spend`, `output`, `mint`, `withdrawal`, `certificate`, `vote`, `proposal`, ...)
already described each piece of a transaction as one immutable value built by one call, and
`TransactionPrototype` described a whole transaction as a value. What was missing was the step
between them, and an object that carries one payment until it is final.

## Proposal

```
part builders  ──►  parts  ──►  TxBuilder.build  ──►  assembleTxPrototype  ──►  serializer
  (one call         (values,      (read the payer,      (combine, order,          (CBOR)
   per piece)        may have      look up, balance,     index, hash)
                     gaps)         evaluate)

TxBuilder.plan ──► TxPlan ──► attempts on one anchor: build, sign, submit, observe ──► final
```

Three layers, usable separately:

- **`assembleTxPrototype(parts, { fee, costModels? })`** — pure and synchronous. Takes parts with
  nothing left open and returns `{ prototype, redeemers, languages }`. It is the only place that
  orders the transaction and numbers its redeemers.
- **`builder.build(parts?, options?)`** — takes parts as the part builders return them (one part,
  or nested lists, where `false`, `null` and `undefined` are skipped), reads the payer, fills in
  what the parts leave open, balances, evaluates, and returns a `BuiltTx`: the unsigned
  transaction with everything the build decided, as plain data, with no deadline and no anchor.
- **`builder.plan(parts?, options?)`** — a `TxPlan`: one payment, carried to a final state
  through attempts that all spend one common input, so at most one lands. Signing, submission and
  waiting are its steps.

```ts
import { TxBuilder } from "@meshsdk/transaction";

const builder = new TxBuilder({ network: "preprod", provider });
const built = await builder.build(parts, { payer: wallet });
built.tx; // unsigned CBOR
built.prototype; // the TransactionPrototype it was serialized from
built.fee; // and exUnits, redeemers, inputs, outputs, change, collateral, signers, parts, ...

const plan = builder.plan(parts, { payer: wallet });
await plan.send({ waitFor: "included" }); // builds, signs with the payer, submits, waits
plan.txHash; // the attempt that landed
```

A builder holds its network, its provider and that provider's shared cache, its settings, and the
parts added with `add(...parts)`, which returns a new builder. It holds no wallet, no payer and no
state of a transaction, so one builder can build many transactions, concurrently included; the
state of a payment lives in its `TxPlan`, and with a `store` in the store's record.

### Non-goals

- **No wallet in the builder.** Who pays is the `payer` of each build or plan; who signs is the
  call's `signers`, else the plan's payer; who submits is the call's `submitter`, else the
  builder's, else the provider. `build` returns an unsigned transaction: signing, submission and
  waiting are steps of a `TxPlan`, or of the free signing functions.
- **No built-in protocol parameters.** `params` is used whole, else the provider is read; with
  neither, the constructor throws `MISSING_PARAMETER`.
- **No second builder beside `MeshTxBuilder`.** `MeshTxBuilder` is `@deprecated` and keeps its
  fluent methods, its `complete…` methods and its queries; its own build steps (selection,
  ordering, evaluation) are gone. `complete()` builds with `TxBuilder.build(parts, options)` and
  writes the result back into the body, so the CBOR may differ from what it produced before.
  `MeshTxBuilderV2` and `Transaction` work through it. See [The old MeshTxBuilder][r-old].

## Assembly: `assembleTxPrototype`

Every part must be complete — `unresolved(part)` empty. Otherwise it throws `UNRESOLVED` with the
gaps of every incomplete part in `details`.

### Redeemer indices

A redeemer points at the item it witnesses by its position in the order the ledger keeps that
kind of item in. The ledger orders by its own types, not by the bytes of their encoding, and the
two differ for credentials:

| Purpose           | Items           | Order                                                                                                         |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `SPEND`           | inputs          | transaction id, then output index (numerically)                                                               |
| `MINT`            | policies        | policy id bytes                                                                                               |
| `REWARD`          | reward accounts | network, then credential: **script hashes before key hashes**, then hash                                      |
| `CERT`            | certificates    | as given                                                                                                      |
| `VOTE`            | voters          | committee hot credentials, then DReps (each **scripts before keys**, then hash), then stake pools by key hash |
| `VOTING_PROPOSAL` | proposals       | as given                                                                                                      |

The key-hash header byte of a reward address is smaller than the script-hash one, so encoding
order would put keys first; the ledger's order puts scripts first. The emulator tests check both
reward accounts and voters with mixed credentials in one transaction.

Each redeemer is returned as `AssembledRedeemer { tag, index, exUnits, part, label? }`: the part
it belongs to travels with its pointer, so evaluation results, which come back by pointer, map
back to parts without re-deriving any order. Redeemer data given as a function of the final
positions (`RedeemerContext`) is called here, once per assembly, after every sort; what it throws
is `INVALID_REDEEMER`.

### What else assembly decides

- **Conflicts are errors** (`DUPLICATE_PART`, `details.item`): an input spent twice, a reference
  input the transaction also spends, two mint parts for one policy, two withdrawals from one
  account, two vote parts for one voter, a collateral input given twice, a second validity
  interval, network id, donation, treasury value or collateral return, a metadata label given
  twice (a `message` is label 674). `build` runs the same checks before any request.
- **Reference inputs** are the reference input parts plus the outputs witnesses read their
  scripts from, deduplicated, minus inputs the transaction spends (a spent output's reference
  script is visible to the transaction anyway).
- **Witness scripts** are deduplicated by hash, and an attached script is left out when an output
  the transaction spends or reads holds it as its reference script, as the ledger requires; its
  language still counts in the script data hash. **Datums** (spent hash-datum outputs, embedded
  output datums) are deduplicated by CBOR.
- **Key guards**: a `guard.pubKey` whose hash is the hash of a script a witness names is
  `INVALID_GUARD`.
- **Collateral return** holds the collateral inputs' value minus `totalCollateral`, tokens
  included; left out when nothing is left. Without a collateral return part neither field is
  set; inputs holding less than the total are `INVALID_COLLATERAL`.
- **Hashes**: the auxiliary data hash and the script data hash (redeemers, datums and the
  language views of every Plutus version that runs, attached or referenced) are taken from the
  bytes of the encoded transaction, read back with their original encoding. A version that runs
  without a model in `costModels` is `MISSING_PARAMETER`.

## Building: `TxBuilder.build`

### Options

| `TxBuilderOptions` |                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `network`          | required: `"mainnet"`, `"preprod"`, `"preview"` or a `NetworkConfig` (a devnet: `customNetwork`)       |
| `provider?`        | every read; for plans also the chain's tip and the search for a transaction                            |
| `submitter?`       | submits in place of the provider                                                                       |
| `evaluator?`       | an `OfflineEvaluatorScalus` made for this builder by default; `null` turns evaluation off              |
| `serializer?`      | must implement `serializeTxPrototype`; the `@meshsdk/core-cst` encoder otherwise                       |
| `params?`          | a whole `Protocol`, used instead of reading the provider's                                             |
| `costModels?`      | by Plutus language number, V1 first, used instead of reading the provider's                            |
| `deposits?`        | `drepDeposit`, `govActionDeposit` — `Protocol` does not carry them                                     |
| `planDefaults?`    | `ttlMs`, `expiryMarginMs`, `confirmations` copied into each plan when it is made; `pollMs`, `resendMs` |
| `store?`           | a `TxPlanStore`, where the records of this builder's plans are kept                                    |

| `BuildOptions`       |                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `payer?`             | who pays and gets the change: a wallet, an address or a snapshot; `MISSING_PAYER` without one     |
| `canSelect?`         | which of the payer's UTxOs may be selected, for payment and for collateral                        |
| `coinSelection?`     | a `SelectInputs` function in place of the built-in selection; change stays with the built-in rule |
| `sendAllTo?`         | spend every selectable UTxO and send what is left to this address                                 |
| `after?`             | `BuiltTx` or `TxPlan` (its current attempt), or a list: transactions the provider has not seen    |
| `knownUtxos?`        | outputs the parts may name by out ref that the provider may not know yet                          |
| `fee?`               | goes into the body as given; `FEE_TOO_LOW { fee, minFee }` when the final minimum is higher       |
| `registeredPools?`   | operators whose pool registration is an update, taking no deposit                                 |
| `extraKeyWitnesses?` | signatures expected beyond those the parts call for                                               |
| `signal?`, `trace?`  | abort the build (`ABORTED`); receive its steps, for diagnostics                                   |

The constructor reads nothing and checks every option at once (`MISSING_PARAMETER` with neither
`provider` nor `params`). The README details the options under [Builder options][r-builder-options]
and [Build options][r-build-options].

### The payer

A payer is a wallet (a CIP-30 api, or a Mesh wallet), an address, or a snapshot
`{ changeAddress, utxos }`. A build reads it once, concurrently with its lookups; an address's
UTxOs come through the provider, past the cache, and a snapshot needs no request.
`readPayer(payer)` turns any form into a snapshot, for many builds on one read. See
[Payer, signer, submitter][r-payer].

### Resolution

Before any request the build checks the network of every address it is given, converts time
bounds to slots, refuses a part naming an output a transaction of `after` spends
(`UTXO_NOT_FOUND`) and runs the conflict checks of assembly. Then one pass, with every read
started at once:

- Outputs the parts reference by out ref alone — spent, referenced, collateral, reference
  scripts — are taken from `knownUtxos`, the outputs of `after` and a snapshot payer's UTxOs; the
  rest are fetched with one `fetchUTxOs(txHash)` per transaction hash. Protocol parameters and
  cost models (these only when a Plutus script runs) unless the options give them, and reward
  balances of withdrawals with `amount: "all"`, are read alongside.
- Every read goes through the `CachedFetcher` shared by every builder, wallet and evaluator over
  the same provider object: a transaction's outputs are fetched once per hash, parameters kept
  until the epoch ends, chain state for a few seconds, and concurrent equal requests share one.
  The payer's UTxOs are read past it.
- What was looked up is checked against the parts as the part builders would have checked it:
  the lock of a spent output against its witness, a reference script's hash, size and version,
  the network of every address. The datum of a spent script output is worked out from the output.
- Deposits left to a protocol parameter are filled in: `keyDeposit` from `Protocol`,
  `drepDeposit` and `govActionDeposit` from `deposits` (`MISSING_PARAMETER` otherwise).
- Outputs without lovelace get the minimum, `(160 + size) * coinsPerUtxoSize`; an output given
  less is rejected (`OUTPUT_BELOW_MIN_COIN`), as is a value above `maxValSize`.

### Balancing

```
consumed = inputs + withdrawals + refunds + minted
produced = outputs + fee + deposits + donation + burnt
```

Deposits: stake registration (`keyDeposit` for the legacy certificate), pool registration
(`poolDeposit`, unless the operator is in `registeredPools`), DRep registration, the three
registration-and-delegation certificates, proposals. Refunds: stake deregistration (`keyDeposit`
for the legacy certificate), DRep deregistration.

Inputs are selected from the payer's key-locked UTxOs that no part spends, reads or names as
collateral, that `canSelect` lets through, and that no transaction of `after` spends, plus the
change of those transactions at this build's change address. Each round, starting from a zero fee
(or the given `fee`):

1. Whatever `consumed − produced − fee` is short of is selected: by `coinSelection` when given,
   else each token from the UTxOs holding most of it, then lovelace from the largest UTxOs, plain
   ones (no tokens, no reference script) first. With `sendAllTo` every selectable UTxO is spent
   from the start. A transaction always spends at least one input.
2. The rest is change at the payer's change address (or `sendAllTo`): one output, or several when
   its tokens do not fit in `maxValSize`. If it cannot hold their minimum lovelace, more lovelace
   is selected.
3. When a Plutus script runs, or collateral parts are given, collateral covering
   `collateralPercent` of the fee is put up — the collateral parts, else the smallest ada-only
   UTxO without a reference script that leaves a return worth making, else the smallest that
   covers it, else the largest UTxOs up to `maxCollateralInputs`, else a CIP-30 payer's
   `getCollateral` — with the rest returned to the collateral return part's address or the
   change address. A return too small to be an output is dropped and the whole collateral forfeited
   (`COLLATERAL_FORFEITED`), unless the total was given.
4. The transaction is assembled with placeholder witnesses as large as the real ones (a key
   witness per key the parts require — payment keys of spent and collateral inputs, key guards,
   key withdrawals, certificates and voters, every key a native script names — and a bootstrap
   witness per Byron address) and priced:
   `minFeeA * size + minFeeB + referenceScriptFee + ceil(Σmem * priceMem + Σsteps * priceStep)`,
   with exact rational arithmetic and the ledger's 25 KiB, 1.2× reference script tiers.
5. If the fee covers that, the round's transaction is the result; otherwise the fee becomes the
   price and the next round starts.

Within the rounds the fee only rises and inputs are only added, so they settle; they are capped
(`FEE_NOT_CONVERGED`). A transaction that settled above its minimum, because a later round made it
smaller, is priced once more at that minimum with the same inputs, and kept so when it still
settles there. A given `fee` is never changed. The result's fee is within a few bytes' worth of
the minimum for the signed transaction.

### Evaluation

Redeemers without execution units are first priced at an even share of `maxTxExMem` /
`maxTxExSteps` (less any units given), so the first round over-provisions rather than
under-provisions; such a round judges funds by that upper estimate and can end in
`INSUFFICIENT_FUNDS`. Then, each round, up to five:

1. Balance with the current units, serialize, and evaluate. An evaluator that sets
   `acceptsKnownUtxos` (the default `OfflineEvaluatorScalus`, `TxEmulator`) is handed every UTxO
   the build knows for the transaction; any other only those of `knownUtxos` and `after`, and
   resolves the rest from its own chain.
2. Map each result back to its part through the assembled redeemers.
3. A redeemer still on its placeholder takes the evaluated units; one already evaluated keeps
   its units unless evaluation now needs more. When nothing changes, the evaluated transaction is
   the result (`EVALUATION_NOT_CONVERGED` otherwise).

Execution units given on a part are checked, not replaced: evaluation needing more is
`EXUNITS_TOO_LOW`. After `evaluator: null` nothing is evaluated: given units are taken as stated,
and a redeemer without units is `MISSING_EVALUATOR`. A failing script is `EVALUATION_FAILED`, its
failures mapped to parts and labels.

### Serialization and the result

With the default encoder the prototype's hashes already match its bytes. With another serializer
the script data and auxiliary data hashes are taken again from the bytes it produced, and the
transaction re-serialized if they differ; a serializer that throws or answers with something that
is not a transaction is `UNSUPPORTED_SERIALIZER`.

The `BuiltTx` holds the transaction, its hash and prototype, and what the build decided: fee,
execution units, redeemers, resolved inputs, outputs and change as labelled UTxOs, collateral, the
keys that must sign (`signers`), validity, network, warnings and the resolved parts; see
[The result][r-result].

### Time and chains

`validity({ from, until })` takes POSIX milliseconds (`number`, `bigint` or `Date`), converted on
the builder's slot clock so that the interval a script sees lies within `[from, until]`: `from`
to the first slot starting at or after it, `until` to the slot containing it. A lower bound after
the local clock's time is the warning `VALID_FROM_FUTURE`; a bound before the network's slot clock
starts, or an interval with no slot, is `INVALID_DATA`. `build` sets no `until`. See
[Time][r-time].

`after` builds on transactions the provider has not seen: their inputs are not selected, their
change at this build's change address is, and every output they make can be named by out ref
without a lookup. `utxosAfter(utxos, built)` folds them into a UTxO list for the next build. A
plan names its parent plans in `after` and is built after their current attempts; see
[Chains][r-chains].

## Plans: `TxPlan`

`builder.plan(parts, options)` is the only way to make a plan, and makes no request: the
plan is `draft` until its first attempt is built. Its options are the build options without
`signal`, with parent plans in `after`, an `id`, and the deadlines `ttlMs`, `expiryMarginMs` and
`confirmations`, written into the plan when it is made and never read from the builder again.

- **Attempts and the anchor.** Every attempt is a `BuiltTx` of the plan's parts, and all of them
  spend one common input, the anchor, so at most one can land. In `draft`, `send()` and
  `advance()` build the first attempt; after that only `build()`, or `advance()` with a signer
  where `send()` would throw `EXPIRED` or `ORPHANED` and no other attempt is live, makes a new
  one, and it first searches the earlier ones and returns one found in a block. Each step can be
  repeated by the same call without paying twice.
- **Statuses**: `draft`, `built`, `signed`, `sent`, `rejected`, `included`, `expired`, `failed`,
  `orphaned`, `final`, `abandoned`. Only `final` and `abandoned` are terminal, only `abandoned`
  means "not paid", and a rollback can take `included` back to `sent`.
- **Time is the chain's.** An attempt whose parts set no `until` gets
  `until = max(tip time, from) + ttlMs`; it is `expired` once the tip time passes `until` plus
  `expiryMarginMs`, and `final` once `confirmations` blocks lie on top of its block. The provider
  must give the tip and the search with block heights, and `validContract` for a Plutus attempt;
  otherwise `CANNOT_OBSERVE`, before anything is signed or sent. Local timers only set the pace
  of waiting (`pollMs`, `resendMs`).
- **Steps.** `sign()`, `send()` and `advance()` sign with the call's `signers`, else the payer,
  checking every witness against the body; `send()` builds in `draft` only, submits and waits for
  `waitFor`, and in `sent` sends the same bytes again. `abandon()` records the closing mark and
  closes the plan once no attempt can land.
- **The store.** `TxPlanStore` is `load(id)` and a compare-and-set `save(json, expectedRev)`.
  Every change is saved before the method returns; the record holds data only, never a wallet,
  signer, submitter or function, and `resume(id, options)` restores the plan with those given
  again. `memoryPlanStore()` serves tests; `checkPlanStore(store)` checks one's own store
  ([Storage][r-storage]).

The rules for a lost answer, a refusal, reconciliation, chains and a new plan in place of an old
one are in the README: [Plans][r-plans], [Servers][r-servers],
[Deadlines and waiting][r-deadlines] and [New plan instead of an old one][r-new-plan].

## Signing without a plan

```ts
import type { UTxO } from "@meshsdk/common";
import type { RequiredKeys, Signer, TxSigners } from "@meshsdk/transaction";

declare function signWitnesses(
  signer: Signer,
  tx: string,
  keyHashes?: RequiredKeys,
): Promise<string>;
declare function addWitnesses(
  tx: string,
  ...witnesses: string[]
): Promise<string>;
declare function signedKeyHashes(tx: string): Promise<string[]>;
declare function requiredSigners(tx: string, spent: readonly UTxO[]): TxSigners;
```

`build()`, these functions, the provider's `submitTx` and `awaitTransactionConfirmation()` of
`@meshsdk/common` make the path without a lifecycle: no deadline and no anchor, so a retry sends
the same bytes and never rebuilds ([The path without a lifecycle][r-no-lifecycle]). `addWitnesses`
and `signedKeyHashes` return promises, unlike the synchronous forms first proposed: checking a
signature waits for the Ed25519 library to start, so every refusal of theirs is a rejected
promise. `finalize` completes an edited or hand-assembled prototype: it hashes it again, prices it
for its signers and takes a fee increase from the change output at `changeAddress`. It looks up
no UTxO (every input, reference input and collateral input is given in `inputs`, else
`UTXO_NOT_FOUND`), runs no script and changes no collateral; parameters and cost models still
come from `params` and `costModels` or the provider.

## Errors

Every error is a `TxError`, with `code`, `message`, `retryable` and, where they apply, `part`,
`label`, `details` (typed by `code`), `cause` and `retryAfterMs`. `retryable: true` means only that
the same call, repeated no earlier than `retryAfterMs`, is safe and may pass. `TxError.is(error)`
and `TxError.is(error, ...codes)` cover the whole tree, across copies of the package, and narrow
`details`; `TxBuildError.is(error, code)` and `TxPlanError.is(error, ...codes)` check one class.

- `TxPartError` stays the error of a part builder call, and is also raised while resolving when
  what was looked up does not fit a part.
- `TxBuildError`, never retryable, comes from the options, the payer, assembly, resolution,
  balancing, evaluation and serialization; `EVALUATION_FAILED` maps each failure to its part and
  label.
- `TxPlanError` comes from signing, sending, observing, the lifecycle and the store, and also
  carries `planId`, `status`, `txHash` and, not enumerable, `plan`. Retryable:
  `SUBMIT_FAILED`, `CONFIRM_TIMEOUT`, `NOT_YET_VALID`, `STILL_LIVE` and `CANNOT_OBSERVE` with
  `unconfirmed`.

The README's [Errors][r-errors] table gives every code with its condition, `details` and retry
rule.

## Testing

- `assemble.test.ts`: redeemer indices for every purpose, including the orders that differ from
  encoding order; reference inputs, collateral return, hashes, round-trip through the decoder;
  every conflict. `parts/*.test.ts`: the part builders.
- `builder.test.ts` and the unit tests beside it (`payer`, `selection`, `chain`, `network`,
  `result`, `sign`, `add`, `errors`, ...): balancing, deposits and refunds of every kind,
  resolution and fetch counts, the evaluation loop and its errors, collateral choices, payer
  forms, `after`, the signing functions.
- On `@meshsdk/scalus-emulator`, whose ledger rules check balance, fee, deposits, witnesses,
  redeemer indices and hashes: `assemble-emulator`, `builder-emulator` (script spends through a
  reference script, Plutus mints and burns, script and key withdrawals, certificates, DRep
  registration, a proposal, DRep votes, a treasury donation), `collateral-emulator`,
  `evaluator-emulator`, `network-emulator`, `payer-emulator`, `selection-emulator`,
  `traps-emulator`.
- On `TxEmulator` of `@meshsdk/tx-emulator`: `add-emulator`, `chain-emulator`, `finalize-emulator`,
  `redeemer-emulator`, `script-witness-emulator`, `sign-emulator`, `validity-emulator`; the plan
  tests under `plan/` that need a chain, beside the state machine's own tests (`state-table`,
  `state-rules`, `state-random`) and those of the record and stores (`json`, `store`); the old
  `MeshTxBuilder`'s adapter tests (`test/mesh-tx-builder/legacy-adapter-*`); and the README
  doc-test, `test/readme.test.ts`, which runs the task lines of the README's first example as they
  stand there and checks that its table of errors names every code. See
  [Testing on the emulator][r-testing].

## Open items

- `Protocol` has no `drepDeposit` or `govActionDeposit`; until it does they come from
  `deposits`.
- Whether a pool registration is an update is not looked up; `registeredPools` says so.
- Change that cannot reach its minimum lovelace with the UTxOs available is an error; there is
  no option to leave the remainder to the fee.
- Automatic collateral may take a UTxO the transaction also spends, a plan's anchor included.
- An orphaned child of two parents can come back to life by the other parent's attempt, since the
  record does not keep which parent orphaned it; no money can move by it.

[readme]: ../../packages/mesh-transaction/README.md
[r-old]: ../../packages/mesh-transaction/README.md#the-old-meshtxbuilder
[r-builder-options]: ../../packages/mesh-transaction/README.md#builder-options
[r-build-options]: ../../packages/mesh-transaction/README.md#build-options
[r-payer]: ../../packages/mesh-transaction/README.md#payer-signer-submitter
[r-result]: ../../packages/mesh-transaction/README.md#the-result
[r-time]: ../../packages/mesh-transaction/README.md#time
[r-chains]: ../../packages/mesh-transaction/README.md#chains
[r-plans]: ../../packages/mesh-transaction/README.md#plans
[r-servers]: ../../packages/mesh-transaction/README.md#servers
[r-storage]: ../../packages/mesh-transaction/README.md#storage
[r-testing]: ../../packages/mesh-transaction/README.md#testing-on-the-emulator
[r-deadlines]: ../../packages/mesh-transaction/README.md#deadlines-and-waiting
[r-new-plan]: ../../packages/mesh-transaction/README.md#new-plan-instead-of-an-old-one
[r-no-lifecycle]: ../../packages/mesh-transaction/README.md#the-path-without-a-lifecycle
[r-errors]: ../../packages/mesh-transaction/README.md#errors
