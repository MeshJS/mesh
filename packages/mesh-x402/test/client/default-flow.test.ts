import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { deserializeTx } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const SELLER_ADDRESS =
  "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";

describe("default assetTransferMethod - end to end (build -> sign -> verify)", () => {
  it("builds a valid, verifiable ADA payment", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const wallet = await buildTestWallet(fetcher, submitter);
    const buyerAddress = await wallet.getChangeAddress();

    fetcher.addUtxo({
      input: { txHash: "a".repeat(64), outputIndex: 0 },
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

    const currentSlot = 1_000_000;
    const built = await buildPaymentPayload(
      requirement,
      wallet,
      { url: "https://example.com/resource" },
      { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot },
    );

    expect(built.payload.nonce).toBe(`${"a".repeat(64)}#0`);

    const signed = await signPayment(wallet, built);
    // The spec requires base64; a plain re-parse as hex would fail, proving the conversion happened.
    expect(() => Buffer.from(signed.payload.transaction, "base64")).not.toThrow();

    const signedTxHex = Buffer.from(signed.payload.transaction, "base64").toString("hex");
    const tx = deserializeTx(signedTxHex);
    const payToOutput = tx
      .body()
      .outputs()
      .find((o) => o.address().toBech32().toString() === SELLER_ADDRESS);
    expect(payToOutput?.amount().coin()).toBe(2_000_000n);

    // The nonce input must still be "unspent" in the fetcher for verification to accept it.
    const result = await verifyPayment(signed, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, currentSlot);
    expect(result).toEqual({ isValid: true });
  });

  it("rejects a payload whose nonce input has already been spent", async () => {
    const fetcher = new FakeFetcher();
    const submitter = new FakeSubmitter();
    const wallet = await buildTestWallet(fetcher, submitter);
    const buyerAddress = await wallet.getChangeAddress();

    fetcher.addUtxo({
      input: { txHash: "b".repeat(64), outputIndex: 0 },
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

    const chain = { fetcher, protocol: DEFAULT_PROTOCOL_PARAMETERS, currentSlot: 1_000_000 };
    const built = await buildPaymentPayload(requirement, wallet, { url: "https://example.com" }, chain);
    const signed = await signPayment(wallet, built);

    const [nonceTxHash, nonceIndex] = signed.payload.nonce.split("#");
    fetcher.spend(nonceTxHash!, Number(nonceIndex));

    const result = await verifyPayment(signed, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, chain.currentSlot);
    expect(result).toEqual({ isValid: false, invalidReason: "NONCE_NOT_UNSPENT" });
  });
});
