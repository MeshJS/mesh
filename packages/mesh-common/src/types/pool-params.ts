import { Relay } from "./relay";

export type PoolParams = {
  vrfKeyHash: string;
  operator: string;
  pledge: string;
  cost: string;
  margin: [number, number];
  relays: Relay[];
  owners: string[];
  rewardAddress: string;
  metadata?: PoolMetadata;
};

export type PoolMetadata = {
  URL: string;
  hash: string;
};

/** A stake pool's registration, as the ledger holds it */
export type PoolState = {
  /** Bech32 pool id */
  poolId: string;
  registered: boolean;
  /** Deposit paid on registration, in lovelace, when the provider reports it */
  deposit?: string;
  /** Epoch at which the pool retires, if it has announced its retirement */
  retirementEpoch?: number;
  /** The stake address its deposit goes back to when it retires, when the provider reports it */
  rewardAddress?: string;
};
