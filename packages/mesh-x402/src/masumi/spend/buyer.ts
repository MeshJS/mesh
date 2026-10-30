import { UTxO } from "@meshsdk/common";
import { MeshWallet } from "@meshsdk/wallet";

import { MasumiDeployment } from "../../types/payment-requirements";
import { credentialsToBech32, MASUMI_STATE, MasumiDatumView } from "../datum";
import { SpendContext } from "./context";
import { buildContinuationDatum } from "./continuation";
import {
  AUTHORIZE_WITHDRAWAL_REDEEMER,
  SET_REFUND_REQUESTED_REDEEMER,
  WITHDRAW_REFUND_REDEEMER,
} from "./redeemer";
import {
  finishSpend,
  freshCooldownTime,
  loadSpender,
  startEscrowSpend,
  WITHDRAW_WINDOW_SLOTS,
} from "./spend";
import { taggedOutputDatum } from "./tagged-output";
import {
  slotAtOrAfter,
  slotStrictlyBefore,
  tightUpperBound,
  TX_VALIDITY_BUFFER_SLOTS,
} from "./timing";

/**
 * Buyer requests a refund (or signals a dispute, if a result already exists). Valid from
 * `FundsLocked`/`ResultSubmitted`/`Disputed`. Must end before `unlock_time` and start after
 * the current `buyer_cooldown_time`.
 */
export const buildSetRefundRequestedTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  buyerWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  const newState =
    currentDatum.resultHash === ""
      ? MASUMI_STATE.RefundRequested
      : MASUMI_STATE.Disputed;
  const buyer = await loadSpender(buyerWallet);

  const invalidBefore = slotAtOrAfter(
    Number(currentDatum.buyerCooldownTime),
    ctx.currentSlot,
  );
  const invalidHereafter = tightUpperBound(
    slotStrictlyBefore(Number(currentDatum.unlockTime), ctx.currentSlot),
    ctx.currentSlot,
  );

  const continuationDatum = buildContinuationDatum(currentDatum, {
    sellerCooldownTime: 0n,
    buyerCooldownTime: freshCooldownTime(
      deployment,
      invalidHereafter,
      ctx.currentSlot,
    ),
    state: newState,
  });

  const chain = startEscrowSpend(
    escrowUtxo,
    SET_REFUND_REQUESTED_REDEEMER,
    deployment,
    ctx,
  )
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(continuationDatum, "Mesh");

  return finishSpend(chain, buyer, {
    changeAddress: credentialsToBech32(currentDatum.buyer, buyer.networkId),
    signerHash: currentDatum.buyer.payment.hash,
    invalidBefore,
    invalidHereafter,
  });
};

/**
 * Buyer authorizes the seller's immediate withdrawal from a dispute. Valid only from
 * `Disputed`. Must start after the current `buyer_cooldown_time`.
 */
export const buildAuthorizeWithdrawalTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  buyerWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  const buyer = await loadSpender(buyerWallet);

  const invalidBefore = slotAtOrAfter(
    Number(currentDatum.buyerCooldownTime),
    ctx.currentSlot,
  );
  // No must_end_before for this action; a short window keeps the derived cooldown usable.
  const invalidHereafter = invalidBefore + TX_VALIDITY_BUFFER_SLOTS;

  const continuationDatum = buildContinuationDatum(currentDatum, {
    sellerCooldownTime: 0n,
    buyerCooldownTime: freshCooldownTime(
      deployment,
      invalidHereafter,
      ctx.currentSlot,
    ),
    state: MASUMI_STATE.WithdrawAuthorized,
  });

  const chain = startEscrowSpend(
    escrowUtxo,
    AUTHORIZE_WITHDRAWAL_REDEEMER,
    deployment,
    ctx,
  )
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(continuationDatum, "Mesh");

  return finishSpend(chain, buyer, {
    changeAddress: credentialsToBech32(currentDatum.buyer, buyer.networkId),
    signerHash: currentDatum.buyer.payment.hash,
    invalidBefore,
    invalidHereafter,
  });
};

/**
 * Buyer withdraws a refund. Valid from `FundsLocked`/`RefundRequested`/`RefundAuthorized`, and
 * only when the datum's current `result_hash` is empty (no result was ever submitted, or the
 * seller cleared it via `AuthorizeRefund`). Must start after `submit_result_time` unless
 * `state == RefundAuthorized`. Fully consumes the escrow UTxO (no continuation).
 */
export const buildWithdrawRefundTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  buyerWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  const buyer = await loadSpender(buyerWallet);
  const buyerAddress = credentialsToBech32(currentDatum.buyer, buyer.networkId);

  let chain = startEscrowSpend(
    escrowUtxo,
    WITHDRAW_REFUND_REDEEMER,
    deployment,
    ctx,
  );
  if (currentDatum.buyerReturnAddress) {
    // Tagged output required: the full locked value must land at buyerReturnAddress.
    const refundAddress = credentialsToBech32(
      currentDatum.buyerReturnAddress,
      buyer.networkId,
    );
    chain = chain
      .txOut(refundAddress, escrowUtxo.output.amount)
      .txOutInlineDatumValue(taggedOutputDatum(escrowUtxo.input), "Mesh");
  } else {
    // No on-chain output check applies; route the refund to the buyer's own address.
    chain = chain.txOut(buyerAddress, escrowUtxo.output.amount);
  }

  const invalidBefore =
    currentDatum.state === MASUMI_STATE.RefundAuthorized
      ? ctx.currentSlot
      : slotAtOrAfter(Number(currentDatum.submitResultTime), ctx.currentSlot);

  return finishSpend(chain, buyer, {
    changeAddress: buyerAddress,
    signerHash: currentDatum.buyer.payment.hash,
    invalidBefore,
    invalidHereafter: invalidBefore + WITHDRAW_WINDOW_SLOTS,
  });
};
