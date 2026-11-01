// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type { RedeemerBudget, ScriptCache, TxEvaluator } from "scalus";

import {
  Action,
  CachedFetcher,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  EvaluationContext,
  IEvaluator,
  IFetcher,
  Network,
  RedeemerTagType,
  SLOT_CONFIG_NETWORK,
  SlotConfig,
  UTxO,
} from "@meshsdk/common";

import { toTxUnspentOutput } from "../utils";
import {
  getTransactionInputs,
  getTransactionOutputs,
  getTransactionValidityInterval,
} from "../utils/transaction";

/**
 * How Scalus spells each redeemer tag, and how mesh does. Keying this on Scalus's own union
 * makes a tag added upstream a compile error here rather than a runtime throw.
 */
const MESH_TAG: Record<RedeemerBudget["tag"], RedeemerTagType> = {
  Spend: "SPEND",
  Mint: "MINT",
  Cert: "CERT",
  Reward: "REWARD",
  Voting: "VOTE",
  Proposing: "PROPOSE",
};

/** How many decoded scripts an evaluator keeps. */
const SCRIPT_CACHE_SIZE = 64;

type EvaluatorSlotConfig = Omit<Omit<SlotConfig, "startEpoch">, "epochLength">;

/**
 * The slot arithmetic of a network, or all zeros when it is not known: for no network, for
 * `"testnet"` (a custom network, whose slot config mesh leaves at zero) and for a name mesh
 * does not know.
 */
const slotConfigOf = (network?: Network): EvaluatorSlotConfig => {
  const { zeroTime, zeroSlot, slotLength } = (network &&
    SLOT_CONFIG_NETWORK[network]) || { zeroTime: 0, zeroSlot: 0, slotLength: 0 };
  return { zeroTime, zeroSlot, slotLength };
};

export class OfflineEvaluatorScalus implements IEvaluator {
  private readonly fetcher: IFetcher;
  private network?: Network;
  /** Whether the slot config was given to the constructor, so a network never replaces it */
  private readonly pinnedSlotConfig: boolean;
  public slotConfig: EvaluatorSlotConfig;
  public costModels: number[][];
  /** Runs locally: a builder may pass every UTxO it holds, so they need not be fetched */
  readonly acceptsKnownUtxos = true;

  // Scalus loads on first use. A TxEvaluator is fixed to one slot config and set of cost models,
  // so it is rebuilt when either field above changes; the script cache outlives the rebuilds,
  // so each script is still decoded only once.
  private scalus?: Promise<typeof import("scalus")>;
  private scriptCache?: ScriptCache;
  private txEvaluator?: TxEvaluator;
  private txEvaluatorKey?: string;

  /**
   * Creates a new instance of OfflineEvaluatorScalus.
   * @param fetcher - An implementation of IFetcher to resolve transaction UTXOs
   * @param network - The network to evaluate scripts for. It may be left out and given later
   *   through `configure`, as `MeshTxBuilder` does for its default evaluator. Until it is known,
   *   only transactions without a validity interval can be evaluated: scripts see the interval
   *   as POSIX time, which depends on the network.
   * @param slotConfig - Slot configuration for the network (optional, defaults to network-specific values)
   * @param customCostModels - Custom cost models for Plutus versions (optional, defaults to mainnet cost models)
   * @param protocolMajorVersion Ledger protocol version used for costing. Defaults to 11
   *   (van Rossem), the version mainnet runs. Pass 10 to reproduce budgets from before the
   *   van Rossem hard fork.
   */
  constructor(
    fetcher: IFetcher,
    network?: Network,
    slotConfig?: EvaluatorSlotConfig,
    customCostModels?: number[][],
    public readonly protocolMajorVersion = 11,
  ) {
    // Outputs never change once created, so they are fetched once and reused across evaluations
    this.fetcher = CachedFetcher.wrap(fetcher);
    this.network = network;
    this.pinnedSlotConfig = slotConfig !== undefined;
    this.slotConfig = slotConfig ?? slotConfigOf(network);
    this.costModels = customCostModels ?? [
      DEFAULT_V1_COST_MODEL_LIST,
      DEFAULT_V2_COST_MODEL_LIST,
      DEFAULT_V3_COST_MODEL_LIST,
    ];
  }

  /**
   * Takes what a transaction builder learned while completing a transaction. A network other
   * than the evaluator's replaces its slot config, unless one was given to the constructor.
   * Cost models replace the current ones version by version; a version the context has no
   * model for keeps the current one.
   */
  configure({ network, costModels }: EvaluationContext): void {
    if (network && network !== this.network) {
      this.network = network;
      if (!this.pinnedSlotConfig) this.slotConfig = slotConfigOf(network);
    }
    if (costModels)
      this.costModels = this.costModels.map((current, version) => {
        const model = costModels[version];
        return model && model.length > 0 ? model : current;
      });
  }

  async evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]> {
    // Before any fetch: without a usable slot config there is nothing to evaluate with
    const slotConfig = this.slotConfigFor(tx);
    const foundUtxos: Map<String, UTxO> = new Map<string, UTxO>();

    if (additionalUtxos) {
      for (const utxo of additionalUtxos) {
        foundUtxos.set(`${utxo.input.txHash}:${utxo.input.outputIndex}`, utxo);
      }
    }

    if (additionalTxs) {
      for (const additionalTx of additionalTxs) {
        const utxos = getTransactionOutputs(additionalTx);
        for (const utxo of utxos) {
          foundUtxos.set(
            `${utxo.input.txHash}:${utxo.input.outputIndex}`,
            utxo,
          );
        }
      }
    }

    const inputsToResolve = getTransactionInputs(tx).filter((input) => {
      return !foundUtxos.has(`${input.txHash}:${input.outputIndex}`);
    });
    const resolved = await Promise.all(
      inputsToResolve.map((input) =>
        this.fetcher.fetchUTxOs(input.txHash, input.outputIndex),
      ),
    );
    inputsToResolve.forEach((input, i) => {
      const utxo = resolved[i]![0];
      if (!utxo) {
        throw new Error(
          `UTxO not found for input: ${input.txHash}:${input.outputIndex}`,
        );
      }
      foundUtxos.set(`${input.txHash}:${input.outputIndex}`, utxo);
    });

    const txEvaluator = await this.getTxEvaluator(slotConfig);
    return txEvaluator
      .evaluate(
        tx,
        // A TransactionUnspentOutput encodes as the [input, output] pair Scalus reads.
        Array.from(foundUtxos.values(), (utxo) =>
          toTxUnspentOutput(utxo).toCbor(),
        ),
      )
      .map((scalusRedeemer) => {
        // Still guarded at runtime: the dependency is a caret range, so an installed Scalus can
        // emit a tag the compiled-against declarations did not carry.
        const tag = MESH_TAG[scalusRedeemer.tag];
        if (!tag)
          throw new Error(`Unknown redeemer tag: ${scalusRedeemer.tag}`);
        return {
          tag,
          index: scalusRedeemer.index,
          budget: {
            mem: Number(scalusRedeemer.budget.memory),
            steps: Number(scalusRedeemer.budget.steps),
          },
        };
      });
  }

  /**
   * The slot config to evaluate `tx` under. Without a known one, a transaction with a validity
   * interval cannot be evaluated: its scripts see the interval as POSIX time, which depends on
   * the network. One without an interval never uses the slot arithmetic, so any config will do.
   */
  private slotConfigFor(tx: string): EvaluatorSlotConfig {
    if (this.slotConfig.slotLength > 0) return this.slotConfig;
    const { invalidBefore, invalidHereafter } =
      getTransactionValidityInterval(tx);
    if (invalidBefore !== undefined || invalidHereafter !== undefined)
      throw new Error(
        `The transaction has a validity interval, but ${
          this.network
            ? `the slot times of network "${this.network}" are unknown`
            : "the network it is for is unknown"
        }, so its scripts cannot be evaluated. Give the evaluator a public network, in its ` +
          "constructor or through `configure`; with MeshTxBuilder, pass `network` (or call " +
          "`setNetwork`), or pass another evaluator built for your network.",
      );
    return slotConfigOf("mainnet");
  }

  private async getTxEvaluator(
    slotConfig: EvaluatorSlotConfig,
  ): Promise<TxEvaluator> {
    // Read once, so the evaluator matches its key even if a field changes while Scalus loads.
    const { zeroTime, zeroSlot, slotLength } = slotConfig;
    const costModels = this.costModels;
    // Compared by value: the fields are public, so a caller can also mutate them in place.
    const key = JSON.stringify([zeroTime, zeroSlot, slotLength, costModels]);
    if (this.txEvaluator && this.txEvaluatorKey === key)
      return this.txEvaluator;

    // Keep native import() in the CJS build: Scalus 1.x is ESM-only.
    this.scalus ??= import("scalus").catch((error: unknown) => {
      // Not remembered, so a later call can try again.
      this.scalus = undefined;
      // What Node throws (`..._MISSING`, or `..._MISSING_FLAG` under Jest) when a vm context
      // gives no way to import() an ES module. Its message names neither Scalus nor a fix.
      const code = (error as { code?: unknown } | null)?.code;
      if (
        typeof code === "string" &&
        code.startsWith("ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING")
      )
        throw new Error(
          "Cannot load Scalus to evaluate scripts: it is an ES module, and this runtime " +
            "cannot import() one. Under Jest, run it with --experimental-vm-modules, or " +
            "give MeshTxBuilder another evaluator, or `evaluator: null` to skip evaluation.",
          { cause: error },
        );
      throw error;
    });
    const { ScriptCache, TxEvaluator } = await this.scalus;
    this.scriptCache ??= new ScriptCache(SCRIPT_CACHE_SIZE);
    const [PlutusV1, PlutusV2, PlutusV3] = costModels;
    this.txEvaluator = new TxEvaluator({
      slotConfig: { zeroTime, zeroSlot, slotLength },
      costModels: {
        ...(PlutusV1 && { PlutusV1 }),
        ...(PlutusV2 && { PlutusV2 }),
        ...(PlutusV3 && { PlutusV3 }),
      },
      protocolMajorVersion: this.protocolMajorVersion,
      scriptCache: this.scriptCache,
    });
    this.txEvaluatorKey = key;
    return this.txEvaluator;
  }
}
