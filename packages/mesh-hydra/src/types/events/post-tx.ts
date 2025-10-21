import { HydraUTxOs } from "../hydra/hydraUTxOs";
import { ConfirmedSnapshot, InitialSnapshot } from "./snapshot";
import { HydraHeadParameters } from "../hydra/hydra";

export interface InitTx {
  tag: "InitTx";
  participants: string[];
  headParameters: HydraHeadParameters;
}

export interface AbortTx {
  tag: "AbortTx";
  utxo: HydraUTxOs;
  headSeed: string;
}

export interface CollectComTx {
  tag: "CollectComTx";
  utxo: HydraUTxOs;
  headId: string;
  headParameters: HydraHeadParameters;
}

export interface RecoverTx {
  tag: "RecoverTx";
  headId: string;
  recoverTxId: string;
  recoverUTxO: HydraUTxOs;
  deadline: number;
}

export interface IncrementTx {
  tag: "IncrementTx";
  headId: string;
  headParameters: HydraHeadParameters;
  incrementingSnapshot: InitialSnapshot | ConfirmedSnapshot;
  depositTxId: string;
}

export interface DecrementTx {
  tag: "DecrementTx";
  headId: string;
  headParameters: HydraHeadParameters;
  decrementingSnapshot: InitialSnapshot | ConfirmedSnapshot;
}

export interface CloseTx {
  tag: "CloseTx";
  headId: string;
  headParameters: HydraHeadParameters;
  closingSnapshot: InitialSnapshot | ConfirmedSnapshot;
  openVersion: number;
}

export interface ContestTx {
  tag: "ContestTx";
  headId: string;
  headParameters: HydraHeadParameters;
  openVersion: number;
  contestingSnapshot: InitialSnapshot | ConfirmedSnapshot;
}

export interface FanoutTx {
  tag: "FanoutTx";
  utxo: HydraUTxOs;
  utxoToCommit: HydraUTxOs;
  utxoToDecommit: HydraUTxOs;
  headSeed: string;
  contestationDeadline: string;
}

export type PostChainTx =
  | InitTx
  | AbortTx
  | CollectComTx
  | RecoverTx
  | IncrementTx
  | DecrementTx
  | CloseTx
  | ContestTx
  | FanoutTx;
