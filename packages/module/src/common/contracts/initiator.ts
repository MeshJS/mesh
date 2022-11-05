import type { Address, TransactionUnspentOutput } from '@mesh/core';

export interface IInitiator {
  getUsedAddress(): SometimesPromise<Address>;
  getUsedCollateral(
    limit?: number
  ): SometimesPromise<TransactionUnspentOutput[]>;
  getUsedUTxOs(): SometimesPromise<TransactionUnspentOutput[]>;
}

type SometimesPromise<T> = Promise<T> | T;
