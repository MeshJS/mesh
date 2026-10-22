# Transaction emulator for Mesh

A local Cardano ledger for trying transactions out, alone or in chains: `simulate` reports what
a transaction would do without changing anything, `submit` applies it, and every later
transaction sees the result. UTxOs are kept by the [Scalus](https://scalus.org) ledger through
`@meshsdk/scalus-emulator`; transactions are validated by the validator you choose.

```ts
import { MeshTxBuilder } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";

const emulator = await TxEmulator.create({ validator: "cquisitor", utxos }); // mainnet

// The same ledger as a Mesh fetcher, submitter and evaluator
const txHex = await new MeshTxBuilder({
  fetcher: emulator.provider,
  evaluator: emulator.provider,
  params: await emulator.provider.fetchProtocolParameters(),
})
  .txOut(address, [{ unit: "lovelace", quantity: "2000000" }])
  .changeAddress(address)
  .selectUtxosFrom(utxos)
  .complete();

const result = await emulator.simulate(await wallet.signTx(txHex));
if (result.accepted) {
  result.fee; // bigint
  result.redeemers; // execution units each script used
  result.consumed; // UTxOs spent
  result.produced; // UTxOs created
} else {
  result.errors; // [{ rule, message, hint?, locations?, phase }]
}
```

`simulate` and `submit` take CBOR hex or a `TransactionPrototype`.

## Validators

The `validator` option is required.

|                                    | `"scalus"`            | `"cquisitor"`                                                   |
| ---------------------------------- | --------------------- | --------------------------------------------------------------- |
| Problems reported                  | the first broken rule | every problem, with hints and locations, and warnings           |
| Signatures                         | required              | required; `{ requireSignatures: false }` checks unsigned txs    |
| Governance rules                   | not checked           | checked: proposals, votes, deposits, guardrails, committee      |
| Pools and DReps delegated to exist | not checked           | checked                                                         |
| Package                            | built in              | install `@cardananium/cquisitor-lib` (optional peer dependency) |

## Chains and state

Every accepted transaction changes the emulator's state, and the next one is checked against it:

- UTxOs: inputs spent, outputs created (only the collateral, for a transaction marked invalid);
- stake addresses: registration and deposit, rewards withdrawn, pool and DRep delegations;
- pools: registration, retirement; DReps: registration;
- governance actions proposed; committee hot credentials and resignations.

```ts
await emulator.submit(registerTx);
await emulator.submit(delegateTx); // sees the registration
emulator.account(rewardAddress); // { deposit, rewards, pool?, drep? }

// Play a chain on a copy, leaving the emulator as it is
const results = await emulator.simulateChain([tx1, tx2, tx3]);

const branch = emulator.fork(); // an independent copy of the whole ledger
```

Queries: `utxos({ address, txHash, unit })`, `account`, `pool`, `drep`, `govAction`,
`committeeMember`.

## Starting state

```ts
await TxEmulator.create({
  validator: "cquisitor",
  network: "preprod", // mainnet by default; or `info`, a Scalus `CardanoInfo`
  utxos,
  slot: 1_000,
  accounts: [
    { rewardAddress, rewards: 5_000_000n, pool: poolId, drep: drepId },
  ],
  pools: [{ poolId }],
  dreps: [{ drepId }],
  govActions: [{ txHash, index: 0, type: GovernanceActionKind.InfoAction }],
  lastEnacted: [
    { txHash, index: 0, type: GovernanceActionKind.NoConfidenceAction },
  ],
  committee: [{ cold: { type: "key", hash } }],
  treasury: 1_000_000_000n,
  guardrailScriptHash, // the constitution's guardrail script
  datums: [datumCbor], // datums of outputs seeded with only a hash
});
```

## Checking against the chain

`TxEmulator.fromChain` builds an emulator holding the chain state a transaction reads, fetched
from a provider, so simulating the transaction checks it against the chain as it is now:

```ts
const emulator = await TxEmulator.fromChain(provider, txHex, {
  validator: "cquisitor",
});
const result = await emulator.simulate(txHex);
```

A plain `IFetcher` provides the outputs the transaction spends and references, the protocol
parameters and cost models, and the stake addresses it touches. A provider implementing the
optional methods of `IFetcherExtended` (`@meshsdk/common`) also provides the tip slot, DRep
delegations, pools, DReps, governance actions, the committee, the treasury and the constitution.
State given in the options is added, and takes precedence.

## Time

```ts
emulator.tick(100); // slots
emulator.setTime(Date.now() + 3_600_000);
emulator.advanceToEpoch(); // the first slot of the next epoch
```

Entering an epoch retires the pools scheduled to retire. Nothing else happens at an epoch
boundary: no rewards are paid and no governance actions are ratified or enacted.

## Limits

- The state model covers what transactions change; it is not a full ledger. Rewards, governance
  ratification and enactment, and DRep expiry are not computed.
- With the `scalus` validator, governance rules and the existence of the pools and DReps delegated
  to are not checked, and only the first broken rule is reported.
- Protocol parameters default to the values Scalus ships for each network; `fromChain` replaces
  them with the provider's.
- Scalus is ESM-only and cquisitor-lib is WebAssembly, both loaded with a dynamic `import()`, so
  `create` is asynchronous; it works from both ESM and CommonJS.
