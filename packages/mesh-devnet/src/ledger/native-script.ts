/**
 * Native script (Allegra/Mary) validation.
 *
 * Native scripts validate against the transaction's witness set and validity
 * interval.  Unlike Plutus scripts there is no execution budget — they are
 * evaluated as a pure predicate.
 *
 * Supported script types (all NativeScript variants):
 *   ScriptSignature { type:'sig', keyHash }  — witness present for this key
 *   ScriptAll       { type:'all', scripts }  — all sub-scripts must pass
 *   ScriptAny       { type:'any', scripts }  — at least one must pass
 *   ScriptAtLeast   { type:'atLeast', required, scripts } — at least N must pass
 *   ScriptAfter     { type:'after', slot }   — tx validityStart ≥ slot
 *   ScriptBefore    { type:'before', slot }  — tx ttl ≤ slot
 *
 * Reference: cardano-ledger eras/shelley-ma/impl/src/.../TimeLock.hs
 */

import { Script, ScriptType } from '@harmoniclabs/cardano-ledger-ts';
import type { Transaction }   from '../types.js';
import { blake2b224, toHex }  from '../crypto.js';
import { fromHex }            from '../crypto.js';

// ── Public API ────────────────────────────────────────────────────────────────

export interface NativeScriptResult {
  ok:    boolean;
  error?: string;
}

/**
 * Validate a native script against a transaction.
 *
 * @param script  A Script<ScriptType.NativeScript> parsed by cardano-ledger-ts
 * @param tx      The transaction being validated
 */
export function validateNativeScript(
  script: Script<ScriptType.NativeScript>,
  tx:     Transaction,
): NativeScriptResult {
  const ns = script.nativeScript();
  if (!ns) return { ok: false, error: 'could not parse native script' };

  const witnessKeys = buildWitnessKeySet(tx);
  const ok = evalNativeScript(ns as NativeScript, tx, witnessKeys);
  return ok ? { ok: true } : { ok: false, error: `native script condition not satisfied` };
}

/**
 * Validate using raw CBOR bytes of a native script.
 * The bytes should be the ledger CDDL-encoded script (not the witness-set wrapper).
 */
export function validateNativeScriptBytes(
  scriptCborHex: string,
  tx:            Transaction,
): NativeScriptResult {
  try {
    const script = Script.fromCbor(scriptCborHex, ScriptType.NativeScript);
    return validateNativeScript(script as Script<ScriptType.NativeScript>, tx);
  } catch (e) {
    return { ok: false, error: `native script parse error: ${(e as Error).message}` };
  }
}

// ── Internal types ────────────────────────────────────────────────────────────

type NativeScript =
  | { type: 'sig';     keyHash: string }
  | { type: 'all';     scripts: NativeScript[] }
  | { type: 'any';     scripts: NativeScript[] }
  | { type: 'atLeast'; required: number; scripts: NativeScript[] }
  | { type: 'after';   slot: number }
  | { type: 'before';  slot: number };

// ── Evaluator ─────────────────────────────────────────────────────────────────

function evalNativeScript(
  script:      NativeScript,
  tx:          Transaction,
  witnessKeys: Set<string>,
): boolean {
  switch (script.type) {
    case 'sig':
      // Check the witness set contains a key whose hash matches
      return witnessKeys.has(script.keyHash.toLowerCase());

    case 'all':
      return script.scripts.every(s => evalNativeScript(s, tx, witnessKeys));

    case 'any':
      return script.scripts.some(s => evalNativeScript(s, tx, witnessKeys));

    case 'atLeast': {
      let count = 0;
      for (const s of script.scripts) {
        if (evalNativeScript(s, tx, witnessKeys)) {
          if (++count >= script.required) return true;
        }
      }
      return count >= script.required;
    }

    case 'after':
      // The tx's lower validity bound must be ≥ this slot.
      // We use validityStart if set; otherwise the current slot.
      return (tx.body.validityStart ?? tx.slot) >= script.slot;

    case 'before':
      // The tx's upper validity bound (TTL) must be ≤ this slot.
      return tx.body.ttl !== undefined && tx.body.ttl <= script.slot;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the set of payment-key hashes present in the vkey witness set.
 * Each hash is `blake2b-224(vkey)` encoded as lowercase hex.
 */
function buildWitnessKeySet(tx: Transaction): Set<string> {
  const keys = new Set<string>();
  for (const w of tx.witnesses.vkeyWitnesses) {
    try {
      const vkeyBytes = fromHex(w.vkey);
      keys.add(toHex(blake2b224(vkeyBytes)));
    } catch { /* ignore malformed witnesses */ }
  }
  return keys;
}
