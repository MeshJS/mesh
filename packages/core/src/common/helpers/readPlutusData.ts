import {
  deserializePlutusData, fromPlutusData,
} from '@mesh/common/utils';
import type { Data } from '@mesh/common/types';

export const readPlutusData = (plutusData: string): Data => {
  return fromPlutusData(deserializePlutusData(plutusData));
};
