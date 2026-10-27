/**
 * Cardano ledger value arithmetic.
 *
 * Value = { lovelace: bigint; assets?: MultiAsset }
 * MultiAsset = PolicyId(hex) → AssetName(hex) → quantity(bigint)
 *
 * Key invariants enforced by U10:
 *   - Lovelace cannot be minted or burned: inputs_lovelace == outputs_lovelace + fee
 *   - Multi-asset tokens CAN be minted (+) or burned (−):
 *     inputs_assets + minted == outputs_assets
 *   - Zero-quantity entries are semantically absent (filtered before compare)
 *
 * References:
 *   cardano-ledger babbage/impl: Cardano.Ledger.Babbage.Rules.Utxo (preserveValue)
 *   pallas pallas-primitives/src/alonzo/model.rs (Value)
 */

import type { Value, MultiAsset, TxOutput } from '../types.js';

// ── Aggregation ───────────────────────────────────────────────────────────────

export function sumLovelace(values: Value[]): bigint {
  return values.reduce((acc, v) => acc + v.lovelace, 0n);
}

export function sumMultiAsset(values: Value[]): MultiAsset {
  const result: MultiAsset = {};
  for (const v of values) {
    if (!v.assets) continue;
    for (const [pid, assets] of Object.entries(v.assets)) {
      if (!result[pid]) result[pid] = {};
      for (const [name, qty] of Object.entries(assets)) {
        result[pid]![name] = (result[pid]![name] ?? 0n) + qty;
      }
    }
  }
  return result;
}

/** Combine two MultiAsset maps (handles negative quantities for token burning). */
export function addMultiAssets(a: MultiAsset, b: MultiAsset): MultiAsset {
  const result: MultiAsset = {};
  for (const [pid, assets] of Object.entries(a)) {
    result[pid] = { ...assets };
  }
  for (const [pid, assets] of Object.entries(b)) {
    if (!result[pid]) result[pid] = {};
    for (const [name, qty] of Object.entries(assets)) {
      result[pid]![name] = (result[pid]![name] ?? 0n) + qty;
    }
  }
  return result;
}

/**
 * Deep-equality of two MultiAsset maps.
 * Zero-quantity entries are treated as absent.
 */
export function multiAssetEq(a: MultiAsset, b: MultiAsset): boolean {
  const na = filterNonZero(a);
  const nb = filterNonZero(b);

  const pidsA = Object.keys(na).sort();
  const pidsB = Object.keys(nb).sort();
  if (pidsA.length !== pidsB.length || pidsA.some((p, i) => p !== pidsB[i])) return false;

  for (const pid of pidsA) {
    const aAssets = na[pid]!;
    const bAssets = nb[pid] ?? {};
    const namesA  = Object.keys(aAssets).sort();
    const namesB  = Object.keys(bAssets).sort();
    if (namesA.length !== namesB.length || namesA.some((n, i) => n !== namesB[i])) return false;
    for (const name of namesA) {
      if (aAssets[name] !== bAssets[name]) return false;
    }
  }
  return true;
}

function filterNonZero(ma: MultiAsset): MultiAsset {
  const result: MultiAsset = {};
  for (const [pid, assets] of Object.entries(ma)) {
    const filtered: Record<string, bigint> = {};
    for (const [name, qty] of Object.entries(assets)) {
      if (qty !== 0n) filtered[name] = qty;
    }
    if (Object.keys(filtered).length > 0) result[pid] = filtered;
  }
  return result;
}

// ── Protocol calculations ─────────────────────────────────────────────────────

/**
 * minFee = minFeeA * txBytes + minFeeB
 * Reference: cardano-ledger shelley/impl: Cardano.Ledger.Shelley.Rules.Utxo
 */
export function computeMinFee(minFeeA: number, minFeeB: number, txSizeBytes: number): bigint {
  return BigInt(minFeeA) * BigInt(txSizeBytes) + BigInt(minFeeB);
}

/**
 * minADA = coinsPerUTxOByte × (160 + estimatedOutputCborSize)
 *
 * 160 bytes is the fixed UTxO entry overhead in Conway.
 * We approximate the output CBOR size rather than doing a real encode,
 * which can be off by a few bytes for pathological multi-asset outputs.
 *
 * Reference: cardano-ledger babbage/impl: Cardano.Ledger.Babbage.Rules.Utxo (coinsPerUTxOByteOrWord8)
 */
export function computeMinAda(coinsPerUTxOByte: number, output: TxOutput): bigint {
  const UTXO_OVERHEAD = 160;
  return BigInt(coinsPerUTxOByte) * BigInt(UTXO_OVERHEAD + estimateOutputSize(output));
}

export function estimateOutputSize(output: TxOutput): number {
  const addrBytes    = output.addressHex.length / 2;
  const lovelaceSize = 9;
  let assetSize      = 0;
  if (output.value.assets) {
    for (const [, assets] of Object.entries(output.value.assets)) {
      assetSize += 34;
      for (const [name] of Object.entries(assets)) {
        assetSize += name.length / 2 + 9;
      }
    }
  }
  const datumSize = output.dataHash ? 34 : output.plutusData ? output.plutusData.length / 2 + 2 : 0;
  return addrBytes + lovelaceSize + assetSize + datumSize + 10;
}
