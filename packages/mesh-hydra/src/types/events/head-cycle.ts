import { HydraParty } from "../hydra/hydra";
import { HydraUTxOs } from "../hydra/hydraUTxOs";
import { HydraBaseEvent } from "./network";

export interface HeadIsInitializing extends HydraBaseEvent {
  tag: "HeadIsInitializing";
  headId: string;
  parties: HydraParty[];
}

export interface HeadIsOpen extends HydraBaseEvent {
  tag: "HeadIsOpen";
  headId: string;
  utxo: HydraUTxOs;
}

export interface HeadIsClosed extends HydraBaseEvent {
  tag: "HeadIsClosed";
  headId: string;
  snapshotNumber: number;
  contestationDeadline: string;
}

export interface HeadIsContested extends HydraBaseEvent {
  tag: "HeadIsContested";
  headId: string;
  snapshotNumber: number;
  contestationDeadline: string;
}

export interface ReadyToFanout extends HydraBaseEvent {
  tag: "ReadyToFanout";
  headId: string;
}

export interface HeadIsAborted extends HydraBaseEvent {
  tag: "HeadIsAborted";
  headId: string;
  utxo: HydraUTxOs;
}

export interface HeadIsFinalized extends HydraBaseEvent {
  tag: "HeadIsFinalized";
  headId: string;
  utxo: HydraUTxOs;
}
