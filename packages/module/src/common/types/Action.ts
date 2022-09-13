import { REDEEMER_TAGS } from '@mesh/common/constants';
import { Data } from './Data';

export type Action = {
  data: Data;
  index: number;
  budget: Budget;
  tag: keyof typeof REDEEMER_TAGS;
};

export type Budget = {
  mem: number;
  steps: number;
};
