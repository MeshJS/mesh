import type { TransactionUnspentOutput } from "./CSL";
import type { Asset } from '@mesh/common/types';

export const largestFirstMultiAsset = (
  _requestedOutputSet: Asset[],
  _initialUTxOSet: TransactionUnspentOutput[],
): TransactionUnspentOutput[] => {
  throw new Error('Method not implemented.');
};
