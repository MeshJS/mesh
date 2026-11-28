import type { Utxo } from "../../../src/tx-builder";

// Small helpers of the plan tests: hashes and outputs made from numbers, a deep freeze, and a
// seeded random source.

/** A 32-byte hash from a number */
export const hash = (n: number) => n.toString(16).padStart(64, "0");

/** A 28-byte key hash from a number */
export const keyHash = (n: number) => n.toString(16).padStart(56, "a");

const ADDRESS =
  "addr_test1qpq6xvp5y4fw0wfgxfqmn78qqagkpv4q7qpqyz8s8x3snp5n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgsc3xk2w";

/** An output of `txHash` at `outputIndex`, holding some ada */
export const utxo = (txHash: string, outputIndex = 0): Utxo => ({
  txHash,
  outputIndex,
  address: ADDRESS,
  value: { lovelace: 5_000_000n },
});

/** Freezes the value in place, all the way down, and returns it; nothing is copied */
export const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value))
      deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
};

/** A small seeded generator, so that a failing run can be repeated from its seed */
export const seeded = (seed: number) => {
  let state = seed >>> 0 || 1;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    chance: (p: number) => next() < p,
    pick: <T>(items: readonly T[]): T => items[int(items.length)]!,
  };
};
export type Random = ReturnType<typeof seeded>;
