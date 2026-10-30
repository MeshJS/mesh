# Design: `TxBuilder`

**Status:** implemented in `packages/mesh-transaction/src/tx-builder/` (`assembleTxPrototype`,
`TxBuilder`). This document is the design record for that work.

## Problem

`MeshTxBuilder` keeps a transaction as mutable builder state (`MeshTxBuilderBody`), fills it in
through modal call chains, and goes from that state to CBOR inside the serializer. Three things
follow:

- What a call means depends on the calls before it, so a misplaced call type-checks and fails at
  `complete()`, far from where it was made.
- Redeemer indices are positions in arrays the builder sorts by hand, once per purpose, and the
  result is only checked when the transaction reaches a ledger.
- The completed transaction is a hex string: the fee, the selected inputs, the execution units
  and the collateral can only be read back by decoding it.

The part builders (`spend`, `output`, `mint`, `withdrawal`, `certificate`, `vote`, `proposal`, ...)
already describe each piece of a transaction as one immutable value built by one call, and
`TransactionPrototype` describes a whole transaction as a value. What was missing is the step
between them.

## Proposal

```
part builders  ──►  TxPart[]  ──►  TxBuilder.build  ──►  assembleTxPrototype  ──►  serializer
  (one call          (values,        (look up,             (combine, order,          (CBOR)
   per piece)         may have        balance,              index, hash)
                      gaps)           evaluate)
```

Two layers, usable separately:

- **`assembleTxPrototype(parts, { fee, costModels? })`** — pure and synchronous. Takes parts with
  nothing left open and returns `{ prototype, redeemers, languages }`. It is the only place that
  orders the transaction and numbers its redeemers.
- **`new TxBuilder(options).build(request)`** — takes parts as the part builders return them,
  fills in what they leave open, balances, evaluates, and returns the serialized transaction
  together with everything it decided.

```ts
const builder = new TxBuilder({ fetcher, evaluator, deposits });
const built = await builder.build({ parts, changeAddress, utxos });
built.tx; // unsigned CBOR
built.prototype; // the TransactionPrototype it was serialized from
built.fee; // and exUnits, redeemers, inputs, selectedInputs, change, collateral, parts
```

A builder holds only its providers and settings; `build` keeps no state between calls, so one
builder can build many transactions, concurrently included.

### Non-goals

- **Not a replacement for `MeshTxBuilder`.** Both are exported; nothing existing changes
  behaviour.
- **No signing or submission.** The result is an unsigned transaction; wallets sign it.

## Assembly: `assembleTxPrototype`

Every part must be complete — `unresolved(part)` empty. Otherwise it throws `UNRESOLVED` with the
gaps of every incomplete part in `details`.

### Redeemer indices

A redeemer points at the item it witnesses by its position in the order the ledger keeps that
kind of item in. The ledger orders by its own types, not by the bytes of their encoding, and the
two differ for credentials:

| Purpose           | Items           | Order                                                                                          |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `SPEND`           | inputs          | transaction id, then output index (numerically)                                                |
| `MINT`            | policies        | policy id bytes                                                                                |
| `REWARD`          | reward accounts | network, then credential: **script hashes before key hashes**, then hash                       |
| `CERT`            | certificates    | as given                                                                                       |
| `VOTE`            | voters          | committee hot credentials, DReps, stake pools; within each, **scripts before keys**, then hash |
| `VOTING_PROPOSAL` | proposals       | as given                                                                                       |

The key-hash header byte of a reward address is smaller than the script-hash one, so encoding
order would put keys first; the ledger's order puts scripts first. The emulator tests check both
reward accounts and voters with mixed credentials in one transaction.

Each redeemer is returned as `AssembledRedeemer { tag, index, exUnits, part, label? }`: the part
it belongs to travels with its pointer, so evaluation results, which come back by pointer, map
back to parts without re-deriving any order.

### What else assembly decides

- **Conflicts are errors** (`DUPLICATE_PART`): an input spent twice, two mint parts for one policy,
  two withdrawals from one account, two vote parts for one voter, a second validity interval,
  network id, donation, treasury value or collateral return, a metadata label given twice.
- **Reference inputs** are the reference input parts plus the outputs holding reference scripts,
  deduplicated, minus inputs the transaction spends (a spent output's reference script is
  visible to the transaction anyway).
- **Witness scripts** are deduplicated by hash, **datums** (spent hash-datum outputs, embedded
  output datums) by CBOR.
- **Collateral return** holds the collateral inputs' value minus `totalCollateral`, tokens
  included; left out when nothing is left. Without a collateral return part neither field is
  set.
- **Hashes**: the auxiliary data hash and the script data hash (redeemers, datums and the
  language views of every Plutus version that runs, attached or referenced) are taken from the
  bytes of the encoded transaction, read back with their original encoding.

## Building: `TxBuilder.build`

### Options and request

| `TxBuilderOptions` |                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- |
| `fetcher?`         | looks up outputs given by reference, reward balances, protocol parameters, cost models |
| `evaluator?`       | works out execution units of redeemers given without them                              |
| `serializer?`      | must implement `serializeTxPrototype`; the `@meshsdk/core-cst` encoder otherwise       |
| `params?`          | protocol parameters; fetched, else Mesh's defaults                                     |
| `costModels?`      | fetched only when a Plutus script runs, else Mesh's defaults                           |
| `deposits?`        | `drepDeposit`, `govActionDeposit` — `Protocol` does not carry them                     |

| `BuildTxRequest`     |                                                                     |
| -------------------- | ------------------------------------------------------------------- |
| `parts`              | the transaction's parts                                             |
| `changeAddress`      | where change and, by default, the collateral return go              |
| `utxos?`             | what inputs and collateral are selected from (key-locked ones only) |
| `fee?`               | a fee used as is; rejected when below the minimum                   |
| `registeredPools?`   | operators whose pool registration is an update, taking no deposit   |
| `extraKeyWitnesses?` | signatures expected beyond those the parts call for                 |

### Resolution

One pass before balancing, with every lookup started at once:

- Outputs the parts reference by out ref alone — spent, referenced, collateral, reference
  scripts — are looked up among `utxos` and the UTxOs parts carry, and the rest fetched with one
  `fetchUTxOs(txHash)` per transaction hash.
- Protocol parameters, cost models (only when a Plutus script runs) and reward balances of
  withdrawals with `amount: "all"` are fetched alongside.
- What was looked up is checked against the parts as the part builders would have checked it:
  the lock of a spent output against its witness, a reference script's hash, size and version.
  The datum of a spent script output is worked out from the output.
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

Each round, starting from a zero fee:

1. Whatever `consumed − produced − fee` is short of is selected from `utxos`: each token from the
   UTxOs holding most of it, then lovelace from the largest UTxOs, plain ones (no tokens, no
   reference script) first. A transaction always spends at least one input.
2. The rest is change: one output, or several when its tokens do not fit in `maxValSize`. If it
   cannot hold their minimum lovelace, more lovelace is selected.
3. When a Plutus script runs, collateral covering `collateralPercent` of the fee is put up —
   collateral parts if given, else the smallest lovelace-only UTxO that leaves a return worth
   making — with the rest returned to the collateral return part's address or the change
   address. A return too small to be an output is dropped and the whole collateral forfeited,
   unless the total was given.
4. The transaction is assembled with placeholder witnesses as large as the real ones (a key
   witness per key the parts require — payment keys of spent and collateral inputs, required
   signers, key withdrawals, certificates and voters, every key a native script names — and a
   bootstrap witness per Byron address) and priced:
   `minFeeA * size + minFeeB + referenceScriptFee + ceil(Σmem * priceMem + Σsteps * priceStep)`,
   with exact rational arithmetic and the ledger's 25 KiB, 1.2× reference script tiers.
5. If the fee covers that, the round's transaction is the result; otherwise the fee becomes the
   price and the next round starts.

The fee only rises and inputs are only added, so the rounds settle; they are capped
(`FEE_NOT_CONVERGED`). The result's fee is within a few bytes' worth of the minimum for the
signed transaction.

### Evaluation

Redeemers without execution units are first priced at an even share of `maxTxExMem` /
`maxTxExSteps` (less any units given), so the first round over-provisions rather than
under-provisions. Then, each round:

1. Balance with the current units, serialize, and evaluate with the transaction's inputs,
   reference inputs and collateral passed as additional UTxOs.
2. Map each result back to its part through the assembled redeemers.
3. A redeemer still on its placeholder takes the evaluated units; one already evaluated keeps
   its units unless evaluation now needs more. When nothing changes, the evaluated transaction is
   the result.

Execution units given on a part are kept, and evaluation needing more is an error
(`EXUNITS_TOO_LOW`). When every redeemer states its units no evaluator is needed. Collateral
that falls short of the placeholder-inflated fee is not an error until the units are evaluated.

### Serialization

With the default encoder the prototype's hashes already match its bytes. With another serializer
the script data and auxiliary data hashes are taken again from the bytes it produced, and the
transaction re-serialized if they differ.

## Errors

`TxPartError` stays the error of a part builder call, and is also raised while resolving when
what was looked up does not fit a part. Everything else is a `TxBuildError` with
`code`, `part?`, `label?` and `details?`:

| Code                                                                                                                                                                           | When         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `UNRESOLVED`, `DUPLICATE_PART`, `INVALID_COLLATERAL`                                                                                                                           | assembly     |
| `MISSING_FETCHER`, `UTXO_NOT_FOUND`, `MISSING_PARAMETER`                                                                                                                       | resolution   |
| `INSUFFICIENT_FUNDS` (`details: { unit, missing }`), `INSUFFICIENT_COLLATERAL`, `OUTPUT_BELOW_MIN_COIN`, `VALUE_TOO_LARGE`, `TX_TOO_LARGE`, `FEE_TOO_LOW`, `FEE_NOT_CONVERGED` | balancing    |
| `MISSING_EVALUATOR`, `EVALUATION_FAILED` (`details.redeemers` maps pointers to parts and labels), `EXUNITS_TOO_LOW`, `EXUNITS_EXCEEDED`, `EVALUATION_NOT_CONVERGED`            | evaluation   |
| `UNSUPPORTED_SERIALIZER`                                                                                                                                                       | construction |

## Testing

- `assemble.test.ts`: redeemer indices for every purpose, including the orders that differ from
  encoding order; reference inputs, collateral return, hashes, round-trip through the decoder;
  every conflict.
- `builder.test.ts`: balancing (minimum output lovelace, change below the minimum, token
  selection, change splitting, fixed fee, extra witnesses), deposits and refunds of every kind,
  donation, resolution and fetch counts, the evaluation loop and its errors, collateral choices.
- `assemble-emulator.test.ts`, `builder-emulator.test.ts`: transactions built, signed and
  submitted to `@meshsdk/scalus-emulator`, whose ledger rules check balance, fee, deposits,
  witnesses, redeemer indices and hashes — script spends through a reference script, Plutus
  mints and burns, script and key withdrawals and certificates in one transaction, DRep
  registration, a proposal, script and key DRep votes in one transaction, a treasury donation.

## Open items

- Fetches are deduplicated within a build only. A fetcher that caches across builds can be
  passed in as is.
- `Protocol` has no `drepDeposit` or `govActionDeposit`; until it does they come from
  `deposits`.
- Whether a pool registration is an update is not looked up; `registeredPools` says so.
- Change that cannot reach its minimum lovelace with the UTxOs available is an error; there is
  no option to leave the remainder to the fee.
