import { Asset } from "./asset";

export type TxOutput = {
  address: string;
  amount: Asset[];
  dataHash?: string;
  plutusData?: string;
  scriptRef?: string;
  scriptHash?: string;
};

export type TxInput = {
  txHash: string;
  outputIndex: number;
};

export type UTxO = {
  input: TxInput;
  output: TxOutput;
};
