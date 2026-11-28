/**
 * Address byte utility tests.
 *
 * Validates paymentKeyHashOfAddress / scriptHashOfAddress / addressTypeNibble /
 * networkIdOfAddress against all Shelley type nibbles (0–8) and edge cases.
 *
 * Address layout (Shelley, CIP-19):
 *   byte 0     = header: bits [7:4] = type nibble, bits [3:0] = network id
 *   bytes 1-28 = payment credential (pkh or script hash)
 *   bytes 29-56= stake credential  (base addresses only)
 */

import { describe, it, expect } from 'vitest';
import {
  paymentKeyHashOfAddress,
  scriptHashOfAddress,
  addressTypeNibble,
  networkIdOfAddress,
} from '../src/ledger/address.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PAY_HASH  = 'aa'.repeat(28); // 28-byte payment hash placeholder
const STAKE_HASH = 'bb'.repeat(28); // 28-byte stake hash placeholder

/** Build a minimal Shelley address hex with given type nibble and network id. */
function makeAddr(typeNibble: number, networkId = 0, withStake = false): string {
  const header = ((typeNibble & 0xf) << 4) | (networkId & 0xf);
  const headerHex = header.toString(16).padStart(2, '0');
  return withStake
    ? headerHex + PAY_HASH + STAKE_HASH
    : headerHex + PAY_HASH;
}

// ── paymentKeyHashOfAddress ───────────────────────────────────────────────────

describe('paymentKeyHashOfAddress', () => {
  it('type 0 (base key+key) → 28-byte payment key hash', () => {
    const result = paymentKeyHashOfAddress(makeAddr(0, 0, true));
    expect(result).toBe(PAY_HASH);
  });

  it('type 2 (base key+script) → 28-byte payment key hash', () => {
    const result = paymentKeyHashOfAddress(makeAddr(2, 0, true));
    expect(result).toBe(PAY_HASH);
  });

  it('type 4 (pointer key) → 28-byte payment key hash', () => {
    const result = paymentKeyHashOfAddress(makeAddr(4));
    expect(result).toBe(PAY_HASH);
  });

  it('type 6 (enterprise key) → 28-byte payment key hash', () => {
    const result = paymentKeyHashOfAddress(makeAddr(6));
    expect(result).toBe(PAY_HASH);
  });

  it('type 1 (base script+key) → null (script payment)', () => {
    expect(paymentKeyHashOfAddress(makeAddr(1, 0, true))).toBeNull();
  });

  it('type 3 (base script+script) → null', () => {
    expect(paymentKeyHashOfAddress(makeAddr(3, 0, true))).toBeNull();
  });

  it('type 5 (pointer script) → null', () => {
    expect(paymentKeyHashOfAddress(makeAddr(5))).toBeNull();
  });

  it('type 7 (enterprise script) → null', () => {
    expect(paymentKeyHashOfAddress(makeAddr(7))).toBeNull();
  });

  it('type 8 (Byron) → null', () => {
    expect(paymentKeyHashOfAddress(makeAddr(8))).toBeNull();
  });

  it('empty string → null (parse error)', () => {
    expect(paymentKeyHashOfAddress('')).toBeNull();
  });

  it('non-hex string → null', () => {
    expect(paymentKeyHashOfAddress('not-hex!')).toBeNull();
  });

  it('returned hash is exactly 56 hex chars (28 bytes)', () => {
    const result = paymentKeyHashOfAddress(makeAddr(6));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(56);
  });
});

// ── scriptHashOfAddress ───────────────────────────────────────────────────────

describe('scriptHashOfAddress', () => {
  it('type 1 (base script+key) → 28-byte script hash', () => {
    const result = scriptHashOfAddress(makeAddr(1, 0, true));
    expect(result).toBe(PAY_HASH);
  });

  it('type 3 (base script+script) → 28-byte script hash', () => {
    const result = scriptHashOfAddress(makeAddr(3, 0, true));
    expect(result).toBe(PAY_HASH);
  });

  it('type 5 (pointer script) → 28-byte script hash', () => {
    const result = scriptHashOfAddress(makeAddr(5));
    expect(result).toBe(PAY_HASH);
  });

  it('type 7 (enterprise script) → 28-byte script hash', () => {
    const result = scriptHashOfAddress(makeAddr(7));
    expect(result).toBe(PAY_HASH);
  });

  it('type 0 (base key+key) → null (key payment)', () => {
    expect(scriptHashOfAddress(makeAddr(0, 0, true))).toBeNull();
  });

  it('type 2 (base key+script) → null', () => {
    expect(scriptHashOfAddress(makeAddr(2, 0, true))).toBeNull();
  });

  it('type 6 (enterprise key) → null', () => {
    expect(scriptHashOfAddress(makeAddr(6))).toBeNull();
  });

  it('type 8 (Byron) → null', () => {
    expect(scriptHashOfAddress(makeAddr(8))).toBeNull();
  });

  it('empty string → null', () => {
    expect(scriptHashOfAddress('')).toBeNull();
  });

  it('returned hash is exactly 56 hex chars', () => {
    const result = scriptHashOfAddress(makeAddr(7));
    expect(result!.length).toBe(56);
  });
});

// ── addressTypeNibble ─────────────────────────────────────────────────────────

describe('addressTypeNibble', () => {
  it.each([
    [0, 'base key+key'],
    [1, 'base script+key'],
    [2, 'base key+script'],
    [3, 'base script+script'],
    [4, 'pointer key'],
    [5, 'pointer script'],
    [6, 'enterprise key'],
    [7, 'enterprise script'],
    [8, 'Byron'],
  ])('type nibble %i (%s)', (nibble, _label) => {
    expect(addressTypeNibble(makeAddr(nibble))).toBe(nibble);
  });

  it('empty string → null', () => {
    expect(addressTypeNibble('')).toBeNull();
  });
});

// ── networkIdOfAddress ────────────────────────────────────────────────────────

describe('networkIdOfAddress', () => {
  it('low nibble 0 → testnet (0)', () => {
    expect(networkIdOfAddress(makeAddr(6, 0))).toBe(0);
  });

  it('low nibble 1 → mainnet (1)', () => {
    expect(networkIdOfAddress(makeAddr(6, 1))).toBe(1);
  });

  it('type 8 (Byron) → null (no network nibble)', () => {
    expect(networkIdOfAddress(makeAddr(8, 0))).toBeNull();
  });

  it('enterprise script mainnet → 1', () => {
    expect(networkIdOfAddress(makeAddr(7, 1))).toBe(1);
  });

  it('base address testnet → 0', () => {
    expect(networkIdOfAddress(makeAddr(0, 0, true))).toBe(0);
  });

  it('empty string → null', () => {
    expect(networkIdOfAddress('')).toBeNull();
  });
});

// ── Consistency: paymentKeyHash and scriptHash are mutually exclusive ─────────

describe('paymentKeyHash / scriptHash mutual exclusivity', () => {
  it.each([0, 2, 4, 6])('key-payment type %i: pkh set, scriptHash null', (t) => {
    const addr = makeAddr(t, 0, t < 4);
    expect(paymentKeyHashOfAddress(addr)).not.toBeNull();
    expect(scriptHashOfAddress(addr)).toBeNull();
  });

  it.each([1, 3, 5, 7])('script-payment type %i: scriptHash set, pkh null', (t) => {
    const addr = makeAddr(t, 0, t < 4);
    expect(scriptHashOfAddress(addr)).not.toBeNull();
    expect(paymentKeyHashOfAddress(addr)).toBeNull();
  });
});
