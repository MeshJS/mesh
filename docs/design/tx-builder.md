# Design: `TxBuilder`

**Status:** implemented in `packages/mesh-transaction/src/tx-builder/`: `assembleTxPrototype`,
`TxBuilder`, `TxPlan` with its stores (`TxPlanStore`, `memoryPlanStore`, `checkPlanStore`),
`BuiltTx`, `keySigner` and the free signing functions. `MeshTxBuilder` is `@deprecated` and
builds on `TxBuilder`. This document is the design record for that work; the
[package README][readme] holds the recipes.

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

TxBuilder.plan ──► TxPlan ──► steps built at once; sign, submit, observe, in order ──► final
```

Three layers, usable separately:

- **`assembleTxPrototype(parts, { fee, costModels? })`** — pure and synchronous. Takes parts with
  nothing left open and returns `{ prototype, redeemers, languages }`. It is the only place that
  orders the transaction and numbers its redeemers.
- **`builder.build(parts?, options?)`** — takes parts as the part builders return them (one part,
  or nested lists, where `false`, `null` and `undefined` are skipped), reads the payer, fills in
  what the parts leave open, balances, evaluates, and returns a `BuiltTx`: the unsigned
  transaction with everything the build decided as its data, and the calls that sign that one
  body, submit it and look for it; no deadline and no statuses.
- **`builder.plan(steps, options?)`** — a `TxPlan`: a group of transactions, its steps, built at
  once and never rebuilt, then signed, submitted and waited for in order.

```ts
import { TxBuilder } from "@meshsdk/transaction";

const builder = new TxBuilder({ network: "preprod", provider });
const built = await builder.build(parts, { payer: wallet });
built.tx; // unsigned CBOR
built.prototype; // the TransactionPrototype it was serialized from
built.fee; // and exUnits, redeemers, inputs, outputs, change, collateral, signers, parts, ...

const plan = await builder.plan(parts, { payer: wallet }); // builds; nothing signed or sent
await plan.run(); // signs with the payer, submits, waits for a block
plan.step("main").txHash; // the step's transaction
```

A builder holds its network, its provider and that provider's shared cache, its settings, and the
parts added with `add(...parts)`, which returns a new builder. It holds no wallet, no payer and no
state of a transaction, so one builder can build many transactions, concurrently included; the
state of a payment lives in its `TxPlan`, and with a `store` in the store's record.

### Non-goals

- **No wallet in the builder.** Who pays is the `payer` of each build or plan; who signs is the
  call's `signers`, else the payer when it can sign; who submits is the call's `submitter`, else the
  builder's, else the provider. `build` returns an unsigned transaction: signing, submission and
  waiting are steps of a `TxPlan`, or of the `BuiltTx` a build returns.
- **No built-in protocol parameters.** `params` is used whole, else the provider is read; with
  neither, the constructor throws `MISSING_PARAMETER`.
- **No second builder beside `MeshTxBuilder`.** `MeshTxBuilder` is `@deprecated` and keeps its
  fluent methods, its `complete…` methods and its queries; its own build steps (selection,
  ordering, evaluation) are gone. `complete()` builds with `TxBuilder.build(parts, options)` and
  writes the result back into the body, so the CBOR may differ from what it produced before.
  `MeshTxBuilderV2` and `Transaction` work through it. `MeshTxBuilderBody` and the serializers'
  `serializeTxBody` and `serializeTxBodyWithMockSignatures` are `@deprecated` as well: no builder
  serializes a body any more, while `TxParser` and `TxTester` still work on one. See
  [The old MeshTxBuilder][r-old].

## Assembly: `assembleTxPrototype`

Every part must be complete — `unresolved(part)` empty. Otherwise it throws `UNRESOLVED` with the
gaps of every incomplete part in `details`. A part linked to an earlier step of a plan has the gap
`link`, which only `builder.plan` fills in.

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

- **Conflicts are errors** (`DUPLICATE_PART`, `details.item`): an input spent twice, two mint
  parts for one policy, two withdrawals from one account, two vote parts for one voter, a
  collateral input given twice, a second validity interval, network id, donation, treasury value
  or collateral return, a metadata label given twice (a `message` is label 674). `build` runs the
  same checks before any request. Two spend parts of one input stay an error even when they agree:
  they may carry different scripts and redeemers, and the builder does not choose.
- **Reference inputs** are the reference input parts plus the outputs witnesses read their
  scripts from, each output once, minus inputs the transaction spends: a reference input part of
  a spent output is no error, and adds nothing (a spent output's datum and reference script are
  visible to the transaction anyway; a script that looks for the output among the reference
  inputs fails at the build's evaluation).
- **Witness scripts** are deduplicated by hash, and an attached script is left out when an output
  the transaction spends or reads holds it as its reference script, as the ledger requires; its
  language still counts in the script data hash. **Datums** (spent hash-datum outputs, embedded
  output datums) are deduplicated by CBOR.
- **Key guards**: a `guard.pubKey` whose hash is the hash of a script a witness names is
  `INVALID_GUARD`.
- **Collateral return** holds the collateral inputs' value minus `totalCollateral`, tokens
  included; left out when nothing is left. Without a collateral return part neither field is
  set (a build does so with `collateralReturn: false`); inputs holding less than the total are
  `INVALID_COLLATERAL`.
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

| `BuildOptions`       |                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `payer?`             | who pays and gets the change: a wallet, an address or a snapshot; `MISSING_PAYER` without one                                                 |
| `canSelect?`         | which of the payer's UTxOs may be selected, for payment and for collateral                                                                    |
| `coinSelection?`     | a `SelectInputs` function in place of the built-in selection; change stays with the built-in rule                                             |
| `sendAllTo?`         | spend every selectable UTxO and send what is left to this address                                                                             |
| `after?`             | `BuiltTxData` or `TxPlan` (its steps that are in a block and not final, or may still land), or a list: transactions the provider has not seen |
| `knownUtxos?`        | outputs the parts may name by out ref that the provider may not know yet                                                                      |
| `fee?`               | goes into the body as given; `FEE_TOO_LOW { fee, minFee }` when the final minimum is higher                                                   |
| `registeredPools?`   | operators whose pool registration is an update, taking no deposit                                                                             |
| `extraKeyWitnesses?` | signatures expected beyond those the parts call for                                                                                           |
| `topUpCollateral?`   | `true` by default: given collateral inputs that do not cover are topped up from the payer's UTxOs                                             |
| `collateralReturn?`  | `true` by default; `false`: lovelace-only collateral inputs forfeited whole, no return, no total                                              |
| `signal?`, `trace?`  | abort the build (`ABORTED`); receive its steps, for diagnostics                                                                               |

The constructor reads nothing and checks every option at once (`MISSING_PARAMETER` with neither
`provider` nor `params`). The README details the options under [Builder options][r-builder-options]
and [Build options][r-build-options].

### The payer

A payer is a wallet (a CIP-30 api, or a Mesh wallet), an address, or a snapshot
`{ changeAddress, utxos }`. A build reads it once, concurrently with its lookups; an address's
UTxOs come through the provider, past the cache, and a snapshot needs no request.
`readPayer(payer)` turns any form into a snapshot, for many builds on one read. See
[Payer, signer, submitter][r-payer].

### UTxOs

The builder has its own UTxO type, `Utxo`, and computes on nothing else:

```ts
import type { Assets, OutputDatum, OutputScript } from "@meshsdk/transaction";

type Utxo = {
  txHash: string;
  outputIndex: number;
  address: string;
  value: Assets; // { lovelace: bigint, [unit]: bigint }
  datum?: OutputDatum; // { type: "inline", data: { type: "CBOR", content } } | { type: "hash", hash }
  script?: OutputScript; // "plutus" { version, code, hash } | "native" { cbor, hash } | "unknown" { scriptRef, hash? }
};
```

It is written with the words of the parts (an out ref, a `value` by unit in `bigint`, a datum
tagged `inline` or `hash`, a Plutus script as `{ code, version }`), so a UTxO's members go into a
part as they are, and a `Utxo` is itself an `OutRef`. It is plain data: it survives
`structuredClone`, and a plan's record writes its quantities as decimal strings, like every
other `bigint`.

The Mesh `UTxO` of `@meshsdk/common` stays the format of providers, wallets and evaluators. The
builder does not compute on it, for what it leaves open:

- `amount` is a list of `{ unit, quantity }` strings with no rule for order or repeats: balancing
  added repeated units up, the default evaluator's converter took the first lovelace entry, and
  "holds tokens" was read from the list's length.
- Whether a datum is inline follows from which of `plutusData` and `dataHash` is set, and
  `dataHash` is set in both cases.
- `scriptRef` is CBOR whose framing differs between sources and which every consumer decoded
  again; one that could not be decoded passed a build and failed `requiredSigners` with the
  decoder's own error. `scriptHash` was not read.

**One door in.** Wherever a UTxO is given (a part, a payer snapshot, a wallet's or provider's
answer, `knownUtxos`, `minFee`, `requiredSigners`, `utxosAfter`) it may be a `Utxo`, a
Mesh `UTxO` or the CBOR of a transaction unspent output (`UtxoInput`). One function, exported as
`toUtxo`, checks it and copies it into a `Utxo` in normal form: lower-case hex, the address in
bech32 (base58 for Byron), lovelace always present and tokens in unit order, the reference script
described with its hash. The three forms of one UTxO give equal values, so they build the same
bytes. The conversion drops nothing a UTxO states: repeated units are added up, and what cannot be
held is refused: a quantity above 2^64 − 1, an inline datum that is not exactly one item of Plutus
data, a `dataHash` that is not the hash of the `plutusData` beside it, a `scriptHash` without a
`scriptRef`. `output()` refuses such an inline datum too, so every output the builder makes is a
UTxO it takes back. A reference script given as bytes (a Mesh `scriptRef`, or an `unknown` script)
is described as `plutus` or `native` only when it is written back to the same bytes and its hash is
the one stated with it, if any; any other, and one that cannot be read, is carried as `{ type:
"unknown" }`: the UTxO stays spendable, the script counts for the fee by its size, and it is no
script the transaction can use (the builder takes no hash or language from it, and it cannot be a `{
reference }`). A `plutus` or `native` script given in the builder's form that cannot be read or
with a `hash` that is not its own is refused. A part refuses with the code of the member at fault
(text that is not UTxO CBOR is `INVALID_OUT_REF`), an option with `INVALID_OPTION`, a wallet's or
provider's answer with the code of that read.

**One way out.** Everything the builder returns holds `Utxo`s: `BuiltTxData` (with
`collateral.return`, the output the collateral return becomes if a script fails), `PayerSnapshot`,
the callbacks `canSelect` and `coinSelection` (which answers out refs), the parts and the records
of plans. `toMeshUtxo` writes a `Utxo` as a Mesh `UTxO`; the builder hands an evaluator its UTxOs
so. The old `MeshTxBuilder` keeps the Mesh `UTxO` at its border: it leaves out the `scriptHash`,
and a `dataHash` beside `plutusData`, which it never read, before the builder reads its UTxOs (an
output it could not read, which the builder then looks up itself, is read as any provider answer),
and writes back into its body, and hands its evaluator, the UTxOs it was given, as given; change and
an input it did not hold are written with `toMeshUtxo`. See [UTxOs][r-utxos].

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
   covers it, else the largest UTxOs up to `maxCollateralInputs`, else the smallest UTxO holding
   tokens or a reference script alone, else a CIP-30 payer's `getCollateral` — with the rest
   returned to the collateral return part's address or the change address. Collateral parts that
   do not cover it are topped up by the same choice, made with them counted and after them,
   within `maxCollateralInputs` in all and never with a given UTxO again;
   `topUpCollateral: false` puts them up as given (`INSUFFICIENT_COLLATERAL` when they fall
   short), as the old `MeshTxBuilder` does. A return too small to be an output is dropped and
   the whole collateral forfeited (`COLLATERAL_FORFEITED`), unless the total was given.
   `collateralReturn: false` sets neither a return nor a total: the inputs are forfeited whole
   (`COLLATERAL_FORFEITED`) and must hold lovelace alone, so a given one holding a token is
   `INVALID_COLLATERAL`, a `collateralReturn` part `INVALID_OPTION`, and the choice and the
   top-up take lovelace-only UTxOs (also of `getCollateral`'s answer) at the least cost: the
   lovelace at stake plus, for each input after the first, the fee of one more input with its
   key witness (140 bytes at `minFeeA`), so that several inputs are taken over one only when
   they spare more than they cost. The search is exact for sets of one, two and three (pairs and
   triples among the 64 largest UTxOs below what is missing), ties go to fewer inputs, then to
   the smaller out refs; never more than `maxCollateralInputs`, and beyond three only the
   largest ones. Those holding a reference script come only when the others cannot cover.
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
   resolves the rest from its own chain. They are written as Mesh `UTxO`s, the form `IEvaluator`
   takes.
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

The `BuiltTxData` holds the transaction, its hash and prototype, and what the build decided: fee,
execution units, redeemers, resolved inputs, and outputs and change as labelled `Utxo`s, collateral,
the keys that must sign with the roles each is needed in (`signers`), validity, network, warnings
and the resolved parts; see [The result][r-result].

### Time and chains

`validity({ from, until })` takes POSIX milliseconds (`number`, `bigint` or `Date`), converted on
the builder's slot clock so that the interval a script sees lies within `[from, until]`: `from`
to the first slot starting at or after it, `until` to the slot containing it. A lower bound after
the local clock's time is the warning `VALID_FROM_FUTURE`; a bound before the network's slot clock
starts, or an interval with no slot, is `INVALID_DATA`. `build` sets no `until`. See
[Time][r-time].

`after` builds on transactions the provider has not seen: their inputs are not selected, their
change at this build's change address is, and every output they make can be named by out ref
without a lookup. `utxosAfter(utxos, built)` folds them into a list of `Utxo`s for the next build. A
plan given in `after` stands for its steps that are in a block and not final, or may still land;
see [Chains][r-chains].

## Plans: `TxPlan`

`await builder.plan(steps, options)` is the only way to make a plan: several transactions, its
steps, built at once and sent in order. One list of parts is a plan of one step, `main`; an object
of named steps is a plan of several, in the order of its keys, each step parts,
`{ parts, ...options }` with build options of its own, or a transaction built before (a `BuiltTx`
or its CBOR hex, read by `fromCbor` and taken as it is). Every other body is built by that call,
each on its payer's UTxOs as the steps before it leave them, read once, and nothing is signed or
sent, so the whole plan can be shown before anyone signs. Its options are the build options with an
`id`, `consolidate` and the deadlines `ttlMs`, `expiryMarginMs` and `confirmations`, written into
the plan when it is made and never read from the builder again. `build` stays one transaction or an
error.

- **Steps.** A step is one transaction with a fixed body and hash, a name and a status. Nothing is
  rebuilt: every call signs, sends and looks for the same bytes, so every call can be repeated,
  after a crash or from another process, without paying twice. A part names an output of an
  earlier step by a link, `{ step, output }` (a label or a position) or `{ step, change: true }`
  (all its change, in `spend.pubKey`), filled in from that step's own transaction. A step built
  from parts spends the change of the step before it of the same payer, unless it already spends,
  reads or puts up an output of that step, so the ledger keeps the order; a step that can do
  neither is `INVALID_OPTION` (`steps`). `run()` sends a step only when every step before it is in
  a block. A step whose selection does not fit a transaction gets consolidation steps before it
  (`kind: "consolidation"`, at most 4 by default), which pay the payer alone. `plan.add(steps)`
  builds named steps at the end of a `pending` plan, at the tip of that call, and changes none it
  has; a plan has at most 32 steps.
- **Statuses.** A step is `built`, `signed`, `sent`, `rejected`, `included`, `final`, `expired`,
  `failed` or `orphaned`; a rollback can take `included` back to `sent`, and `rejected` may still
  land. A plan is `pending`, `stopping`, `stopped` or `final`; only `final` and `stopped` are
  terminal. A payment is paid when its step is `final`, which never changes. `stopped` means that
  nothing more of the plan is expected to land, by what the chain shows: a step called `expired`
  or `orphaned` is still looked for, and found in a block it counts as landed and the plan's
  status follows (`DEAD_STEP_FOUND`). A step is `orphaned` only while a step it stands on is
  called dead; then it is what its own record says again. A plan that came to `stopped` by its
  steps records it (`halted`): a later find takes it to `stopping` or `final`, never back to
  `pending`.
- **Time is the chain's.** A step whose parts set no `until` gets
  `until = max(tip time, from) + ttlMs`, the tip read once for the plan; it is `expired` once the
  provider's tip and the local clock are both past `until` plus `expiryMarginMs` (a tip more than
  two minutes ahead of the clock is neither taken nor remembered: `TIP_AHEAD_OF_CLOCK`), and
  `final` once `confirmations` blocks lie on top of its block. The provider must give the tip and
  the search with block heights, and `validContract` for a Plutus step; otherwise
  `CANNOT_OBSERVE`, before anything is signed or sent. Other timers only set the pace of waiting
  (`pollMs`, `resendMs`).
- **Calls.** `sign()` and `run()` sign with the call's `signers`, else the payer, checking every
  witness against the body, and sign a step given built as any step; the payer gives
  only the keys it is asked for, and is not asked when none is left. `run()` looks at the chain,
  then signs, submits and waits for `waitFor` (`"sent"`, `"included"` by default, `"final"`);
  `refresh()` looks once; `stop()` records that the plan signs and sends nothing more. A plan with a
  step that will not land, or that was `halted`, sends no step for the first time. `timeoutMs`
  bounds every request of `run()` (a search, the tip, the store, a submit) by the time left; a
  signer is bounded by the step's end of validity. `landed`, `live` and `rest` say what landed, what
  may still land and what is left, as steps `builder.plan` takes; what is left is paid by a plan
  in its place, `replan({ id, steps? })`, which marks the old plan first, holds the old plan's
  steps that are in a block and not final as steps of its own, and spends an input of each old
  transaction that may still land, never by `builder.plan(rest)`.
- **The store.** `TxPlanStore` is `load(id)` and a compare-and-set `save(json, expectedRev)`. Every
  change is saved before the method returns; the record holds data only, never a wallet, signer,
  submitter or function (its UTxOs stand in the builder's form), and `resume(id, options)`
  restores the plan with those given again. A recorded `id` with the same steps and options is the
  recorded plan, and nothing is built. `memoryPlanStore()` serves tests; `checkPlanStore(store)`
  checks one's own store ([Storage][r-storage]).

The rules for a lost answer, a refusal, a step that does not go through, reconciliation and
chains are in the README: [Plans][r-plans], [Servers][r-servers] and
[Deadlines and waiting][r-deadlines].

## Signing without a plan

`build()` returns a `BuiltTx`: one built transaction as an object. Its own members are the
`BuiltTxData` data, read-only, so it goes wherever that data goes (`after`, `utxosAfter`,
`outputOf`) and copies as plain data. The object itself is frozen; the data nested in its members is
the build's own and can be changed, and nothing that is signed or sent is read from it. Beside them
it holds the witnesses given to it, the payer of its build when that payer can sign (written
nowhere: none after `restore` or `fromCbor`), and has `sign({ signers?, partial?,
signal? })` (without signers, the payer signs, by a plan's rules), `addWitnesses(...)`,
`submit({ submitter?, signal? })`, `awaitInclusion({ timeoutMs?, pollMs?, signal? })`, `signedTx`
(only when no key is missing), `partialTx` (the witnesses held so far, for a party that signs next
in another program), `missing` and `toJSON()`, with `builder.restore(json)` to bring it back in
another process.
`builder.fromCbor(txCbor, { knownUtxos? })` makes the same object of a transaction that exists only
as CBOR: its body is taken as given, byte for byte, and its members are read from those bytes and
from the UTxOs of its inputs, collateral inputs and reference inputs, given in `knownUtxos` or read
through the provider's cache. The object is one body: its bytes and hash are fixed when it is
made, no call builds or edits a transaction, a repeated `submit()` sends the same bytes, and
`awaitInclusion()` promises one sighting in a block and no more, each look bounded by the time
left. It is not a second lifecycle: no deadline, no statuses and no store; those are a plan's,
and the steps of a plan are the data without these calls, since a plan signs and sends its own
transactions. Do not rebuild to retry: a retry is the same call on the
same object ([The path without a lifecycle][r-no-lifecycle]).

- **Keeping.** A signature is kept once per key and kind, after it verifies against the body: the
  keys asked for, as many other keys as the build's `extraKeyWitnesses` (after `fromCbor`, as many
  as the transaction came with), and as many bootstrap witnesses as the
  transaction spends from Byron addresses. A key counts as signed by its vkey witness alone. A vkey
  or bootstrap entry is written with the set tag it had in the transaction or the JSON the object
  was made of, else as the body writes its input set.
- **A refusal.** `submit()` decides on settled facts. After a delivery of the object that was
  taken, or whose answer was lost, a refusal is no error and the call returns; a delivery that
  has not answered yet is waited for, and decides. Otherwise one look for the transaction: found,
  the call returns; not found, or the provider cannot be asked, it is `REJECTED`, and the
  message says which. The call's `signal` stops the waiting. The
  messages of `SUBMIT_FAILED`, `REJECTED` and `CONFIRM_TIMEOUT` from the object end with the rule
  not to build another transaction to retry it. `SUBMIT_FAILED`, of a plan too, carries
  `details.reason` and `details.status`, what the submitter's error says; they change nothing of
  what it means.
- **The JSON** carries the data of the build with `signers` as built, the witnesses held, each of
  their two entries with the set tag the object writes it with, the build's `extraKeyWitnesses`,
  and a mark for a delivery taken, of unknown outcome, or in flight when it was written. `restore`
  makes no request and refuses a record whose transaction holds witnesses (they go in
  `witnesses`), whose hash is not its body's, whose witnesses are not of its body
  (`INVALID_OPTION`), of another network (`NETWORK_MISMATCH`), or with content it does not read
  (`INVALID_STATE`, `recordVersion`); its errors quote nothing of the record but its network.
- **A transaction from CBOR.** `fromCbor` decodes nothing before one walk over the bytes on the
  token reader of `@cardano-sdk/core`, which refuses what the library's process could not read
  safely or in reasonable time: above the size limit (the builder's `maxTxSize`, else 16 384
  bytes), nested deeper than 1 024 levels, more nested data than about a second of decoding, an
  output address longer than 256 bytes (base58 is quadratic), an earlier era's form. A map that
  repeats a key and a key the decoder does not know are read as the decoder reads them; a node
  refuses such a transaction. Once decoded it refuses what a ledger
  does not take (a negative fee, a zero quantity, an out ref twice, an address with trailing
  bytes), another network, a parameter-change proposal (not read from CBOR) and a signature that
  is not of the body. It judges nothing else: the fee, the balance, the scripts and
  the validity interval are the ledger's. It writes no byte that a hash covers, and a transaction
  that came signed takes no more bytes than it was given in. Its view of the inputs and signers is
  only as true as `knownUtxos` and the provider; it warns `COLLATERAL_RETURN_ELSEWHERE` because the
  validity flag is not signed, so whoever submits can make the collateral inputs spent. A bootstrap
  witness is counted for the Byron addresses spent from, not matched to its address.

A signer is a wallet, `keySigner(key)` over a private key, or the application's own
`signTxHash(request)` (an object with it, or the function), which is told the hash and the keys
still needed, `{ txHash, keys?, tx, signal? }` with each key `{ keyHash, roles }` (roles of
`SignerRole`, and `"nativeScript"` for a key a native script names), and answers with
`{ vkey, signature }` pairs; a plan hands its signers the same keys. Signers belong to the call,
a key lives only inside the signer `keySigner` returns, and signing sends nothing. The free
functions below stay as the lower layer, for code without a builder:

```ts
import type {
  RequiredKeys,
  RequiredSignersOptions,
  Signer,
  TxSigners,
  UtxoInput,
} from "@meshsdk/transaction";

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
declare function requiredSigners(
  tx: string,
  spent: readonly UtxoInput[],
  options?: RequiredSignersOptions,
): TxSigners;
```

`addWitnesses` and `signedKeyHashes` return promises, unlike the synchronous forms first proposed:
checking a signature waits for the Ed25519 library to start, so every refusal of theirs is a
rejected promise. A `TransactionPrototype` is the layer the serializer turns into CBOR: the
builder makes no transaction of one. A prototype assembled by hand (`assembleTxPrototype`) is
serialized, and `builder.fromCbor` makes the `BuiltTx` of its bytes.

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
- `TxPlanError` comes from signing, sending, observing, the lifecycle and the store, of a plan or
  of a `BuiltTx`; one raised by a plan also carries `planId`, `status`, `step`, `txHash` and, not
  enumerable, `plan`. Retryable:
  `SUBMIT_FAILED`, `CONFIRM_TIMEOUT`, `NOT_YET_VALID`, `STILL_LIVE` with `safeAfter`, and `CANNOT_OBSERVE` with
  `unconfirmed`.

Options of a call that are not an object, or have a member the call does not know, are
`INVALID_OPTION`. Where what was given may be or hold a key (options, a signer, a key, a payer, a
submitter, a `tx`), `details.value` names only its JavaScript type, and no message quotes it.

The README's [Errors][r-errors] table gives every code with its condition, `details` and retry
rule.

## Testing

- `assemble.test.ts`: redeemer indices for every purpose, including the orders that differ from
  encoding order; reference inputs, collateral return, hashes, round-trip through the decoder;
  every conflict. `parts/*.test.ts`: the part builders. `utxo.test.ts`: the three forms of a UTxO,
  the normal form, every refusal, and the conversions both ways; `utxo-forms.test.ts`: one build
  from each form gives the same transaction.
- `builder.test.ts` and the unit tests beside it (`payer`, `selection`, `chain`, `network`,
  `result`, `sign`, `key-signer`, `built-tx`, `add`, `errors`, ...): balancing, deposits and
  refunds of every kind, resolution and fetch counts, the evaluation loop and its errors,
  collateral choices, payer forms, `after`, the signing functions, signers and the transaction
  `build()` returns; `sign-safety` holds the rules that keep a key inside its signer and a
  signature tied to its body.
- On `@meshsdk/scalus-emulator`, whose ledger rules check balance, fee, deposits, witnesses,
  redeemer indices and hashes: `assemble-emulator`, `builder-emulator` (script spends through a
  reference script, Plutus mints and burns, script and key withdrawals, certificates, DRep
  registration, a proposal, DRep votes, a treasury donation), `collateral-emulator`,
  `evaluator-emulator`, `network-emulator`, `payer-emulator`, `selection-emulator`,
  `traps-emulator`.
- On `TxEmulator` of `@meshsdk/tx-emulator`: `add-emulator`, `chain-emulator`, `redeemer-emulator`,
  `script-witness-emulator`, `sign-emulator`, `built-tx-emulator`, `validity-emulator`; the plan
  tests under `plan/` that need a chain, beside the state machine's own tests (`state-table`,
  `state-rules`, `state-random`) and those of the record and stores (`json`, `record`, `store`);
  the old `MeshTxBuilder`'s adapter tests (`test/mesh-tx-builder/legacy-adapter-*`); and the README
  doc-test, `test/readme.test.ts`, which runs the task lines of the README's first example as they
  stand there and checks that its table of errors names every code. See [Testing on the emulator][r-testing].

## Open items

- `Protocol` has no `drepDeposit` or `govActionDeposit`; until it does they come from
  `deposits`.
- Whether a pool registration is an update is not looked up; `registeredPools` says so.
- Change that cannot reach its minimum lovelace with the UTxOs available is an error; there is
  no option to leave the remainder to the fee.
- A reference script is priced by the bytes of `[language, script]`, a few above the ledger's
  count.

[readme]: ../../packages/mesh-transaction/README.md
[r-old]: ../../packages/mesh-transaction/README.md#the-old-meshtxbuilder
[r-builder-options]: ../../packages/mesh-transaction/README.md#builder-options
[r-build-options]: ../../packages/mesh-transaction/README.md#build-options
[r-payer]: ../../packages/mesh-transaction/README.md#payer-signer-submitter
[r-result]: ../../packages/mesh-transaction/README.md#the-result
[r-utxos]: ../../packages/mesh-transaction/README.md#utxos
[r-time]: ../../packages/mesh-transaction/README.md#time
[r-chains]: ../../packages/mesh-transaction/README.md#chains
[r-plans]: ../../packages/mesh-transaction/README.md#plans
[r-servers]: ../../packages/mesh-transaction/README.md#servers
[r-storage]: ../../packages/mesh-transaction/README.md#storage
[r-testing]: ../../packages/mesh-transaction/README.md#testing-on-the-emulator
[r-deadlines]: ../../packages/mesh-transaction/README.md#deadlines-and-waiting
[r-no-lifecycle]: ../../packages/mesh-transaction/README.md#the-path-without-a-lifecycle
[r-errors]: ../../packages/mesh-transaction/README.md#errors
