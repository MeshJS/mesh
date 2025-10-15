import { HydraUTxOs } from "../hydra/hydraUTxOs";

export type DepositStatus =
  | { tag: "Unknown" }
  | { tag: "Active" }
  | { tag: "Expired" };

export type Deposit = {
  tag: "Deposit";
  headId: string;
  deposited: HydraUTxOs;
  created: string;
  deadline: string;
  status: DepositStatus;
};

export interface DepositActivated {
  tag: "DepositActivated";
  headId: string;
  depositTxId: string;
  deadline: string;
  chainTime: string;
  seq: number;
  timestamp: string;
}

export interface DepositExpired {
  tag: "DepositExpired";
  headId: string;
  depositTxId: string;
  deadline: string;
  chainTime: string;
  seq: number;
  timestamp: string;
}

export type DepositEvent = DepositActivated | DepositExpired;
