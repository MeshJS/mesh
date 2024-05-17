import { deserializePlutusData, fromPlutusData } from '@mesh/common/utils';
import type { Data } from '@meshsdk/common';

export const readPlutusData = (plutusData: string): Data => {
  return fromPlutusData(deserializePlutusData(plutusData));
};
