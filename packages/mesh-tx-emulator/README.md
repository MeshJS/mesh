# Transaction emulator for Mesh

A local Cardano ledger for trying transactions out: `simulate` runs a transaction against a copy
of the ledger and reports what would happen, `submit` keeps its effects. Validation uses the
ledger rules and Plutus evaluation of [Scalus](https://scalus.org), through
`@meshsdk/scalus-emulator`.

```ts
import { MeshTxBuilder } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";

const emulator = await TxEmulator.create({ utxos }); // mainnet by default

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
  result.rule; // e.g. "ValueNotConserved", "ScriptFailure", "MissingKeyHashes"
  result.message;
  result.logs; // script traces
}
```

`simulate` and `submit` take CBOR hex or a `TransactionPrototype`. A rejected transaction changes
nothing.

## Starting state

```ts
await TxEmulator.create({
  network: "preprod", // or `info`, a Scalus `CardanoInfo` with custom parameters
  utxos,
  slot: 1_000,
  stakeRegistrations: [{ rewardAddress, rewards: 5_000_000n, pool: poolId }],
  drepRegistrations: [{ drepId }],
  datums: [datumCbor], // datums of outputs seeded with only a hash
});
```

## Scenarios and time

```ts
const branch = emulator.fork(); // an independent copy of the whole ledger
await branch.submit(tx1);

emulator.tick(100); // slots
emulator.setTime(Date.now() + 3_600_000);
emulator.advanceToEpoch(); // the first slot of the next epoch

emulator.utxos({ address }); // also by txHash or unit
emulator.delegation(rewardAddress); // { pool?, rewards }
```

## Limits

- Transactions are validated in full, so they must carry their signatures; an unsigned one is
  rejected with `MissingKeyHashes`.
- Time moves only when told to. There is no epoch processing: no rewards are paid and no
  governance actions are enacted.
- The package is ESM-only Scalus underneath, loaded with a dynamic `import()`, so `create` is
  asynchronous; it works from both ESM and CommonJS.
