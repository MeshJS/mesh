import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";
import { UTxO } from "@meshsdk/common";

import { credentialsToBech32, MASUMI_STATE, MasumiDatumView } from "../datum";
import { MasumiDeployment } from "../../types/payment-requirements";
import { resolveMasumiEscrowScript } from "../escrow-address";
import { buildContinuationDatum } from "./continuation";
import { selectCollateralUtxo } from "./collateral";
import { SpendContext } from "./context";
import {
  AUTHORIZE_WITHDRAWAL_REDEEMER,
  SET_REFUND_REQUESTED_REDEEMER,
  WITHDRAW_REFUND_REDEEMER,
} from "./redeemer";
import { slotAtOrAfter, slotStrictlyBefore, slotToUnixMs, tightUpperBound, TX_VALIDITY_BUFFER_SLOTS } from "./timing";
import { taggedOutputDatum } from "./tagged-output";

/**
 * The validator computes `cooldown_time` as `tx_latest_time + cooldown_period`, where
 * `tx_latest_time` is THIS transaction's own validity-range upper bound (converted to POSIX ms
 * by the ledger) - not wall-clock "now". `cooldownPeriod` is already POSIX ms.
 */
const freshCooldownTime = (deployment: MasumiDeployment, invalidHereafter: number, currentSlot: number): bigint =>
  BigInt(slotToUnixMs(invalidHereafter, currentSlot) + Number(deployment.cooldownPeriod));

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
  const newState = currentDatum.resultHash === "" ? MASUMI_STATE.RefundRequested : MASUMI_STATE.Disputed;

  const networkId = (await buyerWallet.getNetworkId()) as 0 | 1;
  const buyerAddress = credentialsToBech32(currentDatum.buyer, networkId);
  const buyerUtxos = await buyerWallet.getUtxos();
  const collateral = selectCollateralUtxo(buyerUtxos);
  const script = resolveMasumiEscrowScript(deployment);

  const invalidBefore = slotAtOrAfter(Number(currentDatum.buyerCooldownTime), ctx.currentSlot);
  const invalidHereafter = tightUpperBound(
    slotStrictlyBefore(Number(currentDatum.unlockTime), ctx.currentSlot),
    ctx.currentSlot,
  );

  const continuationDatum = buildContinuationDatum(currentDatum, {
    sellerCooldownTime: 0n,
    buyerCooldownTime: freshCooldownTime(deployment, invalidHereafter, ctx.currentSlot),
    state: newState,
  });

  const tx = await new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false })
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(SET_REFUND_REQUESTED_REDEEMER, "Mesh")
    .txInScript(script.code)
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(continuationDatum, "Mesh")
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .requiredSignerHash(currentDatum.buyer.payment.hash)
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidHereafter)
    .changeAddress(buyerAddress)
    .selectUtxosFrom(buyerUtxos)
    .complete();

  return tx;
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
  const networkId = (await buyerWallet.getNetworkId()) as 0 | 1;
  const buyerAddress = credentialsToBech32(currentDatum.buyer, networkId);
  const buyerUtxos = await buyerWallet.getUtxos();
  const collateral = selectCollateralUtxo(buyerUtxos);
  const script = resolveMasumiEscrowScript(deployment);

  const invalidBefore = slotAtOrAfter(Number(currentDatum.buyerCooldownTime), ctx.currentSlot);
  // No must_end_before for this action; a short, fixed window keeps the resulting cooldown
  // (derived from this bound - see freshCooldownTime's doc) practically usable.
  const invalidHereafter = invalidBefore + TX_VALIDITY_BUFFER_SLOTS;

  const continuationDatum = buildContinuationDatum(currentDatum, {
    sellerCooldownTime: 0n,
    buyerCooldownTime: freshCooldownTime(deployment, invalidHereafter, ctx.currentSlot),
    state: MASUMI_STATE.WithdrawAuthorized,
  });

  const tx = await new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false })
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(AUTHORIZE_WITHDRAWAL_REDEEMER, "Mesh")
    .txInScript(script.code)
    .txOut(escrowUtxo.output.address, escrowUtxo.output.amount)
    .txOutInlineDatumValue(continuationDatum, "Mesh")
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .requiredSignerHash(currentDatum.buyer.payment.hash)
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidHereafter)
    .changeAddress(buyerAddress)
    .selectUtxosFrom(buyerUtxos)
    .complete();

  return tx;
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
  const networkId = (await buyerWallet.getNetworkId()) as 0 | 1;
  const buyerAddress = credentialsToBech32(currentDatum.buyer, networkId);
  const buyerUtxos = await buyerWallet.getUtxos();
  const collateral = selectCollateralUtxo(buyerUtxos);
  const script = resolveMasumiEscrowScript(deployment);
  const ownRef = { txHash: escrowUtxo.input.txHash, outputIndex: escrowUtxo.input.outputIndex };

  let chain = new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false })
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(WITHDRAW_REFUND_REDEEMER, "Mesh")
    .txInScript(script.code);

  if (currentDatum.buyerReturnAddress) {
    // Tagged output required: the full locked value must land at buyerReturnAddress.
    const refundAddress = credentialsToBech32(currentDatum.buyerReturnAddress, networkId);
    chain = chain.txOut(refundAddress, escrowUtxo.output.amount).txOutInlineDatumValue(taggedOutputDatum(ownRef), "Mesh");
  } else {
    // No on-chain output check applies; route the refund to the buyer's own address.
    chain = chain.txOut(buyerAddress, escrowUtxo.output.amount);
  }

  const invalidBefore =
    currentDatum.state === MASUMI_STATE.RefundAuthorized
      ? ctx.currentSlot
      : slotAtOrAfter(Number(currentDatum.submitResultTime), ctx.currentSlot);

  const tx = await chain
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .requiredSignerHash(currentDatum.buyer.payment.hash)
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidBefore + 3600)
    .changeAddress(buyerAddress)
    .selectUtxosFrom(buyerUtxos)
    .complete();

  return tx;
};
