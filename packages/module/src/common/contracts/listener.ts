export interface IListener {
  onTxConfirmed(txHash: string, callback: () => void, limit?: number): void;
}
