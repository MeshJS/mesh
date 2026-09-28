// Type-only: erased at compile time, so the CommonJS build still loads Scalus through the
// dynamic import() below rather than a top-level require of an ESM-only package.
import type { RedeemerBudget } from "scalus";

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

import { CborWriter } from "../types";
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

export class OfflineEvaluatorScalus implements IEvaluator {
  private readonly fetcher: IFetcher;
  private readonly network: Network;
  public slotConfig: Omit<Omit<SlotConfig, "startEpoch">, "epochLength">;
  public costModels: number[][];

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

    const cborWriter = new CborWriter();
    cborWriter.writeStartMap(foundUtxos.size);
    for (const [key, utxo] of foundUtxos) {
      const cardanoUtxo = toTxUnspentOutput(utxo);
      cborWriter.writeEncodedValue(
        Buffer.from(cardanoUtxo.input().toCbor(), "hex"),
      );
      cborWriter.writeEncodedValue(
        Buffer.from(cardanoUtxo.output().toCbor(), "hex"),
      );
    }

    // Keep native import() in the CJS build: Scalus 1.x is ESM-only.
    //
    // `evalPlutusScripts` is the top-level export. The `Scalus` namespace object that used to
    // carry it is a 0.x shape kept only for backwards compatibility, and is deprecated.
    const { evalPlutusScripts, SlotConfig: ScalusSlotConfig } =
      await import("scalus");
    return evalPlutusScripts(
      Buffer.from(tx, "hex"),
      cborWriter.encode(),
      new ScalusSlotConfig(
        this.slotConfig.zeroTime,
        this.slotConfig.zeroSlot,
        this.slotConfig.slotLength,
      ),
      this.costModels,
      this.protocolMajorVersion,
    ).map((scalusRedeemer) => {
      // Still guarded at runtime: the dependency is a caret range, so an installed Scalus can
      // emit a tag the compiled-against declarations did not carry.
      const tag = MESH_TAG[scalusRedeemer.tag];
      if (!tag) throw new Error(`Unknown redeemer tag: ${scalusRedeemer.tag}`);
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
}
