import { CardanoNetwork } from "./network";

export type PaymentResponseStatus = "confirmed" | "mempool" | "pending";

export type PaymentResponse = {
  success: boolean;
  network: CardanoNetwork;
  /** Canonical transaction id (hex). */
  transaction: string;
  extra: {
    status: PaymentResponseStatus;
    /** -1 for mempool-only, 0+ for canonical block confirmations. */
    confirmations: number;
    transactionId?: string;
  };
  errorReason?: string;
};

const toBase64 = (value: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(value, "utf-8").toString("base64")
    : btoa(value);

const fromBase64 = (value: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(value, "base64").toString("utf-8")
    : atob(value);

export const encodePaymentResponseHeader = (response: PaymentResponse): string =>
  toBase64(JSON.stringify(response));

export const decodePaymentResponseHeader = (header: string): PaymentResponse =>
  JSON.parse(fromBase64(header)) as PaymentResponse;

/** V2 uses the bare `PAYMENT-RESPONSE` header (no `X-` prefix, unlike V1's `X-PAYMENT-RESPONSE`). */
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";
