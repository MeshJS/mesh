import {
  Action,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  Network,
  SLOT_CONFIG_NETWORK,
  SlotConfig,
  UTxO,
} from "@meshsdk/common";

import {
  evaluateTransaction,
  getTransactionInputs,
  getTransactionOutputs,
} from "../utils";

/** Most tx hashes an evaluator keeps fetched outputs for, dropping the oldest first */
const MAX_CACHED_TX_HASHES = 1000;

/**
 * OfflineEvaluator implements the IEvaluator interface to provide offline evaluation of Plutus scripts.
 * This class evaluates Plutus scripts contained in Cardano transactions without requiring network connectivity,
 * determining their execution costs in terms of memory and CPU steps.
 *
 * Each script evaluation returns an Action object (excluding the redeemer data) that contains:
 * - tag: The type of script being executed (CERT | MINT | REWARD | SPEND | VOTE | PROPOSE)
 * - index: Execution index of the script within the transaction
 * - budget: Execution costs including:
 *   - mem: Memory units required
 *   - steps: CPU steps required
 *
 * Example usage:
 * ```typescript
 * import { OfflineEvaluator, OfflineFetcher } from '@meshsdk/core';
 *
 * // Create fetcher and evaluator instances
 * const fetcher = new OfflineFetcher();
 * const evaluator = new OfflineEvaluator(fetcher, 'preprod');
 *
 * // Add required UTXOs that the transaction references
 * fetcher.addUTxOs([
 *   {
 *     input: {
 *       txHash: "1234...",
 *       outputIndex: 0
 *     },
 *     output: {
 *       address: "addr1...",
 *       amount: [{ unit: "lovelace", quantity: "1000000" }],
 *       scriptHash: "abcd..." // If this is a script UTXO
 *     }
 *   }
 * ]);
 *
 * // Evaluate Plutus scripts in a transaction
 * try {
 *   const actions = await evaluator.evaluateTx(transactionCbor);
 *   // Example result for a minting script:
 *   // [{
 *   //   index: 0,
 *   //   tag: "MINT",
 *   //   budget: {
 *   //     mem: 508703,    // Memory units used
 *   //     steps: 164980381 // CPU steps used
 *   //   }
 *   // }]
 * } catch (error) {
 *   console.error('Plutus script evaluation failed:', error);
 * }
 * ```
 */
export class OfflineEvaluator implements IEvaluator {
  private readonly fetcher: IFetcher;
  private readonly network: Network;
  public slotConfig: Omit<Omit<SlotConfig, "startEpoch">, "epochLength">;
  public costModels: number[][];
  /** Outputs fetched per tx hash. Outputs never change once created, so they are reused across evaluations */
  private readonly fetchedUTxOs = new Map<string, Promise<UTxO[]>>();

  /**
   * Creates a new instance of OfflineEvaluator.
   * @param fetcher - An implementation of IFetcher to resolve transaction UTXOs
   * @param network - The network to evaluate scripts for
   * @param slotConfig - Slot configuration for the network (optional, defaults to network-specific values)
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

  /**
   * Evaluates Plutus scripts in a transaction by resolving its input UTXOs and calculating execution costs.
   *
   * The method performs these steps:
   * 1. Extracts input references from the transaction
   * 2. Resolves the corresponding UTXOs using the fetcher
   * 3. Verifies all required UTXOs are available
   * 4. Evaluates each Plutus script to determine its memory and CPU costs
   *
   * @param tx - Transaction in CBOR hex format
   * @returns Promise resolving to array of script evaluation results, each containing:
   *   - tag: Type of script (CERT | MINT | REWARD | SPEND | VOTE | PROPOSE)
   *   - index: Script execution index
   *   - budget: Memory units and CPU steps required
   * @throws Error if any required UTXOs cannot be resolved or if script evaluation fails
   */
  async evaluateTx(
    tx: string,
    additionalUtxos: UTxO[],
    additionalTxs: string[],
  ): Promise<Omit<Action, "data">[]> {
    // Resolved utxos are appended to a copy, leaving the caller's array untouched
    additionalUtxos = [...additionalUtxos];
    // Track which utxos is resolved
    const foundUtxos = new Set<string>();

    for (const utxo of additionalUtxos) {
      foundUtxos.add(`${utxo.input.txHash}:${utxo.input.outputIndex}`);
    }
    for (const tx of additionalTxs) {
      const outputs = getTransactionOutputs(tx);
      for (const output of outputs) {
        foundUtxos.add(`${output.input.txHash}:${output.input.outputIndex}`);
      }
    }
    const inputsToResolve = getTransactionInputs(tx).filter(
      (input) => !foundUtxos.has(`${input.txHash}:${input.outputIndex}`),
    );
    const txHashes = Array.from(
      new Set(inputsToResolve.map((input) => input.txHash)),
    );
    const fetched = await Promise.all(
      txHashes.map((txHash) => this.fetchUTxOsOnce(txHash)),
    );
    for (const [i, txHash] of txHashes.entries()) {
      const utxos = fetched[i]!;
      for (const utxo of utxos) {
        if (utxo)
          if (
            inputsToResolve.find(
              (input) =>
                input.txHash === txHash &&
                input.outputIndex === utxo.input.outputIndex,
            )
          ) {
            additionalUtxos.push(utxo);
            foundUtxos.add(`${utxo.input.txHash}:${utxo.input.outputIndex}`);
          }
      }
    }
    const missing = inputsToResolve.filter(
      (input) => !foundUtxos.has(`${input.txHash}:${input.outputIndex}`),
    );
    if (missing.length > 0) {
      // The fetcher may not have seen these outputs yet; ask again next time
      missing.forEach((input) => this.fetchedUTxOs.delete(input.txHash));
      const missingList = missing
        .map((m) => `${m.txHash}:${m.outputIndex}`)
        .join(", ");
      throw new Error(
        `Can't resolve these UTXOs to execute plutus scripts: ${missingList}`,
      );
    }
    return evaluateTransaction(
      tx,
      additionalUtxos,
      additionalTxs,
      this.costModels,
      this.slotConfig,
    );
  }

  /**
   * Fetches the outputs of a transaction once: concurrent and later calls for the same hash
   * reuse the first request, while a failed or empty response is forgotten.
   */
  private fetchUTxOsOnce(txHash: string): Promise<UTxO[]> {
    const cached = this.fetchedUTxOs.get(txHash);
    if (cached) return cached;
    const request = this.fetcher.fetchUTxOs(txHash);
    this.fetchedUTxOs.set(txHash, request);
    request.then(
      (utxos) => {
        if (!utxos || utxos.length === 0) this.fetchedUTxOs.delete(txHash);
      },
      () => this.fetchedUTxOs.delete(txHash),
    );
    if (this.fetchedUTxOs.size > MAX_CACHED_TX_HASHES) {
      this.fetchedUTxOs.delete(this.fetchedUTxOs.keys().next().value!);
    }
    return request;
  }
}
