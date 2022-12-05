import { Relay } from './Relay';

export type PoolParams = {
  operator: string;
  vrfKeyHash: string;
  pledge: string;
  cost: string;
  margin: number;
  rewardAddress: string;
  relays: Relay[];
  owners: string[];
  metadata?: PoolMetadata;
};

export type PoolMetadata = {
  URL: string;
  hash: string;
};
