const ALL_NETWORKS = ['testnet', 'preview', 'preprod', 'mainnet'] as const;

export type Network = typeof ALL_NETWORKS[number];

export const isNetwork = (value: unknown): value is Network => {
  return ALL_NETWORKS.includes(value as Network);
};
