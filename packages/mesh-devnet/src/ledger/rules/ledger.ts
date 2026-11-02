/**
 * LEDGER rule set — network identity:
 *
 *   N1  body.network_id (if present) matches the protocol network id
 *   N2  every output address is on the protocol network
 *
 * References:
 *   cardano-ledger shelley/impl: Cardano.Ledger.Shelley.Rules.Ledger
 *   cardano-ledger conway/impl:  Cardano.Ledger.Conway.Rules.Ledger
 */

import { ok, err } from './types.js';
import type { ValidationResult, RuleContext } from './types.js';
import type { Transaction } from '../../types.js';
import { networkIdOfAddress } from '../address.js';
import { NETWORK_ID } from '../../config.js';

export function validateLEDGER(
  _ctx: RuleContext,
  tx:   Transaction,
): ValidationResult {
  // N1 — body network_id (optional field) must match protocol
  if (tx.body.networkId !== undefined && tx.body.networkId !== NETWORK_ID) {
    return err(`N1: tx network_id ${tx.body.networkId} ≠ protocol network ${NETWORK_ID}`);
  }

  // N2 — all output addresses are on the correct network
  for (let i = 0; i < tx.body.outputs.length; i++) {
    const aNet = networkIdOfAddress(tx.body.outputs[i]!.addressHex);
    if (aNet !== null && aNet !== NETWORK_ID) {
      return err(`N2: output ${i} address is on network ${aNet}, expected ${NETWORK_ID}`);
    }
  }

  return ok();
}
