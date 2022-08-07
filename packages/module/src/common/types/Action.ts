import { REDEEMER_TAGS } from '../constants';
import { Data } from './Data';

export type Action = {
  alternative: number;
  budget: {
    mem: number;
    steps: number;
  };
  data: Data;
  index: number;
  tag: keyof typeof REDEEMER_TAGS;
};
