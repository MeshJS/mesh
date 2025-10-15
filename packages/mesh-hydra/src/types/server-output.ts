import { IgnoredHeadInitializing, InvalidInput } from "./events/command-failed";
import {
  CommitApproved,
  CommitFinalized,
  CommitRecorded,
  CommitRecovered,
  Committed,
} from "./events/commit";
import {
  DecommitApproved,
  DecommitFinalized,
  DecommitInvalid,
  DecommitRequested,
} from "./events/decommit";
import { DepositActivated, DepositExpired } from "./events/deposit";
import {
  HeadIsAborted,
  HeadIsClosed,
  HeadIsContested,
  HeadIsFinalized,
  HeadIsInitializing,
  HeadIsOpen,
  ReadyToFanout,
} from "./events/head-cycle";
import {
  EventLogRotated,
  NetworkClusterIDMismatch,
  NetworkConnected,
  NetworkDisconnected,
  NetworkVersionMismatch,
  PeerConnected,
  PeerDisconnected,
} from "./events/network";
import { SnapshotConfirmed, SnapshotSideLoaded } from "./events/snapshot";
import { TxInvalid, TxValid } from "./events/transaction";

export type ServerOutput =
  | NetworkConnected
  | NetworkDisconnected
  | NetworkVersionMismatch
  | NetworkClusterIDMismatch
  | PeerConnected
  | PeerDisconnected
  | HeadIsInitializing
  | Committed
  | HeadIsOpen
  | HeadIsClosed
  | HeadIsContested
  | ReadyToFanout
  | HeadIsAborted
  | HeadIsFinalized
  | TxValid
  | TxInvalid
  | SnapshotConfirmed
  | InvalidInput
  | IgnoredHeadInitializing
  | DecommitInvalid
  | DecommitRequested
  | DecommitApproved
  | DecommitFinalized
  | CommitRecorded
  | DepositActivated
  | DepositExpired
  | CommitApproved
  | CommitFinalized
  | CommitRecovered
  | SnapshotSideLoaded
  | EventLogRotated;
