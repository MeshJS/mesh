import { DEFAULT_PROTOCOL_PARAMETERS, Protocol } from "@meshsdk/core";

import { output, TxBuilder, TxBuildError, Utxo } from "../../src/tx-builder";
import { bundleTokens } from "../../src/tx-builder/balance";
import { valueSize } from "../../src/tx-builder/fee";
import { toMultiAsset } from "../../src/tx-builder/value";
import { baseAddress } from "../test-util";

/** The largest lovelace quantity */
const MAX_COIN = (2n ** 64n - 1n).toString();

/**
 * The bundling as it was written first, measuring the whole bundle with the serializer for every
 * token: the reference the one-pass bundling must agree with
 */
const bundleAssets = (
  assets: Map<string, bigint>,
  maxValSize: number,
): Map<string, bigint>[] => {
  const bundles: Map<string, bigint>[] = [];
  let current = new Map<string, bigint>();
  const sizeOf = (bundle: Map<string, bigint>) =>
    valueSize({ coin: MAX_COIN, multiasset: toMultiAsset(bundle) });
  const fits = (bundle: Map<string, bigint>) => sizeOf(bundle) <= maxValSize;
  for (const unit of Array.from(assets.keys()).sort()) {
    const next = new Map(current).set(unit, assets.get(unit)!);
    if (current.size > 0 && !fits(next)) {
      bundles.push(current);
      current = new Map([[unit, assets.get(unit)!]]);
    } else current = next;
    if (!fits(current))
      throw new TxBuildError(
        "VALUE_TOO_LARGE",
        `token ${unit} does not fit in an output on its own`,
        { details: { size: sizeOf(current), maxValSize } },
      );
  }
  if (current.size > 0) bundles.push(current);
  return bundles;
};

/** A seeded generator of numbers in [0, 1) */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Random = ReturnType<typeof seeded>;

const below = (random: Random, n: number) => Math.floor(random() * n);

const randomHex = (random: Random, bytes: number) =>
  Array.from({ length: bytes }, () =>
    below(random, 256).toString(16).padStart(2, "0"),
  ).join("");

/** A random bigint in [low, high] */
const between = (random: Random, low: bigint, high: bigint) => {
  const span = high - low + 1n;
  let n = 0n;
  for (let i = 0; i < 5; i++) n = (n << 16n) | BigInt(below(random, 0x10000));
  return low + (n % span);
};

/**
 * A quantity from 1 to 2^64 - 1, of any length of encoding, at times on the bounds where its
 * encoding grows
 */
const randomQuantity = (random: Random): bigint => {
  const bounds = [1n, 23n, 24n, 255n, 256n, 65535n, 65536n];
  bounds.push(2n ** 32n - 1n, 2n ** 32n, 2n ** 64n - 1n);
  if (random() < 0.2) return bounds[below(random, bounds.length)]!;
  const tops = [23n, 255n, 65535n, 2n ** 32n - 1n, 2n ** 64n - 1n];
  return between(random, 1n, tops[below(random, tops.length)]!);
};

/** A name of 0 to 32 bytes, at times on the bound where its encoding grows */
const randomName = (random: Random) =>
  randomHex(
    random,
    random() < 0.2 ? [0, 23, 24, 32][below(random, 4)]! : below(random, 33),
  );

/** Random tokens: `count` of them under 1 to `policies` policies */
const randomTokens = (random: Random, count: number, policies: number) => {
  const ids = Array.from({ length: policies }, () => randomHex(random, 28));
  const tokens = new Map<string, bigint>();
  while (tokens.size < count)
    tokens.set(
      `${ids[below(random, ids.length)]}${randomName(random)}`,
      randomQuantity(random),
    );
  return tokens;
};

/** The bundles, or the error thrown, in a form the two bundlings can be compared in */
const outcome = (
  bundle: (assets: Map<string, bigint>, maxValSize: number) => unknown,
  assets: Map<string, bigint>,
  maxValSize: number,
) => {
  try {
    return {
      bundles: (bundle(assets, maxValSize) as Map<string, bigint>[]).map((b) =>
        Array.from(b),
      ),
    };
  } catch (error) {
    if (!(error instanceof TxBuildError)) throw error;
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
};

const agree = (assets: Map<string, bigint>, maxValSize: number) => {
  const expected = outcome(bundleAssets, assets, maxValSize);
  expect(outcome(bundleTokens, assets, maxValSize)).toEqual(expected);
  return expected;
};

describe("bundleTokens", () => {
  it("is no bundle for no token", () => {
    expect(bundleTokens(new Map(), 5000)).toEqual([]);
    agree(new Map(), 5000);
  });

  it("gives the bundles of the bundling that measures every token, over random tokens", () => {
    const random = seeded(0x5eed);
    const tally = {
      sets: 0,
      tokens: 0,
      bundles: 0,
      tooLarge: 0,
      mostPolicies: 0,
      mostNames: 0,
    };
    const run = (count: number, policies: number, maxValSize: number) => {
      const result = agree(randomTokens(random, count, policies), maxValSize);
      tally.sets++;
      tally.tokens += count;
      if (!("bundles" in result)) tally.tooLarge++;
      for (const bundle of result.bundles ?? []) {
        tally.bundles++;
        const names = new Map<string, number>();
        for (const [unit] of bundle)
          names.set(unit.slice(0, 56), (names.get(unit.slice(0, 56)) ?? 0) + 1);
        tally.mostPolicies = Math.max(tally.mostPolicies, names.size);
        tally.mostNames = Math.max(tally.mostNames, ...names.values());
      }
    };
    // Around the limit of one bundle at the mainnet size
    for (let i = 0; i < 40; i++)
      run(40 + below(random, 300), 1 + below(random, 40), 5000);
    // Far above it
    for (let i = 0; i < 2; i++)
      run(800 + below(random, 400), 1 + below(random, 300), 5000);
    // A policy for almost every token, at a large limit: the map of policies grows past 255
    run(350 + below(random, 100), 2000, 20000);
    // One policy, at a large limit: its map of names grows past 255
    run(400 + below(random, 200), 1, 20000);
    // Small limits, some too small for a token on its own
    for (let i = 0; i < 150; i++)
      run(1 + below(random, 12), 1 + below(random, 4), 60 + below(random, 120));
    expect(tally.sets).toBe(194);
    expect(tally.tokens).toBeGreaterThan(10_000);
    expect(tally.bundles).toBeGreaterThan(400);
    expect(tally.tooLarge).toBeGreaterThan(10);
    expect(tally.mostPolicies).toBeGreaterThan(255);
    expect(tally.mostNames).toBeGreaterThan(255);
  }, 120_000);

  it("is VALUE_TOO_LARGE with the size of a token that does not fit on its own", () => {
    const unit = `${"ab".repeat(28)}${"cd".repeat(32)}`;
    const assets = new Map([
      [`${"ab".repeat(28)}01`, 1n],
      [unit, 2n ** 64n - 1n],
    ]);
    const size = valueSize({
      coin: MAX_COIN,
      multiasset: toMultiAsset(new Map([[unit, 2n ** 64n - 1n]])),
    });
    expect(agree(assets, size - 1)).toEqual({
      code: "VALUE_TOO_LARGE",
      message: `token ${unit} does not fit in an output on its own`,
      details: { size, maxValSize: size - 1 },
    });
    expect(agree(assets, size).bundles).toHaveLength(2);
  });

  it("builds a change of 3600 tokens in a fraction of the time it took", async () => {
    const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
    const builder = new TxBuilder({ network: "preprod", params });
    const address = baseAddress(1);
    const policy = "ee".repeat(28);
    let k = 0;
    const utxos: Utxo[] = Array.from({ length: 300 }, (_, i) => {
      const value: Record<string, bigint> = { lovelace: 3_000_000n };
      for (let j = 0; j < 12; j++)
        value[`${policy}${(k++).toString(16).padStart(8, "0")}`] = 1n;
      return {
        txHash: (0x5000 + i).toString(16).padStart(64, "c"),
        outputIndex: 0,
        address,
        value: value as Utxo["value"],
      };
    });
    const started = Date.now();
    const error = await builder
      .build(
        [
          output({
            address: baseAddress(2),
            value: { lovelace: 600_000_000n },
          }),
        ],
        { payer: { changeAddress: address, utxos } },
      )
      .catch((e: unknown) => e);
    const took = Date.now() - started;
    expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
    // About a quarter of a second; the bundling that measured every token took over 15 s
    expect(took).toBeLessThan(3000);
  }, 60_000);
});
