import { hydraUTxO } from "./hydraUTxOs";
import { HydraHeadParameters, HydraSnapshot } from "./hydra";

export type PostChainTx =
  | InitTx
  | AbortTx
  | CollectComTx
  | DecrementTx
  | CloseTx
  | ContestTx
  | FanoutTx;

export type InitTx = {
  tag: "InitTx";
  participants: string[];
  headParameters: HydraHeadParameters;
};

export type AbortTx = {
  tag: "AbortTx";
  utxo: { [txRef: string]: hydraUTxO };
  headSeed: string;
};

export type CollectComTx = {
  tag: "CollectComTx";
  utxo: { [txRef: string]: hydraUTxO };
  headId: string;
  headParameters: HydraHeadParameters;
};

export type InitialSnapshot = {
  headId: string;
  initialUtxo: { [txRef: string]: hydraUTxO };
  tag: "InitialSnapshot";
};

export type ConfirmedSnapshot = {
  snapshot: HydraSnapshot;
  signatures: {
    mutliSignature: string[];
  };
  tag: "ConfirmedSnapshot";
};
export type DecrementTx = {
  tag: "DecrementTx";
  headId: string;
  headParameters: HydraHeadParameters;
  decerementingSnapshot: InitialSnapshot | ConfirmedSnapshot;
};

export type CloseTx = {
  tag: "CloseTx";
  headId: string;
  headParameters: HydraHeadParameters;
  closingSnapshot: InitialSnapshot | ConfirmedSnapshot;
  openVersion: number;
};

export type ContestTx = {
  tag: "ContestTx";
  headId: string;
  headParameters: HydraHeadParameters;
  contestingSnapshot: InitialSnapshot | ConfirmedSnapshot;
  openVersion: number;
};

export type FanoutTx = {
  tag: "FanoutTx";
  utxo: { [txRef: string]: hydraUTxO };
  utxoToDecommit: { [txRef: string]: hydraUTxO };
  headSeed: string;
  contestationDeadline: string;
};
