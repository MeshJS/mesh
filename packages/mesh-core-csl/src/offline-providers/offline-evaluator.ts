import {
  IEvaluator,
  IFetcher,
  UTxO,
  Action,
  Network
} from "@meshsdk/common";
import { evaluateTransaction, getTransactionInputs } from "../utils";


/**
 * OfflineEvaluator implements the IEvaluator interface to provide offline evaluation of Plutus scripts.
 * This class evaluates Plutus scripts contained in Cardano transactions without requiring network connectivity.
 * It works in conjunction with an IFetcher implementation to resolve transaction UTXOs needed for script validation.
 *
 * The evaluator returns Action objects that contain:
 * - tag: The type of script being executed (CERT, MINT, REWARD, SPEND, VOTE, PROPOSE)
 * - index: Execution index of the script
 * - budget: Memory and CPU step costs for script execution
 * - data: The script's redeemer data (excluded from return type)
 *
 * Example usage:
 * ```typescript
 * import { OfflineEvaluator, OfflineFetcher } from '@meshsdk/core';
 *
 * // Create fetcher and evaluator instances
 * const fetcher = new OfflineFetcher();
 * const evaluator = new OfflineEvaluator(fetcher, 'mainnet');
 *
 * // Evaluate Plutus scripts in a transaction
 * try {
 *   const actions = await evaluator.evaluateTx(transactionCborHex);
 *   actions.forEach(action => {
 *     console.log(`Script type: ${action.tag}`);
 *     console.log(`Memory units: ${action.budget.mem}`);
 *     console.log(`CPU steps: ${action.budget.steps}`);
 *   });
 * } catch (error) {
 *   console.error('Plutus script evaluation failed:', error);
 * }
 * ```
 */
export class OfflineEvaluator implements IEvaluator {

  private readonly fetcher: IFetcher;
  private readonly network: Network;

  /**
   * Creates a new instance of OfflineEvaluator.
   * @param fetcher - An implementation of IFetcher to resolve transaction UTXOs
   * @param network - The network to evaluate scripts for
   */
  constructor(fetcher: IFetcher, network: Network) {
    this.fetcher = fetcher;
    this.network = network;
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
  async evaluateTx(tx: string): Promise<Omit<Action, "data">[]> {
    const inputsToResolve = getTransactionInputs(tx);
    const txHashesSet = new Set(inputsToResolve.map(input => input.txHash));
    const resolvedUTXOs: UTxO[] = [];
    for (const txHash of txHashesSet) {
      const utxos = await this.fetcher.fetchUTxOs(txHash);
      for (const utxo of utxos) {
        if (utxo)
          if (inputsToResolve.find(input => input.txHash === txHash && input.index === utxo.input.outputIndex)) {
            resolvedUTXOs.push(utxo);
          }
      }
    }
    if (resolvedUTXOs.length !== inputsToResolve.length) {
      const missing = inputsToResolve.filter(input => !resolvedUTXOs.find(utxo => utxo.input.txHash === input.txHash && utxo.input.outputIndex === input.index));
      const missingList = missing.map(m => `${m.txHash}:${m.index}`).join(", ");
      throw new Error(`Can't resolve these UTXOs to execute plutus scripts: ${missingList}`);
    }
    return evaluateTransaction(tx, resolvedUTXOs, this.network);
  }
}
