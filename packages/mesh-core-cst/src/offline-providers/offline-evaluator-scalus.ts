import { Serialization } from "@cardano-sdk/core";
import { Scalus, SlotConfig as ScalusSlotConfig } from "scalus";

import {
  Action,
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
   */
  constructor(
    fetcher: IFetcher,
    network: Network,
    slotConfig?: Omit<Omit<SlotConfig, "startEpoch">, "epochLength">,
    customCostModels?: number[][],
  ) {
    this.fetcher = fetcher;
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
    const queriesNeeded: Set<string> = new Set<string>();
    for (const input of inputsToResolve) {
      queriesNeeded.add(input.txHash);
    }
    const fetchedUtxos: Map<string, UTxO[]> = new Map<string, UTxO[]>();
    for (const txHash of queriesNeeded) {
      const utxos = await this.fetcher.fetchUTxOs(txHash);
      fetchedUtxos.set(txHash, utxos);
    }

    for (const input of inputsToResolve) {
      const utxos = fetchedUtxos.get(input.txHash);
      if (!utxos) {
        throw new Error(
          `Unable to fetch UTxOs for transaction hash: ${input.txHash}`,
        );
      }
      const utxo = utxos.find((u) => u.input.outputIndex === input.outputIndex);
      if (!utxo) {
        throw new Error(
          `UTxO not found for input: ${input.txHash}:${input.outputIndex}`,
        );
      }
      foundUtxos.set(`${input.txHash}:${input.outputIndex}`, utxo);
    }

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

    return Scalus.evalPlutusScripts(
      Buffer.from(tx, "hex"),
      cborWriter.encode(),
      new ScalusSlotConfig(
        this.slotConfig.zeroTime,
        this.slotConfig.zeroSlot,
        this.slotConfig.slotLength,
      ),
      this.costModels,
    ).map((scalusRedeemer: Scalus.Redeemer) => {
      return {
        tag: scalusRedeemer.tag.toUpperCase() as RedeemerTagType,
        index: scalusRedeemer.index,
        budget: {
          mem: Number(scalusRedeemer.budget.memory),
          steps: Number(scalusRedeemer.budget.steps),
        },
      };
    });
  }
}
