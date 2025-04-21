import { HYDRA_STATUS } from "../constants";
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

export type HydraStatus = (typeof HYDRA_STATUS)[keyof typeof HYDRA_STATUS];

export type HydraSnapshot = {
  headId: string;
  snapshotNumber: string;
  utxo: hUTxOs;
  confirmedTransactions: string[];
  utxoToDecommit: hUTxOs;
  version: number;
};

export type HydraTransaction = {
  type: "Tx ConwayEra" | "Unwitnessed Tx ConwayEra" | "Witnessed Tx ConwayEra";
  description: string;
  cborHex: string;
  txId?: string;
};
