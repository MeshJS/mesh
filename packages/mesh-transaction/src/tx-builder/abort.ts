import { TxBuildError } from "./errors";

/** The error of a call whose signal aborted it, with the signal's reason as the cause */
export const abortedError = (signal: AbortSignal) =>
  new TxBuildError(
    "ABORTED",
    "the build was aborted by its signal",
    signal.reason === undefined ? undefined : { cause: signal.reason },
  );

/** @throws TxBuildError ABORTED when the signal is aborted */
export const throwIfAborted = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) throw abortedError(signal);
};

/**
 * Waits for a promise until the signal aborts, then rejects with ABORTED at once. The request
 * behind the promise cannot be cancelled: what it later answers or throws is dropped.
 */
export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError(signal));
    const done = () => {
      if (typeof signal.removeEventListener === "function")
        signal.removeEventListener("abort", onAbort);
    };
    // Handled in every case, so a rejection after the abort is never left unhandled
    promise.then(
      (value) => {
        done();
        resolve(value);
      },
      (error) => {
        done();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
};
