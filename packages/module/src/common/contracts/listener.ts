export interface IListener {
  onNextTx(callback: (tx: unknown) => void): Promise<() => void>;
}
