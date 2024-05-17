import { Action } from '@meshsdk/common';

export interface IEvaluator {
  evaluateTx(tx: string): Promise<Omit<Action, 'data'>[]>;
}
