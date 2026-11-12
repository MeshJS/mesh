import { ProviderError } from "../errors/provider-error";
import { TxConfirmTimeoutError } from "../errors/tx-confirm-timeout-error";
import { IFetcher } from "../interfaces/fetcher";
import { AwaitTxOptions } from "../interfaces/listener";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 5_000;
/** The longest delay a timer keeps; a longer one fires at once */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Waits with any provider: `awaitTransactionConfirmation` when it has one, always given
 * `timeoutMs` (a resolved `false`, or a rejection once the deadline has passed, read as a
 * timeout), else polling `fetchTxInfo`, retrying only "not found": a `ProviderError` of another
 * kind is thrown at once. While polling, a thrown value that is not a `ProviderError` is
 * repeated like "not found", and the timeout carries the last thrown value as its `cause`.
 *
 * The wait resolves at the first block that holds the transaction and reads nothing from the
 * answer: it sees neither depth nor rollbacks, nor whether the transaction's scripts passed (a
 * caller that needs that reads `validContract` from `fetchTxInfo`). Its timeout does not mean
 * that the transaction will not land.
 *
 * Every failure is a rejection of the returned promise; the function never throws.
 * @throws TxConfirmTimeoutError after `timeoutMs`
 * @throws ProviderError of kind `"unsupported"` when the provider has neither method
 * @throws the `reason` of `options.signal` when the signal is or becomes aborted
 * @throws Error for a `timeoutMs` or `pollMs` outside its range
 */
export function awaitTransactionConfirmation(
  provider: Partial<Pick<IFetcher, "fetchTxInfo">> & {
    awaitTransactionConfirmation?(
      txHash: string,
      timeoutMs?: number,
    ): Promise<boolean>;
  },
  txHash: string,
  options: AwaitTxOptions = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { signal } = options;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    if (
      typeof timeoutMs !== "number" ||
      !(timeoutMs >= 0 && timeoutMs <= MAX_TIMER_MS)
    ) {
      reject(
        new Error(
          `timeoutMs must be a number from 0 to ${MAX_TIMER_MS}, got ${String(timeoutMs)}`,
        ),
      );
      return;
    }
    if (typeof pollMs !== "number" || !(pollMs > 0 && pollMs <= MAX_TIMER_MS)) {
      reject(
        new Error(
          `pollMs must be a number above 0 and at most ${MAX_TIMER_MS}, got ${String(pollMs)}`,
        ),
      );
      return;
    }
    const ownWait =
      typeof provider?.awaitTransactionConfirmation === "function";
    if (!ownWait && typeof provider?.fetchTxInfo !== "function") {
      reject(
        new ProviderError(
          "The provider has neither awaitTransactionConfirmation nor fetchTxInfo",
          { kind: "unsupported" },
        ),
      );
      return;
    }
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let thrown: { value: unknown } | undefined;

    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      clearTimeout(pollTimer);
      signal?.removeEventListener("abort", onAbort);
      outcome();
    };
    const timeOut = () =>
      settle(() =>
        reject(
          new TxConfirmTimeoutError(
            txHash,
            timeoutMs,
            thrown && { cause: thrown.value },
          ),
        ),
      );
    const onAbort = () => settle(() => reject(signal!.reason));

    // Started before the provider is asked, so it wins a tie with the provider's own timer
    const startedAt = Date.now();
    const deadlineTimer = setTimeout(timeOut, timeoutMs);
    signal?.addEventListener("abort", onAbort);

    if (ownWait) {
      call(() =>
        provider.awaitTransactionConfirmation!(txHash, timeoutMs),
      ).then(
        (confirmed) => (confirmed ? settle(resolve) : timeOut()),
        (error) => {
          // A rejection at or after the deadline is a timeout, also when the deadline timer
          // has not run yet. With a timeout of 0 only the timer marks the deadline: a
          // rejection that comes before it runs is passed on, as when polling.
          if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) timeOut();
          else settle(() => reject(error));
        },
      );
      return;
    }

    const poll = () => {
      call(() => provider.fetchTxInfo!(txHash)).then(
        () => settle(resolve),
        (error) => {
          if (settled) return;
          thrown = { value: error };
          if (ProviderError.is(error) && error.kind !== "notFound") {
            settle(() => reject(error));
            return;
          }
          pollTimer = setTimeout(poll, pollMs);
        },
      );
    };
    poll();
  });
}

/** Calls `f`, turning a synchronous throw into a rejection */
function call<T>(f: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(f());
  } catch (error) {
    return Promise.reject(error);
  }
}
