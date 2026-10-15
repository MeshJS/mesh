import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";

import type { FacilitatorClient } from "../../src/facilitator/client";
import { chainStateFrom } from "../../src/chain-state";
import { PAYMENT_REQUIRED_HEADER } from "../../src/client/fetch";
import { createFacilitatorClient } from "../../src/facilitator/client";
import {
  explainVerification,
  verificationRules,
} from "../../src/facilitator/explain";
import { buildDefaultOffer } from "../../src/server/offers";
import { createPaywall, OfferBook } from "../../src/server/paywall";
import {
  encodePaymentSignatureHeader,
  PAYMENT_SIGNATURE_HEADER,
} from "../../src/types/payment-payload";
import { decodePaymentResponseHeader } from "../../src/types/payment-response";

const offer = () =>
  buildDefaultOffer({
    network: "cardano:preprod",
    amount: "2000000",
    payTo: "addr_test1x",
  });

const stubFacilitator = (
  over: Partial<FacilitatorClient> = {},
): FacilitatorClient => ({
  verify: async () => ({ isValid: true }),
  settle: async () => ({
    success: true,
    network: "cardano:preprod",
    transaction: "ab",
    extra: { status: "confirmed", confirmations: 1 },
  }),
  supported: async () => ({}),
  settleUntilFinal: async function (b) {
    return this.settle(b);
  },
  ...over,
});

const make = (facilitator: FacilitatorClient) =>
  createPaywall({
    network: "cardano:preprod",
    facilitator,
    issue: offer,
    serve: () => Response.json({ ok: true }),
  });

const paidRequest = async (
  pay: (r: Request) => Promise<Response>,
  accepted = offer(),
) =>
  pay(
    new Request("http://x/r", {
      headers: {
        [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignatureHeader({
          x402Version: 2,
          resource: { url: "http://x/r" },
          accepted,
          payload: { transaction: "AA==", nonce: "a#0" },
        }),
      },
    }),
  );

describe("paywall", () => {
  it("issues a 402 with the PAYMENT-REQUIRED header", async () => {
    const res = await make(stubFacilitator())(new Request("http://x/r"));
    expect(res.status).toBe(402);
    expect(res.headers.get(PAYMENT_REQUIRED_HEADER)).toBeTruthy();
  });

  it("serves content with PAYMENT-RESPONSE after verify + settle", async () => {
    const pay = make(stubFacilitator());
    await pay(new Request("http://x/r")); // records the offer
    const res = await paidRequest(pay);
    expect(res.status).toBe(200);
    expect(
      decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!).success,
    ).toBe(true);
  });

  it("refuses an offer it never issued, and a failed verify", async () => {
    const pay = make(
      stubFacilitator({
        verify: async () => ({
          isValid: false,
          invalidReason: "NONCE_NOT_UNSPENT",
        }),
      }),
    );
    expect((await paidRequest(pay)).status).toBe(402); // unknown offer
    await pay(new Request("http://x/r"));
    const res = await paidRequest(pay);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "NONCE_NOT_UNSPENT" });
  });
});

describe("paywall hardening", () => {
  it("hands the facilitator the server's own resource, not the client-supplied one", async () => {
    let seen: unknown;
    const pay = make(
      stubFacilitator({
        verify: async (b) => {
          seen = b.paymentPayload.resource;
          return { isValid: true };
        },
      }),
    );
    await pay(new Request("http://x/r"));
    await paidRequest(pay); // payload claims resource http://x/r; make a request for another URL
    const forged = await pay(
      new Request("http://x/real", {
        headers: {
          [PAYMENT_SIGNATURE_HEADER]: encodePaymentSignatureHeader({
            x402Version: 2,
            resource: { url: "http://evil/covered" },
            accepted: offer(),
            payload: { transaction: "AA==", nonce: "a#0" },
          }),
        },
      }),
    );
    expect(forged.status).toBe(200);
    expect(seen).toEqual({ url: "http://x/real" });
  });

  it("turns a facilitator failure into a clean 402", async () => {
    const pay = make(
      stubFacilitator({
        verify: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
    );
    await pay(new Request("http://x/r"));
    const res = await paidRequest(pay);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "FACILITATOR_UNAVAILABLE" });
  });

  it("bounds the offer book, evicting the oldest", () => {
    const book = new OfferBook(2);
    const mk = (amount: string) =>
      buildDefaultOffer({
        network: "cardano:preprod",
        amount,
        payTo: "addr_test1x",
      });
    [mk("1"), mk("2"), mk("3")].forEach((o) => book.record(o));
    expect(book.get(mk("1"))).toBeUndefined();
    expect(book.get(mk("2"))).toBeDefined();
    expect(book.get(mk("3"))).toBeDefined();
  });
});

describe("facilitator client", () => {
  it("retries /settle while pending", async () => {
    let calls = 0;
    const fakeFetch = (async () =>
      Response.json(
        ++calls < 3
          ? { success: false, errorReason: "settlement_pending" }
          : { success: true },
      )) as typeof fetch;
    const client = createFacilitatorClient("http://f/", { fetch: fakeFetch });
    const out = await client.settleUntilFinal({} as never, { pollMs: 1 });
    expect(out.success).toBe(true);
    expect(calls).toBe(3);
  });
});

describe("explainVerification / chainStateFrom", () => {
  it("marks rules before the failing one as passed, after as skipped", () => {
    const out = explainVerification("default", {
      isValid: false,
      invalidReason: "NONCE_NOT_UNSPENT",
    });
    expect(out.map((r) => r.status)).toEqual([
      "pass",
      "pass",
      "pass",
      "pass",
      "pass",
      "fail",
      "skipped",
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(
      explainVerification("masumi", { isValid: true }).every(
        (r) => r.status === "pass",
      ),
    ).toBe(true);
    expect(verificationRules("script").length).toBe(11);
  });

  it("reads protocol + slot", async () => {
    const state = await chainStateFrom({
      fetchProtocolParameters: async () => DEFAULT_PROTOCOL_PARAMETERS,
      fetchLatestBlock: async () => ({ slot: "123" }),
    })();
    expect(state.currentSlot).toBe(123);
  });
});
