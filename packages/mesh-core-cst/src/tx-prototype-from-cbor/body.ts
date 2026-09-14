import type {
  MintPrototype,
  TransactionBodyPrototype,
} from "@meshsdk/common";

import { AssetId, TransactionBody } from "../types";
import { certificateToPrototype } from "./certificates";
import { proposalProcedureToPrototype, votingProceduresToPrototype } from "./governance";
import { transactionInputToPrototype, transactionOutputToPrototype } from "./inputs-outputs";
import { networkIdToPrototype } from "./primitives";

/**
 * Inverse of `../tx-prototype-to-cbor/body.ts`.
 *
 * Absent CDDL keys decode to an absent TS field (not `null`), and empty collections are treated
 * as absent — mirroring the encoder, which only emits a key when `?.length` is truthy. That makes
 * `decode(encode(x))` idempotent on the second pass even where `x` used `null` or `[]` explicitly.
 */
export const transactionBodyToPrototype = (body: TransactionBody): TransactionBodyPrototype => {
  const result: TransactionBodyPrototype = {
    fee: body.fee().toString(),
    inputs: [...body.inputs().values()].map(transactionInputToPrototype),
    outputs: body.outputs().map(transactionOutputToPrototype),
  };

  const ttl = body.ttl();
  if (ttl !== undefined) result.ttl = ttl.toString();

  const validityStart = body.validityStartInterval();
  if (validityStart !== undefined) result.validity_start_interval = validityStart.toString();

  const certs = body.certs();
  if (certs?.size()) result.certs = [...certs.values()].map(certificateToPrototype);

  const withdrawals = body.withdrawals();
  if (withdrawals?.size) {
    const out: Record<string, string> = {};
    for (const [account, coin] of withdrawals) out[account.toString()] = coin.toString();
    result.withdrawals = out;
  }

  const auxDataHash = body.auxiliaryDataHash();
  if (auxDataHash !== undefined) result.auxiliary_data_hash = auxDataHash.toString();

  const mint = body.mint();
  if (mint?.size) {
    const out: MintPrototype = {};
    for (const [assetId, quantity] of mint) {
      const policyId = AssetId.getPolicyId(assetId).toString();
      const assetName = AssetId.getAssetName(assetId).toString();
      (out[policyId] ??= {})[assetName] = quantity.toString();
    }
    result.mint = out;
  }

  const scriptDataHash = body.scriptDataHash();
  if (scriptDataHash !== undefined) result.script_data_hash = scriptDataHash.toString();

  const collateral = body.collateral();
  if (collateral?.size()) {
    result.collateral = [...collateral.values()].map(transactionInputToPrototype);
  }

  const requiredSigners = body.requiredSigners();
  if (requiredSigners?.size()) {
    result.required_signers = [...requiredSigners.values()].map((s) => s.toCore().toString());
  }

  const networkId = body.networkId();
  if (networkId !== undefined) result.network_id = networkIdToPrototype(Number(networkId));

  const collateralReturn = body.collateralReturn();
  if (collateralReturn) result.collateral_return = transactionOutputToPrototype(collateralReturn);

  const totalCollateral = body.totalCollateral();
  if (totalCollateral !== undefined) result.total_collateral = totalCollateral.toString();

  const referenceInputs = body.referenceInputs();
  if (referenceInputs?.size()) {
    result.reference_inputs = [...referenceInputs.values()].map(transactionInputToPrototype);
  }

  const votingProcedures = body.votingProcedures();
  if (votingProcedures && votingProcedures.getVoters().length > 0) {
    result.voting_procedures = votingProceduresToPrototype(votingProcedures);
  }

  const proposals = body.proposalProcedures();
  if (proposals?.size()) {
    result.voting_proposals = [...proposals.values()].map(proposalProcedureToPrototype);
  }

  const currentTreasuryValue = body.currentTreasuryValue();
  if (currentTreasuryValue !== undefined) {
    result.current_treasury_value = currentTreasuryValue.toString();
  }

  const donation = body.donation();
  if (donation !== undefined) result.donation = donation.toString();

  return result;
};
