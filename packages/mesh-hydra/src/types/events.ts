import {
  HydraParty,
  HydraSnapshot,
  hTransaction,
} from "../types";
import { hUTxOs } from "./hUTxOs";
import { PostChainTx } from "./hydra-post-chain-tx";

export type Greetings = {
  tag: "Greetings";
  me: {
    vkey: string;
  };
  headStatus:
    | "Idle"
    | "Initializing"
    | "Open"
    | "Closed"
    | "FanoutPossible"
    | "Final";
  hydraHeadId: string;
  snapshotUtxo: hUTxOs;
  timestamp: string;
  hydraNodeVersion: string;
};

export type PeerConnected = {
  tag: "PeerConnected";
  peer: string;
  seq: number;
  timestamp: string;
};

export type PeerDisconnected = {
  tag: "PeerDisconnected";
  peer: string;
  seq: number;
  timestamp: string;
};

export type PeerHandshakeFailure = {
  tag: "PeerHandshakeFailure";
  remoteHost:
    | {
        tag: "IPv4";
        ipv4: string;
      }
    | {
        tag: "IPv6";
        ipv6: string;
      };
  ourVersion: number;
  theirVersions: number[];
  seq: number;
  timestamp: string;
};

export type HeadIsInitializing = {
  tag: "HeadIsInitializing";
  headId: string;
  parties: HydraParty[];
  seq: number;
  timestamp: string;
};

export type Committed = {
  tag: "Committed";
  parties: HydraParty[];
  utxo: hUTxOs;
  seq: number;
  timestamp: string;
};

export type HeadIsOpen = {
  tag: "HeadIsOpen";
  headId: string;
  utxo: hUTxOs;
  seq: number;
  timestamp: string;
};

export type HeadIsClosed = {
  tag: "HeadIsClosed";
  headId: string;
  snapshotNumber: number;
  contestationDeadline: string;
  seq: number;
  timestamp: string;
};

export type HeadIsContested = {
  tag: "HeadIsContested";
  headId: string;
  snapshotNumber: number;
  contestationDeadline: string;
  seq: number;
  timestamp: string;
};

export type ReadyToFanout = {
  tag: "ReadyToFanout";
  headId: string;
  seq: number;
  timestamp: string;
};

export type HeadIsAborted = {
  tag: "HeadIsAborted";
  headId: string;
  utxo: hUTxOs;
  seq: number;
  timestamp: string;
};

export type HeadIsFinalized = {
  tag: "HeadIsFinalized";
  headId: string;
  utxo: hUTxOs;
  seq: number;
  timestamp: string;
};

export type TxValid = {
  headId: string;
  tag: "TxValid";
  seq: number;
  timestamp: string;
  transaction: hTransaction;
};

export type TxInvalid = {
  tag: "TxInvalid";
  headId: string;
  utxo: hUTxOs;
  transaction: hTransaction;
  validationError: { reason: string };
  seq: number;
  timestamp: string;
};

export type SnapshotConfirmed = {
  tag: "SnapshotConfirmed";
  headId: string;
  snapshot: HydraSnapshot;
  seq: number;
  timestamp: string;
};

export type GetUTxOResponse = {
  tag: "GetUTxOResponse";
  headId: string;
  utxo: hUTxOs;
  seq: number;
  timestamp: string;
};

export type InvalidInput = {
  tag: "InvalidInput";
  reason: string;
  input: string;
  seq: number;
  timestamp: string;
};

export type PostTxOnChainFailed = {
  tag: "PostTxOnChainFailed";
  postChainTx: PostChainTx;
  postTxError: unknown;
  seq: number;
  timestamp: string;
};

export type CommandFailed = {
  tag: "CommandFailed";
  clientInput:
    | {
        tag: "Abort";
      }
    | { tag: "NewTx"; transaction: hTransaction }
    | { tag: "GetUTxO" }
    | { tag: "Decommit"; decommitTx: hTransaction }
    | { tag: "Close" }
    | { tag: "Contest" }
    | { tag: "Fanout" };
  seq: number;
  timestamp: string;
};

export type IgnoredHeadInitializing = {
  tag: "IgnoredHeadInitializing";
  headId: string;
  contestationPeriod: number;
  parties: HydraParty[];
  participants: string[];
  seq: number;
  timestamp: string;
};

export type DecommitInvalid = {
  tag: "DecommitInvalid";
  headId: string;
  decommitTx: hTransaction;
  decommitInvalidReason:
    | {
        tag: "DecommitTxInvalid";
        localUtxo: hUTxOs;
        validationError: { reason: string };
      }
    | { tag: "DecommitAlreadyInFlight"; otherDecommitTxId: string };
};

export type DecommitRequested = {
  tag: "DecommitRequested";
  headId: string;
  decommitTx: hTransaction;
  utxoToDecommit: hUTxOs;
  seq: number;
  timestmap: string;
};

export type DecommitApproved = {
  tag: "DecommitApproved";
  headId: string;
  decommitTxId: string;
  utxoToDecommit: hUTxOs;
  seq: number;
  timestamp: string;
};

export type DecommitFinalized = {
  tag: "DecommitFinalized";
  headId: string;
  decommitTxId: string;
  seq: number;
  timestamp: string;
};
