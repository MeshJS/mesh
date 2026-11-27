# Transaction emulator for Mesh

A local Cardano ledger for trying transactions out, alone or in chains: `simulate` reports what
a transaction would do without changing anything, `submit` applies it, and every later
transaction sees the result. UTxOs are kept by the [Scalus](https://scalus.org) ledger through
`@meshsdk/scalus-emulator`; transactions are validated by the validator you choose.

```ts
import { MeshTxBuilder } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";

const emulator = await TxEmulator.create({ validator: "cquisitor", utxos }); // mainnet

// The emulator is a Mesh fetcher, evaluator and submitter
const txHex = await new MeshTxBuilder({
  fetcher: emulator,
  evaluator: emulator,
  params: await emulator.fetchProtocolParameters(),
})
  .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
  .changeAddress(address)
  .selectUtxosFrom(utxos)
  .complete();

const result = await emulator.simulate(await wallet.signTx(txHex));
if (result.accepted) {
  result.fee; // lovelace
  result.redeemers; // execution units each script used
  result.consumed; // UTxOs spent
  result.produced; // UTxOs created
} else {
  result.errors; // [{ rule, message, hint?, locations?, phase }]
}
```

`simulate` and `submit` take CBOR hex or a `TransactionPrototype`. Transactions are checked one at
a time, in the order they are given.

## Validators

The `validator` option is required: it picks what decides whether a transaction is valid. Both
check the ledger rules for payments, scripts and staking, and run Plutus scripts, but for the
limits listed below; they differ in what else they check and in how they report problems.

|                                   | `"scalus"`                     | `"cquisitor"`                                                   |
| --------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Problems reported                 | the first broken rule          | every problem, with hints and locations, and warnings           |
| Signatures                        | required                       | required; `{ requireSignatures: false }` checks unsigned txs    |
| Governance rules                  | what needs no governance state | checked: proposals, votes, deposits, guardrails, committee      |
| Refund of a stake address deposit | the current deposit            | the deposit paid                                                |
| Package                           | built in                       | install `@cardananium/cquisitor-lib` (optional peer dependency) |

With `{ requireSignatures: false }`, missing key witnesses are not reported, and a native script
passes if it would once every key it names has signed; its time locks still apply. The fee and
the size limit are checked as they will be once the transaction is signed, with a signature for
each key still to sign.

### Limits of `"scalus"`

- Of governance, only what needs no governance state is checked, such as a proposal's deposit
  and that the stake address it returns to is registered. Votes, the action a proposal follows,
  the guardrail script, committee certificates and the treasury value a transaction states are
  not checked, nor is a withdrawal to a key-hash stake address that delegates its vote to no
  DRep, which the ledger refuses. Scalus checks these against a governance state of its own,
  made by the transactions it applied itself, and the emulator's cannot be copied into it in
  full, so its refusal by them is not taken. Their effects on the state are still applied; a
  transaction accepted against such a refusal reports no script logs.
- A stake address's deposit is taken to be the current protocol parameter, so a deregistration
  must claim that as its refund, whatever was paid when the address was registered.
- Only the first broken rule is reported, with no hints or locations, and no warnings besides
  `NotChecked`.
- Signatures are always checked: `{ requireSignatures: false }` throws.

### Limits of `"cquisitor"`

- Some proposals the ledger refuses are accepted: a parameter change that is not well formed, a
  committee update adding a member whose term has already ended, and a hard fork to a protocol
  version that cannot follow the current one.
- Signatures for Byron addresses are not verified.
- It is a separate install: a 5 MB package (18 MB unpacked) of WebAssembly, loaded on first use.

### Choosing

- `"scalus"` for payments, scripts and staking, when the first broken rule is enough, with
  nothing more to install.
- `"cquisitor"` for governance transactions, for unsigned transactions, for deregistrations of
  stake addresses registered under another deposit, and to see every problem with a transaction
  at once, with hints on fixing them.

Both check a simple transaction in a few milliseconds. The rule names differ between them (a
missing signature is `MissingKeyHashes` for Scalus and `MissingVKeyWitnesses` for cquisitor), so
code that matches on `rule` is tied to one validator.

## Chains and state

Every accepted transaction changes the emulator's state, and the next one is checked against it:

- UTxOs: inputs spent, outputs created (only the collateral, for a transaction marked invalid);
- stake addresses: registration and deposit, rewards withdrawn, pool and DRep delegations;
- pools: registration, retirement; DReps: registration, which a deregistration undoes along
  with the votes delegated to it;
- governance actions proposed, with their deposits; committee hot credentials and resignations;
- donations.

The emulator reads its state back through the Mesh provider interfaces it implements:

```ts
await emulator.submit(registerTx);
await emulator.submit(delegateTx); // sees the registration

await emulator.fetchAccountInfo(rewardAddress); // { active, poolId, drep, deposit, rewards, … }
await emulator.fetchPoolState(poolId); // IStakePoolFetcher
await emulator.fetchDRepState(drepId); // IGovernanceFetcher
await emulator.fetchGovernanceProposal(txHash, 0);
emulator.utxos({ address }); // every UTxO, or those matching a filter

const branch = emulator.fork(); // an independent copy of the whole ledger
```

`submitTx` submits like any Mesh submitter, throwing a `TxRejectedError` carrying the result
when the ledger rejects the transaction. `evaluateTx` evaluates like any Mesh evaluator,
rejecting with the `ScriptEvaluationError` of `@meshsdk/common` when a script fails: its
`failures` name the redeemer (`tag`, `index`) with the evaluator's message, the script's logs
and the budget it spent.

## Blocks and the search

The emulator answers as a provider of a chain with a block in every slot:

```ts
const tip = await emulator.fetchLatestBlock(); // the block of the current slot
tip.slot; // String(emulator.slot)
tip.height; // emulator.slot

const txHash = await emulator.submitTx(signedTx);
const info = await emulator.fetchTxInfo(txHash);
info.blockHeight; // the slot it was applied in
info.validContract; // false for a transaction marked invalid, which only paid its collateral
tip.height - info.blockHeight; // its depth: the slots passed since

await emulator.awaitTransactionConfirmation(txHash); // true at once
```

`fetchTxInfo` finds every transaction `submit` and `submitTx` applied, and the transaction hash
of every output that entered the ledger without one (given to `create`, read by `fromChain`,
added by `addUtxos` or `fund`), as a transaction accepted in the slot the output appeared in.
The answer stays after the outputs are spent or removed. Transactions of one slot share a block,
`index` being their place in it. Nothing else is found: not what `simulate` checked, nor a
transaction refused. For any other hash it rejects with the `ProviderError` of
`@meshsdk/common` a provider throws for "not found": `kind: "notFound"`, `status: 404`.

`awaitTransactionConfirmation` resolves `true` at once for every hash `fetchTxInfo` finds, a
transaction marked invalid included, and rejects at once with `TxConfirmTimeoutError` for any
other: nothing else can apply a transaction meanwhile.

A refusal is told from other failures as a provider's: `TxRejectedError` is a `ProviderError`
with `kind: "rejected"` and `status: 400`, and `body` is the result. The search and the wait
answer from the state as it is: await `submit` and `submitTx` first.

## Starting state

```ts
await TxEmulator.create({
  validator: "cquisitor",
  network: "preprod", // mainnet by default
  params: { minFeeA: 44 }, // protocol parameters replacing the network's, all or some
  utxos,
  slot: 1_000,
  accounts: [{ rewardAddress, rewards: "5000000", poolId, drep: drepId }],
  pools: [{ poolId }],
  dreps: [{ drepId }],
  governance: {
    actions: [
      {
        transactionId,
        govActionIndex: 0,
        kind: GovernanceActionKind.InfoAction,
      },
    ],
    lastEnacted: [
      {
        transactionId,
        govActionIndex: 0,
        kind: GovernanceActionKind.NoConfidenceAction,
      },
    ],
    committee: [{ cold: { type: "KeyHash", keyHash }, resigned: false }],
    treasury: "1000000000",
    constitution: { anchor, guardrailScriptHash },
  },
  datums: [datumCbor], // datums of outputs seeded with only a hash
});
```

Left out, the treasury and the constitution are not known: a transaction stating the treasury
is taken at its word, and the guardrail script a proposal names is not checked. Such state is
reported in the result's warnings, with the rule `NotChecked`.

## Changing the state

The state can also be changed directly, without a transaction: for rewards, which the emulator
does not pay, for governance outcomes, which it does not ratify or enact, or to fund a wallet or
change a parameter midway.

```ts
emulator.addUtxos([utxo]); // replacing any output at the same input
emulator.removeUtxos([utxo.input]);
const funded = emulator.fund(address, { lovelace: 100_000_000n, [unit]: 5n }); // the new UTxO

emulator.setAccount({ rewardAddress, rewards: "5000000" }); // registered, or changed
emulator.removeAccount(rewardAddress);
emulator.setPool({ poolId, retirementEpoch: 600 });
emulator.removePool(poolId); // undelegating its stake
emulator.setDRep({ drepId });
emulator.removeDRep(drepId); // undelegating the votes delegated to it

emulator.setGovernanceAction({ transactionId, govActionIndex: 0, kind });
emulator.removeGovernanceAction({ transactionId, govActionIndex: 0 });
emulator.setLastEnacted({ transactionId, govActionIndex: 0, kind });
emulator.setCommitteeMember({ cold, potential: false }); // a proposed member elected
emulator.removeCommitteeMember(cold);
emulator.setTreasury("1000000000");
emulator.setConstitution({ anchor, guardrailScriptHash });

emulator.setProtocolParameters({ maxTxSize: 20_000 }); // the others keep their values
```

`fund` adds one output, with no datum and no script, under a made-up transaction hash, at
output index 0. The address may be bech32 or the hex of its bytes; the output holds it as
bech32 (base58 for a Byron address). The hashes come from a counter, so they are the same on
every run, and a hash the ledger has held an output under is passed over.

The `set` methods take what `create` does. For a stake address, pool, DRep, governance action
or committee member already in the ledger, fields left out keep their values, and `null` removes
a delegation, a pending retirement or a hot credential. No change pays or refunds a deposit.
Removing a committee update also removes the members only it proposed, as the ledger forgets
them when no pending update proposes them: elect such a member with `setCommitteeMember` first.

What a change sets is known from then on, and checked, in a ledger built with `fromChain` too.
The state cannot change while a transaction is being checked: await `simulate` and `submit`
first.

## Checking against the chain

`TxEmulator.fromChain` builds an emulator holding the chain state a transaction reads, fetched
from providers, so simulating the transaction checks it against the chain as it is now:

```ts
const emulator = await TxEmulator.fromChain(txHex, {
  validator: "cquisitor",
  fetcher: provider,
});
const result = await emulator.simulate(txHex);
```

The fetcher provides the outputs the transaction spends and references, the protocol
parameters and cost models, the stake addresses it touches and, with `fetchGovernanceProposal`,
the governance actions it votes on or follows; failing to read the outputs or the parameters
throws. Pools are read from an `IStakePoolFetcher`, and DReps, the committee, the last enacted
actions, the treasury and the constitution from an `IGovernanceFetcher`: the fetcher itself when
it implements them, or the providers given as `pools` and `governance`.

The snapshot uses the source emulator's current slot or the slot returned by the provider's
`fetchLatestBlock()`. Pass `slot` to override it. If no slot is supplied or available, the
emulator estimates it from the local clock.

State no provider reports is taken to be as the transaction needs it, so it cannot fail the
transaction, and is listed in the result's warnings with the rule `NotChecked`. So is what a
provider leaves out of an answer, such as a deposit, a pool's reward address or a stake
address's DRep delegation (`drep` in `AccountInfo`, `null` when it delegates to none), and an
answer that cannot be read. So is whether a governance action is still pending, and open to
votes, when the provider reports none of its epochs, as some write 0 for all of them: a vote on
it, or a proposal following it, is not refused for it. Each transaction checked on the ledger
is taken at its own needs.

## Time

```ts
emulator.advanceTo({ slot: emulator.slot + 100 });
emulator.advanceTo({ time: Date.now() + 3_600_000 });
emulator.advanceTo({ epoch: emulator.epoch + 1 }); // the epoch's first slot
```

The clock only moves forward, and only through `advanceTo`: transactions and changes of the
state do not move it. The wall clock is read once, for the starting slot when none is given or
available (the slot containing the current time), and never after. `emulator.slotConfig` is the
network's slot clock as a Mesh `SlotConfig`, equal to `SLOT_CONFIG_NETWORK[network]` of
`@meshsdk/common`.
The tip is the block of the current slot, so its `time` is the slot's start, in POSIX seconds.

Entering an epoch retires the pools due to retire, paying their deposits back and undelegating
their stake, adds the previous epoch's donations to the treasury, and removes the governance
actions past their lifetime, returning their deposits, with the committee members only they
proposed. Committee members proposed but not sitting lose their hot credentials and
resignations, as the ledger keeps those only for the sitting committee: such a member authorises
its hot credential again in each epoch until it is elected. No rewards are paid, and no
governance actions are ratified or enacted.

## Limits

- The state model covers what transactions change; it is not a full ledger. Rewards, governance
  ratification and enactment, and DRep expiry are not computed; their outcomes can be set
  directly.
- Each validator leaves some rules unchecked: see [Validators](#validators).
- There is a block in every slot and no mempool: an applied transaction is in the block of the
  current slot and found at once, and the tip's `height` is the slot number. Blocks carry no
  totals, slot leader or certificates. There are no rollbacks: play one by switching to a copy
  made with `fork()` before. `fund` on a copy never gives a hash that `fund` on its original
  gives, and two copies of the same state give the same hashes.
- Both validators hash a native script as they re-encode it, not over the bytes the transaction
  or output carries. A valid script encoded another way, with indefinite-length lists (as the
  ledger's own encoder writes lists of more than 23 scripts) or integers longer than needed,
  gets another hash, and a transaction spending through it is rejected. `utxos()` lists such
  reference scripts re-encoded.
- `fromChain` reads the outputs a transaction spends with `fetchUTxOs`, which most indexers
  answer with spent outputs too, so a transaction spending an output already spent on chain is
  not caught.
- Protocol parameters default to the values Scalus ships for each network. The `params` option,
  `setProtocolParameters` and `fromChain` replace only those a Mesh `Protocol` carries; governance
  deposits and lifetimes, thresholds and the protocol version keep the network's values.
- With `"scalus"`, Scalus's ledger is rebuilt from the emulator's state, copying every UTxO,
  before the next transaction after one Scalus applies otherwise than the state: one with pool,
  DRep or committee certificates, one marked invalid, one needing state `fromChain` did not
  read, one accepted against its refusal by a rule that is not checked; after a change made
  without a transaction or an epoch boundary; and before a transaction reading a stake address
  withdrawn from since, as Scalus does not take withdrawals off its rewards. Stake address
  registrations and delegations need none. On an Apple M3 Max, chains of 50 transactions took
  per transaction:

  | UTxOs  | payments | registering and deregistering a stake address | withdrawing from one stake address |
  | ------ | -------- | --------------------------------------------- | ---------------------------------- |
  | 1,000  | 1.3 ms   | 1.9 ms                                        | 2.0 ms                             |
  | 10,000 | 2.9 ms   | 4.0 ms                                        | 9.3 ms                             |
  | 50,000 | 16 ms    | 21 ms                                         | 71 ms                              |

- Scalus is ESM-only and cquisitor-lib is WebAssembly, both loaded with a dynamic `import()`, so
  `create` is asynchronous; it works from both ESM and CommonJS.
