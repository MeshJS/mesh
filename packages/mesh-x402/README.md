# mesh-x402

x402 payments (Cardano `exact` scheme) - [meshjs.dev/apis/x402](https://meshjs.dev/apis/x402)

Client, resource-server and facilitator implementation of the [x402](https://github.com/x402-foundation/x402)
payment protocol's Cardano `exact` scheme, built on Mesh primitives (`MeshWallet`, `MeshTxBuilder`, `@meshsdk/core-cst`).
It follows the [scheme specification](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_cardano.md):
same network IDs, payload shape and verification rules.

## Client

```ts
import { MeshWallet } from "@meshsdk/wallet";
import { fetchWithPayment } from "@meshsdk/x402";

const wallet = new MeshWallet({
  networkId: 0,
  fetcher,
  submitter,
  key: { type: "mnemonic", words },
});
await wallet.init();

const { response, paymentResponse } = await fetchWithPayment(
  "https://example.com/paid-resource",
  undefined,
  wallet,
  { fetcher, protocol, currentSlot },
);
```

The 402 challenge is read from the base64 `PAYMENT-REQUIRED` response header (a JSON body is accepted as a
fallback); the paid retry carries `PAYMENT-SIGNATURE`, and the decoded `PAYMENT-RESPONSE` is returned.

Before signing a `masumi` lock the client verifies the whole requirements object (closed-object schema, commitment
digests, seller COSE signature over `termsDigest`, derived escrow address, `blockchainIdentifier`). A **non-default**
Masumi deployment is refused unless the application opts in via `chain.allowMasumiDeployment` - the seller's signature
alone is not approval. Show the user `masumiAdminWeights(deployment)` (effective weight per distinct admin key), never
the raw `adminVkeys.length`.

## Facilitator

```ts
import { createFacilitatorApp, InMemorySettlementStore } from "@meshsdk/x402";

const app = createFacilitatorApp({
  fetcher,
  submitter,
  store: new InMemorySettlementStore(),
  supportedNetworks: ["cardano:preprod"],
  resolveChainState: async (network) => ({
    protocol: await fetcher.fetchProtocolParameters(epoch),
    currentSlot,
  }),
  // optional: range of confirmationPolicy.l1Confirmations this facilitator settles (default 0..20;
  // -1 = settle on its own mempool acceptance is opt-in) and approval of non-default Masumi deployments
  l1Confirmations: { minimum: 0, maximum: 20 },
  allowMasumiDeployment: (deployment, { weights }) => false,
});
```

Settlement semantics (spec "Pending settlement" / "Duplicate Settlement Mitigation"): the canonical transaction id is
claimed atomically before broadcast; a concurrent or already-settled call gets `duplicate_settlement`; below the
confirmation threshold `/settle` returns `settlement_pending` and a retry with the same payload resumes observing
without rebroadcasting; a tx whose TTL passed unrecorded is a terminal `EXPIRED`. For a Masumi payment the
`termsDigest` is also bound to the first transaction that claims it. A multi-instance facilitator must implement
`SettlementStore` (`claim` must be an atomic insert-if-absent) on shared storage.

`POST /verify` and `POST /settle` both take `{ paymentPayload, paymentRequirements }` in the request body -
**not** just the client's `paymentPayload` alone. `paymentRequirements` must be the resource server's own record
of the offer it actually issued in its 402 challenge (e.g. read back from wherever it stored the `accepts[]`
entry it generated), never derived from the request itself. The facilitator rejects with
`REQUIREMENTS_MISMATCH` if `paymentPayload.accepted` doesn't exactly match it — this is what stops a client
from building a payload against terms it invented itself (a trivial amount, its own address, or, for `masumi`,
substituted admin keys) instead of what was actually offered.

## Resource server

`buildDefaultOffer`, `buildScriptOffer` and `buildMasumiOffer` build the `PaymentRequirements` for a 402 (the Masumi
builder seller-signs the terms, keeps `pay_by_time` within `maxTimeoutSeconds`, and refuses to emit an offer the client
would reject). `createPaywall` turns them into a `(Request) => Response` handler: 402 with `PAYMENT-REQUIRED`, then
verify and settle through a `createFacilitatorClient`, then the content with `PAYMENT-RESPONSE`. It remembers issued
offers in a bounded in-memory `OfferBook` and passes the facilitator the server's own offer and resource, never the
client's copy; use `PaywallConfig.trusted` with durable storage in production.

## Masumi registry claims

A non-empty `terms.agentIdentifier` claims a registered Masumi V2 agent. The policy prefix alone proves nothing (anyone
can copy a registered id into terms they sign themselves), so the claim is **refused** unless the application supplies
a `validateRegistryClaim` validator that independently confirms the registry asset, seller authorization, metadata,
endpoint, network and exact price:

```ts
const validateRegistryClaim: MasumiRegistryValidator = async ({
  agentIdentifier,
  sellerAddress,
  network,
  amount,
  asset,
  resource,
}) =>
  myRegistryLookup(agentIdentifier, {
    sellerAddress,
    network,
    amount,
    asset,
    endpoint: resource.url,
  }); // true only if authentic

createFacilitatorApp({ /* ... */ validateRegistryClaim }); // facilitator
fetchWithPayment(url, init, wallet, {
  fetcher,
  protocol,
  currentSlot,
  validateRegistryClaim,
}); // client
```

A validator that returns anything but `true`, or throws, refuses the payment (`MASUMI_INVALID_AGENT_IDENTIFIER`).
Unregistered sellers (omitted, `null` or empty `agentIdentifier`) need no validator.

## Masumi escrow lifecycle (spend side)

Beyond locking a payment into the `masumi` escrow, `src/masumi/spend/` implements every way
funds can legitimately leave it, matching `vested_pay.ak`'s full action set:

```ts
import {
  buildAuthorizeRefundTx, // seller actions
  buildAuthorizeWithdrawalTx, // buyer actions
  buildSetRefundRequestedTx,
  buildSubmitResultTx,
  buildWithdrawDisputedTx,
  buildWithdrawRefundTx,
  buildWithdrawTx,
  signAdminIntent,
  verifyAdminSignature, // admin-quorum settlement
} from "@meshsdk/x402";

// e.g. seller delivers, then withdraws once the buyer has authorized it (or unlock_time has passed):
const tx = await buildSubmitResultTx(
  escrowUtxo,
  currentDatum,
  resultHashHex,
  sellerWallet,
  deployment,
  {
    fetcher,
    evaluator,
    currentSlot, // `evaluator` is required here (unlike client/build.ts's ChainContext) -
  },
); // spending a script needs real ExUnits estimation, not just fee calc.
```

Each builder takes the escrow's current `UTxO` + its parsed datum (`parseMasumiLockDatum`), the relevant
wallet, the `MasumiDeployment` the escrow was locked under, and a `SpendContext`. `buildWithdrawDisputedTx`
is the odd one out: it has no buyer/seller signer at all, gated instead by an M-of-N CIP-8 admin-signature
quorum (`adminVkeys`/`requiredAdmins` on the deployment) — collect each admin's signature separately via
`signAdminIntent`, verify with `verifyAdminSignature`, then pass the collected set in.

Live-validated end to end against the real deployed `vested_pay` contract on preprod (not just unit-tested):
lock → SubmitResult → SetRefundRequested → AuthorizeWithdrawal → Withdraw; lock → AuthorizeRefund →
WithdrawRefund; and `WithdrawDisputed` against a custom 1-of-1 test deployment. See
`test/integration/masumi-*-live.integration.test.ts`.

## Attribution

The Masumi `vested_pay` escrow support (`src/masumi/`) is derived from the constants, digests and test vectors in
[`x402-foundation/x402`](https://github.com/x402-foundation/x402) (Apache-2.0), expressed with Mesh primitives, so
the compiled validator, digests and deadline/collateral math agree byte for byte: `blueprintCode.ts`, `constants.ts`,
`jcs.ts`, parts of `terms.ts` (from `digests.ts`), `datum.ts`, `lock.ts`, and `escrow-address.ts`
(from `blueprint.ts`). See each file's header comment for its specific source path.

## Testing

See [TESTING.md](./TESTING.md) for the spec-conformance test guide (automated + manual).

`npm test` runs the full unit test suite (client/facilitator/masumi end-to-end flows for all three
`assetTransferMethod`s, facilitator rule isolation, settlement idempotency, COSE signature binding, byte-exact
CIP-8 vectors) against an in-memory fetcher/wallet — no live network, no credentials required. This is the
project's primary correctness gate and is expected to stay green with no live-chain dependency.

`npm run test:integration` runs live Cardano preprod tests — real transactions against the real deployed
`vested_pay` contract, not mocks — covering the payment lock for all three methods plus the full masumi spend
lifecycle described above. It needs a `.env` with a preprod Blockfrost project ID and a funded preprod wallet
mnemonic, neither of which this repo provides or should ever have committed to it (`.env` is gitignored). Not
part of the default `npm test`/CI loop, since it costs real (test) ADA and takes tens of minutes end to end —
run it deliberately, not on every change.

[meshjs.dev](https://meshjs.dev/)
