// this is what blockstreams returns
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

// this is what maestro returns
export type UTxO2 = {
  readonly txId: string;
  readonly satoshis: bigint;
  readonly address: string;
  readonly vout: number;
  readonly block_height: number;
};