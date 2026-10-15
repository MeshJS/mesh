import { IFetcher, ISubmitter, Protocol } from "@meshsdk/common";
import { deserializeTx, resolveTxHash } from "@meshsdk/core-cst";

import { base64ToHex } from "../encoding";
import { buildSignedTerms, computeTermsDigest } from "../masumi/terms";
import { tryNormalizeCardanoNetwork } from "../types/network";
import { PaymentPayload } from "../types/payment-payload";
import {
  getAssetTransferMethod,
  getConfirmationPolicy,
  PaymentRequirements,
  PaymentRequirementsExtraMasumi,
} from "../types/payment-requirements";
import { PaymentResponse } from "../types/payment-response";
import { SettlementStore } from "./store";
import {
  checkRequirementsMatchTrusted,
  VerifyOptions,
  verifyPayment,
} from "./verify";

/**
 * Confirmation and rollback grace period kept on top of the TTL before a claim may be
 * forgotten (a flat short timeout would reopen the duplicate-settlement race while the tx can still land).
 */
export const SETTLEMENT_RETENTION_GRACE_MS = 60 * 60 * 1000;

type Network = PaymentResponse["network"];

const failure = (
  network: Network,
  txHash: string,
  errorReason: string,
  extra: PaymentResponse["extra"] = {
    status: "pending",
    confirmations: -1,
    transactionId: txHash,
  },
): PaymentResponse => ({
  success: false,
  network,
  transaction: txHash,
  extra,
  errorReason,
});

const pending = (
  network: Network,
  txHash: string,
  confirmations: number,
): PaymentResponse =>
  failure(network, txHash, "settlement_pending", {
    status: "pending",
    confirmations,
    transactionId: txHash,
  });

/**
 * A submission error that is a *definitive* ledger/node rejection (so the claim can be
 * released and the payment retried) as opposed to a timeout/transport failure or an unknown
 * node result (the claim must be kept and reconciled by transaction id).
 */
const isDefinitiveRejection = (error: unknown): boolean =>
  /BadInputs|ValueNotConserved|OutsideValidityInterval|FeeTooSmall|OutputTooSmall|MalformedTx|ScriptFailures|UtxoFailure|BadInputsUTxO|ExpiredUTxO|NetworkMismatch|invalid transaction|Invalid transaction|rejected/.test(
    error instanceof Error ? error.message : String(error),
  );

/**
 * Settles a verified `PaymentPayload`: claims its canonical transaction id (atomically,
 * before the first `await` on submission), broadcasts it once, then checks the evidence
 * against `accepted.extra.confirmationPolicy.l1Confirmations` (default 1).
 *
 * - below the threshold: `settlement_pending` with the tx id; the resource server retries
 *   `/settle` with the same payload and this function resumes observing without rebroadcasting;
 * - a concurrent or repeated call for an in-flight / already-settled tx: `duplicate_settlement`;
 * - a tx whose validity window closed without the ledger recording it: terminal `EXPIRED`;
 * - `-1`: success on the facilitator's own (authenticated) broadcast acceptance, `mempool` status;
 * - a Masumi `termsDigest` is bound to the first transaction that claims it.
 */
export const settlePayment = async (
  payload: PaymentPayload,
  trustedRequirements: PaymentRequirements,
  fetcher: IFetcher,
  submitter: ISubmitter,
  store: SettlementStore,
  protocol: Protocol,
  currentSlot: number,
  options: VerifyOptions = {},
): Promise<PaymentResponse> => {
  const network =
    tryNormalizeCardanoNetwork(payload?.accepted?.network) ?? "cardano:mainnet";
  let txHex: string;
  let txHash: string;
  let ttlSlot: number | undefined;
  try {
    txHex = base64ToHex(payload.payload.transaction);
    txHash = resolveTxHash(txHex);
    const ttl = deserializeTx(txHex).body().ttl();
    ttlSlot = ttl === undefined ? undefined : Number(ttl);
  } catch {
    return failure(network, "", "INVALID_PAYLOAD");
  }

  let record = await store.get(txHash);

  // A retry resumes observing an existing claim without re-verifying; it must still be presented
  // with the requirements the payment was made for, not another route's.
  if (record && !checkRequirementsMatchTrusted(payload, trustedRequirements)) {
    return failure(network, txHash, "REQUIREMENTS_MISMATCH");
  }

  if (record?.state === "submitting" || record?.state === "settled") {
    return failure(network, txHash, "duplicate_settlement", {
      status: record.state === "settled" ? "confirmed" : "pending",
      confirmations: -1,
      transactionId: txHash,
    });
  }
  if (record?.state === "expired") return failure(network, txHash, "EXPIRED");

  if (!record) {
    const verification = await verifyPayment(
      payload,
      trustedRequirements,
      fetcher,
      protocol,
      currentSlot,
      options,
    );
    if (!verification.isValid)
      return failure(network, txHash, verification.invalidReason);

    let termsDigest: string | undefined;
    if (getAssetTransferMethod(payload.accepted) === "masumi") {
      const extra = payload.accepted.extra as PaymentRequirementsExtraMasumi;
      termsDigest = computeTermsDigest(
        buildSignedTerms(extra, { ...payload.accepted, network }),
      );
      // Logical replay: several different transactions can lock against one 402; only the first
      // transaction to claim a `termsDigest` may proceed.
      const boundTx = await store.bindTermsDigest(termsDigest, txHash);
      if (boundTx !== txHash)
        return failure(network, txHash, "MASUMI_TERMS_ALREADY_CLAIMED");
    }

    // Atomic claim BEFORE awaiting the submission, so concurrent calls cannot both broadcast.
    const claimed = await store.claim({
      txHash,
      state: "submitting",
      broadcastAt: Date.now(),
      ttlSlot,
      termsDigest,
    });
    if (!claimed) return failure(network, txHash, "duplicate_settlement");

    try {
      await submitter.submitTx(txHex);
    } catch (error) {
      if (isDefinitiveRejection(error)) {
        await store.release(txHash);
        return failure(
          network,
          txHash,
          `submission_rejected: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // Unknown node result / transport failure: keep the claim and reconcile by tx id on the retry.
    }
    record = {
      txHash,
      state: "submitted",
      broadcastAt: Date.now(),
      ttlSlot,
      termsDigest,
    };
    await store.put(txHash, record);
  }

  const l1Confirmations = getConfirmationPolicy(
    payload.accepted,
  ).l1Confirmations;

  let confirmations: number | null = null;
  try {
    const txInfo = await fetcher.fetchTxInfo(txHash);
    const blockInfo = await fetcher.fetchBlockInfo(txInfo.block);
    confirmations = blockInfo.confirmations;
  } catch {
    // Not visible to the fetcher yet - still in the mempool or not propagated.
  }

  if (confirmations === null) {
    // `-1`: the facilitator's own authenticated broadcast acceptance is the evidence asked for.
    if (l1Confirmations === -1 && record.state === "submitted") {
      await store.put(txHash, { ...record, state: "settled" });
      return {
        success: true,
        network,
        transaction: txHash,
        extra: { status: "mempool", confirmations: -1 },
      };
    }
    // The validity window closed without the ledger recording the tx: it can no longer land.
    const expiry = record.ttlSlot ?? ttlSlot;
    if (expiry !== undefined && currentSlot > expiry) {
      await store.put(txHash, { ...record, state: "expired" });
      return failure(network, txHash, "EXPIRED");
    }
    return pending(network, txHash, -1);
  }

  if (confirmations < l1Confirmations)
    return pending(network, txHash, confirmations);

  await store.put(txHash, { ...record, state: "settled" });
  return {
    success: true,
    network,
    transaction: txHash,
    extra: { status: "confirmed", confirmations },
  };
};
