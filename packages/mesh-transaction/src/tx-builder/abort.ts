import { TxBuildError } from "./errors";

/**
 * The error of a call whose signal aborted it, with the signal's reason as the cause
 * @param what The call, as the message names it
 */
export const abortedError = (signal: AbortSignal, what = "the build") =>
  new TxBuildError(
    "ABORTED",
    `${what} was aborted by its signal`,
    signal.reason === undefined ? undefined : { cause: signal.reason },
  );

/** @throws TxBuildError ABORTED when the signal is aborted */
export const throwIfAborted = (
  signal: AbortSignal | undefined,
  what?: string,
) => {
  if (signal?.aborted) throw abortedError(signal, what);
};

/**
 * Waits for a promise until the signal aborts, then rejects with ABORTED at once. The request
 * behind the promise cannot be cancelled: what it later answers or throws is dropped.
 */
export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  what?: string,
): Promise<T> => {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError(signal, what));
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

/** What `within` gives when the time is up before the promise settles */
export const TIMED_OUT = Symbol("timed out");

/** The longest delay a timer takes; a longer one fires at once */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * Waits for a promise no longer than `ms` (no limit when undefined); `TIMED_OUT` after that.
 * What the promise does later is dropped. A limit longer than a timer takes is waited for in
 * several timers. With a signal, its abort rejects with ABORTED at once. Whichever comes first,
 * the timer is cleared and the listener removed.
 * @param what The call an aborted signal names
 */
export const within = <T>(
  promise: Promise<T>,
  ms: number | undefined,
  signal?: AbortSignal,
  what?: string,
): Promise<T | typeof TIMED_OUT> => {
  if (ms === undefined && !signal) return promise;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      finish();
      reject(abortedError(signal!, what));
    };
    const finish = () => {
      clearTimeout(timer);
      if (typeof signal?.removeEventListener === "function")
        signal.removeEventListener("abort", onAbort);
    };
    if (ms !== undefined) {
      const endsAt = Date.now() + Math.max(0, ms);
      const arm = (delay: number) => {
        timer = setTimeout(() => {
          const left = endsAt - Date.now();
          if (left > 0) arm(Math.min(left, MAX_TIMER_MS));
          else {
            finish();
            resolve(TIMED_OUT);
          }
        }, delay);
      };
      arm(Math.min(Math.max(0, ms), MAX_TIMER_MS));
    }
    // Handled in every case, so a rejection after the time is up is never left unhandled
    promise.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error) => {
        finish();
        reject(error);
      },
    );
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
};
