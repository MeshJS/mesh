// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type { RedeemerBudget, ScriptCache, TxEvaluator } from "scalus";

import {
  Action,
  CachedFetcher,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
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

export class OfflineEvaluatorScalus implements IEvaluator {
  private readonly fetcher: IFetcher;
  private readonly network: Network;
  public slotConfig: Omit<Omit<SlotConfig, "startEpoch">, "epochLength">;
  public costModels: number[][];

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
   * @param network - The network to evaluate scripts for
   * @param slotConfig - Slot configuration for the network (optional, defaults to network-specific values)
   * @param customCostModels - Custom cost models for Plutus versions (optional, defaults to mainnet cost models)
   * @param protocolMajorVersion Ledger protocol version used for costing. Defaults to 11
   *   (van Rossem), the version mainnet runs. Pass 10 to reproduce budgets from before the
   *   van Rossem hard fork.
   */
  constructor(
    fetcher: IFetcher,
    network: Network,
    slotConfig?: Omit<Omit<SlotConfig, "startEpoch">, "epochLength">,
    customCostModels?: number[][],
    public readonly protocolMajorVersion = 11,
  ) {
    // Outputs never change once created, so they are fetched once and reused across evaluations
    this.fetcher = CachedFetcher.wrap(fetcher);
    this.network = network;
    this.slotConfig = slotConfig ?? {
      slotLength: SLOT_CONFIG_NETWORK[network].slotLength,
      zeroSlot: SLOT_CONFIG_NETWORK[network].zeroSlot,
      zeroTime: SLOT_CONFIG_NETWORK[network].zeroTime,
    };
    this.costModels = customCostModels ?? [
      DEFAULT_V1_COST_MODEL_LIST,
      DEFAULT_V2_COST_MODEL_LIST,
      DEFAULT_V3_COST_MODEL_LIST,
    ];
  }

  async evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]> {
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

    const txEvaluator = await this.getTxEvaluator();
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

  private async getTxEvaluator(): Promise<TxEvaluator> {
    // Read once, so the evaluator matches its key even if a field changes while Scalus loads.
    const { zeroTime, zeroSlot, slotLength } = this.slotConfig;
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
            "give MeshTxBuilder another evaluator.",
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
