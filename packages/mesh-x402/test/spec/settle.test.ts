/** Settlement semantics: duplicate mitigation, pending retry, expiry, `-1` policy, Masumi logical replay. */
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { resolveTxHash } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { signPayment } from "../../src/client/sign";
import { settlePayment } from "../../src/facilitator/settle";
import { InMemorySettlementStore } from "../../src/facilitator/store";
import { PaymentRequirements } from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const SELLER =
  "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w";
const SLOT = 1_000_000;
const P = DEFAULT_PROTOCOL_PARAMETERS;

const setup = async (l1Confirmations: number | undefined = 1) => {
  const fetcher = new FakeFetcher();
  const submitter = new FakeSubmitter();
  const wallet = await buildTestWallet(fetcher, submitter);
  const buyer = await wallet.getChangeAddress();
  fetcher.addUtxo({
    input: { txHash: "1".repeat(64), outputIndex: 0 },
    output: {
      address: buyer,
      amount: [{ unit: "lovelace", quantity: "50000000" }],
    },
  });
  const requirement: PaymentRequirements = {
    scheme: "exact",
    network: "cardano:preprod",
    amount: "2000000",
    asset: "lovelace",
    payTo: SELLER,
    maxTimeoutSeconds: 300,
    extra:
      l1Confirmations === undefined
        ? {}
        : { confirmationPolicy: { l1Confirmations } },
  };
  const built = await buildPaymentPayload(
    requirement,
    wallet,
    { url: "https://x.test" },
    { fetcher, protocol: P, currentSlot: SLOT },
  );
  const payload = await signPayment(wallet, built);
  const txHash = resolveTxHash(
    Buffer.from(payload.payload.transaction, "base64").toString("hex"),
  );
  return {
    fetcher,
    submitter,
    payload,
    requirement,
    txHash,
    store: new InMemorySettlementStore(),
  };
};

describe("pending-settlement retry", () => {
  it("still requires the requirements the payment was made for (another route's terms are refused)", async () => {
    const s = await setup(1);
    // First call broadcasts and stays pending (tx not yet visible).
    const first = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(first.errorReason).toBe("settlement_pending");
    const dearer = { ...s.requirement, amount: "9000000" };
    const retry = await settlePayment(
      s.payload,
      dearer,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(retry.errorReason).toBe("REQUIREMENTS_MISMATCH");
    expect(s.submitter.submitted).toHaveLength(1);
  });
});

describe("duplicate settlement mitigation", () => {
  it("claims atomically: two concurrent /settle calls broadcast once, the loser gets duplicate_settlement", async () => {
    const s = await setup();
    s.fetcher.setConfirmed(s.txHash, "b1", 1);
    const run = () =>
      settlePayment(
        s.payload,
        s.requirement,
        s.fetcher,
        s.submitter,
        s.store,
        P,
        SLOT,
      );
    const [a, b] = await Promise.all([run(), run()]);
    expect(s.submitter.submitted).toHaveLength(1);
    const outcomes = [a, b].map((r) => (r.success ? "success" : r.errorReason));
    expect(outcomes.sort()).toEqual(["duplicate_settlement", "success"]);
  });

  it("a call after success is a duplicate_settlement (protected operation must not run twice)", async () => {
    const s = await setup();
    s.fetcher.setConfirmed(s.txHash, "b1", 1);
    const run = () =>
      settlePayment(
        s.payload,
        s.requirement,
        s.fetcher,
        s.submitter,
        s.store,
        P,
        SLOT,
      );
    expect((await run()).success).toBe(true);
    expect((await run()).errorReason).toBe("duplicate_settlement");
    expect(s.submitter.submitted).toHaveLength(1);
  });

  it("keys the claim by the canonical tx id, not the signed CBOR bytes", async () => {
    const s = await setup();
    s.fetcher.setConfirmed(s.txHash, "b1", 1);
    await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(await s.store.has(s.txHash)).toBe(true);
  });

  it("releases the claim after a definitive ledger rejection so a legitimate retry can re-attempt", async () => {
    const s = await setup();
    s.submitter.submitTx = async () => {
      throw new Error("BadInputsUTxO: transaction rejected");
    };
    const first = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(first.errorReason).toMatch(/^submission_rejected/);
    expect(await s.store.has(s.txHash)).toBe(false);
  });

  it("retains the claim after a transport failure (unknown result) and reports pending", async () => {
    const s = await setup();
    s.submitter.submitTx = async () => {
      throw new Error("ETIMEDOUT");
    };
    const first = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(first.errorReason).toBe("settlement_pending");
    expect(await s.store.has(s.txHash)).toBe(true);
  });
});

describe("confirmation policy", () => {
  it("-1 succeeds on the facilitator's own broadcast acceptance, reporting mempool evidence", async () => {
    const s = await setup(-1);
    // Refused by default (the facilitator advertises minimum 0)...
    const refused = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(refused.errorReason).toBe("INVALID_CONFIRMATION_POLICY");
    expect(s.submitter.submitted).toHaveLength(0);
    // ...and settled on broadcast acceptance once the operator opts in.
    const r = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
      {
        l1Confirmations: { minimum: -1, maximum: 20 },
      },
    );
    expect(r).toMatchObject({
      success: true,
      extra: { status: "mempool", confirmations: -1 },
    });
  });

  it("0 needs canonical inclusion", async () => {
    const s = await setup(0);
    const pending = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(pending.errorReason).toBe("settlement_pending");
    s.fetcher.setConfirmed(s.txHash, "b1", 0);
    const done = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(done).toMatchObject({
      success: true,
      extra: { status: "confirmed", confirmations: 0 },
    });
  });

  it("an absent policy defaults to 1 confirmation (no crash)", async () => {
    const s = await setup(undefined);
    s.fetcher.setConfirmed(s.txHash, "b1", 0);
    expect(
      (
        await settlePayment(
          s.payload,
          s.requirement,
          s.fetcher,
          s.submitter,
          s.store,
          P,
          SLOT,
        )
      ).errorReason,
    ).toBe("settlement_pending");
  });

  it("reports pending with confirmations -1 before inclusion, and the real count once included", async () => {
    const s = await setup(3);
    const before = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(before).toMatchObject({
      errorReason: "settlement_pending",
      transaction: s.txHash,
      extra: { status: "pending", confirmations: -1, transactionId: s.txHash },
    });
    s.fetcher.setConfirmed(s.txHash, "b1", 2);
    const after = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    );
    expect(after.extra.confirmations).toBe(2);
    expect(s.submitter.submitted).toHaveLength(1);
  });
});

describe("validity window closed", () => {
  it("reports a terminal EXPIRED (not settlement_pending) once the TTL passed without the ledger recording the tx", async () => {
    const s = await setup();
    await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT,
    ); // broadcast, still pending
    const late = await settlePayment(
      s.payload,
      s.requirement,
      s.fetcher,
      s.submitter,
      s.store,
      P,
      SLOT + 10_000,
    );
    expect(late.errorReason).toBe("EXPIRED");
    expect(s.submitter.submitted).toHaveLength(1);
  });
});
