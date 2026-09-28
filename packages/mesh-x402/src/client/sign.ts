import { MeshWallet } from "@meshsdk/wallet";

import { PaymentPayload } from "../types/payment-payload";

const hexToBase64 = (hex: string): string => Buffer.from(hex, "hex").toString("base64");

/**
 * Signs the payload's transaction with the wallet (sole signer for `default`/`script`; for
 * `masumi` the buyer is still the tx's sole signer even though a separate COSE signature over
 * `terms` was already embedded into `accepted.extra` by the resource server). Returns the
 * payload with `payload.transaction` replaced by the base64-encoded signed CBOR the spec
 * requires (Mesh's `signTx` returns hex).
 */
export const signPayment = async (
  wallet: MeshWallet,
  payload: PaymentPayload,
): Promise<PaymentPayload> => {
  const signedTxHex = await wallet.signTx(payload.payload.transaction, false, true);
  return {
    ...payload,
    payload: { ...payload.payload, transaction: hexToBase64(signedTxHex) },
  };
};
