import { Action, Network, UTxO } from "../types";

/**
 * What a transaction builder learns while completing a transaction, for an evaluator that can
 * use it (see `IEvaluator.configure`). A field left out means the builder does not know it.
 */
export interface EvaluationContext {
  /** The network the transaction is for, which fixes the slot arithmetic its scripts see */
  network?: Network;
  /**
   * The cost models fetched for the transaction, by Plutus version (V1, V2, V3). An empty
   * entry means the provider sent none for that version.
   */
  costModels?: number[][];
}

export interface IEvaluator {
  evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]>;
  /**
   * Set by evaluators that run locally. A builder may then pass every UTxO it holds for the
   * transaction's inputs as `additionalUtxos`, whether or not they exist on chain, so they need
   * not be fetched. A remote evaluator leaves it unset: it may reject additional UTxOs that
   * also exist on chain, and gets only the UTxOs given to the builder for evaluation.
   */
  readonly acceptsKnownUtxos?: boolean;
  /**
   * Takes what a builder learned while completing a transaction. A builder calls it before each
   * evaluation; a field left out of the context changes nothing.
   */
  configure?(context: EvaluationContext): void;
}
