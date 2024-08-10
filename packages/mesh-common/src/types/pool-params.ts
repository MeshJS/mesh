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