export type MaestroSupportedNetworks = "mainnet" | "testnet";

export interface MaestroConfig {
  network: MaestroSupportedNetworks;
  apiKey: string;
}

export interface SatoshiActivity {
  confirmations: number;
  height: number;
  tx_hash: string;
  sat_activity: {
    kind: "self_transfer" | "increase" | "decrease";
    amount: string;
  };
}

export interface SatoshiActivityResponse {
  data: SatoshiActivity[];
  last_updated: {
    block_hash: string;
    block_height: number;
  };
  next_cursor: string | null;
}

export type BalanceResponse = {
  data: number;
};