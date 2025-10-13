export interface ICardanoWallet {
  getNetworkId(): number;
  getUtxos(): Promise<string[]>;
  getCollateral(): Promise<string[]>;
  getBalance(): Promise<string>;
  getUsedAddresses(): string[];
  getUnusedAddresses(): string[];
  getChangeAddress(): string;
  getRewardAddress(): string;
  signTx(data: string): Promise<string>;
  signData(data: string): Promise<string>;
  submitTx(tx: string): Promise<string>;
}
