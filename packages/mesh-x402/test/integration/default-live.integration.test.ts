/**
 * Live Cardano preprod integration test for the `default` assetTransferMethod: builds, signs,
 * broadcasts, and settles a real transaction end to end via `@meshsdk/provider`'s
 * `BlockfrostProvider`. Requires `TEST_BLOCKFROST_PROJECT_ID` and `TEST_WALLET_MNEMONIC` in
 * `.env` (a funded preprod wallet) - see README.md. Not part of `npm test`; run explicitly via
 * `npm run test:integration`.
 */
import { BlockfrostProvider } from "@meshsdk/provider";
import { MeshWallet } from "@meshsdk/wallet";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { PaymentRequirements } from "../../src/types/payment-requirements";

const PROJECT_ID = process.env.TEST_BLOCKFROST_PROJECT_ID;
const MNEMONIC = process.env.TEST_WALLET_MNEMONIC;

const describeIfConfigured = PROJECT_ID && MNEMONIC ? describe : describe.skip;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeIfConfigured("default assetTransferMethod - live preprod", () => {
  jest.setTimeout(10 * 60 * 1000); // broadcast + confirmation can take a few minutes on preprod

  it("builds, signs, broadcasts, and settles a real 1.5 ADA self-payment", async () => {
    const provider = new BlockfrostProvider(PROJECT_ID!);
    const wallet = new MeshWallet({
      networkId: 0,
      fetcher: provider,
      submitter: provider,
      key: { type: "mnemonic", words: MNEMONIC!.split(" ") },
    });
    await wallet.init();

    const buyerAddress = await wallet.getChangeAddress();
    const utxos = await wallet.getUtxos();
    // eslint-disable-next-line no-console
    console.log(`[integration] wallet address: ${buyerAddress}, utxo count: ${utxos.length}`);
    expect(utxos.length).toBeGreaterThan(0); // fails fast with a clear message if unfunded

    const protocol = await provider.fetchProtocolParameters();
    const latestBlock = await provider.fetchLatestBlock();
    const currentSlot = Number(latestBlock.slot);

    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: "cardano:preprod",
      amount: "1500000", // 1.5 ADA - safely above min-UTxO
      asset: "lovelace",
      payTo: buyerAddress, // self-payment: proves the full pipeline without needing a second party
      maxTimeoutSeconds: 3600,
      extra: { confirmationPolicy: { l1Confirmations: 1 } },
    };

    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/integration-test" },
      { fetcher: provider, protocol, currentSlot },
    );
    const signed = await signPayment(wallet, built);
    // eslint-disable-next-line no-console
    console.log(`[integration] built payload, nonce: ${signed.payload.nonce}`);

    const verifyResult = await verifyPayment(signed, requirement, provider, protocol, currentSlot);
    expect(verifyResult).toEqual({ isValid: true });

    const store = new InMemorySettlementStore();
    let settleResult = await settlePayment(signed, requirement, provider, provider, store, protocol, currentSlot);
    // eslint-disable-next-line no-console
    console.log(`[integration] settle: ${JSON.stringify(settleResult)}`);
    expect(settleResult.transaction).toBeTruthy(); // broadcast happened, we have a real tx id

    // Poll /settle-equivalent until confirmed - Blockfrost typically indexes within ~20-60s.
    const deadline = Date.now() + 5 * 60 * 1000;
    while (!settleResult.success && Date.now() < deadline) {
      await sleep(15_000);
      const latest = await provider.fetchLatestBlock();
      settleResult = await settlePayment(
        signed,
        requirement,
        provider,
        provider,
        store,
        protocol,
        Number(latest.slot),
      );
      // eslint-disable-next-line no-console
      console.log(`[integration] settle poll: ${JSON.stringify(settleResult)}`);
    }

    expect(settleResult.success).toBe(true);
    expect(settleResult.extra.status).toBe("confirmed");
    // eslint-disable-next-line no-console
    console.log(`[integration] confirmed on preprod: https://preprod.cardanoscan.io/transaction/${settleResult.transaction}`);
  });
});
