import { Relay, relayToObj } from "./relay";

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

export const poolParamsToObj = (poolParams: PoolParams): object => {
  return {
    vrfKeyHash: poolParams.vrfKeyHash,
    operator: poolParams.operator,
    pledge: poolParams.pledge,
    cost: poolParams.cost,
    margin: poolParams.margin,
    relays: poolParams.relays.map((relay) => relayToObj(relay)),
    owners: poolParams.owners,
    rewardAddress: poolParams.rewardAddress,
    metadata: poolParams.metadata
      ? poolMetadataToObj(poolParams.metadata)
      : undefined,
  };
};

export type PoolMetadata = {
  URL: string;
  hash: string;
};

export const poolMetadataToObj = (poolMetadata: PoolMetadata): object => {
  return {
    url: poolMetadata.URL,
    metadata: poolMetadata.hash,
  };
};
