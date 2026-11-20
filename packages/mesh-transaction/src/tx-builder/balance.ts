import type { Protocol, TransactionOutputPrototype } from "@meshsdk/common";
import { Address, CredentialType } from "@meshsdk/core-cst";

import type { AssembledTx } from "./assemble";
import type { InsufficientFundsDetails } from "./errors";
import type {
  Assets,
  CollateralPart,
  CollateralReturnPart,
  OutputPart,
  OutRef,
  SpendPart,
  TxPart,
  Utxo,
} from "./parts/types";
import type { Value } from "./value";
import { assembleTxPrototype, atMostOne } from "./assemble";
import { TxBuildError } from "./errors";
import { coversMinCoin, feeForSize, outputMinCoin, valueSize } from "./fee";
import { compareInputs } from "./ordering";
import { outRefString } from "./parts/normalize";
import {
  countedScriptSize,
  scriptRefOf,
  scriptSize,
  utxoKey,
} from "./parts/utxo";
import {
  addValues,
  coinValue,
  emptyValue,
  fromMultiAsset,
  subtractValues,
  toAssets,
  toMultiAsset,
  toValuePrototype,
  valueOf,
} from "./value";
import { placeholderWitnesses, pricedSigners } from "./witnesses";

/**
 * Replaces input selection. Called whenever something is missing, with what is missing written
 * as a candidate's `value` is: `lovelace` always there (it may be `0n`), a token only when it
 * is short. It answers with the out refs of the candidates it selects (the candidates
 * themselves will do): each must name a candidate (else INVALID_SELECTION), and a non-empty
 * need must get at least one (else INSUFFICIENT_FUNDS). Until the scripts are evaluated,
 * `context.fee` is an upper estimate, and so is a need of lovelace.
 */
export type SelectInputs = (
  need: Assets,
  /** Key-locked payer UTxOs not spent, read, excluded or selected yet */
  candidates: readonly Utxo[],
  context: {
    readonly round: number;
    readonly selected: readonly Utxo[];
    readonly fee: bigint;
    /** The build's protocol parameters, as a frozen copy */
    readonly params: Protocol;
  },
) => readonly OutRef[];

export type BalanceContext = {
  params: Protocol;
  costModels: readonly (readonly number[])[];
  /** The payer's change address, where change and, by default, the collateral return go */
  changeAddress: string;
  /**
   * UTxOs inputs and collateral may be selected from. Those the parts read are never selected,
   * and those named by collateral parts are never selected as inputs.
   */
  utxos: readonly Utxo[];
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
  collateralPool?: readonly Utxo[];
  /** Selects the inputs in place of the built-in selection */
  coinSelection?: SelectInputs;
  /**
   * Every selectable UTxO is spent, and what is left goes to this address in place of the
   * change address; the outputs it takes are change only when it is the change address
   */
  sendAllTo?: string;
  /** Every UTxO known to the build, keyed by `txHash#index` */
  known: ReadonlyMap<string, Utxo>;
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
  /**
   * `false`: collateral inputs given by parts are used as they are. Otherwise, when they do not
   * cover the collateral, inputs are added to them from the UTxOs collateral is chosen from
   */
  topUpCollateral?: boolean;
  /**
   * `false`: the collateral has neither a return nor a stated total, and all of the lovelace of
   * its inputs is at stake; its inputs must hold lovelace alone. Otherwise what is left of the
   * collateral is returned
   */
  collateralReturn?: boolean;
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

/** The collateral of a built transaction */
export type TxCollateral = {
  /** The collateral inputs: those given by parts first, then those the builder added or chose */
  inputs: Utxo[];
  /**
   * Lovelace forfeited if a script fails: the total the transaction states, else, without a
   * collateral return, all the lovelace of the inputs. Then the builder chooses the inputs that
   * put the least at stake, counting for each input after the first the fee of one more input
   * with its key witness: one input unless more spare more than they cost
   */
  total: bigint;
  /**
   * What is left of the collateral, returned if a script fails: the UTxO it then becomes,
   * output number `outputs.length` of the transaction. Absent when the transaction has no
   * collateral return (`collateralReturn: false`, or a rest too small to be an output)
   */
  return?: Utxo;
};

/** The collateral balancing puts up, its return as the body holds it */
export type BalancedCollateral = {
  inputs: Utxo[];
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
  selected: Utxo[];
  /**
   * The output parts of `parts` that return change to the payer's change address: those that
   * took what was left, unless it was sent to another address
   */
  change: OutputPart[];
  /** The minimum fee of the transaction, with a witness for every key expected to sign */
  minFee: bigint;
  collateral?: BalancedCollateral;
};

/** A round that settled: its parts, fee, change outputs, minimum fee and collateral */
type Settled = {
  all: TxPart[];
  fee: bigint;
  change: OutputPart[];
  minFee: bigint;
  collateral: BalancedCollateral | undefined;
};

/** Most balancing rounds; each one selects more inputs or raises the fee */
const MAX_ROUNDS = 50;

/** The largest quantity of lovelace or of a token one output can hold */
const MAX_QUANTITY = 2n ** 64n - 1n;

/** The largest lovelace quantity, to size values whatever lovelace they end up holding */
const MAX_COIN = MAX_QUANTITY.toString();

/** The bytes one more collateral input adds to a transaction at most: it and a key witness */
export const COLLATERAL_INPUT_BYTES = 140;

/**
 * Without a collateral return, how many of the UTxOs smaller than what is missing the search for
 * two or three collateral inputs looks at: the largest ones
 */
const COLLATERAL_SEARCH_LIMIT = 64;

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
export const isKeyLocked = (utxo: Utxo) => {
  const address = Address.fromString(utxo.address);
  if (!address) return false;
  if (address.asByron()) return true;
  return address.getProps().paymentPart?.type === CredentialType.KeyHash;
};

/** Whether a UTxO holds lovelace alone, no token */
export const lovelaceOnly = (utxo: Utxo) =>
  Object.entries(utxo.value).every(
    ([unit, quantity]) => unit === "lovelace" || quantity === 0n,
  );

/** UTxOs in the order of their out refs: by transaction id, then by output index */
const byOutRef = (a: Utxo, b: Utxo) =>
  compareInputs(
    { transaction_id: a.txHash, index: a.outputIndex },
    { transaction_id: b.txHash, index: b.outputIndex },
  );

/**
 * The payer's UTxOs selection may take for payment: key-locked, not spent, read or named as
 * collateral by a part, and not refused by the filter; with the count of the others, each by
 * its first reason
 */
export const paymentPool = (
  parts: readonly TxPart[],
  utxos: readonly Utxo[],
  refused: ReadonlySet<string> = new Set(),
  spentByAfter = 0,
  selectableCollateral: ReadonlySet<string> = new Set(),
): { pool: Utxo[]; counts: InsufficientFundsDetails["pool"] } => {
  const spent = new Set(
    parts.flatMap((p) => (p.kind === "spend" ? [utxoKey(p.utxo!)] : [])),
  );
  const read = readByParts(parts);
  const putUp = putUpByParts(parts);
  for (const key of selectableCollateral) putUp.delete(key);
  const pool: Utxo[] = [];
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
  utxos: readonly Utxo[],
  canSelect?: (utxo: Utxo) => boolean,
): Utxo[] => {
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
 * UTxOs it chooses from cannot cover it, alone or added to the inputs given by parts. Not for
 * given inputs used as they are, nor for a given total below the minimum.
 */
export const isPoolShortfall = (error: unknown) =>
  typeof error === "object" && error !== null && poolShortfalls.has(error);

/**
 * What balancing knew of a round that was larger than the ledger allows: the inputs selection
 * had added, in the order it took them, the inputs the round put up as collateral (given by
 * parts, chosen by the builder or given by a wallet), and what the parts bring into the
 * transaction and take out of it, the fee aside, as `valueFlow` gives them
 */
export type OversizedRound = {
  readonly selected: readonly Utxo[];
  readonly collateral: readonly Utxo[];
  readonly consumed: Value;
  readonly produced: Value;
};

/** The rounds behind TX_TOO_LARGE errors, by error; none for a sweep (`sendAllTo`) */
const oversized = new WeakMap<object, OversizedRound>();

/**
 * The round behind a TX_TOO_LARGE error balancing raised, when it was not a sweep; undefined for
 * any other value. The error itself is not changed: this is known only to the code that asks.
 */
export const oversizedRoundOf = (error: unknown): OversizedRound | undefined =>
  typeof error === "object" && error !== null
    ? oversized.get(error)
    : undefined;

/**
 * The out refs of the UTxOs a filter refuses, asking it once about each UTxO it could let be
 * selected: key-locked, not read by a part and not named as collateral. What the filter throws
 * is not caught.
 */
export const refusedBy = (
  canSelect: (utxo: Utxo) => boolean,
  parts: readonly TxPart[],
  utxos: readonly Utxo[],
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
        consumed.push(valueOf(part.utxo!.value));
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

/** Bytes of a CBOR head carrying a number: an integer's value, or a string's or a map's length */
const headBytes = (n: bigint): number =>
  n < 24n ? 1 : n < 0x100n ? 2 : n < 0x10000n ? 3 : n < 0x100000000n ? 5 : 9;

/** Bytes of a CBOR byte string written from hex: its head and its bytes */
const hexStringBytes = (hex: string): number => {
  const length = Math.ceil(hex.length / 2);
  return headBytes(BigInt(length)) + length;
};

/** Bytes of a value's array head and of its lovelace, the most an output can hold */
const VALUE_HEAD_BYTES = 1 + headBytes(BigInt(MAX_COIN));

/** Hex characters of a policy id at the start of a unit */
const POLICY_HEX = 56;

/**
 * What a bundle's size is worked out from: how many policies it holds, its last policy and how
 * many of its tokens that one has, and the bytes of everything else but the value's heads: the
 * policy ids, the names, the quantities, and the heads of the maps of names of the policies
 * before the last
 */
type BundleBytes = {
  policies: number;
  policy: string;
  inPolicy: number;
  bytes: number;
};

const NO_BYTES: BundleBytes = {
  policies: 0,
  policy: "",
  inPolicy: 0,
  bytes: 0,
};

/** A bundle's figures with one more token, which sorts after all of its own */
const withToken = (
  bundle: BundleBytes,
  unit: string,
  quantity: bigint,
): BundleBytes => {
  const policy = unit.slice(0, POLICY_HEX);
  // A negative quantity is written as -1 - n, which takes no more bytes than its magnitude
  const token =
    hexStringBytes(unit.slice(POLICY_HEX)) +
    headBytes(quantity < 0n ? -quantity : quantity);
  if (bundle.policies > 0 && policy === bundle.policy)
    return {
      ...bundle,
      inPolicy: bundle.inPolicy + 1,
      bytes: bundle.bytes + token,
    };
  return {
    policies: bundle.policies + 1,
    policy,
    inPolicy: 1,
    bytes:
      bundle.bytes +
      (bundle.policies > 0 ? headBytes(BigInt(bundle.inPolicy)) : 0) +
      hexStringBytes(policy) +
      token,
  };
};

/**
 * A bundle's size, never below the size of its value serialized with the most lovelace: the
 * array head, the lovelace, the head of the map of policies, and the head of the last policy's
 * map of names, beside the bytes counted as tokens are added. Each head is the size its count
 * takes; quantities at the size of their magnitude, names and ids rounded up to whole bytes.
 */
const bundleBytes = (bundle: BundleBytes): number =>
  VALUE_HEAD_BYTES +
  headBytes(BigInt(bundle.policies)) +
  bundle.bytes +
  headBytes(BigInt(bundle.inPolicy));

/**
 * VALUE_TOO_LARGE for a token the inputs bring more of than one output can hold: no output can
 * take it, however the tokens are split. Its size is that of a value holding the token alone,
 * the quantity written as a CBOR big number
 */
const tooMuchOf = (unit: string, quantity: bigint, maxValSize: number) =>
  new TxBuildError(
    "VALUE_TOO_LARGE",
    `token ${unit} comes to ${quantity} over the transaction's inputs, more than one output can hold (${MAX_QUANTITY}); spend fewer of the UTxOs that hold it: leave some out with canSelect, or name the inputs to spend`,
    {
      details: {
        size:
          bundleBytes(withToken(NO_BYTES, unit, 0n)) +
          hexStringBytes(quantity.toString(16)),
        maxValSize,
      },
    },
  );

/**
 * Splits tokens into bundles each fitting in an output, in unit order so that a policy's tokens
 * stay together as far as possible. A bundle fits when its value, with the most lovelace an
 * output can hold, takes at most `maxValSize` bytes; a token that does not fit on its own, or
 * whose quantity is more than an output can hold, is VALUE_TOO_LARGE.
 *
 * In one pass: the bundle's size is estimated as tokens are added, never below its serialized
 * size, and the bundle is serialized to be measured only when the estimate is above
 * `maxValSize`.
 */
export const bundleTokens = (
  assets: ReadonlyMap<string, bigint>,
  maxValSize: number,
): Map<string, bigint>[] => {
  const bundles: Map<string, bigint>[] = [];
  let current = new Map<string, bigint>();
  let figures = NO_BYTES;
  const sizeOf = (multiasset: ReturnType<typeof toMultiAsset>) =>
    valueSize({ coin: MAX_COIN, multiasset });
  // The serialized size of the current bundle with one more token, which sorts after its own
  const sizeWith = (unit: string, quantity: bigint) => {
    const multiasset = toMultiAsset(current) ?? {};
    (multiasset[unit.slice(0, POLICY_HEX)] ??= {})[unit.slice(POLICY_HEX)] =
      quantity.toString();
    return sizeOf(multiasset);
  };
  for (const unit of Array.from(assets.keys()).sort()) {
    const quantity = assets.get(unit)!;
    // Quantities are sums over inputs: this is where one first has to fit an output
    if (quantity > MAX_QUANTITY) throw tooMuchOf(unit, quantity, maxValSize);
    const grown = withToken(figures, unit, quantity);
    if (
      current.size > 0 &&
      bundleBytes(grown) > maxValSize &&
      sizeWith(unit, quantity) > maxValSize
    ) {
      bundles.push(current);
      current = new Map([[unit, quantity]]);
      figures = withToken(NO_BYTES, unit, quantity);
    } else {
      current.set(unit, quantity);
      figures = grown;
    }
    if (current.size === 1 && bundleBytes(figures) > maxValSize) {
      const size = sizeOf(toMultiAsset(current));
      if (size > maxValSize)
        throw new TxBuildError(
          "VALUE_TOO_LARGE",
          `token ${unit} does not fit in an output on its own`,
          { details: { size, maxValSize } },
        );
    }
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
    assets.size > 0 ? bundleTokens(assets, params.maxValSize) : [];
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

const spendPart = (utxo: Utxo): SpendPart => ({
  kind: "spend",
  input: { transaction_id: utxo.txHash, index: utxo.outputIndex },
  utxo,
  witness: { type: "key" },
});

const outputPart = (output: TransactionOutputPrototype): OutputPart => ({
  kind: "output",
  output: output as OutputPart["output"],
});

/**
 * Balances resolved parts whose redeemers all carry execution units, and whose outputs all
 * hold their lovelace: selects inputs, makes change, puts up collateral and settles the fee.
 *
 * Each round works out what is missing with the current fee and selects inputs for it; once
 * nothing is, it makes change, puts up collateral and prices the transaction with placeholder
 * witnesses. The fee only ever rises, and inputs are only ever added, so the rounds settle.
 * A transaction that settled above its minimum fee, because a later round made it smaller, is
 * priced once more at that minimum, and kept so when it still settles there.
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
  // Without a collateral return every unit of the collateral inputs is at stake, and the ledger
  // takes no token as collateral
  const withReturn = ctx.collateralReturn !== false;
  if (!withReturn)
    for (const part of givenCollateral)
      if (!lovelaceOnly(part.utxo!))
        throw new TxBuildError(
          "INVALID_COLLATERAL",
          `the collateral input ${outRefString(part.input)} holds native assets, which can only be put up with a collateral return: give collateral inputs without assets, or drop \`collateralReturn: false\``,
          {
            part: part.kind,
            ...(part.label !== undefined && { label: part.label }),
          },
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
  const selected: Utxo[] = [];
  const selectedKeys = new Set<string>();
  const select = (utxo: Utxo) => {
    selected.push(utxo);
    selectedKeys.add(utxoKey(utxo));
  };

  let fee = ctx.fee ?? 0n;

  /** What the parts bring in and every selectable UTxO holds, selected or not */
  const everything = () =>
    addValues(flow.consumed, ...pool.map((u) => valueOf(u.value)));

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
          ? putUpCollateral(estimated, true)
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
    addValues(flow.consumed, ...selected.map((u) => valueOf(u.value)));

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
    const included = `the fee of ${estimated.feeEstimate}${estimated.changeMinimum === undefined ? "" : ` and change of at least ${estimated.changeMinimum}`} included`;
    // What is available covers what the transaction takes: the one lovelace is the input a
    // transaction must spend, when refunds and withdrawals pay for the rest
    const onlyInput =
      unit === "lovelace" &&
      !unanswered &&
      required <= available &&
      spent.size + selected.length === 0;
    const what = onlyInput
      ? `${missing} lovelace are missing: the transaction must spend at least one input, and no UTxO of the payer can be selected; the ${available} available cover the ${required} it takes, ${included}`
      : unit === "lovelace"
        ? `${missing} lovelace are missing: the transaction takes ${required}, ${included}, and ${available} are available`
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

  // The parameters may be the provider cache's own object, which every build on that provider
  // reads: the caller's function gets a frozen copy, made once
  let frozenParams: Readonly<Protocol> | undefined;
  const selectionParams = () => (frozenParams ??= Object.freeze({ ...params }));

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
    const answer: unknown = coinSelection(toAssets(shortfall), candidates, {
      round,
      selected: [...selected],
      fee,
      params: selectionParams(),
    });
    /** An answer that is not a list of out refs: the function is not a `SelectInputs` */
    const notAList = (value: unknown) =>
      new TxBuildError(
        "INVALID_OPTION",
        "invalid coinSelection: it must return a list of the out refs of its candidates",
        {
          details: {
            option: "coinSelection",
            value,
            allowed:
              "a function returning a list of the out refs of its candidates, { txHash, outputIndex } each",
          },
        },
      );
    if (!Array.isArray(answer)) throw notAList(answer);
    const byKey = new Map(candidates.map((u) => [utxoKey(u), u]));
    const picked = new Map<string, Utxo>();
    for (const entry of answer as unknown[]) {
      const given = entry as {
        txHash?: unknown;
        outputIndex?: unknown;
      } | null;
      if (
        typeof given?.txHash !== "string" ||
        typeof given.outputIndex !== "number"
      )
        throw notAList(entry);
      const ref: OutRef = {
        txHash: given.txHash,
        outputIndex: given.outputIndex,
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
    const take = (utxo: Utxo) => {
      select(utxo);
      added = addValues(added, valueOf(utxo.value));
    };
    for (const unit of Array.from(shortfall.assets.keys()).sort()) {
      let missing =
        shortfall.assets.get(unit)! - (added.assets.get(unit) ?? 0n);
      const quantity = (u: Utxo) => u.value[unit] ?? 0n;
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
    const rank = (u: Utxo) =>
      (u.script ? 2 : 0) + (Object.keys(u.value).length > 1 ? 1 : 0);
    const candidates = pool
      .filter((u) => !selectedKeys.has(utxoKey(u)))
      .sort((a, b) => {
        const byRank = rank(a) - rank(b);
        if (byRank !== 0) return byRank;
        const diff = b.value.lovelace - a.value.lovelace;
        return diff !== 0n ? (diff > 0n ? 1 : -1) : 0;
      });
    for (const utxo of candidates) {
      if (missing <= 0n) break;
      select(utxo);
      missing -= utxo.value.lovelace;
    }
    if (missing > 0n) insufficient("lovelace");
  };

  const needsCollateral = runsPlutus || givenCollateral.length > 0;
  // Without a return UTxOs holding tokens are left out, and counted for the error's advice
  const collateralSource =
    ctx.collateralPool ??
    ctx.utxos.filter(
      (u) =>
        isKeyLocked(u) && !read.has(utxoKey(u)) && !refused.has(utxoKey(u)),
    );
  const collateralPool = collateralSource.filter(
    (u) => withReturn || lovelaceOnly(u),
  );
  /**
   * The collateral for a fee. Leniently, collateral that falls short is put up as given rather
   * than rejected: placeholder units overstate the fee it is worked out from
   */
  const putUpCollateral = (
    fee: bigint,
    lenient = ctx.provisional || ctx.lenientCollateral,
  ): BalancedCollateral => {
    const strict = () =>
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
        topUp: ctx.topUpCollateral !== false,
        withReturn,
        assetsLeftOut: collateralSource.length - collateralPool.length,
      });
    if (!lenient) return strict();
    try {
      return strict();
    } catch (error) {
      if (!(error instanceof TxBuildError)) throw error;
      const inputs = givenCollateral.map((p) => p.utxo!);
      return {
        inputs,
        total: addValues(...inputs.map((u) => valueOf(u.value))).coin,
      };
    }
  };

  /** The labels of the collateral parts, by out ref */
  const collateralLabels = new Map(
    givenCollateral.flatMap((p) =>
      p.label === undefined ? [] : [[outRefString(p.input), p.label] as const],
    ),
  );
  /**
   * The collateral and collateral return parts of a round, given ones keeping their labels;
   * without a collateral return, the collateral parts alone
   */
  const collateralParts = (collateral: BalancedCollateral): TxPart[] => [
    ...collateral.inputs.map((utxo): CollateralPart => {
      const label = collateralLabels.get(utxoKey(utxo));
      return {
        kind: "collateral",
        input: { transaction_id: utxo.txHash, index: utxo.outputIndex },
        utxo,
        ...(label !== undefined && { label }),
      };
    }),
    ...(withReturn
      ? [
          {
            kind: "collateralReturn" as const,
            address: givenReturn?.address ?? ctx.changeAddress,
            totalCollateral: collateral.total.toString(),
            ...(givenReturn?.label !== undefined && {
              label: givenReturn.label,
            }),
          },
        ]
      : []),
  ];

  /**
   * Why a round's transaction is larger than the ledger allows: `"selection"` when the parts fit
   * with one of the selected inputs, a change holding the tokens the parts leave over and those
   * of that input, and the round's collateral; `"parts"` when they do not, or when selection
   * added no input. It assembles and serializes one transaction more, and is asked only when the
   * round fails.
   */
  const causeOfSize = (
    fee: bigint,
    collateral: BalancedCollateral | undefined,
  ): "selection" | "parts" => {
    if (selected.length === 0) return "parts";
    const one = selected[0]!;
    // The input comes with its tokens, which go to the change
    const left = addValues(subtractValues(flow.consumed, flow.produced), {
      coin: 0n,
      assets: valueOf(one.value).assets,
    });
    const tokens = new Map(Array.from(left.assets).filter(([, n]) => n > 0n));
    let change: TransactionOutputPrototype[];
    try {
      change = leastChange(tokens, changeTo, params).outputs;
    } catch {
      // Tokens the parts leave over that fit no output
      return "parts";
    }
    const trial: TxPart[] = [
      ...core,
      spendPart(one),
      ...change.map(outputPart),
      ...(collateral ? collateralParts(collateral) : []),
    ];
    const sized = assembleTxPrototype(trial, {
      fee,
      costModels: ctx.costModels,
      ...placeholderWitnesses(pricedSigners(trial), ctx.extraKeyWitnesses),
    });
    return ctx.serialize(sized.prototype).length / 2 > params.maxTxSize
      ? "parts"
      : "selection";
  };

  /**
   * A settled round priced again at its minimum fee, with the same inputs, the same number of
   * change outputs and the same collateral inputs; undefined when it does not settle there. The
   * collateral is put up anew at the lower fee when that keeps its inputs and its return, else
   * kept as it was, which still covers the lower fee. Its pricing is traced as a round, kept or
   * not, as the rounds that raise the fee are.
   */
  const lowered = (
    settled: Settled,
    rest: Value,
    round: number,
  ): Settled | undefined => {
    const lower = settled.minFee;
    const change = makeChange(
      addValues(rest, coinValue(settled.fee - lower)),
      changeTo,
      params,
    );
    if (!Array.isArray(change) || change.length !== settled.change.length)
      return undefined;
    let collateral = settled.collateral;
    if (collateral) {
      const again = putUpCollateral(lower);
      if (
        again.inputs.length === collateral.inputs.length &&
        again.inputs.every((u, i) => u === collateral!.inputs[i]) &&
        (again.return === undefined) === (collateral.return === undefined)
      )
        collateral = again;
    }
    const changeParts = change.map(outputPart);
    const all: TxPart[] = [
      ...core,
      ...selected.map(spendPart),
      ...changeParts,
      ...(collateral ? collateralParts(collateral) : []),
    ];
    const sized = assembleTxPrototype(all, {
      fee: lower,
      costModels: ctx.costModels,
      ...placeholderWitnesses(pricedSigners(all), ctx.extraKeyWitnesses),
    });
    const size = ctx.serialize(sized.prototype).length / 2;
    ctx.onRound?.({
      round: round + 1,
      fee: lower,
      size,
      selected: selected.length,
    });
    if (size > params.maxTxSize) return undefined;
    const required = feeForSize(
      size,
      refScriptSize(sized, ctx.known, ctx.scriptSizes),
      totalExUnits(sized),
      params,
    );
    if (required > lower) return undefined;
    return {
      all,
      fee: lower,
      change: changeParts,
      minFee: required,
      collateral,
    };
  };

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

    const collateral = needsCollateral ? putUpCollateral(fee) : undefined;
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
    if (size > params.maxTxSize) {
      const tooLarge = new TxBuildError(
        "TX_TOO_LARGE",
        `the transaction takes ${size} bytes, more than the ${params.maxTxSize} allowed`,
        {
          details: {
            size,
            maxTxSize: params.maxTxSize,
            cause: causeOfSize(fee, collateral),
          },
        },
      );
      // A sweep spends every selectable UTxO by rule: its selection is not one to split
      if (ctx.sendAllTo === undefined)
        oversized.set(tooLarge, {
          selected: [...selected],
          collateral: collateral ? [...collateral.inputs] : [],
          consumed: flow.consumed,
          produced: flow.produced,
        });
      throw tooLarge;
    }
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
    if (ctx.fee !== undefined || required <= fee) {
      const settled: Settled = {
        all,
        fee,
        change: changeParts,
        minFee: required,
        collateral,
      };
      // The rounds only raise the fee, so a round that made the transaction smaller (collateral
      // put up without a return, say) leaves it above the minimum: it is priced once more at
      // that minimum. A provisional round's fee is an upper bound, and a given fee stays
      const final =
        ctx.fee === undefined && !ctx.provisional && required < fee
          ? (lowered(settled, rest, round) ?? settled)
          : settled;
      return {
        assembled: assembleTxPrototype(final.all, {
          fee: final.fee,
          costModels: ctx.costModels,
        }),
        parts: final.all,
        fee: final.fee,
        selected,
        // What is sent to another address is not the payer's change
        change: changeTo === ctx.changeAddress ? final.change : [],
        minFee: final.minFee,
        ...(final.collateral && { collateral: final.collateral }),
      };
    }
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
  known: ReadonlyMap<string, Utxo>,
  stated?: ReadonlyMap<string, number>,
): bigint => {
  const { body } = assembled.prototype;
  let size = 0n;
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const key = `${input.transaction_id}#${input.index}`;
    const script = known.get(key)?.script;
    if (script) size += BigInt(scriptSize(script));
    else size += BigInt(stated?.get(key) ?? 0);
  }
  return size;
};

/**
 * The bytes of the reference scripts the transaction's inputs and reference inputs hold, as the
 * ledger counts them toward `MAX_REF_SCRIPT_BYTES`, each out ref once: those of the known UTxOs,
 * else the size stated for the out ref
 */
export const countedRefScripts = (
  assembled: AssembledTx,
  known: ReadonlyMap<string, Utxo>,
  stated?: ReadonlyMap<string, number>,
): number => {
  const { body } = assembled.prototype;
  const seen = new Set<string>();
  let size = 0;
  for (const input of [...body.inputs, ...(body.reference_inputs ?? [])]) {
    const key = `${input.transaction_id}#${input.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const script = known.get(key)?.script;
    size += script
      ? countedScriptSize(scriptRefOf(script))
      : (stated?.get(key) ?? 0);
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
 * Without a return (`withReturn` false) all of the lovelace of the inputs is at stake, and the
 * pool holds lovelace-only UTxOs alone: the inputs chosen are those that cover the requirement
 * at the least cost, the lovelace at stake plus, for each input after the first, the fee of one
 * more input with its key witness (`COLLATERAL_INPUT_BYTES` at `minFeeA`), so that several are
 * taken over one only when they spare more than they cost; UTxOs holding a reference script
 * only when the others cannot.
 *
 * Given collateral inputs that cover the requirement are used as they are. Otherwise inputs are
 * chosen from the pool: the smallest lovelace-only UTxO that covers the requirement and leaves a
 * return worth making, else the smallest that covers it, else the largest ones, up to
 * `maxCollateralInputs`, else the smallest UTxO holding tokens or a reference script alone. Given
 * inputs that do not cover it are topped up so, after them and with them counted, unless `topUp`
 * is false: then they are rejected.
 *
 * A return too small to be an output is left out, and the whole collateral is forfeited
 * instead, unless the total was given.
 */
const collateralFor = (
  fee: bigint,
  ctx: {
    params: Protocol;
    given: Utxo[];
    /** The collateral parts `given` comes from, for the part an error names */
    givenParts?: readonly TxPart[];
    /** The collateral return part, which states `givenTotal` when it is given */
    returnPart?: TxPart;
    givenTotal?: bigint;
    address: string;
    pool: readonly Utxo[];
    /** Given inputs that do not cover the requirement get inputs from the pool added */
    topUp: boolean;
    /** False: no return and no stated total; all of the inputs' lovelace is at stake */
    withReturn: boolean;
    /** Without a return, the UTxOs left out of `pool` because they hold tokens */
    assetsLeftOut: number;
  },
): BalancedCollateral => {
  const { params } = ctx;
  const percent = BigInt(params.collateralPercent);
  const minimum = (fee * percent + 99n) / 100n;
  const required = ctx.givenTotal ?? minimum;
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
  const lovelaceIn = (inputs: readonly Utxo[]) =>
    inputs.reduce((total, u) => total + u.value.lovelace, 0n);

  const cover = (inputs: Utxo[]): BalancedCollateral | undefined => {
    const held = addValues(...inputs.map((u) => valueOf(u.value)));
    if (held.coin < required) return undefined;
    // Without a return the inputs are forfeited whole, and may hold nothing but lovelace
    if (!ctx.withReturn)
      return held.assets.size > 0 ? undefined : { inputs, total: held.coin };
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

  /**
   * Inputs from the pool that make the collateral cover after `given`, each UTxO once and never
   * a given one, judged by what `cover` gives with them: the smallest lovelace-only UTxO without
   * a reference script that leaves a return worth making (nothing forfeited beyond the
   * requirement), else the smallest of those that covers, else the largest ones, lovelace-only
   * first, up to `room`, else the smallest of the others alone. Without a cover, the inputs the
   * largest-first phase tried, and whether it ran out of UTxOs before `room`.
   */
  const choose = (
    given: Utxo[],
    room: number,
  ):
    | { found: BalancedCollateral }
    | { found?: undefined; tried: Utxo[]; usedUp: boolean } => {
    const seen = new Set(given.map((u) => utxoKey(u)));
    const candidates = ctx.pool.filter((u) => {
      const key = utxoKey(u);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const byLovelace = (a: Utxo, b: Utxo) => {
      const diff = a.value.lovelace - b.value.lovelace;
      return diff !== 0n ? (diff > 0n ? 1 : -1) : 0;
    };
    const adaOnly = candidates
      .filter((u) => Object.keys(u.value).length === 1 && !u.script)
      .sort(byLovelace);
    const withOne = adaOnly.map((u) => cover([...given, u]));
    const one =
      withOne.find((c) => c?.total === required) ??
      withOne.find((c) => c !== undefined);
    if (one) return { found: one };
    const others = candidates.filter((u) => !adaOnly.includes(u));
    const added: Utxo[] = [];
    for (const utxo of [...[...adaOnly].reverse(), ...others]) {
      if (added.length >= room) break;
      added.push(utxo);
      const found = cover([...given, ...added]);
      if (found) return { found };
    }
    // Last, one UTxO holding tokens or a reference script alone, which can cover where the
    // largest ones leave a rest too small to return or use up the room first
    for (const utxo of [...others].sort(byLovelace)) {
      const found = cover([...given, utxo]);
      if (found) return { found };
    }
    return { tried: added, usedUp: added.length < room };
  };

  /**
   * Without a return: the inputs from the pool, after `given`, that make the collateral cover at
   * the least cost, the lovelace at stake plus `perInput` for each input, among UTxOs without a
   * reference script, else among all of the pool; ties go to fewer inputs, then to the smaller
   * out refs. Exact for sets of one, two and three: the smallest UTxO that covers alone, and the
   * cheapest pair and triple of the `COLLATERAL_SEARCH_LIMIT` largest UTxOs below what is
   * missing (a UTxO that covers alone costs a set more than it costs alone). Never more than
   * `room` inputs; where `room` allows more than three and no set of three covers, the largest
   * ones until they cover. Undefined when none cover.
   */
  const chooseAtStake = (
    given: Utxo[],
    room: number,
  ): BalancedCollateral | undefined => {
    const perInput = BigInt(params.minFeeA) * BigInt(COLLATERAL_INPUT_BYTES);
    const missing = required - lovelaceIn(given);
    const keys = new Set(given.map((u) => utxoKey(u)));
    const candidates = ctx.pool
      .filter((u) => {
        const key = utxoKey(u);
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      })
      .sort((a, b) => {
        const diff = a.value.lovelace - b.value.lovelace;
        return diff !== 0n ? (diff > 0n ? 1 : -1) : byOutRef(a, b);
      });
    const costOf = (set: readonly Utxo[]) =>
      lovelaceIn(set) + perInput * BigInt(set.length);
    /** Whether `a` is the better set: cheaper, else fewer inputs, else smaller out refs */
    const better = (a: readonly Utxo[], b: readonly Utxo[]) => {
      const diff = costOf(a) - costOf(b);
      if (diff !== 0n) return diff < 0n;
      if (a.length !== b.length) return a.length < b.length;
      const refsA = [...a].sort(byOutRef);
      const refsB = [...b].sort(byOutRef);
      for (let i = 0; i < refsA.length; i++) {
        const order = byOutRef(refsA[i]!, refsB[i]!);
        if (order !== 0) return order < 0;
      }
      return false;
    };
    /** The first index from `from` on whose UTxO holds at least `lovelace` */
    const atLeast = (
      sorted: readonly Utxo[],
      from: number,
      lovelace: bigint,
    ) => {
      let low = from;
      let high = sorted.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (sorted[middle]!.value.lovelace < lovelace) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    const least = (sorted: readonly Utxo[]): Utxo[] | undefined => {
      let best: Utxo[] | undefined;
      const consider = (set: Utxo[]) => {
        if (!best || better(set, best)) best = set;
      };
      const firstCover = atLeast(sorted, 0, missing);
      if (firstCover < sorted.length) consider([sorted[firstCover]!]);
      const below = sorted.slice(
        Math.max(0, firstCover - COLLATERAL_SEARCH_LIMIT),
        firstCover,
      );
      const size = Math.min(room, 3);
      for (let i = 0; size >= 2 && i < below.length; i++) {
        const rest = missing - below[i]!.value.lovelace;
        const k = atLeast(below, i + 1, rest);
        if (k < below.length) consider([below[i]!, below[k]!]);
        for (let j = i + 1; size >= 3 && j < below.length; j++) {
          const last = rest - below[j]!.value.lovelace;
          // The pair covers: a third input only costs more
          if (last <= 0n) break;
          const third = atLeast(below, j + 1, last);
          if (third < below.length)
            consider([below[i]!, below[j]!, below[third]!]);
        }
      }
      if (best || room <= 3) return best;
      // More than three inputs: the largest ones until they cover
      const set: Utxo[] = [];
      for (const utxo of [...sorted].reverse()) {
        if (set.length >= room) break;
        set.push(utxo);
        if (lovelaceIn(set) >= missing) return set;
      }
      return undefined;
    };
    // A UTxO holding a reference script is put up last: the script goes with it
    const set = least(candidates.filter((u) => !u.script)) ?? least(candidates);
    if (!set) return undefined;
    // The largest first
    const ordered = [...set].sort((a, b) => {
      const diff = b.value.lovelace - a.value.lovelace;
      return diff !== 0n ? (diff > 0n ? 1 : -1) : byOutRef(a, b);
    });
    return cover([...given, ...ordered]);
  };

  /** What a shortfall without a return adds when UTxOs holding tokens were left out */
  const withoutAssets =
    ctx.withReturn || ctx.assetsLeftOut === 0
      ? ""
      : "; UTxOs holding native assets cannot be collateral without a collateral return: give collateral inputs without assets, or drop `collateralReturn: false`";
  /** How the shortfall names a key-locked UTxO it could not find */
  const keyLocked =
    ctx.withReturn || ctx.assetsLeftOut === 0
      ? "key-locked UTxO"
      : "key-locked UTxO without native assets";

  /** Names the UTxOs a choice tried when there were no more to try, for its error */
  const allOf = (count: number, may: string) =>
    count === 1
      ? `the only UTxO that can ${may} does not`
      : `the ${count} UTxOs that can ${may} do not`;

  /**
   * The given inputs, which do not cover the requirement, followed by inputs from the pool that
   * make them cover it: by the preference of the builder's own choice, judged with the given
   * inputs counted. Fails as a shortfall of the pool when no such inputs fit within
   * `maxCollateralInputs`.
   */
  const topUpGiven = (
    notCovered: string,
    atFault: TxPart | undefined,
  ): BalancedCollateral => {
    const { given } = ctx;
    const room = params.maxCollateralInputs - given.length;
    if (room <= 0)
      fail(
        `${notCovered}, and no input can be added to them: a transaction puts up at most ${params.maxCollateralInputs}`,
        { required, available: lovelaceIn(given) },
        atFault,
      );
    // Without a return, that choice is the whole choice; the other only names what it tried
    const atStake = ctx.withReturn ? undefined : chooseAtStake(given, room);
    if (atStake) return atStake;
    const choice = choose(given, room);
    if (choice.found) return choice.found;
    const { tried, usedUp } = choice;
    const shortfall = new TxBuildError(
      "INSUFFICIENT_COLLATERAL",
      (tried.length === 0
        ? `${notCovered}, and no ${keyLocked} is available to add to them`
        : usedUp
          ? `${notCovered}, and ${allOf(tried.length, "be added to them")} make them cover it`
          : `${notCovered}, and no ${tried.length} more UTxOs added to them cover it`) +
        withoutAssets,
      {
        ...(atFault && {
          part: atFault.kind,
          ...(atFault.label !== undefined && { label: atFault.label }),
        }),
        details: { required, available: lovelaceIn([...given, ...tried]) },
      },
    );
    poolShortfalls.add(shortfall);
    throw shortfall;
  };

  if (required < minimum)
    fail(
      `the total collateral ${required} is below the ${minimum} lovelace the fee calls for`,
      { required: minimum, available: required },
      ctx.returnPart,
    );

  if (ctx.given.length > 0) {
    const covered = cover(ctx.given);
    if (covered) return covered;
    // The inputs are at fault: the collateral part, when one part gives them all
    const atFault =
      ctx.givenParts?.length === 1 ? ctx.givenParts[0] : undefined;
    const notCovered = ctx.withReturn
      ? `the collateral inputs cannot cover ${required} lovelace and return the rest`
      : `the collateral inputs cannot cover ${required} lovelace`;
    if (!ctx.topUp)
      fail(notCovered, { required, available: lovelaceIn(ctx.given) }, atFault);
    return topUpGiven(notCovered, atFault);
  }

  const atStake = ctx.withReturn
    ? undefined
    : chooseAtStake([], params.maxCollateralInputs);
  if (atStake) return atStake;
  const choice = choose([], params.maxCollateralInputs);
  if (choice.found) return choice.found;
  const { tried, usedUp } = choice;
  const shortfall = new TxBuildError(
    "INSUFFICIENT_COLLATERAL",
    (tried.length === 0
      ? `no ${keyLocked} is available to put up as collateral`
      : usedUp
        ? `${allOf(tried.length, "be put up as collateral")} cover ${required} lovelace${ctx.withReturn ? " and return the rest" : ""}`
        : `no ${tried.length} UTxOs cover the ${required} lovelace collateral`) +
      withoutAssets,
    { details: { required, available: lovelaceIn(tried) } },
  );
  poolShortfalls.add(shortfall);
  throw shortfall;
};
