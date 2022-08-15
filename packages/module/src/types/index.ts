export type WalletApi = {
  getNetworkId(): Promise<number>;
  getUtxos(): Promise<string[] | undefined>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign: boolean): Promise<string>;
  signData(address: string, payload: string): Promise<string>; //Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
  getCollateral(): Promise<string[]>;
};

export type Cardano = {
  [key: string]: {
    name: string;
    icon: string;
    version: string;
    enable(): Promise<WalletApi>;
    isEnabled(): Promise<boolean>;
  };
};

declare interface Window {
  cardano: Cardano;
}

export type ProtocolParameters = {
  coins_per_utxo_size: string;
  coins_per_utxo_word: string;
  collateral_percent: number;
  decentralisation_param: number;
  e_max: number;
  epoch: number;
  key_deposit: string;
  max_block_ex_mem: string;
  max_block_ex_steps: string;
  max_block_header_size: number;
  max_block_size: number;
  max_collateral_inputs: number;
  max_tx_ex_mem: string;
  max_tx_ex_steps: string;
  max_tx_size: number;
  max_val_size: string;
  min_fee_a: number;
  min_fee_b: number;
  min_pool_cost: string;
  min_utxo: string;
  n_opt: number;
  nonce: string;
  pool_deposit: string;
  price_mem: number,
  price_step: number,
  protocol_major_ver: number;
  protocol_minor_ver: number;
};

export type Asset = {
  unit: string;
  quantity: number;
  policy: string;
  name: string;
  onchain?: { onchain_metadata: { image: string } };
  image?: string;
};

export type Assets = {
  [unit: string]: number;
};

export type TxHash = string;
export type Address = string;
export type DatumHash = string;
export type Datum = string;

export type UTxO = {
  cbor: string;
  txHash: TxHash;
  outputIndex: number;
  assets: Assets;
  address: Address;
  datumHash?: DatumHash;
  datum?: Datum; // some providers may be able to return the datum as well in an efficient way
};

export type Recipient = {
  address: string;
  assets: { [assetId: string]: number };
};
