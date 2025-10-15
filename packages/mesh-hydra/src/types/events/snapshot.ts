import { hydraTransaction } from "../hydra/hydraTransaction";
import { HydraUTxOs } from "../hydra/hydraUTxOs";
import { HydraBaseEvent } from "./network";

export type SnapshotSignatures = {
  multiSignature: string[];
};

export type InitialSnapshot = {
  headId: string;
  tag: "InitialSnapshot";
  initialUTxO: HydraUTxOs;
};

export interface NoSeenSnapshot {
  tag: "NoSeenSnapshot";
}

export interface LastSeenSnapshot {
  tag: "LastSeenSnapshot";
  lastSeen: number;
}

export interface RequestedSnapshot {
  tag: "RequestedSnapshot";
  lastSeen: number;
  requested: number;
}

export interface SeenSnapshot {
  tag: "SeenSnapshot";
  snapshot: Snapshot;
  signatories: Record<string, any>;
}

export type ConfirmedSnapshot = {
  tag: "ConfirmedSnapshot";
  snapshot: {
    headId: string;
    version: number;
    number: number;
    confirmed: hydraTransaction[];
    utxo: HydraUTxOs;
    utxoToCommit?: HydraUTxOs | null;
    utxoToDecommit?: HydraUTxOs | null;
  };
  signatures: SnapshotSignatures;
};

export type Snapshot = {
  headId: string;
  version: number;
  number: number;
  confirmed: hydraTransaction[];
  utxo: HydraUTxOs;
  utxoToCommit?: HydraUTxOs;
  utxoToDecommit?: HydraUTxOs;
};

export type SnapshotSideLoaded = {
  tag: "SnapshotSideLoaded";
  headId: string;
  snapshotNumber: number;
  seq: number;
  timestamp: string;
};

export interface SnapshotConfirmed extends HydraBaseEvent {
  tag: "SnapshotConfirmed";
  headId: string;
  snapshot: Snapshot;
}

export type seenSnapshot =
  | NoSeenSnapshot
  | LastSeenSnapshot
  | RequestedSnapshot
  | SeenSnapshot;

export type SideLoadSnapshot = {
  tag: "SideLoadSnapshot";
  snapshot: InitialSnapshot | ConfirmedSnapshot;
};

export type snapshotEvents =
  | InitialSnapshot
  | NoSeenSnapshot
  | LastSeenSnapshot
  | RequestedSnapshot
  | SeenSnapshot
  | ConfirmedSnapshot
  | SnapshotSideLoaded
  | SnapshotConfirmed
  | SideLoadSnapshot;
