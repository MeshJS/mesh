import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { resolveTxHash } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { createFacilitatorApp } from "../../src/facilitator/server";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const SELLER_ADDRESS =
  "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";
const CURRENT_SLOT = 1_000_000;

describe("createFacilitatorApp", () => {
  it("GET /supported reports the configured networks and methods", async () => {
    const fetcher = new FakeFetcher();
    const app = createFacilitatorApp({
      fetcher,
      submitter: new FakeSubmitter(),
      supportedNetworks: ["cardano:preprod"],
      resolveChainState: async () => ({ protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot: CURRENT_SLOT }),
    });

    const res = await app.request("/supported");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.kinds).toHaveLength(1);
    expect(body.kinds[0].network).toBe("cardano:preprod");
    expect(body.kinds[0].scheme).toBe("exact");
  });

  it("POST /verify and POST /settle accept a built payload end to end", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const wallet = await buildTestWallet(fetcher, submitter);
    const buyerAddress = await wallet.getChangeAddress();

    fetcher.addUtxo({
      input: { txHash: "2".repeat(64), outputIndex: 0 },
      output: { address: buyerAddress, amount: [{ unit: "lovelace", quantity: "50000000" }] },
    });

    const requirement: PaymentRequirements = {
      scheme: "exact",
      network: "cardano:preprod",
      amount: "2000000",
      asset: "lovelace",
      payTo: SELLER_ADDRESS,
      maxTimeoutSeconds: 300,
      extra: { confirmationPolicy: { l1Confirmations: 1 } },
    };

    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com" },
      { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot: CURRENT_SLOT },
    );
    const signed = await signPayment(wallet, built);

    const app = createFacilitatorApp({
      fetcher,
      submitter,
      supportedNetworks: ["cardano:preprod"],
      resolveChainState: async () => ({ protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot: CURRENT_SLOT }),
    });

    const requestBody = JSON.stringify({ paymentPayload: signed, paymentRequirements: requirement });

    const verifyRes = await app.request("/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    });
    expect(await verifyRes.json()).toEqual({ isValid: true });

    const txHex = Buffer.from(signed.payload.transaction, "base64").toString("hex");
    fetcher.setConfirmed(resolveTxHash(txHex), "block-1", 1);

    const settleRes = await app.request("/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody,
    });
    const settleBody = await settleRes.json();
    expect(settleBody.success).toBe(true);
    expect(submitter.submitted).toHaveLength(1);
  });
});
