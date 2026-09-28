import { resolveTxHash } from "@meshsdk/core-cst";
import { IFetcher, ISubmitter, Protocol } from "@meshsdk/common";

import { PaymentPayload } from "../types/payment-payload";
import { PaymentRequirements } from "../types/payment-requirements";
import { PaymentResponse } from "../types/payment-response";
import { verifyPayment } from "./verify";
import { SettlementStore } from "./store";

const base64ToHex = (base64: string): string => Buffer.from(base64, "base64").toString("hex");

const pendingResponse = (network: PaymentPayload["accepted"]["network"], txHash: string): PaymentResponse => ({
  success: false,
  network,
  transaction: txHash,
  extra: { status: "pending", confirmations: 0, transactionId: txHash },
  errorReason: "settlement_pending",
});

/**
 * Settles a verified `PaymentPayload`: broadcasts it (once - idempotent across retries with
 * the identical payload, via `store`), then checks confirmation depth against
 * `accepted.extra.confirmationPolicy.l1Confirmations`. Returns `settlement_pending` when the
 * threshold isn't met yet; the caller (resource server) is expected to retry once, and this
 * function recognizes the already-broadcast tx and never rebroadcasts it.
 */
export const settlePayment = async (
  payload: PaymentPayload,
  trustedRequirements: PaymentRequirements,
  fetcher: IFetcher,
  submitter: ISubmitter,
  store: SettlementStore,
  protocol: Protocol,
  currentSlot: number,
): Promise<PaymentResponse> => {
  const txHex = base64ToHex(payload.payload.transaction);
  const txHash = resolveTxHash(txHex);
  const network = payload.accepted.network;

  const alreadyBroadcast = await store.has(txHash);
  if (!alreadyBroadcast) {
    const verification = await verifyPayment(payload, trustedRequirements, fetcher, protocol, currentSlot);
    if (!verification.isValid) {
      return {
        success: false,
        network,
        transaction: txHash,
        extra: { status: "pending", confirmations: 0 },
        errorReason: verification.invalidReason,
      };
    }
    await submitter.submitTx(txHex);
    await store.put(txHash, { txHash, broadcastAt: Date.now() });
  }

  const l1Confirmations = payload.accepted.extra.confirmationPolicy.l1Confirmations;

  let confirmations: number;
  try {
    const txInfo = await fetcher.fetchTxInfo(txHash);
    const blockInfo = await fetcher.fetchBlockInfo(txInfo.block);
    confirmations = blockInfo.confirmations;
  } catch {
    // Not visible to the fetcher yet - either still in mempool or not propagated.
    const ttlSlot = Number(payload.accepted.maxTimeoutSeconds) + currentSlot;
    if (currentSlot > ttlSlot) {
      return {
        success: false,
        network,
        transaction: txHash,
        extra: { status: "pending", confirmations: -1, transactionId: txHash },
        errorReason: "EXPIRED",
      };
    }
    return pendingResponse(network, txHash);
  }

  if (confirmations < l1Confirmations) {
    return pendingResponse(network, txHash);
  }

  return {
    success: true,
    network,
    transaction: txHash,
    extra: { status: "confirmed", confirmations },
  };
};
