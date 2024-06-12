import { Action } from '@mesh/common/types';

export interface IEvaluator {
  evaluateTx(tx: string): Promise<Omit<Action, 'data'>[]>;
}
