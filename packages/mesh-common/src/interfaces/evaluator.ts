import { Action, Network, UTxO } from "../types";

/** What a transaction builder learns while completing a transaction; a field left out is unknown */
export interface EvaluationContext {
  /** The network the transaction is for, which fixes the slot arithmetic its scripts see */
  network?: Network;
  /** The cost models fetched for it, by Plutus version (V1, V2, V3); an empty entry is none */
  costModels?: number[][];
}

export interface IEvaluator {
  evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]>;
  /**
   * Set by an evaluator that runs locally: a builder then passes every UTxO it holds for the
   * transaction's inputs as `additionalUtxos`, on chain or not. A remote evaluator leaves it
   * unset and gets only the UTxOs given to the builder for evaluation.
   */
  readonly acceptsKnownUtxos?: boolean;
  /** Takes what a builder learned while completing a transaction, before each evaluation */
  configure?(context: EvaluationContext): void;
}
