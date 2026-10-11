# Design: `TransactionPrototype`

**Status:** implemented in [#837](https://github.com/MeshJS/mesh/pull/837) (types + `mesh-core-cst`
encoder/decoder + `mesh-core-csl` serializer). This document is the design record for that work; it
introduces no code of its own.

## Problem

`IMeshTxSerializer.serializeTxBody()` takes a `MeshTxBuilderBody` — the builder's own working state —
and goes all the way to CBOR in one step. That couples two unrelated jobs in every backend:
deciding *what* the transaction is (coin selection, change, fees, collateral, witness collection)
and deciding *how* the bytes are laid out. Consequences:

- Each backend re-derives the same domain translation from builder state, so `mesh-core-cst` and
  `mesh-core-csl` can silently disagree about what a given builder body means.
- There is no value you can inspect, snapshot, diff, or hand to a second serializer to check the
  first one. The only observable output is a hex string.
- The builder cannot be tested without a serializer, and a serializer cannot be tested without
  driving the builder.

## Proposal

Introduce one intermediate value between the two:

```
builder state  ──►  TransactionPrototype  ──►  CBOR
   (what)              (the handoff)          (how)
```

`TransactionPrototype` is a **fully-resolved, backend-agnostic representation of a Cardano
transaction** — post coin-selection, post witness collection — already in a shape that is friendly
to serialization. It is what the new transaction builder should assemble at the end of its work and
hand to a serializer, and nothing more than that: it holds no builder intent, no unresolved
references, no partial state.

Root type mirrors the ledger's own `transaction`:

```ts
type TransactionPrototype = {
  body: TransactionBodyPrototype;
  witness_set: TransactionWitnessSetPrototype;
  is_valid: boolean;
  auxiliary_data?: AuxiliaryDataPrototype;
};
```

### Non-goals

- **Not a builder API.** It is the builder's output, not something a user assembles by hand.
- **Not a byte-layout description.** Encoding choices that do not change the transaction's meaning
  (see "What it deliberately does not express") stay with the serializer.
- **Not a replacement for `serializeTxBody`.** It is added alongside; nothing existing changes
  behaviour.

## Structure

One file of pure type declarations, ~145 exported names, all suffixed `Prototype`. The three
branches follow the ledger's `transaction_body` / `transaction_witness_set` / `auxiliary_data`
one-for-one, so a field here can be located in the CDDL by name:

```
TransactionPrototype
├── body: TransactionBodyPrototype              20 fields
│   ├── required            inputs, outputs, fee
│   ├── validity            ttl, validity_start_interval, network_id
│   ├── value movement      mint, withdrawals, certs
│   ├── scripts             script_data_hash, required_signers, reference_inputs,
│   │                       collateral, collateral_return, total_collateral
│   ├── governance          voting_procedures, voting_proposals
│   ├── treasury            current_treasury_value, donation
│   └── auxiliary_data_hash
├── witness_set: TransactionWitnessSetPrototype  8 fields
│   ├── signatures          vkeys, bootstraps
│   ├── scripts             native_scripts, plutus_v1_scripts, plutus_v2_scripts,
│   │                       plutus_v3_scripts
│   └── plutus              plutus_data, redeemers
├── is_valid: boolean
└── auxiliary_data?: AuxiliaryDataPrototype      metadata, native_scripts, plutus_v1/v2/v3_scripts
```

Everything below those three is a leaf type reached structurally — the hash-like and `coin`-like
aliases (`AddressPrototype`, `BigNumPrototype`, … all `string`), the recursive shapes
(`NativeScriptPrototype`, `PlutusDataPrototype`, `MetadatumPrototype`), and the tagged unions with
their per-variant payloads: `CertificatePrototype` (15 variants), `GovernanceActionPrototype` (7),
`CredTypePrototype`, `DRepPrototype`, `VoterPrototype`, `RelayPrototype`, `DataOptionPrototype`.

Implementation sits in three directories, one file per domain (`body`, `witness-set`,
`auxiliary-data`, `certificates`, `governance`, `inputs-outputs`, `native-script`, `plutus-data`,
`primitives`, `value`) behind a single entry point each:

| Path | Entry point |
|---|---|
| `mesh-common/src/types/tx-prototype/` | the types, re-exported from the package root |
| `mesh-core-cst/src/tx-prototype-to-cbor/` | `transactionPrototypeToHex` / `…ToCardano` |
| `mesh-core-cst/src/tx-prototype-from-cbor/` | `transactionPrototypeFromHex` / `…FromCardano` |
| `mesh-core-csl/src/tx-prototype/` | `serializeTxPrototype` |

## Placement: `mesh-common`

`packages/mesh-common/src/types/tx-prototype/types.ts`.

`mesh-core-cst` (`@cardano-sdk/core`) and `mesh-core-csl` (whisky) are two *backends* behind one
`IMeshTxSerializer`. A prototype type that only one of them recognises is not a shared handoff — it
is that backend's private format in the wrong place. For

```ts
serializeTxPrototype(proto: TransactionPrototype): string
```

to be one interface method with two real implementations, the type must sit where both backends and
the future builder can depend on it without `mesh-core-cst` and `mesh-core-csl` depending on each
other. `mesh-common` already owns `IMeshTxSerializer` and `MeshTxBuilderBody`, and the file has
**zero runtime imports** — pure type declarations — so it adds no dependency edge.

An earlier revision put it in `mesh-core-csl/src/tx-prototype/`, reasoning that it is a
serialization concern. That was right about the concern and wrong about the scope: the correct scope
is "shared across serialization backends", not "owned by one of them".

Do not confuse it with the pre-existing `TransactionPrototype` in
`mesh-transaction/src/mesh-tx-builder/coin-selection/coin-selection-interface.ts` — an unrelated
type describing the delta of one coin-selection round. Nothing imports both today, so there is no
collision, but the two names should not both survive long-term.

## Shape conventions

- **Field names are the CDDL/wire names in `snake_case`, verbatim** — not camelCased. A backend may
  hand this value to a native library as JSON, matching on these exact names, so a rename is a
  wire-breaking change rather than a cosmetic one.
- **Unions are tagged**, `{ type: "…", … }`, one variant per CDDL alternative — certificates,
  governance actions, Plutus data, metadata, credentials, DReps, voters.
- **Money is `string`.** `coin`-typed fields carry decimal strings, so they need no numeric type
  decision at all.
- **Optionality mirrors the CDDL.** A `?` key in the ledger spec is `?:` here; a required key is
  required here.

## Type authority: the Conway CDDL

Every field is typed to cover **what the Conway CDDL permits** — `IntersectMBO/cardano-ledger`,
`eras/conway/impl/cddl/data/conway.cddl` — and nothing else gets a vote. In particular no
serializer backend's own field widths do: this type is shared by two backends, one of which never
touches the other's native library, so a backend that is narrower than the spec is that backend's
bug to fix, not a reason to narrow the domain. Where a backend is genuinely narrower, the narrowing
happens explicitly at that backend's boundary and is commented as lossy.

### `bigint`, not `number | bigint`

Fields whose CDDL range exceeds `Number.MAX_SAFE_INTEGER` (2^53−1) are `bigint`. The union was
rejected deliberately: it lets a plain numeric literal compile and then lose precision silently at
the top of the range, whereas requiring `123n` makes the wide case impossible to get wrong by
accident. The fields that carry it:

| Field | CDDL rule | Range |
|---|---|---|
| `ScriptNOfKPrototype.n` | `script_n_of_k = (3, n : int64, [* native_script])` | ±9.22e18, **signed** |
| `PoolRetirementPrototype.epoch` | `epoch = uint .size 8` | 2^64−1 |
| `CommitteeMemberPrototype.term_limit` | `update_committee`'s `{* committee_cold_credential => epoch}` | 2^64−1 |
| `PlutusDataPrototype` `INTEGER.value` | `big_int = int / big_uint / big_nint` | arbitrary precision |
| `PlutusDataPrototype` `CONSTR.alternative` | `constr<a0> = #6.102([uint, [* a0]])` | 2^64−1 |
| `MetadatumPrototype` `INT.value` | `metadatum = … / int / …` | ±2^64 |

Everything still typed `number` was checked field-by-field and is bounded by `uint .size 2` /
`uint .size 4` (or is a 0..255 byte), so it cannot overflow; the per-field JSDoc records which rule
applies. Watch the two same-named-but-different-width fields:
`CommitteeMemberPrototype.term_limit` is a full `epoch` (uint64, `bigint`) while
`ProtocolParamUpdatePrototype.committee_term_limit` is an `epoch_interval` (uint32, `number`).

**Consequence for callers:** `JSON.stringify` throws on `bigint`, and a `Number(v)` replacer
reintroduces exactly the precision loss these fields exist to prevent. Any JSON boundary must use
`json-bigint` (as `mesh-core-csl` already does elsewhere).

### Conway-only surface

Structures the Conway era removed are absent rather than kept for compatibility — the prototype
describes transactions that can be submitted today:

- `transaction_body`'s `update` key, and with it `UpdatePrototype` /
  `ProposedProtocolParameterUpdatesPrototype`.
- Certificates `GENESIS_KEY_DELEGATION` and `MOVE_INSTANTANEOUS_REWARDS_CERT`, and the MIR types.
- Protocol-parameter-update fields `d`, `extra_entropy` (and `NoncePrototype`, whose only reason to
  exist it was) and `protocol_version` — in Conway the protocol version changes only via
  `hard_fork_initiation_action`, never as a parameter update.

### Plutus scripts: three fields, not one

`transaction_witness_set` splits Plutus scripts across keys `? 3 : nonempty_set<plutus_v1_script>`,
`? 6 : …v2…`, `? 7 : …v3…`, and `auxiliary_data_map` likewise across keys 2/3/4, because **a Plutus
script's language version is not recoverable from its bytes — the map key is what records it.** A
single version-less `plutus_scripts` list therefore makes V2/V3 scripts unrepresentable and forces a
backend to guess. Both `TransactionWitnessSetPrototype` and `AuxiliaryDataPrototype` carry
`plutus_v1_scripts` / `plutus_v2_scripts` / `plutus_v3_scripts` as separate fields.

## What it deliberately does not express

Encoding choices that do not change what the transaction *is* belong to the serializer, not here:

- **Set encoding.** The CDDL accepts either form, `set<a0> = #6.258([* a0]) / [* a0]`, and a TS
  array cannot carry set-ness. But the choice is transaction-wide: the two forms produce different
  bytes and therefore a different transaction hash, so a body must not mix them. `mesh-core-cst`
  exposes it as a single whole-transaction switch —
  `transactionPrototypeToHex(proto, { taggedSets })`, default `true` to agree with whisky — which
  makes mixing impossible by construction rather than a convention to remember.
- **Output era format.** `transaction_output` has an Alonzo array form and a Babbage map form. The
  prototype states the output's contents; the backend picks the form.
- **Definite vs indefinite lengths.** Same reasoning.

Fields inherited from the wire shape that fall in this category and are *not* honoured
(`prefer_alonzo_format`, `PlutusListPrototype.definite_encoding`) are marked as such in the type
rather than removed, so their presence in third-party JSON does not read as a promise.

## Backends

| Backend | Path | State |
|---|---|---|
| `mesh-core-cst` | `src/tx-prototype-to-cbor/` | Full encoder: `TransactionPrototype` → `@cardano-sdk/core` native types → CBOR. One file per domain; reuses the package's existing tested helpers (`toCardanoCert`, `toCardanoVoter`, `toValue`, …) wherever an input shape can be bridged. |
| `mesh-core-csl` | `src/tx-prototype/` | `serializeTxPrototype(proto)` via whisky's `js_tx_prototype_to_hex`, serialized with `json-bigint`. |

The two are **not** symmetric, and that asymmetry is the main scoping fact for the work ahead:
whisky already implements this concept natively, so the CSL side is close to a JSON handoff, while
the CST side required writing the converter from scratch.

whisky is a backend, not the authority. Cross-referencing its `tx_prototype` structs against the
CDDL found five fields it cannot represent (`n` as `u32` rather than signed `i64`, two `epoch`
fields as `u32`, `PlutusData::Integer` as `i128`, and the single version-less `plutus_scripts`
list). These are upstream bugs to fix; none of them justifies narrowing the types here. Two carry
present-day consequences:

- **Integer Plutus data and integer metadata are rejected outright** by
  `js_tx_prototype_to_hex` with `Error("i128 is not supported")` — `serde_json` cannot deserialize
  `i128` without `arbitrary_precision`, which whisky's WASM build lacks. This reproduces for
  `value: 0` with a plain `number`, so it is neither a large-value nor a `bigint` problem and no
  TypeScript-side change can work around it. The `{ type: "CBOR", hex }` datum variant does work.
- `serializeTxPrototype` maps a V1-only script set through and **throws** on V2/V3 rather than
  mis-tag them.

Until whisky is patched, `mesh-core-cst` is the only backend covering the full prototype surface.
Both behaviours are pinned by tests that will fail loudly — and should then be inverted — once
whisky is fixed.

## Decoder and testing strategy

`mesh-core-cst/src/tx-prototype-from-cbor/` is the inverse:
`transactionPrototypeFromHex(hex)` / `transactionPrototypeFromCardano(tx)`.

Its purpose is primarily **verification of the encoder**: `decode(encode(x)) === x` exercises far
more than field-by-field assertions, because every field has to survive real CBOR. That the
round-trip suite has teeth was itself checked by mutation — silently dropping a single body field in
the encoder fails the round-trip tests while the targeted encoder tests stay green.

Round-tripping is not the identity, and each gap is pinned by a test rather than left implicit:
`null`/`[]` normalise to absent; set encoding is not represented on either side; `CBOR`-variant
datums come back structurally expanded as `MANUAL`; `STAKE_REGISTRATION`'s `coin` is dropped because
CDDL certs 0/1 and 7/8 are distinct shapes; values above 2^53 truncate where the encoder narrows at
the Mesh-type boundary. `PARAMETER_CHANGE_ACTION` is deliberately not decoded — its ~34 fields
differ from their CST counterparts in name, unit and optionality, so it throws rather than return a
half-correct update.

## Open items

- `serializeTxPrototype` is not yet on `IMeshTxSerializer` — the interface method does not exist
  yet, and the CST converter is reachable directly.
- **Nothing produces a `TransactionPrototype` yet.** The builder-side converter (its own state →
  prototype) is the other half of this design and is where the decoupling actually pays off.
- whisky's own top-level builder does not use its `tx_prototype` module internally either, so check
  upstream activity before treating that module as stable.
