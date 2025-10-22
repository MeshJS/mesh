import { hydraTransaction } from "../hydra/hydraTransaction";
import { HydraUTxOs } from "../hydra/hydraUTxOs";
import { PostChainTx } from "./post-tx";

export type ScriptFailedInWallet = {
  tag: "ScriptFailedInWallet";
  redeemerPtr: string;
  failureReason: string;
  failingTx: hydraTransaction;
};

export type InternalWalletError = {
  tag: "InternalWalletError";
  failingTx: hydraTransaction;
  reason: string;
  headUTxO: HydraUTxOs;
};

export type NotEnoughFuel = {
  tag: "NotEnoughFuel";
  failingTx: hydraTransaction;
};

export type NoFuelUTXOFound = {
  tag: "NoFuelUTXOFound";
  failingTx: hydraTransaction;
};

export type CannotFindOwnInitial = {
  tag: "CannotFindOwnInitial";
  knownUTxO: HydraUTxOs;
};

export type UnsupportedLegacyOutput = {
  tag: "UnsupportedLegacyOutput";
  byronAddress: string;
};

export type NoSeedInput = {
  tag: "NoSeedInput";
};

export type InvalidStateToPost = {
  tag: "InvalidStateToPost";
  chainState: any;
  txTried: PostChainTx;
};

export type FailedToPostTx = {
  tag: "FailedToPostTx";
  failureReason: string;
  failingTx: hydraTransaction;
};

export type CommittedTooMuchADAForMainnet = {
  tag: "CommittedTooMuchADAForMainnet";
  userCommittedLovelace: number;
  mainnetLimitLovelace: number;
};

export type FailedToDraftTxNotInitializing = {
  tag: "FailedToDraftTxNotInitializing";
};

export type InvalidSeed = {
  tag: "InvalidSeed";
  headSeed: string;
};

export type InvalidHeadId = {
  tag: "InvalidHeadId";
  headId: string;
};

export type FailedToConstructAbortTx = { tag: "FailedToConstructAbortTx" };
export type FailedToConstructCloseTx = { tag: "FailedToConstructCloseTx" };
export type FailedToConstructContestTx = { tag: "FailedToConstructContestTx" };
export type FailedToConstructCollectTx = { tag: "FailedToConstructCollectTx" };

export type FailedToConstructDepositTx = {
  tag: "FailedToConstructDepositTx";
  failureReason: string;
};

export type FailedToConstructRecoverTx = {
  tag: "FailedToConstructRecoverTx";
  failureReason: string;
};

export type FailedToConstructIncrementTx = {
  tag: "FailedToConstructIncrementTx";
  failureReason: string;
};

export type FailedToConstructDecrementTx = {
  tag: "FailedToConstructDecrementTx";
  failureReason: string;
};

export type FailedToConstructFanoutTx = {
  tag: "FailedToConstructFanoutTx";
};

export type TransactionSubmitted = {
  tag: "TransactionSubmitted";
};

export type PostTxOnChainFailed = {
  tag: "PostTxOnChainFailed";
  postChainTx: PostChainTx;
  postTxError:
    | ScriptFailedInWallet
    | InternalWalletError
    | NotEnoughFuel
    | NoFuelUTXOFound
    | CannotFindOwnInitial
    | UnsupportedLegacyOutput
    | NoSeedInput
    | InvalidStateToPost
    | FailedToPostTx
    | CommittedTooMuchADAForMainnet
    | FailedToDraftTxNotInitializing
    | InvalidSeed
    | InvalidHeadId
    | FailedToConstructAbortTx
    | FailedToConstructCloseTx
    | FailedToConstructContestTx
    | FailedToConstructCollectTx
    | FailedToConstructDepositTx
    | FailedToConstructRecoverTx
    | FailedToConstructIncrementTx
    | FailedToConstructDecrementTx
    | FailedToConstructFanoutTx;
};
