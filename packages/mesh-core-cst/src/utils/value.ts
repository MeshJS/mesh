import { TokenMap, Value } from "../types";

export function mergeValue(a: Value, b: Value): Value {
  const ma = a.multiasset() ?? new Map();
  b.multiasset()?.forEach((v, k) => {
    const newVal = (ma.get(k) ?? 0n) + v;
    if (newVal == 0n) {
      ma.delete(k);
    } else {
      ma.set(k, newVal);
    }
  });
  return new Value(
    BigInt(a.coin()) + BigInt(b.coin()),
    ma.size > 0 ? ma : undefined,
  );
}

export function negateValue(v: Value): Value {
  const entries = v.multiasset()?.entries();
  const tokenMap: TokenMap = new Map();
  if (entries) {
    for (const entry of entries) {
      tokenMap.set(entry[0], -entry[1]);
    }
  }
  return new Value(-v.coin(), tokenMap);
}

export function subValue(a: Value, b: Value): Value {
  return mergeValue(a, negateValue(b));
}

export function negatives(v: Value): Value {
  const entries = v.multiasset()?.entries();
  const coin = v.coin() < 0n ? v.coin() : 0n;
  const tokenMap: TokenMap = new Map();
  if (entries) {
    for (const entry of entries) {
      if (entry[1] < 0n) {
        tokenMap.set(entry[0], entry[1]);
      }
    }
  }
  return new Value(coin, tokenMap);
}

export function assetTypes(v: Value): number {
  let count = v.coin() == 0n ? 0 : 1;
  const entries = v.multiasset();
  if (entries) {
    entries.forEach(() => {
      count += 1;
    });
  }
  return count;
}

export function empty(v: Value): boolean {
  return assetTypes(v) == 0;
}
