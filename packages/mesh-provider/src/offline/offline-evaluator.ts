import {
  IEvaluator,
  IFetcher,
  UTxO,
  Action,
  Network
} from "@meshsdk/common";
import { evaluateTransaction, getTransactionInputs } from "@meshsdk/core-csl";

export class OfflineEvaluator implements IEvaluator {

  private readonly fetcher: IFetcher;
  private readonly network: Network;

  constructor(fetcher: IFetcher, network: Network) {
    this.fetcher = fetcher;
    this.network = network;
  }

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
