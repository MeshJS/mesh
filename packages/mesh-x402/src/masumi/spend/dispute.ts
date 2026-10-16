import { Asset, UTxO } from "@meshsdk/common";
import { MeshWallet } from "@meshsdk/wallet";

import { LOVELACE } from "../../types/asset";
import { X402Error } from "../../types/errors";
import { MasumiDeployment } from "../../types/payment-requirements";
import { AdminSignature, AssetValueEntry } from "../cip8-admin";
import { credentialsToBech32, MASUMI_STATE, MasumiDatumView } from "../datum";
import { SpendContext } from "./context";
import { buildWithdrawDisputedRedeemer } from "./redeemer";
import {
  finishSpend,
  loadSpender,
  startEscrowSpend,
  WITHDRAW_WINDOW_SLOTS,
} from "./spend";
import { taggedOutputDatum } from "./tagged-output";
import { slotAtOrAfter } from "./timing";

/** `AssetValue`'s convention for lovelace: empty policy id, one "asset" with an empty name. */
const assetValueToAssets = (entries: AssetValueEntry[]): Asset[] =>
  entries.flatMap((entry) =>
    entry.assets.map((a) => ({
      unit:
        entry.policyId === "" ? LOVELACE : `${entry.policyId}${a.assetName}`,
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
    throw new X402Error(
      "MASUMI_INVALID_OUTPUT_SHAPE",
      "WithdrawDisputed is only valid from the Disputed state",
    );
  }

  const [submitter, changeAddress] = await Promise.all([
    loadSpender(submitterWallet),
    submitterWallet.getChangeAddress(),
  ]);
  const datumTag = taggedOutputDatum(escrowUtxo.input);
  const buyerPayoutAddress = credentialsToBech32(
    currentDatum.buyerReturnAddress ?? currentDatum.buyer,
    submitter.networkId,
  );
  const sellerPayoutAddress = credentialsToBech32(
    currentDatum.sellerReturnAddress ?? currentDatum.seller,
    submitter.networkId,
  );

  const redeemer = buildWithdrawDisputedRedeemer(
    buyerValue,
    sellerValue,
    adminSignatures,
  );
  const invalidBefore = slotAtOrAfter(
    Number(currentDatum.externalDisputeUnlockTime),
    ctx.currentSlot,
  );

  const chain = startEscrowSpend(escrowUtxo, redeemer, deployment, ctx)
    .txOut(buyerPayoutAddress, assetValueToAssets(buyerValue))
    .txOutInlineDatumValue(datumTag, "Mesh")
    .txOut(sellerPayoutAddress, assetValueToAssets(sellerValue))
    .txOutInlineDatumValue(datumTag, "Mesh");

  return finishSpend(chain, submitter, {
    changeAddress,
    invalidBefore,
    invalidHereafter: invalidBefore + WITHDRAW_WINDOW_SLOTS,
  });
};
