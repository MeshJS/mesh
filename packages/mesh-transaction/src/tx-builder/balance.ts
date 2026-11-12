import type {
  Protocol,
  TransactionOutputPrototype,
  UTxO,
} from "@meshsdk/common";
import { Address, CredentialType } from "@meshsdk/core-cst";

import type { AssembledTx } from "./assemble";
import type {
  CollateralPart,
  CollateralReturnPart,
  OutputPart,
  SpendPart,
  TxPart,
} from "./parts/types";
import type { Value } from "./value";
import { assembleTxPrototype } from "./assemble";
import { TxBuildError } from "./errors";
import { coversMinCoin, minCoin, minFee, valueSize } from "./fee";
import { outRefString } from "./parts/normalize";
import { utxoKey } from "./resolve";
import {
  addValues,
  coinValue,
  emptyValue,
  fromAssets,
  fromMultiAsset,
  subtractValues,
  toMultiAsset,
  toValuePrototype,
} from "./value";
import { placeholderWitnesses, requiredSigners } from "./witnesses";

export type BalanceContext = {
  params: Protocol;
  costModels: readonly (readonly number[])[];
  changeAddress: string;
  /**
   * UTxOs inputs and collateral may be selected from. Those the parts read are never selected,
   * and those named by collateral parts are never selected as inputs.
   */
  utxos: readonly UTxO[];
  /** Every UTxO known to the build, keyed by `txHash#index` */
  known: ReadonlyMap<string, UTxO>;
  /**
   * A fee fixed by the caller, used as is: never raised, and judged against the minimum fee
   * only in a round that is not provisional
   */
  fee?: bigint;
  /** Pools already registered: registering them again takes no deposit */
  registeredPools: ReadonlySet<string>;
  /** Key witnesses expected beyond those the parts call for */
  extraKeyWitnesses: number;
  serialize: (prototype: AssembledTx["prototype"]) => string;
  /**
   * Execution units are still placeholders, which overstate the fee and so the collateral it
   * calls for: collateral that falls short is then put up as it is rather than rejected
   */
  provisional?: boolean;
};

export type CollateralPlan = {
  inputs: UTxO[];
  /** Lovelace forfeited if a script fails */
  total: bigint;
  /** What is left of the collateral, returned if a script fails */
  return?: TransactionOutputPrototype;
};

export type Balanced = {
  /** The unsigned transaction */
  assembled: AssembledTx;
  /** Every part of it, the ones added by balancing included */
  parts: TxPart[];
  fee: bigint;
  /** Inputs added to pay for the transaction */
  selected: UTxO[];
  change: TransactionOutputPrototype[];
  collateral?: CollateralPlan;
};

/** Most balancing rounds; each one selects more inputs or raises the fee */
const MAX_ROUNDS = 50;

/** The largest lovelace quantity, to size values whatever lovelace they end up holding */
const MAX_COIN = (2n ** 64n - 1n).toString();

/** The out refs of the outputs the parts read: reference inputs and reference scripts */
const readByParts = (parts: readonly TxPart[]): Set<string> => {
  const read = new Set<string>();
  for (const part of parts) {
    if (part.kind === "referenceInput") read.add(outRefString(part.input));
    if (!("witness" in part)) continue;
    const { witness } = part;
    if (
      (witness.type === "native" || witness.type === "plutus") &&
      witness.script.type === "reference"
    )
      read.add(outRefString(witness.script.input));
  }
  return read;
};

const isKeyLocked = (utxo: UTxO) => {
  const address = Address.fromString(utxo.output.address);
  if (!address) return false;
  if (address.asByron()) return true;
  return address.getProps().paymentPart?.type === CredentialType.KeyHash;
};

/** Lovelace deposited and refunded by a part */
const depositsOf = (
  part: TxPart,
  params: Protocol,
  registeredPools: ReadonlySet<string>,
): { deposit: bigint; refund: bigint } => {
  const none = { deposit: 0n, refund: 0n };
  if (part.kind === "proposal")
    return { deposit: BigInt(part.proposal.deposit!), refund: 0n };
  if (part.kind !== "certificate") return none;
  const { certificate } = part;
  switch (certificate.type) {
    case "STAKE_REGISTRATION":
      return {
        deposit: BigInt(certificate.value.coin ?? params.keyDeposit),
        refund: 0n,
      };
    case "STAKE_DEREGISTRATION":
      return {
        deposit: 0n,
        refund: BigInt(certificate.value.coin ?? params.keyDeposit),
      };
    case "POOL_REGISTRATION":
      return registeredPools.has(certificate.value.pool_params.operator)
        ? none
        : { deposit: BigInt(params.poolDeposit), refund: 0n };
    case "DREP_DEREGISTRATION":
      return { deposit: 0n, refund: BigInt(certificate.value.coin!) };
    case "DREP_REGISTRATION":
    case "STAKE_REGISTRATION_AND_DELEGATION":
    case "VOTE_REGISTRATION_AND_DELEGATION":
    case "STAKE_VOTE_REGISTRATION_AND_DELEGATION":
      return { deposit: BigInt(certificate.value.coin!), refund: 0n };
    default:
      return none;
  }
};

/**
 * What the parts bring into the transaction and what they take out of it, the fee aside:
 * inputs, withdrawals, refunds and minted tokens against outputs, deposits, donation and burnt
 * tokens.
 */
export const valueFlow = (
  parts: readonly TxPart[],
  params: Protocol,
  registeredPools: ReadonlySet<string>,
): { consumed: Value; produced: Value } => {
  const consumed: Value[] = [];
  const produced: Value[] = [];
  for (const part of parts) {
    switch (part.kind) {
      case "spend":
        consumed.push(fromAssets(part.utxo!.output.amount));
        break;
      case "output":
        produced.push(
          fromMultiAsset(
            part.output.amount.multiasset,
            BigInt(part.output.amount.coin!),
          ),
        );
        break;
      case "withdrawal":
        consumed.push(coinValue(BigInt(part.amount!)));
        break;
      case "mint": {
        const minted = fromMultiAsset({ [part.policyId]: part.assets });
        const burnt = emptyValue();
        for (const [unit, n] of minted.assets)
          if (n < 0n) {
            minted.assets.delete(unit);
            burnt.assets.set(unit, -n);
          }
        consumed.push(minted);
        produced.push(burnt);
        break;
      }
      case "donation":
        produced.push(coinValue(BigInt(part.amount)));
        break;
      case "certificate":
      case "proposal": {
        const { deposit, refund } = depositsOf(part, params, registeredPools);
        produced.push(coinValue(deposit));
        consumed.push(coinValue(refund));
        break;
      }
      default:
        break;
    }
  }
  return { consumed: addValues(...consumed), produced: addValues(...produced) };
};

/** The parts of a value below zero, as positive quantities */
const shortfallOf = (value: Value): Value => {
  const shortfall = coinValue(value.coin < 0n ? -value.coin : 0n);
  for (const [unit, n] of value.assets)
    if (n < 0n) shortfall.assets.set(unit, -n);
  return shortfall;
};

const isEmpty = (value: Value) => value.coin === 0n && value.assets.size === 0;

/**
 * Splits tokens into bundles each fitting in an output, in unit order so that a policy's tokens
 * stay together as far as possible
 */
const bundleAssets = (
  assets: Map<string, bigint>,
  maxValSize: number,
): Map<string, bigint>[] => {
  const bundles: Map<string, bigint>[] = [];
  let current = new Map<string, bigint>();
  const fits = (bundle: Map<string, bigint>) =>
    valueSize({ coin: MAX_COIN, multiasset: toMultiAsset(bundle) }) <=
    maxValSize;
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
      );
  }
  if (current.size > 0) bundles.push(current);
  return bundles;
};

/**
 * Outputs returning the change to the change address: one, or more when its tokens do not fit
 * in one. Each holds the least lovelace it needs, the first one the rest. Returns the lovelace
 * missing when the change cannot cover that.
 */
const makeChange = (
  change: Value,
  address: string,
  params: Protocol,
): TransactionOutputPrototype[] | { missing: bigint } => {
  if (isEmpty(change)) return [];
  const bundles =
    change.assets.size > 0
      ? bundleAssets(change.assets, params.maxValSize)
      : [];
  const outputs: TransactionOutputPrototype[] = (
    bundles.length > 0 ? bundles : [new Map<string, bigint>()]
  ).map((bundle) => {
    const multiasset = toMultiAsset(bundle);
    return {
      address,
      amount: { coin: "0", ...(multiasset && { multiasset }) },
    };
  });
  const mins = outputs.map((o) => minCoin(o, params.coinsPerUtxoSize));
  const needed = mins.reduce((a, b) => a + b, 0n);
  if (change.coin < needed) return { missing: needed - change.coin };
  outputs.forEach((o, i) => {
    o.amount.coin = mins[i]!.toString();
  });
  outputs[0]!.amount.coin = (mins[0]! + change.coin - needed).toString();
  // The extra lovelace can only lengthen the first output's encoding by a few bytes
  if (!coversMinCoin(outputs[0]!, params.coinsPerUtxoSize))
    return { missing: minCoin(outputs[0]!, params.coinsPerUtxoSize) };
  return outputs;
};

const spendPart = (utxo: UTxO): SpendPart => ({
  kind: "spend",
  input: { transaction_id: utxo.input.txHash, index: utxo.input.outputIndex },
  utxo,
  witness: { type: "key" },
});

const outputPart = (output: TransactionOutputPrototype): OutputPart => ({
  kind: "output",
  output: output as OutputPart["output"],
});

const lovelaceOf = (utxo: UTxO) => fromAssets(utxo.output.amount).coin;

/**
 * Balances resolved parts whose redeemers all carry execution units, and whose outputs all
 * hold their lovelace: selects inputs, makes change, puts up collateral and settles the fee.
 *
 * Each round works out what is missing with the current fee and selects inputs for it; once
 * nothing is, it makes change, plans collateral and prices the transaction with placeholder
 * witnesses. The fee only ever rises, and inputs are only ever added, so the rounds settle.
 */
export const balance = (
  parts: readonly TxPart[],
  ctx: BalanceContext,
): Balanced => {
  const { params } = ctx;
  const runsPlutus = parts.some(
    (p) => "witness" in p && p.witness.type === "plutus",
  );
  const givenCollateral = parts.filter(
    (p): p is CollateralPart => p.kind === "collateral",
  );
  const givenReturn = parts.find(
    (p): p is CollateralReturnPart => p.kind === "collateralReturn",
  );
  const core = parts.filter(
    (p) => p.kind !== "collateral" && p.kind !== "collateralReturn",
  );
  const flow = valueFlow(core, params, ctx.registeredPools);

  const spent = new Set(
    parts.flatMap((p) => (p.kind === "spend" ? [utxoKey(p.utxo!)] : [])),
  );
  const read = readByParts(parts);
  // A collateral part's UTxO is spent only when a spend part names it as well
  const putUp = new Set(givenCollateral.map((p) => outRefString(p.input)));
  const pool = ctx.utxos.filter((u) => {
    const key = utxoKey(u);
    return (
      isKeyLocked(u) && !spent.has(key) && !read.has(key) && !putUp.has(key)
    );
  });
  const selected: UTxO[] = [];
  const selectedKeys = new Set<string>();
  const select = (utxo: UTxO) => {
    selected.push(utxo);
    selectedKeys.add(utxoKey(utxo));
  };

  const insufficient = (message: string, details: unknown): never => {
    throw new TxBuildError("INSUFFICIENT_FUNDS", message, { details });
  };

  /** Selects inputs covering a shortfall: each token from its largest holders, then lovelace */
  const selectFor = (shortfall: Value) => {
    // What this call has selected so far, which may already hold the next token
    let added = emptyValue();
    const take = (utxo: UTxO) => {
      select(utxo);
      added = addValues(added, fromAssets(utxo.output.amount));
    };
    for (const unit of Array.from(shortfall.assets.keys()).sort()) {
      let missing =
        shortfall.assets.get(unit)! - (added.assets.get(unit) ?? 0n);
      const quantity = (u: UTxO) =>
        fromAssets(u.output.amount).assets.get(unit) ?? 0n;
      const holders = pool
        .filter((u) => !selectedKeys.has(utxoKey(u)) && quantity(u) > 0n)
        .sort((a, b) => {
          const diff = quantity(b) - quantity(a);
          return diff !== 0n ? (diff > 0n ? 1 : -1) : 0;
        });
      for (const utxo of holders) {
        if (missing <= 0n) break;
        take(utxo);
        missing -= quantity(utxo);
      }
      if (missing > 0n)
        insufficient(`${missing} of ${unit} are missing`, { unit, missing });
    }
    let missing = shortfall.coin - added.coin;
    if (missing <= 0n) return;
    // Lovelace from plain UTxOs first: tokens and reference scripts cost more to carry along
    const rank = (u: UTxO) =>
      (u.output.scriptRef ? 2 : 0) + (u.output.amount.length > 1 ? 1 : 0);
    const candidates = pool
      .filter((u) => !selectedKeys.has(utxoKey(u)))
      .sort((a, b) => {
        const byRank = rank(a) - rank(b);
        if (byRank !== 0) return byRank;
        const diff = lovelaceOf(b) - lovelaceOf(a);
        return diff !== 0n ? (diff > 0n ? 1 : -1) : 0;
      });
    for (const utxo of candidates) {
      if (missing <= 0n) break;
      select(utxo);
      missing -= lovelaceOf(utxo);
    }
    if (missing > 0n)
      insufficient(`${missing} lovelace are missing`, {
        unit: "lovelace",
        missing,
      });
  };

  const needsCollateral = runsPlutus || givenCollateral.length > 0;
  const collateralPool = ctx.utxos.filter(
    (u) => isKeyLocked(u) && !read.has(utxoKey(u)),
  );
  const planCollateral = (fee: bigint): CollateralPlan => {
    const plan = () =>
      collateralFor(fee, {
        params,
        given: givenCollateral.map((p) => p.utxo!),
        givenTotal:
          givenReturn?.totalCollateral === undefined
            ? undefined
            : BigInt(givenReturn.totalCollateral),
        address: givenReturn?.address ?? ctx.changeAddress,
        pool: collateralPool,
      });
    if (!ctx.provisional) return plan();
    try {
      return plan();
    } catch (error) {
      if (!(error instanceof TxBuildError)) throw error;
      const inputs = givenCollateral.map((p) => p.utxo!);
      return {
        inputs,
        total: addValues(...inputs.map((u) => fromAssets(u.output.amount)))
          .coin,
      };
    }
  };

  let fee = ctx.fee ?? 0n;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const available = addValues(
      flow.consumed,
      ...selected.map((u) => fromAssets(u.output.amount)),
    );
    const rest = subtractValues(
      available,
      addValues(flow.produced, coinValue(fee)),
    );
    const shortfall = shortfallOf(rest);
    // A transaction spends at least one input, even when refunds and withdrawals pay for it
    if (spent.size + selected.length === 0 && shortfall.coin === 0n)
      shortfall.coin = 1n;
    if (!isEmpty(shortfall)) {
      selectFor(shortfall);
      continue;
    }
    const change = makeChange(rest, ctx.changeAddress, params);
    if (!Array.isArray(change)) {
      selectFor(coinValue(change.missing));
      continue;
    }

    const collateral = needsCollateral ? planCollateral(fee) : undefined;
    const collateralParts: TxPart[] = collateral
      ? [
          ...collateral.inputs.map((utxo): CollateralPart => ({
            kind: "collateral",
            input: {
              transaction_id: utxo.input.txHash,
              index: utxo.input.outputIndex,
            },
            utxo,
          })),
          {
            kind: "collateralReturn",
            address: givenReturn?.address ?? ctx.changeAddress,
            totalCollateral: collateral.total.toString(),
            ...(givenReturn?.label !== undefined && {
              label: givenReturn.label,
            }),
          },
        ]
      : [];
    const all: TxPart[] = [
      ...core,
      ...selected.map(spendPart),
      ...change.map(outputPart),
      ...collateralParts,
    ];

    const sized = assembleTxPrototype(all, {
      fee,
      costModels: ctx.costModels,
      ...placeholderWitnesses(requiredSigners(all), ctx.extraKeyWitnesses),
    });
    const size = ctx.serialize(sized.prototype).length / 2;
    if (size > params.maxTxSize)
      throw new TxBuildError(
        "TX_TOO_LARGE",
        `the transaction takes ${size} bytes, more than the ${params.maxTxSize} allowed`,
        { details: { size, maxTxSize: params.maxTxSize } },
      );
    const required = minFee(
      size,
      refScriptSize(sized, ctx.known),
      totalExUnits(sized),
      params,
    );
    // A given fee is never raised. A provisional round's units overstate the minimum, so the
    // fee is judged only once they are real
    if (ctx.fee !== undefined && !ctx.provisional && required > ctx.fee)
      throw new TxBuildError(
        "FEE_TOO_LOW",
        `the fee ${ctx.fee} is below the transaction's minimum fee ${required}`,
        { details: { fee: ctx.fee, minFee: required } },
      );
    if (ctx.fee !== undefined || required <= fee)
      return {
        assembled: assembleTxPrototype(all, {
          fee,
          costModels: ctx.costModels,
        }),
        parts: all,
        fee,
        selected,
        change,
        ...(collateral && { collateral }),
      };
    fee = required;
  }
  throw new TxBuildError(
    "FEE_NOT_CONVERGED",
    `the fee did not settle within ${MAX_ROUNDS} rounds`,
  );
};

/** Total size of the reference scripts the transaction's inputs and reference inputs hold */
export const refScriptSize = (
  assembled: AssembledTx,
  known: ReadonlyMap<string, UTxO>,
): bigint => {
  const { body } = assembled.prototype;
  let size = 0n;
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const scriptRef = known.get(`${input.transaction_id}#${input.index}`)
      ?.output.scriptRef;
    if (scriptRef) size += BigInt(scriptRef.length / 2);
  }
  return size;
};

export const totalExUnits = (assembled: AssembledTx) =>
  assembled.redeemers.reduce(
    (total, r) => ({
      mem: total.mem + BigInt(r.exUnits.mem),
      steps: total.steps + BigInt(r.exUnits.steps),
    }),
    { mem: 0n, steps: 0n },
  );

/**
 * Collateral covering `collateralPercent` of the fee, with what is left returned.
 *
 * Given collateral inputs are used as they are. Otherwise inputs are chosen from the pool: the
 * smallest lovelace-only UTxO that covers the requirement and leaves a return worth making,
 * else the smallest that covers it, else the largest ones, up to `maxCollateralInputs`.
 *
 * A return too small to be an output is left out, and the whole collateral is forfeited
 * instead, unless the total was given.
 */
const collateralFor = (
  fee: bigint,
  ctx: {
    params: Protocol;
    given: UTxO[];
    givenTotal?: bigint;
    address: string;
    pool: readonly UTxO[];
  },
): CollateralPlan => {
  const { params } = ctx;
  const percent = BigInt(params.collateralPercent);
  const minimum = (fee * percent + 99n) / 100n;
  const required = ctx.givenTotal ?? minimum;
  const adaOnlyMin = minCoin(
    { address: ctx.address, amount: { coin: "0" } },
    params.coinsPerUtxoSize,
  );
  const fail = (message: string): never => {
    throw new TxBuildError("INSUFFICIENT_COLLATERAL", message, {
      details: { required },
    });
  };

  const plan = (inputs: UTxO[]): CollateralPlan | undefined => {
    const held = addValues(...inputs.map((u) => fromAssets(u.output.amount)));
    if (held.coin < required) return undefined;
    const rest = subtractValues(held, coinValue(required));
    if (isEmpty(rest)) return { inputs, total: required };
    const output: TransactionOutputPrototype = {
      address: ctx.address,
      amount: toValuePrototype(rest),
    };
    if (coversMinCoin(output, params.coinsPerUtxoSize))
      return { inputs, total: required, return: output };
    if (rest.assets.size > 0 || ctx.givenTotal !== undefined) return undefined;
    return { inputs, total: held.coin };
  };

  if (required < minimum)
    fail(
      `the total collateral ${required} is below the ${minimum} lovelace the fee calls for`,
    );

  if (ctx.given.length > 0)
    return (
      plan(ctx.given) ??
      fail(
        `the collateral inputs cannot cover ${required} lovelace and return the rest`,
      )
    );

  const adaOnly = ctx.pool
    .filter((u) => u.output.amount.length === 1 && !u.output.scriptRef)
    .sort((a, b) => {
      const diff = lovelaceOf(a) - lovelaceOf(b);
      return diff !== 0n ? (diff > 0n ? 1 : -1) : 0;
    });
  const withReturn = adaOnly.find(
    (u) => lovelaceOf(u) === required || lovelaceOf(u) >= required + adaOnlyMin,
  );
  if (withReturn) return plan([withReturn])!;
  const single = adaOnly.find((u) => lovelaceOf(u) >= required);
  if (single) return plan([single])!;

  const largest = [
    ...adaOnly.reverse(),
    ...ctx.pool.filter((u) => !adaOnly.includes(u)),
  ];
  const inputs: UTxO[] = [];
  for (const utxo of largest) {
    if (inputs.length >= params.maxCollateralInputs) break;
    inputs.push(utxo);
    const found = plan(inputs);
    if (found) return found;
  }
  return fail(
    inputs.length === 0
      ? "no key-locked UTxO is available to put up as collateral"
      : `no ${params.maxCollateralInputs} UTxOs cover the ${required} lovelace collateral`,
  );
};
