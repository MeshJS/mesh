import type { Address, Ed25519KeyHash, TransactionUnspentOutput } from '@mesh/core';

export interface IInitiator {
  getAvailableUtxos(): Promise<TransactionUnspentOutput[]>;
  getCollateralInput(limit?: number): Promise<TransactionUnspentOutput[]>;
  getPubKeyHashes(): Promise<Ed25519KeyHash[]>;
  getUsedAddress(): Promise<Address>;
}
