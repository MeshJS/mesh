import { DataSignature } from '@mesh/common/types';

export interface ISigner {
  signData(address: string, payload: string): SometimesPromise<DataSignature>;
  signTx(unsignedTx: string, partialSign: boolean): SometimesPromise<string>;
}

type SometimesPromise<T> = Promise<T> | T;
