import type {
  Budget,
  ExUnitsPrototype,
  IEvaluator,
  IFetcher,
  IMeshTxSerializer,
  Protocol,
  RedeemerTagType,
  TransactionOutputPrototype,
  TransactionPrototype,
  UTxO,
} from "@meshsdk/common";
import {
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
} from "@meshsdk/common";
import {
  Transaction,
  transactionPrototypeToHex,
  TxCBOR,
} from "@meshsdk/core-cst";

import type { AssembledRedeemer } from "./assemble";
import type { Balanced, CollateralPlan } from "./balance";
import type { OutputPart, PlutusWitness, TxPart } from "./parts/types";
import type { GovernanceDeposits } from "./resolve";
import { balance, totalExUnits } from "./balance";
import { TxBuildError } from "./errors";
import { coversMinCoin, minCoin, valueSize } from "./fee";
import { auxiliaryDataHashOf, scriptDataHashOf } from "./hashes";
import { freeze } from "./parts/normalize";
import { resolveParts, utxoKey } from "./resolve";

export type TxBuilderOptions = {
  /** Looks up outputs given by reference, reward balances, and the parameters below */
  fetcher?: IFetcher;
  /** Works out the execution units of redeemers given without them */
  evaluator?: IEvaluator;
  /**
   * Serializes the transaction; must implement `serializeTxPrototype`. The prototype encoder of
   * `@meshsdk/core-cst` when omitted.
   */
  serializer?: IMeshTxSerializer;
  /**
   * Protocol parameters; fetched when omitted and a fetcher is given, Mesh's defaults
   * otherwise
   */
  params?: Protocol;
  /**
   * Cost models of Plutus V1, V2 and V3, in that order, for the script data hash; fetched
   * when omitted and a fetcher is given, Mesh's defaults otherwise
   */
  costModels?: number[][];
  /** The governance deposits, which `Protocol` does not carry */
  deposits?: GovernanceDeposits;
};

export type BuildTxRequest = {
  /** The transaction's parts, from the part builders */
  parts: readonly TxPart[];
  /** Where change, and by default the collateral return, goes */
  changeAddress: string;
  /**
   * UTxOs to pay for the transaction and put up collateral from, typically the wallet's. Only
   * key-locked ones are selected. Parts may also reference them by out ref alone.
   */
  utxos?: readonly UTxO[];
  /** A fee to use as is instead of the minimum fee; it must not be below the minimum */
  fee?: bigint;
  /**
   * Operator key hashes of pools that are already registered, so that registering them again
   * (updating them) takes no deposit
   */
  registeredPools?: readonly string[];
  /** Key witnesses expected beyond those the parts call for, e.g. by a multi-signature wallet */
  extraKeyWitnesses?: number;
};

export type BuiltRedeemer = {
  tag: AssembledRedeemer["tag"];
  index: number;
  exUnits: Budget;
  /** The part the redeemer belongs to */
  part: AssembledRedeemer["part"];
  label?: string;
};

/** A transaction built and balanced, ready to sign */
export type BuiltTx = {
  /** The unsigned transaction, in CBOR hex */
  tx: string;
  txHash: string;
  /** The transaction as a value, exactly as serialized */
  prototype: TransactionPrototype;
  fee: bigint;
  /** Total execution units of the transaction's redeemers */
  exUnits: { mem: bigint; steps: bigint };
  redeemers: BuiltRedeemer[];
  /** Every input spent, in the transaction's order */
  inputs: UTxO[];
  /** The inputs added to pay for the transaction */
  selectedInputs: UTxO[];
  /** The outputs returning change */
  change: TransactionOutputPrototype[];
  /** The collateral, when the transaction runs Plutus scripts */
  collateral?: CollateralPlan;
  /** Every part of the transaction, resolved, the ones added by balancing included */
  parts: TxPart[];
};

/** Most evaluation rounds; the second one normally settles the execution units */
const MAX_EVALUATION_ROUNDS = 5;

const EVALUATOR_TAGS: Record<RedeemerTagType, AssembledRedeemer["tag"]> = {
  SPEND: "SPEND",
  MINT: "MINT",
  CERT: "CERT",
  REWARD: "REWARD",
  VOTE: "VOTE",
  PROPOSE: "VOTING_PROPOSAL",
};

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : JSON.stringify(error);

const runsPlutus = (part: TxPart) =>
  "witness" in part && part.witness.type === "plutus";

const withExUnits = (part: TxPart, exUnits: ExUnitsPrototype): TxPart => {
  const { witness } = part as Extract<TxPart, { witness: unknown }>;
  if (witness.type !== "plutus") return part;
  return freeze({
    ...part,
    witness: { ...witness, redeemer: { ...witness.redeemer, exUnits } },
  } as TxPart);
};

const exceeds = (a: ExUnitsPrototype, b: ExUnitsPrototype) =>
  BigInt(a.mem) > BigInt(b.mem) || BigInt(a.steps) > BigInt(b.steps);

const maxUnits = (
  a: ExUnitsPrototype,
  b: ExUnitsPrototype,
): ExUnitsPrototype => ({
  mem: (BigInt(a.mem) > BigInt(b.mem) ? a.mem : b.mem).toString(),
  steps: (BigInt(a.steps) > BigInt(b.steps) ? a.steps : b.steps).toString(),
});

/**
 * Builds transactions from parts: looks up what they leave open, balances them, works out the
 * execution units of their scripts, and serializes the result.
 *
 * A builder holds only its providers and settings, so one builder can build any number of
 * transactions, concurrently included.
 *
 * ```ts
 * const builder = new TxBuilder({ fetcher: provider, evaluator: provider });
 * const { tx, fee } = await builder.build({
 *   parts: [output({ address, value: { lovelace: 5_000_000n } })],
 *   changeAddress: walletAddress,
 *   utxos: walletUtxos,
 * });
 * ```
 */
export class TxBuilder {
  readonly fetcher?: IFetcher;
  readonly evaluator?: IEvaluator;
  readonly serializer?: IMeshTxSerializer;
  readonly params?: Protocol;
  readonly costModels?: number[][];
  readonly deposits: GovernanceDeposits;

  constructor(options: TxBuilderOptions = {}) {
    if (options.fetcher) this.fetcher = options.fetcher;
    if (options.evaluator) this.evaluator = options.evaluator;
    if (options.serializer) {
      if (!options.serializer.serializeTxPrototype)
        throw new TxBuildError(
          "UNSUPPORTED_SERIALIZER",
          "the serializer does not implement serializeTxPrototype",
        );
      this.serializer = options.serializer;
    }
    if (options.params) this.params = options.params;
    if (options.costModels) this.costModels = options.costModels;
    this.deposits = { ...options.deposits };
  }

  /**
   * Serializes a transaction prototype as this builder does: with its serializer, or the
   * `@meshsdk/core-cst` prototype encoder
   */
  serialize(prototype: TransactionPrototype): string {
    return this.serializer
      ? this.serializer.serializeTxPrototype!(prototype)
      : transactionPrototypeToHex(prototype);
  }

  /**
   * Builds a balanced, unsigned transaction from parts.
   *
   * 1. Looks up, all at once and once each, the outputs the parts reference, the reward
   *    balances they withdraw in full, the protocol parameters and (when Plutus scripts run) the
   *    cost models.
   * 2. Fills in what the parts leave open: reference scripts, datums, deposits, output lovelace.
   * 3. Balances: selects inputs from `utxos`, returns change, puts up collateral with a
   *    collateral return, and settles the fee.
   * 4. Evaluates the scripts and balances again with their execution units, until they settle.
   *
   * Redeemer indices follow from where each item ends up in the ledger's order, assigned once
   * by `assembleTxPrototype`; evaluation results are matched back to their parts through them.
   *
   * @throws TxBuildError when the transaction cannot be built; TxPartError when what is looked
   *   up does not fit a part (e.g. a reference output holding a different script)
   */
  async build(request: BuildTxRequest): Promise<BuiltTx> {
    const known = new Map<string, UTxO>();
    for (const utxo of request.utxos ?? []) known.set(utxoKey(utxo), utxo);
    const plutus = request.parts.some(runsPlutus);

    const [params, costModels] = await Promise.all([
      this.loadParams(),
      plutus ? this.loadCostModels() : Promise.resolve([]),
    ]);
    const resolved = await resolveParts(request.parts, {
      ...(this.fetcher && { fetcher: this.fetcher }),
      params,
      deposits: this.deposits,
      known,
    });
    const parts = resolved.map((part) =>
      part.kind === "output" ? withMinCoin(part, params) : part,
    );

    // Execution units: as given, or placeholders until evaluation fills them in
    const redeemerParts = parts.flatMap((part, i) =>
      runsPlutus(part) ? [i] : [],
    );
    const given = new Map<number, ExUnitsPrototype>();
    for (const i of redeemerParts) {
      const { witness } = parts[i] as { witness: PlutusWitness };
      if (witness.redeemer.exUnits) given.set(i, witness.redeemer.exUnits);
    }
    const open = redeemerParts.filter((i) => !given.has(i));
    if (open.length > 0 && !this.evaluator)
      throw new TxBuildError(
        "MISSING_EVALUATOR",
        `${open.length} redeemer(s) have no execution units, and no evaluator is given`,
      );
    const units = new Map<number, ExUnitsPrototype>(
      open.map((i) => [i, placeholderUnits(params, given, open.length)]),
    );
    const evaluated = new Set<number>();

    const context = {
      params,
      costModels,
      changeAddress: request.changeAddress,
      utxos: request.utxos ?? [],
      known,
      ...(request.fee !== undefined && { fee: request.fee }),
      registeredPools: new Set(request.registeredPools ?? []),
      extraKeyWitnesses: request.extraKeyWitnesses ?? 0,
      serialize: (prototype: TransactionPrototype) => this.serialize(prototype),
    };

    for (let round = 0; round < MAX_EVALUATION_ROUNDS; round++) {
      const roundParts = parts.map((part, i) => {
        const exUnits = units.get(i);
        return exUnits ? withExUnits(part, exUnits) : part;
      });
      const balanced = balance(roundParts, {
        ...context,
        provisional: evaluated.size < open.length,
      });
      if (redeemerParts.length === 0 || !this.evaluator)
        return this.finish(balanced, params, costModels);

      const tx = this.serialize(balanced.assembled.prototype);
      const results = await this.evaluate(tx, balanced, known);
      // Redeemers belong to the very part objects given to balancing
      const position = new Map(roundParts.map((part, i) => [part, i]));

      let settled = true;
      for (const redeemer of balanced.assembled.redeemers) {
        const i = position.get(redeemer.part)!;
        const result = results.get(`${redeemer.tag}:${redeemer.index}`);
        if (!result)
          throw new TxBuildError(
            "EVALUATION_FAILED",
            `the evaluator returned no execution units for ${redeemer.tag} redeemer ${redeemer.index}`,
            {
              part: redeemer.part.kind,
              label: redeemer.label,
              details: { tag: redeemer.tag, index: redeemer.index },
            },
          );
        const fixed = given.get(i);
        if (fixed) {
          if (exceeds(result, fixed))
            throw new TxBuildError(
              "EXUNITS_TOO_LOW",
              `the script needs ${result.mem} memory and ${result.steps} steps, more than the ${fixed.mem} and ${fixed.steps} its redeemer states`,
              {
                part: redeemer.part.kind,
                label: redeemer.label,
                details: { needed: result, given: fixed },
              },
            );
          continue;
        }
        const current = units.get(i)!;
        if (!evaluated.has(i)) {
          units.set(i, result);
          evaluated.add(i);
          settled = false;
        } else if (exceeds(result, current)) {
          units.set(i, maxUnits(result, current));
          settled = false;
        }
      }
      if (settled) return this.finish(balanced, params, costModels);
    }
    throw new TxBuildError(
      "EVALUATION_NOT_CONVERGED",
      `execution units did not settle within ${MAX_EVALUATION_ROUNDS} evaluation rounds`,
    );
  }

  private async loadParams(): Promise<Protocol> {
    if (this.params) return this.params;
    if (!this.fetcher) return DEFAULT_PROTOCOL_PARAMETERS;
    try {
      // NaN asks providers for the latest epoch's parameters
      return await this.fetcher.fetchProtocolParameters(Number.NaN);
    } catch (error) {
      throw new TxBuildError(
        "MISSING_PARAMETER",
        `fetching the protocol parameters failed: ${errorText(error)}`,
      );
    }
  }

  private async loadCostModels(): Promise<number[][]> {
    if (this.costModels) return this.costModels;
    if (!this.fetcher)
      return [
        DEFAULT_V1_COST_MODEL_LIST,
        DEFAULT_V2_COST_MODEL_LIST,
        DEFAULT_V3_COST_MODEL_LIST,
      ];
    try {
      return await this.fetcher.fetchCostModels();
    } catch (error) {
      throw new TxBuildError(
        "MISSING_PARAMETER",
        `fetching the cost models failed: ${errorText(error)}`,
      );
    }
  }

  /** Evaluates a transaction, keyed by redeemer pointer */
  private async evaluate(
    tx: string,
    balanced: Balanced,
    known: ReadonlyMap<string, UTxO>,
  ): Promise<Map<string, ExUnitsPrototype>> {
    const { body } = balanced.assembled.prototype;
    const utxos = new Map<string, UTxO>();
    for (const input of [
      ...body.inputs,
      ...(body.reference_inputs ?? []),
      ...(body.collateral ?? []),
    ]) {
      const key = `${input.transaction_id}#${input.index}`;
      const utxo = known.get(key);
      if (utxo) utxos.set(key, utxo);
    }
    let actions;
    try {
      actions = await this.evaluator!.evaluateTx(
        tx,
        Array.from(utxos.values()),
      );
    } catch (error) {
      throw new TxBuildError(
        "EVALUATION_FAILED",
        `script evaluation failed: ${errorText(error)}`,
        {
          details: {
            tx,
            redeemers: balanced.assembled.redeemers.map((r) => ({
              tag: r.tag,
              index: r.index,
              part: r.part.kind,
              label: r.label,
            })),
            cause: error,
          },
        },
      );
    }
    const results = new Map<string, ExUnitsPrototype>();
    for (const action of actions) {
      results.set(`${EVALUATOR_TAGS[action.tag]}:${action.index}`, {
        mem: String(action.budget.mem),
        steps: String(action.budget.steps),
      });
    }
    return results;
  }

  private finish(
    balanced: Balanced,
    params: Protocol,
    costModels: number[][],
  ): BuiltTx {
    const { assembled } = balanced;
    const total = totalExUnits(assembled);
    if (
      total.mem > BigInt(params.maxTxExMem) ||
      total.steps > BigInt(params.maxTxExSteps)
    )
      throw new TxBuildError(
        "EXUNITS_EXCEEDED",
        `the scripts need ${total.mem} memory and ${total.steps} steps, more than the ${params.maxTxExMem} and ${params.maxTxExSteps} a transaction may use`,
        { details: total },
      );

    const prototype = assembled.prototype;
    let tx = this.serialize(prototype);
    if (this.serializer) {
      // The hashes are taken from the prototype encoder's bytes; another serializer may lay out
      // the witness set or auxiliary data differently, so take them again from its own bytes
      const scriptDataHash = prototype.body.script_data_hash
        ? scriptDataHashOf(tx, assembled.languages, costModels)
        : undefined;
      const auxiliaryDataHash = prototype.body.auxiliary_data_hash
        ? auxiliaryDataHashOf(tx)
        : undefined;
      if (
        scriptDataHash !== prototype.body.script_data_hash ||
        auxiliaryDataHash !== prototype.body.auxiliary_data_hash
      ) {
        if (scriptDataHash) prototype.body.script_data_hash = scriptDataHash;
        if (auxiliaryDataHash)
          prototype.body.auxiliary_data_hash = auxiliaryDataHash;
        tx = this.serialize(prototype);
      }
    }

    const inputs = new Map(
      balanced.parts.flatMap((p) =>
        p.kind === "spend" ? [[utxoKey(p.utxo!), p.utxo!] as const] : [],
      ),
    );
    return {
      tx,
      txHash: Transaction.fromCbor(TxCBOR(tx)).getId().toString(),
      prototype,
      fee: balanced.fee,
      exUnits: total,
      redeemers: assembled.redeemers.map((r) => ({
        tag: r.tag,
        index: r.index,
        exUnits: { mem: Number(r.exUnits.mem), steps: Number(r.exUnits.steps) },
        part: r.part,
        ...(r.label !== undefined && { label: r.label }),
      })),
      inputs: prototype.body.inputs.map((i) =>
        inputs.get(`${i.transaction_id}#${i.index}`)!,
      ),
      selectedInputs: balanced.selected,
      change: balanced.change,
      ...(balanced.collateral && { collateral: balanced.collateral }),
      parts: balanced.parts,
    };
  }
}

/**
 * Execution units to price a redeemer at before evaluation: an even share of what a
 * transaction may use beyond the given units, so the first balancing round over-provisions the
 * fee rather than falls short
 */
const placeholderUnits = (
  params: Protocol,
  given: Map<number, ExUnitsPrototype>,
  count: number,
): ExUnitsPrototype => {
  let mem = BigInt(params.maxTxExMem);
  let steps = BigInt(params.maxTxExSteps);
  for (const units of given.values()) {
    mem -= BigInt(units.mem);
    steps -= BigInt(units.steps);
  }
  if (mem < 0n || steps < 0n)
    throw new TxBuildError(
      "EXUNITS_EXCEEDED",
      "the given execution units are more than a transaction may use",
    );
  return {
    mem: (mem / BigInt(count)).toString(),
    steps: (steps / BigInt(count)).toString(),
  };
};

/** An output with the lovelace it needs filled in, checked against the ledger's limits */
const withMinCoin = (part: OutputPart, params: Protocol): OutputPart => {
  const given = part.output.amount.coin;
  // An output fragment differs from an output only in its optional lovelace
  const output = structuredClone(part.output) as TransactionOutputPrototype;
  output.amount.coin = given ?? "0";
  const required = minCoin(output, params.coinsPerUtxoSize);
  if (given === undefined) output.amount.coin = required.toString();
  else if (!coversMinCoin(output, params.coinsPerUtxoSize))
    throw new TxBuildError(
      "OUTPUT_BELOW_MIN_COIN",
      `the output holds ${given} lovelace, less than the ${required} it needs`,
      { part: part.kind, label: part.label },
    );
  if (valueSize(output.amount) > params.maxValSize)
    throw new TxBuildError(
      "VALUE_TOO_LARGE",
      `the output's value is larger than the ${params.maxValSize} bytes allowed`,
      { part: part.kind, label: part.label },
    );
  return given === undefined
    ? freeze({ ...part, output: output as OutputPart["output"] })
    : part;
};
