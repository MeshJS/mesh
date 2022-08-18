import type { Address, TransactionUnspentOutput } from '@mesh/core';

export interface IInitiator {
  getAvailableUtxos(): Promise<TransactionUnspentOutput[]>;
  getCollateralInput(limit?: number): Promise<TransactionUnspentOutput[]>;
  getUsedAddress(): Promise<Address>;
}
