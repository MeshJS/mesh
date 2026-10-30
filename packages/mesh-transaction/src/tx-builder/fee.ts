import type {
  Protocol,
  TransactionOutputPrototype,
  ValuePrototype,
} from "@meshsdk/common";
import {
  transactionOutputPrototypeToCardano,
  valuePrototypeToCardano,
} from "@meshsdk/core-cst";

/** A non-negative rational number */
type Ratio = { n: bigint; d: bigint };

/**
 * A protocol parameter given as a decimal number (e.g. a price of `0.0577`), as the exact
 * ratio it stands for.
 */
export const toRatio = (value: number | string): Ratio => {
  const text = String(value).trim().toLowerCase();
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error(`invalid protocol parameter ${value}`);
  const [, whole, fraction = "", exponent = "0"] = match;
  let n = BigInt(whole! + fraction);
  let d = 10n ** BigInt(fraction.length);
  const e = Number(exponent);
  if (e > 0) n *= 10n ** BigInt(e);
  else d *= 10n ** BigInt(-e);
  return { n, d };
};

const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;

/** Size of the reference script fee's tiers, in bytes */
const REF_SCRIPT_TIER_SIZE = 25_600n;

/**
 * The fee for the reference scripts of the transaction's inputs and reference inputs, as the
 * ledger works it out: each 25 KiB tier costs 1.2 times the previous one per byte, and the
 * total is rounded down.
 * @param size Total size of the reference scripts, in bytes
 * @param pricePerByte The `minFeeRefScriptCostPerByte` protocol parameter
 */
export const refScriptFee = (
  size: bigint,
  pricePerByte: number | string,
): bigint => {
  const base = toRatio(pricePerByte);
  // acc and the tier price share the denominator d
  let price = base.n;
  let d = base.d;
  let acc = 0n;
  let rest = size;
  while (rest >= REF_SCRIPT_TIER_SIZE) {
    acc += REF_SCRIPT_TIER_SIZE * price;
    // price *= 6/5, keeping one denominator for both
    price *= 6n;
    acc *= 5n;
    d *= 5n;
    rest -= REF_SCRIPT_TIER_SIZE;
  }
  return (acc + rest * price) / d;
};

/** The fee for execution units, rounded up once for the whole transaction */
export const exUnitsFee = (
  mem: bigint,
  steps: bigint,
  params: Pick<Protocol, "priceMem" | "priceStep">,
): bigint => {
  const memPrice = toRatio(params.priceMem);
  const stepPrice = toRatio(params.priceStep);
  return ceilDiv(
    mem * memPrice.n * stepPrice.d + steps * stepPrice.n * memPrice.d,
    memPrice.d * stepPrice.d,
  );
};

/**
 * The minimum fee of a transaction.
 * @param txSize Size of the transaction with all its witnesses, in bytes
 * @param refScriptSize Total size of the reference scripts its inputs and reference inputs hold
 * @param exUnits Total execution units of its redeemers
 */
export const minFee = (
  txSize: number,
  refScriptSize: bigint,
  exUnits: { mem: bigint; steps: bigint },
  params: Protocol,
): bigint =>
  BigInt(params.minFeeA) * BigInt(txSize) +
  BigInt(params.minFeeB) +
  refScriptFee(refScriptSize, params.minFeeRefScriptCostPerByte) +
  exUnitsFee(exUnits.mem, exUnits.steps, params);

/** Bytes the ledger adds to an output's size when pricing its storage */
const OUTPUT_OVERHEAD = 160n;

export const outputSize = (output: TransactionOutputPrototype): number =>
  transactionOutputPrototypeToCardano(output).toCbor().length / 2;

export const valueSize = (value: ValuePrototype): number =>
  valuePrototypeToCardano(value).toCbor().length / 2;

/**
 * The least lovelace an output must hold: `(160 + size) * coinsPerUtxoSize`, where the size
 * counts the lovelace itself. Starts from the output's own lovelace and grows it until it
 * covers its own size.
 */
export const minCoin = (
  output: TransactionOutputPrototype,
  coinsPerUtxoSize: number,
): bigint => {
  const perByte = BigInt(coinsPerUtxoSize);
  let coin = 0n;
  for (;;) {
    const size = outputSize({
      ...output,
      amount: { ...output.amount, coin: coin.toString() },
    });
    const required = (OUTPUT_OVERHEAD + BigInt(size)) * perByte;
    if (required <= coin) return required;
    coin = required;
  }
};

/** Whether an output holds at least the lovelace its own size requires */
export const coversMinCoin = (
  output: TransactionOutputPrototype,
  coinsPerUtxoSize: number,
): boolean =>
  BigInt(output.amount.coin) >=
  (OUTPUT_OVERHEAD + BigInt(outputSize(output))) * BigInt(coinsPerUtxoSize);
