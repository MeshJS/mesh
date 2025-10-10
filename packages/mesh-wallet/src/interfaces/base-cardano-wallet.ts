export interface ICardanoWallet {
  getNetworkId(): number;
  getUtxos(): string[];
  getCollateral(): string[];
  getBalance(): string;
  getUsedAddresses(): string[];
  getUnusedAddresses(): string[];
  getChangeAddress(): string;
  getRewardAddress(): string;
  signTx(data: string): string;
  signData(data: string): string;
  submitTx(tx: string): string;
}
