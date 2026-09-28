import { PaymentRequirements, ResourceInfo } from "./payment-requirements";

export type PaymentPayloadTransactionPart = {
  /** Base64-encoded signed Cardano transaction CBOR. */
  transaction: string;
  /** `"txHash#outputIndex"` - an input consumed by `transaction`, must be unspent at verify time. */
  nonce: string;
};

export type PaymentPayload = {
  x402Version: 2;
  resource: ResourceInfo;
  /** Mirrors the chosen `PaymentRequirements` entry from the 402 challenge's `accepts[]`. */
  accepted: PaymentRequirements;
  payload: PaymentPayloadTransactionPart;
};

const toBase64 = (value: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(value, "utf-8").toString("base64")
    : btoa(value);

const fromBase64 = (value: string): string =>
  typeof Buffer !== "undefined"
    ? Buffer.from(value, "base64").toString("utf-8")
    : atob(value);

export const encodePaymentSignatureHeader = (payload: PaymentPayload): string =>
  toBase64(JSON.stringify(payload));

export const decodePaymentSignatureHeader = (header: string): PaymentPayload =>
  JSON.parse(fromBase64(header)) as PaymentPayload;

export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
