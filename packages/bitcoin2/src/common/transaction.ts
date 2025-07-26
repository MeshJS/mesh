import { Psbt } from 'bitcoinjs-lib';
import { DerivedAddress } from './address';

export type UnsignedTransaction = {
  context: Psbt;
  toAddress: string;
  amount: bigint;
  fee: bigint;
  vBytes: number;
  signers: DerivedAddress[];
};

export type SignedTransaction = {
  context: Psbt;
  hex: string;
};
