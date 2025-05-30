export type UTxO = {
  status: {
    block_hash: string;
    block_height: number;
    block_time: number;
    confirmed: boolean;
  };
  txid: string;
  value: number;
  vout: number;
};

export type UTxO2 = {
  readonly txId: string;
  readonly index: number;
  readonly satoshis: bigint;
  readonly address: string;
  readonly vout: number;
  readonly block_height: number;
};