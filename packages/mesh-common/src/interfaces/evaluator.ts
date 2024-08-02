import { Action } from "../types";

export interface IEvaluator {
  evaluateTx(tx: string): Promise<Omit<Action, "data">[]>;
}
