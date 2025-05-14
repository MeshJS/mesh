import { hUTxOs } from "./hUTxOs";

export type HydraCommitTransaction = {
  cborHex: string;
  description: string;
  txId: string;
  type: string;
};

export interface HydraHeadParameters {
  contestationPeriod: number;
  parties: HydraParty[];
}

export type HydraParty = {
  vkey: string;
};

export type HydraSnapshot = {
  headId: string;
  snapshotNumber: string;
  utxo: hUTxOs;
  confirmedTransactions: string[];
  utxoToDecommit: hUTxOs;
  version: number;
};
