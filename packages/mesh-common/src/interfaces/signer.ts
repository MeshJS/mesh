import { DataSignature } from "../types";

export interface ISigner {
  signData(payload: string, address?: string): SometimesPromise<DataSignature>;
  signTx(unsignedTx: string, partialSign?: boolean): SometimesPromise<string>;
  signTxs(
    unsignedTxs: string[],
    partialSign?: boolean,
  ): SometimesPromise<string[]>;
}

type SometimesPromise<T> = Promise<T> | T;
