export interface IEvaluator {
  evaluateTx(tx: string): Promise<object>;
}
