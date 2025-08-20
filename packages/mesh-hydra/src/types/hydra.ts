import { hydraUTxOs } from "./hydraUTxOs";

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
  utxo: hydraUTxOs;
  confirmedTransactions: string[];
  utxoToDecommit: hydraUTxOs;
  version: number;
};
