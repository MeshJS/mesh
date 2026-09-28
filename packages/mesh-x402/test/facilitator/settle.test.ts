import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { resolveTxHash } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const SELLER_ADDRESS =
  "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";

const buildSignedDefaultPayload = async (fetcher: FakeFetcher, submitter: FakeSubmitter, currentSlot: number) => {
  const wallet = await buildTestWallet(fetcher, submitter);
  const buyerAddress = await wallet.getChangeAddress();
  fetcher.addUtxo({
    input: { txHash: "1".repeat(64), outputIndex: 0 },
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
    { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot },
  );
  const signed = await signPayment(wallet, built);
  return { signed, requirement };
};

describe("settlePayment", () => {
  it("broadcasts and reports confirmed once the confirmation policy is met", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const currentSlot = 1_000_000;
    const { signed, requirement } = await buildSignedDefaultPayload(fetcher, submitter, currentSlot);
    const store = new InMemorySettlementStore();

    const txHex = Buffer.from(signed.payload.transaction, "base64").toString("hex");
    const txHash = resolveTxHash(txHex);
    fetcher.setConfirmed(txHash, "block-1", 1);

    const result = await settlePayment(
      signed,
      requirement,
      fetcher,
      submitter,
      store,
      DEFAULT_PROTOCOL_PARAMETERS,
      currentSlot,
    );

    expect(result.success).toBe(true);
    expect(result.extra.status).toBe("confirmed");
    expect(submitter.submitted).toHaveLength(1);
  });

  it("reports settlement_pending without rebroadcasting when confirmations are below policy", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const currentSlot = 1_000_000;
    const { signed, requirement } = await buildSignedDefaultPayload(fetcher, submitter, currentSlot);
    const store = new InMemorySettlementStore();

    const txHex = Buffer.from(signed.payload.transaction, "base64").toString("hex");
    const txHash = resolveTxHash(txHex);
    fetcher.setConfirmed(txHash, "block-1", 0); // below the requirement's l1Confirmations: 1

    const settle = () =>
      settlePayment(signed, requirement, fetcher, submitter, store, DEFAULT_PROTOCOL_PARAMETERS, currentSlot);

    const first = await settle();
    expect(first.success).toBe(false);
    expect(first.errorReason).toBe("settlement_pending");
    expect(submitter.submitted).toHaveLength(1);

    // Resource server retries /settle with the identical payload - must not rebroadcast.
    const second = await settle();
    expect(second.errorReason).toBe("settlement_pending");
    expect(submitter.submitted).toHaveLength(1);

    // Once confirmations catch up, a further retry reports success without a third broadcast.
    fetcher.setConfirmed(txHash, "block-1", 1);
    const third = await settle();
    expect(third.success).toBe(true);
    expect(submitter.submitted).toHaveLength(1);
  });

  it("refuses to settle a payload that fails verification, without broadcasting", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const currentSlot = 1_000_000;
    const { signed, requirement } = await buildSignedDefaultPayload(fetcher, submitter, currentSlot);
    const store = new InMemorySettlementStore();

    const [nonceTxHash, nonceIndex] = signed.payload.nonce.split("#");
    fetcher.spend(nonceTxHash!, Number(nonceIndex));

    const result = await settlePayment(
      signed,
      requirement,
      fetcher,
      submitter,
      store,
      DEFAULT_PROTOCOL_PARAMETERS,
      currentSlot,
    );
    expect(result.success).toBe(false);
    expect(result.errorReason).toBe("NONCE_NOT_UNSPENT");
    expect(submitter.submitted).toHaveLength(0);
  });
});
