/**
 * Ledger validation rule tests.
 *
 * These tests construct synthetic Transaction objects and call
 * TransactionValidator.validate() directly, bypassing CBOR parsing so each
 * rule can be isolated cleanly.
 *
 * A raw CBOR buffer is required by the validator (for U6 size check and U9
 * fee check).  We use a helper that builds a minimal fake byte array of the
 * requested size.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TransactionValidator }              from '../src/ledger/validator.js';
import { LedgerState }                       from '../src/ledger/state.js';
import { PROTOCOL_PARAMS }                   from '../src/config.js';
import type { Transaction, UTxO, Value }     from '../src/types.js';
import { valueToMeshAssets }                   from '../src/types.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const ENTERPRISE_KEY_ADDR_HEX =
  // type nibble 6 (enterprise key), network 0 (testnet)
  '60' + 'a'.repeat(56);  // 28-byte payment key hash placeholder

const ENTERPRISE_SCRIPT_ADDR_HEX =
  // type nibble 7 (enterprise script), network 0 (testnet)
  '70' + 'b'.repeat(56);

/** A 32-byte all-zero public key used in vkey witnesses. */
const ZERO_VKEY    = '00'.repeat(32);
const ZERO_SIG     = '00'.repeat(64);
const PKH_ZEROS    = 'aa'.repeat(28);  // payment key hash for ENTERPRISE_KEY_ADDR_HEX

// ── Helper builders ───────────────────────────────────────────────────────────

const INPUT_LOVELACE = 100_000_000n; // UTxO value used throughout
const TX_FEE         = 200_000n;
// Balanced output: input = output + fee
const BALANCED_OUTPUT_VALUE: Value = { lovelace: INPUT_LOVELACE - TX_FEE };

function makeState(): LedgerState {
  const state = new LedgerState();
  const utxo: UTxO = {
    input:  { txHash: 'a'.repeat(64), outputIndex: 0 },
    output: {
      address:    'addr_test1...',
      amount:     valueToMeshAssets({ lovelace: INPUT_LOVELACE }),
      addressHex: ENTERPRISE_KEY_ADDR_HEX,
      value:      { lovelace: INPUT_LOVELACE },
    },
  };
  state.addUTxO(utxo);
  state.setSlot(1000);
  return state;
}

function makeTx(overrides: Partial<Transaction['body']> = {}): Transaction {
  const defaultBody: Transaction['body'] = {
    inputs:          [{ txHash: 'a'.repeat(64), outputIndex: 0 }],
    referenceInputs: [],
    outputs: [{
      address:    'addr_test1...',
      amount:     valueToMeshAssets(BALANCED_OUTPUT_VALUE),
      addressHex: ENTERPRISE_KEY_ADDR_HEX,
      value:      BALANCED_OUTPUT_VALUE,
    }],
    fee: TX_FEE,
    ...overrides,
  };

  return {
    hash:      'b'.repeat(64),
    body:      defaultBody,
    witnesses: {
      vkeyWitnesses: [{
        vkey:      'a'.repeat(64),   // 32-byte vkey (all zeros in practice)
        signature: '00'.repeat(64),
      }],
      datums:    {},
      redeemers: [],
      scripts:   {},
    },
    isValid: true,
    slot:    1000,
  };
}

/** Generate a fake raw CBOR byte array of given length. */
function fakeCbor(length = 200): Uint8Array {
  return new Uint8Array(length).fill(0x80);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionValidator — UTXO rules', () => {
  let state:     LedgerState;
  let validator: TransactionValidator;

  beforeEach(() => {
    state     = makeState();
    validator = new TransactionValidator(state, PROTOCOL_PARAMS);
  });

  it('U1: rejects empty inputs', () => {
    const tx     = makeTx({ inputs: [] });
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U1/);
  });

  it('U2: rejects unknown input', () => {
    const tx     = makeTx({ inputs: [{ txHash: 'f'.repeat(64), outputIndex: 0 }] });
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U2/);
  });

  it('U3: rejects duplicate inputs', () => {
    const inp = { txHash: 'a'.repeat(64), outputIndex: 0 };
    const tx  = makeTx({ inputs: [inp, inp] });
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U3/);
  });

  it('U4: rejects expired TTL', () => {
    const tx     = makeTx({ ttl: 999 }); // slot is 1000
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U4/);
  });

  it('U5: rejects tx not yet valid', () => {
    const tx     = makeTx({ validityStart: 2000 }); // slot is 1000
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U5/);
  });

  it('U6: rejects oversized transaction', () => {
    const result = validator.validate(makeTx(), fakeCbor(PROTOCOL_PARAMS.maxTxSize + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U6/);
  });

  it('U7: rejects negative fee', () => {
    const tx     = makeTx({ fee: -1n });
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U7/);
  });

  it('U10: rejects imbalanced value', () => {
    // Output passes minADA (10 ADA is well above minimum) but consumed ≠ produced + fee
    const tx = makeTx({
      outputs: [{
        address:    'addr_test1...',
        amount:     valueToMeshAssets({ lovelace: 10_000_000n }),
        addressHex: ENTERPRISE_KEY_ADDR_HEX,
        value:      { lovelace: 10_000_000n }, // < input - fee → imbalanced
      }],
    });
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/U10/);
  });
});

describe('TransactionValidator — UTXOW rules', () => {
  let state:     LedgerState;
  let validator: TransactionValidator;

  beforeEach(() => {
    state     = makeState();
    validator = new TransactionValidator(state, PROTOCOL_PARAMS);
  });

  it('W2: rejects missing key witness', () => {
    // makeTx now has balanced values so U8/U9/U10 will all pass;
    // removing witnesses should trigger W2.
    const tx = makeTx();
    tx.witnesses.vkeyWitnesses = [];
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/W2/);
  });

  it('W1: rejects bad signature length', () => {
    // 32-byte signature field is malformed (must be 64)
    const tx = makeTx();
    tx.witnesses.vkeyWitnesses = [{ vkey: '00'.repeat(32), signature: '00'.repeat(32) }];
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/W1/);
  });
});

describe('TransactionValidator — LEDGER / network rules', () => {
  let state:     LedgerState;
  let validator: TransactionValidator;

  beforeEach(() => {
    state     = makeState();
    validator = new TransactionValidator(state, PROTOCOL_PARAMS);
  });

  it('N2: rejects mainnet output address on testnet devnet', () => {
    // Network nibble 1 = mainnet
    const mainnetAddr = '61' + 'c'.repeat(56);
    const tx = makeTx({
      outputs: [{
        address:    'addr1...',
        amount:     valueToMeshAssets(BALANCED_OUTPUT_VALUE),
        addressHex: mainnetAddr,
        value:      BALANCED_OUTPUT_VALUE,
      }],
    });
    const result = validator.validate(tx, fakeCbor());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/N2/);
  });
});

describe('TransactionValidator — value preservation', () => {
  let state:     LedgerState;
  let validator: TransactionValidator;

  beforeEach(() => {
    state     = makeState();
    validator = new TransactionValidator(state, PROTOCOL_PARAMS);
  });

  it('U10: passes balanced lovelace transaction (proceeds to witness checks)', () => {
    // makeTx() produces a balanced tx (output = input - fee).
    // U10 must pass; only the witness check (W1/W2) may fire.
    const tx     = makeTx();
    const result = validator.validate(tx, fakeCbor());
    if (!result.ok) {
      expect(result.error).not.toMatch(/U10/);
    }
  });
});

describe('TransactionValidator — minFee calculation', () => {
  it('returns correct minFee', () => {
    const state     = makeState();
    const validator = new TransactionValidator(state, PROTOCOL_PARAMS);
    const expected  = BigInt(PROTOCOL_PARAMS.minFeeA) * 200n + BigInt(PROTOCOL_PARAMS.minFeeB);
    expect(validator.minFee(200)).toBe(expected);
  });

  it('minFee scales with tx size', () => {
    const state     = makeState();
    const validator = new TransactionValidator(state, PROTOCOL_PARAMS);
    const fee100    = validator.minFee(100);
    const fee200    = validator.minFee(200);
    expect(fee200).toBeGreaterThan(fee100);
  });
});
