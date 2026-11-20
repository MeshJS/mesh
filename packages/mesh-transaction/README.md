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
const plan = await builder.plan(
  output({ address: recipient, value: { lovelace: 2_000_000n } }),
  { payer: wallet },
); // builds the transaction; nothing is signed or sent
await plan.run(); // signs with the payer, submits, waits for a block
console.log(plan.step("main").txHash); // the hash of the transaction that landed
```

With the `@meshsdk/provider` that `@meshsdk/core` pins today, `BlockfrostProvider` returns no block
heights, and `builder.plan()` throws `CANNOT_OBSERVE` (`noDepth`) before anything is signed or
sent; the subclass in [Providers and networks](#providers-and-networks) adds them.

`run()` returns once the transaction is in a block (`included`); a rollback can still undo that.
A shop releases goods when its own server, observing through its own provider, sees the step
`final`.

`TxBuilder` builds a balanced transaction from _parts_: one value per piece of the transaction
(`output(...)`, `spend.plutus(...)`, `certificate.stakeDelegation(...)`, ...), each made by one call
that checks its arguments there. `await builder.plan(parts, { payer })` returns a `TxPlan`: a group
of transactions built at once and sent in order, here one step named `main`. A plan never builds
again: every call signs, sends and looks for the same bytes, so every call can be repeated without
paying twice. A plan's time is the chain's tip, held against the local clock; other timers only
set the pace of waiting.

The builder holds no wallet: who pays is the `payer` of each build or plan, who signs is named by
the call that signs (the payer signs unless the call names `signers`), and who submits is the call's
`submitter`, else the builder's, else the provider. The builder holds its network, provider,
settings, the provider's shared cache and the parts added with `.add()`; it holds no payer and no
state of a transaction: that lives in the `TxPlan`, or in the `BuiltTx` a build returns. One builder
builds any number of transactions, concurrently included.

`builder.build(parts, { payer })` returns one transaction on its own, a `BuiltTx`: the data
of the build, and the calls that sign that one body, submit it and look for it (`sign()`,
`addWitnesses()`, `submit()`, `awaitInclusion()`). It has no deadline, no statuses and no
record. It is the preview of an order, the way to build without a provider, the start of a
transaction balanced or edited by hand, and a transaction whose outcome the application follows
itself. Do not rebuild it to retry: see
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
changeAddress? })`, `restore(json)`, `fromCbor(txCbor, { knownUtxos? })`, `readPayer(payer)`, and
its options as read-only fields (`builder.params` and `builder.costModels` are what was given,
never what was read). `build()` and `finalize()` return a `BuiltTx`, `fromCbor(txCbor)` makes one
of a transaction that exists only as CBOR, and `restore(json)` brings one back from its JSON; see
[The path without a lifecycle](#the-path-without-a-lifecycle).

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
const plan = await shop.plan(
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

| What is built                                             | Build                                                                                         | Sign                                                                           | Submit                                                                                     | Wait                         | Record                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------- |
| a plan, its `payer` a wallet                              | read at the build: network, change address, UTxOs                                             | the wallet, when the call names no `signers`                                   | the call's `submitter` or the builder's, else the provider; a wallet only as a `submitter` | the provider                 | the change address only; the wallet is given to `resume` again                          |
| a plan, its `payer` an address (bech32 or hex)            | its UTxOs through the provider, past the cache                                                | the call's `signers`, or `addWitnesses`                                        | the same                                                                                   | the same                     | the change address                                                                      |
| a plan, its `payer` a snapshot `{ changeAddress, utxos }` | nothing is read; a CIP-30 snapshot (hex address, UTxOs in CBOR) is converted without requests | the same                                                                       | the same                                                                                   | the same                     | the change address                                                                      |
| a transaction of `build()`, with any of these payers      | as for a plan                                                                                 | `built.sign()`: the call's signers, else the payer; `built.addWitnesses()`     | `built.submit()`: the same                                                                 | `built.awaitInclusion()`     | no plan record; `JSON.stringify(built)`, and `builder.restore(json)` in another process |
| offline: `params`, `costModels`, a snapshot, `knownUtxos` | `build()` without requests                                                                    | the same; a cold signer gets `built.tx`                                        | later, on a builder with a provider, or with a `submitter` in the call                     | on a builder with a provider | the same                                                                                |
| without balancing                                         | `assembleTxPrototype`, `finalize`                                                             | the same                                                                       | the same                                                                                   | the same                     | the same                                                                                |
| a transaction given as CBOR: `fromCbor(txCbor)`           | nothing is built; the UTxOs of its inputs from `knownUtxos`, else through the provider        | `tx.sign({ signers })`: there is no payer; the witnesses it came with are held | the same                                                                                   | the same                     | the same                                                                                |

A build without a payer is `MISSING_PAYER`, and its message names the forms. The builder has no
default payer. A payer of no known form, or an address that is not a payment address of network 0 or
1 (the CBOR of a signing key file reads as an address of another network), is `INVALID_OPTION`; the
error tells the shape of what was given, never the text. Without a wallet the other errors are
`MISSING_SIGNATURES` (nobody to sign), `MISSING_SUBMITTER` (nobody to submit) and
`MISSING_STORE` for `resume(id)` on a builder without a store. `builder.readPayer(payer)` turns any
form into a `PayerSnapshot` (bech32 address, `Utxo`s); a snapshot needs no request and no provider.

**Who signs.** The call's `signers` (`sign()` and `run()` of a plan, `built.sign()`),
else the payer when it has a signing method: a wallet, or a snapshot object that carries one. The
payer is not asked when nothing is left for it to sign, and only its witnesses of the keys it is
asked for, and bootstrap witnesses, are kept: the other keys `extraKeyWitnesses` counts come from
signers named in a call and from `addWitnesses`. A `BuiltTx` keeps the payer of its build, not in
its JSON: one made by `restore()`, `finalize()` or `fromCbor()` holds none. With nobody,
`MISSING_SIGNATURES`, and nothing is sent. The builder has no signer: each call names its own, one
or a list, and each is asked once, in order, for the keys that have not signed yet. The library
puts the witnesses in: every witness is verified against the body, only the transaction's witness
set changes, and witnesses of keys the fee does not count (an extra key a wallet signs with,
beyond the build's `extraKeyWitnesses`) are dropped. A key that did not sign is in `missing`
(`built.missing`, or a step's `missing`), with the roles it is needed in; a step stays `built`.
The kinds of signer are in [Signers](#signers).

**Who submits.** The call's `submitter` (`run()`, `built.submit()`), else the
builder's, else the provider; with none, `MISSING_SUBMITTER`. A wallet submits only when it is
given as a `submitter` object: there is no `"payer"` value. A CIP-30 api with `submitTx`, a
`BrowserWallet` and a `MeshWallet` with a submitter fit; `canSubmit(api)` narrows a
`Cip30WalletApi` to `ISubmitter`. The call's `submitter` is given in every call that should go
through it, after `resume` or `restore` too; a call without it sends the same bytes, with the
same `txHash`, through the builder's submitter or the provider. A builder of one user in a
browser may hold the wallet as its own `submitter`. A failed `submitTx` of a wallet (CIP-30
`TxSendError`: Refused 1, Failure 2) is `SUBMIT_FAILED` with `details.walletCode`. Reading and
sending may be split: a `provider` reads, a `submitter` sends.

**A failed submission.** `SUBMIT_FAILED` has `details.reason`, what the submitter's error says:
`unavailable` (a connection that failed, was reset or timed out; HTTP 408, 425, 5xx),
`rateLimited` (HTTP 429), `unauthorized` (HTTP 401, 403, such as a wrong API key), `refused` (the
ledger refused this delivery, which does not make the step `rejected`: an earlier delivery may
land, a step it stands on is not in a block yet, or a wallet passed on a refusal) or `unknown`, and
`details.status` when the error carries an HTTP status. No reason says that the bytes did not
arrive: the outcome is unknown, and the same bytes are safe to send again, though on
`unauthorized` they fail again until the key is fixed. Only the code `REJECTED` means refused for
good. A reason is only what the error says: with the HTTP providers of `@meshsdk/provider` under
Node a request that got no response reads `unknown`, and some providers give no reason at all.

### Signers

Every call that takes `signers` (`built.sign()`, `plan.sign()`, `plan.run()`)
takes the same kinds of signer, one or a list:

| Signer                     | Given as                                                                                                                         | How it is asked                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a wallet                   | a CIP-30 api, a `MeshWallet`, a `BrowserWallet`, any object with `signTxWitnesses(tx, keyHashes?)` or `signTx(tx, partialSign?)` | with the transaction; it answers with a CBOR witness set. `signTxWitnesses` is handed the hashes of the keys still needed, `signTx` chooses its keys itself |
| a private key              | `keySigner(key)`                                                                                                                 | with the transaction's hash; it signs when its key is among the keys still needed                                                                           |
| the application's own code | an object with `signTxHash(request)`, or that function itself                                                                    | with the transaction's hash and the keys still needed, each with its roles; it answers with `{ vkey, signature }` for each key it holds                     |

```ts
import type { TxHashSigner } from "@meshsdk/transaction";
import { keySigner, output, TxPlanError } from "@meshsdk/transaction";

const built = await builder.build(
  output({ address: recipient, value: { lovelace: 5_000_000n } }),
  { payer: treasuryAddress },
);

// The application's own code: a key service that signs a hash and knows nothing of transactions
const service: TxHashSigner = {
  async signTxHash({ txHash, keys }) {
    const held = (keys ?? []).filter(({ keyHash }) => vault.has(keyHash));
    if (held.length > 0 && !(await operatorApproves(txHash)))
      throw new TxPlanError("SIGN_DECLINED", "the operator declined");
    return Promise.all(
      held.map(async ({ keyHash }) => ({
        vkey: vault.publicKey(keyHash), // the Ed25519 public key, 32 bytes in hex
        signature: await vault.sign(keyHash, txHash), // Ed25519 over the 32 bytes of txHash, 64 bytes in hex
      })),
    );
  },
};

// One of:
await built.sign({ signers: wallet }); // a wallet
await built.sign({ signers: keySigner(process.env.TREASURY_SKEY!) }); // a private key: here the cborHex of a cardano-cli payment.skey
await built.sign({ signers: service }); // the application's own code
await built.sign({ signers: (request) => service.signTxHash(request) }); // the function itself is a signer too
await built.sign({ signers: [wallet, keySigner(stakeKey), service] }); // several: each is asked for the keys that have not signed yet

await built.submit(); // MISSING_SIGNATURES, and nothing sent, while built.missing is not empty

// A plan takes the same signers, in each call that signs
await plan.run({ signers: keySigner(process.env.TREASURY_SKEY!) });
```

`built.sign({ signers })` adds the signatures its signers give and returns the same object;
`built.sign()` asks the payer of the build (see **Who signs** above). `built.missing` lists the keys
that have not signed yet, each with its roles, and `built.signedTx` is the signed transaction once
none is missing; `built.tx` stays the unsigned one. By default a key still missing is no error, so
parties sign one after another, one call each; with `partial: false` the call throws
`MISSING_SIGNATURES` when a key is still missing after its signers were asked, and what they gave
stays. `submit()` checks the same before it sends. No signer and no payer that signs is
`MISSING_SIGNATURES` in every case. A party that signs in another program gets `built.partialTx`,
the transaction with the witnesses held so far (`tx` itself while none is held), for example for a
wallet's `signTx(tx, true)`, and what it gives back goes to `built.addWitnesses()`; the ledger
refuses `partialTx` while a key is missing. Every witness is verified against the body; those of the
keys the fee counts are kept, each once (the keys asked for, as many other keys as the build's
`extraKeyWitnesses`, and as many bootstrap witnesses as the transaction spends from Byron
addresses; a vkey witness and a bootstrap witness of one key are both kept), and any other is
dropped. There is no deadline here: give the call a `signal` to stop waiting for a signer.

**A private key.** `keySigner(key)` reads the key from text:

| Key                               | Text                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an Ed25519 signing key, 32 bytes  | hex; the `cborHex` of a cardano-cli signing key file (`5820…`); bech32 `ed25519_sk`, `addr_sk`, `stake_sk`, `drep_sk`, `cc_cold_sk`, `cc_hot_sk`, `pool_sk`, `policy_sk`, `addr_shared_sk`, `stake_shared_sk`                                                                |
| an extended signing key, 64 bytes | hex of the 64 bytes; the `cborHex` of a cardano-cli extended signing key file (`5880…`); bech32 `ed25519e_sk` of the 64 bytes; bech32 `addr_xsk`, `stake_xsk`, `drep_xsk`, `cc_cold_xsk`, `cc_hot_xsk`, `pool_xsk`, `addr_shared_xsk`, `stake_shared_xsk` of 96 or 128 bytes |

A key file (`5880…`) carries the key's public key and its chain code beside it. A bech32
`*_xsk` carries its chain code (96 bytes) or its public key, then its chain code (128 bytes); one
of 64 bytes is refused. The public key, where there is one, is checked; the chain code is not
used. A mnemonic, a root key (`xprv`, `root_xsk`) and an account key (`acct_xsk`) need a
derivation path: give them to a wallet (`MeshWallet`). 64 bytes that are a 32-byte key followed
by its public key are refused: give the first 32 bytes.

The key goes to `keySigner` and nowhere else: `signers: key` and `signers: { privateKey: key }`
are `INVALID_OPTION`. It stays inside the signer: `JSON.stringify(signer)` is `{}`, and the key is
in no error, `details`, trace event, plan record or JSON of a transaction. A malformed key is
`INVALID_OPTION`, thrown by `keySigner` itself; the error names the form and the length of what
was given, never the text. An extended key is checked once more at its first use, before anything
is signed (that it is not a 32-byte key followed by its public key, and that the public key the
text states is its own): a key that fails it is refused at every use, and the call that asked it
throws `SIGNER_FAILED`. Asked for a list of keys, the signer signs only when its key hash is among
them, so one list of signers serves every transaction; asked without keys
(`signWitnesses(signer, tx)` with no `keyHashes`), it signs with its key, needed or not. It signs
only the hash of the transaction it is shown.

**The application's own code.** `signTxHash`, or the function given in its place, gets `txHash`,
the hash of the transaction's body (32 bytes in hex; the signature is over these 32 bytes, not
over the hex text), `keys`, the keys that have not signed yet, `tx`, the transaction in CBOR hex
for a signer that checks what it signs, and the call's `signal`. Each entry of `keys` is
`{ keyHash, roles }`. The roles say why the key is asked for: the roles the transaction needs its
signature in (`"input"`, `"collateral"`, `"certificate"`, `"withdrawal"`, `"vote"`, `"proposal"`,
`"guard"`, `"poolOwner"`), each once, and `"nativeScript"` when a native script of the
transaction names the key. One key may have several, and a key with `"nativeScript"` alone need
not sign: the script decides. The roles are for the signer's own decision and display: the
library takes nothing from them. The request and its lists are frozen. The signer answers with
`{ vkey, signature }` in hex for each key it holds, an empty list when it holds none; it is not
called when no key is left to sign. Every signature is verified before it is used, and the key
hash is taken from `vkey`: an answer of another shape, or a signature that does not verify
against `txHash`, is `SIGNER_FAILED`. To decline, the signer throws
`new TxPlanError("SIGN_DECLINED", reason)`; anything else it throws is `SIGNER_FAILED` with it as
the `cause`, and its message is quoted, so it must hold no secret. A signer that needs the whole
transaction and answers with a witness set, such as a hardware wallet, implements
`signTxWitnesses(tx, keyHashes?)` instead.

A key signer and a signer of hashes give vkey witnesses only. A key counts as signed by its vkey
witness alone: a bootstrap witness counts for a Byron address. The bootstrap witness of a Byron
address comes from a wallet, and neither a `BuiltTx` nor a plan waits for it: a transaction
sent without it is refused by the ledger. Whether the signatures satisfy a native script is not
checked either: its keys are asked for, and the script decides.

### A browser wallet

```ts
import { canSubmit, output, TxError } from "@meshsdk/transaction";

const api = await window.cardano[walletName]!.enable(); // the CIP-30 api: payer, signer and submitter
const plan = await builder.plan(
  output({ address: shop, value: { lovelace: 2_000_000n } }),
  { payer: api },
);
try {
  await plan.run({
    ...(canSubmit(api) && { submitter: api }), // the wallet submits; without it the provider does
  });
} catch (error) {
  if (
    TxError.is(error, "SIGNER_FAILED") &&
    error.details.reason === "accountChanged"
  ) {
    const again = await window.cardano[walletName]!.enable(); // connect again: the user must be back on the account that pays
    await plan.run({ signers: again }); // the same body, built from the old account's UTxOs
  } else throw error;
}
```

`included` here shows the user progress; a rollback can still undo it, so the shop's server
releases the goods once it sees the plan `final` through its own provider (a
[keyless server](#a-keyless-server-several-instances-on-one-store) plan, or the
[reconciliation](#reconciliation-of-unfinished-plans)).

UserDeclined (2) from `signTx` is `SIGN_DECLINED`; AccountChange (−4) is `SIGNER_FAILED` with
`reason: "accountChanged"`, not retryable: call `enable()` again and give the new api to
`plan.run({ signers })`. The body spends the old account's UTxOs, so the user must be back on the
account that pays. A wallet that now gives another account cannot sign that body: `stop()` the
plan; once `stopped`, `plan.replan({ id, payer: api })` pays the rest. Parts that need the
signature of a DRep key (DRep certificates, a vote cast by a DRep key) are signed by a browser
wallet connected with the CIP-95 extension: `enable({ extensions: [{ cip: 95 }] })` on the wallet's
entry in `window.cardano`, or `BrowserWallet.enable(name, [{ cip: 95 }])`. The builder calls nothing
of CIP-95: it calls `signTx` and compares the keys that signed with `BuiltTxData.signers`; a key
that did not sign stays in the step's `missing`, and `run()` throws `MISSING_SIGNATURES`.

**Wallet forms.** A wallet given as the payer comes in one of these forms:

| Wallet form | Examples                                                                                                                                                                                                             | How the builder takes it                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CIP-30 api  | `window.cardano.<name>.enable()`; from Mesh's wallet 2.0: `CardanoBrowserWallet`, `CardanoHeadlessWallet` (with a fetcher), `MeshCardano*`, `createCip30Api(wallet)`                                                 | hex address to bech32 (Byron to base58), UTxOs in CBOR to `Utxo`s; `null` and `undefined` from `getUtxos` are no UTxOs; signs with `signTx(tx, true)`                                 |
| Mesh 1.9    | `MeshWallet`, `BrowserWallet`                                                                                                                                                                                        | its `UTxO` objects to `Utxo`s; a wallet with `signTxWitnesses` (the `MeshWallet` of this release) signs with the keys the transaction needs, any other with `signTx(tx, true, false)` |
| address     | bech32 or hex                                                                                                                                                                                                        | its UTxOs through the provider, past the cache                                                                                                                                        |
| snapshot    | `PayerSnapshotInput`: `{ changeAddress, utxos }`, its UTxOs in any form of `UtxoInput`, also a hex address and CBOR UTxOs from CIP-30 (a keyless server; a server with a key filters its own UTxOs with `canSelect`) | as a CIP-30 api, without requests or a provider                                                                                                                                       |

A wallet's UTxOs come from the wallet. A wallet without `getUtxos`, and a `MeshWallet` made without
a fetcher, are read at their change address through the builder's provider.

**Collateral.** The builder picks collateral itself, from the payer's key-locked UTxOs: ada-only
ones without a reference script first. When they do not cover it and the payer is a CIP-30 api with
`getCollateral` (or `experimental.getCollateral` when the first is absent), that is called once
with `{ amount }` (CBOR of the lovelace needed), and the collateral is taken from its answer; the
wallet may show its collateral dialog. A failure, `null`, `undefined`, an empty or short answer is
`INSUFFICIENT_COLLATERAL`, with the wallet's error in `cause`; the answer is filtered by
`canSelect` too. Collateral inputs given as `collateral(...)` parts that do not cover the collateral
are topped up the same way, after them: from the payer's UTxOs (never a given one again, and no
more than `maxCollateralInputs` in all), else from the answer of `getCollateral`. With the build
option `topUpCollateral: false` they are put up as given, and collateral they do not cover is
`INSUFFICIENT_COLLATERAL`.

With the build option `collateralReturn: false` the transaction carries collateral inputs only,
neither a collateral return nor a total collateral: all of their lovelace is at stake if a script
fails (`COLLATERAL_FORFEITED` in `warnings`), and `built.collateral` is `{ inputs, total }` with
`total` their lovelace. The ledger takes no token as collateral then, so the builder chooses and
tops up from UTxOs holding lovelace alone (also of a `getCollateral` answer), and a
`collateral(...)` part whose UTxO holds a token is `INVALID_COLLATERAL`: give collateral inputs
without assets, or drop `collateralReturn: false`. A `collateralReturn(...)` part with it is
`INVALID_OPTION`. The builder puts up the least it can: it minimises the lovelace at stake plus,
for each input after the first, the fee of one more input with its key witness (140 bytes at
`minFeeA`, 6160 lovelace on today's parameters), so it prefers one input unless more inputs spare
more than they cost. The search is exact for one, two and three inputs; pairs and triples are
sought among the 64 largest UTxOs below what is missing. Ties go to fewer inputs, then to the
smaller out refs. Given inputs it tops up count in what is covered and in what is at stake. UTxOs
holding a reference script are put up only when the others do not cover.

## Plans

A plan is several transactions built at once and sent in order.
`await builder.plan(steps, { payer })` builds every transaction of it, its _steps_, and signs and
sends nothing, so the whole plan can be shown before anyone signs. `plan.run()` signs a step, sends
it, waits until it is in a block, and only then sends the next. Nothing is rebuilt: a repeat of any
call, after a crash or from another process, sends the same bytes. One payment is a plan of one
step, `main`. `builder.build(parts)` stays one transaction or an error, with no lifecycle.

| `TxPlan`                                 |                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `sign({ signers? })`                     | signs each step that still needs keys, in order, with the call's signers, else the payer           |
| `addWitnesses(...witnessSets)`           | signatures made elsewhere, as witness sets or full transactions; each goes to the step it verifies |
| `run(options?)`                          | looks at the chain, then signs, sends and waits for each step in order, until `waitFor`            |
| `add(steps)`                             | named steps at the end of a `pending` plan, built at once; signs and sends nothing                 |
| `refresh()`                              | one look at the chain; never signs or sends, and throws nothing for what it sees                   |
| `stop()`                                 | records that the plan signs and sends nothing more                                                 |
| `replan({ id, steps? })`                 | a new plan in place of this one, for what is left of it; this one is marked first                  |
| `toJSON()`, `builder.resume(id \| json)` | the record, and the plan back from it                                                              |
| `id`, `status`, `steps`, `step(name)`    | the plan as data; `step(name)` of a name it does not have is `INVALID_OPTION`                      |
| `fee`, `until`, `replacedBy`             | the fees of all its transactions; the latest end of validity; the id of the plan in its place      |
| `landed`, `live`, `rest`                 | the steps in a block; those that may still land; what is left, as steps (given built: a `BuiltTx`) |

A step is the `BuiltTxData` of its transaction with `name`, `kind` (`"consolidation"` for a step
the plan put in itself, `"prebuilt"` for one given built), `status`, `missing` (the keys that
have not signed it), `signedTx`, `standsOn` (the earlier steps whose outputs it spends, reads or
puts up as collateral) and `seen` (the block it was last found in). The calls return the plan.
`signers` and `submitter` are options of a call, not of a plan: give them to `sign()` and
`run()`, after `resume` too. Options that are not an object, or have a member the call does not
know, are `INVALID_OPTION`, before anything is asked, written or sent.

### Statuses

| Step       | Meaning                                                                            | The application may conclude                               |
| ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `built`    | signatures are missing                                                             | it may land once signed                                    |
| `signed`   | fully signed; this plan has not sent it                                            | it may land                                                |
| `sent`     | delivered: accepted, or the outcome is unknown                                     | it may land                                                |
| `rejected` | the ledger refused it, and no delivery of it can have gone through                 | it may land: the bytes exist, and `run()` sends them again |
| `included` | found in a block, its scripts valid                                                | it landed, and a rollback can undo it: show progress only  |
| `final`    | at least `confirmations` blocks on top of its block                                | paid; this status never changes                            |
| `expired`  | the tip and the local clock are past its end of validity and the margin; not found | it will not land, by what the chain shows                  |
| `failed`   | in a block with a failed script: its collateral is taken                           | it will not land                                           |
| `orphaned` | a step it stands on will not land                                                  | it will not land, by what the chain shows                  |

| Plan       | Meaning                                                                                                                                                                | The application may conclude                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pending`  | it may still complete                                                                                                                                                  | `run()` takes it on                                                                          |
| `stopping` | it does not go on: a step will not land, `stop()` or `replan` marked it, it was `stopped` once (`halted`), or a plan `replan` made found an old transaction in a block | steps in `live` may still land: no "not paid" yet; `replan` keeps a new plan apart from them |
| `stopped`  | it does not go on, and every step is `final` or will not land                                                                                                          | nothing more of it is expected to land, by what the chain shows: `rest`                      |
| `final`    | every step is `final`                                                                                                                                                  | every payment of it is paid; this status never changes                                       |

A payment is paid when its step is `final`, and `plan.status === "final"` says it of every step.
Goods are released at `final`: never at `included`, which a rollback can undo (the step goes back
to `sent`, and a call that waits sends its bytes again), and never because a call returned. A
group is not atomic: step 1 may be `final` while step 2 never lands. No error of a plan means
that a payment did not go through; only the status of its step does. A status this code does not
know means neither "landed" nor "will not land".

`expired` and `orphaned` rest on the provider's searches, so a step called dead is still looked
for. Found in a block, it is `included`, then `final`; the plan's status follows (a `stopped` plan
may leave `stopped`), and `trace` gets `DEAD_STEP_FOUND`. A step is `orphaned` only while a step
it stands on is called dead; once that step is found, the orphan is what its own record says
(`sent` if it was sent or found before, else `signed` or `built`). `final` and `failed` never
change, so a step on a `failed` one stays `orphaned`.

A plan that came to `stopped` by its steps records it (`halted: true`). A later find takes it to
`stopping` or `final`, never back to `pending`, and it never sends a step for the first time
again. A step orphaned before its first send comes back `signed` or `built` and stays in `live`
and `rest`: the plan stays `stopping` until that step is found in a block (another party may send
its bytes) or expires by its own end of validity and the margin.

### Several transactions

```ts
import { mConStr0 } from "@meshsdk/core";
import { output, spend } from "@meshsdk/transaction";

const plan = await builder.plan(
  {
    lock: output({
      address: builder.scriptAddress(script),
      value: { lovelace: 10_000_000n },
      datum: { type: "inline", data: mConStr0([]) },
      label: "vault",
    }),
    unlock: [
      spend.plutus({
        utxo: { step: "lock", output: "vault" }, // the output labelled "vault"
        script,
        redeemer: { data: mConStr0([]) },
      }),
      spend.pubKey({ utxo: { step: "lock", change: true } }), // all the change of lock
      output({ address: recipient, value: { lovelace: 4_000_000n } }),
    ],
  },
  { payer: wallet },
); // both built, unlock evaluated against lock's outputs; nothing on chain yet
for (const { name, fee, standsOn } of plan.steps)
  console.log(name, fee, standsOn);
console.log(plan.fee); // the fees of both
await plan.sign(); // both bodies, before anything is sent
await plan.run(); // lock, a block, then unlock
```

Named steps are an object, sent in the order of its keys. A step is parts, `{ parts, ...options }`
with build options of its own (`payer`, `canSelect`, `coinSelection`, `sendAllTo`, `fee`,
`registeredPools`, `extraKeyWitnesses`, `topUpCollateral`, `collateralReturn`), or a transaction
built before ([below](#a-transaction-built-elsewhere-as-a-step)). A name is not empty, not a whole
number, does not start with `consolidate-` and is not `__proto__`; a plan has at most 32 steps. The
steps are a plain object, or one without a prototype. Any other object is `INVALID_OPTION`
(`steps`): a `Map`, an object of a class or of another realm, and an object whose prototype
`steps["__proto__"] = step` or a member `__proto__:` of a literal set to an object, as a list or a
part. A step given as CBOR hex under that name, by assignment or in a literal, sets nothing and is
lost without a trace: no check can see it. Give steps whose names come from outside through
`Object.fromEntries`, a spread or `Object.create(null)`, which keep every name; `__proto__` is then
refused by name. An object is one part only when its own `kind` names a part, so a step may be named
`kind`; steps named `tx` and `txHash` are steps too, unless the object also has the lists `inputs`
and `outputs`, as the data of a transaction has: data is refused, also through JSON with its bigints
as text. With named steps, `sendAllTo` and `fee` are given in the step, and a builder that holds
parts from `.add()` is `INVALID_OPTION`. Every error of building a step names the step at the start
of its message. A payer that answers two change addresses within one call is `INVALID_OPTION`
(`payer`): a snapshot has one.

### Links and order

A part names an output of an earlier step by a link, where it takes a UTxO; nothing is looked up
and no hash is written by hand:

| Link                                | What it names                                                    | In                                        |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `{ step: "lock", output: "vault" }` | the output made by the output part labelled `vault`              | `spend.*`, `referenceInput`, `collateral` |
| `{ step: "lock", output: 0 }`       | the output at that position, from 0                              | the same                                  |
| `{ step: "lock", change: true }`    | every change output of that step, one input each; none when none | `spend.pubKey`                            |

A link to a step that is not before it, to a position past the outputs, to a label several
outputs have, or to an output an earlier step spends already is `INVALID_OPTION` (`steps`); a
label no output of that step has is `UNKNOWN_LABEL`. The lock, datum and network of the output
are checked as for a UTxO given in full. Outside a plan a linked part is `UNRESOLVED`.

**Order.** A step built from parts spends the change that the step before it of the same payer
leaves, unless it already spends, reads or puts up an output of that step. So the ledger keeps the
order: step 3 cannot land without step 2. When that step leaves no change this one may take (it
paid everything out, `canSelect` refuses its change, `sendAllTo` sends it elsewhere, or another
step spends it), `builder.plan()` throws `INVALID_OPTION` (`steps`): link the step to an output of
the step before, or make it a plan of its own. `run()` sends a step only when every step before it
is in a block. Selection takes, of the outputs of earlier steps, their change only.

**Another payer.** A step given as `{ parts, payer: treasuryAddress }` is built on that payer's
UTxOs, its change goes there, and it stands on the step before it of that payer. Its payer does not
sign by default: name it among the call's signers, as in
`plan.run({ signers: [wallet, keySigner(treasuryKey)] })`.

**One deadline.** Every step whose parts give no `until` ends at `max(tip time, from) + ttlMs`, the
tip read once when the plan is made; signing and landing every step fit in it, so a plan of many
steps or slow signers gets a longer `ttlMs` ([Deadlines and waiting](#deadlines-and-waiting)).

### Adding steps

`plan.add(steps)` adds named steps at the end of a plan that is `pending`. It looks at the chain,
builds them at once, signs and sends nothing, and returns the plan; a `run()` that is going takes
the new steps in their turn. No step the plan has changes. On a `final` plan it throws
`INVALID_STATE` (`final`), on a `stopping` or `stopped` one `INVALID_STATE` (`stopped`): new
content for such a plan is a new plan.

```ts
import { output } from "@meshsdk/transaction";

const order = await builder.resume(orderId, { payer: wallet }); // the payer of added steps
await order.add({
  refund: output({ address: recipient, value: { lovelace: 2_000_000n } }),
}); // built now; nothing signed or sent
if (order.status === "pending") await order.run(); // a repeat returns the plan in any status
```

- **Who pays.** A step's own `payer` (`{ parts, payer }`), else the plan's payer the object holds
  (given to `builder.plan` or again to `builder.resume`) while its change address is the plan's;
  else `MISSING_PAYER`. `canSelect` and `coinSelection` are not recorded: give them in the step.
- **What it stands on.** A step may link to any step of the plan. It stands on the last step of
  its payer unless that step is `final`; of a final step it takes what the payer's read lists. The
  change of a step that is in a block counts only when the payer's read lists it, else
  `INVALID_OPTION` (`steps`): a wallet's read may be behind, and the same call later tells; a
  snapshot needs a new snapshot.
- **Its deadline.** A step whose parts give no `until` ends at the tip read by this call plus the
  plan's `ttlMs`; `plan.until` moves with it.
- **The repeat.** The same call again builds nothing and returns the plan, whatever its status:
  read `plan.status` after `add`. A name the plan has with other parts is `INVALID_OPTION`
  (`steps`). After `ABORTED` or `STORE_FAILED` while the record is written the steps may be
  recorded, and the same call tells. A repeated id: [One id, one plan](#one-id-one-plan).
- **Two writers.** The one that lost gets `VERSION_CONFLICT`: none of its steps is recorded, and
  the same call builds on the plan as it is.
- **On a plan `replan` made**, no added step may land beside an old transaction that may still land:
  one that shares no input with it is `STILL_LIVE` until that transaction is dead. One that only a
  step of the plan in a block keeps from landing (it spends an input that step spends) is waited for
  (`CANNOT_OBSERVE`, `unconfirmed`) until that step is `final`: after a rollback it could land
  beside the added step. Where steps in blocks keep several old transactions from landing, the
  wait names the one in a block last. When every other step of the plan is `final`, or in a block
  no later than that one, the plan is `final` with it and the same call is then `INVALID_STATE`
  (`final`): the message says so, and the step is paid by a plan after this one (`after`).
  `STILL_LIVE` is told first. An added step is the application's to follow, by this plan's id, as
  steps given to `replan` are: when the old plan becomes `final` after all, the added step was not
  paid, unless it passed by time (`NO_SHARED_INPUT`), and the reconciliation loop ends the line at
  the old plan.

Limits: a plan has at most 32 steps, consolidation steps counted. Without a store, a copy of the
JSON saved before an `add` does not hold the added steps, and the same `add` on it builds and pays
them again: save `toJSON()` after `add`, or use a store. The transactions of `after` the plan was
made with are not known to `add`: a step added while one of them is not in a block may take an
input it spends, and the ledger refuses one of the two. A link to an output of a final step is not
checked against the chain again. A builder that holds parts from `builder.add` cannot add steps
(`INVALID_OPTION`): resume the plan on one that holds none.

### A fragmented wallet

A step that does not fit a transaction because of the inputs its selection needs (`TX_TOO_LARGE`,
`cause: "selection"`) gets consolidation steps before it, in `builder.plan` and in `plan.add`:
`consolidate-1`, `consolidate-2`, … with `kind: "consolidation"`. Each spends many of the payer's
UTxOs and pays the payer alone, the tokens the step does not need in outputs of their own, and the
step is built on the change of the last. They are signed, sent and recorded as any step;
`plan.steps` and `plan.fee` show them and their fees before anyone signs, and `trace` gets
`{ type: "warning", code: "CONSOLIDATION_STEPS", steps, fee }`. `rest` leaves them out.

- **Parked tokens.** A later step that needs one of those tokens may spend its output. With
  `plan.add`, the parked outputs of a consolidation step that is in a block are the payer's UTxOs
  like any other, which an added step may select. Once the consolidation step is final, they are
  the payer's UTxOs for every step, a sweep among them, and `canSelect` is asked about them.
- **A sweep.** A later step of the payer with `sendAllTo` takes, without asking `canSelect`,
  every output that the payer's consolidation steps not final yet parked: they hold only what it
  let through. What a final consolidation step parked, or the steps of another payer, it takes
  only as any UTxO of its payer, where `canSelect` allows it: an added sweep whose `canSelect`
  does not hold those outputs leaves them with the payer. A step with `sendAllTo` is never
  consolidated itself.
- **`consolidate`.** At most 4 in the plan as a whole, those of `plan.add` counted;
  `consolidate: { maxSteps }` (1 to 31) sets the limit, and `consolidate: false` leaves the step's
  `TX_TOO_LARGE`. The step's `TX_TOO_LARGE` is also thrown when more are needed than the limit
  allows, or one cannot be built.

### A transaction built elsewhere as a step

A step may be a transaction built before: a `BuiltTx`, or its CBOR hex, in `builder.plan` and in
`plan.add`. It is `kind: "prebuilt"` in `plan.steps`, and its warnings are in
`plan.step(name).warnings`. Read one another party built as
[A transaction built elsewhere](#a-transaction-built-elsewhere) says.

```ts
const swap = await builder.fromCbor(tx); // the partner's bytes: read outputs, fee, missing
const swapPlan = await builder.plan({ swap, pay }, { payer: wallet }); // the wallet signs both
await swapPlan.run();
```

- **Who signs.** A plan signs a transaction given built as it signs its own: `sign()` and `run()`
  hand it to the call's signers, else to the plan's payer when it can sign, each asked for the
  keys that have not signed it yet. The witnesses it came with stay; it may also be signed on its
  `BuiltTx` before it is given, or take witnesses through `plan.addWitnesses`. So a transaction of
  another party is read before it is given: `builder.fromCbor(tx)` shows its outputs, fee,
  `missing`, `collateral` and `warnings`. A key the application does not want to sign it with is
  not among the signers it names, nor the plan's payer when a call names none. At its turn
  without a key it is `MISSING_SIGNATURES`, and nothing is sent.
- **What is read from bytes.** It is taken as it is and read from its own bytes as `fromCbor`
  reads them; what `fromCbor` refuses is refused, with the step's name, and a text that is no
  transaction at all before any request. The UTxOs it names come from the plan's earlier steps,
  `after` (the outputs its transactions' own bytes hold), `knownUtxos`, else the provider; never
  from the object.
- **Labels and change.** Its outputs are named by position. Labels come only with an object that
  `build` or `finalize` made in this process, or that `rest` gave back: of an object of `restore`
  or `fromCbor`, and of CBOR, a link by label is `UNKNOWN_LABEL`. Selectable change comes only
  with an object, and only an output its bytes put at the payer's own change address. Such a
  transaction is a step of that payer: `run()` sends the steps in order, but the ledger keeps it
  in order only where a later step spends an output of it. A transaction that spends an output of
  a step the plan builds is added afterwards with `plan.add`, once its maker has that step's hash.
- **What it uses is kept for it.** What it spends no other step spends or selects, and what it
  reads or puts up as collateral no step the plan builds spends or selects, before it or after.
  A part that spends such an output, and two steps that spend one output, are `INVALID_OPTION`
  (`steps`). Two steps may read one output, or put up one UTxO as collateral.
- **A step that never expires.** Without an end of validity (`NEVER_EXPIRES`) `plan.until` is
  undefined, and the plan is not `stopped` while the step may still land. Never sent, with an
  input another transaction spent, it can never land, but the plan cannot tell who spent the
  input: it stays `stopping`, never `stopped`, and `stop()` does not change that. Give a
  transaction built for a plan a `validity({ until })`, or let the plan build the step. A plan in
  its place (`replan`) holds that transaction byte for byte, or must spend an input of it.
- **Given back.** `rest` gives it back as a `BuiltTx` with the witnesses the plan holds, its
  labels and change marks, and no payer; the same transaction in another plan cannot pay twice,
  and a new one comes from its maker.

### Chains

Payments of one payer that are not steps of one plan are chained with `after`: a transaction of
`build()`, a plan, or a list. Their inputs are not selected again, their change at this build's
change address is, and their outputs can be named by out ref without a lookup. A plan there
stands for its steps that are in a block and not final, or may still land; a step built on a plan
that never lands is not `orphaned`, it expires by its own deadline. Without `after` the second
may select an input the first spends, and only the ledger catches it. Outputs paid to another,
and change at another address, are never selected, though a part may spend them by out ref. A
batch reads the payer once and folds the transactions with `utxosAfter`:

```ts
import { utxosAfter } from "@meshsdk/transaction";

const payer = await builder.readPayer(wallet); // one wallet read for the whole batch
const first = await builder.build(parts1, { payer });
const second = await builder.build(parts2, {
  payer: { ...payer, utxos: utxosAfter(payer.utxos, first) },
  after: first, // also hands the outputs of first to an evaluator that is not local
});
const next = await builder.plan(parts, { payer: wallet, after: plan }); // after a plan
```

Two queues on one wallet each need a snapshot of their own UTxOs (split them with `canSelect`), or
one payer's payments go one after another.

### Running a plan

`run()` looks at the chain first, then takes the steps in order: it signs a step that still needs
keys (the call's `signers`, else the payer), sends it, and waits until it is found in a block; a
step that was sent goes again, the same bytes, every `resendMs` until it is found. It returns at
`waitFor`:

| `waitFor`              | `run()` returns                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `"sent"`               | at once: it signs and sends the step whose turn it is, and waits for no block; a call moves the plan a step on |
| `"included"` (default) | when every step is in a block                                                                                  |
| `"final"`              | when every step is `final`                                                                                     |

`timeoutMs` bounds the wait, counted anew from the answer to the first send of each step in the
call. Every request of the call (a search, the tip, a read or write of the store, a submit) waits
no longer than the time left, then the call throws `CONFIRM_TIMEOUT`: a submit that did not answer
leaves the step `sent`, its outcome unknown, as a lost answer does; a write that did not answer
may have passed. A signer is bounded not by `timeoutMs` but by the step's end of validity
(`SIGNER_FAILED`, `timeout`); in `run()` the time it takes counts in `timeoutMs`, so after a slow
signer the call may end in `CONFIRM_TIMEOUT` before it sends, and the same `run()` goes on. Give a
slow signer to `sign()` first: it has no `timeoutMs`.

`sign()` signs every step up front where the signer can; a step a signer gives no witness for (a
browser wallet that does not know an input yet) stays `built`, and `run()` asks again at its turn.
A co-signer's witnesses go through `addWitnesses`. Once a step was sent, its bytes are fixed:
signatures given later change nothing. A plan that does not go on sends no step for the first
time:

| The plan                        | `run()`                                                                                        | `sign()`, `addWitnesses()`       |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| stopped by `stop()` or replaced | looks, then throws `INVALID_STATE` (`stopped`)                                                 | `INVALID_STATE` (`stopped`)      |
| a step will not land            | looks, sends again the steps it sent that stand on no dead step, then throws that step's error | `INVALID_STATE` (`stopped`)      |
| `halted`, and found again       | sends again the steps it sent and waits; `INVALID_STATE` (`stopped`) at a step it never sent   | `INVALID_STATE` (`stopped`)      |
| `final`, also after `halted`    | returns at once                                                                                | sign nothing and keep no witness |

| Error                | What it says                                                                                                                                        | What the application does                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `SUBMIT_FAILED`      | the outcome of a delivery is unknown; `details.reason` is what the submitter's error says                                                           | `run()` again: the same bytes. On `unauthorized`, fix the API key first |
| `CONFIRM_TIMEOUT`    | `waitFor` not reached in `timeoutMs`; also while a step past its end of validity may still land, or when a request does not answer in the time left | `run()` again later; it is not "not paid"                               |
| `REJECTED`           | the ledger refused a step, no delivery of it can have gone through, and every step and transaction of `after` it stands on is found in a block      | `run()` again sends the same bytes; or `stop()`, and wait for `stopped` |
| `NOT_YET_VALID`      | a step before its lower bound; nothing sent                                                                                                         | `run()` again after `retryAfterMs`                                      |
| `MISSING_SIGNATURES` | a step whose turn it is lacks keys, and nobody in the call can sign; nothing sent                                                                   | `sign`/`run({ signers })`, or `addWitnesses`                            |
| `EXPIRED`            | a step's end of validity and the margin passed and it is not found (`unsent`: never sent)                                                           | the plan does not go on: `replan` pays what is left                     |
| `SCRIPT_FAILED`      | a step is in a block with a failed script; its collateral is taken                                                                                  | the same, with the parts fixed                                          |
| `ORPHANED`           | a step stands on a step that will not land                                                                                                          | the same as for that step                                               |

Each names its step in `error.step`. A refusal by a lagging node passes on the next try.
`EXPIRED`, `SCRIPT_FAILED` and `ORPHANED` give the plan's status in `error.status`: a `stopping`
plan has steps that may still land, so they do not mean "pay again". A retry is the same call on
the same plan: a new build of the same transaction by `builder.build()` could pick other inputs,
and both could land.

### A step that does not go through

```ts
import { output, TxError } from "@meshsdk/transaction";

const plan = await builder.plan(
  {
    a: output({ address: recipient, value: { lovelace: 5_000_000n } }),
    b: output({ address: courier, value: { lovelace: 3_000_000n } }),
  },
  { id: "order-7", payer: wallet },
);
try {
  await plan.run();
} catch (error) {
  if (!TxError.is(error, "EXPIRED", "SCRIPT_FAILED", "ORPHANED")) throw error;
  // error.step: "b"   plan.landed: [a]   plan.rest: { b }, and {} after SCRIPT_FAILED
}
// later, in the reconciliation: a plan in place of this one pays what is left. A replaced plan
// names it in `replacedBy`, and the same call again returns it. A step that failed its script
// needs its parts fixed: `replan` without `steps` refuses such a plan, so it is reported
await plan.refresh();
if (plan.steps.some((step) => step.status === "failed")) {
  report(plan.id); // the application gives the steps of the new plan: replan({ id, steps })
} else if (plan.status !== "final") {
  const next = await plan.replan({ id: plan.replacedBy ?? "order-7:2" });
  await next.run();
}
```

`plan.rest` is the steps never found in a block, as `builder.plan` takes them: the parts each was
given, links kept, with its own options; a step with its own payer comes back with that payer's
change address as its payer (give the payer itself in its place to sign with it). It shows what
is left; once the plan is replaced it is empty.

What is left is paid by a plan in its place: `plan.replan({ id })` builds what its look shows open,
or the application's `steps`. Without `steps` a plan with a `failed` step is refused
(`INVALID_OPTION`, `steps`): its parts need fixing, and the steps left without it would end the
order with that payment never made. A plan made with `steps` that pay what the old plan was not to
pay is followed by its own id: when the old plan becomes `final` after all, that payment was not
made, unless a step of it passed by time (`NO_SHARED_INPUT`). Names are payments, one for one: a
step given that pays what a step of the old plans was to pay pays that and nothing else, under that
step's name. Once the old step is `final` after all, the name is kept and nothing is built again
under it; under a new name a later `replan` without `steps` builds it again, and the recipient is
paid twice. One step that pays for two old steps keeps only one of their names, and two steps that
share the payments of one old step give one of them a new name: either can pay twice in the same
way. The payer, deadlines and data options are the old plan's unless given; deadlines given are the
new plan's, also for the steps it holds of the old plan, and carry on. Never
`builder.plan(plan.rest)`: nothing keeps that plan apart from the old one.

- A final step is never built again; a link to one is filled in with its output. A step that is in a
  block and not final becomes a step of the new plan: the same transaction under its name, with the
  witnesses and the block the old plan recorded (`taken: true` in the record). The new plan looks
  for it, sends its bytes again after a rollback, and is `final` only once it is. A step it builds
  need not stand on it: one of the same payer spends its change, and one of another payer, or one
  given built that spends no output of it, is built and recorded at once, so `run()` sends it before
  that step is `final`. A link may name it, and its name is not given again. It is in the new plan's
  `landed` at once, and out of it after a rollback until a look finds it again; in `live` while it
  is out of its block and may still land; never in `rest`; `until` counts its end of validity. Its
  fee is in both plans' `fee`. The call does not wait for `final`: to have it wait, call once every
  step in `landed` is `final`. A plan whose every step is final or in a block has nothing left to
  pay: `replan` of it waits (`CANNOT_OBSERVE`, `unconfirmed`) and is `INVALID_STATE` (`final`) once
  it is final; to pay more, `plan.add` steps to it while it is `pending`, or make a plan after it
  (`after`). One that is not takes no step: a stopped one (by `stop()`, a mark, or a look that
  found an old transaction) sends nothing more, and one that came to `stopped` by its steps once
  sends no step it never sent; once a rollback leaves a step of it open, the same call makes the
  plan in its place.
- After a rollback that is not undone (the step's end of validity passed, or another transaction
  took its input) a step built that stands on it cannot land, and one that does not may have landed.
  The new plan shows it: that step `expired`, the steps on it `orphaned`, the others as the chain
  shows them, the plan `stopped` and never `final`. `replan` of it builds what is left again, that
  step among it, on an input that step spends, when its end of validity came from `ttlMs`; a step
  that landed is held by the new plan while it is in a block and kept once it is `final`, never
  built again, so each payment is made once. A step whose own parts, or whose transaction given
  built, set an end that has passed is refused, and the application gives `steps`; the refusal comes
  once the payers' reads are checked, so a read that lists an output of that step while the search
  does not find it answers first (`CANNOT_OBSERVE`, `unconfirmed`). Such a step may be in a block
  the search does not show, or have been sent by another party before its end, also one the plan
  never sent or holds without every witness: another party may hold a copy it signed. It is refused
  only on the call's own look: once its end and the margin have passed by the tip and the clock,
  and the search answered that it does not find it. Until then, also while the search fails, the
  call waits (`CANNOT_OBSERVE`, `unconfirmed`); a provider that cannot search at all never answers,
  and the call says so (`CANNOT_OBSERVE`, `noSearch`), as it does for any old transaction a step
  built could land beside, before its end and the margin too. Where others took every input of it,
  see the dead ends below.
- What a new plan cannot hold is waited for, with `CANNOT_OBSERVE` (`unconfirmed`, again after
  `retryAfterMs`): a transaction in a block with a failed script, and one of a plan before the one
  replaced that a look found in a block, each until it is `final`; a step in a block the search
  gave no answer for; a step that cannot stand on the step before it of its payer when that step
  is in a block (the payer's read does not show its change yet, or `canSelect` refuses it), until
  that step is `final`; and an old transaction that only a step in a block keeps from landing (it
  spends an input that step spends), beside a step built that does not stand on that step, until
  that step is `final`: after a rollback it could land beside the step built. Any other old
  transaction a step built could land beside is `STILL_LIVE`, which is told first.
- The first step built for a payer spends an input of each old transaction that may still land
  and stands on no other, dead ones too, when that payer holds one: the ledger lets one of the two
  land, never both. Without such an input it throws `STILL_LIVE`; the same call passes after
  `details.safeAfter`. So open steps of two payers wait until they are dead.
- An address that lists an output of an old transaction the search does not find refuses the call
  (`CANNOT_OBSERVE`). The addresses an old transaction pays are read once the look calls it
  `expired`, also when it was found in a block once: a search may lose a transaction that stays in
  its block. An address a payer's read of the call lists, through the provider or a wallet, is not
  read again; a payer given as a snapshot `{ changeAddress, utxos }` is the application's own list,
  not a read, and its addresses are read as the others are. Of those of the dead and the used-up
  transactions, at most 16 are read in a call, in the order of the line, and the warning's `unread`
  counts the rest; of those of the ones found in a block once, at most 16 more, and while one is
  left unread the message of the dead end of two payers below is not given. A search that fails is
  no answer: past the end and the margin it is `CANNOT_OBSERVE` (`unconfirmed`), not `STILL_LIVE`. A
  read of an address that fails or gives no list throws its error (`PROVIDER_FAILED`); an empty list
  is an answer, and so is a list the provider's own cache gives, which the library does not control.
- The one case that goes by time: an old transaction this call's look answered "not found", past its
  end and the margin, that shares no input with the new plan. `trace` gets `NO_SHARED_INPUT` once
  the new plan is recorded. Two things then make the new plan pay twice: a provider that hides a
  landed transaction from that look, and shows none of its outputs in the payers' reads or at the
  addresses it paid (at most 16 a call, and of an old transaction two plans on the first 16 it pays,
  which is all its entry keeps; the warning's `unread` counts the rest); and a switch of the network
  to a fork deeper than the margin and less deep than `final`, where the old transaction landed
  before its end. So the margin of a plan whose steps may pass by time should cover the depth of the
  rollbacks it defends against: about the time its `confirmations` take, as in the scenario of a
  large sum. A wallet payer whose own read returns its list from before such a hidden transaction
  landed does the same: that read covers the wallet's addresses, which are then not read through
  the provider, so the transaction passes by time and its recipient can be paid twice.
- Dead ends, where no plan is made: nothing left to build (every step is final, in a block or a
  consolidation step: `INVALID_OPTION`, `steps`), a step that `failed` its script (`INVALID_OPTION`,
  `steps`: its parts need fixing), a step left whose own end of validity has passed
  (`INVALID_OPTION`, `steps`: built again it could not land; once the margin has passed too and the
  search answered that it does not find it), or a step given built that spends, reads or puts up an
  output of a step the new plan does not hold as the same transaction (`INVALID_OPTION`, `steps`:
  that output never exists in the new plan), unless `steps` are given; a plan whose every step is in
  a block, which is waited for and then `final`; an old transaction found in a block once and gone,
  its inputs spent by others; a step given built that never expires, which the new plan neither
  holds nor shares an input with; an id another plan took after a crash that followed the mark.
- A dead end of two payers: a step of one payer was in a block, a rollback took it out (and the
  steps on it, `orphaned`), and its end of validity passed, while the step of the other payer was
  not sent again before its own end: it was taken out too, or never sent, as when its signer failed
  in the pass that made the plan. `run()` sends the same bytes again after a rollback while they are
  valid, but in the loop a step the new plan took is often past its end already (the plan is made
  once the old plan's other steps are past theirs), so the dead end comes with the loop running. A
  step built for one payer shares no input with the old step of the other, and time never settles a
  step that was in a block, so `replan` is `STILL_LIVE` without `safeAfter`. Its message says what
  the library knows: the step was found in a block, the search does not find it now, and its end of
  validity has passed; a rollback took it out, and it lands again only if the chain goes back to the
  blocks that held it, or the provider lost it while it stayed in its block. A step the call builds
  is not kept apart from it, and the application decides how to pay what is left. The chain never
  goes back more than `k` blocks (the security parameter: 2160 on mainnet, about 12 hours on
  average, longer if the chain slows). Once more than `k` blocks are on the chain after the end of
  validity of every transaction of the line that may still land, not only those the message names,
  the chain cannot go back to a block that holds one of them, and a plan of the application's own
  that pays what is left, under the names of the steps it pays for, is safe from then on, unless the
  provider lost them while they stayed in their blocks: another provider's search tells. Before
  that, such a plan is kept apart from nothing the library knows, and may pay twice. Where the cap
  of the address reads left an address of such a step unread, and for a transaction of the plans
  before that was found in a block before the plan that keeps it was made, which is kept without its
  end (`seenBefore`), the message is the one of any pair. A plan with steps of several payers wants
  a `ttlMs` longer than the longest time its loop may be down, and signers that answer.
- The old plan is marked first, by compare-and-set: `replacedBy` names the new plan, and the old
  one signs and sends nothing more. The id is the new plan's alone. The same call again returns
  the same plan, also after a crash that followed the mark; with other options, the plan recorded
  with the first; calls on one object never overlap, a second waits for the first, so a call is
  never awaited from inside a callback the plan calls (a store's `load` or `save`, a provider, a
  signer): it would wait for the call that called it. Without a store only the object that made
  it does so, an object resumed from a JSON saved after the mark refuses (`INVALID_STATE`), and a
  copy of the old plan's JSON saved before the call can be replaced again, which pays again: save
  both JSONs, the old plan's with its mark and the new plan's, after `replan` and before `run()`,
  or use a store.
- A transaction that runs a Plutus script, found by a provider that does not say whether its
  scripts passed, is `CANNOT_OBSERVE` (`noValidity`); a plain payment counts as passed.
- A new plan that finds an old transaction in a block stops (`INVALID_STATE`, its hash in
  `error.txHash`): `replan` it, which waits until that transaction is `final` (`CANNOT_OBSERVE`,
  `unconfirmed`); when that finds nothing left to build and no plan of it names one in its place,
  the old plan made the payment; when it refuses a `failed` step, nobody made that one. A stopped
  plan sends nothing more, also not a step it holds of the old plan that a rollback took out of its
  block: such a step comes back only if the network lands it again, and otherwise `replan` of the
  stopped plan builds it again.

### Refusal to sign; edits on a preview

```ts
import { TxError } from "@meshsdk/transaction";

const preview = await builder.build(pay, { payer: api }); // a preview without a plan: no deadline, nothing recorded, signed or sent
showOrder(preview); // an edit of the order before it is confirmed is a new preview; the plan is made on confirmation
const plan = await builder.plan(pay, { payer: api }); // the CIP-30 api pays and signs
try {
  await plan.sign();
} catch (error) {
  if (!TxError.is(error, "SIGN_DECLINED")) throw error; // "built", nothing changed; whether to ask again is the application's choice
  if (await askAgain())
    await plan.sign(); // the same body, the same txHash
  else await plan.stop(); // the plan signs and sends nothing more
}
if (plan.status === "pending") await plan.run();
```

An order is edited on previews of `builder.build()`, before a plan exists: a plan's transactions
are fixed, and new content is a new plan.

### The wallet submits

```ts
const plan = await builder.plan(pay, { id: orderId, payer: api }); // a builder with a store, in the browser
await plan.run({ submitter: api }); // submitTx of the wallet; the tip and the search are the provider's
// a submitTx error (TxSendError) is SUBMIT_FAILED, not a refusal: the outcome is unknown, the code is
// in details.walletCode; after a reload of the tab the same run() sends the same bytes:
const resumed = await builder.resume(orderId, { payer: api });
await resumed.run({ submitter: api }); // given in each call: see Payer, signer, submitter
```

### Without a wallet: an address or a snapshot

```ts
// By address: UTxOs through the provider; signatures come from the call's signers or addWitnesses
const byAddress = await builder.plan(pay, { payer: userAddress });

// By snapshot: nothing is read; what a CIP-30 wallet returns can be passed as it is
const snapshot = {
  changeAddress: await api.getChangeAddress(), // hex
  utxos: (await api.getUtxos()) ?? [], // CBOR
};
const bySnapshot = await builder.plan(pay, { payer: snapshot });
await bySnapshot.run({ signers: api });
```

### A cold signer

A transaction built by a machine with a provider and signed elsewhere is an ordinary plan.

```ts
const plan = await builder.plan(pay, { payer: coldAddress });
const { tx } = plan.step("main"); // unsigned: goes to the cold signer
// on the cold machine, which has no builder: a wallet's signTx(tx, true), or a key:
//   const witnessSet = await signWitnesses(keySigner(coldKey), tx);
// ... later, with the witness set or the signed transaction it returns:
await plan.addWitnesses(witnessSet); // INVALID_WITNESS (wrongBody) for a witness of no step's body
await plan.run();
```

Without a plan the same goes through the transaction of `build()`: `built.tx` out,
`built.addWitnesses(witnessSet)` back, `built.submit()`. A machine that has only the bytes makes
the object of them: [`builder.fromCbor(tx)`](#a-transaction-built-elsewhere), on a builder without
a provider with the UTxOs of the inputs in `knownUtxos`.

A body that already went to a signer or to the network is never turned into a plan: a plan
with the same parts is another transaction, and both could land.

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

const lock = await builder.plan(
  output({
    address: builder.scriptAddress(validator),
    value: { lovelace: 10_000_000n },
    datum: { type: "inline", data: mConStr0([owner, deadline]) },
    label: "vesting",
  }),
  { payer: wallet },
);
await lock.run({ waitFor: "final" }); // its output goes into the parts of another plan
const unlock = await builder.plan(
  [
    spend.plutus({
      utxo: outputOf(lock.step("main"), "vesting"),
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
  await unlock.run();
} catch (error) {
  if (!TxError.is(error, "NOT_YET_VALID")) throw error; // before the deadline: nothing sent
  await new Promise((resolve) => setTimeout(resolve, error.details.waitMs)); // error.retryAfterMs is the same
  await unlock.run();
}
```

Times are POSIX milliseconds. A script's interval lies within `[from, until]`, so a script that
needs its lower bound strictly after a deadline gets `from: deadline + 1`. See [Time](#time).

### Send-all

```ts
const sweep = await builder.plan([], {
  payer: wallet,
  sendAllTo: newAddress, // every selectable UTxO of the payer, less the fee, to one address
});
await sweep.run();
```

`sendAllTo` spends every selectable UTxO of the payer and sends what is left over the outputs,
deposits and fee to one address, in several outputs when its tokens exceed `maxValSize`.
`canSelect` narrows them.

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
  const plan = await builder.plan(
    output({ address: SHOP, value: { lovelace } }),
    { id: orderId, payer: userAddress },
  ); // the provider is probed (CANNOT_OBSERVE: nothing built); recorded before it returns; a repeat with the same id and parts returns the recorded plan
  return { tx: plan.step("main").tx }; // the body without signatures
}

// the browser: const witnessSet = await api.signTx(tx, true); a full transaction from the wallet works too

export async function submitPayment(orderId: string, witnessSet: string) {
  const plan = await builder.resume(orderId); // any instance
  await plan.addWitnesses(witnessSet); // INVALID_WITNESS (wrongBody) when the signature is not of this body
  await plan.run({ waitFor: "sent" }); // looks, records the delivery, then submits
  return { orderId, txHash: plan.step("main").txHash }; // the hash of a step never changes
}
```

The store's compare-and-set makes several instances safe: two of them never record two plans
under one `id`, and an instance that lost a race reads the record again.

The store does not keep plans with different ids apart. Payouts from one paying wallet on several
instances collide on its UTxOs: when two select the same one, one lands, and the other is refused
until its end of validity and the margin pass, or for good when it was found in a block once, a
rollback took it out and others spent its inputs: no time settles that one. Give each instance or
queue its own UTxOs with `canSelect`, or run one payer's payouts one after another with `after`;
see [Chains](#chains).

### One id, one plan

On a builder with a store every plan needs an `id` (`MISSING_ID`), the key of its record.
`await builder.plan(steps, { id })` reads the store first: an `id` recorded with the same steps
and options returns the recorded plan as recorded, and reads nothing but the payer's change
address, so a repeated request handler is safe; other steps or options are `PLAN_EXISTS`, and
nothing is written. After `plan.add`, the same steps are those the plan was made with, or all its
steps in order. Compared: the steps as given (links kept; one built before by the hash of its
body), their data options and each payer's change address, the plan's data options, the network
and the deadlines the call gives. Not compared: the builder's `planDefaults`, `after` and
functions. The comparison is strict: an option the record holds that the call leaves out, or a
default the call states that the record does not hold, is `PLAN_EXISTS`. A known `id` is opened
with `await builder.resume(id)`; a new id is for a new order, and under a new id the same steps
are paid again.

Recorded: the steps, the data options (`knownUtxos`, `registeredPools`, `extraKeyWitnesses`,
`topUpCollateral`, `collateralReturn`, `consolidate`, and a step's `sendAllTo` and `fee`), each
payer's change address and the three effective deadlines. Not recorded: wallets, signers, the
submitter, functions (`canSelect`, `coinSelection`, `trace`) and `signal`. Every change is saved
before the method returns: a new plan before it is returned, a delivery before the bytes leave.

Two processes may hold one plan, and both send the same bytes. A write over a revision another
writer changed reads the record again and applies the same fact, up to three times, then
`VERSION_CONFLICT`: go on through `resume`. `builder.resume(json)` on a builder with a store takes
the stored record when its revision is the same or later; a JSON ahead of the store is
`VERSION_CONFLICT`, so a `stop()` the store holds is never written over. A read of the store older
than the revision the object holds is not taken: the object keeps its own record, and while the
store answers such reads, a write over a later revision ends in `VERSION_CONFLICT`, with nothing
sent.

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
const plan = await builder.plan(parts, { id: "payout-7", payer: wallet });
await plan.run(); // records the delivery "outcome unknown", then submitTx; the process crashes
// after the restart, on any instance (resume needs a store and an id):
const resumed = await builder.resume("payout-7", { payer: wallet }); // live objects are given again
await resumed.run({ waitFor: "final" }); // looks; "sent": the same bytes, then waits for 30 blocks on top of the step's block (the default confirmations)
// the reconciliation after a restart: resume(id) and run(), below
```

| Crash                           | In the store                             | After `resume`                                                  |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| before the delivery is recorded | `signed`                                 | `run()`: the first delivery                                     |
| after it, before the answer     | `sent`, outcome unknown                  | `run()`: the same bytes                                         |
| between signatures              | the signatures received                  | `addWitnesses` with the rest                                    |
| while `builder.plan()` builds   | nothing, or the plan with nothing signed | the same `builder.plan()` call: the recorded plan, else a build |
| while `stop()` writes           | the mark, or none                        | `stop()` again                                                  |

### Signatures over several days

```ts
import { guard, output, spend } from "@meshsdk/transaction";

const plan = await builder.plan(
  [
    spend.native({ utxo: vaultUtxo, script: vaultScript }),
    output({ address: vendor, value: { lovelace: 50_000_000n } }),
    guard.pubKey({ keyHash: aliceKeyHash }),
    guard.pubKey({ keyHash: bobKeyHash }),
  ],
  { id: "payout-17", payer: vaultAddress, ttlMs: 3 * 86_400_000 }, // the step's end of validity: three days, recorded in the plan; no horizon limits a native script
);
const { tx } = plan.step("main"); // the body without signatures goes to both
const monday = await builder.resume("payout-17"); // any instance
await monday.addWitnesses(aliceWitnessSet); // recorded; missing: Bob
const wednesday = await builder.resume("payout-17");
await wednesday.addWitnesses(bobWitnessSet); // "signed"
await wednesday.run({ waitFor: "final" });
```

A body with some signatures may land until its end of validity, since the others may still sign
it.

### Reconciliation of unfinished plans

The application keeps the ids of its plans that are not `final`. It writes an id into that list,
with the order or payout it pays, before the plan's first `await`: a crash inside `run()` may come
after the delivery is recorded and the bytes have left, and an id written only after `run()`
returns would then be missing from the list, with nobody to learn whether it paid. It removes the
id only once a plan of its line, the plan itself or one made in its place, is `final`. A retried
job uses the same id, never a fresh one: under a fresh id it may pay a second time. Once a minute
and after a restart it calls `resume(id)` and `run()` for each.

```ts
// Once a minute and after a restart (a builder with a store)
for (const id of await db.openPlanIds()) {
  // plans that are not final
  try {
    let plan = await builder.resume(id, { payer: await payerFor(id) });
    await plan.refresh();
    // A final plan has paid: the line ends there. Else a plan made in its place is named in
    // `replacedBy`; and a plan gets one once no step of it may still land outside a block
    // (`live` is empty) while a step of it is in none. Its steps that are in a block go on as
    // steps of the new plan. The same call again returns that plan. A pass makes one plan
    // at most: a plan given less time than a pass takes is dead as soon as it is made
    let made = false;
    while (
      plan.status !== "final" &&
      (plan.replacedBy !== undefined ||
        (!made &&
          plan.live.length === 0 &&
          plan.landed.length < plan.steps.length))
    ) {
      made ||= plan.replacedBy === undefined;
      plan = await plan.replan({ id: plan.replacedBy ?? `${plan.id}:next` });
      await plan.refresh();
    }
    await plan.run({ waitFor: "sent" }).catch(report); // a look, then what can be done at once
    if (plan.status === "final") await db.close(id, plan.status); // release the goods
  } catch (error) {
    report(error); // the pass goes on; the next one repeats the call
  }
}
```

`resume` reads the store only: it makes no request to the chain and does not call the payer; the
provider is probed before the first delivery. Errors with `retryable: true` are a wait, not a
failure. With `waitFor: "sent"` each pass moves a plan one step on. A plan with a step that will not
land is kept while another step of it may still land outside a block (`live`), which may take until
that step's end of validity and the margin; then the loop pays what is left by `replan` ([A step
that does not go through](#a-step-that-does-not-go-through)). It does not wait for the steps that
are in a block to be `final`: the new plan holds them, and is `final` only when they are. A plan
whose steps are all in a block is left to become `final`. After a rollback the loop needs nothing
more: `run()` of the new plan sends such a step again, the same bytes while they are valid, and when
it can no longer land the new plan stops in its turn and gets a plan in its place. Steps of two
payers where a rollback took one out of its block past its end, while the other was not sent again
before its own end (the loop was down, or its signer failed in the pass that made the plan), get no
plan in their place: every pass reports `STILL_LIVE`, and the order stays in the list until the
application decides how to pay what is left, as the dead ends of `replan` say. A new plan stopped by
an old transaction found in a block sends nothing, a step it took that a rollback took out of its
block among it: the loop then waits for that step's end of validity, and replaces the plan. Where
`replan` still waits (`CANNOT_OBSERVE`, `unconfirmed`), the next pass asks again. A step left that
could only be built dead (its own end of validity has passed, or it was given built and stands on a
step the new plan does not hold) is not built again: the pass reports `INVALID_OPTION` (`steps`),
writes nothing, and the order stays in the list until the application gives `steps` of its own. A
pass makes one plan in place of another at most, as a second bound: a plan given too little time (a
`ttlMs` and margin shorter than a pass takes) is dead as soon as it is made, and gets a plan in its
place on every pass, one record each; the errors of each pass (`EXPIRED`, `unsent`) show it. The
loop looks at each plan of a line before it goes on: a line ends at its first `final` plan, which
has paid, also an old plan whose step landed late after it was replaced; only a plan that is not
final is followed to the plan in its place. A `stopped` plan that a later look finds a step of is
`stopping` or `final` again: the loop follows it as it is, and a plan already made in its place
stops by itself once it finds that step. Steps given to `replan` that are not the old plan's, and
steps added to a plan `replan` made, are the application's own to follow, by that plan's id: a line
that ends at an old plan does not run them. A step given in place of an old step keeps that step's
name: under a new name, once its plan stops, the loop's `replan` builds it again, and pays twice
where the old step landed. A line with a `failed` step (whose parts need fixing) stays in the list,
also when other steps are left to build, and the loop reports its `INVALID_OPTION` on every pass
until the application decides. A plan the application stops on purpose leaves this list: the loop
would pay what is left of it. A payer is needed only to sign: a plan whose record holds every
signature needs none, and a separate signer or sender is given to `run({ signers, submitter })`. A
plan with a step of another payer needs that payer's signer in this `run()`, as
`run({ waitFor: "sent", signers: [wallet, treasury] })`: without it that step is never signed, and
with a short `ttlMs` the loop makes a plan in its place on every pass, one record each.

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
keep such columns beside the record. A store without compare-and-set can record two different
plans under one `id`, which the library cannot detect. A record is kept while its plan is not
`final`: a `stopped` plan may be found again, and its line is followed from it. Tests use
`memoryPlanStore()`. Each store below ends with `await checkPlanStore(store)`, run once when a
store is set up, not at every start: it checks two writers, a lost acknowledgement, a crash
between a write and a send, and that `load` returns a record member by member as it was saved; it
leaves a few records under ids that start with `checkPlanStore:`, and rejects with a plain `Error`
naming the check that failed.

**The record.** `plan.toJSON()`, and what a store holds, shortened:

```json
{
  "kind": "TxPlan",
  "version": 2,
  "id": "order-7",
  "rev": 5,
  "status": "pending",
  "network": "preprod",
  "deadlines": {
    "ttlMs": 600000,
    "expiryMarginMs": 600000,
    "confirmations": 30
  },
  "steps": [
    { "name": "lock", "status": "included", "txHash": "40da3c83…", "…": "…" },
    { "name": "unlock", "status": "signed", "txHash": "9b1e07f2…", "…": "…" }
  ],
  "options": { "changeAddress": "addr_test1…" }
}
```

Applications read `id`, `rev`, `status`, `stopped` (the plan signs and sends nothing more: set by
`stop()`, by `replan`, or when a plan `replan` made finds an old transaction in a block),
`halted` (the plan came to `stopped` by its steps), `replaces`, `replacedBy`, `deadlines` and, of
each step, `name`, `kind`, `taken` (the step is a transaction of the plan this one was made in
place of, held as it was), `status` and `txHash`; the rest is the library's. `stopped`, `halted`
and `taken` are `true` when present and never removed. `replacedBy` names the plan `replan` made
in place of this one; that plan holds `replaces`, this plan's id. A step's `tx` is its transaction
with the witnesses the plan holds, written shorter than `toJSON()` of a `BuiltTx`, which
`restore` takes and a step's `tx` is not; the reader reads its bytes again, compares the hash and
verifies every witness. `seen` stays when a rollback takes a step out of its block. This release
writes version 2 and reads no other.

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

**A browser or a mobile application**: asynchronous key-value storage, with the application as
its only writer; saves run one after another, so that each compares and writes in one step. In a
browser, two tabs on one key are two writers: web storage has no compare-and-set across tabs, so
keep one plan to one tab (the checkout), or use a server store; cleared site data loses the
records. On SQLite, the server recipe applies as it is.

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

const store = keyValuePlanStore(deviceStorage); // a mobile platform's storage
await checkPlanStore(store);
const webStore = keyValuePlanStore({
  getItem: async (key) => window.localStorage.getItem(key),
  setItem: async (key, value) => window.localStorage.setItem(key, value),
});
await checkPlanStore(webStore);
```

A plan without a store lives in its object only: the whole lifecycle works, and a crashed
process loses it unless the application keeps `JSON.stringify(plan)` and gives it to
`builder.resume(json)`.

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
const claim = await inMemory.plan(
  spend.plutus({
    utxo: locked,
    script,
    redeemer: { data: (tx) => mConStr0([tx.self]) }, // the input's own index
  }),
  { payer: wallet },
);
await claim.run();
```

## Deadlines and waiting

- **Deadlines**: `ttlMs`, `expiryMarginMs` and `confirmations` (`PlanDeadlines`): the plan's
  options, else the builder's `planDefaults`, else the built-in values. The effective values are
  worked out once, when the plan is made, and all three are written into its record
  (`deadlines`); neither `resume` nor a change of `planDefaults` changes them, so the margin of an
  unfinished plan cannot be raised.
- **Waiting**: `waitFor`, `timeoutMs`, `pollMs` and `signal` (`RunOptions`), options of a call of
  `run()` (`timeoutMs` and `pollMs` also of `awaitInclusion()` of a transaction of `build()`), never
  recorded. `waitFor` and `timeoutMs` are the call's, else built in; `pollMs` the call's, else
  `planDefaults`, else built in: the pace of polling depends on the provider's limits.
- **`resendMs`**: `planDefaults`, else built in; never written into a plan.

| Setting          | Default                                                                                  | What it sets                                                                                                                                                                                                                                                | What it costs                                                                                                                                                                                                                                                      | Allowed                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `ttlMs`          | `600_000` (10 min)                                                                       | builder and plan; recorded. The end of validity of a step whose parts set no `validity({ until })`: `max(tip time, from) + ttlMs`; also the time left to sign it                                                                                            | longer: the outcome after a lost answer is known later (`ttlMs + expiryMarginMs`); shorter: the signature does not come in time, the step is `expired` (`EXPIRED { unsent: true }`), and the plan does not go on                                                   | `> 0`; for Plutus, a deadline within the horizon (`INVALID_STATE`, `pastHorizon`) |
| `expiryMarginMs` | `600_000` (10 min)                                                                       | builder and plan; recorded. The margin after a step's end of validity: `expired` once the tip time and the local clock are past the end of validity plus the margin. Not `final`                                                                            | longer: `expired` comes later; shorter: a rollback deeper than the margin is more likely, and could bring back a step called `expired`                                                                                                                             | `>= 0`; `0` on an emulator and in tests only                                      |
| `confirmations`  | `30` (about 10 min on average)                                                           | builder and plan; recorded. The depth of `final`: at least this many blocks on top of the step's block. The margin does not change it                                                                                                                       | more: `final` later, 20 s per block on average, though blocks come unevenly; when the chain stalls, `final` waits for blocks, not for time; fewer: a rollback after `final` is more likely. Needs a provider with block heights, else `CANNOT_OBSERVE` (`noDepth`) | a whole number `>= 0`; `0` on an emulator and in tests only                       |
| `waitFor`        | `"included"`                                                                             | the call only: how far `run()` goes: a delivery, every step in a block, or every step `final`                                                                                                                                                               | further: the caller is busy longer; with `"sent"` only a later call sees the block and `final`                                                                                                                                                                     | `"sent"`, `"included"`, `"final"`                                                 |
| `timeoutMs`      | `120_000`; for `"final"` `confirmations × 30_000 + 120_000` (`1_020_000`, 17 min, at 30) | the call only: how long `run()` waits for `"included"` or `"final"`, counted anew from the answer to the first send of each step in the call; every request of the call waits no longer than the time left. Then `CONFIRM_TIMEOUT { waitedFor, timeoutMs }` | longer: the caller is busy longer; shorter: `run()` is called again more often                                                                                                                                                                                     | `> 0`                                                                             |
| `pollMs`         | `5_000`                                                                                  | the call, else the builder: the pause between two looks at the search and the tip while waiting                                                                                                                                                             | shorter: more requests (formula below), up to the provider's limits; longer: inclusion, `final` and `expired` show up to `pollMs` later; with `pollMs` close to `timeoutMs` the call polls once or twice                                                           | `> 0`                                                                             |
| `resendMs`       | `120_000`                                                                                | the builder only: how often the same bytes of a step that was sent go again while it is not found and a call waits; with a store, after reading the record                                                                                                  | shorter: more submissions and `load`s; longer: a transaction dropped from the mempool comes back later                                                                                                                                                             | `>= pollMs` of the builder                                                        |

The built-in `timeoutMs` for `"final"` uses the plan's recorded `confirmations`: one and a half
times the average block time, since blocks come unevenly; a call's `timeoutMs` is taken as it is.
Every number is finite. The builder's defaults are checked by its constructor, a plan's deadlines
by `builder.plan()`, wait options at the start of `run()`, before any request; a value out of
range is `TxBuildError` `INVALID_OPTION { option, value, allowed }`. A call polling less often
than `resendMs` is fine: bytes go again on a poll, never more often. The Plutus horizon depends on
the tip and on `from`: `builder.plan()` and `plan.add` check it for each step, and an end of
validity past it is `INVALID_STATE` (`pastHorizon`), with nothing built.

**Not configurable:** up to three repeats of a write another writer overtook, then
`VERSION_CONFLICT`. A plan's time is the chain's: a step expires only when the provider's tip and
the local clock are both past its end of validity plus the margin, and a tip more than two
minutes ahead of the local clock is neither taken nor remembered: that look has no tip, so it
expires nothing and counts no depth, `trace` gets the warning `TIP_AHEAD_OF_CLOCK`, and later
looks go by their own tips. While a step past its end of validity may still land, a call that
waits ends in `CONFIRM_TIMEOUT`, not `EXPIRED`. A provider's lagging tip does not stop a plan from
being built: the end of validity is counted from it, and a step may expire before it is signed.
`REJECTED` and `EXPIRED` say so in `details.tipAgeMs`, the age of the last tip read, by the local
clock.

**Formulas.**

- After a lost answer, a step is `expired` once the tip time and the local clock pass its end of
  validity plus `expiryMarginMs`. With the default end of validity that is
  `ttlMs + expiryMarginMs` from `max(tip time, from)`: from the build when `from` is not in the
  future (about 20 minutes by default), plus the next block and poll (up to `pollMs`).
- `final` shows once `confirmations` blocks have grown on top of the step's block:
  `confirmations × 20 s` on average (about 10 minutes by default), give or take minutes, plus the
  poll that sees it (up to `pollMs`).
- Waiting costs about `(steps not final + 1) × 60_000 / pollMs` requests a minute: a search of
  each step that is not final and one tip per poll; plus a submission of a sent step's bytes
  every `resendMs` while it is not found (with a store, and a `load`). By default, with one step:
  24 requests a minute and one submission every 2 minutes. On Blockfrost a found step costs two
  requests (36 a minute); with the subclass of [Providers and networks](#providers-and-networks) a
  tip costs two requests and a found step three (60 a minute). With a provider that returns block
  heights itself, they come with the tip and the search: depth costs no requests of its own.
- Plutus: the end of validity is not past `max(tip, from)` plus 3k/f slots. The default one is
  counted from the same `max(tip time, from)`, so `ttlMs` stays below the horizon itself.

**Scenarios.**

| Scenario                                    | What to set                                                                                                                                                                                        | Values                                                                                                                                                                                                                                                 | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a dApp, a payment from the browser          | the defaults                                                                                                                                                                                       | `run()`; `timeoutMs: 120_000` (the default)                                                                                                                                                                                                            | the page waits for a block for up to 2 minutes; on `CONFIRM_TIMEOUT` it shows "waiting" and calls `run()` again; after `EXPIRED` the plan does not go on, and the application decides what follows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| a server handler                            | `waitFor: "sent"` in the call, a builder with a store, and the reconciliation                                                                                                                      | `new TxBuilder({ network, provider, store })`; `run({ waitFor: "sent" })` in the handler; the reconciliation once a minute and after a restart                                                                                                         | the answer right after the delivery; the block and `final` are seen by the reconciliation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| a large sum, or delivery of goods           | the plan's `confirmations` from 180 up to k blocks (2160) and `expiryMarginMs` from 1 h to 12 h: the depth protects `final`, the margin `expired`; a background task waits with `waitFor: "final"` | `confirmations: 180` … `2160`, `expiryMarginMs: 3_600_000` … `43_200_000`; in the task `run({ waitFor: "final", pollMs: 60_000 })`, the default `timeoutMs` `5_520_000` … `64_920_000`; a builder with a store                                         | goods go out once that many blocks are on top of the step's block: after 1 h … 12 h on average; when the chain stalls, `final` waits for blocks, not time; the background task waits, not the handler; once the steps are signed, the task needs neither payer nor signer; with a poll a minute `final` shows up to a minute later, about 2 200 Blockfrost requests in 12 h instead of 26 000; the outcome after a lost answer is known after up to 1 h 10 min … 12 h 10 min                                                                                                                                                                                                                                               |
| a hardware wallet, or slow signing          | `ttlMs` of 20–30 min                                                                                                                                                                               | `ttlMs: 1_200_000` … `1_800_000`                                                                                                                                                                                                                       | the signature comes in time; the outcome after a lost answer is known after up to 30–40 min; a step signed too late is `expired`, and the plan does not go on                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| signatures over several days, native script | `ttlMs` in days, a builder with a store                                                                                                                                                            | `ttlMs: 3 * 86_400_000`                                                                                                                                                                                                                                | a signing window of three days; the outcome after a lost answer is known after up to three days and 10 min                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Plutus                                      | `ttlMs` no longer than the horizon: 129 600 slots (36 h) on mainnet and preprod, 25 920 slots (7 h 12 min) on preview                                                                              | `126_000_000` (35 h) on mainnet and preprod, `25_200_000` (7 h) on preview; the limits are `129_600_000` and `25_920_000`. Keep the gap: a node counts the horizon from its own tip, and a lagging one may refuse an end of validity right at the edge | further: `INVALID_STATE` (`pastHorizon`), nothing built; a network whose horizon is not known gets no check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| an emulator, and tests                      | nothing is required; for fast tests `expiryMarginMs: 0` and `confirmations: 0`                                                                                                                     | `planDefaults: { expiryMarginMs: 0, confirmations: 0 }`; for fast tests also `pollMs: 10, resendMs: 10`                                                                                                                                                | `expired` right after the end of validity (`expiryMarginMs: 0`); `final` right after inclusion (`confirmations: 0`). The emulator's tip is its current slot, and time moves only by `advanceTo`, never by `submitTx`; pauses between polls and `timeoutMs` count real time. A step expires only when the local clock is past its end too, and the emulator starts at the current time: a test that wants `expired` starts it at a past `slot` (`TxEmulator.create({ slot })`), or moves `Date.now` with it. With `confirmations` above 0, `final` comes that many slots after inclusion (`advanceTo`): the emulator makes a block in every slot. With the default margin, `expired` comes 10 min after the end of validity |

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
const payout = await builder.plan(parts, {
  id: "payout-42",
  payer: treasury,
  expiryMarginMs: 3_600_000, // this plan only: a margin of 1 h before expired
  confirmations: 180, // final once 180 blocks are on top of the step's block; 30 by default
});
// recorded: ttlMs 600_000 (built in), expiryMarginMs 3_600_000, confirmations 180, the effective numbers; never read from the builder again
await payout.run({ waitFor: "sent" }); // the handler: returns after the delivery
// the background task that delivers the goods, also after a restart: the step is signed, it needs neither payer nor signer
const resumed = await builder.resume("payout-42");
await resumed.run({ waitFor: "final", pollMs: 60_000 }); // timeoutMs = 180 × 30_000 + 120_000; the same bytes every 180_000
// builder.plan(parts, { id: "payout-42", payer: treasury, expiryMarginMs: 600_000 }): PLAN_EXISTS, the record holds 3_600_000
// new TxBuilder({ network: "mainnet", provider, planDefaults: { pollMs: 0 } }): TxBuildError INVALID_OPTION, pollMs
```

## The path without a lifecycle

`builder.build(parts, { payer })` returns a `BuiltTx`: one built transaction on its own. It
is the data of the build (a `BuiltTxData`: see [The result](#the-result)) and the calls that sign
that one body, take signatures made elsewhere, submit it and look for it.

```ts
import { output } from "@meshsdk/transaction";

const built = await builder.build(
  output({ address: recipient, value: { lovelace: 5_000_000n } }),
  { payer: wallet },
);
await built.sign(); // the payer signs: the wallet's witnesses; built.missing lists the keys still without one
await built.submit(); // MISSING_SIGNATURES, and nothing sent, while a key is missing
const { slot } = await built.awaitInclusion(); // found in a block: one sighting, which a rollback can undo
```

| `BuiltTx`                                        |                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sign({ signers?, partial? })`                   | signs with the call's [signers](#signers), else the payer of the build, each asked for the keys that have not signed yet, and keeps what they give. With `partial: false` a key still missing is `MISSING_SIGNATURES`                          |
| `addWitnesses(...witnessSets)`                   | adds witness sets, or full transactions from a wallet or another party, each checked against the body                                                                                                                                          |
| `missing`, `signedTx`, `partialTx`               | the keys that have not signed yet, with their roles; the transaction with every signature, once none is missing; the transaction with the signatures held so far, for a party that signs next in another program (`tx` stays the unsigned one) |
| `submit({ submitter? })`                         | hands `signedTx` to the call's `submitter`, else the builder's, else the provider: the same bytes every time it is called                                                                                                                      |
| `awaitInclusion({ timeoutMs?, pollMs? })`        | looks for the transaction until the provider finds it in a block, and returns `{ txHash, slot, block, blockHeight }` as far as the provider gives them                                                                                         |
| `JSON.stringify(built)`, `builder.restore(json)` | the transaction with its signatures as JSON, and back, in this process or another                                                                                                                                                              |

`sign()`, `addWitnesses()` and `submit()` return the object, and two calls at once are safe: a
witness is kept once per key, whoever gives it first. `sign()`, `submit()` and `awaitInclusion()`
take a `signal` that stops their waiting; a member of their options they do not know is
`INVALID_OPTION`. The steps of a plan (`plan.steps`) give the data alone, without these calls: a
plan signs and sends its own transactions.

**One object is one body.** It has no deadline and no statuses, and nothing it does builds
another transaction. **Do not rebuild to retry**: a new build may choose
other inputs, and both transactions may land. A retry is the same call on the same object; this
one tries three times, then leaves the outcome to the application:

```ts
import { TxError } from "@meshsdk/transaction";

let sent = false;
for (let tries = 1; ; tries++) {
  try {
    if (!sent) await built.submit();
    sent = true;
    await built.awaitInclusion({ timeoutMs: 10 * 60_000 });
    break; // found in a block
  } catch (error) {
    if (tries === 3) throw error; // the application decides what follows, never by a new build
    if (
      TxError.is(error, "SUBMIT_FAILED") &&
      error.details.reason !== "unauthorized"
    )
      continue; // a lost answer: the same bytes again, then look; a wrong API key fails again
    if (TxError.is(error, "CONFIRM_TIMEOUT")) continue; // not found yet, which is not "not paid": look again
    throw error; // REJECTED, SCRIPT_FAILED, ...: no retry, and no new build
  }
}
```

- `SUBMIT_FAILED`: the outcome is unknown, and the bytes may be on their way. The same `submit()`
  sends them again, and then the transaction is looked for. A refusal of that repeat proves nothing
  and is no error: the first delivery may have landed. A refusal while another delivery of the
  object has not answered waits for it, and is decided by its outcome. `details.reason` says what
  the submitter's error says (see [A failed submission](#payer-signer-submitter)), and no reason
  changes this.
- `REJECTED`: the ledger refused the bytes, no delivery of this object may have gone through, and
  one look does not find the transaction: the message says whether the provider does not find it
  or could not be asked. A refusal of bytes the provider already finds is no error. The object
  does not know what another process sent, or this program before a restart: look for the
  transaction before concluding anything.
- `CONFIRM_TIMEOUT`: not found in a block within `timeoutMs` (120 000 by default; a look that
  has not answered by then counts as not found). It does not mean "not paid": the application
  concludes that itself, not before the body's `until` and a margin for rollbacks.
  `validity({ until })` gives the body that deadline. The same `awaitInclusion()` looks again.
- `awaitInclusion()` returns at the first block that holds the transaction, as a plan's
  `included`: it sees neither depth nor rollbacks, and nothing here waits for `final`. It does
  read whether the scripts passed: `SCRIPT_FAILED` for a transaction in a block with
  `is_valid = false`, and `CANNOT_OBSERVE` (`noValidity`) when a transaction that runs a Plutus
  script is found and the provider does not say; a provider that cannot search is
  `CANNOT_OBSERVE` (`noSearch`). It sends nothing and changes nothing, and it can be called
  before `submit()` and for a transaction another process sent.

The messages of `SUBMIT_FAILED`, `REJECTED` and `CONFIRM_TIMEOUT` from the object end with the
same rule: do not build another transaction to retry it.

A payment that has to be repeated safely, followed to `final` or kept across a crash is a
[plan](#plans). This path is for the rest: a preview, a build without a
provider, a build without balancing (`assembleTxPrototype`, `finalize`), a transaction built
elsewhere (`fromCbor`), a transaction whose outcome the application follows itself. A body that
went to a signer or to the network is not turned into a plan: a plan with the same parts is
another transaction.

### Offline, and a deterministic build

```ts
import {
  keySigner,
  output,
  spend,
  TxBuilder,
  validity,
} from "@meshsdk/transaction";

const offline = new TxBuilder({ network: "preprod", params, costModels }); // neither provider nor wallet
const built = await offline.build(
  [
    spend.pubKey({ utxo: { txHash: depositHash, outputIndex: 0 } }),
    output({ address: recipient, value: { lovelace: 3_000_000n } }),
    validity({ until: expiresAt }), // build() sets no deadline; with its own until the outcome is clear: past it and a margin for rollbacks the body cannot land
  ],
  { payer: { changeAddress, utxos }, knownUtxos: [depositUtxo] }, // nothing is read
);
await built.sign({ signers: keySigner(coldKey) }); // or: built.tx to a cold signer, built.addWitnesses() with what comes back
await file.write("payment.json", JSON.stringify(built)); // the transaction, its data and its signatures

// later, in a process with a provider:
const online = new TxBuilder({ network: "preprod", provider });
const again = await online.restore(JSON.parse(await file.read("payment.json")));
await again.submit(); // a lost answer: the same call again; never a new build
await again.awaitInclusion(); // the first block; a timeout is not "not paid"
```

With a payer given as a snapshot, explicit `params` and `costModels` (for example
`...await builder.chain()` saved earlier) and the local evaluator, a build makes no request but the
lookups its parts ask for, and the same arguments give the same bytes and `txHash`. A builder
without a provider signs and writes the transaction; there `submit()` needs a `submitter`, in the
call or the builder's (`MISSING_SUBMITTER` without one), and `awaitInclusion()` a provider
(`MISSING_FETCHER`).

The JSON holds the data of the build, the signatures and the number of the build's
`extraKeyWitnesses`, and marks a delivery that may have gone through (taken, of unknown outcome,
or still on its way when it was written): the object restored treats a refusal as the one that
wrote it would. `restore` makes no request: it reads the record, checks that its transaction is
the unsigned one and that `txHash` is the hash of its body, and verifies every signature it
holds, else `INVALID_OPTION` (`json`). A record of another network is `NETWORK_MISMATCH`; one of
another kind, of a newer version or with content this library does not read is `INVALID_STATE`
(`recordVersion`). Its errors quote nothing of the record but its network. A plan's JSON goes to
`resume`, not to `restore`. A cold signer of a build with a provider is an ordinary plan:
`await builder.plan()`, `addWitnesses()`, `run()`.

### A transaction built elsewhere

`builder.fromCbor(txCbor, { knownUtxos? })` makes a `BuiltTx` of a transaction that exists only as
CBOR, usually one another party built for the user to sign. Nothing is built or balanced: what is
signed is the body as given, byte for byte, and the members are a view of those bytes and of the
UTxOs of its inputs, collateral inputs and reference inputs.

```ts
const received = await builder.fromCbor(tx); // the UTxOs of its inputs through the provider
const { outputs, fee, missing, collateral, warnings } = received; // read before signing
await received.sign({ signers: wallet }); // the object has no payer: name who signs
await received.submit(); // MISSING_SIGNATURES while a key is missing: partialTx goes to the next party
await received.awaitInclusion();
```

Those UTxOs are taken from `knownUtxos` as given, else through the provider's shared cache, at
most eight requests at a time; the call waits for the provider as long as it takes and takes no
`signal`. `inputs`, `referenceInputs`, `collateral` and `signers` (each key with its roles) come
from them and the body; `fee`, `outputs`, `redeemers` and `validity` are the transaction's own.
`selectedInputs`, `change` and `parts` are empty, outputs carry no `label` and redeemers no `part`,
and `prototype` is the transaction read as a value, which need not serialize to the same bytes.
`tx` is the transaction without its vkey and bootstrap witnesses; those it came with are verified
and held, so one that came signed has nothing in `missing`. The object goes through JSON and
`restore` as any other, and can be given as `after`: its inputs are not selected, its outputs can
be named by out ref without a lookup, and it has no change to select. `knownUtxos`, in any form of
`UtxoInput`, serves the outputs of a transaction not on chain yet, spent outputs a provider does
not list, and a builder without a provider; a UTxO neither given nor found is `UTXO_NOT_FOUND`
(`MISSING_FETCHER` without a provider).

Before signing a transaction someone else built:

- `outputs` and `fee` say what leaves. Judge data by `outputs[].datum` and `redeemers[].data`, the
  bytes as written.
- `missing` lists the keys to sign with their roles: a key in the role `collateral` holds a UTxO
  the transaction puts up as collateral.
- The validity flag is outside what is signed: whoever submits can mark the transaction as failing,
  and then its collateral inputs are spent and only the collateral return is paid. Read
  `collateral` (`total`, `return`) and `warnings`: `COLLATERAL_FORFEITED` says there is no return,
  `COLLATERAL_RETURN_ELSEWHERE` that a collateral input's holder is not the one the return pays,
  and names each holder that loses with its lovelace, however small `total` is.
- The view of the inputs, and of who must sign, is only as true as their UTxOs. `knownUtxos` is the
  application's own data, never taken from the party that made the transaction, and the provider
  is believed as much; a wallet signs its own inputs whatever the object shows.

The library judges whether its own process can read the transaction safely and in reasonable
time; the fee, the balance, the scripts, the validity interval and whether the inputs are unspent
are the ledger's. Refused, as `INVALID_OPTION` (`tx`) with `details.value` only the JavaScript
type, unless named otherwise:

- text that is not a transaction in CBOR hex, not well-formed CBOR (RFC 8949: a simple value below
  32 written in two bytes among it, which the value decoder takes), or not an array of four items
  (earlier eras' forms);
- larger than the `maxTxSize` of the builder's `params`, else 16 384 bytes, the value of mainnet,
  preprod and preview (no parameters are asked for), before a byte of it is read;
- nested deeper than 1 024 levels, the CBOR inside a byte string under tag 24 counted on: the value
  decoder calls itself once a level, reads that depth on a stack of about a browser's, and
  overflows it at 2 048. Data meets the next bound long before: these levels are reached by byte
  strings under tag 24 nested in each other;
- carrying more nested data (Plutus data, metadata, scripts) than the value decoder reads in about a
  second: its time grows with the square of the depth of data, and with the bytes of each list and
  map times the items inside it, each piece of a string written in pieces counted. One datum of
  lists nested more than 728 levels is past it (constructors: 434, maps: 523, a native script: 303),
  and so are 16 384 bytes of datums nested more than 55. The largest of each shape the bound lets
  through decodes in 0.16 to 0.94 s on a laptop. The real transactions of the tests take 0.02 to
  0.26 % of the bound, and lawful heavy ones 5 to 11 % (an order book of 120 orders in a datum, a
  mint of 40 assets with their metadata, outputs of many tokens near 16 384 bytes, 60 datums in the
  witness set);
- an output, or the collateral return, that pays an address longer than 256 bytes, before any of
  it is read: a Byron address is written in base58, whose time grows with the square of its
  length, and since Allegra the ledger takes none longer than about 110 bytes;
- a negative fee, a token quantity of zero, an out ref named twice among the inputs, collateral
  inputs or reference inputs, an output address with bytes after the address;
- a protocol parameter change proposal, which this library does not read from CBOR (the
  transaction itself may be valid);
- required signers written as credentials, the guards of an era after Conway, which the value
  decoder reads into no signer (`requiredSigners` refuses them too);
- another network: `NETWORK_MISMATCH`, for its addresses, its UTxOs or the network id its body
  states (role `body`);
- a signature that is not of the body: `INVALID_WITNESS` (`wrongBody`).

A map that repeats a key and a key the value decoder does not know are read as that decoder reads
them, and the members show that reading: the last value of a repeated key, or both output lists of
a body joined, and an unknown key of a body, an output or a witness set passed over with its value.
A node refuses such a transaction since protocol version 9. A validity flag of false is read as the bytes give it, and
the transaction is shown as one marked valid: a node sets the flag itself. `builder.restore` reads
the transaction and the witnesses of a JSON within the same bounds, before any of them is decoded,
and refuses a transaction whose witness set repeats the key of its vkey or bootstrap witnesses.
A witness set that repeats a key is read as the decoder reads it, the last entry.

Reading takes a time that grows with the data the transaction carries, up to about a second on a
laptop, on the calling thread; the UTxOs add the time of their bytes, since their data is not
decoded: a transaction of 16 384 bytes whose 452 reference inputs each hold the slowest native
script of 16 384 bytes is read in about 0.5 s, by `fromCbor` with them in `knownUtxos` and by
`requiredSigners`. `plan` decodes a step given built twice, so one at the bound takes up to about
two seconds there (1.5 to 1.8 s measured). The bound on nested data counts a big integer as a tag
and one string, though its time grows with the square of its length: that matters only with a
`maxTxSize` above 64 KB, where one integer of 128 KB takes 1 s in a datum and 2 s in metadata. An
item the bounds admit can overflow a stack smaller than about a browser's (on
`node --stack-size=400` every one is read), and the error is then the runtime's. A server reads
strangers' transactions off its request path, in a worker of its own. A bootstrap witness the
transaction came with is counted for the Byron addresses it spends from, not matched to the address
it is for. The object does not know whether the transaction was sent: `awaitInclusion()` looks for
it, and `submit()` returns when the ledger refuses bytes the provider already finds.

### Signing functions

The lower layer, which a `BuiltTx` and a plan are made of. It is for code that has no
builder: a page that only signs with a wallet, a cold machine, a server that checks a transaction
it did not build. Code that has a builder makes the object of such a transaction:
[`builder.fromCbor(tx)`](#a-transaction-built-elsewhere).

| Function                                      |                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `await signWitnesses(signer, tx, keyHashes?)` | the signer's witness set: `signTxWitnesses(tx, keyHashes)` when it has it, else `signTxHash` (an object with it, or a function), whose signatures are verified, else `signTx`. A signer of hashes gets `keys` with empty `roles`, and no `keys` without `keyHashes`. The answer is returned whole, not filtered by `keyHashes`: a wallet that signs with an extra key gives an extra witness, which can put the fee below the minimum (a `BuiltTx` and a plan drop it) |
| `await addWitnesses(tx, ...witnessSets)`      | `tx` with the vkey and bootstrap witnesses of each witness set or full transaction added; only the witness set changes. `INVALID_WITNESS` with `details.argument`, counted from 0; an empty string is `undecodable`                                                                                                                                                                                                                                                    |
| `await signedKeyHashes(tx)`                   | the key hashes whose vkey witness in `tx` verifies against its body                                                                                                                                                                                                                                                                                                                                                                                                    |
| `requiredSigners(tx, spent)`                  | who must sign a transaction built elsewhere, given the UTxO of every input and collateral input (`UTXO_NOT_FOUND` for a missing one), and of reference inputs for the native scripts they hold, in any form of `UtxoInput`; each key with its roles, as the build gives them. `builder.fromCbor(tx)` reads those UTxOs itself and gives the same as `signers`                                                                                                          |

`addWitnesses` and `signedKeyHashes` return promises. Bad arguments (a `tx` that is not a
transaction, or whose witness set repeats the key of its vkey or bootstrap witnesses, as a witness
would go into one entry and a reader may take another; a signer that cannot sign; a malformed
`spent`) are `TxBuildError` `INVALID_OPTION`, whose `details.value` is only the JavaScript type of
a `tx` or a signer, since either may be a key; `SIGN_DECLINED`, `SIGNER_FAILED` and
`INVALID_WITNESS` are `TxPlanError`: catch them with `TxError.is`.

```ts
import {
  addWitnesses,
  keySigner,
  requiredSigners,
  signedKeyHashes,
  signWitnesses,
} from "@meshsdk/transaction";

// A cold machine: no builder, a key, the transaction it was handed
const mine = await signWitnesses(keySigner(coldKey), tx);

// A server that checks a transaction it did not build
const needed = requiredSigners(tx, spent).keyHashes;
const signed = await addWitnesses(tx, mine);
const signedBy = await signedKeyHashes(signed);
const complete = needed.every((keyHash) => signedBy.includes(keyHash));
```

For a hash without its transaction, `awaitTransactionConfirmation(provider, txHash)` of
`@meshsdk/common` waits for the first block and reads nothing of the answer: it sees neither depth
nor rollbacks, nor whether the scripts passed (read `validContract` from the provider's
`fetchTxInfo`), and its timeout (`TxConfirmTimeoutError`) does not mean "not paid".

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
  assembleTxPrototype,
  message,
  output,
  spend,
  toUtxo,
} from "@meshsdk/transaction";

const fee = 200_000n;
const input = toUtxo(utxoFromProvider);
const held = input.value.lovelace;
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
await final.sign({ signers: wallet }); // an object of finalize() holds no payer: signers are named
await final.submit();
```

`finalize` looks nothing up: `inputs` holds the UTxO of every input, reference input and collateral
input of the body, in any form of `UtxoInput` (`UTXO_NOT_FOUND` for a missing one). Scripts are not
run again: redeemers keep the units the prototype states, so after an edit a script can see, build
again from parts. Collateral is not changed: a raised fee that it no longer covers is
`INSUFFICIENT_COLLATERAL`, until the caller raises `total_collateral` and lowers the collateral
return. Key witnesses of the prototype are dropped: the result is unsigned, a `BuiltTx` as
from `build()`, whose fee prices no witness of a key it does not need. The result has no parts:
`parts` and `selectedInputs` are empty, redeemers carry no `part`, outputs no `label`, and `change`
holds every output at `changeAddress`, a payment to that address included. A prototype that names
an output twice among its inputs, its reference inputs or its collateral inputs, or reads an output
it spends, is `DUPLICATE_PART` `{ item }`: its positions are its own, so nothing is dropped.

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
  changeAddress: built.change[0]!.address,
});
// final signs and submits on this path: final.sign({ signers }), final.submit()
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

In a plan, the `utxo` of `spend.*`, `referenceInput` and `collateral` also takes an output of an
earlier step, `{ step, output }`, and that of `spend.pubKey` all the change of one,
`{ step, change: true }`: see [Links and order](#links-and-order).

Parts are immutable and their order does not matter, except for certificates, proposals and outputs,
which keep it. Outputs given by out ref alone (`{ txHash, outputIndex }`) are looked up; passing the
UTxO in full (a `Utxo`, a Mesh `UTxO` or its CBOR) spares the lookup; an object with `txHash` and
`outputIndex` is in full when it also has an `address` or a `value`. Addresses are taken in bech32,
base58 (Byron) or hex. Every part takes an optional `label`, echoed in errors about it. A part
builder throws `TxPartError` at the call that made the part.

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
- Collateral is picked from the payer's UTxOs, or the `collateral` parts given (topped up from the
  payer's UTxOs when they do not cover it, unless `topUpCollateral: false`), with what exceeds
  `collateralPercent` of the fee returned to the payer's change address (or the `collateralReturn`
  part's address); with `collateralReturn: false`, lovelace-only inputs forfeited whole, with
  neither return nor total. Every Plutus transaction carries collateral inputs.
- The datum of a spent script output is worked out from the output: inline, none (Plutus V3), or
  pass `datum: { data }` for an output holding a datum hash, whose data goes into the witness set.
  `{ data }` may be given for an output that holds its datum inline too, as a check: the data must
  be that datum, byte for byte (its hash the hash of the inline bytes), else `DATUM_MISMATCH`
  naming the out ref. It never goes into the witness set, and a script is judged on the datum the
  output holds, as the ledger judges it: a local evaluation builds its context from the UTxO. For a
  part given an out ref, the UTxO the build reads is checked the same way when it holds its datum
  inline.
- An attached script that an input or reference input already holds as its reference script is
  left out of the witness set.
- An output read by several parts is one reference input, and an output the transaction spends is
  never one: a `referenceInput` part of a spent output adds nothing, since the datum and reference
  script of a spent input are visible to the scripts already. Selection never spends an output a
  part only reads.

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

const plan = await builder.plan(
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
await plan.run();
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
`VALID_FROM_FUTURE`, and a plan's `run()` before it throws `NOT_YET_VALID { waitMs }`
(retryable after `retryAfterMs`) and sends nothing: wait and call it again, as in
[Vesting](#vesting). A time
that is not a whole number of ms from 0 to 2^53 − 1 is `INVALID_DATA` at the part call; one before
the network's slot clock starts, or an interval that holds no slot once converted, is
`INVALID_DATA` from the build. `build()` sets no `until`; a plan sets
`until = max(tip time, from) + ttlMs` when its parts set none. `builder.slotAt(time)` and
`builder.timeAt(slot)` convert on the builder's network.

## UTxOs

The builder has one form of a UTxO, `Utxo`: plain data, written with the words of the parts.

```ts
import type { Utxo } from "@meshsdk/transaction";

const utxo: Utxo = {
  txHash: "5c0f…", // lower-case hex
  outputIndex: 0,
  address: "addr_test1…", // bech32; base58 for a Byron address
  value: { lovelace: 5_000_000n, [policyId + assetName]: 1n }, // as output({ value }) takes it
  datum: { type: "inline", data: { type: "CBOR", content: "d87980" } }, // or { type: "hash", hash }
  script: { type: "plutus", version: "V3", code, hash }, // or { type: "native", cbor, hash }
};
```

- `value`: quantities by unit, as `bigint`. `lovelace` is always there (it may be `0n`); a token
  the output does not hold has no entry, so `Object.keys(utxo.value).length === 1` is an ada-only
  output. Tokens stand in the order of their units.
- `datum`: left out when the output holds none. An inline datum is its CBOR, byte for byte, in
  the form parts take data in: `deserializeDatum(utxo.datum.data.content)` of `@meshsdk/core`
  reads it. The builder checks it by a walk over its bytes and does not decode it, so a deeply
  nested datum on a key-locked UTxO does not slow a build.
- `script`: the reference script, left out when the output holds none. A Plutus script is a
  `PlutusScript` with its `hash`, a native script its CBOR with its `hash`. A reference script is
  never decoded: its language, its hash and its size are read from its bytes, the hash as the
  ledger takes it, blake2b-224 of the language's tag and the script as written: of a native script
  its CBOR as written, of a Plutus script the content of its byte string (its head is not hashed).
  A native script is read as the ledger reads one, `[0, key hash]`, `[1, scripts]`,
  `[2, scripts]`, `[3, n, scripts]`, `[4, slot]` or `[5, slot]`, each list of definite or
  indefinite length, with no call of itself and in a time that grows with its size, so a script
  of any depth, from any source, is read at once and its UTxO can pay. On a laptop a UTxO that
  holds the slowest native script of 16 384 bytes is read in at most about 5 ms, and a payment from
  a payer whose 40 UTxOs each hold one (from a provider, a wallet or a snapshot) is built in about
  55 ms. A script given as bytes (a Mesh `scriptRef`, CBOR, or an `unknown` script) that the
  library cannot read is `{ type: "unknown", scriptRef, hash? }`, its bytes kept: another framing,
  a language it does not know, bytes after the script, CBOR that is not well formed, a Plutus
  script whose byte string is written in pieces, a native script larger than a transaction (16 384
  bytes: one in an output is part of a transaction), an item after the language 0 that is not a
  native script as the ledger reads one (a key hash written in pieces among them), bytes it would
  not write back the same, or a hash other than the one stated with it. Such a UTxO can still be
  spent, the script counts for the fee by its size, and it cannot be named as a `{ reference }`
  (`INVALID_SCRIPT`). A `plutus` or `native` script given in the builder's form that cannot be read
  is refused instead (see below).
- The keys a native script names, which a native witness that runs it prices and asks for, are
  read from its bytes, any number of them, with the slots and the `n` of `atLeast` exact as the
  ledger reads them, as long as it nests no deeper than 1 024 levels as the walk of a transaction
  counts them (each array a level, `[0, script]` the first): its form is a tree that this library
  and the application walk by recursion. One nested deeper is described and can be spent, and
  cannot be named as a `{ reference }` (`INVALID_SCRIPT`). Where the signers of a transaction are
  read from the UTxOs given with it (`requiredSigners`, `fromCbor`, `finalize`), the keys of a
  native script are read only for one the transaction runs, known by its hash, and one nested
  deeper is not listed in `nativeScripts`.
- A `Utxo` has `txHash` and `outputIndex`, so it is an out ref wherever one is asked for; given to
  a part, it is the UTxO in full.

What is read from a UTxO goes into a part as it is:

```ts
import { output } from "@meshsdk/transaction";

output({ address: utxo.address, value: utxo.value, datum: utxo.datum });
```

**Returned.** Every UTxO the builder returns is a `Utxo`: `BuiltTxData.inputs`, `selectedInputs`,
`referenceInputs`, `outputs` and `change` (`BuiltOutput`: a `Utxo` with `label` and `change`),
`collateral.inputs` and `collateral.return` (the output the return becomes if a script fails:
output `outputs.length` of `txHash`), `outputOf`, `readPayer(payer).utxos`, the argument of
`canSelect`, the candidates of `coinSelection`, the result of `utxosAfter`, and the `utxo` a part
holds.

**Taken.** Wherever the builder takes a UTxO (a part's `utxo` or `reference`, a snapshot's
`utxos`, a wallet's or the provider's answer, `knownUtxos`, `finalize`, `minFee`,
`requiredSigners`, `utxosAfter`) it takes a `UtxoInput`, in any of three forms, and none needs
converting by hand:

| Form                                         | Comes from                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| a `Utxo`                                     | the builder: a built transaction, `outputOf`, `readPayer`, `utxosAfter` |
| a Mesh `UTxO`, `{ input, output }`           | a provider, a Mesh wallet, `TxEmulator`                                 |
| CBOR of a transaction unspent output, in hex | a CIP-30 wallet: `getUtxos`, `getCollateral`                            |

```ts
import { spend } from "@meshsdk/transaction";

const [first] = await provider.fetchAddressUTxOs(userAddress); // a Mesh UTxO
if (first === undefined) throw new Error("no UTxO at the address");
const part = spend.pubKey({ utxo: first }); // part.utxo is a Utxo
```

Each is checked and copied where it is taken; the three forms of one UTxO give the same `Utxo`,
and so the same transaction. `toUtxo(given)` is that conversion, for the application's own use;
`toMeshUtxo(given)` writes a UTxO as a Mesh `UTxO`, for an API that takes one (`MeshTxBuilder`,
`TxEmulator.addUtxos`): lovelace first, an inline datum as `plutusData` with its `dataHash`, a
reference script as `scriptRef` with its `scriptHash`. Both throw `INVALID_OPTION`, the reason as
`cause`, for what is not a UTxO.

The conversion drops nothing a UTxO states. From a Mesh `UTxO`, units listed more than once are
added up and the unit `""` is lovelace (an amount without lovelace holds `0n`), `plutusData` is
an inline datum, `dataHash` without it a datum hash, and `scriptRef` the reference script. What a
`Utxo` cannot hold is refused:

- an output index above 65535, a reward address, an address longer than 256 bytes (by the length
  of its text, before it is parsed: no output since Allegra pays a Byron address that long), a
  quantity (or the sum of a repeated unit) above 2^64 − 1;
- a `dataHash` that is not the hash of the `plutusData` beside it (an inline datum is kept as the
  hex given, never decoded, and its form is not judged);
- a `scriptHash` without a `scriptRef`, a script hash that is not 28 bytes of hex, and a `plutus`
  or `native` script given in the builder's form that cannot be read or written back the same, is
  of a Plutus version other than `V1`, `V2` and `V3`, or whose `hash` is not its own (an `unknown`
  script with another hash stays `unknown`);
- text that is not the CBOR of a transaction unspent output, and the CBOR of one whose output has
  a key other than 0, 1, 2 and 3, which the ledger takes in no output and the value decoder passes
  over with its value. It is refused before it is decoded, its out ref named (among `knownUtxos`,
  its entry).

`output()` refuses an inline datum that is not exactly one item of Plutus data (`INVALID_DATA`), and
every output the builder makes is a UTxO it takes back. The error names where the UTxO was given:
from a part, `TxPartError` with the code of the member at fault (`INVALID_OUT_REF`,
`INVALID_ADDRESS`, `INVALID_VALUE`, `INVALID_DATA`, `INVALID_SCRIPT`), and `INVALID_OUT_REF` for
text that is not UTxO CBOR and for an object of both forms or of neither; from an option or
argument, `INVALID_OPTION` with the entry's JavaScript type in `details.value`; from a wallet's
answer, `WALLET_FAILED` (`getUtxos`) or `INSUFFICIENT_COLLATERAL` (`getCollateral`); from the
provider, `PROVIDER_FAILED` for the payer's UTxOs and `UTXO_NOT_FOUND` for an out ref looked up.
The reason is the `cause`.

## The result

`built` is a `BuiltTx`: its own members are the data below, and `{ ...built }` or
`structuredClone(built)` is that data as a plain `BuiltTxData`, which is also what a step of a plan
is, with its place in the plan.

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
  signers, // { keyHashes, keys (each with the roles it is needed in), byronAddresses, nativeScripts }
  validity, // { invalidBefore, invalidHereafter, from, until }: slots and the ms they start at
  network, // { name, networkId }
  warnings, // VALID_FROM_FUTURE, COLLATERAL_FORFEITED, COLLATERAL_RETURN_ELSEWHERE, FEE_ABOVE_MINIMUM
  parts, // every part, resolved, those added by balancing included
} = built;
```

A transaction made by `fromCbor` has the same members, read from its bytes and from the UTxOs of
its inputs: `tx` is the transaction given without its vkey and bootstrap witnesses, `prototype`
what it reads as, and `selectedInputs`, `change` and `parts` are empty; see
[A transaction built elsewhere](#a-transaction-built-elsewhere).

`outputOf(built, label)` is the output made by the output part with that label, as a `BuiltOutput`:
a `Utxo` with `label` and `change` (`UNKNOWN_LABEL { label, labels }` when none has it).
`builder.serialize(prototype)` serializes a prototype as the build does.

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

| `builder.build(parts, {...})` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payer`                       | who pays and gets the change: a wallet, an address or a snapshot; without it `MISSING_PAYER`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `canSelect`                   | which of the payer's UTxOs may be selected for payment and collateral; UTxOs the parts read and script-locked UTxOs are never selected; it gets a `Utxo`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `coinSelection`               | a `SelectInputs` function that replaces the built-in selection of this build (each token from its largest holders, then lovelace), called `(need, candidates, context)`: `need` is an `Assets` (`lovelace` always there, a token only when short), the candidates are `Utxo`s; it returns out refs (the candidates themselves will do), and every one must name a candidate (`INVALID_SELECTION`); an entry without a string `txHash` and a number `outputIndex`, a Mesh `UTxO` among them, is `INVALID_OPTION`; the change stays with the built-in rule |
| `sendAllTo`                   | spend every selectable UTxO and send what is left to this address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `after`                       | `BuiltTxData` or `TxPlan` (its steps that are in a block and not final, or may still land), or a list: transactions not yet seen by the provider. Each is read from its own bytes (`tx`), up to the `maxTxSize` of the builder's `params`, else 65 536 bytes: what it spends and the outputs it makes are those of the bytes, never those an object states, and of the object only its change marks are taken. Their inputs are not selected, their change at this build's change address is, their outputs can be named by out ref without a lookup     |
| `knownUtxos`                  | outputs the parts may name by out ref that the provider may not know yet, in any form of `UtxoInput`, handed to every evaluator; listing one makes it neither selectable nor unselectable (a payer UTxO listed here may still be selected). A plan checks them at `builder.plan()`, and records them as `Utxo`s                                                                                                                                                                                                                                          |
| `fee`                         | goes into the body as given; `FEE_TOO_LOW { fee, minFee }` when the final transaction's minimum fee is higher; `FEE_ABOVE_MINIMUM` warns when it is above                                                                                                                                                                                                                                                                                                                                                                                                |
| `registeredPools`             | operator key hashes of pools already registered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `extraKeyWitnesses`           | key witnesses expected beyond those the parts call for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `topUpCollateral`             | `true`, the default: collateral inputs given by `collateral` parts that do not cover the collateral get inputs added from the payer's UTxOs, as the builder chooses collateral when none is given; `false`: they are put up as given, and what they do not cover is `INSUFFICIENT_COLLATERAL`                                                                                                                                                                                                                                                            |
| `collateralReturn`            | `true`, the default: the transaction states its total collateral and returns the rest of the collateral inputs; `false`: collateral inputs only, neither a return nor a total, all of their lovelace at stake (`COLLATERAL_FORFEITED`); they must hold lovelace alone (a given one with a token is `INVALID_COLLATERAL`), and a `collateralReturn` part is `INVALID_OPTION`                                                                                                                                                                              |
| `signal`                      | aborts the build with `ABORTED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `trace`                       | receives the steps of the build (`payer`, `fetched`, `round`, `evaluated`), for diagnostics; what it throws is ignored                                                                                                                                                                                                                                                                                                                                                                                                                                   |

A plan takes the same options, with `id`, `consolidate` and the three deadlines; with named steps,
`sendAllTo` and `fee` are given in the step. `resume` takes `payer` and `trace` again.

## Errors

Every error of the package is a `TxError`: `TxPartError` from a part builder, at the call that made
the part; `TxBuildError` when parts cannot be built into a transaction, and for a bad option or
argument; `TxPlanError` from signing, submitting, waiting and the store. One check covers the
whole tree, also errors of another copy of the package, and narrows `details` by code:

```ts
import { TxError, TxPlanError } from "@meshsdk/transaction";

try {
  await plan.run();
} catch (error) {
  if (TxError.is(error, "INSUFFICIENT_FUNDS")) {
    const { unit, missing } = error.details; // typed by the code
  } else if (TxError.is(error, "SUBMIT_FAILED", "CONFIRM_TIMEOUT")) {
    // retryable: the same call again, no earlier than error.retryAfterMs when it is set;
    // SUBMIT_FAILED with error.details.reason "unauthorized" fails again until the API key is fixed
  } else if (TxPlanError.is(error)) {
    log(error.code, error.planId, error.step, error.status, error.message); // error.plan is not enumerable: a logger does not serialize it
  } else throw error;
}
```

Every error has `code`, `message`, and where they apply `part`, `label`, `details` and `cause` (the
error it was raised from, such as the provider's `ProviderError` or the wallet's error).
`retryable: true` means only: the same call, repeated no earlier than `retryAfterMs`, is safe and
may pass. A `TxPlanError` of a plan also carries `planId`, `status` (when thrown), `step` and
`txHash` (the step it is about) and `plan` (the object as it is now); one of a `BuiltTx` carries none of
them. `TxPartError.is` is `TxError.is`: tell a part error by its code. The builder throws no
`RangeError`: a bad option or argument is `INVALID_OPTION`, a missing label `UNKNOWN_LABEL`; an
aborted `signal` is `ABORTED` in every call of the builder, of a plan and of a `BuiltTx`.
With `MISSING_SIGNATURES`, `MISSING_SUBMITTER` and `NOT_YET_VALID` nothing went to the network.
No code means "the payment did not go through": only the status of its step does, as every
message of a plan's `TxPlanError` says.

| Code                       | Class          | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `details`                                                                                                     | Retryable                                                                    |
| -------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `INVALID_OUT_REF`          | `TxPartError`  | an out ref that cannot exist: a bad hash or index; a UTxO given as text that is not its CBOR, or as an object of both forms or of neither (see [UTxOs](#utxos))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | none                                                                                                          | no                                                                           |
| `INVALID_ADDRESS`          | `TxPartError`  | an address that does not parse, or of the wrong kind for the part                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | none                                                                                                          | no                                                                           |
| `INVALID_VALUE`            | `TxPartError`  | malformed lovelace or asset quantities, units or policies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none                                                                                                          | no                                                                           |
| `INVALID_SCRIPT`           | `TxPartError`  | a script that does not parse, or a reference output holding no suitable script; a UTxO's `scriptHash` without a `scriptRef`, or a `plutus` or `native` script that cannot be read or whose `hash` is not its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                          | no                                                                           |
| `INVALID_DATA`             | `TxPartError`  | Plutus data or a hash that does not parse; an inline datum that is not exactly one item of Plutus data, or a UTxO's `dataHash` that is not the hash of the `plutusData` beside it; a validity time out of range; from the build, a validity bound before the slot clock starts or an interval with no slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | none                                                                                                          | no                                                                           |
| `WITNESS_MISMATCH`         | `TxPartError`  | a witness that cannot authorise its output or credential (a key spend of a script output; in the old `MeshTxBuilder`, a Plutus part without a redeemer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | none                                                                                                          | no                                                                           |
| `DATUM_MISMATCH`           | `TxPartError`  | a datum choice that does not fit the output spent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | none                                                                                                          | no                                                                           |
| `UNRESOLVED`               | `TxBuildError` | a part still leaves something open that nothing filled in; also a part linked to an earlier step of a plan (the gap `link`), outside a plan (`build()`, `add()`, `assembleTxPrototype`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `PartGaps[]`: each part's kind, label and gaps                                                                | no                                                                           |
| `DUPLICATE_PART`           | `TxBuildError` | the same input, policy, reward account, voter or collateral input twice; a kind held once given twice; a prototype given to `finalize` that names an output twice among its inputs, reference inputs or collateral inputs, or reads an output it spends                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `{ item }`                                                                                                    | no                                                                           |
| `INVALID_COLLATERAL`       | `TxBuildError` | collateral inputs that cannot cover the total collateral; with `collateralReturn: false`, a given collateral input holding a token (the part is named)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | none                                                                                                          | no                                                                           |
| `MISSING_FETCHER`          | `TxBuildError` | something has to be read, and the builder has no provider                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none                                                                                                          | no                                                                           |
| `UTXO_NOT_FOUND`           | `TxBuildError` | an output the transaction names does not exist, could not be read (the provider's error is the `cause`), or is spent by a transaction of `after`; from `fromCbor`, also a spent output the provider does not list: give it in `knownUtxos`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `{ input }`                                                                                                   | no                                                                           |
| `MISSING_PARAMETER`        | `TxBuildError` | protocol parameters, cost models or a deposit are not known, or could not be read (the `cause`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `{ parameter: "params" \| "costModels" \| "deposits" }`                                                       | no                                                                           |
| `MISSING_EVALUATOR`        | `TxBuildError` | execution units have to be worked out, and there is no evaluator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                          | no                                                                           |
| `EVALUATION_FAILED`        | `TxBuildError` | a script failed, or the evaluator did not price every redeemer; `part` and `label` of a single failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `{ tx, failures }`                                                                                            | no                                                                           |
| `EXUNITS_TOO_LOW`          | `TxBuildError` | a script needs more execution units than its redeemer states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `{ needed, given }`                                                                                           | no                                                                           |
| `EXUNITS_EXCEEDED`         | `TxBuildError` | the scripts need more execution units than a transaction may use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `{ mem, steps }`                                                                                              | no                                                                           |
| `EVALUATION_NOT_CONVERGED` | `TxBuildError` | execution units did not settle within the evaluation rounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | none                                                                                                          | no                                                                           |
| `INSUFFICIENT_FUNDS`       | `TxBuildError` | the payer's UTxOs cannot pay                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `{ unit, missing, required, available, reason, feeEstimate?, changeMinimum?, pool }`                          | no                                                                           |
| `INSUFFICIENT_COLLATERAL`  | `TxBuildError` | no collateral, or not enough, can be put up, given inputs and what can be added to them counted; given inputs that do not cover it with `topUpCollateral: false`; with `collateralReturn: false`, UTxOs holding tokens are not counted; also a wallet's `getCollateral` that failed (the `cause`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `{ required, available }`                                                                                     | no                                                                           |
| `OUTPUT_BELOW_MIN_COIN`    | `TxBuildError` | an output holds less lovelace than the ledger requires                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `{ coin, minCoin }`                                                                                           | no                                                                           |
| `VALUE_TOO_LARGE`          | `TxBuildError` | an output's value is larger than `maxValSize`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `{ size, maxValSize }`                                                                                        | no                                                                           |
| `TX_TOO_LARGE`             | `TxBuildError` | the transaction is larger than `maxTxSize`: its parts (`cause: "parts"`), or the inputs selected for them with their change (`"selection"`); for `"selection"` a plan puts consolidation steps before the step instead, unless the step has `sendAllTo`, the plan has `consolidate: false`, more are needed than it allows, or one cannot be built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `{ size, maxTxSize, cause }`                                                                                  | no                                                                           |
| `FEE_TOO_LOW`              | `TxBuildError` | the `fee` given is below the final transaction's minimum fee                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `{ fee, minFee }`                                                                                             | no                                                                           |
| `FEE_NOT_CONVERGED`        | `TxBuildError` | balancing did not settle on a fee within its rounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none                                                                                                          | no                                                                           |
| `UNSUPPORTED_SERIALIZER`   | `TxBuildError` | the serializer cannot serialize a `TransactionPrototype`, throws, or answers with something that is not a transaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | none                                                                                                          | no                                                                           |
| `NETWORK_MISMATCH`         | `TxBuildError` | an address, UTxO, wallet, provider, plan record, JSON of a transaction or transaction given as CBOR of another network than the builder's                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `{ expected, found }`; `found[].role`: `payer`, `wallet`, `provider`, `utxo`, `output`, `record`, `body`, ... | no                                                                           |
| `MISSING_PAYER`            | `TxBuildError` | a build or a plan without a payer; a step `plan.add` builds that names none, while the object holds no payer with the plan's change address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | none                                                                                                          | no                                                                           |
| `PROVIDER_FAILED`          | `TxBuildError` | a provider read that no other code names failed: reward balances, the payer's UTxOs, an address `replan` reads (the `cause`); a failed read of an out ref or of parameters keeps its own code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `{ operation }`                                                                                               | no                                                                           |
| `INVALID_REDEEMER`         | `TxBuildError` | a redeemer function threw, asked for an item the transaction does not hold, or returned data that is not Plutus data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `{ reason, ref? }`                                                                                            | no                                                                           |
| `INVALID_GUARD`            | `TxBuildError` | a key guard whose hash is the hash of one of the transaction's scripts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `{ reason: "scriptHash", hash }`                                                                              | no                                                                           |
| `INVALID_SELECTION`        | `TxBuildError` | `coinSelection` returned an out ref that names no candidate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `{ utxo }`                                                                                                    | no                                                                           |
| `ABORTED`                  | `TxBuildError` | the call's `signal` aborted it, in any call; `cause` is the signal's reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | none                                                                                                          | no                                                                           |
| `NOT_SERIALIZABLE`         | `TxBuildError` | a part holds a redeemer function: `toJSON()`, and `builder.plan()` on a builder with a store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | none                                                                                                          | no                                                                           |
| `WALLET_FAILED`            | `TxBuildError` | reading the payer from a wallet failed, or its answer cannot be read                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `{ walletCode? }`                                                                                             | no                                                                           |
| `INVALID_OPTION`           | `TxBuildError` | an option or argument of a value not accepted, also of a public function (`details.option` names the argument), or options with a member the call does not know; for options, a signer, a key, a payer, a submitter, a `signal` or a `tx`, and for a text, an object or a list given in place of a credential, a hash, an id, a number or a function, `details.value` is only its JavaScript type, and the message tells a text by its shape, never quoting it; from `fromCbor`, a `tx` it refuses (see [A transaction built elsewhere](#a-transaction-built-elsewhere)) and `knownUtxos` that is not a list of UTxOs or names one output in two different entries; from `builder.plan()` and `plan.add`, `steps` for a step of no known form or name, a link the plan cannot fill, or a step that cannot stand on the step before it, and from `add` also a name the plan has with other parts, more than 32 steps, or a builder that holds parts from `builder.add`; `payer` for a payer that answered two change addresses in one call | `{ option, value, allowed }`                                                                                  | no                                                                           |
| `UNKNOWN_LABEL`            | `TxBuildError` | `outputOf` with a label no output has; in a plan, a link to a label no output of that step has                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `{ label, labels }`                                                                                           | no                                                                           |
| `SIGN_DECLINED`            | `TxPlanError`  | the signer declined (CIP-30 UserDeclined, or a signer that throws `SIGN_DECLINED`); what earlier signers in the same call gave is kept, and nothing else changed; asking again is the application's choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | none                                                                                                          | no                                                                           |
| `SIGNER_FAILED`            | `TxPlanError`  | the signer failed, timed out at the step's end of validity, or changed accounts, or answered with a signature that does not verify or a witness that is not of this body; also a signing method that throws when read or is gone when asked (no `cause`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `{ reason: "error" \| "timeout" \| "accountChanged", walletCode? }`                                           | no                                                                           |
| `INVALID_WITNESS`          | `TxPlanError`  | a witness that cannot be decoded, or is not of this body (of a plan: of no step's body); from `fromCbor`, a transaction that holds a signature that is not of its body (`argument` 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `{ reason: "undecodable" \| "wrongBody", argument, keyHash? }`                                                | no                                                                           |
| `MISSING_SIGNATURES`       | `TxPlanError`  | nobody can sign (no signers named, no payer that signs), or keys are still missing before a delivery, or from `built.sign({ partial: false })` and `built.submit()`; nothing sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `{ missing: RequiredKey[] }`, each `{ keyHash, roles }`                                                       | no                                                                           |
| `MISSING_SUBMITTER`        | `TxPlanError`  | no submitter: none in the call, the builder or the provider; nothing sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | none                                                                                                          | no                                                                           |
| `NOT_YET_VALID`            | `TxPlanError`  | a step's lower bound is ahead of the tip; nothing sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `{ waitMs }`                                                                                                  | yes, `retryAfterMs` = `waitMs`                                               |
| `SUBMIT_FAILED`            | `TxPlanError`  | the outcome of a delivery is unknown, whatever its `reason` (see [A failed submission](#payer-signer-submitter)); the same bytes are safe to send again; also from `submit()` of a transaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `{ reason, status?, walletCode? }`                                                                            | yes                                                                          |
| `REJECTED`                 | `TxPlanError`  | the ledger refused a step, no delivery of it may have gone through, a search does not find it, and a search finds every step and transaction of `after` it stands on in a block (a find without a block does not count): the step is `rejected`, and the same `run()` sends the same bytes again; also from `submit()` of a transaction, when no delivery of it may have gone through and the provider does not find it or cannot be asked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `{ tipAgeMs? }`                                                                                               | no                                                                           |
| `CONFIRM_TIMEOUT`          | `TxPlanError`  | `waitFor` was not reached within `timeoutMs`, also while a step past its end of validity may still land, or a search, the tip, the store or the submitter did not answer in the time left (a submit: the step stays `sent`, its outcome unknown); also from `awaitInclusion()` of a transaction, which waits for `included`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `{ waitedFor: "included" \| "final", timeoutMs }`                                                             | yes                                                                          |
| `EXPIRED`                  | `TxPlanError`  | a step's end of validity and the margin passed, by the tip and the local clock, and it is not on chain (`unsent`: the plan never sent it): the plan does not go on, and is `stopping` or `stopped` (`error.status`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `{ unsent?, tipAgeMs? }`                                                                                      | no                                                                           |
| `SCRIPT_FAILED`            | `TxPlanError`  | a step landed with a failed script and its collateral was taken: the plan does not go on, and is `stopping` or `stopped` (`error.status`); also from `awaitInclusion()` of a transaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | none                                                                                                          | no                                                                           |
| `ORPHANED`                 | `TxPlanError`  | a step stands on a step that will not land, so it will not land either: the plan does not go on, and is `stopping` or `stopped` (`error.status`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                          | no                                                                           |
| `CANNOT_OBSERVE`           | `TxPlanError`  | the provider cannot follow plans (`noTip`, `noSearch`, `noDepth`, `noValidity`, also from `replan` and `add` for a Plutus transaction of an old plan found without its scripts' outcome), or confirmed nothing this time (`unconfirmed`; from `replan`: a transaction in a block and not final that the new plan cannot hold (a failed script, a plan before the one replaced, a search that gave no answer), a step that cannot stand on the step before it of its payer in a block, a plan whose every step is in a block, a step left past its own end, until its end and the margin pass and the search does not find it, a record that moved; from `replan` and `add`: an old transaction only a step in a block keeps from landing beside a step built, a step on an output of an old transaction the search does not find, an address that shows such an output, an old transaction past its end and the margin the search gave no answer for); also `noSearch` and `noValidity` from `awaitInclusion()` of a transaction          | `{ reason }`                                                                                                  | only `unconfirmed`, `retryAfterMs` = the builder's `pollMs`                  |
| `INVALID_STATE`            | `TxPlanError`  | the plan was stopped or replaced, a step of it will not land, so it signs and sends nothing more, or it came to `stopped` once (`halted`) and its next step is one it never sent; a plan made by `replan` that found a transaction of the old plan in a block (`error.txHash`); `replan` of a plan replaced by another id, or without a store by an object that did not make the new plan (`stopped`); `replan` or `add` of a final plan (`final`); `add` of a `stopping` or `stopped` plan (`stopped`); a step that runs a Plutus script would end past the horizon (`pastHorizon`); a record this library does not read, also from `restore` of a transaction's JSON (`recordVersion`)                                                                                                                                                                                                                                                                                                                                                  | `{ reason: "stopped" \| "final" \| "pastHorizon" \| "recordVersion" }`                                        | no                                                                           |
| `STILL_LIVE`               | `TxPlanError`  | a step `replan` or `add` built could land beside a transaction of the old plans that may still land and shares no input with it; nothing was written; without `safeAfter` (no end of validity, or found in a block once) time settles nothing, and steps that hold that transaction or spend an input of it are the way, each paying what one old step was to pay and nothing else, under its name (one step for two old steps, or two for one, can pay twice); of `replan`, when each of them was found in a block once, the search does not find it now and its end has passed, and every address it pays was read, the message says so, and that the application decides how to pay what is left                                                                                                                                                                                                                                                                                                                                       | `{ txHashes, safeAfter? }`                                                                                    | yes when it carries `safeAfter`, `retryAfterMs` until then by the tip's time |
| `PLAN_EXISTS`              | `TxPlanError`  | an `id` already recorded with other parts or options                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                                                                                          | no                                                                           |
| `PLAN_NOT_FOUND`           | `TxPlanError`  | no record under the `id` (`error.planId`), or the record is gone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                          | no                                                                           |
| `VERSION_CONFLICT`         | `TxPlanError`  | another writer changed the record and the change could not be applied again: go on through `resume`; also a JSON given to `resume` that is ahead of the stored record; from `add`, another writer added other steps: none is recorded, and the same call builds on the plan as it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | none                                                                                                          | no                                                                           |
| `STORE_FAILED`             | `TxPlanError`  | the store threw; a write may have passed: go on through `resume`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                          | no                                                                           |
| `MISSING_STORE`            | `TxPlanError`  | `resume` on a builder without a store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | none                                                                                                          | no                                                                           |
| `MISSING_ID`               | `TxPlanError`  | a plan on a builder with a store without an `id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                          | no                                                                           |

Warnings do not stop a build: `BuiltTxData.warnings` lists `VALID_FROM_FUTURE` (the lower bound
starts after the local clock's time), `COLLATERAL_FORFEITED` (collateral without a collateral
return: all of it is at stake), `COLLATERAL_RETURN_ELSEWHERE` (only from `fromCbor`: a collateral
input is held by another payment credential than the one the return pays; the message names each
holder that loses if a script fails, with its lovelace), `FEE_ABOVE_MINIMUM` (the `fee` given is
above the minimum) and `NEVER_EXPIRES` (only on a step of a plan given built without an end of
validity: see [A transaction built elsewhere as a step](#a-transaction-built-elsewhere-as-a-step)).
A transaction made by `fromCbor` lists the first three when they apply. A plan tells `trace`
`{ type: "warning", code: "HASH_MISMATCH", txHash, reportedHash }` when a submitter answers with
another hash, `{ code: "DEAD_STEP_FOUND", step, txHash, was }` when a step called `expired` or
`orphaned` is found in a block, `{ code: "TIP_AHEAD_OF_CLOCK", slot, aheadMs }` when the
provider's tip is more than two minutes ahead of the local clock (the look goes on without it),
`{ code: "CONSOLIDATION_STEPS", steps, fee }` when it puts consolidation steps in, and
`{ code: "NO_SHARED_INPUT", step, txHash, unread? }` when a step `replan` or `add` built shares
no input with an old transaction called dead, which rests on its end of validity and the
provider's search: a search that hid it, or a switch of the network to a fork deeper than the
margin and less deep than `final` where it landed in time, makes the plan pay twice (`unread`: the
addresses of the dead and the used-up transactions past the 16 a call reads, and those an old
transaction pays past the first 16 its entry keeps). A step that comes back because the step below
it was found warns of nothing.

The lists the library gives out are open: part kinds, `SignerRole`, redeemer tags,
`LanguageVersion`, native script variants, plan and step statuses, the values of `reason`,
`cause` and `role` in `details`, and warning codes. A minor version may add a value. Code that
switches on them has a default branch, and code meant to outlive a ledger era reads the fields of
`BuiltTxData` (`signers`, `inputs`, `outputs`, `redeemers`, `parts`), not `prototype`.

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
  const owner = walletOf(0);
  const beneficiary = walletOf(1);
  const attacker = walletOf(2);
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
  const lock = await builder.plan(
    output({
      address: builder.scriptAddress(script),
      value: { lovelace: 50_000_000n },
      datum: { type: "inline", data: datum },
      label: "vesting",
    }),
    { payer: owner },
  );
  await lock.run({ waitFor: "final" });

  emulator.advanceTo({ time: lockUntil + 60_000 }); // no waiting: the clock is the emulator's
  const unlock = async (payer: MeshWallet, signer: MeshWallet) =>
    builder.plan(
      [
        spend.plutus({
          utxo: outputOf(lock.step("main"), "vesting"),
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
  await expect(unlock(attacker, attacker)).rejects.toMatchObject({
    code: "EVALUATION_FAILED",
    label: "unlock",
  });
  // The beneficiary's unlock signed by someone else: refused before the ledger, naming the key
  await expect(
    (await unlock(attacker, beneficiary)).run({ signers: attacker }),
  ).rejects.toMatchObject({
    code: "MISSING_SIGNATURES",
    details: { missing: [{ keyHash: await keyHashOf(beneficiary) }] },
  });
  // The beneficiary unlocks
  const claim = await unlock(beneficiary, beneficiary);
  await claim.run({ waitFor: "final" });
  expect(claim.status).toBe("final");
  expect(claim.step("main").redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
});
```

`planDefaults: { expiryMarginMs: 0, confirmations: 0 }` makes `final` come at once on the
emulator, and `expired` once the local clock too is past the end of validity (see the emulator's
row in [Deadlines and waiting](#deadlines-and-waiting)); `pollMs: 10, resendMs: 10` keeps waiting
short. The emulator needs none of them.

## Providers and networks

Every plan needs from the builder's provider the chain's tip with its block height
(`fetchLatestBlock`), and the search for a transaction with its block height (`fetchTxInfo`'s
`blockHeight`), and for a step that runs a Plutus script `validContract`. Without them:
`CANNOT_OBSERVE` (`noTip`, `noSearch`, `noDepth` or `noValidity`) from `builder.plan()`, before
anything is signed. Plans work on `TxEmulator` and on Blockfrost. A provider without a search can
still submit, as the builder's `submitter`, with another provider reading.

Until a `@meshsdk/provider` release returns block heights and `validContract`, and `@meshsdk/core`
pins it, give the builder this subclass of `BlockfrostProvider`. It is temporary: remove it once
the provider returns them itself. It costs one more request for each tip and each found step.

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
- `MeshTxBuilderBody`, with `emptyTxBuilderBody` and `cloneTxBuilderBody`, and the serializers'
  `serializeTxBody` and `serializeTxBodyWithMockSignatures` are `@deprecated` as well, and still
  work. No builder calls the two methods: `MeshTxBuilder` turns its body into parts, and `TxBuilder`
  serializes the `TransactionPrototype` it assembles (`serializeTxPrototype`). `TxParser` and
  `TxTester` still work on a body and are not deprecated.
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
- It takes and returns the Mesh `UTxO` as before; the adapter converts at its border. A
  `scriptHash`, and a `dataHash` beside `plutusData`, which this API never read, are left out of
  the UTxOs the adapter hands the builder (those of the calls and those it read through the
  fetcher), so neither refuses one of them: the script's hash is taken from `scriptRef`, the inline
  datum from `plutusData`. An output the adapter could not read, which the builder then looks up
  through the fetcher itself, is read as any provider answer (`UTXO_NOT_FOUND` for one it
  refuses). The inputs written back into the body, and the
  UTxOs handed to its evaluator, are the Mesh UTxOs the calls gave or the fetcher read, as they
  were given; change, and an input the adapter did not hold, are written with `toMeshUtxo`. An
  output's inline datum (`txOutInlineDatumValue`) with bytes after its Plutus data is now
  `INVALID_DATA`.
- With a fetcher and no `evaluator`, scripts are evaluated locally by `OfflineEvaluatorScalus`;
  `evaluator: null` keeps the units given. Such an evaluator is handed the UTxOs it runs on, so a
  script input given with its amount and address that the provider does not know yet is
  `UTXO_NOT_FOUND`: give it with `chainTx` or `inputForEvaluation`, or pass `evaluator: null`.
  Every Plutus transaction gets collateral (chosen from `selectUtxosFrom` when no `txInCollateral`
  is given), `total_collateral` and a collateral return. Collateral given with `txInCollateral` is
  put up as given, as before: when it does not cover the collateral the build is
  `INSUFFICIENT_COLLATERAL`, and nothing is added to it.
- The network of the build is the new `network` option, else the fetcher's `network`, else a
  `setNetwork()` name of the change address's network, else mainnet for a mainnet change address.
  A script transaction with a validity interval on a test network none of them names is
  `EVALUATION_FAILED` with the default evaluator: pass `network`, or call `setNetwork()`.
- `reset()` also clears a fee set with `setFee()`, and keeps the protocol parameters;
  `protocolParams()` calls merge in call order.

| Member                                                                                                                                                                                                             | State               | Replacement                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| the fluent methods `txIn` … `inputForEvaluation`, `complete()`, `completeSync()`, `completeUnbalanced()`, `completeUnbalancedSync()`, `completeSigning()`, `submitTx()`, `reset()`, the fields                     | kept                | —                                                                                    |
| `calculateMinLovelaceForOutput`, `calculateFee`, `getActualFee`, `calculateFeeForSerializedTx`, `calculateRefScriptFee`, `calculateRedeemersFee`, `getTotalExecutionUnits`, `getSerializedSize`, `serializeMockTx` | kept                | for new code: `minCoin`, `minFee` and the fields of `BuiltTxData` (`fee`, `exUnits`) |
| `selectUtxos`                                                                                                                                                                                                      | removed             | `TxBuilder.build(parts, { payer })`: selection is the builder's                      |
| `updateByTxPrototype`                                                                                                                                                                                              | removed             | the body is written back by `complete()`                                             |
| `getUtxosForSelection`                                                                                                                                                                                             | removed             | `payer.utxos` (or `selectUtxosFrom()`)                                               |
| `completeCostModels`                                                                                                                                                                                               | removed             | `TxBuilder`'s `costModels` option, or the provider                                   |
| `evaluateRedeemers`                                                                                                                                                                                                | removed             | the builder evaluates the balanced transaction; the `evaluator` option               |
| `sortTxParts`, `sortInputs`, `sortMints`, `sortWithdrawals`, `sortVotes`, `sortProposals`                                                                                                                          | removed             | the builder orders every item by the ledger's rules                                  |
| the protected members (`completeTxParts`, `sanitizeOutputs`, `getUTxOInfo`, `complete…Info`, `is…Complete`, ...)                                                                                                   | removed             | —                                                                                    |
| `txEvaluationMultiplier`                                                                                                                                                                                           | kept, `@deprecated` | multiplies nothing                                                                   |

`txEvaluationMultiplier` is `@deprecated` and multiplies nothing: a redeemer's execution units are
the evaluation of the final transaction, and a value other than 1 makes the first `complete()` of
the process that sees it write one console warning. Protocol parameters are read from the fetcher at
`complete()`, with the fields the consumer gave on top. Built-in values are used only where there is
nobody to ask: without a fetcher, when it fails or answers nothing, and in the synchronous calls and
queries, which take the values the last `complete()` read, else the built-in ones; the first
`complete()` of the process that builds on them writes one console warning, and the cure is a
`fetcher` or `params`. `isHydra` sets five parameters to zero and keeps `collateralPercent`; see
[Providers and networks](#providers-and-networks).
