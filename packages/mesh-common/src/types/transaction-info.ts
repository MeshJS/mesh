import { UTxO } from "./utxo";

export type TransactionInfo = {
  index: number;
  block: string;
  hash: string;
  slot: string;
  fees: string;
  size: number;
  deposit: string;
  invalidBefore: string;
  invalidAfter: string;
  inputs: UTxO[];
  outputs: UTxO[];
  blockHeight?: number;
  blockTime?: number;
};
