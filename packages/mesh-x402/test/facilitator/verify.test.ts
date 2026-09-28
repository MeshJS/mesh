import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { PaymentPayload } from "../../src/types/payment-payload";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const SELLER_ADDRESS =
  "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";
const CURRENT_SLOT = 1_000_000;

/** Builds a signed, otherwise-valid default-method payload each test can mutate one field of. */
const buildValidPayload = async (): Promise<{
  payload: PaymentPayload;
  requirement: PaymentRequirements;
  fetcher: FakeFetcher;
}> => {
  const fetcher = new FakeFetcher();
  const wallet = await buildTestWallet(fetcher, new FakeSubmitter());
  const buyerAddress = await wallet.getChangeAddress();
  fetcher.addUtxo({
    input: { txHash: "3".repeat(64), outputIndex: 0 },
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
  const payload = await signPayment(wallet, built);
  return { payload, requirement, fetcher };
};

/**
 * For rule-isolation tests below: mutates both the payload's self-reported `accepted` and the
 * "trusted" requirement identically, so the `REQUIREMENTS_MISMATCH` gate (tested separately)
 * doesn't short-circuit before the rule under test runs. This models "the resource server
 * itself offered these terms" - not an attacker substituting its own.
 */
const tamperConsistently = (
  payload: PaymentPayload,
  mutate: (accepted: PaymentRequirements) => PaymentRequirements,
): { payload: PaymentPayload; requirement: PaymentRequirements } => {
  const accepted = mutate(payload.accepted);
  return { payload: { ...payload, accepted }, requirement: accepted };
};

describe("verifyPayment - core rule isolation", () => {
  it("passes on an untampered payload", async () => {
    const { payload, requirement, fetcher } = await buildValidPayload();
    const result = await verifyPayment(payload, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, CURRENT_SLOT);
    expect(result).toEqual({ isValid: true });
  });

  it("rejects a payload built against different terms than the resource server actually offered", async () => {
    // Models the real attack: a client builds its own PaymentPayload against a
    // self-invented PaymentRequirements (here, a trivial amount) instead of the one the
    // resource server actually issued in its 402 challenge, hoping every downstream check
    // (which reads `payload.accepted`) passes because they're internally consistent with
    // each other. The facilitator must reject on the mismatch against its own trusted copy,
    // before any of those checks run.
    const { payload, requirement, fetcher } = await buildValidPayload();
    const attackerPayload = { ...payload, accepted: { ...payload.accepted, amount: "1" } };
    const result = await verifyPayment(attackerPayload, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, CURRENT_SLOT);
    expect(result).toEqual({ isValid: false, invalidReason: "REQUIREMENTS_MISMATCH" });
  });

  it("rejects a network mismatch (rule 1)", async () => {
    const { payload, fetcher } = await buildValidPayload();
    const { payload: tampered, requirement: trusted } = tamperConsistently(payload, (a) => ({
      ...a,
      network: "cardano:mainnet",
    }));
    const result = await verifyPayment(tampered, trusted, fetcher, DEFAULT_PROTOCOL_PARAMETERS, CURRENT_SLOT);
    expect(result).toEqual({ isValid: false, invalidReason: "INVALID_NETWORK" });
  });

  it("rejects an amount above what the tx actually pays (rules 2-4)", async () => {
    const { payload, fetcher } = await buildValidPayload();
    const { payload: tampered, requirement: trusted } = tamperConsistently(payload, (a) => ({
      ...a,
      amount: "999000000",
    }));
    const result = await verifyPayment(tampered, trusted, fetcher, DEFAULT_PROTOCOL_PARAMETERS, CURRENT_SLOT);
    expect(result).toEqual({ isValid: false, invalidReason: "PAYTO_NOT_FOUND" });
  });

  it("rejects an already-spent nonce (rule 5)", async () => {
    const { payload, requirement, fetcher } = await buildValidPayload();
    const [txHash, index] = payload.payload.nonce.split("#");
    fetcher.spend(txHash!, Number(index));
    const result = await verifyPayment(payload, requirement, fetcher, DEFAULT_PROTOCOL_PARAMETERS, CURRENT_SLOT);
    expect(result).toEqual({ isValid: false, invalidReason: "NONCE_NOT_UNSPENT" });
  });

  it("rejects a TTL already past (rule 7)", async () => {
    const { payload, requirement, fetcher } = await buildValidPayload();
    // The tx's TTL was set relative to CURRENT_SLOT at build time; asking as-of a much later
    // slot makes it appear expired without needing to re-serialize the transaction.
    const result = await verifyPayment(
      payload,
      requirement,
      fetcher,
      DEFAULT_PROTOCOL_PARAMETERS,
      CURRENT_SLOT + 100_000,
    );
    expect(result).toEqual({ isValid: false, invalidReason: "TTL_EXPIRED" });
  });

  it("rejects a maxTimeoutSeconds narrower than the tx's actual TTL (rule 7)", async () => {
    const { payload, fetcher } = await buildValidPayload();
    const { payload: tampered, requirement: trusted } = tamperConsistently(payload, (a) => ({
      ...a,
      maxTimeoutSeconds: 1,
    }));
    const result = await verifyPayment(tampered, trusted, fetcher, DEFAULT_PROTOCOL_PARAMETERS, CURRENT_SLOT);
    expect(result).toEqual({ isValid: false, invalidReason: "TTL_EXPIRED" });
  });
});
