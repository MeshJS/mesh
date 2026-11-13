import type {
  Asset,
  MultiAssetPrototype,
  ValuePrototype,
} from "@meshsdk/common";

import type { Assets } from "./parts/types";

/**
 * Lovelace and tokens with signed quantities, tokens keyed by unit (policy id followed by
 * asset name, in hex). Zero quantities are never stored.
 */
export type Value = { coin: bigint; assets: Map<string, bigint> };

export const emptyValue = (): Value => ({ coin: 0n, assets: new Map() });

export const coinValue = (coin: bigint): Value => ({ coin, assets: new Map() });

const addAsset = (assets: Map<string, bigint>, unit: string, n: bigint) => {
  const total = (assets.get(unit) ?? 0n) + n;
  if (total === 0n) assets.delete(unit);
  else assets.set(unit, total);
};

export const fromAssets = (amount: readonly Asset[]): Value => {
  const value = emptyValue();
  for (const { unit, quantity } of amount) {
    if (unit === "lovelace" || unit === "") value.coin += BigInt(quantity);
    else addAsset(value.assets, unit, BigInt(quantity));
  }
  return value;
};

/** The value of a UTxO, `Assets`, as a `Value` */
export const valueOf = (assets: Assets): Value => {
  const value = coinValue(assets.lovelace);
  for (const [unit, n] of Object.entries(assets))
    if (unit !== "lovelace") addAsset(value.assets, unit, n);
  return value;
};

/** A `Value` as `Assets`: lovelace first, then the tokens in the order of their units */
export const toAssets = (value: Value): Assets => {
  const assets: Record<string, bigint> = { lovelace: value.coin };
  for (const unit of Array.from(value.assets.keys()).sort()) {
    const n = value.assets.get(unit)!;
    if (n !== 0n) assets[unit] = n;
  }
  return assets as Assets;
};

export const fromMultiAsset = (
  multiasset: Readonly<MultiAssetPrototype> | null | undefined,
  coin = 0n,
): Value => {
  const value = coinValue(coin);
  for (const [policyId, assets] of Object.entries(multiasset ?? {})) {
    for (const [assetName, quantity] of Object.entries(assets)) {
      addAsset(value.assets, policyId + assetName, BigInt(quantity));
    }
  }
  return value;
};

export const fromValuePrototype = (value: Readonly<ValuePrototype>): Value =>
  fromMultiAsset(value.multiasset, BigInt(value.coin));

export const addValues = (...values: Value[]): Value => {
  const result = emptyValue();
  for (const value of values) {
    result.coin += value.coin;
    for (const [unit, n] of value.assets) addAsset(result.assets, unit, n);
  }
  return result;
};

export const negate = (value: Value): Value => ({
  coin: -value.coin,
  assets: new Map(Array.from(value.assets, ([unit, n]) => [unit, -n])),
});

export const subtractValues = (a: Value, b: Value): Value =>
  addValues(a, negate(b));

/** Tokens only, as a `MultiAssetPrototype` sorted by policy and name; undefined when none */
export const toMultiAsset = (
  assets: Map<string, bigint>,
): MultiAssetPrototype | undefined => {
  if (assets.size === 0) return undefined;
  const multiasset: MultiAssetPrototype = {};
  for (const unit of Array.from(assets.keys()).sort()) {
    (multiasset[unit.slice(0, 56)] ??= {})[unit.slice(56)] = assets
      .get(unit)!
      .toString();
  }
  return multiasset;
};

export const toValuePrototype = (value: Value): ValuePrototype => {
  const multiasset = toMultiAsset(value.assets);
  return { coin: value.coin.toString(), ...(multiasset && { multiasset }) };
};
