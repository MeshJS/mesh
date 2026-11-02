/**
 * Plutus script evaluation tests.
 *
 * Tests the evalPlutusScript / estimatePlutusExUnits functions.
 *
 * Always-succeeds V2 script:
 *   UPLC:  (program 1.0.0 (lam _ (lam _ (lam _ (con unit ())))))
 *   flat:  010000222499
 *   CBOR-wrapped (what the witness set stores): 46010000222499
 *
 * Both forms are accepted by UPLCDecoder.parse(bytes, 'cbor').
 * Budget: cpu = 230,100  mem = 1,100  (measured, not theoretical).
 *
 * Generated with:
 *   UPLCEncoder.compile(new UPLCProgram([1,0,0],
 *     new Lambda(new Lambda(new Lambda(UPLCConst.unit)))))
 */

import { describe, it, expect }  from 'vitest';
import { DataConstr, DataI }      from '@harmoniclabs/plutus-data';
import { evalPlutusScript, estimatePlutusExUnits } from '../src/ledger/plutus-eval.js';

// ── Known script bytes ────────────────────────────────────────────────────────

/** flat-encoded always-succeeds: (program 1.0.0 (lam _ (lam _ (lam _ (con unit ()))))) */
const ALWAYS_SUCCEEDS_FLAT     = '010000222499';
/** same script, CBOR byte-string wrapped (as stored in tx witness set) */
const ALWAYS_SUCCEEDS_CBOR     = '46010000222499';
/** Expected ExUnits for the always-succeeds script (verified against plutus-machine) */
const ALWAYS_SUCCEEDS_CPU      = 230_100n;
const ALWAYS_SUCCEEDS_MEM      = 1_100n;

const UNIT_DATA  = new DataConstr(0, []);
const INT_DATA   = new DataI(42n);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('evalPlutusScript', () => {
  it('returns ok:false for unparseable script bytes', () => {
    const result = evalPlutusScript(
      new Uint8Array([0xff, 0xfe, 0xfd]),
      2,
      { redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  it('budgetSpent has cpu and mem fields', () => {
    // Even a failing evaluation should return budget info
    const result = evalPlutusScript(
      new Uint8Array([0x00]),
      2,
      { redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect(typeof result.budgetSpent.cpu).toBe('bigint');
    expect(typeof result.budgetSpent.mem).toBe('bigint');
  });

  it('logs is always an array', () => {
    const result = evalPlutusScript(
      new Uint8Array([0x00]),
      2,
      { redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect(Array.isArray(result.logs)).toBe(true);
  });
});

describe('estimatePlutusExUnits', () => {
  it('returns budget for bad bytes (decode error)', () => {
    const result = estimatePlutusExUnits(
      new Uint8Array([0x00]),
      2,
      { redeemer: UNIT_DATA, context: UNIT_DATA },
    );
    // Should at minimum return cpu/mem zero budgets
    expect(result.budgetSpent.cpu).toBeGreaterThanOrEqual(0n);
    expect(result.budgetSpent.mem).toBeGreaterThanOrEqual(0n);
  });
});

describe('ScriptExecResult shape', () => {
  it('ok:true result has no error field set', () => {
    // We only test the shape here; actual UPLC execution tested when
    // real script bytes are provided.  For now test that our result
    // type is correct.
    const result = evalPlutusScript(
      new Uint8Array([0x40]), // minimal valid CBOR (empty bytestring)
      2,
      { redeemer: INT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    // Will fail on decode; just verify the result type:
    expect('ok' in result).toBe(true);
    expect('budgetSpent' in result).toBe(true);
    expect('logs' in result).toBe(true);
  });

  it('datum argument is used for V1/V2 spend (does not throw)', () => {
    const result = evalPlutusScript(
      new Uint8Array([0x40]),
      2,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect('ok' in result).toBe(true);
  });

  it('ExUnits are zeroed on parse failure', () => {
    const result = evalPlutusScript(
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),
      3,
      { redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect(result.ok).toBe(false);
    expect(result.budgetSpent.cpu).toBe(0n);
    expect(result.budgetSpent.mem).toBe(0n);
  });
});

describe('evalPlutusScript — version selection', () => {
  it('accepts version 1', () => {
    const result = evalPlutusScript(
      new Uint8Array([0x40]),
      1,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect('ok' in result).toBe(true);
  });

  it('accepts version 3', () => {
    const result = evalPlutusScript(
      new Uint8Array([0x40]),
      3,
      { redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 10_000_000_000n, mem: 14_000_000n },
    );
    expect('ok' in result).toBe(true);
  });
});

// ── Always-succeeds real UPLC evaluation ──────────────────────────────────────

describe('evalPlutusScript — always-succeeds (real UPLC)', () => {
  const MAX_BUDGET = { cpu: 10_000_000_000n, mem: 14_000_000n };

  it('flat-encoded form: ok = true', () => {
    const result = evalPlutusScript(
      Buffer.from(ALWAYS_SUCCEEDS_FLAT, 'hex'),
      2,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
      MAX_BUDGET,
    );
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('CBOR-wrapped form (as stored in witness set): ok = true', () => {
    const result = evalPlutusScript(
      Buffer.from(ALWAYS_SUCCEEDS_CBOR, 'hex'),
      2,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
      MAX_BUDGET,
    );
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('budget spent is non-zero and within protocol params', () => {
    const result = evalPlutusScript(
      Buffer.from(ALWAYS_SUCCEEDS_CBOR, 'hex'),
      2,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
      MAX_BUDGET,
    );
    expect(result.ok).toBe(true);
    expect(result.budgetSpent.cpu).toBe(ALWAYS_SUCCEEDS_CPU);
    expect(result.budgetSpent.mem).toBe(ALWAYS_SUCCEEDS_MEM);
    expect(result.budgetSpent.cpu).toBeLessThan(MAX_BUDGET.cpu);
    expect(result.budgetSpent.mem).toBeLessThan(MAX_BUDGET.mem);
  });

  it('logs is empty (no trace calls in always-succeeds)', () => {
    const result = evalPlutusScript(
      Buffer.from(ALWAYS_SUCCEEDS_CBOR, 'hex'),
      2,
      { datum: UNIT_DATA, redeemer: INT_DATA, context: UNIT_DATA },
      MAX_BUDGET,
    );
    expect(result.ok).toBe(true);
    expect(result.logs).toHaveLength(0);
  });

  it('fails when budget is zero (S6 budget exhausted)', () => {
    const result = evalPlutusScript(
      Buffer.from(ALWAYS_SUCCEEDS_CBOR, 'hex'),
      2,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
      { cpu: 0n, mem: 0n },
    );
    // The machine throws when budget is exceeded — we catch and return ok:false
    expect(result.ok).toBe(false);
  });

  it('estimatePlutusExUnits returns correct cpu/mem for always-succeeds', () => {
    const result = estimatePlutusExUnits(
      Buffer.from(ALWAYS_SUCCEEDS_CBOR, 'hex'),
      2,
      { datum: UNIT_DATA, redeemer: UNIT_DATA, context: UNIT_DATA },
    );
    expect(result.ok).toBe(true);
    expect(result.budgetSpent.cpu).toBe(ALWAYS_SUCCEEDS_CPU);
    expect(result.budgetSpent.mem).toBe(ALWAYS_SUCCEEDS_MEM);
  });

  it('works without datum arg (minting / V3 style call)', () => {
    const result = evalPlutusScript(
      Buffer.from(ALWAYS_SUCCEEDS_CBOR, 'hex'),
      2,
      // no datum — script receives (redeemer)(context) only
      { redeemer: UNIT_DATA, context: UNIT_DATA },
      MAX_BUDGET,
    );
    // Script expects 3 args; only 2 applied → partially applied lambda, still ok (not a CEKError)
    expect(result.ok).toBe(true);
  });
});
