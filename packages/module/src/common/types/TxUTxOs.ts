import { Asset } from './Asset';

export type TxUTxOs = {
  inputs: {
    address: string;
    amount: Asset[];
    outputIndex: number;
    txHash: string;
  }[];
  outputs: {
    address: string;
    amount: Asset[];
    outputIndex: number;
    dataHash?: string;
    plutusData?: string;
    scriptRef?: string;
  }[];
};

export type TxInput = {
  address: string;
  amount: number;
  assets: { [key: string]: number; };
};

export type TxOutput = {
  address: string;
  amount: number;
  assets: { [key: string]: number };
};

export type TxMetadata = {
  [key: string]: string;
};