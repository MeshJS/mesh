/**
 * UTXOW rule set — witness checks:
 *
 *   W1  every vkey witness verifies: Ed25519.verify(sig, blake2b256(CBOR(txBody)), vkey)
 *   W2  every key-locked input has a matching vkey witness
 *       script-locked inputs are dispatched to the UTXOS rule set
 *   W3  every required_signers hash has a matching vkey witness
 *
 * References:
 *   cardano-ledger shelley/impl: Cardano.Ledger.Shelley.Rules.Utxow
 *   cardano-ledger conway/impl:  Cardano.Ledger.Conway.Rules.Utxow
 */

import { ok, err } from './types.js';
import type { ValidationResult, RuleContext } from './types.js';
import type { Transaction, UTxO, VKeyWitness } from '../../types.js';
import { verifyEd25519, fromHex, toHex, blake2b224 } from '../../crypto.js';
import {
  paymentKeyHashOfAddress,
  scriptHashOfAddress,
  addressTypeNibble,
} from '../address.js';
import { validateUTXOS } from './utxos.js';
import type { ScriptInput } from './utxos.js';

export function validateUTXOW(
  ctx:        RuleContext,
  tx:         Transaction,
  inputUTxOs: UTxO[],
): ValidationResult {
  // Build index: paymentKeyHash(hex) → VKeyWitness
  const witnessIndex = new Map<string, VKeyWitness>();

  for (const w of tx.witnesses.vkeyWitnesses) {
    const vkeyBytes = fromHex(w.vkey);
    if (vkeyBytes.length !== 32) {
      return err(`W1: vkey must be 32 bytes, got ${vkeyBytes.length}`);
    }
    const sigBytes = fromHex(w.signature);
    if (sigBytes.length !== 64) {
      return err(`W1: signature must be 64 bytes, got ${sigBytes.length}`);
    }

    // W1 — Ed25519 signature over tx body hash (= blake2b-256(CBOR(body)))
    const txBodyHash = fromHex(tx.hash);
    if (!verifyEd25519(vkeyBytes, txBodyHash, sigBytes)) {
      return err(`W1: invalid Ed25519 signature for key ${toHex(blake2b224(vkeyBytes))}`);
    }
    witnessIndex.set(toHex(blake2b224(vkeyBytes)), w);
  }

  // Classify inputs as key-locked vs script-locked
  const scriptInputs: ScriptInput[] = [];
  const keyInputs:    UTxO[]        = [];

  for (const utxo of inputUTxOs) {
    const typeN = addressTypeNibble(utxo.output.addressHex) ?? 0;
    const kh    = paymentKeyHashOfAddress(utxo.output.addressHex);
    if (kh !== null) {
      keyInputs.push(utxo);
    } else {
      const sh = scriptHashOfAddress(utxo.output.addressHex);
      if (sh) {
        scriptInputs.push({ utxo, scriptHash: sh, addrType: typeN });
      } else {
        // Byron / unrecognised address — treat as key-locked (no witness check possible)
        keyInputs.push(utxo);
      }
    }
  }

  // W2 — every key-locked input needs a matching witness
  for (const utxo of keyInputs) {
    const kh = paymentKeyHashOfAddress(utxo.output.addressHex);
    if (!kh) continue;
    if (!witnessIndex.has(kh)) {
      return err(
        `W2: missing witness for paymentKeyHash ${kh}` +
        ` (input ${utxo.input.txHash}#${utxo.input.outputIndex})`,
      );
    }
  }

  // W3 — required signers have witnesses
  for (const kh of tx.body.requiredSigners ?? []) {
    if (!witnessIndex.has(kh)) {
      return err(`W3: missing witness for declared required signer ${kh}`);
    }
  }

  // UTXOS — script execution (when any script inputs present or minting)
  const hasMinting = tx.body.mint && Object.keys(tx.body.mint).length > 0;
  if (scriptInputs.length > 0 || hasMinting) {
    const r = validateUTXOS(ctx, tx, scriptInputs, inputUTxOs);
    if (!r.ok) return r;
  }

  return ok();
}
