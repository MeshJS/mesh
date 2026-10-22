import { GovernanceActionKind } from "./governance";

/**
 * Ledger state as a provider reports it, beyond UTxOs: what a transaction's validity can depend
 * on. Read through the optional methods of `IFetcherExtended`.
 */

/** A key or script credential, by hash */
export type CredentialState = { type: "key" | "script"; hash: string };

/** A stake address, registered or not */
export type AccountState = {
  rewardAddress: string;
  registered: boolean;
  /** Deposit paid on registration, in lovelace */
  deposit?: string;
  /** Reward balance, in lovelace */
  rewards: string;
  /** Key hash of the pool the stake is delegated to */
  pool?: string;
  /** Id of the DRep the vote is delegated to, or `alwaysAbstain` / `alwaysNoConfidence` */
  drep?: string;
};

/** A stake pool, registered or not */
export type PoolState = {
  /** Key hash of the pool operator */
  poolId: string;
  registered: boolean;
  /** Deposit paid on registration, in lovelace */
  deposit?: string;
  /** Epoch at which a pending retirement takes effect */
  retirementEpoch?: number;
};

/** A DRep, registered or not */
export type DRepState = {
  drepId: string;
  registered: boolean;
  /** Deposit paid on registration, in lovelace */
  deposit?: string;
};

/** A governance action, by the transaction that proposed it and the proposal's position */
export type GovernanceActionState = {
  txHash: string;
  index: number;
  kind: GovernanceActionKind;
  /** Still open for votes: neither ratified, enacted, dropped nor expired */
  active: boolean;
};

/** A constitutional committee member, sitting or proposed */
export type CommitteeMemberState = {
  cold: CredentialState;
  hot?: CredentialState;
  resigned: boolean;
  /** Proposed by an update-committee action not yet enacted */
  potential?: boolean;
};
