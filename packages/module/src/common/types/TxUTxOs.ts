import { Asset } from './Asset';

export type TxUTxOs = {
  inputs: {
    address: string;
    amount: Asset[];
    output_index: number;
  }[];
  outputs: {
    address: string;
    amount: Asset[];
    output_index: number;
  }[];
};

export type TxInput = {
  address: string;
  amount: number;
  assets: { [key: string]: number };
};

export type TxOutput = {
  address: string;
  amount: number;
  assets: { [key: string]: number };
};

export type TxMetadata = {
  [key: string]: string;
};