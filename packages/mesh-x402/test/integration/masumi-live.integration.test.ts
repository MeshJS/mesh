/**
 * Live Cardano preprod integration test for the `masumi` assetTransferMethod: locks a real
 * payment into the actual, canonically-deployed `vested_pay` escrow contract on preprod. The
 * same wallet plays both buyer and seller roles (the "seller" signature is just a CIP-8
 * `signData` call, not a fund transfer, so this is safe/free to do with one wallet).
 *
 * NOTE: this package only implements paying INTO the escrow, not the seller's
 * submit-result/unlock or the buyer's refund path - spending FROM the escrow is out of scope.
 * Funds this test locks are not recoverable through anything in this package; recovering them
 * would require separately implementing Masumi's submit-result/unlock or refund transactions
 * against the real contract. Uses preprod testADA only.
 *
 * Requires `TEST_BLOCKFROST_PROJECT_ID` and `TEST_WALLET_MNEMONIC` in `.env` - see README.md.
 * Not part of `npm test`; run explicitly via `npm run test:integration`.
 */
import { BlockfrostProvider } from "@meshsdk/provider";
import { MeshWallet } from "@meshsdk/wallet";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { PaymentRequirements, PaymentRequirementsExtraMasumi } from "../../src/types/payment-requirements";
import { buildMasumiRequirements } from "../fixtures/masumiFixture";

const PROJECT_ID = process.env.TEST_BLOCKFROST_PROJECT_ID;
const MNEMONIC = process.env.TEST_WALLET_MNEMONIC;
const describeIfConfigured = PROJECT_ID && MNEMONIC ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeIfConfigured("masumi assetTransferMethod - live preprod", () => {
  jest.setTimeout(10 * 60 * 1000);

  it("locks a real payment into the canonical vested_pay escrow", async () => {
    const provider = new BlockfrostProvider(PROJECT_ID!);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: MNEMONIC!.split(" ") },
    });
    await wallet.init();

    const utxos = await wallet.getUtxos();
    expect(utxos.length).toBeGreaterThan(0);

    const protocol = await provider.fetchProtocolParameters();
    const currentSlot = Number((await provider.fetchLatestBlock()).slot);

    // Same wallet as both buyer (builds/signs the tx) and seller (signs `termsDigest`) - the
    // fixture derives `terms.sellerAddress` from whatever wallet it's given.
    const requirement = await buildMasumiRequirements(wallet, { amount: "2000000" });
    // eslint-disable-next-line no-console
    console.log(`[integration] escrow address: ${requirement.payTo}`);
    console.log(
      `[integration] masumi deployment: ${JSON.stringify((requirement.extra as PaymentRequirementsExtraMasumi).deployment ?? "canonical default")}`,
    );

    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/integration-test-masumi" },
      { fetcher: provider, protocol, currentSlot },
    );
    const signed = await signPayment(wallet, built);

    const verifyResult = await verifyPayment(signed, requirement, provider, protocol, currentSlot);
    expect(verifyResult).toEqual({ isValid: true });

    const store = new InMemorySettlementStore();
    let settleResult = await settlePayment(signed, requirement, provider, provider, store, protocol, currentSlot);
    // eslint-disable-next-line no-console
    console.log(`[integration] settle: ${JSON.stringify(settleResult)}`);

    const deadline = Date.now() + 5 * 60 * 1000;
    while (!settleResult.success && Date.now() < deadline) {
      await sleep(15_000);
      const latest = await provider.fetchLatestBlock();
      settleResult = await settlePayment(signed, requirement, provider, provider, store, protocol, Number(latest.slot));
      // eslint-disable-next-line no-console
      console.log(`[integration] settle poll: ${JSON.stringify(settleResult)}`);
    }

    expect(settleResult.success).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`[integration] confirmed on preprod: https://preprod.cardanoscan.io/transaction/${settleResult.transaction}`);
  });
});
