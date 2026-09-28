/**
 * Live Cardano preprod integration test for the `script` assetTransferMethod: locks a real
 * payment into an actual (always-succeeds) Plutus V3 script address on preprod. Requires
 * `TEST_BLOCKFROST_PROJECT_ID` and `TEST_WALLET_MNEMONIC` in `.env` - see README.md. Not part
 * of `npm test`; run explicitly via `npm run test:integration`.
 */
import { mConStr0 } from "@meshsdk/common";
import { applyEncoding, fromBuilderToPlutusData } from "@meshsdk/core-cst";
import { BlockfrostProvider } from "@meshsdk/provider";
import { MeshWallet } from "@meshsdk/wallet";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { resolveScriptAddress } from "../../src/script";
import { PaymentRequirements } from "../../src/types/payment-requirements";

const PROJECT_ID = process.env.TEST_BLOCKFROST_PROJECT_ID;
const MNEMONIC = process.env.TEST_WALLET_MNEMONIC;
const describeIfConfigured = PROJECT_ID && MNEMONIC ? describe : describe.skip;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Same minimal always-succeeds Plutus V3 validator used in test/client/script-flow.test.ts.
const ALWAYS_SUCCEED_RAW_HEX =
  "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01";
const alwaysSucceedCbor = Buffer.from(
  applyEncoding(Buffer.from(ALWAYS_SUCCEED_RAW_HEX, "hex"), "SingleCBOR"),
).toString("hex");

describeIfConfigured("script assetTransferMethod - live preprod", () => {
  jest.setTimeout(10 * 60 * 1000);

  it("locks a real payment into an always-succeeds script address", async () => {
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

    const extra = {
      assetTransferMethod: "script" as const,
      confirmationPolicy: { l1Confirmations: 1 },
      script: { type: "plutusV3" as const, code: alwaysSucceedCbor },
      datum: fromBuilderToPlutusData({ type: "Mesh", content: mConStr0([]) }).toCbor().toString(),
    };
    const scriptAddress = resolveScriptAddress(extra, "cardano:preprod");
    // eslint-disable-next-line no-console
    console.log(`[integration] script address: ${scriptAddress}`);

    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: "cardano:preprod",
      amount: "1500000",
      asset: "lovelace",
      payTo: scriptAddress,
      maxTimeoutSeconds: 3600,
      extra,
    };

    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/integration-test-script" },
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
