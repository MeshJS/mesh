import { hydraTransaction } from "../hydra/hydraTransaction";
import { HydraUTxOs } from "../hydra/hydraUTxOs";

type DecommitTxInvalid = {
  tag: "DecommitTxInvalid";
  localUTxO: HydraUTxOs;
  validationError: {
    reason: string;
    [key: string]: unknown;
  };
};

type DecommitAlreadyInFlight = {
  tag: "DecommitAlreadyInFlight";
  otherDecommitTxId: string;
};

export type DecommitInvalid = {
  tag: "DecommitInvalid";
  headId: string;
  decommitTx: hydraTransaction;
  decommitInvalidReason: DecommitTxInvalid | DecommitAlreadyInFlight;
};

export type DecommitRequested = {
  tag: "DecommitRequested";
  headId: string;
  decommitTx: hydraTransaction;
  utxoToDecommit: HydraUTxOs;
  seq: number;
  timestamp: string;
};

export type DecommitApproved = {
  tag: "DecommitApproved";
  headId: string;
  seq: number;
  timestamp: string;
};

export type DecommitFinalized = {
  tag: "DecommitFinalized";
  headId: string;
  seq: number;
  timestamp: string;
};

export type DecommitEvent =
  | DecommitInvalid
  | DecommitTxInvalid
  | DecommitAlreadyInFlight
  | DecommitRequested
  | DecommitApproved
  | DecommitFinalized;