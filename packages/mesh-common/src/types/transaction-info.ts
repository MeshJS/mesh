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
  /**
   * The transaction's validity flag: `false` when a Plutus script failed and only the
   * collateral was taken; left out by a provider that does not report it
   */
  validContract?: boolean;
};
