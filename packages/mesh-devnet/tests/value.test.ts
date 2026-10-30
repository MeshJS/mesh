/**
 * Value arithmetic tests.
 *
 * Covers sumLovelace, sumMultiAsset, addMultiAssets (including burn/negative),
 * multiAssetEq (zero-filtering invariant), computeMinFee, computeMinAda.
 */

import { describe, it, expect } from 'vitest';
import type { Value, MultiAsset, TxOutput } from '../src/types.js';
import { valueToMeshAssets } from '../src/types.js';
import {
  sumLovelace,
  sumMultiAsset,
  addMultiAssets,
  multiAssetEq,
  computeMinFee,
  computeMinAda,
  estimateOutputSize,
} from '../src/ledger/value.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PID_A = 'aa'.repeat(28);
const PID_B = 'bb'.repeat(28);
const TOKEN_X = Buffer.from('tokenX').toString('hex');
const TOKEN_Y = Buffer.from('tokenY').toString('hex');

function makeOutput(lovelace: bigint, assets?: MultiAsset): TxOutput {
  const value: Value = { lovelace, assets };
  return {
    address:    'addr_test1...',
    amount:     valueToMeshAssets(value),
    addressHex: '60' + 'aa'.repeat(28),
    value,
  };
}

// ── sumLovelace ───────────────────────────────────────────────────────────────

describe('sumLovelace', () => {
  it('empty array → 0n', () => {
    expect(sumLovelace([])).toBe(0n);
  });

  it('single value', () => {
    expect(sumLovelace([{ lovelace: 5_000_000n }])).toBe(5_000_000n);
  });

  it('multiple values sum correctly', () => {
    const values: Value[] = [
      { lovelace: 1_000_000n },
      { lovelace: 2_000_000n },
      { lovelace: 3_000_000n },
    ];
    expect(sumLovelace(values)).toBe(6_000_000n);
  });

  it('ignores assets field', () => {
    const values: Value[] = [
      { lovelace: 1_000_000n, assets: { [PID_A]: { [TOKEN_X]: 100n } } },
      { lovelace: 2_000_000n },
    ];
    expect(sumLovelace(values)).toBe(3_000_000n);
  });
});

// ── sumMultiAsset ─────────────────────────────────────────────────────────────

describe('sumMultiAsset', () => {
  it('empty array → empty object', () => {
    expect(sumMultiAsset([])).toEqual({});
  });

  it('values with no assets → empty object', () => {
    expect(sumMultiAsset([{ lovelace: 1_000n }, { lovelace: 2_000n }])).toEqual({});
  });

  it('sums quantities for same policy+name', () => {
    const values: Value[] = [
      { lovelace: 0n, assets: { [PID_A]: { [TOKEN_X]: 10n } } },
      { lovelace: 0n, assets: { [PID_A]: { [TOKEN_X]: 5n } } },
    ];
    const result = sumMultiAsset(values);
    expect(result[PID_A]?.[TOKEN_X]).toBe(15n);
  });

  it('merges multiple policies', () => {
    const values: Value[] = [
      { lovelace: 0n, assets: { [PID_A]: { [TOKEN_X]: 10n } } },
      { lovelace: 0n, assets: { [PID_B]: { [TOKEN_Y]: 20n } } },
    ];
    const result = sumMultiAsset(values);
    expect(result[PID_A]?.[TOKEN_X]).toBe(10n);
    expect(result[PID_B]?.[TOKEN_Y]).toBe(20n);
  });

  it('merges multiple token names under same policy', () => {
    const values: Value[] = [
      { lovelace: 0n, assets: { [PID_A]: { [TOKEN_X]: 3n, [TOKEN_Y]: 7n } } },
      { lovelace: 0n, assets: { [PID_A]: { [TOKEN_X]: 2n } } },
    ];
    const result = sumMultiAsset(values);
    expect(result[PID_A]?.[TOKEN_X]).toBe(5n);
    expect(result[PID_A]?.[TOKEN_Y]).toBe(7n);
  });
});

// ── addMultiAssets ────────────────────────────────────────────────────────────

describe('addMultiAssets', () => {
  it('empty + empty = empty', () => {
    expect(addMultiAssets({}, {})).toEqual({});
  });

  it('non-overlapping policies merge', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_B]: { [TOKEN_Y]: 20n } };
    const result = addMultiAssets(a, b);
    expect(result[PID_A]?.[TOKEN_X]).toBe(10n);
    expect(result[PID_B]?.[TOKEN_Y]).toBe(20n);
  });

  it('overlapping quantities are summed', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: 5n } };
    const result = addMultiAssets(a, b);
    expect(result[PID_A]?.[TOKEN_X]).toBe(15n);
  });

  it('negative b (burning) produces net quantity', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: -3n } };
    const result = addMultiAssets(a, b);
    expect(result[PID_A]?.[TOKEN_X]).toBe(7n);
  });

  it('burning all tokens produces zero quantity (not absent)', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 5n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: -5n } };
    const result = addMultiAssets(a, b);
    expect(result[PID_A]?.[TOKEN_X]).toBe(0n);
  });

  it('minting only (a=empty, b=positive) works', () => {
    const minted: MultiAsset = { [PID_A]: { [TOKEN_X]: 100n } };
    const result = addMultiAssets({}, minted);
    expect(result[PID_A]?.[TOKEN_X]).toBe(100n);
  });

  it('does not mutate inputs', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: 5n } };
    addMultiAssets(a, b);
    expect(a[PID_A]![TOKEN_X]).toBe(10n);
  });
});

// ── multiAssetEq ──────────────────────────────────────────────────────────────

describe('multiAssetEq', () => {
  it('empty == empty', () => {
    expect(multiAssetEq({}, {})).toBe(true);
  });

  it('equal non-empty maps', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    expect(multiAssetEq(a, b)).toBe(true);
  });

  it('different quantities → false', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: 11n } };
    expect(multiAssetEq(a, b)).toBe(false);
  });

  it('different policies → false', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const b: MultiAsset = { [PID_B]: { [TOKEN_X]: 10n } };
    expect(multiAssetEq(a, b)).toBe(false);
  });

  it('zero-quantity entry equals empty (U10 invariant)', () => {
    const withZero: MultiAsset = { [PID_A]: { [TOKEN_X]: 0n } };
    expect(multiAssetEq(withZero, {})).toBe(true);
    expect(multiAssetEq({}, withZero)).toBe(true);
  });

  it('zero-quantity token is ignored when comparing', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 5n, [TOKEN_Y]: 0n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: 5n } };
    expect(multiAssetEq(a, b)).toBe(true);
  });

  it('policy with only zero-quantity tokens is absent', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 0n } };
    const b: MultiAsset = { [PID_B]: { [TOKEN_Y]: 1n } };
    expect(multiAssetEq(a, b)).toBe(false);
  });

  it('extra token name → false', () => {
    const a: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n, [TOKEN_Y]: 5n } };
    const b: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    expect(multiAssetEq(a, b)).toBe(false);
  });
});

// ── U10 value preservation via addMultiAssets + multiAssetEq ─────────────────

describe('U10 burn/mint accounting', () => {
  it('inputs + mint = outputs (simple mint)', () => {
    const inputAssets: MultiAsset  = {};
    const minted: MultiAsset       = { [PID_A]: { [TOKEN_X]: 100n } };
    const outputAssets: MultiAsset = { [PID_A]: { [TOKEN_X]: 100n } };
    const available = addMultiAssets(inputAssets, minted);
    expect(multiAssetEq(available, outputAssets)).toBe(true);
  });

  it('inputs + burn = outputs (partial burn)', () => {
    const inputAssets: MultiAsset  = { [PID_A]: { [TOKEN_X]: 50n } };
    const burned: MultiAsset       = { [PID_A]: { [TOKEN_X]: -20n } };
    const outputAssets: MultiAsset = { [PID_A]: { [TOKEN_X]: 30n } };
    const available = addMultiAssets(inputAssets, burned);
    expect(multiAssetEq(available, outputAssets)).toBe(true);
  });

  it('complete burn: inputs + (−inputs) = empty = empty outputs', () => {
    const inputAssets: MultiAsset = { [PID_A]: { [TOKEN_X]: 10n } };
    const burned: MultiAsset      = { [PID_A]: { [TOKEN_X]: -10n } };
    const available = addMultiAssets(inputAssets, burned);
    expect(multiAssetEq(available, {})).toBe(true);
  });
});

// ── computeMinFee ─────────────────────────────────────────────────────────────

describe('computeMinFee', () => {
  it('computes minFeeA * txBytes + minFeeB', () => {
    expect(computeMinFee(44, 155_381, 200)).toBe(44n * 200n + 155_381n);
  });

  it('scales linearly with tx size', () => {
    const fee100 = computeMinFee(44, 155_381, 100);
    const fee200 = computeMinFee(44, 155_381, 200);
    expect(fee200 - fee100).toBe(44n * 100n);
  });

  it('zero tx size → flat fee only', () => {
    expect(computeMinFee(44, 155_381, 0)).toBe(155_381n);
  });
});

// ── computeMinAda + estimateOutputSize ────────────────────────────────────────

describe('computeMinAda', () => {
  const COINS_PER_BYTE = 4_310;

  it('lovelace-only output → positive minADA', () => {
    const out = makeOutput(2_000_000n);
    const min = computeMinAda(COINS_PER_BYTE, out);
    expect(min).toBeGreaterThan(0n);
  });

  it('output with multi-asset → higher minADA than lovelace-only', () => {
    const plain = makeOutput(2_000_000n);
    const withToken = makeOutput(2_000_000n, { [PID_A]: { [TOKEN_X]: 1n } });
    expect(computeMinAda(COINS_PER_BYTE, withToken)).toBeGreaterThan(
      computeMinAda(COINS_PER_BYTE, plain),
    );
  });

  it('output with inline datum → higher minADA than without', () => {
    const plain = makeOutput(2_000_000n);
    const withDatum: TxOutput = {
      ...makeOutput(2_000_000n),
      plutusData: '01'.repeat(64), // 64-byte datum
    };
    expect(computeMinAda(COINS_PER_BYTE, withDatum)).toBeGreaterThan(
      computeMinAda(COINS_PER_BYTE, plain),
    );
  });

  it('output with datum hash → higher minADA than without', () => {
    const plain = makeOutput(2_000_000n);
    const withHash: TxOutput = {
      ...makeOutput(2_000_000n),
      dataHash: 'ab'.repeat(32),
    };
    expect(computeMinAda(COINS_PER_BYTE, withHash)).toBeGreaterThan(
      computeMinAda(COINS_PER_BYTE, plain),
    );
  });

  it('minADA is proportional to coinsPerUTxOByte', () => {
    const out = makeOutput(2_000_000n);
    const min1 = computeMinAda(4_310, out);
    const min2 = computeMinAda(8_620, out);
    expect(min2).toBe(min1 * 2n);
  });
});

describe('estimateOutputSize', () => {
  it('increases with asset count', () => {
    const plain = makeOutput(2_000_000n);
    const with1 = makeOutput(2_000_000n, { [PID_A]: { [TOKEN_X]: 1n } });
    const with2 = makeOutput(2_000_000n, { [PID_A]: { [TOKEN_X]: 1n }, [PID_B]: { [TOKEN_Y]: 1n } });
    expect(estimateOutputSize(with1)).toBeGreaterThan(estimateOutputSize(plain));
    expect(estimateOutputSize(with2)).toBeGreaterThan(estimateOutputSize(with1));
  });

  it('returns a positive integer', () => {
    const size = estimateOutputSize(makeOutput(2_000_000n));
    expect(size).toBeGreaterThan(0);
    expect(Number.isInteger(size)).toBe(true);
  });
});
