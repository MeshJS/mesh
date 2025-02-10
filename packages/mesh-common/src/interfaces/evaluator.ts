import { Action, UTxO } from "../types";

export interface IEvaluator {
  evaluateTx(
    tx: string,
    additionalUtxos?: UTxO[],
    additionalTxs?: string[],
  ): Promise<Omit<Action, "data">[]>;
}
