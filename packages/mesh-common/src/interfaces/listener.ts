export interface IListener {
  onTxConfirmed(txHash: string, callback: () => void, limit?: number): void;
  /**
   * Resolves once the transaction is in a block. The signature is the one the UTxO RPC and
   * devnet providers have: a resolved `false` is read as a timeout. Callers always pass
   * `timeoutMs`: the UTxO RPC provider resolves `false` at once without one.
   */
  awaitTransactionConfirmation?(
    txHash: string,
    timeoutMs?: number,
  ): Promise<boolean>;
}

/** How long to wait for a confirmation */
export type AwaitTxOptions = {
  /**
   * Rejects with `TxConfirmTimeoutError` after this long; 120 000 ms by default. From 0 to
   * 2 147 483 647
   */
  timeoutMs?: number;
  /**
   * Time between polls when the provider has no wait of its own; 5 000 ms by default. Above 0,
   * at most 2 147 483 647
   */
  pollMs?: number;
  /** Stops the wait: it rejects with the signal's `reason` */
  signal?: AbortSignal;
};
