import { decodeHeaderJson, encodeHeaderJson } from "../encoding";
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

export const encodePaymentResponseHeader = (
  response: PaymentResponse,
): string => encodeHeaderJson(response);

export const decodePaymentResponseHeader = (header: string): PaymentResponse =>
  decodeHeaderJson<PaymentResponse>(header);

/** V2 uses the bare `PAYMENT-RESPONSE` header (no `X-` prefix, unlike V1's `X-PAYMENT-RESPONSE`). */
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";
