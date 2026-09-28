import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet, TEST_SELLER_MNEMONIC } from "../fixtures/testWallet";
import { buildMasumiRequirements } from "../fixtures/masumiFixture";

describe("masumi assetTransferMethod - end to end (build -> sign -> verify)", () => {
  it("builds a valid, verifiable escrow lock", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const buyerWallet = await buildTestWallet(fetcher, submitter);
    const sellerWallet = await buildTestWallet(new FakeFetcher(), new FakeSubmitter(), TEST_SELLER_MNEMONIC);

    const buyerAddress = await buyerWallet.getChangeAddress();
    fetcher.addUtxo({
      input: { txHash: "c".repeat(64), outputIndex: 0 },
      output: { address: buyerAddress, amount: [{ unit: "lovelace", quantity: "50000000" }] },
    });

    const requirement = await buildMasumiRequirements(sellerWallet);
    const currentSlot = 1_000_000;
    const chain = { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot };

    const built = await buildPaymentPayload(requirement, buyerWallet, { url: "https://example.com/resource" }, chain);
    const signed = await signPayment(buyerWallet, built);

    const result = await verifyPayment(signed, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, currentSlot);
    expect(result).toEqual({ isValid: true });
  });

  it("builds a valid native-asset escrow lock, exercising the collateral fixed-point loop", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const buyerWallet = await buildTestWallet(fetcher, submitter);
    const sellerWallet = await buildTestWallet(new FakeFetcher(), new FakeSubmitter(), TEST_SELLER_MNEMONIC);

    const buyerAddress = await buyerWallet.getChangeAddress();
    fetcher.addUtxo({
      input: { txHash: "d".repeat(64), outputIndex: 0 },
      output: { address: buyerAddress, amount: [{ unit: "lovelace", quantity: "50000000" }] },
    });

    // A native-asset payment forces a nonzero collateral, exercising the collateral fixed-point loop.
    const requirement = await buildMasumiRequirements(sellerWallet, {
      amount: "10",
      asset: `${"11".repeat(28)}.${Buffer.from("token").toString("hex")}`,
    });

    fetcher.addUtxo({
      input: { txHash: "e".repeat(64), outputIndex: 0 },
      output: {
        address: buyerAddress,
        amount: [
          { unit: "lovelace", quantity: "5000000" },
          { unit: `${"11".repeat(28)}${Buffer.from("token").toString("hex")}`, quantity: "1000" },
        ],
      },
    });

    const currentSlot = 1_000_000;
    const chain = { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot };
    const built = await buildPaymentPayload(requirement, buyerWallet, { url: "https://example.com/resource" }, chain);
    const signed = await signPayment(buyerWallet, built);

    const result = await verifyPayment(signed, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, currentSlot);
    expect(result).toEqual({ isValid: true });
  });
});
