import { decodeHeaderJson, encodeHeaderJson } from "../encoding";
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

export const encodePaymentSignatureHeader = (payload: PaymentPayload): string =>
  encodeHeaderJson(payload);

export const decodePaymentSignatureHeader = (header: string): PaymentPayload =>
  decodeHeaderJson<PaymentPayload>(header);

export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
