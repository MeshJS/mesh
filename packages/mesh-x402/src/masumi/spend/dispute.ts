import { MeshTxBuilder } from "@meshsdk/transaction";
import { MeshWallet } from "@meshsdk/wallet";
import { Asset, UTxO } from "@meshsdk/common";

import { AdminSignature, AssetValueEntry } from "../cip8-admin";
import { credentialsToBech32, MASUMI_STATE, MasumiDatumView } from "../datum";
import { MasumiDeployment } from "../../types/payment-requirements";
import { resolveMasumiEscrowScript } from "../escrow-address";
import { X402Error } from "../../types/errors";
import { selectCollateralUtxo } from "./collateral";
import { SpendContext } from "./context";
import { buildWithdrawDisputedRedeemer } from "./redeemer";
import { slotAtOrAfter } from "./timing";
import { taggedOutputDatum } from "./tagged-output";

/** `AssetValue`'s convention for lovelace: empty policy id, one "asset" with an empty name. */
const assetValueToAssets = (entries: AssetValueEntry[]): Asset[] =>
  entries.flatMap((entry) =>
    entry.assets.map((a) => ({
      unit: entry.policyId === "" ? "lovelace" : `${entry.policyId}${a.assetName}`,
      quantity: a.quantity.toString(),
    })),
  );

/**
 * Anyone submits a collected M-of-N admin quorum to settle a dispute, paying at least
 * `buyerValue`/`sellerValue` (the signed minimums - any residual above them accrues to whoever
 * builds this transaction) to the buyer/seller. Valid only from `Disputed`, and only once
 * `external_dispute_unlock_time` has passed. No buyer/seller signature is required - the admin
 * quorum itself is the gate.
 */
export const buildWithdrawDisputedTx = async (
  escrowUtxo: UTxO,
  currentDatum: MasumiDatumView,
  buyerValue: AssetValueEntry[],
  sellerValue: AssetValueEntry[],
  adminSignatures: AdminSignature[],
  submitterWallet: MeshWallet,
  deployment: MasumiDeployment,
  ctx: SpendContext,
): Promise<string> => {
  if (currentDatum.state !== MASUMI_STATE.Disputed) {
    throw new X402Error("MASUMI_INVALID_OUTPUT_SHAPE", "WithdrawDisputed is only valid from the Disputed state");
  }

  const networkId = (await submitterWallet.getNetworkId()) as 0 | 1;
  const submitterAddress = await submitterWallet.getChangeAddress();
  const submitterUtxos = await submitterWallet.getUtxos();
  const collateral = selectCollateralUtxo(submitterUtxos);
  const script = resolveMasumiEscrowScript(deployment);
  const ownRef = { txHash: escrowUtxo.input.txHash, outputIndex: escrowUtxo.input.outputIndex };
  const datumTag = taggedOutputDatum(ownRef);

  const buyerPayoutAddress = credentialsToBech32(currentDatum.buyerReturnAddress ?? currentDatum.buyer, networkId);
  const sellerPayoutAddress = credentialsToBech32(currentDatum.sellerReturnAddress ?? currentDatum.seller, networkId);

  const redeemer = buildWithdrawDisputedRedeemer(buyerValue, sellerValue, adminSignatures);
  const invalidBefore = slotAtOrAfter(Number(currentDatum.externalDisputeUnlockTime), ctx.currentSlot);

  const tx = await new MeshTxBuilder({ fetcher: ctx.fetcher, evaluator: ctx.evaluator, verbose: false })
    .spendingPlutusScriptV3()
    .txIn(escrowUtxo.input.txHash, escrowUtxo.input.outputIndex, escrowUtxo.output.amount, escrowUtxo.output.address)
    .txInInlineDatumPresent()
    .txInRedeemerValue(redeemer, "Mesh")
    .txInScript(script.code)
    .txOut(buyerPayoutAddress, assetValueToAssets(buyerValue))
    .txOutInlineDatumValue(datumTag, "Mesh")
    .txOut(sellerPayoutAddress, assetValueToAssets(sellerValue))
    .txOutInlineDatumValue(datumTag, "Mesh")
    .txInCollateral(
      collateral.input.txHash,
      collateral.input.outputIndex,
      collateral.output.amount,
      collateral.output.address,
    )
    .invalidBefore(invalidBefore)
    .invalidHereafter(invalidBefore + 3600)
    .changeAddress(submitterAddress)
    .selectUtxosFrom(submitterUtxos)
    .complete();

  return tx;
};
