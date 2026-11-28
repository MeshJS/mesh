/**
 * UTXO rule set — Conway/Babbage:
 *
 *   U1   inputs ≠ ∅
 *   U3   no duplicate inputs
 *   U4   current_slot ≤ ttl
 *   U5   validity_start ≤ current_slot
 *   U6   size(tx) ≤ maxTxSize
 *   U7   ∀ o: lovelace(o) ≥ 0;  fee ≥ 0
 *   U8   ∀ o: lovelace(o) ≥ minADA(pp, o)
 *   U9   fee ≥ minFee(pp, tx)
 *   U10  lovelace(inputs) = lovelace(outputs) + fee
 *        multi_asset(inputs) + minted = multi_asset(outputs)   ← correct burn/mint accounting
 *
 * Note: U2 (inputs ⊆ dom(utxo)) is handled by the orchestrator (TransactionValidator)
 * which resolves inputUTxOs before calling this module.
 *
 * References:
 *   cardano-ledger babbage/impl: Cardano.Ledger.Babbage.Rules.Utxo
 *   cardano-ledger conway/impl:  Cardano.Ledger.Conway.Rules.Utxo
 */

import { ok, err } from './types.js';
import type { ValidationResult, RuleContext } from './types.js';
import type { Transaction, UTxO } from '../../types.js';
import {
  sumLovelace,
  sumMultiAsset,
  addMultiAssets,
  multiAssetEq,
  computeMinFee,
  computeMinAda,
} from '../value.js';

export function validateUTXO(
  ctx:         RuleContext,
  tx:          Transaction,
  inputUTxOs:  UTxO[],
  rawCborSize: number,
): ValidationResult {
  const { params, state } = ctx;
  const slot = state.currentSlot();

  // U1 — non-empty input set
  if (tx.body.inputs.length === 0) return err('U1: transaction has no inputs');

  // U3 — no duplicate inputs
  {
    const seen = new Set<string>();
    for (const inp of tx.body.inputs) {
      const key = `${inp.txHash}#${inp.outputIndex}`;
      if (seen.has(key)) return err(`U3: duplicate input ${key}`);
      seen.add(key);
    }
  }

  // U4 — TTL not exceeded
  if (tx.body.ttl !== undefined && slot > tx.body.ttl) {
    return err(`U4: transaction expired — TTL ${tx.body.ttl}, current slot ${slot}`);
  }

  // U5 — validity start reached
  if (tx.body.validityStart !== undefined && slot < tx.body.validityStart) {
    return err(`U5: tx not yet valid — validityStart ${tx.body.validityStart}, current slot ${slot}`);
  }

  // U6 — transaction size limit
  if (rawCborSize > params.maxTxSize) {
    return err(`U6: tx size ${rawCborSize} B > maxTxSize ${params.maxTxSize} B`);
  }

  // U7 — non-negative fee and output values
  if (tx.body.fee < 0n) return err(`U7: fee must be ≥ 0, got ${tx.body.fee}`);
  for (let i = 0; i < tx.body.outputs.length; i++) {
    if (tx.body.outputs[i]!.value.lovelace < 0n) {
      return err(`U7: output ${i} has negative lovelace`);
    }
  }

  // U8 — min-ADA per output
  for (let i = 0; i < tx.body.outputs.length; i++) {
    const out    = tx.body.outputs[i]!;
    const minAda = computeMinAda(params.coinsPerUTxOByte, out);
    if (out.value.lovelace < minAda) {
      return err(
        `U8: output ${i} lovelace ${out.value.lovelace} < minADA ${minAda}` +
        ` (coinsPerUTxOByte=${params.coinsPerUTxOByte})`,
      );
    }
  }

  // U9 — minimum fee
  const minFee = computeMinFee(params.minFeeA, params.minFeeB, rawCborSize);
  if (tx.body.fee < minFee) {
    return err(`U9: fee ${tx.body.fee} < minFee ${minFee} (txSize=${rawCborSize} B)`);
  }

  // U10 — value preservation
  //   Lovelace: consumed = produced + fee  (ADA cannot be minted/burned)
  //   Multi-asset: consumed + minted = produced  (tokens can be created/destroyed)
  {
    const consumedLovelace = sumLovelace(inputUTxOs.map(u => u.output.value));
    const producedLovelace = sumLovelace(tx.body.outputs.map(o => o.value)) + tx.body.fee;
    if (consumedLovelace !== producedLovelace) {
      return err(
        `U10: lovelace not preserved — consumed ${consumedLovelace} ≠ produced+fee ${producedLovelace}` +
        ` (diff ${consumedLovelace - producedLovelace})`,
      );
    }

    const consumedAssets  = sumMultiAsset(inputUTxOs.map(u => u.output.value));
    const mintedAssets    = tx.body.mint ?? {};
    const availableAssets = addMultiAssets(consumedAssets, mintedAssets);
    const producedAssets  = sumMultiAsset(tx.body.outputs.map(o => o.value));
    if (!multiAssetEq(availableAssets, producedAssets)) {
      return err('U10: multi-asset value not preserved (inputs + minted ≠ outputs)');
    }
  }

  return ok();
}
