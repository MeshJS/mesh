import type { Address, TransactionUnspentOutput } from '@mesh/core';

export interface IInitiator {
  getUsedAddress(): Promise<Address>;
  getUsedCollateral(limit?: number): Promise<TransactionUnspentOutput[]>;
  getUsedUtxos(): Promise<TransactionUnspentOutput[]>;
}
