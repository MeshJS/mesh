export interface IListener {
  onTxConfirmed(hash: string, callback: () => void, limit?: number): void;
}
