import { PaymentPayload } from "../types/payment-payload";
import { PaymentRequirements } from "../types/payment-requirements";
import { PaymentResponse } from "../types/payment-response";
import { VerifyResult } from "./verify";

/** Body of `POST /verify` and `POST /settle`. `paymentRequirements` must be the resource server's own record of the offer. */
export type FacilitatorRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type FacilitatorClientOptions = {
  fetch?: typeof fetch;
  /** Extra headers on every call (e.g. auth, tracing). */
  headers?: Record<string, string>;
  onRequest?: (path: "/verify" | "/settle", body: FacilitatorRequest) => void;
  onResponse?: (
    path: "/verify" | "/settle",
    result: VerifyResult | PaymentResponse,
    status: number,
  ) => void;
};

export type SettleUntilFinalOptions = {
  pollMs?: number;
  timeoutMs?: number;
};

export type FacilitatorClient = {
  verify(body: FacilitatorRequest): Promise<VerifyResult>;
  settle(body: FacilitatorRequest): Promise<PaymentResponse>;
  supported(): Promise<unknown>;
  /** Calls `/settle`, retrying while the result is `settlement_pending` (the spec's retry flow). Returns the last result. */
  settleUntilFinal(
    body: FacilitatorRequest,
    options?: SettleUntilFinalOptions,
  ): Promise<PaymentResponse>;
};

/** Typed HTTP client for a facilitator exposing `/verify`, `/settle`, `/supported` (e.g. `createFacilitatorApp`). */
export const createFacilitatorClient = (
  baseUrl: string,
  options: FacilitatorClientOptions = {},
): FacilitatorClient => {
  const doFetch = options.fetch ?? fetch;
  const base = baseUrl.replace(/\/$/, "");

  const call = async <T extends VerifyResult | PaymentResponse>(
    path: "/verify" | "/settle",
    body: FacilitatorRequest,
  ): Promise<T> => {
    options.onRequest?.(path, body);
    const res = await doFetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(body),
    });
    const result = (await res.json()) as T;
    options.onResponse?.(path, result, res.status);
    return result;
  };

  const client: FacilitatorClient = {
    verify: (body) => call<VerifyResult>("/verify", body),
    settle: (body) => call<PaymentResponse>("/settle", body),
    supported: async () =>
      (await doFetch(`${base}/supported`, { headers: options.headers })).json(),
    async settleUntilFinal(
      body,
      { pollMs = 5000, timeoutMs = 8 * 60_000 } = {},
    ) {
      const deadline = Date.now() + timeoutMs;
      let result = await client.settle(body);
      while (
        result.errorReason === "settlement_pending" &&
        Date.now() < deadline
      ) {
        await new Promise((r) => setTimeout(r, pollMs));
        result = await client.settle(body);
      }
      return result;
    },
  };
  return client;
};
