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

export type Relay =
  | {
      type: 'SingleHostAddr';
      IPV4?: string;
      IPV6?: string;
      port?: number;
    }
  | {
      type: 'SingleHostName';
      domainName: string;
      port?: number;
    }
  | {
      type: 'MultiHostName';
      domainName: string;
    };

export type PoolMetadata = {
  URL: string;
  hash: string;
};
