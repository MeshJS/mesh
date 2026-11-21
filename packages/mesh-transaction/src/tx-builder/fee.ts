import type {
  Protocol,
  TransactionBodyPrototype,
  TransactionOutputPrototype,
  TransactionPrototype,
  ValuePrototype,
} from "@meshsdk/common";
import {
  transactionOutputPrototypeToCardano,
  transactionPrototypeToHex,
  valuePrototypeToCardano,
} from "@meshsdk/core-cst";

import type { OutputPart, Utxo, UtxoInput } from "./parts/types";
import { invalidArgument, TxBuildError } from "./errors";
import { errorText, isObject, isWholeNumber } from "./parts/normalize";
import {
  placeUtxos,
  readPlaced,
  scriptSize,
  utxoKey,
  UtxoTwiceError,
} from "./parts/utxo";
import { placeholderWitnesses } from "./witnesses";

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

/** The protocol parameters a build reads as whole numbers */
const INTEGER_PARAMETERS = [
  "minFeeA",
  "minFeeB",
  "maxTxSize",
  "maxValSize",
  "maxTxExMem",
  "maxTxExSteps",
  "collateralPercent",
  "maxCollateralInputs",
  "coinsPerUtxoSize",
] as const satisfies readonly (keyof Protocol)[];

/** The protocol parameters a build reads as decimal numbers */
const RATIO_PARAMETERS = [
  "priceMem",
  "priceStep",
  "minFeeRefScriptCostPerByte",
] as const satisfies readonly (keyof Protocol)[];

/**
 * The deposits a build reads only for a part that owes one: when missing, that part's build
 * says so (MISSING_PARAMETER)
 */
const DEPOSIT_PARAMETERS = [
  "keyDeposit",
  "poolDeposit",
] as const satisfies readonly (keyof Protocol)[];

/** The protocol parameters a build reads, each once */
const BUILD_PARAMETERS: readonly (keyof Protocol)[] = [
  ...INTEGER_PARAMETERS,
  ...RATIO_PARAMETERS,
  ...DEPOSIT_PARAMETERS,
];

/**
 * Checks protocol parameters before they are read: an object whose named fields (by default
 * every one a build reads) are whole numbers of 0 or more, as numbers or digits, or decimals for
 * the prices. A deposit may be missing. Throws an Error naming the first field that is not.
 */
export const checkProtocol = (
  params: unknown,
  fields: readonly (keyof Protocol)[] = BUILD_PARAMETERS,
): void => {
  if (typeof params !== "object" || params === null || Array.isArray(params))
    throw new Error(
      `the protocol parameters are not an object: ${params === null ? "null" : Array.isArray(params) ? "a list" : typeof params}`,
    );
  const record = params as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    const deposit = (DEPOSIT_PARAMETERS as readonly string[]).includes(field);
    if (deposit && (value === undefined || value === null)) continue;
    if ((RATIO_PARAMETERS as readonly string[]).includes(field)) {
      if (typeof value === "number" || typeof value === "string")
        try {
          toRatio(value);
          continue;
        } catch {
          // Reported below, with the field's name
        }
    } else if (isWholeNumber(value)) continue;
    throw new Error(
      `invalid protocol parameter ${field}: ${value === undefined ? "missing" : String(value)}`,
    );
  }
};

/** Whether a value is an object that is not a list */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && !Array.isArray(value);

/** The protocol parameters `minFee` reads */
const MIN_FEE_PARAMETERS: readonly (keyof Protocol)[] = [
  "minFeeA",
  "minFeeB",
  "minFeeRefScriptCostPerByte",
  "priceMem",
  "priceStep",
];

/** `checkProtocol` for the parameters of a public function: INVALID_OPTION `params` */
const checkParams = (params: unknown, fields: readonly (keyof Protocol)[]) => {
  try {
    checkProtocol(params, fields);
  } catch (error) {
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid params: ${errorText(error)}`,
      {
        details: {
          option: "params",
          value: params,
          allowed: `protocol parameters with ${fields.join(", ")}`,
        },
        cause: error,
      },
    );
  }
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
 * The minimum fee of a transaction of a known size.
 * @param txSize Size of the transaction with all its witnesses, in bytes
 * @param refScriptSize Total size of the reference scripts its inputs and reference inputs hold
 * @param exUnits Total execution units of its redeemers
 */
export const feeForSize = (
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
 * counts the lovelace itself. Starts from no lovelace, whatever the output holds, and grows the
 * amount until it covers its own size.
 */
export const outputMinCoin = (
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

/** The total size of the reference scripts held by the UTxOs a transaction body spends or reads */
export const bodyRefScriptSize = (
  body: Readonly<TransactionBodyPrototype>,
  utxos: readonly Utxo[],
): bigint => {
  const byOutRef = new Map(utxos.map((utxo) => [utxoKey(utxo), utxo]));
  let size = 0n;
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const script = byOutRef.get(
      `${input.transaction_id.toLowerCase()}#${input.index}`,
    )?.script;
    if (script) size += BigInt(scriptSize(script));
  }
  return size;
};

/** The execution units of a transaction's redeemers, added up */
export const prototypeExUnits = (
  prototype: Readonly<TransactionPrototype>,
): { mem: bigint; steps: bigint } =>
  (prototype.witness_set.redeemers ?? []).reduce(
    (total, r) => ({
      mem: total.mem + BigInt(r.ex_units.mem),
      steps: total.steps + BigInt(r.ex_units.steps),
    }),
    { mem: 0n, steps: 0n },
  );

/**
 * The minimum fee of a prototype once signed: placeholder witnesses for `vkeyWitnesses` keys,
 * and the reference-script fee for the scripts `inputs` hold.
 *
 * The placeholders stand in place of the prototype's own key witnesses, which are not counted on
 * top; its bootstrap witnesses are sized as given. The size is the one the prototype encoder of
 * `@meshsdk/core-cst` gives. The reference scripts counted are those of the UTxOs in `inputs`
 * that the body spends or reads; without `inputs` there are none. The execution units are those
 * the prototype's redeemers state. Pure and synchronous; the prototype is left as given.
 *
 * Only the shape of its arguments is checked: a prototype that the encoder cannot write fails
 * with the encoder's error.
 *
 * `minFeeA * size + minFeeB + referenceScriptFee + ceil(mem * priceMem + steps * priceStep)`,
 * in exact arithmetic, the reference scripts priced in 25 KiB tiers each 1.2 times the last.
 * @param context.params The protocol parameters
 * @param context.vkeyWitnesses How many key witnesses the signed transaction carries
 * @param context.inputs UTxOs of the body's inputs and reference inputs, for their reference
 *   scripts, in any form the builder takes a UTxO in; two entries for one out ref must hold the
 *   same, and the same UTxO given again is one
 * @throws TxBuildError INVALID_OPTION for a prototype without `body` and `witness_set`, a
 *   `vkeyWitnesses` that is not a whole number of 0 or more, `inputs` that is not a list, holds
 *   an entry that is not a UTxO or two that name one output and differ, the out ref named, and
 *   `params` lacking a field the fee is worked out from, or holding one that is not a number
 */
export const minFee = (
  prototype: TransactionPrototype,
  context: {
    params: Protocol;
    vkeyWitnesses: number;
    inputs?: readonly UtxoInput[];
  },
): bigint => {
  if (
    !isRecord(prototype) ||
    !isRecord(prototype.body) ||
    !isRecord(prototype.witness_set)
  )
    throw invalidArgument(
      "prototype",
      prototype,
      "a TransactionPrototype { body, witness_set }",
    );
  if (!isRecord(context))
    throw invalidArgument(
      "context",
      context,
      "an object { params, vkeyWitnesses, inputs }",
    );
  const { params, vkeyWitnesses, inputs = [] } = context;
  checkParams(params, MIN_FEE_PARAMETERS);
  if (!Number.isSafeInteger(vkeyWitnesses) || vkeyWitnesses < 0)
    throw invalidArgument(
      "vkeyWitnesses",
      vkeyWitnesses,
      "a whole number of 0 or more",
    );
  if (!Array.isArray(inputs))
    throw invalidArgument("inputs", inputs, "a list of UTxOs");
  const refused = (error: unknown, i: number, entry: unknown): never => {
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid inputs: entry ${i} is not a UTxO: ${errorText(error)}`,
      {
        details: {
          option: "inputs",
          value: entry === null ? "null" : typeof entry,
          allowed: "a UTxO",
        },
        cause: error,
      },
    );
  };
  // Each out ref once: two entries for it must hold the same, and the first is the one priced
  let utxos: Utxo[];
  try {
    utxos = Array.from(
      readPlaced(placeUtxos(inputs as unknown[], refused), refused).values(),
    );
  } catch (error) {
    if (!(error instanceof UtxoTwiceError)) throw error;
    throw new TxBuildError(
      "INVALID_OPTION",
      `invalid inputs: ${error.message}`,
      {
        details: {
          option: "inputs",
          value: "object",
          allowed:
            "a list of UTxOs in which the entries that name one output are alike",
        },
      },
    );
  }
  const { vkeyWitnesses: vkeys } = placeholderWitnesses(
    { keyHashes: new Set(), byronAddresses: new Set() },
    vkeyWitnesses,
  );
  // The placeholders take the place of the key witnesses the prototype holds
  const witnessSet = { ...prototype.witness_set };
  delete witnessSet.vkeys;
  if (vkeys.length > 0) witnessSet.vkeys = vkeys;
  const signed = { ...prototype, witness_set: witnessSet };
  return feeForSize(
    transactionPrototypeToHex(signed).length / 2,
    bodyRefScriptSize(prototype.body, utxos),
    prototypeExUnits(prototype),
    params,
  );
};

/**
 * The least lovelace an output must hold: (160 + size) * coinsPerUtxoSize, the size counting
 * the lovelace itself, and the output's datum and reference script. The part's own lovelace is
 * not counted, so a part with lovelace and the same part without give the same number: the one
 * a build puts into an output given without lovelace. Pure and synchronous; no I/O.
 * @throws TxBuildError INVALID_OPTION for an `output` that is not an output part, and `params`
 *   without a whole `coinsPerUtxoSize`
 */
export const minCoin = (
  output: OutputPart,
  params: Pick<Protocol, "coinsPerUtxoSize">,
): bigint => {
  if (
    !isRecord(output) ||
    output.kind !== "output" ||
    !isRecord(output.output) ||
    !isRecord(output.output.amount)
  )
    throw invalidArgument("output", output, "an output part, made by output()");
  checkParams(params, ["coinsPerUtxoSize"]);
  return outputMinCoin(
    {
      ...output.output,
      amount: { ...output.output.amount, coin: "0" },
    } as TransactionOutputPrototype,
    params.coinsPerUtxoSize,
  );
};
