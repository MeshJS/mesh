import { UTxO } from "@meshsdk/common";
import { MeshWallet } from "@meshsdk/wallet";

import { LOVELACE } from "../../types/asset";
import { X402Error } from "../../types/errors";
import { MasumiDeployment } from "../../types/payment-requirements";
import { credentialsToBech32, MASUMI_STATE, MasumiDatumView } from "../datum";
import { SpendContext } from "./context";
import { buildContinuationDatum } from "./continuation";
import {
  AUTHORIZE_REFUND_REDEEMER,
  SUBMIT_RESULT_REDEEMER,
  WITHDRAW_REDEEMER,
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
 * Seller submits a result: writes a non-empty (content-free) `result_hash` into the
 * continuation datum. Valid from `FundsLocked`/`ResultSubmitted` (-> `ResultSubmitted`) or
 * `Disputed`/`RefundRequested` (-> `Disputed`). Must start after `seller_cooldown_time`, and
 * end before `submit_result_time` (a first submission) or `external_dispute_unlock_time` (a
 * revision of an already-submitted result).
 */
export const buildSubmitResultTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  resultHash: string,
  sellerWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  if (!resultHash)
    throw new X402Error(
      "MASUMI_INVALID_OUTPUT_SHAPE",
      "resultHash must not be empty",
    );

  const newState =
    currentDatum.state === MASUMI_STATE.FundsLocked ||
    currentDatum.state === MASUMI_STATE.ResultSubmitted
      ? MASUMI_STATE.ResultSubmitted
      : MASUMI_STATE.Disputed;
  const seller = await loadSpender(sellerWallet);

  const invalidBefore = slotAtOrAfter(
    Number(currentDatum.sellerCooldownTime),
    ctx.currentSlot,
  );
  const invalidHereafter = tightUpperBound(
    currentDatum.resultHash === ""
      ? slotStrictlyBefore(
          Number(currentDatum.submitResultTime),
          ctx.currentSlot,
        )
      : slotStrictlyBefore(
          Number(currentDatum.externalDisputeUnlockTime),
          ctx.currentSlot,
        ),
    ctx.currentSlot,
  );

  const finalDatum = buildContinuationDatum(currentDatum, {
    resultHash,
    sellerCooldownTime: freshCooldownTime(
      deployment,
      invalidHereafter,
      ctx.currentSlot,
    ),
    buyerCooldownTime: 0n,
    state: newState,
  });

  const chain = startEscrowSpend(
    escrowUtxo,
    SUBMIT_RESULT_REDEEMER,
    deployment,
    ctx,
  )
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(finalDatum, "Mesh");

  return finishSpend(chain, seller, {
    changeAddress: credentialsToBech32(currentDatum.seller, seller.networkId),
    signerHash: currentDatum.seller.payment.hash,
    invalidBefore,
    invalidHereafter,
  });
};

/**
 * Seller withdraws. Valid from `WithdrawAuthorized` (no time bound) or `ResultSubmitted`
 * (must start after `unlock_time`). Pays the buyer's collateral back (and, if
 * `sellerReturnAddress` is set, the seller's residual to it) via tagged outputs; fully
 * consumes the escrow UTxO (no continuation).
 */
export const buildWithdrawTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  sellerWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  const seller = await loadSpender(sellerWallet);
  const datumTag = taggedOutputDatum(escrowUtxo.input);

  const lovelaceIn = BigInt(
    escrowUtxo.output.amount.find((a) => a.unit === LOVELACE)?.quantity ?? "0",
  );
  const collateralReturn = currentDatum.collateralReturnLovelace;
  const buyerPayoutAddress = credentialsToBech32(
    currentDatum.buyerReturnAddress ?? currentDatum.buyer,
    seller.networkId,
  );

  let chain = startEscrowSpend(escrowUtxo, WITHDRAW_REDEEMER, deployment, ctx)
    .txOut(buyerPayoutAddress, [
      { unit: LOVELACE, quantity: collateralReturn.toString() },
    ])
    .txOutInlineDatumValue(datumTag, "Mesh");

  if (currentDatum.sellerReturnAddress) {
    const sellerResidualAddress = credentialsToBech32(
      currentDatum.sellerReturnAddress,
      seller.networkId,
    );
    const residualAmount = escrowUtxo.output.amount
      .map((a) =>
        a.unit === LOVELACE
          ? {
              unit: a.unit,
              quantity: (lovelaceIn - collateralReturn).toString(),
            }
          : a,
      )
      .filter((a) => a.unit !== LOVELACE || BigInt(a.quantity) > 0n);
    chain = chain
      .txOut(sellerResidualAddress, residualAmount)
      .txOutInlineDatumValue(datumTag, "Mesh");
  }

  const invalidBefore =
    currentDatum.state === MASUMI_STATE.WithdrawAuthorized
      ? ctx.currentSlot
      : slotAtOrAfter(Number(currentDatum.unlockTime), ctx.currentSlot);

  return finishSpend(chain, seller, {
    changeAddress: credentialsToBech32(currentDatum.seller, seller.networkId),
    signerHash: currentDatum.seller.payment.hash,
    invalidBefore,
    invalidHereafter: invalidBefore + WITHDRAW_WINDOW_SLOTS,
  });
};

/**
 * Seller voluntarily forfeits their claim, clearing `result_hash` and flipping to
 * `RefundAuthorized` so the buyer's subsequent `WithdrawRefund` is unconditional on timing.
 * Valid from any state except `WithdrawAuthorized`/`RefundAuthorized`. No upper time bound
 * (the seller may cooperate at any time).
 */
export const buildAuthorizeRefundTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  sellerWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  const seller = await loadSpender(sellerWallet);

  const invalidBefore = slotAtOrAfter(
    Number(currentDatum.sellerCooldownTime),
    ctx.currentSlot,
  );
  // No must_end_before for this action; a short window keeps the derived cooldown usable.
  const invalidHereafter = invalidBefore + TX_VALIDITY_BUFFER_SLOTS;

  const continuationDatum = buildContinuationDatum(currentDatum, {
    resultHash: "",
    sellerCooldownTime: freshCooldownTime(
      deployment,
      invalidHereafter,
      ctx.currentSlot,
    ),
    buyerCooldownTime: 0n,
    state: MASUMI_STATE.RefundAuthorized,
  });

  const chain = startEscrowSpend(
    escrowUtxo,
    AUTHORIZE_REFUND_REDEEMER,
    deployment,
    ctx,
  )
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(continuationDatum, "Mesh");

  return finishSpend(chain, seller, {
    changeAddress: credentialsToBech32(currentDatum.seller, seller.networkId),
    signerHash: currentDatum.seller.payment.hash,
    invalidBefore,
    invalidHereafter,
  });
};
