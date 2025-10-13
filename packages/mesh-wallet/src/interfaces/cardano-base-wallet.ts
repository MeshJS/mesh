export interface ICardanoWallet {
  getNetworkId(): number;
  getUtxos(): Promise<string[]>;
  getCollateral(): Promise<string[]>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddress(): Promise<string>;
  signTx(data: string): Promise<string>;
  signData(data: string): Promise<string>;
  submitTx(tx: string): Promise<string>;
}
