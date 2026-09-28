import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";
import { UTxO } from "@meshsdk/common";

import { X402Error } from "../../types/errors";
import {
  credentialsToBech32,
  MASUMI_STATE,
  MasumiDatumView,
} from "../datum";
import { MasumiDeployment } from "../../types/payment-requirements";
import { resolveMasumiEscrowScript } from "../escrow-address";
import { buildContinuationDatum } from "./continuation";
import { selectCollateralUtxo } from "./collateral";
import { SpendContext } from "./context";
import { SUBMIT_RESULT_REDEEMER, WITHDRAW_REDEEMER, AUTHORIZE_REFUND_REDEEMER } from "./redeemer";
import { slotAtOrAfter, slotStrictlyBefore, slotToUnixMs, tightUpperBound, TX_VALIDITY_BUFFER_SLOTS } from "./timing";
import { taggedOutputDatum } from "./tagged-output";

const ownRefOf = (utxo: UTxO) => ({ txHash: utxo.input.txHash, outputIndex: utxo.input.outputIndex });

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
  if (!resultHash) throw new X402Error("MASUMI_INVALID_OUTPUT_SHAPE", "resultHash must not be empty");

  const newState =
    currentDatum.state === MASUMI_STATE.FundsLocked || currentDatum.state === MASUMI_STATE.ResultSubmitted
      ? MASUMI_STATE.ResultSubmitted
      : MASUMI_STATE.Disputed;

  const networkId = await sellerWallet.getNetworkId();
  const sellerAddress = credentialsToBech32(currentDatum.seller, networkId as 0 | 1);
  const sellerUtxos = await sellerWallet.getUtxos();
  const collateral = selectCollateralUtxo(sellerUtxos);
  const script = resolveMasumiEscrowScript(deployment);

  const invalidBefore = slotAtOrAfter(Number(currentDatum.sellerCooldownTime), ctx.currentSlot);
  const invalidHereafter = tightUpperBound(
    currentDatum.resultHash === ""
      ? slotStrictlyBefore(Number(currentDatum.submitResultTime), ctx.currentSlot)
      : slotStrictlyBefore(Number(currentDatum.externalDisputeUnlockTime), ctx.currentSlot),
    ctx.currentSlot,
  );

  // The validator computes cooldown_time as `tx_latest_time + cooldown_period`, where
  // tx_latest_time is THIS transaction's own invalidHereafter (converted to POSIX ms by the
  // ledger) - not wall-clock "now". Deriving it from `invalidHereafter` (not `Date.now()`) is
  // required for `seller_cooldown_time >= cooldown_time` to hold on-chain.
  const cooldownPeriodMs = Number(deployment.cooldownPeriod); // already POSIX ms, matching every other datum time field
  const txLatestTimeMs = slotToUnixMs(invalidHereafter, ctx.currentSlot);
  const freshSellerCooldownTime = BigInt(txLatestTimeMs + cooldownPeriodMs);

  const finalDatum = buildContinuationDatum(currentDatum, {
    resultHash,
    sellerCooldownTime: freshSellerCooldownTime,
    buyerCooldownTime: 0n,
    state: newState,
  });

  const txBuilder = new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false });
  const tx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(SUBMIT_RESULT_REDEEMER, "Mesh")
    .txInScript(script.code)
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(finalDatum, "Mesh")
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .requiredSignerHash(currentDatum.seller.payment.hash)
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidHereafter)
    .changeAddress(sellerAddress)
    .selectUtxosFrom(sellerUtxos)
    .complete();

  return tx;
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
  const networkId = (await sellerWallet.getNetworkId()) as 0 | 1;
  const sellerAddress = credentialsToBech32(currentDatum.seller, networkId);
  const sellerUtxos = await sellerWallet.getUtxos();
  const collateral = selectCollateralUtxo(sellerUtxos);
  const script = resolveMasumiEscrowScript(deployment);
  const ownRef = ownRefOf(escrowUtxo);
  const datumTag = taggedOutputDatum(ownRef);

  const lovelaceIn = BigInt(escrowUtxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0");
  const collateralReturn = currentDatum.collateralReturnLovelace;
  const buyerPayoutAddress = credentialsToBech32(currentDatum.buyerReturnAddress ?? currentDatum.buyer, networkId);

  const txBuilder = new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false });
  let chain = txBuilder
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(WITHDRAW_REDEEMER, "Mesh")
    .txInScript(script.code)
    .txOut(buyerPayoutAddress, [{ unit: "lovelace", quantity: collateralReturn.toString() }])
    .txOutInlineDatumValue(datumTag, "Mesh");

  if (currentDatum.sellerReturnAddress) {
    const sellerResidualAddress = credentialsToBech32(currentDatum.sellerReturnAddress, networkId);
    const residualAmount = escrowUtxo.output.amount
      .map((a) => (a.unit === "lovelace" ? { unit: a.unit, quantity: (lovelaceIn - collateralReturn).toString() } : a))
      .filter((a) => a.unit !== "lovelace" || BigInt(a.quantity) > 0n);
    chain = chain.txOut(sellerResidualAddress, residualAmount).txOutInlineDatumValue(datumTag, "Mesh");
  }

  const invalidBefore =
    currentDatum.state === MASUMI_STATE.WithdrawAuthorized
      ? ctx.currentSlot
      : slotAtOrAfter(Number(currentDatum.unlockTime), ctx.currentSlot);

  const tx = await chain
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .requiredSignerHash(currentDatum.seller.payment.hash)
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidBefore + 3600)
    .changeAddress(sellerAddress)
    .selectUtxosFrom(sellerUtxos)
    .complete();

  return tx;
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
  const networkId = (await sellerWallet.getNetworkId()) as 0 | 1;
  const sellerAddress = credentialsToBech32(currentDatum.seller, networkId);
  const sellerUtxos = await sellerWallet.getUtxos();
  const collateral = selectCollateralUtxo(sellerUtxos);
  const script = resolveMasumiEscrowScript(deployment);

  const invalidBefore = slotAtOrAfter(Number(currentDatum.sellerCooldownTime), ctx.currentSlot);
  // No must_end_before for this action; a short, fixed window keeps the resulting cooldown
  // (derived from this bound - see below) practically usable rather than needlessly inflated.
  const invalidHereafter = invalidBefore + TX_VALIDITY_BUFFER_SLOTS;

  // See buildSubmitResultTx: cooldown_time derives from THIS tx's own invalidHereafter, not
  // wall-clock "now".
  const cooldownPeriodMs = Number(deployment.cooldownPeriod);
  const txLatestTimeMs = slotToUnixMs(invalidHereafter, ctx.currentSlot);
  const freshSellerCooldownTime = BigInt(txLatestTimeMs + cooldownPeriodMs);

  const continuationDatum = buildContinuationDatum(currentDatum, {
    resultHash: "",
    sellerCooldownTime: freshSellerCooldownTime,
    buyerCooldownTime: 0n,
    state: MASUMI_STATE.RefundAuthorized,
  });

  const tx = await new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false })
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(AUTHORIZE_REFUND_REDEEMER, "Mesh")
    .txInScript(script.code)
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(continuationDatum, "Mesh")
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .requiredSignerHash(currentDatum.seller.payment.hash)
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidHereafter)
    .changeAddress(sellerAddress)
    .selectUtxosFrom(sellerUtxos)
    .complete();

  return tx;
};
