import { Action } from '@mesh/types';

export interface IEvaluator {
  evaluateTx(tx: string): Promise<Omit<Action, 'data'>[]>;
}
