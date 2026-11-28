const BRAND = Symbol.for("@meshsdk/common/TxConfirmTimeoutError");

/** Raised by every wait for a confirmation that runs out of time */
export class TxConfirmTimeoutError extends Error {
  readonly name: "TxConfirmTimeoutError" = "TxConfirmTimeoutError";
  /** The transaction waited for */
  readonly txHash: string;
  /** How long the wait lasted, in milliseconds */
  readonly timeoutMs: number;
  /** What the wait met last before it ran out of time, when it met something */
  declare readonly cause?: unknown;

  /**
   * @param txHash The transaction waited for
   * @param timeoutMs How long the wait lasted, in milliseconds
   * @param options.cause What the wait met last, e.g. the error of its last poll
   */
  constructor(
    txHash: string,
    timeoutMs: number,
    options?: { cause?: unknown },
  ) {
    super(`Transaction ${txHash} was not confirmed within ${timeoutMs} ms`);
    this.txHash = txHash;
    this.timeoutMs = timeoutMs;
    if (options?.cause !== undefined) this.cause = options.cause;
  }

  /**
   * Whether a value is a `TxConfirmTimeoutError`, also one made by another copy of this
   * package, or an instance of a subclass
   */
  static is(error: unknown): error is TxConfirmTimeoutError {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as Record<symbol, unknown>)[BRAND] === true
    );
  }
}

Object.defineProperty(TxConfirmTimeoutError.prototype, BRAND, { value: true });
