import { Cardano, Serialization } from "@cardano-sdk/core";

export function mergeValue(
  a: Serialization.Value,
  b: Serialization.Value,
): Serialization.Value {
  const ma = a.multiasset() ?? new Map();
  b.multiasset()?.forEach((v, k) => {
    const newVal = (ma.get(k) ?? 0n) + v;
    if (newVal == 0n) {
      ma.delete(k);
    } else {
      ma.set(k, newVal);
    }
  });
  return new Serialization.Value(
    BigInt(a.coin()) + BigInt(b.coin()),
    ma.size > 0 ? ma : undefined,
  );
}

export function negateValue(v: Serialization.Value): Serialization.Value {
  const entries = v.multiasset()?.entries();
  const tokenMap: Cardano.TokenMap = new Map();
  if (entries) {
    for (const entry of entries) {
      tokenMap.set(entry[0], -entry[1]);
    }
  }
  return new Serialization.Value(-v.coin(), tokenMap);
}

export function subValue(
  a: Serialization.Value,
  b: Serialization.Value,
): Serialization.Value {
  return mergeValue(a, negateValue(b));
}

export function negatives(v: Serialization.Value): Serialization.Value {
  const entries = v.multiasset()?.entries();
  const coin = v.coin() < 0n ? v.coin() : 0n;
  const tokenMap: Cardano.TokenMap = new Map();
  if (entries) {
    for (const entry of entries) {
      if (entry[1] < 0n) {
        tokenMap.set(entry[0], entry[1]);
      }
    }
  }
  return new Serialization.Value(coin, tokenMap);
}

export function assetTypes(v: Serialization.Value): number {
  let count = v.coin() == 0n ? 0 : 1;
  const entries = v.multiasset();
  if (entries) {
    entries.forEach(() => {
      count += 1;
    });
  }
  return count;
}

export function empty(v: Serialization.Value): boolean {
  return assetTypes(v) == 0;
}
