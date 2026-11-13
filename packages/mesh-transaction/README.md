# mesh-transaction

Transactions - [meshjs.dev/apis/transaction](https://meshjs.dev/apis/transaction)

[meshjs.dev](https://meshjs.dev/)

## A payment

```ts
import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";
import { output, TxBuilder } from "@meshsdk/transaction";

// Plans need a provider that returns block heights: "Providers and networks" shows how to get them from BlockfrostProvider
const provider = new BlockfrostProvider(blockfrostProjectId);
const wallet = new MeshWallet({
  networkId: 0,
  key: { type: "mnemonic", words: mnemonic },
});
const recipient = "addr_test1qz...";

const builder = new TxBuilder({ network: "preprod", provider }); // the builder holds no wallet
const plan = builder.plan(
  output({ address: recipient, value: { lovelace: 2_000_000n } }),
  { payer: wallet },
);
await plan.send({ waitFor: "included" }); // builds, signs with the payer, submits, waits for a block
console.log(plan.txHash); // the hash of the attempt that landed
```

With the `@meshsdk/provider` that `@meshsdk/core` pins today, `BlockfrostProvider` returns no block
heights, and `send()` throws `CANNOT_OBSERVE` (`noDepth`) before anything is signed or sent; the
subclass in [Providers and networks](#providers-and-networks) adds them.

`included` shows progress; a rollback can still undo it. A shop releases goods when its own server,
observing through its own provider, sees the plan `final`: a plan of a keyless server, or the
[reconciliation](#reconciliation-of-unfinished-plans).

`TxBuilder` builds a balanced transaction from _parts_: one value per piece of the transaction
(`output(...)`, `spend.plutus(...)`, `certificate.stakeDelegation(...)`, ...), each made by one call
that checks its arguments there. `builder.plan(parts, { payer })` returns a `TxPlan`: one
payment, carried from its parts to a final state. Every attempt of a plan spends one common
input, its _anchor_, so at most one attempt can land, and every step can be repeated by the same
call without paying twice. A plan's time is the time of the chain's tip; local timers only set
the pace of waiting.

The builder holds no wallet: who pays is the `payer` of each build or plan, who signs is the
payer unless a call names `signers`, and who submits is the call's `submitter`, else the
builder's, else the provider. The builder holds its network, provider, settings, the provider's
shared cache and the parts added with `.add()`; it holds no payer and no state of a transaction,
which lives in its `TxPlan`. One builder builds any number of transactions, concurrently
included.

`builder.build(parts, { payer })` gives a transaction without a lifecycle: plain data, with no
deadline and no anchor. It is the preview of an order, the way to build without a provider, and
the start of a transaction balanced or edited by hand. Do not rebuild it to retry: see
[The path without a lifecycle](#the-path-without-a-lifecycle).

The examples below use these names, defined by the application: `provider` (a
`BlockfrostProvider` that returns block heights, or a `TxEmulator`), `builder` (as above; with a
`store` where an example says so), `emulator` (a `TxEmulator`), `wallet` (a `MeshWallet` or a
CIP-30 api), `api` (the CIP-30 api
from a browser wallet's `enable()`, with `submitTx`: `canSubmit(api)` narrows a `Cip30WalletApi` to
`ISubmitter`), `store` (the application's `TxPlanStore`; in tests `memoryPlanStore()`), and the
addresses, UTxOs, scripts and parts an example names.

## The builder

```ts
import { customNetwork } from "@meshsdk/core";
import { TxBuilder } from "@meshsdk/transaction";

const online = new TxBuilder({ network: "preprod", provider });
const offline = new TxBuilder({ network: "preprod", params, costModels }); // reads nothing
const server = new TxBuilder({ network: "mainnet", provider, store }); // plans survive a restart
const tests = new TxBuilder({
  network: "preprod",
  provider: emulator,
  planDefaults: { expiryMarginMs: 0, confirmations: 0 }, // see "Deadlines and waiting"
});
const devnet = new TxBuilder({
  network: customNetwork({
    systemStart,
    slotLengthMs: 1_000,
    epochLength: 500,
  }),
  provider: devnetProvider,
});
```

Its options are listed in [Builder options](#builder-options). The builder also has `chain()` (the
network, parameters and cost models it builds on, as data: `new TxBuilder({ ...snapshot })` builds
on them without reading; it throws `MISSING_PARAMETER` when there are no cost models),
`slotAt(time)` and `timeAt(slot)` on its slot clock, `scriptAddress(script, stake?)` and
`rewardAddress(credential)` on its network, `serialize(prototype)`, `finalize(prototype, { inputs,
changeAddress? })`, `readPayer(payer)`, and its options as read-only fields (`builder.params` and
`builder.costModels` are what was given, never what was read).

### Accumulated parts

`.add(...parts)` returns a new builder with the same settings and cache and these parts held;
the builder it is called on does not change, so keep the result. `build()` and `plan()` take the
held parts first, then the parts they are given. Parts can come as one part, a list, nested lists
(fragments), and `false`, `null` or `undefined`, which are skipped, so `cond && part` works:

```ts
import { message, output, TxBuilder } from "@meshsdk/transaction";

// A reusable fragment: a list of parts, plain immutable values checked when made
const serviceFee = (memo: string) => [
  output({
    address: feeAddress,
    value: { lovelace: 1_000_000n },
    label: "fee",
  }),
  message({ text: memo }),
];

const shop = new TxBuilder({ network: "preprod", provider }).add(
  serviceFee("order 42"),
);
const plan = shop.plan(
  [
    output({ address: recipient, value: { lovelace: 5_000_000n } }),
    express && output({ address: courier, value: { lovelace: 2_000_000n } }),
  ],
  { payer: wallet },
);
```

A part of a kind a transaction holds once (a validity interval, a collateral return, a message,
...) given both among the held parts and in the call is `DUPLICATE_PART`, as within one list: the
part passed does not replace the held one. `.add()` throws `INVALID_OPTION` at once for an entry
that is not a part.

## Payer, signer, submitter

| `payer`                                                   | Build                                                                                         | Sign                                                    | Submit                                                                                     | Wait                             | Record and `resume`                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| a wallet                                                  | read at the build: network, change address, UTxOs                                             | the wallet, when the call names no `signers`            | the call's `submitter` or the builder's, else the provider; a wallet only as a `submitter` | the provider                     | the change address only; the wallet is given to `resume` again                                      |
| an address (bech32 or hex)                                | its UTxOs through the provider, past the cache                                                | the call's `signers`, or `addWitnesses`                 | the same                                                                                   | the same                         | the change address; for a new attempt the address is given again, to `resume` or `build({ payer })` |
| a snapshot `{ changeAddress, utxos }`                     | nothing is read; a CIP-30 snapshot (hex address, UTxOs in CBOR) is converted without requests | the same                                                | the same                                                                                   | the same                         | the change address; a snapshot serves one attempt, a new one goes to `build({ payer })`             |
| offline: `params`, `costModels`, a snapshot, `knownUtxos` | `build()` without requests                                                                    | a cold signer on `built.tx`; the free signing functions | later, online, without a plan: `submitTx` of the provider, the same bytes                  | `awaitTransactionConfirmation()` | no plan record                                                                                      |
| without balancing                                         | `assembleTxPrototype`, `finalize`                                                             | the same                                                | the same                                                                                   | the same                         | no plan record                                                                                      |

A build without a payer is `MISSING_PAYER`, and its message names the forms. The builder has no
default payer. Without a wallet the other errors are `MISSING_SIGNATURES` (nobody to sign),
`MISSING_SUBMITTER` (nobody to submit), `MISSING_PAYER` for a new attempt of a plan object
given no payer (the recorded change address is not one), `PAYER_MISMATCH` for a payer that has
neither the recorded change address nor the recorded anchor, and `MISSING_STORE` for `resume` on
a builder without a store. `builder.readPayer(payer)` turns any form into a `PayerSnapshot`
(bech32 address, UTxO objects); a snapshot needs no request and no provider.

**Who signs.** The call's `signers` (`sign()`, `send()`, `advance()`), else the plan's payer when
it can sign; else `MISSING_SIGNATURES`, and nothing is sent. The builder has no signer. The builder
puts the witnesses in itself: only the transaction's witness set changes, and witnesses of keys the
fee does not count (an extra key a wallet signs with) are dropped. A key that did not sign is in
`plan.missing`, and the attempt stays `built`.

**Who submits.** The call's `submitter` (`send()`, `advance()`), else the builder's, else the
provider; with none, `MISSING_SUBMITTER`. A wallet submits only when it is given as a `submitter`
object: there is no `"payer"` value. A CIP-30 api with `submitTx`, a `BrowserWallet` and a
`MeshWallet` with a submitter fit; `canSubmit(api)` narrows a `Cip30WalletApi` to `ISubmitter`. The
call's `submitter` is given in every call that should go through it, after `resume` too; a call
without it sends the same bytes, with the same `txHash`, through the builder's submitter or the
provider. A builder of one user in a browser may hold the wallet as its own `submitter`. A failed
`submitTx` of a wallet (CIP-30 `TxSendError`: Refused 1, Failure 2) is `SUBMIT_FAILED` with
`details.walletCode`: the outcome is unknown, and the same bytes are safe to send again. Reading
and sending may be split: a `provider` reads, a `submitter` sends.

### A browser wallet

```ts
import { canSubmit, output, TxError } from "@meshsdk/transaction";

const api = await window.cardano[walletName]!.enable(); // the CIP-30 api: payer, signer and submitter
const plan = builder.plan(
  output({ address: shop, value: { lovelace: 2_000_000n } }),
  { payer: api },
);
try {
  await plan.send({
    waitFor: "included",
    ...(canSubmit(api) && { submitter: api }), // the wallet submits; without it the provider does
  });
} catch (error) {
  if (
    TxError.is(error, "SIGNER_FAILED") &&
    error.details.reason === "accountChanged"
  ) {
    const again = await window.cardano[walletName]!.enable(); // connect again: the user must be back on the account that pays
    await plan.build({ payer: again }); // the current attempt, built from the old account's UTxOs
    await plan.send({ waitFor: "included" });
  } else throw error;
}
```

`included` here shows the user progress; a rollback can still undo it, so the shop's server
releases the goods once it sees the plan `final` through its own provider (a
[keyless server](#a-keyless-server-several-instances-on-one-store) plan, or the
[reconciliation](#reconciliation-of-unfinished-plans)).

UserDeclined (2) from `signTx` is `SIGN_DECLINED`; AccountChange (−4) is `SIGNER_FAILED` with
`reason: "accountChanged"`, not retryable: call `enable()` again and give the new api to
`plan.build({ payer })`. That continues the current attempt, whose body spends the old account's
UTxOs, so the user must be back on the account that pays. A wallet that now gives another account
cannot sign that body: `abandon()` the plan and pay with the new api in a new plan, by the rule
of [New plan instead of an old one](#new-plan-instead-of-an-old-one). Parts that need the
signature of a DRep key (DRep certificates, a vote cast by a DRep key) are signed by a browser
wallet connected with the CIP-95 extension: `enable({ extensions: [{ cip: 95 }] })` on the wallet's
entry in `window.cardano`, or `BrowserWallet.enable(name, [{ cip: 95 }])`. The builder calls nothing
of CIP-95: it calls `signTx` and compares the keys that signed with `BuiltTx.signers`; a key that
did not sign stays in `plan.missing`, and `send()` throws `MISSING_SIGNATURES`.

**Wallet forms.** A wallet given as the payer comes in one of these forms:

| Wallet form | Examples                                                                                                                                                                            | How the builder takes it                                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CIP-30 api  | `window.cardano.<name>.enable()`; from Mesh's wallet 2.0: `CardanoBrowserWallet`, `CardanoHeadlessWallet` (with a fetcher), `MeshCardano*`, `createCip30Api(wallet)`                | hex address to bech32 (Byron to base58), UTxOs in CBOR to objects with datum and `scriptRef`; `null` and `undefined` from `getUtxos` are no UTxOs; signs with `signTx(tx, true)` |
| Mesh 1.9    | `MeshWallet`, `BrowserWallet`                                                                                                                                                       | as it is; a wallet with `signTxWitnesses` (the `MeshWallet` of this release) signs with the keys the transaction needs, any other with `signTx(tx, true, false)`                 |
| address     | bech32 or hex                                                                                                                                                                       | its UTxOs through the provider, past the cache                                                                                                                                   |
| snapshot    | `PayerSnapshotInput`: `{ changeAddress, utxos }`, also with a hex address and CBOR UTxOs from CIP-30 (a keyless server; a server with a key filters its own UTxOs with `canSelect`) | as a CIP-30 api, without requests or a provider                                                                                                                                  |

A wallet's UTxOs come from the wallet. A wallet without `getUtxos`, and a `MeshWallet` made without
a fetcher, are read at their change address through the builder's provider.

**Collateral.** The builder picks collateral itself, from the payer's key-locked UTxOs: ada-only
ones without a reference script first. When they do not cover it and the payer is a CIP-30 api with
`getCollateral` (or `experimental.getCollateral` when the first is absent), that is called once
with `{ amount }` (CBOR of the lovelace needed), and the collateral is taken from its answer; the
wallet may show its collateral dialog. A failure, `null`, `undefined`, an empty or short answer is
`INSUFFICIENT_COLLATERAL`, with the wallet's error in `cause`; the answer is filtered by
`canSelect` too.

## Plans

A plan's status is one of eleven:

| Status      | Meaning                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `draft`     | no attempt yet                                                               |
| `built`     | an attempt is built; signatures are missing (`plan.missing`)                 |
| `signed`    | fully signed, not sent                                                       |
| `sent`      | delivered: accepted, or the outcome is unknown                               |
| `rejected`  | the ledger refused it, and every earlier delivery of it                      |
| `included`  | found in a block with `is_valid = true`                                      |
| `expired`   | its deadline and the margin have passed, and it is not on chain              |
| `failed`    | in a block with `is_valid = false`: a script failed, the collateral is taken |
| `orphaned`  | the parent attempt whose output it spends is dead                            |
| `final`     | in a block with at least `confirmations` blocks on top of it                 |
| `abandoned` | closed: no attempt landed, and none will                                     |

Only `final` and `abandoned` are terminal, in every later version too. A status this code does not
know is not terminal: call `refresh()` or `advance()`, and `plan.live` (the attempts that landed
or may still land) says whether money may still move. No error means "not paid": only `abandoned`
does.

`included` can be undone: when a rollback takes the attempt's block away, the next observation
finds no attempt, and the plan goes back to `sent`. A node does not put the transactions of
rolled-back blocks back into its mempool, and once `send()` has returned only a later `send()` or
`advance()` sends the bytes again. So `included` is for showing progress: goods are released, and
an output is spent in the parts of another plan, only at `final`.

| `TxPlan`                       |                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build({ payer? })`            | the attempt to sign and send: the current or the landed one; a new one in `draft`, `rejected`, `expired`, `orphaned` and past an unsent attempt's deadline. Before a new attempt it searches every earlier one and returns one it finds in a block. A `payer` given here serves this and later attempts |
| `sign({ signers? })`           | signs the current attempt with the call's signers, else the payer; records what it got                                                                                                                                                                                                                  |
| `addWitnesses(...witnessSets)` | adds witness sets, or full transactions from a wallet, to the current attempt, each checked against its body                                                                                                                                                                                            |
| `send(options?)`               | observes, then builds (in `draft` only), signs, submits and waits for `waitFor`; in `sent` it sends the same bytes again                                                                                                                                                                                |
| `refresh()`                    | one observation of the live attempts; never builds, signs or sends                                                                                                                                                                                                                                      |
| `advance(options?)`            | one step of a reconcile job: continues as `send()`, replaces a dead attempt when the call has a signer, finishes a closing                                                                                                                                                                              |
| `abandon()`                    | records the decision to close (the _closing mark_, shown by `plan.closing`; after it `build()`, `sign()`, `addWitnesses()` and `send()` throw `INVALID_STATE` (`closing`)), and closes the plan when no attempt can land                                                                                |
| `toJSON()`                     | the plan as plain JSON data                                                                                                                                                                                                                                                                             |

It also shows `id`, `status`, `built` (the landed attempt's `BuiltTx`, else the current one's;
`built.tx` is unsigned), `signedTx`, `txHash` (it may change with a new attempt before `included`:
the stable key of a payment is `id`), `missing`, `attempts`, `live`, `landed` and `closing`.

`signers` and `submitter` are options of a call, not of a plan: give them to `sign()`, `send()`
and `advance()`, after `resume` too. A new attempt is never made by waiting: only `build()`, or
`advance()` with a signer, makes one, and it spends the same anchor as the earlier ones. Earlier
attempts that are `expired` or `orphaned` are searched again only by `build()`, by `abandon()` and
by `advance()` with a signer; `refresh()`, `send()` and `advance()` without a signer search the live
attempts only.

A live attempt may land until `safeAfter`: the time the tip passes the latest deadline of the live
attempts plus `expiryMarginMs`. Past it, before `abandon()` closes a plan and before the payer's
or a child's anchor changes, the _double check_ searches for the attempts twice, with a pause of
at least `min(60_000, expiryMarginMs)` between the two, inside the call; see
[Deadlines and waiting](#deadlines-and-waiting).

**With a store.** `builder.plan(parts, { id })` stays synchronous; the record is read by the
first awaited method (`build`, `send`, `refresh`, ...). So read the status after the first `await`,
and open a known `id` with `await builder.resume(id)`. An `id` already recorded is the same
plan: with the same parts `build()` returns its current attempt, which makes a repeated request
handler safe; other parts, explicit deadlines, data options or parents than the recorded ones are
`PLAN_EXISTS` from that first method. With a store every plan needs an `id` (`MISSING_ID`).
Recorded: the parts, the data options (`sendAllTo`, `knownUtxos`, `fee`, `registeredPools`,
`extraKeyWitnesses`), the payer's change address and the three effective deadlines. Not recorded:
wallets, signers, the submitter, functions (`canSelect`, `coinSelection`, `trace`) and `signal`.
Every change is saved before the method returns: a new attempt before it is handed out, a first
delivery before the bytes leave.

### Lost answer, rejection, explicit replacement

```ts
import { TxError } from "@meshsdk/transaction";

const plan = builder.plan(pay, { payer: wallet }); // the wallet may still show a spent input
try {
  await plan.send();
} catch (error) {
  if (TxError.is(error, "SUBMIT_FAILED"))
    await plan.send(); // "sent": the same bytes
  else if (
    TxError.is(error, "REJECTED") &&
    error.details.otherLive.length === 0
  ) {
    await plan.build(); // explicit replacement: a fresh selection, the same anchor; a spent explicit input is INPUTS_SPENT
    await plan.send();
  } else throw error;
}
try {
  await plan.send({ waitFor: "included", timeoutMs: 30 * 60_000 }); // wait options are for this call only
} catch (error) {
  if (!TxError.is(error, "EXPIRED") || error.details.otherLive.length > 0)
    throw error; // deadline and margin passed, not on chain
  await plan.build(); // a new attempt spends the same anchor; an earlier one that landed is returned as it is
  await plan.send({ waitFor: "included" });
}
// in a reconcile job or background task one plan.advance() replaces an expired attempt the same
// way when the call has a signer; REJECTED it throws, as send() does
```

`CONFIRM_TIMEOUT` is no failure either: the same `send()` waits on. A new build of the same
transaction by `builder.build()` could pick other inputs, and both could land; a plan's
replacement cannot.

### Refusal to sign; edits on a preview

```ts
import { message, TxError } from "@meshsdk/transaction";

const preview = await builder.build(pay, { payer: api }); // a preview without a plan: data, no deadline, nothing recorded or sent
showOrder(preview); // an edit of the order before it is confirmed is a new preview; the plan is made on confirmation
const first = builder.plan(pay, { payer: api }); // the CIP-30 api pays and signs
await first.build();
let plan = first;
try {
  await first.sign();
} catch (error) {
  if (!TxError.is(error, "SIGN_DECLINED")) throw error; // "built", nothing changed; whether to ask again is the application's choice
  if (await askAgain())
    await first.sign(); // the same body, the same txHash
  else {
    await first.abandon().catch((e) => {
      if (!TxError.is(e, "STILL_LIVE")) throw e;
    }); // the decision to close is recorded: first signs and sends nothing more
    // the condition of the exception is read after abandon(), on the same object: no signature ("built"), only this attempt in first.live
    if (
      first.status !== "abandoned" &&
      (first.status !== "built" || first.live.length !== 1)
    )
      throw new Error(
        "the old plan may still pay: the new one after abandoned",
      );
    plan = builder.plan([pay, message({ text: "order 42" })], {
      payer: api,
    }); // a new plan at once: one signer, the body given to nobody else
  }
}
await plan.send(); // the signed body is sent; a new plan is built, signed and sent
```

An order is edited on previews of `builder.build()`, before a plan exists: a plan's parts
are fixed, and new content is a new plan (see
[New plan instead of an old one](#new-plan-instead-of-an-old-one)).

### The wallet submits

```ts
const plan = builder.plan(pay, { id: orderId, payer: api }); // a builder with a store, in the browser
await plan.send({ waitFor: "included", submitter: api }); // submitTx of the wallet; the tip and the search are the provider's
// a submitTx error (TxSendError: Refused 1, Failure 2) is SUBMIT_FAILED, not a refusal: the outcome
// is unknown, the code is in details.walletCode; the same send() sends the same bytes
// after a reload of the tab:
const resumed = await builder.resume(orderId, { payer: api });
await resumed.send({ waitFor: "included", submitter: api });
// submitter is an option of the call: a send() without it sends the same bytes through the
// builder's submitter or the provider; a builder of one user may hold the wallet itself:
// new TxBuilder({ network: "preprod", provider, store, submitter: api })
```

### Without a wallet: an address or a snapshot

```ts
// By address: UTxOs through the provider; signatures come from the call's signers or addWitnesses
const byAddress = builder.plan(pay, { payer: userAddress });

// By snapshot: nothing is read; what a CIP-30 wallet returns can be passed as it is
const snapshot = {
  changeAddress: await api.getChangeAddress(), // hex
  utxos: (await api.getUtxos()) ?? [], // CBOR
};
const bySnapshot = builder.plan(pay, { payer: snapshot });
await bySnapshot.send({ signers: api });
// a snapshot serves one attempt: a build that makes a new attempt is MISSING_PAYER until a fresh one is given
// await bySnapshot.build({ payer: freshSnapshot });
```

### A cold signer

A transaction built by a machine with a provider and signed elsewhere is an ordinary plan:
`plan.build()`, `built.tx` to the signer, `addWitnesses()` with what comes back, `send()`.

```ts
const plan = builder.plan(pay, { payer: coldAddress });
const { tx } = await plan.build(); // unsigned: goes to the cold signer
// ... later, with the witness set or the signed transaction it returns:
await plan.addWitnesses(witnessSet); // INVALID_WITNESS (wrongBody) for a witness of another body
await plan.send({ waitFor: "included" });
```

A body that already went to a signer or to the network is never turned into a plan: a plan
with the same parts is another transaction, and both could land.

### Chains

`after: parentPlan` builds a child on the current attempt of its parent: each attempt of the
child spends an output of its parent's attempt (its key-locked change at the child's change
address, which `canSelect` accepts), so the child cannot land without it. A parent attempt
without such an output gives the child an anchor of its own: that child does not depend on the
parent attempt, is never `orphaned`, and its own anchor is never changed (when another
transaction spends it, the way on is `abandon()` and a new plan).

```ts
import { MeshWallet } from "@meshsdk/core";
import { TxError } from "@meshsdk/transaction";

const wallet = new MeshWallet({
  networkId: 0,
  key: { type: "mnemonic", words },
}); // no fetcher: the builder reads its UTxOs through the provider
const parent = builder.plan(payAlice, { payer: wallet });
const child = builder.plan(payBob, { payer: wallet, after: parent }); // spends an output of the parent's current attempt
await parent.send();
await child.send(); // built after the parent was sent
try {
  await child.send({ waitFor: "included" });
} catch (error) {
  if (
    !TxError.is(error, "ORPHANED", "EXPIRED") ||
    error.details.otherLive.length > 0
  )
    throw error;
  // chains are immutable: the application restarts them from the link it needs
  await parent.refresh(); // the parent's fresh status: nobody observed it after its send()
  if (parent.live.length === 0) {
    // the parent attempt is dead, and with it the child's: orphaned by the child's margin, or expired
    await parent.build(); // a new attempt of the parent, the same anchor
    await parent.send();
  }
  await child.build(); // on the parent's current attempt, with its own anchor; a new anchor waits for the double check, up to a minute by default
  await child.send({ waitFor: "included" });
}
```

- A child's default deadline is not later than its parent attempt's while that is not in a block;
  an `until` the child's parts give is kept as given.
- A child's success does not move its parent: `parent.status` changes only by the parent's own
  observation (`refresh()`, `send()`, `advance()`).
- A child whose parts name the parent's output explicitly (`outputOf(parent.built!, label)`) gets
  `INPUTS_SPENT` on a new attempt of the parent: that link is restarted with a new child plan,
  first `abandon()` of the old child, the new one when the old is `abandoned` (its attempts on the
  dead parent attempt are `orphaned`, and `abandon()` closes it in the same call).
- Build the first attempt of a child after its parent was sent: a refusal of the parent then
  comes before the child has an attempt. A chain built ahead (every link before the first
  delivery) waits after a refusal of a link: the next links' `build()` throws `STILL_LIVE` until
  their attempts are `orphaned` or `expired`, by default up to 20 minutes from the build.
- Settlement of goods, and spending an output in the parts of another plan, wait for `final`:
  a rollback can still undo `included`.
- On a builder with a store, parents are plans of a builder with a store; a resumed child loads
  its parents from the store by their recorded ids.

Consecutive payments of one payer are chained with `after: parentPlan`. Without it, the second
plan may select the input the first one spends: only the ledger, or `INPUTS_SPENT` and the
payer's anchor wait on the plan, catch the forgotten `after`. Builds without a lifecycle chain
the same way with `after: built`: the inputs of `built` are not selected again, and its change at
this build's change address is selectable. Outputs paid to another, and change at another address,
are never selected, though a part may spend them by out ref. For a batch, or a server with one
queue of requests per payer, read the payer once and fold the transactions with `utxosAfter`:

```ts
import { utxosAfter } from "@meshsdk/transaction";

const payer = await builder.readPayer(wallet); // one wallet read for the whole batch
const first = await builder.build(parts1, { payer });
const second = await builder.build(parts2, {
  payer: { ...payer, utxos: utxosAfter(payer.utxos, first) },
  after: first, // also hands the outputs of first to an evaluator that is not local
});
```

Two queues on one wallet each need a snapshot of their own UTxOs (split them with `canSelect`), or
one payer's payments go one after another.

### Vesting

```ts
import { mConStr0 } from "@meshsdk/core";
import {
  guard,
  output,
  outputOf,
  spend,
  TxError,
  validity,
} from "@meshsdk/transaction";

const lock = builder.plan(
  output({
    address: builder.scriptAddress(validator),
    value: { lovelace: 10_000_000n },
    datum: { type: "inline", data: mConStr0([owner, deadline]) },
    label: "vesting",
  }),
  { payer: wallet },
);
await lock.send({ waitFor: "final" }); // its output goes into the parts of another plan
const unlock = builder.plan(
  [
    spend.plutus({
      utxo: outputOf(lock.built!, "vesting"),
      script: validator,
      redeemer: { data: mConStr0([]) },
      label: "unlock",
    }),
    guard.pubKey({ keyHash: owner }),
    validity({ from: deadline + 1 }), // until is set by the plan: from + ttlMs; a deadline read from a datum is a bigint: deadline + 1n
  ],
  { payer: wallet },
);
try {
  await unlock.send({ waitFor: "included" });
} catch (error) {
  if (!TxError.is(error, "NOT_YET_VALID")) throw error; // before the deadline: built and signed, nothing sent
  await new Promise((resolve) => setTimeout(resolve, error.details.waitMs)); // error.retryAfterMs is the same
  await unlock.send({ waitFor: "included" });
}
// the anchor is a wallet UTxO; two unlocks cannot both land anyway: both spend the vesting output
```

Times are POSIX milliseconds. A script's interval lies within `[from, until]`, so a script that
needs its lower bound strictly after a deadline gets `from: deadline + 1`. See [Time](#time).

### Send-all

```ts
const sweep = builder.plan([], {
  payer: wallet,
  sendAllTo: newAddress, // every selectable UTxO of the payer, less the fee, to one address
});
await sweep.send({ waitFor: "included" });
```

`sendAllTo` spends every selectable UTxO of the payer and sends what is left over the outputs,
deposits and fee to one address, in several outputs when its tokens exceed `maxValSize`. With a
plan the selection is pinned: a new attempt takes payer UTxOs only from those the attempt it
replaces used and that are still unspent, since the inputs are the amount paid; none left is
`INSUFFICIENT_FUNDS`. `canSelect` still narrows them.

## Servers

### A keyless server; several instances on one store

```ts
import { output, TxBuilder } from "@meshsdk/transaction";

const builder = new TxBuilder({ network: "preprod", provider, store }); // on every instance

export async function buildPayment(
  orderId: string,
  userAddress: string,
  lovelace: bigint,
) {
  const plan = builder.plan(output({ address: SHOP, value: { lovelace } }), {
    id: orderId,
    payer: userAddress,
  });
  const { tx } = await plan.build(); // the provider is probed before signing (CANNOT_OBSERVE: nothing built); recorded before it returns; a repeat with the same id and parts gives the same body
  return { tx }; // the body without signatures
}

// the browser: const witnessSet = await signWitnesses(api, tx); a full transaction from the wallet works too

export async function submitPayment(orderId: string, witnessSet: string) {
  const plan = await builder.resume(orderId); // any instance
  await plan.addWitnesses(witnessSet); // INVALID_WITNESS (wrongBody) when the signature is not of this body
  await plan.send(); // observes, records the delivery, then submits; a signature after the deadline is EXPIRED { unsent: true }
  return { orderId, txHash: plan.txHash }; // the hash may change before "included"; the key of the payment is the plan's id
}
```

The store's compare-and-set makes several instances safe: two of them never record two first
attempts of one `id`, and an instance that lost a race reads the record again.

The store does not keep plans with different ids apart. Payouts from one paying wallet on
several instances collide on its UTxOs: when two select the same one, one lands, the other is
refused, and its replacement waits out its deadline and the margin (`STILL_LIVE`, about 20 minutes
by default) before its anchor can change. Give each instance or queue its own UTxOs with
`canSelect`, and pass the same `canSelect` again to `resume`, or run one payer's payouts one after
another with `after`; see [Chains](#chains).

### A crash after sending

```ts
import { MeshWallet } from "@meshsdk/core";
import { TxBuilder } from "@meshsdk/transaction";

const wallet = new MeshWallet({
  networkId: 0,
  key: { type: "mnemonic", words },
}); // no fetcher: the builder reads its UTxOs through the provider
const builder = new TxBuilder({ network: "preprod", provider, store });
await db.open("payout-7"); // into the list of open plans, with the payout it pays, before the plan's first await
const plan = builder.plan(parts, { id: "payout-7", payer: wallet });
await plan.send(); // records the delivery "outcome unknown", then submitTx; the process crashes
// after the restart, on any instance (resume needs a store and an id):
const resumed = await builder.resume("payout-7", { payer: wallet }); // live objects are given again
await resumed.send({ waitFor: "final" }); // observes; "sent": the same bytes, then waits for 30 blocks on top of the attempt's block (the default confirmations)
// the reconciliation after a restart: resume(id) and advance(), below
```

| Crash                                      | In the store            | After `resume`                                                                     |
| ------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| before the delivery is recorded            | `signed`                | `send()`: the first delivery                                                       |
| after it, before the answer                | `sent`, outcome unknown | `send()`: the same bytes                                                           |
| between signatures                         | the signatures received | `addWitnesses` with the rest                                                       |
| while building                             | the earlier attempt     | as if nothing was built                                                            |
| after the closing mark, before `abandoned` | the closing mark        | `advance()`: the closing; `send()` and `build()` throw `INVALID_STATE` (`closing`) |

### Signatures over several days

```ts
import { guard, output, spend } from "@meshsdk/transaction";

const plan = builder.plan(
  [
    spend.native({ utxo: vaultUtxo, script: vaultScript }),
    output({ address: vendor, value: { lovelace: 50_000_000n } }),
    guard.pubKey({ keyHash: aliceKeyHash }),
    guard.pubKey({ keyHash: bobKeyHash }),
  ],
  { id: "payout-17", payer: vaultAddress, ttlMs: 3 * 86_400_000 }, // the attempt's deadline: three days, recorded in the plan; no horizon limits a native script
);
const { tx } = await plan.build(); // the body without signatures goes to both
const monday = await builder.resume("payout-17"); // any instance
await monday.addWitnesses(aliceWitnessSet); // recorded; missing: Bob
const wednesday = await builder.resume("payout-17");
await wednesday.addWitnesses(bobWitnessSet); // "signed"
await wednesday.send({ waitFor: "final" });
```

Any signature fixes the body: a change of parts, inputs, fee or deadline is a new body and new
signatures from everyone. A body with some signatures stays live until its deadline, since the
others may still sign it. A plan with a long deadline is prepared for replacement when it is
made: its parts name an explicit input of the payer, `spend.pubKey({ utxo })` with a UTxO from
`builder.readPayer(payer)`. A new plan with that same part can then be made right after
`abandon()` of the old one, by the exception "common input" (see
[New plan instead of an old one](#new-plan-instead-of-an-old-one)), not only after the deadline
and the margin. The cost: if another transaction spends that input, there is no replacement
attempt, and `build()` throws `INPUTS_SPENT`.

### Reconciliation of unfinished plans

The application keeps the ids of its plans that are neither `final` nor `abandoned`. It writes an
id into that list, with the order or payout it pays, before the plan's first `await` (`build` or
`send`): a crash inside `send()` may come after the delivery is recorded and the bytes have left,
and an id written only after `send()` returns would then be missing from the list, with nobody to
learn whether it paid. It removes the id only when `resume` and `advance()` show `final` or
`abandoned`. A retried job uses the same id, never a fresh one: under a fresh id it may pay a second
time. Once a minute and after a restart it calls `resume(id)` and `advance()` for each. `advance()`
observes first, then makes one step: a plan without the closing mark goes on as with `send()`; a
dead attempt is replaced when the call has a signer (where `send()` would throw `EXPIRED` or
`ORPHANED` with an empty `otherLive`, it calls `build()`, then sends; once per call; without a
signer it throws that same error); a plan with the closing mark is closed: while an attempt may
still land (before `safeAfter`) it is returned as it is, and once none can, it is checked as
`abandon()` checks it and becomes `abandoned`.

```ts
// Once a minute and after a restart (a builder with a store)
for (const id of await db.openPlanIds()) {
  // plans neither final nor abandoned
  try {
    const plan = await builder.resume(id, { payer: await payerFor(id) }); // and canSelect, coinSelection when the plan was made with them
    await plan.advance(); // an observation, then one step: go on, replace a dead attempt, or close
    if (plan.status === "final" || plan.status === "abandoned")
      await db.close(id, plan.status); // final: release the goods here; abandoned: not paid
  } catch (error) {
    report(error); // the pass goes on; the next one repeats the call
  }
}
```

`resume` reads the store only: it calls neither the chain nor the payer (before reading, it does
refuse a provider that cannot follow plans, `CANNOT_OBSERVE` `noTip` or `addressCache`, without
a request). The payer is compared
with the record when a new attempt is built, so `PAYER_MISMATCH` comes from `advance()` (or
`build()`), never from `resume`, and never for a resend of the same bytes: the one `try` spans
both. The reconciliation has no list of statuses of its own: it reports an error and goes on to
the next id. Among the errors: `REJECTED` and `SCRIPT_FAILED` (no replacement: the application
decides), `EXPIRED` and `ORPHANED` without a signer (a handler starts the replacement with an
explicit `build()`, or the plan is closed with `abandon()`), `INPUTS_SPENT`, `MISSING_SIGNATURES`
(signatures are still being collected), `CANNOT_OBSERVE` (`noDepth`: the plan needs a provider
with block heights; `noValidity`: the provider does not tell whether a found Plutus attempt's
scripts passed; `unconfirmed`: the provider confirmed nothing this time), `INVALID_STATE`
(`recordVersion`: a newer version of the library keeps the record), `MISSING_PAYER` (the call has
`signers`, the object no payer: nothing to build a replacement from), `PAYER_MISMATCH`, and the
errors of `resume` itself (`PLAN_NOT_FOUND`, `STORE_FAILED`). Errors with `retryable: true` are a
wait, not a failure. A plan with the closing mark (`plan.closing`) that turns `final` paid: no
new plan is started for that order, and one already made to replace it is closed with
`abandon()`. Past `safeAfter` each closing waits for the pause of the double check, so a pass with
closings takes longer.

`payerFor(id)` (application code) gives the payer of the plan: a wallet, an address or a fresh
snapshot; a wallet or an address suit a reconciliation better, since a snapshot is a read per
plan and pass. A wallet that signs lets the reconciliation sign the current attempt and a
replacement of a dead one. An address does not: such a reconciliation observes, sends the same
bytes again and closes. A plan that needs signatures of others than the payer (a multi-signature
payer, required signers of other parties) is reconciled with an address too: with a wallet that
signs, it would build a new body after every deadline and sign it alone, and the others would have
to sign again, up to 16 attempts (`INVALID_STATE`, `tooManyAttempts`). A payer is given to every
`resume`; a plan with the closing mark and a terminal one do not use it. `canSelect` and
`coinSelection` are not recorded: a plan made with them gets them again in the same `resume`,
else a new attempt is built without the filter and with the built-in selection, with no error.
That cannot pay twice, since a new attempt spends the same anchor; only the choice of the payer's
UTxOs differs, and their value comes back as change. A separate signer or sender is given to
`advance({ signers, submitter })`.

### Storage

A `TxPlanStore` has two methods:

- `load(id)`: the record saved last under `id`, exactly as it was given to `save`, or `undefined`
  (never `null`) when there is none;
- `save(json, expectedRev)`: compare-and-set. It writes only when the stored `rev` is `expectedRev`
  (0: only when no record is stored under `json.id`), and `json.rev` is `expectedRev + 1`. `true`:
  written; `false`: another revision is stored and nothing was written; a throw: unknown, the write
  may have passed (`STORE_FAILED`).

The library owns the record's format: a store keeps it as data and adds no members of its own (a
database key, a timestamp). The reader refuses a member it does not know, so a store that returns
`_id` or `updatedAt` inside the record makes every read throw `INVALID_STATE` (`recordVersion`);
keep such columns beside the record. A store without compare-and-set can give two first attempts
with different anchors, which the library cannot detect. Records are never deleted while their
order may still be replaced. Tests use `memoryPlanStore()`. Each store below ends with
`await checkPlanStore(store)`, run once when a store is set up, not at every start: it checks
two writers, a lost acknowledgement, a crash between a write and a send, and that `load` returns a
record member by member as it was saved; it leaves a few closed records under ids that start with
`checkPlanStore:`, and rejects with a plain `Error` naming the check that failed.

**A server**: a table keyed by `id`, with a `rev` column and a conditional write.

```ts
import type { StoredTxPlanJSON, TxPlanStore } from "@meshsdk/transaction";
import { checkPlanStore } from "@meshsdk/transaction";

// create table tx_plans (id text primary key, rev integer not null, record text not null)
type Sql = {
  query(
    text: string,
    values: unknown[],
  ): Promise<{ rows: { record: string }[]; rowCount: number | null }>;
};

const sqlPlanStore = (sql: Sql): TxPlanStore => ({
  async load(id) {
    const { rows } = await sql.query(
      "select record from tx_plans where id = $1",
      [id],
    );
    return rows[0]
      ? (JSON.parse(rows[0].record) as StoredTxPlanJSON)
      : undefined;
  },
  async save(json, expectedRev) {
    const record = JSON.stringify(json);
    const { rowCount } =
      expectedRev === 0
        ? await sql.query(
            "insert into tx_plans (id, rev, record) values ($1, $2, $3) on conflict (id) do nothing",
            [json.id, json.rev, record],
          )
        : await sql.query(
            "update tx_plans set rev = $2, record = $3 where id = $1 and rev = $4",
            [json.id, json.rev, record, expectedRev],
          );
    return rowCount === 1;
  },
});

const store = sqlPlanStore(pool);
await checkPlanStore(store);
```

**A browser**: web storage. Two tabs on one key are two writers: web storage has no
compare-and-set across tabs, so keep one plan to one tab (the checkout), or use a server store.
Cleared site data loses the records.

```ts
import type { StoredTxPlanJSON, TxPlanStore } from "@meshsdk/transaction";
import { checkPlanStore } from "@meshsdk/transaction";

const webPlanStore = (storage: Storage, prefix = "tx-plan:"): TxPlanStore => ({
  async load(id) {
    const text = storage.getItem(prefix + id);
    return text === null ? undefined : (JSON.parse(text) as StoredTxPlanJSON);
  },
  async save(json, expectedRev) {
    const text = storage.getItem(prefix + json.id);
    const rev = text === null ? 0 : (JSON.parse(text) as StoredTxPlanJSON).rev;
    if (rev !== expectedRev) return false;
    storage.setItem(prefix + json.id, JSON.stringify(json));
    return true;
  },
});

const store = webPlanStore(window.localStorage);
await checkPlanStore(store);
```

**A mobile application**: the platform's asynchronous key-value storage, with the application as
its only writer; saves are run one after another, so that each compares and writes in one step.
On SQLite, the server recipe applies as it is.

```ts
import type { StoredTxPlanJSON, TxPlanStore } from "@meshsdk/transaction";
import { checkPlanStore } from "@meshsdk/transaction";

type KeyValue = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

const keyValuePlanStore = (kv: KeyValue, prefix = "tx-plan:"): TxPlanStore => {
  let last: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(step: () => Promise<T>): Promise<T> => {
    const next = last.then(step, step);
    last = next.catch(() => undefined);
    return next;
  };
  const read = async (id: string) => {
    const text = await kv.getItem(prefix + id);
    return text === null ? undefined : (JSON.parse(text) as StoredTxPlanJSON);
  };
  return {
    load: read,
    save: (json, expectedRev) =>
      oneAtATime(async () => {
        if (((await read(json.id))?.rev ?? 0) !== expectedRev) return false;
        await kv.setItem(prefix + json.id, JSON.stringify(json));
        return true;
      }),
  };
};

const store = keyValuePlanStore(deviceStorage);
await checkPlanStore(store);
```

A plan without a store lives in its object only: the whole lifecycle works, `abandon()` and the
anchor change included, and a crashed process loses it.

### Redeemer functions: a second builder without a store

A redeemer may be a function of the final transaction (an input's index, for example; see
[Scripts](#scripts)). A function cannot be written as data: on a builder with a store,
`builder.plan(parts)` throws `NOT_SERIALIZABLE` at once, before any request. A contract that puts
an index into its redeemer uses a second builder without a store for it: that plan lives in
memory and is lost with the process. There is no `store: false` option.

```ts
import { mConStr0 } from "@meshsdk/core";
import { spend, TxBuilder } from "@meshsdk/transaction";

const recorded = new TxBuilder({ network: "mainnet", provider, store });
const inMemory = new TxBuilder({ network: "mainnet", provider }); // for parts with redeemer functions
const claim = inMemory.plan(
  spend.plutus({
    utxo: locked,
    script,
    redeemer: { data: (tx) => mConStr0([tx.self]) }, // the input's own index
  }),
  { payer: wallet },
);
await claim.send({ waitFor: "included" });
```

## Deadlines and waiting

**Where they are set.**

- **Deadlines**: `ttlMs`, `expiryMarginMs` and `confirmations` (`PlanDeadlines`). The builder's
  default (`planDefaults`) and the plan's options give them. The effective values are worked
  out once, when the plan is made, and all three are always written into its record
  (`deadlines`). They are never read from the builder again: neither `resume` nor a change of
  `planDefaults` changes them.
- **Waiting**: `waitFor`, `timeoutMs`, `pollMs` (`WaitOptions`). They are options of a call of
  `send()` and `advance()`, and are not recorded. `pollMs` also has a builder default: the pace of
  polling depends on the provider's limits. `signal` in the same options aborts the whole call.
- **`resendMs`**: a builder default only; not written into a plan.

| Setting          | Default                                                                                  | What it sets                                                                                                                                                                                                                                                                 | What it costs                                                                                                                                                                                                                                                      | Allowed                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `ttlMs`          | `600_000` (10 min)                                                                       | builder and plan; recorded. The deadline of a new attempt whose parts set no `validity({ until })`: `max(tip time, from) + ttlMs`; also the time left to sign it                                                                                                             | longer: the outcome after a lost answer or another spend of the anchor is known later (`ttlMs + expiryMarginMs`); shorter: the signature does not come in time, `send()` throws `EXPIRED { unsent: true }`, and an explicit `build()` makes a new attempt          | `> 0`; for Plutus, a deadline within the horizon (`INVALID_STATE`, `pastHorizon`) |
| `expiryMarginMs` | `600_000` (10 min)                                                                       | builder and plan; recorded. The margin after an attempt's deadline: `expired` once the tip time is past the deadline plus the margin; `safeAfter`, the change of the payer's anchor and the double check's pause follow it. Not `final`                                      | longer: `expired`, the anchor change and `abandon()` come later; shorter: a rollback deeper than the margin is more likely, and the double check's pause is shorter                                                                                                | `>= 0`; `0` on an emulator                                                        |
| `confirmations`  | `30` (about 10 min on average)                                                           | builder and plan; recorded. The depth of `final`: at least this many blocks on top of the attempt's block. The margin does not change it                                                                                                                                     | more: `final` later, 20 s per block on average, though blocks come unevenly; when the chain stalls, `final` waits for blocks, not for time; fewer: a rollback after `final` is more likely. Needs a provider with block heights, else `CANNOT_OBSERVE` (`noDepth`) | a whole number `>= 0`; `0` on an emulator                                         |
| `waitFor`        | `"sent"`                                                                                 | the call only: how far `send()` waits: the answer to the delivery, a block, or `final`                                                                                                                                                                                       | further: the caller is busy longer; with `"sent"` only the reconciliation sees the block and `final`                                                                                                                                                               | `"sent"`, `"included"`, `"final"`                                                 |
| `timeoutMs`      | `120_000`; for `"final"` `confirmations × 30_000 + 120_000` (`1_020_000`, 17 min, at 30) | the call only: how long `send()` waits for `"included"` or `"final"`, from the answer to the delivery, or from the call's start when it delivers nothing; building and signing do not count. Then `CONFIRM_TIMEOUT { waitedFor, timeoutMs }`, and the status does not change | longer: the caller is busy longer; shorter: `send()` is called again more often                                                                                                                                                                                    | `> 0`                                                                             |
| `pollMs`         | `5_000`                                                                                  | the call, else the builder: the pause between two looks at the search and the tip while waiting                                                                                                                                                                              | shorter: more requests (formula below), up to the provider's limits; longer: inclusion, `final` and `expired` show up to `pollMs` later; with `pollMs` close to `timeoutMs` the call polls once or twice                                                           | `> 0`                                                                             |
| `resendMs`       | `120_000`                                                                                | the builder only: how often the same bytes of the current attempt go again while the plan is `sent` and a call waits; with a store, after reading the record                                                                                                                 | shorter: more submissions and `load`s; longer: a transaction dropped from the mempool comes back later                                                                                                                                                             | `>= pollMs` of the builder                                                        |

**Priority.** Deadlines: the plan's, else `planDefaults`, else the built-in value (`600_000`,
`600_000`, `30`); the result is recorded when the plan is made. `waitFor` and `timeoutMs`: the
call's, else the built-in value. `pollMs`: the call's, else `planDefaults`, else the built-in
value. `resendMs`: `planDefaults`, else the built-in value. For `waitFor: "final"` the built-in
`timeoutMs` is `confirmations × 30_000 + 120_000` with the plan's recorded `confirmations`; a
call's `timeoutMs` is taken as it is.

**Validation.** Every number is finite; `ttlMs > 0`; `expiryMarginMs >= 0`; `confirmations` is a
whole number `>= 0`; `timeoutMs > 0`; `pollMs > 0`; `resendMs >= pollMs` of the builder; `waitFor`
is `"sent"`, `"included"` or `"final"`. The builder's defaults are checked by its constructor, a
plan's deadlines by `builder.plan()`, wait options at the start of `send()` and `advance()`,
before any request; a value out of range is `TxBuildError` `INVALID_OPTION { option, value,
allowed }`. A call polling less often than `resendMs` is fine: bytes go again on a poll, never more
often. The Plutus horizon cannot be checked this way, since it depends on the tip and on `from`:
each attempt's build checks it, and a deadline past it is `INVALID_STATE` (`pastHorizon`), with
nothing built.

**Not configurable:** the double check's pause before `abandon()` and before a change of the
payer's or a child's anchor, inside the call: at least `min(60_000, expiryMarginMs)` of real time;
at most 16 attempts; up to three repeats of a write another writer overtook, then
`VERSION_CONFLICT`. A plan's time is the chain's time: nothing is decided by the local clock.

**Formulas.**

- After a lost answer or another spend of the anchor, a plan waits until the tip time passes
  the attempt's deadline plus `expiryMarginMs`. With the default deadline that is
  `ttlMs + expiryMarginMs` from `max(tip time, from)`: from the build when `from` is not in the
  future (about 20 minutes by default), plus the next block and poll (up to `pollMs`). An anchor
  change and `abandon()` also need the double check, with a pause of at least
  `min(60_000, expiryMarginMs)`.
- `final` shows once `confirmations` blocks have grown on top of the attempt's block:
  `confirmations × 20 s` on average (about 10 minutes by default), give or take minutes, plus the
  poll that sees it (up to `pollMs`).
- Waiting costs about `(live attempts + 1) × 60_000 / pollMs` requests a minute: a search of each
  live attempt and one tip per poll; plus a submission of the current attempt's bytes every
  `resendMs` while the plan is `sent` (with a store, and a `load`). By default, with one attempt:
  24 requests a minute and one submission every 2 minutes. On Blockfrost a found attempt costs two
  requests (36 a minute); with the subclass of [Providers and networks](#providers-and-networks) a
  tip costs two requests and a found attempt three (60 a minute). With a provider that returns
  block heights itself, they come with the tip and the search: depth costs no requests of its own.
- The signing window runs from the build to the attempt's deadline: about `ttlMs`, or up to
  `from + ttlMs` with `from` in the future.
- Plutus: the deadline is not past `max(tip, from)` plus 3k/f slots. The default deadline is
  counted from the same `max(tip time, from)`, so `ttlMs` stays below the horizon itself.
- The default wait for `"final"` is `confirmations × 30_000 + 120_000`: one and a half times the
  average block time, since blocks come unevenly; 17 minutes by default.

**Scenarios.**

| Scenario                                    | What to set                                                                                                                                                                                                                           | Values                                                                                                                                                                                                                                                                                                               | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a dApp, a payment from the browser          | the defaults, `waitFor: "included"` in the call                                                                                                                                                                                       | `send({ waitFor: "included" })`; `timeoutMs: 120_000` (the default)                                                                                                                                                                                                                                                  | the page waits for a block for up to 2 minutes; on `CONFIRM_TIMEOUT` it shows "waiting" and calls `send()` again; after `EXPIRED` it decides itself and calls `build()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| a server handler                            | the default `waitFor` (`"sent"`), a builder with a store, and the reconciliation                                                                                                                                                      | `new TxBuilder({ network, provider, store })`; `send()` in the handler; the reconciliation once a minute and after a restart                                                                                                                                                                                         | the answer right after the delivery; the block and `final` are seen by the reconciliation, which also replaces dead attempts (when it has a signer) and closes plans with the closing mark (`advance()`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| a large sum, or delivery of goods           | the plan's `confirmations` from 180 up to k blocks (2160) and `expiryMarginMs` from 1 h to 12 h: the depth protects `final`, the margin `expired`, the anchor change and `abandon()`; a background task waits with `waitFor: "final"` | `confirmations: 180` … `2160`, `expiryMarginMs: 3_600_000` … `43_200_000`; in the task `send({ waitFor: "final", pollMs: 60_000 })`, the default `timeoutMs` `5_520_000` … `64_920_000`; a builder with a store                                                                                                      | goods go out once that many blocks are on top of the attempt's block: after 1 h … 12 h on average; when the chain stalls, `final` waits for blocks, not time; the background task waits, not the handler; once the plan is `sent`, the task needs neither payer nor signer; with a poll a minute `final` shows up to a minute later, about 2 200 Blockfrost requests in 12 h instead of 26 000; the outcome after a lost answer is known after up to 1 h 10 min … 12 h 10 min                                                                                                                                                                                                                                                                                                                                                                                          |
| a hardware wallet, or slow signing          | `ttlMs` of 20–30 min                                                                                                                                                                                                                  | `ttlMs: 1_200_000` … `1_800_000`                                                                                                                                                                                                                                                                                     | the signature comes in time; the outcome after a lost answer is known after up to 30–40 min; a late signature is `EXPIRED { unsent: true }`, and the application starts a new attempt and a new request to sign (`build()`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| signatures over several days, native script | `ttlMs` in days, a builder with a store                                                                                                                                                                                               | `ttlMs: 3 * 86_400_000`                                                                                                                                                                                                                                                                                              | a signing window of three days; the outcome after a lost answer is known after up to three days and 10 min                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Plutus                                      | `ttlMs` no longer than the horizon: 129 600 slots (36 h) on mainnet and preprod, 25 920 slots (7 h 12 min) on preview                                                                                                                 | `126_000_000` (35 h) on mainnet and preprod, `25_200_000` (7 h) on preview; the limits are `129_600_000` and `25_920_000`. Keep the gap: a node counts the horizon from its own tip, a lagging one may refuse a deadline right at the edge, and a refused attempt holds its anchor until its deadline and the margin | further: `INVALID_STATE` (`pastHorizon`), nothing built; signing that takes longer than the horizon is several attempts in a row, each signed again; a network whose horizon is not known gets no check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| an emulator, and tests                      | nothing is required; for fast tests `expiryMarginMs: 0` and `confirmations: 0`                                                                                                                                                        | `planDefaults: { expiryMarginMs: 0, confirmations: 0 }`; for fast tests also `pollMs: 10, resendMs: 10`                                                                                                                                                                                                              | `expired` right after the deadline, no double check pause (`expiryMarginMs: 0`); `final` right after inclusion (`confirmations: 0`). The emulator's tip is its current slot, and time moves only by `advanceTo`, never by `submitTx`; pauses between polls and `timeoutMs` count real time: a test gets `expired`, `abandon()` and an anchor change by moving the emulator's time. With `confirmations` above 0, `final` comes that many slots after inclusion (`advanceTo`): the emulator makes a block in every slot. With the default margin, `expired` comes after `advanceTo` past the deadline plus 10 min, and `abandon()`, an anchor change and a closing wait for the double check's pause, up to 60 real seconds; the emulator answers the search for a UTxO that appeared without a transaction, so the check passes for an anchor among its starting UTxOs |

**Warnings.**

- A small `expiryMarginMs` declares `expired` and allows an anchor change while a rollback deeper
  than the margin could still bring the attempt back. It also shortens the double check's pause, so
  a lagging instance of a provider behind a load balancer is caught less well. `expiryMarginMs: 0`
  is for emulators and tests only.
- `confirmations` counts blocks for `final` only. The margin stays a time: `expired`, the anchor
  change and `abandon()` follow `expiryMarginMs`. For large sums raise both: the library does not
  tie them. A small `confirmations` risks a rollback after `final`; `confirmations: 0` is for
  emulators and tests only.
- A small `pollMs` runs into the provider's limits: requests a minute as in the formula above, for
  each live attempt and the tip.
- A short `ttlMs`: the user cannot sign in time, and `send()` throws `EXPIRED { unsent: true }`.
  The application starts a new attempt and a new request to sign (`build()`).
- A long `ttlMs`: the outcome after a lost answer takes longer (`ttlMs + expiryMarginMs`); the
  plan cannot be closed before the deadline and the margin, and a new one in its place right away
  only by the exceptions below.
- A change of `planDefaults` does not touch recorded plans: their deadlines are in the record.
  The margin of an unfinished plan cannot be raised.
- A provider's lagging tip does not stop attempts: the deadline is counted from it, and a body may
  expire before it is signed. `REJECTED` and `EXPIRED` say so in `details.tipAgeMs`, the age of the
  last tip read, by the local clock.

```ts
import { MeshWallet } from "@meshsdk/core";
import { TxBuilder } from "@meshsdk/transaction";

// The builder's defaults, a plan's deadlines, a call's waiting
const builder = new TxBuilder({
  network: "mainnet",
  provider,
  store,
  planDefaults: { pollMs: 10_000, resendMs: 180_000 }, // a poll every 10 s, the same bytes every 3 min; not written into plans
});
const treasury = new MeshWallet({
  networkId: 1,
  key: { type: "mnemonic", words },
}); // the server's key: pays and signs
const payout = builder.plan(parts, {
  id: "payout-42",
  payer: treasury,
  expiryMarginMs: 3_600_000, // this plan only: a margin of 1 h before expired, an anchor change and abandon()
  confirmations: 180, // final once 180 blocks are on top of the attempt's block; 30 by default
});
// recorded: ttlMs 600_000 (built in), expiryMarginMs 3_600_000, confirmations 180, the effective numbers; never read from the builder again
await payout.send(); // the handler: waitFor "sent", returns after the delivery
// the background task that delivers the goods, also after a restart: the plan is "sent", it needs neither payer nor signer
const resumed = await builder.resume("payout-42");
await resumed.send({ waitFor: "final", pollMs: 60_000 }); // timeoutMs = 180 × 30_000 + 120_000; the same bytes every 180_000
// builder.plan(parts, { id: "payout-42", payer: treasury, expiryMarginMs: 600_000 }): the first await throws PLAN_EXISTS, the record holds 3_600_000
// new TxBuilder({ network: "mainnet", provider, planDefaults: { pollMs: 0 } }): TxBuildError INVALID_OPTION, pollMs
```

## New plan instead of an old one

A plan's parts are fixed, so new content is a new plan. With a store it has an `id` of its
own: the same `id` with other parts is `PLAN_EXISTS`. While a plan's `id` is the key of the
order, the library will not make a second plan for the same order. The application gives the
new plan a new `id` (for example `${orderId}:2`) and keeps which plan the order has now; it
records the new `id` with the order before making the plan, or derives it from the number of the
replacement: a plan whose `id` the application does not know cannot be closed by the rule. A new
attempt of the same plan is safe: it spends the same anchor. A new plan has an anchor of its
own, so there is one rule:

**first `await old.abandon()`; the new plan when the old one is `abandoned`.**

`abandon()` either closes the old plan in the same call, or throws `STILL_LIVE` or
`CANNOT_OBSERVE` (`unconfirmed`): the decision is recorded, nobody goes on with the old plan, and
the reconciliation closes it. A plan without live attempts, also one whose script failed
(`failed`, `old.live` empty), is closed in the same call. `ATTEMPT_ON_CHAIN` from `abandon()`, or
`final` of the old plan, means it paid: no new plan is started.

Two exceptions: the new plan is made right after `abandon()`, without waiting for `abandoned`,
when

1. **the only signature was declined:** `sign()` threw `SIGN_DECLINED`, the body has no signature
   (status `built`), there is one signer, the body was given to nobody else, neither another
   signer nor the network, and it alone is in `old.live`. Without a signature the body cannot land.
   With several signers a body with one signature stays live until its deadline: the others may
   still sign it;
2. **a common input:** the new plan spends an input that every attempt of the old one spends, and
   that input is named in the parts of both: in the old one as the input of a `spend` part or an
   anchor from the parts (the vault UTxO of "Signatures over several days"), in the new one as the
   input of a `spend` part. Only one of the two transactions can land. An input that coin
   selection alone gave the new plan does not count: its next attempt may not take it. A
   reference input and collateral do not count: a landed attempt does not spend them, and both
   could land.

A plan with a long deadline (signatures over days) is prepared for replacement when it is made:
its parts get an explicit input of the payer, `spend.pubKey({ utxo })` with a UTxO from
`builder.readPayer(payer)`. A new plan with the same part is then made right after `abandon()` of
the old one, by the exception "common input", not after the deadline and the margin. The cost: if
another transaction spends that input, there is no replacement attempt (`INPUTS_SPENT`).

In every other case wait for `abandoned`. `REJECTED`, `EXPIRED`, `ORPHANED`, `INPUTS_SPENT` and
`STILL_LIVE` are not exceptions: while `old.live` is not empty, a new plan may pay a second time.
Order matters in the exceptions too: without the closing mark the reconciliation may still go on
with the old plan. A preview before confirmation is `builder.build(parts)` without a plan; the
plan is made on confirmation.

The rule and the exceptions are checked against every earlier plan of the order that is not
`abandoned` yet, not only against the last one. A plan replaced by the exception "common input"
may land while it is not `abandoned`: every later plan of the order either names the same common
input in its parts or waits for its `abandoned`. Exception 1, the additional cases and `abandoned`
of the last plan speak of the last one only. If an earlier plan landed (`ATTEMPT_ON_CHAIN`,
`included` or `final`), the order is paid by it: no new plan is started, and one already made to
replace it is closed with `abandon()` once the earlier one is `final` (until then a rollback could
still give the payment to the replacement).

```ts
import type { PartsInput, Payer, TxPlan } from "@meshsdk/transaction";
import { TxError } from "@meshsdk/transaction";

// A new plan in place of an old one (a builder with a store). Repeat the call until it returns
// the new plan, or until the old one is final: then it paid, and there is no new one.
// If the order was replaced before by the exception "common input" and that plan is not
// abandoned yet, newParts name the same input, or its abandoned is awaited first.
async function replacePlan(
  oldId: string,
  oldParts: PartsInput,
  newId: string,
  newParts: PartsInput,
  payer: Payer,
): Promise<TxPlan | undefined> {
  const old = await builder.resume(oldId).catch((error) => {
    if (!TxError.is(error, "PLAN_NOT_FOUND") || error.planId !== oldId)
      throw error; // a parent's record is missing: another case
    return builder.plan(oldParts, { id: oldId }); // no record yet: abandon() below closes the draft and takes the id
  });
  try {
    await old.abandon(); // the decision to close is recorded before STILL_LIVE and before the check's pause; a closed plan returns at once
  } catch (error) {
    if (!TxError.is(error, "STILL_LIVE", "ATTEMPT_ON_CHAIN")) throw error; // ATTEMPT_ON_CHAIN: the old one paid
  }
  if (old.status !== "abandoned") return undefined; // the old one paid or still may: no new one; the reconciliation brings it to abandoned
  return builder.plan(newParts, { id: newId, payer }); // a repeat with the same newId and parts is the same plan
}
```

When `resume(oldId)` throws `PLAN_NOT_FOUND` for `oldId` itself, the old plan has no record yet:
it has no first attempt, but another instance may be building one now, and a late repeat of the
handler may build one later. No new plan is made on that answer: the old one is made again with
its parts and closed by the same `abandon()`, which writes `abandoned` as its first record and so
takes the `id`. A late first build then gets `VERSION_CONFLICT` or `INVALID_STATE` (`terminal`) and
hands nothing out. Do this only when every plan with that `id` is made by a builder with this
same store, and records are never deleted from it: only then does "no record" mean "no first
attempt". A plan without a store, or of another store, is closed on its own object. If a record
may have been lost (cleared web storage, deleted old records), do not write `abandoned` as a first
record, and do not make a new plan. `PLAN_NOT_FOUND` about another `id` (the parent of a child)
is not this case: the example passes it on.

In the exceptions and the additional cases the steps are the same, but the new plan is made right
after `abandon()`, without waiting for `abandoned`. The application checks the condition with its
own code after `abandon()`, on the same object: the closing mark is written over the fresh record,
and after it nobody records a signature or a delivery (for exception 1: `old.status === "built"`,
and this attempt alone in `old.live`); of the condition the library sees only `old.status` and
`old.live`. Exception 1 in code is the example of
[Refusal to sign; edits on a preview](#refusal-to-sign-edits-on-a-preview).

## Additional cases

They are needed less often and ask more of the application. The order is the same: `abandon()` of
the old plan first. The new plan is made at once when:

- **an input was spent by a transaction the application knows.** The input of a `spend` part, or
  an anchor from the parts, of the old plan was spent by a transaction that is in the
  `plan.attempts` of the fresh record of neither this plan nor the earlier plans of the same
  order, `abandoned` ones included (their hashes stay in the record; an attempt of an earlier
  plan means the order is paid by it), and whose hash the application knows (its own indexer, an
  explorer). Every attempt of the old plan spends that input, so none landed, and none will
  unless that transaction is rolled back (strictly: after its `final`; the application checks the
  depth). `INPUTS_SPENT` does not prove this: the library sees only that the input is gone and the
  attempt was not found, and a lagging provider might not show a landed one. The fresh record is
  `await builder.resume(id)` after the application saw the spend (without a store: the object
  itself): an attempt is recorded before it is handed out, and a stale object may not know an
  attempt of another instance. Compare the hash with the `txHash` of every attempt;
  `reportedHash` is a note only. A reference input and collateral do not count: a landed attempt
  does not spend them, and it could have landed earlier.

A child whose attempts are `orphaned` is not an additional case: it follows the main rule. It has
no live attempts, `abandon()` closes it in the same call, and the closing check asks again about
the parent's attempt.

## The path without a lifecycle

`builder.build()`, the free signing functions, the provider's `submitTx` and
`awaitTransactionConfirmation()` from `@meshsdk/common`: no deadline and no anchor. **Do not
rebuild to retry**: a new build may choose other inputs, and both transactions may land; a retry
sends the same bytes. Only these go this way: a build without a provider, a build without
balancing (`assembleTxPrototype`, `finalize`), and a body a plan did not build. A body that went
to a signer or to the network is not turned into a plan: a plan with the same parts is
another transaction. `validity({ until })` gives such a body a deadline of its own. There are no
statuses on this path. `awaitTransactionConfirmation()` returns at the first block and sees neither
depth nor rollbacks, nor whether a script failed (read `validContract` from the provider's
`fetchTxInfo`); its timeout (`TxConfirmTimeoutError`) and a refusal of `submitTx` do not mean "not
paid": the application concludes that itself, not before the body's `until` and a margin for
rollbacks. An aborted `signal` rejects it with `signal.reason`.

### Offline, and a deterministic build

```ts
import { output, spend, TxBuilder, validity } from "@meshsdk/transaction";

const offline = new TxBuilder({ network: "preprod", params, costModels }); // neither provider nor wallet
const built = await offline.build(
  [
    spend.pubKey({ utxo: { txHash: depositHash, outputIndex: 0 } }),
    output({ address: recipient, value: { lovelace: 3_000_000n } }),
    validity({ until: expiresAt }), // build() sets no deadline; with its own until the outcome is clear: past it and a margin for rollbacks the body cannot land
  ],
  { payer: { changeAddress, utxos }, knownUtxos: [depositUtxo] }, // nothing is read
);
const unsignedCbor = built.tx; // the same arguments give the same bytes; it goes to a cold signer
// a cold signer of a build with a provider is an ordinary plan: build(), addWitnesses(), send()
// later, online, with the signed bytes, on the path without a lifecycle (a plan is made only from parts):
// await provider.submitTx(signedCbor); // a lost answer: the same bytes again; never rebuild
// await awaitTransactionConfirmation(provider, built.txHash); // the first block; a timeout is not "not paid"
```

With a payer given as a snapshot, explicit `params` and `costModels` (for example
`...await builder.chain()` saved earlier) and the local evaluator, a build makes no request but the
lookups its parts ask for, and the same arguments give the same bytes and `txHash`.

### Signing functions

| Function                                      |                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `await signWitnesses(signer, tx, keyHashes?)` | the signer's witness set: `signTxWitnesses(tx, keyHashes)` when it has it, else `signTx`. The answer is returned whole, not filtered by `keyHashes`: a wallet that signs with an extra key gives an extra witness, which can put the fee below the minimum (a plan drops it) |
| `await addWitnesses(tx, ...witnessSets)`      | `tx` with the vkey and bootstrap witnesses of each witness set or full transaction added; only the witness set changes. `INVALID_WITNESS` with `details.argument`, counted from 0; an empty string is `undecodable`                                                          |
| `await signedKeyHashes(tx)`                   | the key hashes whose witness in `tx` verifies against its body                                                                                                                                                                                                               |
| `requiredSigners(tx, spent)`                  | who must sign a transaction built elsewhere, given the UTxO of every input and collateral input (`UTXO_NOT_FOUND` for a missing one), and of reference inputs for the native scripts they hold                                                                               |

`addWitnesses` and `signedKeyHashes` return promises. Bad arguments (a `tx` that is not a
transaction, a signer that cannot sign, a malformed `spent`) are `TxBuildError` `INVALID_OPTION`;
`SIGN_DECLINED`, `SIGNER_FAILED` and `INVALID_WITNESS` are `TxPlanError`: catch them with
`TxError.is`.

```ts
import {
  addWitnesses,
  signedKeyHashes,
  signWitnesses,
} from "@meshsdk/transaction";

const built = await builder.build(parts, { payer: wallet });
const witnessSet = await signWitnesses(
  wallet,
  built.tx,
  built.signers.keyHashes,
);
const signed = await addWitnesses(built.tx, witnessSet);
const signedBy = await signedKeyHashes(signed);
const txHash = await provider.submitTx(signed); // a lost answer: submitTx(signed) again, never a new build
```

### Assembling without balancing

`assembleTxPrototype(parts, { fee, costModels })` is the step `build` ends with: it puts complete
parts together into a `TransactionPrototype` (ordering, redeemer indices, reference inputs, witness
scripts and datums, collateral return, hashes) and nothing else. `builder.finalize(prototype, {
inputs, changeAddress? })` completes it: it recomputes the script data and auxiliary data hashes,
prices it for its signers, and, given `changeAddress`, takes a fee increase from the last output at
that address that keeps its minimum; without one, a fee below the minimum is `FEE_TOO_LOW { fee,
minFee }`.

```ts
import {
  addWitnesses,
  assembleTxPrototype,
  message,
  output,
  signWitnesses,
  spend,
} from "@meshsdk/transaction";

const fee = 200_000n;
const held = BigInt(
  input.output.amount.find((a) => a.unit === "lovelace")!.quantity,
);
const { prototype } = assembleTxPrototype(
  [
    spend.pubKey({ utxo: input }),
    output({ address: recipient, value: { lovelace: 5_000_000n } }),
    output({
      address: changeAddress,
      value: { lovelace: held - 5_000_000n - fee },
    }),
    message({ text: "balanced by hand" }),
  ],
  { fee }, // ordering and the auxiliary data hash done; the balance is not checked
);
const final = await builder.finalize(prototype, { inputs: [input] }); // hashes again, checks the fee against the signed size
const witnessSet = await signWitnesses(wallet, final.tx);
const txHash = await provider.submitTx(
  await addWitnesses(final.tx, witnessSet),
);
```

`finalize` looks nothing up: `inputs` holds the UTxO of every input, reference input and collateral
input of the body (`UTXO_NOT_FOUND` for a missing one). Scripts are not run again: redeemers keep
the units the prototype states, so after an edit a script can see, build again from parts.
Collateral is not changed: a raised fee that it no longer covers is `INSUFFICIENT_COLLATERAL`, until
the caller raises `total_collateral` and lowers the collateral return. Key witnesses of the
prototype are dropped: the result is unsigned. The result has no parts: `parts` and
`selectedInputs` are empty, redeemers carry no `part`, outputs no `label`, and `change` holds every
output at `changeAddress`, a payment to that address included.

### Editing a built transaction

The usual edit is a new build with one more part, `builder.build([parts, validity({ until:
Date.now() + 3_600_000 })], { payer })`: the builder keeps nothing of the first build. A built
prototype can also be edited and completed with `finalize`:

```ts
import { output } from "@meshsdk/transaction";

const built = await builder.build(
  output({ address: recipient, value: { lovelace: 5_000_000n } }),
  { payer: wallet },
);
console.log(
  built.fee,
  built.selectedInputs,
  built.change,
  built.collateral,
  built.signers,
);
const edited = structuredClone(built.prototype);
edited.body.ttl = String(builder.slotAt(Date.now() + 3_600_000));
const final = await builder.finalize(edited, {
  inputs: [
    ...built.inputs,
    ...built.referenceInputs,
    ...(built.collateral?.inputs ?? []),
  ],
  changeAddress: built.change[0]!.output.address,
});
// final goes to signing and submitTx on this path: it is a body a plan did not build
```

## Parts

| Part             | Builder                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Spend an output  | `spend.pubKey`, `spend.native`, `spend.plutus`                                                                                                |
| Read an output   | `referenceInput`                                                                                                                              |
| Pay              | `output`                                                                                                                                      |
| Collateral       | `collateral`, `collateralReturn`                                                                                                              |
| Mint or burn     | `mint.native`, `mint.plutus`                                                                                                                  |
| Withdraw rewards | `withdrawal.pubKey`, `withdrawal.native`, `withdrawal.plutus`                                                                                 |
| Certificates     | `certificate.stakeRegistration`, `.stakeDeregistration`, `.stakeDelegation`, `.voteDelegation`, `.drepRegistration`, `.poolRegistration`, ... |
| Governance       | `vote`, `proposal.info`, `proposal.treasuryWithdrawals`, `proposal.parameterChange`, ...                                                      |
| Everything else  | `guard.pubKey`, `validity`, `metadata`, `message`, `auxiliaryScript`, `donation`, `treasuryValue`, `networkId`                                |

Parts are immutable and their order does not matter, except for certificates, proposals and
outputs, which keep it. Outputs given by out ref alone (`{ txHash, outputIndex }`) are looked up;
passing the full `UTxO` spares the lookup. Addresses are taken in bech32, base58 (Byron) or hex.
Every part takes an optional `label`, echoed in errors about it. A part builder throws
`TxPartError` at the call that made the part.

- `guard.pubKey({ keyHash } | { address })` is Conway's required signer (body key 14): the key
  must sign, and scripts see it among the signatories. An address gives its payment key; a stake
  key is named by `keyHash`. A guard whose hash is one of the transaction's script hashes is
  `INVALID_GUARD`. `message({ text })` is a CIP-20 message (metadata label 674).
- Certificates: a stake credential is registered and deregistered with its deposit stated,
  `certificate.stakeRegistration` and `certificate.stakeDeregistration` (certificates 7 and 8);
  such a registration needs the credential's witness. `certificate.legacyStakeRegistration` and
  `certificate.legacyStakeDeregistration` (certificates 0 and 1) are `@deprecated`: they work only
  until the next ledger era.
- `minCoin(output(...), params)` is the least lovelace of an output,
  `minFee(prototype, { params, vkeyWitnesses, inputs? })` the minimum fee of a prototype once
  signed; both are pure functions.

## Scripts

```ts
import { mConStr0 } from "@meshsdk/core";
import { mint, spend } from "@meshsdk/transaction";

const built = await builder.build(
  [
    // A script output, unlocked with a script held in a reference output
    spend.plutus({
      utxo: { txHash, outputIndex: 0 },
      script: { reference: { txHash: refTxHash, outputIndex: 0 } },
      redeemer: { data: mConStr0([]) },
      label: "unlock",
    }),
    mint.plutus({
      script: { code: policyCode, version: "V3" },
      redeemer: { data: mConStr0([]) },
      assets: { [assetNameHex]: 1n },
    }),
  ],
  { payer: wallet },
);

built.redeemers; // [{ tag: "SPEND", index, exUnits, data, label: "unlock", part }, { tag: "MINT", ... }]
```

- Redeemers given without `exUnits` are evaluated with the builder's evaluator, and the transaction
  is balanced again with the evaluated units until they settle. Units given on a redeemer are
  checked by the evaluator (`EXUNITS_TOO_LOW` when they are short); after `evaluator: null` they
  are taken as given. A Plutus build whose redeemers have no units yet is balanced first with an
  upper estimate of the fee, so a payer short by less than that estimate can get
  `INSUFFICIENT_FUNDS`; stating the units avoids it.
- Script `code` is taken flat or in one or two CBOR wrappings (a blueprint's `compiledCode` as it
  is), and `builder.scriptAddress(script)` gives the same address the parts check against.
- Redeemer indices are assigned once, from where each item ends up in the ledger's order: sorted
  inputs, policies, reward accounts and voters; certificates and proposals as given.
- A redeemer's data may be a function of the final transaction:
  `redeemer: { data: (tx) => mConStr0([tx.self, tx.output("payout")]) }`, where `tx.self` is the
  item's own index and `tx.input(utxo)`, `tx.referenceInput(utxo)`, `tx.output(label)` give other
  positions. It runs in every balancing round and must depend on nothing but its argument; what it
  throws is `INVALID_REDEEMER`. A function cannot be recorded: see
  [Redeemer functions](#redeemer-functions-a-second-builder-without-a-store).
- Collateral is picked from the payer's UTxOs (or the `collateral` parts given), with what exceeds
  `collateralPercent` of the fee returned to the payer's change address (or the `collateralReturn`
  part's address). Every Plutus transaction carries collateral inputs.
- The datum of a spent script output is worked out from the output: inline, none (Plutus V3), or
  pass `datum: { data }` for an output holding a datum hash.
- An attached script that an input or reference input already holds as its reference script is
  left out of the witness set.

## Staking and governance

```ts
import {
  certificate,
  proposal,
  TxBuilder,
  vote,
  withdrawal,
} from "@meshsdk/transaction";

const builder = new TxBuilder({
  network: "preprod",
  provider,
  // Not part of Mesh's Protocol type: give them to take governance deposits from them
  deposits: { drepDeposit: 500_000_000n, govActionDeposit: 100_000_000_000n },
});

const plan = builder.plan(
  [
    certificate.stakeRegistration({ stake: rewardAddress }), // keyDeposit; the stake key signs
    certificate.voteDelegation({ stake: rewardAddress, drep: "alwaysAbstain" }),
    withdrawal.pubKey({ rewardAddress: otherAccount, amount: "all" }), // the balance is looked up
    proposal.info({ rewardAccount: rewardAddress, anchor }), // govActionDeposit
    vote({
      voter: { drep: drepId }, // the DRep key signs: a MeshWallet, or a browser wallet connected with CIP-95
      votes: [{ action: { txHash: actionTx, index: 0 }, vote: "yes" }],
    }),
  ],
  { payer: wallet },
);
await plan.send({ waitFor: "included" });
```

Deposits and refunds are counted in the balance. A pool registration takes `poolDeposit` unless
its operator is listed in `registeredPools`, which marks it as an update. A `MeshWallet` of this
release signs with each of its payment, stake and DRep keys the transaction needs.

## Time

`validity({ from, until })` takes POSIX milliseconds, as a `number`, a `bigint` (a deadline read
from a datum) or a `Date`; `invalidBefore` and `invalidHereafter` take slots. Times are converted
to slots when the transaction is built, on the builder's network, so that the interval a script
sees lies within `[from, until]`: `from` becomes the first slot starting at or after it, `until`
the slot containing it. A script that needs its lower bound strictly after a deadline gets
`from: deadline + 1` (`deadline + 1n` for a bigint). For "valid from now" leave `from` out:
`from: Date.now()` is valid from the next slot only, and nodes check the lower bound against their
own, lagging, tip; a lower bound in the future by the local clock is the warning
`VALID_FROM_FUTURE`, and a plan's `send()` before it throws `NOT_YET_VALID { waitMs }`
(retryable after `retryAfterMs`) and sends nothing: wait and call it again, as in
[Vesting](#vesting). A time
that is not a whole number of ms from 0 to 2^53 − 1 is `INVALID_DATA` at the part call; one before
the network's slot clock starts, or an interval that holds no slot once converted, is
`INVALID_DATA` from the build. `build()` sets no `until`; a plan sets
`until = max(tip time, from) + ttlMs` when its parts set none. `builder.slotAt(time)` and
`builder.timeAt(slot)` convert on the builder's network.

## The result

```ts
const built = await builder.build(pay, { payer: wallet });
const {
  tx, // the unsigned transaction, CBOR hex
  txHash,
  prototype, // the TransactionPrototype tx was serialized from, in the current era's format
  fee,
  exUnits, // total { mem, steps }, as bigint
  redeemers, // per redeemer: tag, index, exUnits, data (CBOR hex), label, and part (absent after finalize)
  inputs, // every input spent, resolved, in transaction order
  selectedInputs, // inputs added to pay for the transaction
  referenceInputs, // the reference inputs, resolved
  outputs, // every output as a UTxO of txHash, with its part's label
  change, // the change outputs, also in outputs
  collateral, // { inputs, total, return? } when a Plutus script runs
  signers, // { keyHashes, keys (with the parts and roles that need them), byronAddresses, nativeScripts }
  validity, // { invalidBefore, invalidHereafter, from, until }: slots and the ms they start at
  network, // { name, networkId }
  warnings, // VALID_FROM_FUTURE, COLLATERAL_FORFEITED, FEE_ABOVE_MINIMUM
  parts, // every part, resolved, those added by balancing included
} = built;
```

`outputOf(built, label)` is the output made by the output part with that label, as a UTxO
(`UNKNOWN_LABEL { label, labels }` when none has it). `builder.serialize(prototype)` serializes a
prototype as the build does.

## Builder options

| `new TxBuilder({...})` |                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`              | required: `"mainnet"`, `"preprod"`, `"preview"` or a `NetworkConfig` (a devnet: `customNetwork(...)`). Every address, UTxO, wallet and provider is checked against it (`NETWORK_MISMATCH`), and time bounds are converted with its slot clock                       |
| `provider`             | every read: outputs by out ref, reward balances, protocol parameters, cost models, the payer's UTxOs; for plans also the chain's tip and the search for a transaction. Reads go through the `CachedFetcher` shared by everything that uses the same provider object |
| `submitter`            | submits in place of the provider: after the call's `submitter`, before the provider                                                                                                                                                                                 |
| `evaluator`            | works out execution units; by default a local `OfflineEvaluatorScalus` made for this builder. `null` turns evaluation off: every redeemer then needs its units, taken unchecked. `evaluator: provider` evaluates with the provider (`evaluateTx`) instead           |
| `serializer`           | an `IMeshTxSerializer` with `serializeTxPrototype`; the `@meshsdk/core-cst` encoder by default                                                                                                                                                                      |
| `params`               | protocol parameters, a whole `Protocol`, used instead of reading them from the provider. With neither `params` nor a provider the constructor throws `MISSING_PARAMETER`. There are no built-in values                                                              |
| `costModels`           | cost models by Plutus language number, V1 first, used instead of reading them from the provider. With neither, a build that runs a Plutus script throws `MISSING_PARAMETER { parameter: "costModels" }`, and so does one whose models lack the language it runs     |
| `deposits`             | `drepDeposit`, `govActionDeposit`: not part of Mesh's `Protocol`; give them to take governance deposits from them                                                                                                                                                   |
| `planDefaults`         | `ttlMs`, `expiryMarginMs`, `confirmations` (copied into each plan when it is made), `pollMs`, `resendMs`: see [Deadlines and waiting](#deadlines-and-waiting)                                                                                                       |
| `store`                | a `TxPlanStore`: every plan of the builder is recorded and can be resumed by its `id`; see [Storage](#storage)                                                                                                                                                      |

On a custom network whose parameters change between epochs, give the builder a provider wrapped
as `new CachedFetcher(provider, { network: "testnet" })`: the shared cache then keeps parameters
for no time, where on a known network it keeps them until the epoch ends.

## Build options

| `builder.build(parts, {...})` |                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payer`                       | who pays and gets the change: a wallet, an address or a snapshot; without it `MISSING_PAYER`                                                                                                                                                |
| `canSelect`                   | which of the payer's UTxOs may be selected for payment and collateral; UTxOs the parts read and script-locked UTxOs are never selected                                                                                                      |
| `coinSelection`               | a `SelectInputs` function that replaces the built-in selection of this build (each token from its largest holders, then lovelace); every UTxO it returns must be a candidate (`INVALID_SELECTION`); the change stays with the built-in rule |
| `sendAllTo`                   | spend every selectable UTxO and send what is left to this address                                                                                                                                                                           |
| `after`                       | `BuiltTx` or `TxPlan` (its current attempt), or a list: transactions not yet seen by the provider. Their inputs are not selected, their change at this build's change address is, their outputs can be named by out ref without a lookup    |
| `knownUtxos`                  | outputs the parts may name by out ref that the provider may not know yet, handed to every evaluator; listing one makes it neither selectable nor unselectable (a payer UTxO listed here may still be selected)                              |
| `fee`                         | goes into the body as given; `FEE_TOO_LOW { fee, minFee }` when the final transaction's minimum fee is higher; `FEE_ABOVE_MINIMUM` warns when it is above                                                                                   |
| `registeredPools`             | operator key hashes of pools already registered                                                                                                                                                                                             |
| `extraKeyWitnesses`           | key witnesses expected beyond those the parts call for                                                                                                                                                                                      |
| `signal`                      | aborts the build with `ABORTED`                                                                                                                                                                                                             |
| `trace`                       | receives the steps of the build (`payer`, `fetched`, `round`, `evaluated`), for diagnostics; what it throws is ignored                                                                                                                      |

A plan takes the same options, without `signal`, with `after` given as parent plans and with
`id` and the three deadlines; `resume` takes `payer`, `after`, `canSelect`, `coinSelection` and
`trace` again.

## Errors

Every error of the package is a `TxError`: `TxPartError` from a part builder, at the call that made
the part; `TxBuildError` when parts cannot be built into a transaction, and for a bad option or
argument; `TxPlanError` from signing, submitting, waiting and the store. One check covers the
whole tree, also errors of another copy of the package, and narrows `details` by code:

```ts
import { TxError, TxPlanError } from "@meshsdk/transaction";

try {
  await plan.send({ waitFor: "included" });
} catch (error) {
  if (TxError.is(error, "INSUFFICIENT_FUNDS")) {
    const { unit, missing } = error.details; // typed by the code
  } else if (TxError.is(error, "SUBMIT_FAILED", "CONFIRM_TIMEOUT")) {
    // retryable: the same call again, no earlier than error.retryAfterMs when it is set
  } else if (TxPlanError.is(error)) {
    log(error.code, error.planId, error.status, error.message); // error.plan is not enumerable: a logger does not serialize it
  } else throw error;
}
```

Every error has `code`, `message`, and where they apply `part`, `label`, `details` and `cause` (the
error it was raised from, such as the provider's `ProviderError` or the wallet's error).
`retryable: true` means only: the same call, repeated no earlier than `retryAfterMs`, is safe and
may pass. A `TxPlanError` also carries `planId`, `status` (when thrown), `txHash` (the attempt
it is about) and `plan` (the object as it is now). `TxPartError.is` is `TxError.is`: tell a part
error by its code. The builder throws no `RangeError`: a bad option or argument is
`INVALID_OPTION`, a missing label `UNKNOWN_LABEL`; an aborted `signal` is `ABORTED` in every call of
the builder and of a plan.
With `MISSING_SIGNATURES`, `MISSING_SUBMITTER`, `NOT_YET_VALID` and `INPUTS_SPENT` nothing went to
the network. No code means "the payment did not go through": only the status `abandoned` does, as
every `TxPlanError` message says.

| Code                       | Class          | When                                                                                                                                                                                            | `details`                                                                                                  | Retryable                                                   |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `INVALID_OUT_REF`          | `TxPartError`  | an out ref that cannot exist: a bad hash or index                                                                                                                                               | none                                                                                                       | no                                                          |
| `INVALID_ADDRESS`          | `TxPartError`  | an address that does not parse, or of the wrong kind for the part                                                                                                                               | none                                                                                                       | no                                                          |
| `INVALID_VALUE`            | `TxPartError`  | malformed lovelace or asset quantities, units or policies                                                                                                                                       | none                                                                                                       | no                                                          |
| `INVALID_SCRIPT`           | `TxPartError`  | a script that does not parse, or a reference output holding no suitable script                                                                                                                  | none                                                                                                       | no                                                          |
| `INVALID_DATA`             | `TxPartError`  | Plutus data or a hash that does not parse, a validity time out of range; from the build, a validity bound before the slot clock starts or an interval with no slot                              | none                                                                                                       | no                                                          |
| `WITNESS_MISMATCH`         | `TxPartError`  | a witness that cannot authorise its output or credential (a key spend of a script output; in the old `MeshTxBuilder`, a Plutus part without a redeemer)                                         | none                                                                                                       | no                                                          |
| `DATUM_MISMATCH`           | `TxPartError`  | a datum choice that does not fit the output spent                                                                                                                                               | none                                                                                                       | no                                                          |
| `UNRESOLVED`               | `TxBuildError` | a part still leaves something open that nothing filled in                                                                                                                                       | `PartGaps[]`: each part's kind, label and gaps                                                             | no                                                          |
| `DUPLICATE_PART`           | `TxBuildError` | the same input, policy, reward account, voter or collateral input twice; a kind held once given twice; a reference input the transaction spends                                                 | `{ item }`                                                                                                 | no                                                          |
| `INVALID_COLLATERAL`       | `TxBuildError` | collateral inputs that cannot cover the total collateral                                                                                                                                        | none                                                                                                       | no                                                          |
| `MISSING_FETCHER`          | `TxBuildError` | something has to be read, and the builder has no provider                                                                                                                                       | none                                                                                                       | no                                                          |
| `UTXO_NOT_FOUND`           | `TxBuildError` | an output the transaction names does not exist, could not be read (the provider's error is the `cause`), or is spent by a transaction of `after`                                                | `{ input }`                                                                                                | no                                                          |
| `MISSING_PARAMETER`        | `TxBuildError` | protocol parameters, cost models or a deposit are not known, or could not be read (the `cause`)                                                                                                 | `{ parameter: "params" \| "costModels" \| "deposits" }`                                                    | no                                                          |
| `MISSING_EVALUATOR`        | `TxBuildError` | execution units have to be worked out, and there is no evaluator                                                                                                                                | none                                                                                                       | no                                                          |
| `EVALUATION_FAILED`        | `TxBuildError` | a script failed, or the evaluator did not price every redeemer; `part` and `label` of a single failure                                                                                          | `{ tx, failures }`                                                                                         | no                                                          |
| `EXUNITS_TOO_LOW`          | `TxBuildError` | a script needs more execution units than its redeemer states                                                                                                                                    | `{ needed, given }`                                                                                        | no                                                          |
| `EXUNITS_EXCEEDED`         | `TxBuildError` | the scripts need more execution units than a transaction may use                                                                                                                                | `{ mem, steps }`                                                                                           | no                                                          |
| `EVALUATION_NOT_CONVERGED` | `TxBuildError` | execution units did not settle within the evaluation rounds                                                                                                                                     | none                                                                                                       | no                                                          |
| `INSUFFICIENT_FUNDS`       | `TxBuildError` | the payer's UTxOs cannot pay                                                                                                                                                                    | `{ unit, missing, required, available, reason, feeEstimate?, changeMinimum?, pool }`                       | no                                                          |
| `INSUFFICIENT_COLLATERAL`  | `TxBuildError` | no collateral, or not enough, can be put up; also a wallet's `getCollateral` that failed (the `cause`)                                                                                          | `{ required, available }`                                                                                  | no                                                          |
| `OUTPUT_BELOW_MIN_COIN`    | `TxBuildError` | an output holds less lovelace than the ledger requires                                                                                                                                          | `{ coin, minCoin }`                                                                                        | no                                                          |
| `VALUE_TOO_LARGE`          | `TxBuildError` | an output's value is larger than `maxValSize`                                                                                                                                                   | `{ size, maxValSize }`                                                                                     | no                                                          |
| `TX_TOO_LARGE`             | `TxBuildError` | the transaction is larger than `maxTxSize`                                                                                                                                                      | `{ size, maxTxSize }`                                                                                      | no                                                          |
| `FEE_TOO_LOW`              | `TxBuildError` | the `fee` given is below the final transaction's minimum fee                                                                                                                                    | `{ fee, minFee }`                                                                                          | no                                                          |
| `FEE_NOT_CONVERGED`        | `TxBuildError` | balancing did not settle on a fee within its rounds                                                                                                                                             | none                                                                                                       | no                                                          |
| `UNSUPPORTED_SERIALIZER`   | `TxBuildError` | the serializer cannot serialize a `TransactionPrototype`, throws, or answers with something that is not a transaction                                                                           | none                                                                                                       | no                                                          |
| `NETWORK_MISMATCH`         | `TxBuildError` | an address, UTxO, wallet, provider or plan record of another network than the builder's                                                                                                         | `{ expected, found }`; `found[].role`: `payer`, `wallet`, `provider`, `utxo`, `output`, `record`, ...      | no                                                          |
| `MISSING_PAYER`            | `TxBuildError` | a build without a payer; a new attempt of a plan whose object has no payer, or only the snapshot an earlier attempt used                                                                        | none                                                                                                       | no                                                          |
| `PROVIDER_FAILED`          | `TxBuildError` | a provider read that no other code names failed: reward balances, the payer's UTxOs (the `cause`); a failed read of an out ref or of parameters keeps its own code                              | `{ operation }`                                                                                            | no                                                          |
| `INVALID_REDEEMER`         | `TxBuildError` | a redeemer function threw, asked for an item the transaction does not hold, or returned data that is not Plutus data                                                                            | `{ reason, ref? }`                                                                                         | no                                                          |
| `INVALID_GUARD`            | `TxBuildError` | a key guard whose hash is the hash of one of the transaction's scripts                                                                                                                          | `{ reason: "scriptHash", hash }`                                                                           | no                                                          |
| `INVALID_SELECTION`        | `TxBuildError` | `coinSelection` returned a UTxO that was not a candidate                                                                                                                                        | `{ utxo }`                                                                                                 | no                                                          |
| `ABORTED`                  | `TxBuildError` | the call's `signal` aborted it, in any call; `cause` is the signal's reason                                                                                                                     | none                                                                                                       | no                                                          |
| `NOT_SERIALIZABLE`         | `TxBuildError` | a part holds a redeemer function: `toJSON()`, and `builder.plan()` on a builder with a store                                                                                                    | none                                                                                                       | no                                                          |
| `WALLET_FAILED`            | `TxBuildError` | reading the payer from a wallet failed, or its answer cannot be read                                                                                                                            | `{ walletCode? }`                                                                                          | no                                                          |
| `INVALID_OPTION`           | `TxBuildError` | an option or argument of a value not accepted, also of a public function (`details.option` names the argument)                                                                                  | `{ option, value, allowed }`                                                                               | no                                                          |
| `UNKNOWN_LABEL`            | `TxBuildError` | `outputOf` with a label no output has                                                                                                                                                           | `{ label, labels }`                                                                                        | no                                                          |
| `SIGN_DECLINED`            | `TxPlanError`  | the signer declined (CIP-30 UserDeclined); nothing changed, asking again is the application's choice                                                                                            | none                                                                                                       | no                                                          |
| `SIGNER_FAILED`            | `TxPlanError`  | the signer failed, timed out at the attempt's deadline, or changed accounts                                                                                                                     | `{ reason: "error" \| "timeout" \| "accountChanged", walletCode? }`                                        | no                                                          |
| `INVALID_WITNESS`          | `TxPlanError`  | a witness that cannot be decoded, is not of this body, or is of a replaced attempt                                                                                                              | `{ reason: "undecodable" \| "wrongBody" \| "staleAttempt", argument, keyHash? }`                           | no                                                          |
| `MISSING_SIGNATURES`       | `TxPlanError`  | nobody can sign, or keys are still missing before a delivery; nothing sent                                                                                                                      | `{ missing: RequiredKey[] }`                                                                               | no                                                          |
| `MISSING_SUBMITTER`        | `TxPlanError`  | no submitter: none in the call, the builder or the provider; nothing sent                                                                                                                       | none                                                                                                       | no                                                          |
| `NOT_YET_VALID`            | `TxPlanError`  | the attempt's lower bound is ahead of the tip; nothing sent                                                                                                                                     | `{ waitMs }`                                                                                               | yes, `retryAfterMs` = `waitMs`                              |
| `SUBMIT_FAILED`            | `TxPlanError`  | the outcome of a delivery is unknown; the same bytes are safe to send again                                                                                                                     | `{ walletCode? }`                                                                                          | yes                                                         |
| `REJECTED`                 | `TxPlanError`  | the ledger refused the attempt, and every earlier delivery of it: `build()`, then `send()`, when `otherLive` is empty                                                                           | `{ otherLive, tipAgeMs? }`                                                                                 | no                                                          |
| `CONFIRM_TIMEOUT`          | `TxPlanError`  | `waitFor` was not reached within `timeoutMs`; the status does not change                                                                                                                        | `{ waitedFor: "included" \| "final", timeoutMs }`                                                          | yes                                                         |
| `EXPIRED`                  | `TxPlanError`  | the attempt's deadline and margin passed and it is not on chain (`unsent`: never delivered): `build()`, then `send()`, or `advance()` with a signer                                             | `{ otherLive, unsent?, tipAgeMs? }`                                                                        | no                                                          |
| `SCRIPT_FAILED`            | `TxPlanError`  | the attempt landed with a failed script and its collateral was taken: a new plan with fixed parts after `abandon()`                                                                             | none                                                                                                       | no                                                          |
| `ORPHANED`                 | `TxPlanError`  | the parent attempt it builds on is dead, or the parent has no live attempt: rebuild the parent, then the child                                                                                  | `{ otherLive }`                                                                                            | no                                                          |
| `CANNOT_OBSERVE`           | `TxPlanError`  | the provider cannot follow plans (`noTip`, `noSearch`, `noDepth`, `noValidity`, `addressCache`), or confirmed nothing this time (`unconfirmed`)                                                 | `{ reason }`                                                                                               | only `unconfirmed`, `retryAfterMs` = the builder's `pollMs` |
| `ATTEMPT_ON_CHAIN`         | `TxPlanError`  | `abandon()` found an attempt in a block: the plan paid; not a failure, `advance()` shows `final`                                                                                                | `{ landed }`                                                                                               | no                                                          |
| `INVALID_STATE`            | `TxPlanError`  | the call does not fit the plan: its status, a terminal plan, the closing mark (go on with `advance()`), a 17th attempt, a Plutus deadline past the horizon, a record this library does not read | `{ reason: "status" \| "terminal" \| "closing" \| "tooManyAttempts" \| "pastHorizon" \| "recordVersion" }` | no                                                          |
| `STILL_LIVE`               | `TxPlanError`  | an attempt may still land: `abandon()` before `safeAfter`, or a new attempt that has to wait                                                                                                    | `{ txHashes, safeAfter }`                                                                                  | yes, `retryAfterMs` until `safeAfter` by the tip's time     |
| `PAYER_MISMATCH`           | `TxPlanError`  | the payer of a new attempt has neither the recorded change address nor the recorded anchor                                                                                                      | `{ recorded, given }`                                                                                      | no                                                          |
| `INPUTS_SPENT`             | `TxPlanError`  | inputs the parts name are spent and no earlier attempt is found: a hint, not a reason for a new plan; nothing sent                                                                              | `{ inputs }`                                                                                               | no                                                          |
| `PLAN_EXISTS`              | `TxPlanError`  | an `id` already recorded with other parts, deadlines, data options or parents                                                                                                                   | none                                                                                                       | no                                                          |
| `PLAN_NOT_FOUND`           | `TxPlanError`  | no record under the `id` (`error.planId`), or under a parent's id                                                                                                                               | none                                                                                                       | no                                                          |
| `VERSION_CONFLICT`         | `TxPlanError`  | another writer changed the record and the change could not be applied again: go on through `resume`                                                                                             | none                                                                                                       | no                                                          |
| `STORE_FAILED`             | `TxPlanError`  | the store threw; a write may have passed: go on through `resume`                                                                                                                                | none                                                                                                       | no                                                          |
| `MISSING_STORE`            | `TxPlanError`  | `resume` on a builder without a store                                                                                                                                                           | none                                                                                                       | no                                                          |
| `MISSING_ID`               | `TxPlanError`  | a plan on a builder with a store without an `id`                                                                                                                                                | none                                                                                                       | no                                                          |

Warnings do not stop a build: `BuiltTx.warnings` lists `VALID_FROM_FUTURE` (the lower bound starts
after the local clock's time), `COLLATERAL_FORFEITED` (collateral without a collateral return: all
of it is at stake) and `FEE_ABOVE_MINIMUM` (the `fee` given is above the minimum). A plan tells
`trace` `{ type: "warning", code: "HASH_MISMATCH", txHash, reportedHash }` when a submitter answers
with another hash; the hash is kept in `TxAttempt.reportedHash` as a note.

The lists the library gives out are open: part kinds, `SignerRole`, redeemer tags,
`LanguageVersion`, native script variants, plan and attempt statuses, the values of `reason`,
`cause` and `role` in `details`, and warning codes. A minor version may add a value. Code that
switches on them has a default branch, and code meant to outlive a ledger era reads the fields of
`BuiltTx` (`signers`, `inputs`, `outputs`, `redeemers`, `parts`), not `prototype`.

## Testing on the emulator

`TxEmulator` of `@meshsdk/tx-emulator` is a provider, a submitter and an evaluator: plans run on
it, and its clock moves only when the test moves it.

```ts
import { deserializeAddress, mConStr0, MeshWallet } from "@meshsdk/core";
import {
  guard,
  output,
  outputOf,
  spend,
  TxBuilder,
  validity,
} from "@meshsdk/transaction";
import { TxEmulator } from "@meshsdk/tx-emulator";

const script = { code: vestingCompiledCode, version: "V3" as const }; // the blueprint's compiledCode as it is
const walletOf = (accountIndex: number) =>
  new MeshWallet({
    networkId: 0,
    key: { type: "mnemonic", words },
    accountIndex,
  });
const keyHashOf = async (wallet: MeshWallet) =>
  deserializeAddress(await wallet.getChangeAddress()).pubKeyHash;

it("locks, refuses the wrong key, unlocks after the deadline", async () => {
  const emulator = await TxEmulator.create({
    validator: "scalus",
    network: "preprod",
  });
  const [owner, beneficiary, attacker] = [0, 1, 2].map(walletOf);
  for (const wallet of [owner, beneficiary, attacker])
    emulator.fund(await wallet.getChangeAddress(), { lovelace: 100_000_000n });
  const builder = new TxBuilder({
    network: "preprod",
    provider: emulator,
    planDefaults: {
      expiryMarginMs: 0,
      confirmations: 0,
      pollMs: 10,
      resendMs: 10,
    },
  });

  // Lock 50 ADA for an hour of the emulator's clock
  const lockUntil = emulator.time + 3_600_000;
  const datum = mConStr0([
    lockUntil,
    await keyHashOf(owner),
    await keyHashOf(beneficiary),
  ]);
  const lock = builder.plan(
    output({
      address: builder.scriptAddress(script),
      value: { lovelace: 50_000_000n },
      datum: { type: "inline", data: datum },
      label: "vesting",
    }),
    { payer: owner },
  );
  await lock.send({ waitFor: "final" });

  emulator.advanceTo({ time: lockUntil + 60_000 }); // no waiting: the clock is the emulator's
  const unlock = async (payer: MeshWallet, signer: MeshWallet) =>
    builder.plan(
      [
        spend.plutus({
          utxo: outputOf(lock.built!, "vesting"),
          script,
          redeemer: { data: mConStr0([]) },
          label: "unlock",
        }),
        guard.pubKey({ address: await signer.getChangeAddress() }),
        validity({ from: lockUntil + 1 }),
      ],
      { payer },
    );

  // The script refuses a signer who is neither owner nor beneficiary, and the error names the part
  await expect((await unlock(attacker, attacker)).send()).rejects.toMatchObject(
    {
      code: "EVALUATION_FAILED",
      label: "unlock",
    },
  );
  // The beneficiary's unlock signed by someone else: refused before the ledger, naming the key
  await expect(
    (await unlock(attacker, beneficiary)).send({ signers: attacker }),
  ).rejects.toMatchObject({
    code: "MISSING_SIGNATURES",
    details: { missing: [{ keyHash: await keyHashOf(beneficiary) }] },
  });
  // The beneficiary unlocks
  const claim = await unlock(beneficiary, beneficiary);
  await claim.send({ waitFor: "final" });
  expect(claim.status).toBe("final");
  expect(claim.built!.redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
});
```

`planDefaults: { expiryMarginMs: 0, confirmations: 0 }` makes `expired` and `final` come at once
on the emulator, and `pollMs: 10, resendMs: 10` keeps waiting short; the emulator needs none of
them.

## Providers and networks

Every plan needs from the builder's provider the chain's tip with its block height
(`fetchLatestBlock`), and the search for a transaction with its block height (`fetchTxInfo`'s
`blockHeight`), and for an attempt that runs a Plutus script `validContract`. Without them:
`CANNOT_OBSERVE` (`noTip` at `builder.plan()`; `noSearch`, `noDepth` or `noValidity` at the first
attempt's build, before anything is signed). Plans work on `TxEmulator` and on Blockfrost. A
`BlockfrostProvider` with `enableCaching` does not suit plans (`CANNOT_OBSERVE`, `addressCache`):
give the builder one without the cache. A provider without a search can still submit, as the
builder's `submitter`, with another provider reading.

Until a `@meshsdk/provider` release returns block heights and `validContract`, and `@meshsdk/core`
pins it, give the builder this subclass of `BlockfrostProvider`. It is temporary: remove it once
the provider returns them itself. It costs one more request for each tip and each found attempt.

```ts
import type { BlockInfo, TransactionInfo } from "@meshsdk/core";
import { BlockfrostProvider } from "@meshsdk/core";

/** BlockfrostProvider with the block heights and the validity flag that plans need */
export class BlockfrostWithHeights extends BlockfrostProvider {
  async fetchLatestBlock(): Promise<BlockInfo> {
    const block = await super.fetchLatestBlock();
    const { height } = await this.get(`blocks/${block.hash}`);
    return { ...block, height };
  }

  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    const info = await super.fetchTxInfo(hash);
    const tx = await this.get(`txs/${hash}`);
    return {
      ...info,
      blockHeight: tx.block_height,
      validContract: tx.valid_contract,
    };
  }
}

const provider = new BlockfrostWithHeights(blockfrostProjectId);
```

**Devnet.** A devnet's genesis wallets and `topup` give UTxOs without a transaction, which a
plan's checks cannot find: before the first plan and after each `topup`, the wallet sends its
UTxOs to itself with an ordinary transaction. A devnet is a `customNetwork(...)`; see
[The builder](#the-builder) for its parameters.

**Hydra.** The new builder takes the head's own protocol parameters: the head's provider reads
them, or they are given in `params` from the file the head was started with. There is no set of
zeros to copy: a head's parameters are its own. A Plutus transaction always carries a collateral
input, also in a head. The old API's `isHydra` sets five parameters to zero (`minFeeA`, `minFeeB`,
`priceMem`, `priceStep`, `coinsPerUtxoSize`) and keeps `collateralPercent`.

## The old MeshTxBuilder

`MeshTxBuilder` is `@deprecated` and still works: it builds on `TxBuilder`. Its methods and
signatures are kept and behave the same or very close, though the final CBOR may differ;
`MeshTxBuilderV2` and `Transaction` work through it. New code uses `TxBuilder` and its parts.

- Its `serializer` and `selector` accept only Mesh's: `CardanoSDKSerializer` or `CSLSerializer`,
  and a `LargestFirstInputSelector` or none; anything else is `INVALID_OPTION` at construction. The
  transaction is always encoded by the builder, and `LargestFirstInputSelector` is a mark whose
  `select()` rejects: a selection of one's own is `coinSelection` of `TxBuilder`.
- `complete()` builds with `TxBuilder.build(parts, options)` and writes the built transaction back
  into the body. `completeSync()`, `completeUnbalanced()` and `completeUnbalancedSync()` stay
  synchronous and read nothing: an input or collateral without amount or address, or a reference
  script without size, is `UNRESOLVED`.
- Where the old code silently returned a transaction the ledger refuses, it now throws the new
  builder's error: an output below the minimum lovelace (`OUTPUT_BELOW_MIN_COIN`), a fee below the
  minimum (`FEE_TOO_LOW`), an address of another network (`NETWORK_MISMATCH`), a datum that does
  not fit (`DATUM_MISMATCH`), a metadata integer out of range (`INVALID_DATA`), and the like.
  Errors are `TxBuildError` and `TxPartError` with codes; messages differ from the old ones.
  `Transaction.build()` passes the error of `complete()` on as it is, and wraps the errors of its
  other steps, and of `build(false)`, in a plain `Error`.
- Entries of one input or collateral input out ref that name no field differently are taken as one
  input, each field from the entry that names it: the same entry again, a bare out ref beside the
  full one, or one entry with only the amount beside one with only the address. Two entries that
  name a field differently (another amount, address, script size, redeemer or execution units) are
  `DUPLICATE_PART`, also when one of them adds a field the other lacks. A plain `txIn` copy of a
  script input is not merged into the script entry: it is refused (`WITNESS_MISMATCH` where the
  output is known, else `DUPLICATE_PART`).
- With a fetcher and no `evaluator`, scripts are evaluated locally by `OfflineEvaluatorScalus`;
  `evaluator: null` keeps the units given. Such an evaluator is handed the UTxOs it runs on, so a
  script input given with its amount and address that the provider does not know yet is
  `UTXO_NOT_FOUND`: give it with `chainTx` or `inputForEvaluation`, or pass `evaluator: null`.
  Every Plutus transaction gets collateral (chosen from `selectUtxosFrom` when no `txInCollateral`
  is given), `total_collateral` and a collateral return.
- The network of the build is the new `network` option, else the fetcher's `network`, else a
  `setNetwork()` name of the change address's network, else mainnet for a mainnet change address.
  A script transaction with a validity interval on a test network none of them names is
  `EVALUATION_FAILED` with the default evaluator: pass `network`, or call `setNetwork()`.
- `reset()` also clears a fee set with `setFee()`, and keeps the protocol parameters;
  `protocolParams()` calls merge in call order.

| Member                                                                                                                                                                                                             | State               | Replacement                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------- |
| the fluent methods `txIn` … `inputForEvaluation`, `complete()`, `completeSync()`, `completeUnbalanced()`, `completeUnbalancedSync()`, `completeSigning()`, `submitTx()`, `reset()`, the fields                     | kept                | —                                                                                |
| `calculateMinLovelaceForOutput`, `calculateFee`, `getActualFee`, `calculateFeeForSerializedTx`, `calculateRefScriptFee`, `calculateRedeemersFee`, `getTotalExecutionUnits`, `getSerializedSize`, `serializeMockTx` | kept                | for new code: `minCoin`, `minFee` and the fields of `BuiltTx` (`fee`, `exUnits`) |
| `selectUtxos`                                                                                                                                                                                                      | removed             | `TxBuilder.build(parts, { payer })`: selection is the builder's                  |
| `updateByTxPrototype`                                                                                                                                                                                              | removed             | the body is written back by `complete()`                                         |
| `getUtxosForSelection`                                                                                                                                                                                             | removed             | `payer.utxos` (or `selectUtxosFrom()`)                                           |
| `completeCostModels`                                                                                                                                                                                               | removed             | `TxBuilder`'s `costModels` option, or the provider                               |
| `evaluateRedeemers`                                                                                                                                                                                                | removed             | the builder evaluates the balanced transaction; the `evaluator` option           |
| `sortTxParts`, `sortInputs`, `sortMints`, `sortWithdrawals`, `sortVotes`, `sortProposals`                                                                                                                          | removed             | the builder orders every item by the ledger's rules                              |
| the protected members (`completeTxParts`, `sanitizeOutputs`, `getUTxOInfo`, `complete…Info`, `is…Complete`, ...)                                                                                                   | removed             | —                                                                                |
| `txEvaluationMultiplier`                                                                                                                                                                                           | kept, `@deprecated` | multiplies nothing                                                               |

`txEvaluationMultiplier` is `@deprecated` and multiplies nothing: a redeemer's execution units are
the evaluation of the final transaction, and a value other than 1 makes the first `complete()` of
the process that sees it write one console warning. Protocol parameters are read from the fetcher at
`complete()`, with the fields the consumer gave on top. Built-in values are used only where there is
nobody to ask: without a fetcher, when it fails or answers nothing, and in the synchronous calls and
queries, which take the values the last `complete()` read, else the built-in ones; the first
`complete()` of the process that builds on them writes one console warning, and the cure is a
`fetcher` or `params`. `isHydra` sets five parameters to zero and keeps `collateralPercent`; see
[Providers and networks](#providers-and-networks).
