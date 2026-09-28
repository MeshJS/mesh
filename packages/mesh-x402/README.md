# mesh-x402

x402 payments (Cardano `exact` scheme) - [meshjs.dev/apis/x402](https://meshjs.dev/apis/x402)

Client and facilitator implementation of the [x402](https://github.com/x402-foundation/x402) payment protocol's
Cardano `exact` scheme, built on Mesh SDK wallet/transaction primitives. Wire-compatible with the upstream
`@x402/cardano` spec (`specs/schemes/exact/scheme_exact_cardano.md`) — same network IDs, payload shape, and
verification rules, implemented without Evolution SDK.

## Client

```ts
import { MeshWallet } from "@meshsdk/wallet";
import { fetchWithPayment } from "@meshsdk/x402";

const wallet = new MeshWallet({ networkId: 0, fetcher, submitter, key: { type: "mnemonic", words } });
await wallet.init();

const response = await fetchWithPayment("https://example.com/paid-resource", undefined, wallet);
```

## Facilitator

```ts
import { createFacilitatorApp, InMemorySettlementStore } from "@meshsdk/x402";

const app = createFacilitatorApp({
  fetcher,
  submitter,
  store: new InMemorySettlementStore(),
  supportedNetworks: ["cardano:preprod"],
  resolveChainState: async (network) => ({ protocol: await fetcher.fetchProtocolParameters(epoch), currentSlot }),
});
```

`POST /verify` and `POST /settle` both take `{ paymentPayload, paymentRequirements }` in the request body -
**not** just the client's `paymentPayload` alone. `paymentRequirements` must be the resource server's own record
of the offer it actually issued in its 402 challenge (e.g. read back from wherever it stored the `accepts[]`
entry it generated), never derived from the request itself. The facilitator rejects with
`REQUIREMENTS_MISMATCH` if `paymentPayload.accepted` doesn't exactly match it — this is what stops a client
from building a payload against terms it invented itself (a trivial amount, its own address, or, for `masumi`,
substituted admin keys) instead of what was actually offered.

## Masumi escrow lifecycle (spend side)

Beyond locking a payment into the `masumi` escrow, `src/masumi/spend/` implements every way
funds can legitimately leave it, matching `vested_pay.ak`'s full action set:

```ts
import {
  buildSubmitResultTx, buildWithdrawTx, buildAuthorizeRefundTx,       // seller actions
  buildSetRefundRequestedTx, buildAuthorizeWithdrawalTx, buildWithdrawRefundTx, // buyer actions
  buildWithdrawDisputedTx, signAdminIntent, verifyAdminSignature,     // admin-quorum settlement
} from "@meshsdk/x402";

// e.g. seller delivers, then withdraws once the buyer has authorized it (or unlock_time has passed):
const tx = await buildSubmitResultTx(escrowUtxo, currentDatum, resultHashHex, sellerWallet, deployment, {
  fetcher, evaluator, currentSlot, // `evaluator` is required here (unlike client/build.ts's ChainContext) -
});                                 // spending a script needs real ExUnits estimation, not just fee calc.
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

The Masumi `vested_pay` escrow support (`src/masumi/`) ports several files near-verbatim from
[`x402-foundation/x402`](https://github.com/x402-foundation/x402) (Apache-2.0), adapted to Mesh's
primitives in place of Evolution SDK, so the two implementations agree byte-for-byte on the
compiled validator, digests, and deadline/collateral math: `blueprintCode.ts`, `constants.ts`,
`jcs.ts`, parts of `terms.ts` (from `digests.ts`), `datum.ts`, `lock.ts`, and `escrow-address.ts`
(from `blueprint.ts`). See each file's header comment for its specific source path.

## Testing

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
