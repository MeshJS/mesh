# mesh-core-cst

Types and utilities functions between Mesh and [cardano-js-sdk](https://github.com/input-output-hk/cardano-js-sdk)

[meshjs.dev](https://meshjs.dev/)

## Scalus offline evaluator

`OfflineEvaluatorScalus` declares Scalus as a runtime dependency and loads it
inside `evaluateTx` using native dynamic import. The ESM and CommonJS package
entries can both use the ESM-only Scalus package without embedding its bundle.

The optional fifth constructor parameter selects the ledger protocol major
version. It defaults to 10 to preserve the prior version selection. Pass the
version used by the target ledger explicitly when evaluating other eras:

```ts
const evaluator = new OfflineEvaluatorScalus(
  fetcher,
  "preprod",
  undefined, // network slot configuration
  undefined, // positional V1, V2, V3 cost models
  11,
);
```

Cost models are positional: indices 0, 1 and 2 are V1, V2 and V3. They must
match the target ledger's protocol parameters. Voting and proposing redeemers
map to Mesh's VOTE and PROPOSE tags.

## Budget change on upgrade

For the existing minting test, published Mesh with Scalus 0.17.0 reports
508,703 memory and 164,980,381 steps. Scalus 1.2.0 reports 508,703 memory and
164,973,765 steps at explicit PV10. This measured version delta
is separate from the protocol-default change; preserving PV10 does not promise
identical budgets across evaluator releases. The exact internal cause of this
delta has not been established by this integration work.

Run the real evaluator test with:

```sh
npm run test:scalus --workspace @meshsdk/core-cst
```

The dedicated Jest configuration enables ESM for the Scalus dependency. Scalus
1.2 requires Node.js 20 or newer and uses Web Crypto in browser bundles.
