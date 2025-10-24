import { HydraParty } from "../hydra/hydra";
import { HydraUTxOs } from "../hydra/hydraUTxOs";

export type CommitApproved = {
  tag: "CommitApproved";
  headId: string;
  utxoToCommit: HydraUTxOs;
  seq: number;
  timestamp: string;
};

export type CommitRecorded = {
  tag: "CommitRecorded";
  headId: string;
  utxoToCommit: HydraUTxOs;
  pendingDeposit: string;
  deadline: string;
  seq: number;
  timestamp: string;
};

export type CommitFinalized = {
  tag: "CommitFinalized";
  headId: string;
  depositTxId: string;
  seq: number;
  timestamp: string;
};

export type CommitRecovered = {
  tag: "CommitRecovered";
  headId: string;
  recoveredUTxO: HydraUTxOs;
  recoveredTxId: string;
  seq: number;
  timestamp: string;
};

export type Committed = {
  tag: "Committed";
  parties: HydraParty[];
  utxo: HydraUTxOs;
  seq: number;
  timestamp: string;
};

export type CommitEvent =
  | CommitRecorded
  | CommitApproved
  | CommitFinalized
  | CommitRecovered;
