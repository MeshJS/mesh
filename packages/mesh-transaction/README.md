# mesh-transaction

Transactions - [meshjs.dev/apis/transaction](https://meshjs.dev/apis/transaction)

[meshjs.dev](https://meshjs.dev/)

## Building transactions from parts

`TxBuilder` builds a balanced, unsigned transaction from _parts_: one value per piece of the
transaction, each built by one call that takes all its arguments at once and checks them there.

```ts
import { output, spend, TxBuilder } from "@meshsdk/transaction";

const builder = new TxBuilder({ fetcher: provider, evaluator: provider });

const built = await builder.build({
  parts: [output({ address: recipient, value: { lovelace: 5_000_000n } })],
  changeAddress: walletAddress,
  utxos: await wallet.getUtxos(),
});

const signed = await wallet.signTx(built.tx);
```

The builder looks up what the parts leave open, selects inputs from `utxos`, returns change to
`changeAddress`, puts up collateral when a Plutus script runs, works out execution units and
settles the fee. A builder keeps no state between builds; reuse it.

### Parts

| Part             | Builder                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Spend an output  | `spend.pubKey`, `spend.native`, `spend.plutus`                                                                        |
| Read an output   | `referenceInput`                                                                                                      |
| Pay              | `output`                                                                                                              |
| Collateral       | `collateral`, `collateralReturn`                                                                                      |
| Mint or burn     | `mint.native`, `mint.plutus`                                                                                          |
| Withdraw rewards | `withdrawal.pubKey`, `withdrawal.native`, `withdrawal.plutus`                                                         |
| Certificates     | `certificate.stakeRegistration`, `.stakeDelegation`, `.voteDelegation`, `.drepRegistration`, `.poolRegistration`, ... |
| Governance       | `vote`, `proposal.info`, `proposal.treasuryWithdrawals`, `proposal.parameterChange`, ...                              |
| Everything else  | `guard.pubKey`, `validity`, `metadata`, `message`, `auxiliaryScript`, `donation`, `treasuryValue`, `networkId`        |

Parts are immutable and their order does not matter, except for certificates, proposals and
outputs, which keep it. Outputs given by out ref alone (`{ txHash, outputIndex }`) are fetched;
passing the full `UTxO` spares the lookup. Every part takes an optional `label`, echoed in errors
about it.

### Scripts

```ts
import { mConStr0 } from "@meshsdk/core";
import { mint, spend } from "@meshsdk/transaction";

const built = await builder.build({
  parts: [
    // A script output, unlocked with a script held in a reference output
    spend.plutus({
      utxo: { txHash, outputIndex: 0 },
      script: { reference: { txHash: refTxHash, outputIndex: 0 } },
      redeemer: { data: mConStr0([]) },
      label: "unlock",
    }),
    mint.plutus({
      script: { code: policyCbor, version: "V3" },
      redeemer: { data: mConStr0([]) },
      assets: { [assetNameHex]: 1n },
    }),
  ],
  changeAddress: walletAddress,
  utxos: walletUtxos,
});

built.redeemers; // [{ tag: "SPEND", index, exUnits, label: "unlock", part }, { tag: "MINT", ... }]
```

- Redeemers given without `exUnits` are evaluated with the builder's `evaluator`; the
  transaction is balanced again with the evaluated units until they settle. Redeemers given with
  `exUnits` keep them, and need no evaluator.
- Redeemer indices are assigned once, from where each item ends up in the ledger's order:
  sorted inputs, policies, reward accounts and voters; certificates and proposals as given.
- Collateral is taken from `utxos` (or the `collateral` parts given), with what exceeds
  `collateralPercent` of the fee returned to `changeAddress` (or the `collateralReturn` part's
  address).
- The datum of a spent script output is worked out from the output: inline, none (Plutus V3), or
  pass `datum: { data }` for an output holding a datum hash.

### Staking and governance

```ts
import { certificate, proposal, vote, withdrawal } from "@meshsdk/transaction";

const builder = new TxBuilder({
  fetcher: provider,
  evaluator: provider,
  // Not part of Mesh's Protocol type: give them to take governance deposits from them
  deposits: { drepDeposit: 500_000_000n, govActionDeposit: 100_000_000_000n },
});

await builder.build({
  parts: [
    certificate.stakeRegistration({ stake: rewardAddress }), // keyDeposit
    certificate.voteDelegation({ stake: rewardAddress, drep: "alwaysAbstain" }),
    withdrawal.pubKey({ rewardAddress: otherAccount, amount: "all" }), // balance looked up
    proposal.info({ rewardAccount: rewardAddress, anchor }), // govActionDeposit
    vote({
      voter: { drep: drepId },
      votes: [{ action: { txHash: actionTx, index: 0 }, vote: "yes" }],
    }),
  ],
  changeAddress: walletAddress,
  utxos: walletUtxos,
});
```

Deposits and refunds are counted in the balance. A pool registration takes `poolDeposit` unless
its operator is listed in `registeredPools`, which marks it as an update.

### The result

```ts
const {
  tx, // unsigned transaction, CBOR hex
  txHash,
  prototype, // the TransactionPrototype tx was serialized from
  fee,
  exUnits, // total { mem, steps }
  redeemers, // per redeemer: tag, index, exUnits, label, part
  inputs, // every input spent, resolved, in transaction order
  selectedInputs, // inputs added to pay for the transaction
  change, // change outputs
  collateral, // { inputs, total, return? } when a Plutus script runs
  parts, // every part, resolved, those added by balancing included
} = built;
```

`builder.serialize(prototype)` serializes a prototype the same way, e.g. after inspecting or
adjusting it.

### Options

| `new TxBuilder({...})` |                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `fetcher`              | looks up outputs given by reference, reward balances, protocol parameters, cost models                 |
| `evaluator`            | evaluates redeemers given without execution units                                                      |
| `serializer`           | an `IMeshTxSerializer` implementing `serializeTxPrototype`; the `@meshsdk/core-cst` encoder by default |
| `params`               | protocol parameters; fetched when omitted, Mesh's defaults without a fetcher                           |
| `costModels`           | Plutus V1, V2, V3 cost models; fetched only when a Plutus script runs                                  |
| `deposits`             | `drepDeposit`, `govActionDeposit`                                                                      |

| `builder.build({...})` |                                                                               |
| ---------------------- | ----------------------------------------------------------------------------- |
| `parts`                | the transaction's parts                                                       |
| `changeAddress`        | where change goes                                                             |
| `utxos`                | UTxOs to select inputs and collateral from; only key-locked ones are selected |
| `fee`                  | a fixed fee, used as is; rejected when below the minimum                      |
| `registeredPools`      | operator key hashes of pools already registered                               |
| `extraKeyWitnesses`    | signatures expected beyond those the parts call for                           |

Within a build, each transaction's outputs are fetched once, and all lookups run concurrently.

### Errors

Part builders throw `TxPartError` at the call that built the part. `build` throws
`TxBuildError`, with a `code` to branch on, and `part`, `label` and `details` where they apply:

```ts
try {
  await builder.build(request);
} catch (error) {
  if (error instanceof TxBuildError && error.code === "INSUFFICIENT_FUNDS") {
    const { unit, missing } = error.details as {
      unit: string;
      missing: bigint;
    };
  }
}
```

| Code                                                         | Meaning                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `UNRESOLVED`                                                 | a part left something open that nothing filled in                  |
| `DUPLICATE_PART`                                             | the same input, policy, reward account, voter, ... given twice     |
| `MISSING_FETCHER` / `UTXO_NOT_FOUND`                         | an output given by reference could not be looked up                |
| `MISSING_PARAMETER`                                          | a deposit parameter is unknown, or parameters could not be fetched |
| `INSUFFICIENT_FUNDS`                                         | `utxos` cannot pay; `details` says for what                        |
| `INSUFFICIENT_COLLATERAL` / `INVALID_COLLATERAL`             | collateral cannot be put up as required                            |
| `OUTPUT_BELOW_MIN_COIN` / `VALUE_TOO_LARGE` / `TX_TOO_LARGE` | a ledger limit is broken                                           |
| `FEE_TOO_LOW`                                                | the fixed `fee` is below the minimum                               |
| `MISSING_EVALUATOR` / `EVALUATION_FAILED`                    | execution units could not be worked out                            |
| `EXUNITS_TOO_LOW` / `EXUNITS_EXCEEDED`                       | stated or total execution units do not fit                         |

### Assembling without balancing

`assembleTxPrototype(parts, { fee, costModels })` is the step `build` ends with: it puts complete
parts together into a `TransactionPrototype` — ordering, redeemer indices, reference inputs,
witness scripts and datums, collateral return, hashes — and nothing else. Use it to build a
transaction balanced by hand.
