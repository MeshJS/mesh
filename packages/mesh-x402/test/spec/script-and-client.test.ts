/** `script` method (params, optional datum, V1 caveat) and client-side protocol (PAYMENT-REQUIRED header). */
import { DEFAULT_PROTOCOL_PARAMETERS } from "@meshsdk/common";
import { applyEncoding } from "@meshsdk/core-cst";

import { buildPaymentPayload } from "../../src/client/build";
import { fetchWithPayment } from "../../src/client/fetch";
import { signPayment } from "../../src/client/sign";
import { verifyPayment } from "../../src/facilitator/verify";
import { resolveScriptAddress, resolveScriptHash } from "../../src/script";
import {
  PaymentRequirements,
  PaymentRequirementsExtraScript,
} from "../../src/types/payment-requirements";
import { FakeFetcher, FakeSubmitter } from "../fixtures/fakes";
import { buildTestWallet } from "../fixtures/testWallet";

const P = DEFAULT_PROTOCOL_PARAMETERS;
const SLOT = 1_000_000;
const CODE = Buffer.from(
  applyEncoding(
    Buffer.from(
      "58340101002332259800a518a4d153300249011856616c696461746f722072657475726e65642066616c736500136564004ae715cd01",
      "hex",
    ),
    "SingleCBOR",
  ),
).toString("hex");

const scriptReq = (
  extra: Partial<PaymentRequirementsExtraScript>,
): PaymentRequirements => {
  const full = {
    assetTransferMethod: "script" as const,
    confirmationPolicy: { l1Confirmations: 1 },
    ...extra,
  } as PaymentRequirementsExtraScript;
  return {
    scheme: "exact",
    network: "cardano:preprod",
    amount: "2000000",
    asset: "lovelace",
    payTo: resolveScriptAddress(full, "cardano:preprod"),
    maxTimeoutSeconds: 300,
    extra: full,
  };
};

const walletWithFunds = async () => {
  const fetcher = new FakeFetcher();
  const wallet = await buildTestWallet(fetcher, new FakeSubmitter());
  fetcher.addUtxo({
    input: { txHash: "f".repeat(64), outputIndex: 0 },
    output: {
      address: await wallet.getChangeAddress(),
      amount: [{ unit: "lovelace", quantity: "50000000" }],
    },
  });
  return { fetcher, wallet };
};

describe("script method", () => {
  it("applies typed parameters: bytes/string/bigint/boolean each change the derived hash, bytes != string", () => {
    const base = { script: { type: "plutusV3" as const, code: CODE } };
    const h = (parameters: PaymentRequirementsExtraScript["parameters"]) =>
      resolveScriptHash({
        assetTransferMethod: "script",
        ...base,
        parameters,
      } as PaymentRequirementsExtraScript);
    const bytes = h({ p: { type: "bytes", value: "48656c6c6f" } });
    const str = h({ p: { type: "string", value: "Hello" } });
    const num = h({ p: { type: "bigint", value: 42 } });
    const bool = h({ p: { type: "boolean", value: true } });
    expect(bytes).toBe(str); // "Hello" utf-8 == 48656c6c6f
    expect(new Set([bytes, num, bool, h(undefined)]).size).toBe(4);
    expect(() => h({ p: { type: "bytes", value: "Hello World" } })).toThrow(
      /hex/,
    );
  });

  it("rejects a scriptHash that disagrees with the declared script", () => {
    expect(() =>
      resolveScriptHash({
        assetTransferMethod: "script",
        script: { type: "plutusV3", code: CODE },
        scriptHash: "00".repeat(28),
      } as PaymentRequirementsExtraScript),
    ).toThrow(/does not match/);
  });

  it("datum is optional: a datum-less script payment builds and verifies", async () => {
    const { fetcher, wallet } = await walletWithFunds();
    const req = scriptReq({ script: { type: "plutusV3", code: CODE } });
    const built = await buildPaymentPayload(
      req,
      wallet,
      { url: "u" },
      { fetcher, protocol: P, currentSlot: SLOT },
    );
    expect(
      await verifyPayment(
        await signPayment(wallet, built),
        req,
        fetcher,
        P,
        SLOT,
      ),
    ).toEqual({ isValid: true });
  });

  describe("declared datum must be the one attached to the payTo output", () => {
    const build = async (builtWith: Record<string, unknown>) => {
      const { fetcher, wallet } = await walletWithFunds();
      const built = await buildPaymentPayload(
        scriptReq({ script: { type: "plutusV3", code: CODE }, ...builtWith }),
        wallet,
        { url: "u" },
        { fetcher, protocol: P, currentSlot: SLOT },
      );
      return { fetcher, signed: await signPayment(wallet, built) };
    };
    const verifyAgainst = async (
      signed: Awaited<ReturnType<typeof build>>["signed"],
      fetcher: Awaited<ReturnType<typeof build>>["fetcher"],
      declared: Record<string, unknown>,
    ) => {
      const req = scriptReq({
        script: { type: "plutusV3", code: CODE },
        ...declared,
      });
      return verifyPayment({ ...signed, accepted: req }, req, fetcher, P, SLOT);
    };

    it("accepts the declared datum, including an equivalent encoding of it", async () => {
      const { fetcher, signed } = await build({ datum: "d8799fff" }); // Constr 0 [] (indefinite list)
      expect(
        await verifyAgainst(signed, fetcher, { datum: "d8799fff" }),
      ).toEqual({ isValid: true });
      expect(await verifyAgainst(signed, fetcher, { datum: "d87980" })).toEqual(
        { isValid: true },
      ); // same data, definite list
    });

    it("rejects a payment that left out the declared datum", async () => {
      const { fetcher, signed } = await build({});
      expect(
        await verifyAgainst(signed, fetcher, { datum: "d8799fff" }),
      ).toEqual({
        isValid: false,
        invalidReason: "SCRIPT_DATUM_NOT_INLINE",
      });
    });

    it("rejects a payment that attached a different datum", async () => {
      const { fetcher, signed } = await build({ datum: "d8799f01ff" }); // Constr 0 [1]
      expect(
        await verifyAgainst(signed, fetcher, { datum: "d8799fff" }),
      ).toEqual({
        isValid: false,
        invalidReason: "SCRIPT_DATUM_MISMATCH",
      });
    });
  });

  it("rejects a Plutus V1 script combined with an inline datum (funds would strand)", async () => {
    const { fetcher, wallet } = await walletWithFunds();
    const req = scriptReq({
      script: { type: "plutusV1", code: CODE },
      datum: "d8799fff",
    });
    await expect(
      buildPaymentPayload(
        req,
        wallet,
        { url: "u" },
        { fetcher, protocol: P, currentSlot: SLOT },
      ),
    ).rejects.toMatchObject({ code: "SCRIPT_V1_WITH_DATUM" });
  });
});

describe("fetchWithPayment - PAYMENT-REQUIRED header", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reads the base64 PaymentRequired object from the PAYMENT-REQUIRED response header and retries with PAYMENT-SIGNATURE", async () => {
    const { fetcher, wallet } = await walletWithFunds();
    const accepts: PaymentRequirements[] = [
      {
        scheme: "exact",
        network: "cip34:0-1", // CIP-34 alias is accepted and normalized
        amount: "2000000",
        asset: "lovelace",
        payTo:
          "addr_test1qpu5vlrf4xkxv2qpwngf6cjhtw542ayty80v8dyr49rf5ewvxwdrt70qlcpeeagscasafhffqsxy36t90ldv06wqrk2qum8x5w",
        maxTimeoutSeconds: 300,
        extra: {},
      } as never,
    ];
    const required = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        error: "PAYMENT-SIGNATURE header is required",
        accepts,
      }),
    ).toString("base64");

    const calls: Request[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push(new Request(String(input), { headers }));
      return headers.has("PAYMENT-SIGNATURE")
        ? new Response("ok", { status: 200 })
        : new Response("", {
            status: 402,
            headers: { "PAYMENT-REQUIRED": required },
          });
    }) as typeof fetch;

    const { response } = await fetchWithPayment(
      "https://api.test/x",
      undefined,
      wallet,
      { fetcher, protocol: P, currentSlot: SLOT },
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    const sent = JSON.parse(
      Buffer.from(
        calls[1]!.headers.get("PAYMENT-SIGNATURE")!,
        "base64",
      ).toString(),
    );
    expect(sent.x402Version).toBe(2);
    expect(sent.accepted.network).toBe("cardano:preprod");
    expect(sent.payload.nonce).toMatch(/^[0-9a-f]{64}#\d+$/);
  });
});
