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
