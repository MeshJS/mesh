import type {
  Protocol,
  TransactionOutputPrototype,
  UTxO,
} from "@meshsdk/common";
import { Address, CredentialType } from "@meshsdk/core-cst";

import type { AssembledTx } from "./assemble";
import type { InsufficientFundsDetails } from "./errors";
import type {
  CollateralPart,
  CollateralReturnPart,
  OutputPart,
  OutRef,
  SpendPart,
  TxPart,
} from "./parts/types";
import type { Value } from "./value";
import { assembleTxPrototype, atMostOne } from "./assemble";
import { TxBuildError } from "./errors";
import { coversMinCoin, feeForSize, outputMinCoin, valueSize } from "./fee";
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
import { placeholderWitnesses, pricedSigners } from "./witnesses";

/**
 * Replaces input selection. Called whenever something is missing; every UTxO returned must be
 * among `candidates` (else INVALID_SELECTION), and a non-empty need must get at least one
 * (else INSUFFICIENT_FUNDS). Until the scripts are evaluated, `context.fee` is an upper
 * estimate, and so is a need of lovelace.
 */
export type SelectInputs = (
  need: {
    readonly lovelace: bigint;
    readonly assets: ReadonlyMap<string, bigint>;
  },
  /** Key-locked payer UTxOs not spent, read, excluded or selected yet */
  candidates: readonly UTxO[],
  context: {
    readonly round: number;
    readonly selected: readonly UTxO[];
    readonly fee: bigint;
    readonly params: Protocol;
  },
) => readonly UTxO[];

export type BalanceContext = {
  params: Protocol;
  costModels: readonly (readonly number[])[];
  /** The payer's change address, where change and, by default, the collateral return go */
  changeAddress: string;
  /**
   * UTxOs inputs and collateral may be selected from. Those the parts read are never selected,
   * and those named by collateral parts are never selected as inputs.
   */
  utxos: readonly UTxO[];
  /** Out refs of the UTxOs selected neither as inputs nor as collateral: a filter refused them */
  refused?: ReadonlySet<string>;
  /**
   * How many of the payer's UTxOs are left out of `utxos` because a transaction the build was
   * given as `after` spends them
   */
  spentByAfter?: number;
  /**
   * The UTxOs collateral is chosen from in place of the payer's, which are then still selected
   * for payment only: those a wallet gave for collateral
   */
  collateralPool?: readonly UTxO[];
  /** Selects the inputs in place of the built-in selection */
  coinSelection?: SelectInputs;
  /**
   * Every selectable UTxO is spent, and what is left goes to this address in place of the
   * change address; the outputs it takes are change only when it is the change address
   */
  sendAllTo?: string;
  /** Every UTxO known to the build, keyed by `txHash#index` */
  known: ReadonlyMap<string, UTxO>;
  /** Out refs named by collateral parts that selection may still spend as inputs */
  selectableCollateral?: ReadonlySet<string>;
  /**
   * Reference-script sizes stated for out refs whose UTxO the build does not know, keyed by
   * `txHash#index`: counted for the fee where no known UTxO holds a script
   */
  scriptSizes?: ReadonlyMap<string, number>;
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
  /**
   * Collateral that falls short is left out rather than rejected, as in a provisional round, in
   * a round that only prices the transaction
   */
  lenientCollateral?: boolean;
  /** Told of every round that prices a transaction */
  onRound?: (round: PricedRound) => void;
};

/** A balancing round that priced a transaction */
export type PricedRound = {
  /** The round's number within its balancing, from 0 */
  round: number;
  /** The fee the round's transaction carries */
  fee: bigint;
  /** Its size in bytes, with placeholder witnesses */
  size: number;
  /** How many inputs selection has added */
  selected: number;
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
  /**
   * The output parts of `parts` that return change to the payer's change address: those that
   * took what was left, unless it was sent to another address
   */
  change: OutputPart[];
  /** The minimum fee of the transaction, with a witness for every key expected to sign */
  minFee: bigint;
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

/** The out refs a part names as collateral */
const putUpByParts = (parts: readonly TxPart[]): Set<string> =>
  new Set(
    parts.flatMap((p) =>
      p.kind === "collateral" ? [outRefString(p.input)] : [],
    ),
  );

/** Whether a UTxO is locked by a key: a key payment credential, or a Byron address */
export const isKeyLocked = (utxo: UTxO) => {
  const address = Address.fromString(utxo.output.address);
  if (!address) return false;
  if (address.asByron()) return true;
  return address.getProps().paymentPart?.type === CredentialType.KeyHash;
};

/**
 * The payer's UTxOs selection may take for payment: key-locked, not spent, read or named as
 * collateral by a part, and not refused by the filter; with the count of the others, each by
 * its first reason
 */
export const paymentPool = (
  parts: readonly TxPart[],
  utxos: readonly UTxO[],
  refused: ReadonlySet<string> = new Set(),
  spentByAfter = 0,
  selectableCollateral: ReadonlySet<string> = new Set(),
): { pool: UTxO[]; counts: InsufficientFundsDetails["pool"] } => {
  const spent = new Set(
    parts.flatMap((p) => (p.kind === "spend" ? [utxoKey(p.utxo!)] : [])),
  );
  const read = readByParts(parts);
  const putUp = putUpByParts(parts);
  for (const key of selectableCollateral) putUp.delete(key);
  const pool: UTxO[] = [];
  const counts: InsufficientFundsDetails["pool"] = {
    // Those spent by `after` were given too, and are counted by that reason
    given: utxos.length + spentByAfter,
    selectable: 0,
    scriptLocked: 0,
    excludedByFilter: 0,
    readByParts: 0,
    spentByAfter,
  };
  for (const utxo of utxos) {
    const key = utxoKey(utxo);
    // Already in the transaction: only given
    if (spent.has(key) || putUp.has(key)) continue;
    if (!isKeyLocked(utxo)) counts.scriptLocked++;
    else if (read.has(key)) counts.readByParts++;
    else if (refused.has(key)) counts.excludedByFilter++;
    else pool.push(utxo);
  }
  counts.selectable = pool.length;
  return { pool, counts };
};

/**
 * The UTxOs of a list that may be put up as collateral: key-locked, not read by a part, and let
 * by the filter, which is asked once about each; each out ref once. What the filter throws is
 * not caught.
 */
export const collateralCandidates = (
  parts: readonly TxPart[],
  utxos: readonly UTxO[],
  canSelect?: (utxo: UTxO) => boolean,
): UTxO[] => {
  const read = readByParts(parts);
  const seen = new Set<string>();
  return utxos.filter((utxo) => {
    const key = utxoKey(utxo);
    if (seen.has(key) || !isKeyLocked(utxo) || read.has(key)) return false;
    seen.add(key);
    return !canSelect || canSelect(utxo);
  });
};

/** Collateral errors raised because the UTxOs collateral is chosen from cannot cover it */
const poolShortfalls = new WeakSet<object>();

/**
 * Whether an error is INSUFFICIENT_COLLATERAL of the builder's own choice of collateral: the
 * UTxOs it chooses from cannot cover it. Not for collateral given by parts, nor for a given
 * total below the minimum.
 */
export const isPoolShortfall = (error: unknown) =>
  typeof error === "object" && error !== null && poolShortfalls.has(error);

/**
 * The out refs of the UTxOs a filter refuses, asking it once about each UTxO it could let be
 * selected: key-locked, not read by a part and not named as collateral. What the filter throws
 * is not caught.
 */
export const refusedBy = (
  canSelect: (utxo: UTxO) => boolean,
  parts: readonly TxPart[],
  utxos: readonly UTxO[],
): Set<string> => {
  const read = readByParts(parts);
  const putUp = putUpByParts(parts);
  const refused = new Set<string>();
  for (const utxo of utxos) {
    const key = utxoKey(utxo);
    if (!isKeyLocked(utxo) || read.has(key) || putUp.has(key)) continue;
    if (!canSelect(utxo)) refused.add(key);
  }
  return refused;
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

/**
 * The outputs change holding these tokens takes, each holding the least lovelace it needs: one
 * output per bundle of tokens that fits, or one without tokens when there are none
 */
const leastChange = (
  assets: Map<string, bigint>,
  address: string,
  params: Protocol,
) => {
  const bundles =
    assets.size > 0 ? bundleAssets(assets, params.maxValSize) : [];
  const outputs: TransactionOutputPrototype[] = (
    bundles.length > 0 ? bundles : [new Map<string, bigint>()]
  ).map((bundle) => {
    const multiasset = toMultiAsset(bundle);
    return {
      address,
      amount: { coin: "0", ...(multiasset && { multiasset }) },
    };
  });
  const mins = outputs.map((o) => outputMinCoin(o, params.coinsPerUtxoSize));
  outputs.forEach((o, i) => {
    o.amount.coin = mins[i]!.toString();
  });
  return { outputs, mins, needed: mins.reduce((a, b) => a + b, 0n) };
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
  const { outputs, mins, needed } = leastChange(change.assets, address, params);
  if (change.coin < needed) return { missing: needed - change.coin };
  outputs[0]!.amount.coin = (mins[0]! + change.coin - needed).toString();
  // The extra lovelace can only lengthen the first output's encoding by a few bytes
  if (!coversMinCoin(outputs[0]!, params.coinsPerUtxoSize))
    return { missing: outputMinCoin(outputs[0]!, params.coinsPerUtxoSize) };
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
  // Every given return is checked, not the first taken: a second one would be left out
  // unseen, whether or not collateral is put up
  const givenReturn = atMostOne(
    parts.filter(
      (p): p is CollateralReturnPart => p.kind === "collateralReturn",
    ),
    "collateral return",
  );
  const core = parts.filter(
    (p) => p.kind !== "collateral" && p.kind !== "collateralReturn",
  );
  const flow = valueFlow(core, params, ctx.registeredPools);

  const spent = new Set(
    parts.flatMap((p) => (p.kind === "spend" ? [utxoKey(p.utxo!)] : [])),
  );
  const read = readByParts(parts);
  const refused = ctx.refused ?? new Set<string>();
  // Where what is left goes: the change address, or the address everything is sent to
  const changeTo = ctx.sendAllTo ?? ctx.changeAddress;
  // The UTxOs selection may take, and why the others may not, each counted once
  const { pool, counts } = paymentPool(
    parts,
    ctx.utxos,
    refused,
    ctx.spentByAfter,
    ctx.selectableCollateral,
  );
  const selected: UTxO[] = [];
  const selectedKeys = new Set<string>();
  const select = (utxo: UTxO) => {
    selected.push(utxo);
    selectedKeys.add(utxoKey(utxo));
  };

  let fee = ctx.fee ?? 0n;

  /** What the parts bring in and every selectable UTxO holds, selected or not */
  const everything = () =>
    addValues(flow.consumed, ...pool.map((u) => fromAssets(u.output.amount)));

  /**
   * The fee and the change minimum of the transaction with every selectable UTxO an input and
   * its change at the minimum, as the rounds would settle them. The fee of the current round
   * when that transaction cannot be made.
   */
  const estimate = (): { feeEstimate: bigint; changeMinimum?: bigint } => {
    const funds = everything();
    const tokens = new Map(
      Array.from(subtractValues(funds, flow.produced).assets).filter(
        ([, n]) => n > 0n,
      ),
    );
    // A fixed fee lets a transaction short of outputs plus fee pass without change
    const withoutChange =
      ctx.fee !== undefined &&
      tokens.size === 0 &&
      funds.coin < flow.produced.coin + ctx.fee;
    let change: TransactionOutputPrototype[] = [];
    let changeMinimum: bigint | undefined;
    if (!withoutChange) {
      try {
        const least = leastChange(tokens, changeTo, params);
        change = least.outputs;
        changeMinimum = least.needed;
      } catch {
        return { feeEstimate: fee };
      }
    }
    const withMinimum = <T extends object>(estimated: T) =>
      changeMinimum === undefined ? estimated : { ...estimated, changeMinimum };
    if (ctx.fee !== undefined) return withMinimum({ feeEstimate: ctx.fee });
    try {
      // Priced again while the fee the body carries is below its own minimum, as the rounds do
      let estimated = 0n;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const collateral = needsCollateral
          ? planCollateral(estimated, true)
          : undefined;
        const all: TxPart[] = [
          ...core,
          ...pool.map(spendPart),
          ...change.map(outputPart),
          ...(collateral ? collateralParts(collateral) : []),
        ];
        const sized = assembleTxPrototype(all, {
          fee: estimated,
          costModels: ctx.costModels,
          ...placeholderWitnesses(pricedSigners(all), ctx.extraKeyWitnesses),
        });
        const required = feeForSize(
          ctx.serialize(sized.prototype).length / 2,
          refScriptSize(sized, ctx.known, ctx.scriptSizes),
          totalExUnits(sized),
          params,
        );
        if (required <= estimated)
          return withMinimum({ feeEstimate: estimated });
        estimated = required;
      }
    } catch {
      // The fee of the current round, below
    }
    return withMinimum({ feeEstimate: fee });
  };

  /** What the transaction holds as it stands: what the parts bring in and what is selected */
  const held = () =>
    addValues(
      flow.consumed,
      ...selected.map((u) => fromAssets(u.output.amount)),
    );

  /**
   * Fails for `unit`, the first one selection cannot cover. With `unanswered`, the shortfall a
   * `coinSelection` function answered with nothing, the details are of the transaction as it
   * stands, since the UTxOs it left could still cover it.
   */
  const insufficient = (unit: string, unanswered?: Value): never => {
    const quantity = (value: Value) =>
      unit === "lovelace" ? value.coin : (value.assets.get(unit) ?? 0n);
    const available = quantity(unanswered ? held() : everything());
    const produced = quantity(flow.produced);
    let estimated: { feeEstimate?: bigint; changeMinimum?: bigint } = {};
    let required: bigint;
    if (unanswered) {
      required = available + quantity(unanswered);
      // A shortfall of lovelace beyond the outputs and the fee is of the change minimum, once
      // the transaction has an input
      const ofChange =
        available >= produced + fee && spent.size + selected.length > 0;
      if (unit === "lovelace")
        estimated = {
          feeEstimate: fee,
          ...(ofChange && { changeMinimum: required - produced - fee }),
        };
    } else {
      if (unit === "lovelace") estimated = estimate();
      required =
        produced +
        (estimated.feeEstimate ?? 0n) +
        (estimated.changeMinimum ?? 0n);
    }
    const missing = required - available > 0n ? required - available : 1n;
    // Judged on the UTxOs left after the transactions of `after`
    const reason: InsufficientFundsDetails["reason"] =
      counts.given === counts.spentByAfter
        ? "noUtxos"
        : unit === "lovelace" &&
            available >= produced + estimated.feeEstimate! &&
            available < required
          ? "change"
          : "payment";
    const what =
      unit === "lovelace"
        ? `${missing} lovelace are missing: the transaction takes ${required}, the fee of ${estimated.feeEstimate}${estimated.changeMinimum === undefined ? "" : ` and change of at least ${estimated.changeMinimum}`} included, and ${available} are available`
        : `${missing} of ${unit} are missing: the transaction takes ${required}, and ${available} are available`;
    const notes = [
      ...(unanswered ? ["coinSelection selected nothing for it"] : []),
      ...(reason === "noUtxos"
        ? [
            counts.spentByAfter > 0
              ? `the transactions given in after spend every UTxO of the payer ${ctx.changeAddress}, and leave it no change`
              : `no UTxOs are given for the payer ${ctx.changeAddress}; a provider may answer a failed request with an empty list`,
          ]
        : []),
      ...(unit === "lovelace" && ctx.provisional && ctx.fee === undefined
        ? ["the fee is an upper bound, taken before the scripts were evaluated"]
        : []),
    ];
    throw new TxBuildError("INSUFFICIENT_FUNDS", [what, ...notes].join("; "), {
      details: {
        unit,
        missing,
        required,
        available,
        reason,
        ...estimated,
        pool: { ...counts },
      },
    });
  };

  /** The unit reported when a shortfall cannot be covered: its first token, else lovelace */
  const firstUnit = (shortfall: Value) =>
    Array.from(shortfall.assets.keys()).sort()[0] ?? "lovelace";

  /**
   * Selects inputs for a shortfall with the caller's function: what it returns must be among
   * the candidates, and something must be returned. Not called with no candidate left.
   */
  const selectWith = (
    coinSelection: SelectInputs,
    shortfall: Value,
    round: number,
  ) => {
    const candidates = pool.filter((u) => !selectedKeys.has(utxoKey(u)));
    if (candidates.length === 0) insufficient(firstUnit(shortfall));
    const answer: unknown = coinSelection(
      { lovelace: shortfall.coin, assets: new Map(shortfall.assets) },
      candidates,
      { round, selected: [...selected], fee, params },
    );
    /** An answer that is not a list of UTxOs: the function is not a `SelectInputs` */
    const notAList = (value: unknown) =>
      new TxBuildError(
        "INVALID_OPTION",
        "invalid coinSelection: it must return a list of UTxOs among its candidates",
        {
          details: {
            option: "coinSelection",
            value,
            allowed:
              "a function returning a list of UTxOs among its candidates",
          },
        },
      );
    if (!Array.isArray(answer)) throw notAList(answer);
    const byKey = new Map(candidates.map((u) => [utxoKey(u), u]));
    const picked = new Map<string, UTxO>();
    for (const entry of answer as unknown[]) {
      const input = (
        entry as { input?: { txHash?: unknown; outputIndex?: unknown } } | null
      )?.input;
      if (
        typeof input?.txHash !== "string" ||
        typeof input.outputIndex !== "number"
      )
        throw notAList(entry);
      const ref: OutRef = {
        txHash: input.txHash,
        outputIndex: input.outputIndex,
      };
      // Out refs compare in lower case, as the payer's UTxOs are kept
      const key = `${ref.txHash.toLowerCase()}#${ref.outputIndex}`;
      const candidate = byKey.get(key);
      if (!candidate)
        throw new TxBuildError(
          "INVALID_SELECTION",
          `coinSelection returned ${ref.txHash}#${ref.outputIndex}, which is not among its candidates`,
          { details: { utxo: ref } },
        );
      picked.set(key, candidate);
    }
    if (picked.size === 0) insufficient(firstUnit(shortfall), shortfall);
    for (const utxo of picked.values()) select(utxo);
  };

  /**
   * Selects inputs covering a shortfall: with the caller's function when there is one, else
   * each token from its largest holders, then lovelace
   */
  const selectFor = (shortfall: Value, round: number) => {
    if (ctx.coinSelection)
      return selectWith(ctx.coinSelection, shortfall, round);
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
      if (missing > 0n) insufficient(unit);
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
    if (missing > 0n) insufficient("lovelace");
  };

  const needsCollateral = runsPlutus || givenCollateral.length > 0;
  const collateralPool =
    ctx.collateralPool ??
    ctx.utxos.filter(
      (u) =>
        isKeyLocked(u) && !read.has(utxoKey(u)) && !refused.has(utxoKey(u)),
    );
  /**
   * The collateral for a fee. Leniently, collateral that falls short is put up as given rather
   * than rejected: placeholder units overstate the fee it is worked out from
   */
  const planCollateral = (
    fee: bigint,
    lenient = ctx.provisional || ctx.lenientCollateral,
  ): CollateralPlan => {
    const plan = () =>
      collateralFor(fee, {
        params,
        given: givenCollateral.map((p) => p.utxo!),
        givenParts: givenCollateral,
        ...(givenReturn && { returnPart: givenReturn }),
        givenTotal:
          givenReturn?.totalCollateral === undefined
            ? undefined
            : BigInt(givenReturn.totalCollateral),
        address: givenReturn?.address ?? ctx.changeAddress,
        pool: collateralPool,
      });
    if (!lenient) return plan();
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

  /** The labels of the collateral parts, by out ref */
  const collateralLabels = new Map(
    givenCollateral.flatMap((p) =>
      p.label === undefined ? [] : [[outRefString(p.input), p.label] as const],
    ),
  );
  /** The collateral and collateral return parts of a plan, given ones keeping their labels */
  const collateralParts = (collateral: CollateralPlan): TxPart[] => [
    ...collateral.inputs.map((utxo): CollateralPart => {
      const label = collateralLabels.get(utxoKey(utxo));
      return {
        kind: "collateral",
        input: {
          transaction_id: utxo.input.txHash,
          index: utxo.input.outputIndex,
        },
        utxo,
        ...(label !== undefined && { label }),
      };
    }),
    {
      kind: "collateralReturn",
      address: givenReturn?.address ?? ctx.changeAddress,
      totalCollateral: collateral.total.toString(),
      ...(givenReturn?.label !== undefined && {
        label: givenReturn.label,
      }),
    },
  ];

  // A sweep spends every selectable UTxO from the start, leaving selection nothing to choose
  if (ctx.sendAllTo !== undefined) for (const utxo of pool) select(utxo);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const available = held();
    const rest = subtractValues(
      available,
      addValues(flow.produced, coinValue(fee)),
    );
    const shortfall = shortfallOf(rest);
    // A transaction spends at least one input, even when refunds and withdrawals pay for it
    if (spent.size + selected.length === 0 && shortfall.coin === 0n)
      shortfall.coin = 1n;
    if (!isEmpty(shortfall)) {
      selectFor(shortfall, round);
      continue;
    }
    const change = makeChange(rest, changeTo, params);
    if (!Array.isArray(change)) {
      selectFor(coinValue(change.missing), round);
      continue;
    }

    const collateral = needsCollateral ? planCollateral(fee) : undefined;
    const changeParts = change.map(outputPart);
    const all: TxPart[] = [
      ...core,
      ...selected.map(spendPart),
      ...changeParts,
      ...(collateral ? collateralParts(collateral) : []),
    ];

    const sized = assembleTxPrototype(all, {
      fee,
      costModels: ctx.costModels,
      ...placeholderWitnesses(pricedSigners(all), ctx.extraKeyWitnesses),
    });
    const size = ctx.serialize(sized.prototype).length / 2;
    ctx.onRound?.({ round, fee, size, selected: selected.length });
    if (size > params.maxTxSize)
      throw new TxBuildError(
        "TX_TOO_LARGE",
        `the transaction takes ${size} bytes, more than the ${params.maxTxSize} allowed`,
        { details: { size, maxTxSize: params.maxTxSize } },
      );
    const required = feeForSize(
      size,
      refScriptSize(sized, ctx.known, ctx.scriptSizes),
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
        // What is sent to another address is not the payer's change
        change: changeTo === ctx.changeAddress ? changeParts : [],
        minFee: required,
        ...(collateral && { collateral }),
      };
    fee = required;
  }
  throw new TxBuildError(
    "FEE_NOT_CONVERGED",
    `the fee did not settle within ${MAX_ROUNDS} rounds`,
  );
};

/**
 * Total size of the reference scripts the transaction's inputs and reference inputs hold: those
 * of the known UTxOs, else the size stated for the out ref
 */
export const refScriptSize = (
  assembled: AssembledTx,
  known: ReadonlyMap<string, UTxO>,
  stated?: ReadonlyMap<string, number>,
): bigint => {
  const { body } = assembled.prototype;
  let size = 0n;
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const key = `${input.transaction_id}#${input.index}`;
    const scriptRef = known.get(key)?.output.scriptRef;
    if (scriptRef) size += BigInt(scriptRef.length / 2);
    else size += BigInt(stated?.get(key) ?? 0);
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
    /** The collateral parts `given` comes from, for the part an error names */
    givenParts?: readonly TxPart[];
    /** The collateral return part, which states `givenTotal` when it is given */
    returnPart?: TxPart;
    givenTotal?: bigint;
    address: string;
    pool: readonly UTxO[];
  },
): CollateralPlan => {
  const { params } = ctx;
  const percent = BigInt(params.collateralPercent);
  const minimum = (fee * percent + 99n) / 100n;
  const required = ctx.givenTotal ?? minimum;
  const adaOnlyMin = outputMinCoin(
    { address: ctx.address, amount: { coin: "0" } },
    params.coinsPerUtxoSize,
  );
  const fail = (
    message: string,
    details: { required: bigint; available: bigint },
    part?: TxPart,
  ): never => {
    throw new TxBuildError("INSUFFICIENT_COLLATERAL", message, {
      ...(part && {
        part: part.kind,
        ...(part.label !== undefined && { label: part.label }),
      }),
      details,
    });
  };
  const lovelaceIn = (inputs: readonly UTxO[]) =>
    inputs.reduce((total, u) => total + lovelaceOf(u), 0n);

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
      { required: minimum, available: required },
      ctx.returnPart,
    );

  if (ctx.given.length > 0) {
    // The inputs are at fault: the collateral part, when one part gives them all
    const atFault =
      ctx.givenParts?.length === 1 ? ctx.givenParts[0] : undefined;
    return (
      plan(ctx.given) ??
      fail(
        `the collateral inputs cannot cover ${required} lovelace and return the rest`,
        { required, available: lovelaceIn(ctx.given) },
        atFault,
      )
    );
  }

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
  const shortfall = new TxBuildError(
    "INSUFFICIENT_COLLATERAL",
    inputs.length === 0
      ? "no key-locked UTxO is available to put up as collateral"
      : `no ${params.maxCollateralInputs} UTxOs cover the ${required} lovelace collateral`,
    { details: { required, available: lovelaceIn(inputs) } },
  );
  poolShortfalls.add(shortfall);
  throw shortfall;
};
