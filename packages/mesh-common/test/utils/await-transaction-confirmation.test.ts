import {
  awaitTransactionConfirmation,
  ProviderError,
  TransactionInfo,
  TxConfirmTimeoutError,
} from "@meshsdk/common";

const TX = "ab".repeat(32);

const txInfo = (fields: Partial<TransactionInfo> = {}) =>
  ({ hash: TX, block: "b", slot: "1", ...fields }) as TransactionInfo;

const notFound = () => new ProviderError("missing", { kind: "notFound" });

/** Follows a promise without letting its rejection go unhandled */
const track = <T>(promise: Promise<T>) => {
  const state: {
    settled: boolean;
    value?: T;
    error?: unknown;
    rejected: boolean;
  } = { settled: false, rejected: false };
  promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (error) => Object.assign(state, { settled: true, rejected: true, error }),
  );
  return state;
};

/** A promise and the functions that settle it */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** A provider with its own wait */
const waiter = (answer: () => Promise<boolean>) => ({
  awaitTransactionConfirmation: jest.fn(
    (_txHash: string, _timeoutMs?: number) => answer(),
  ),
  fetchTxInfo: jest.fn(async () => txInfo()),
});

/** A provider polled with `fetchTxInfo`, answering with each of `answers` in turn */
const poller = (...answers: (() => Promise<TransactionInfo>)[]) => {
  let call = 0;
  return {
    fetchTxInfo: jest.fn((_hash: string) => {
      const answer = answers[Math.min(call++, answers.length - 1)]!;
      return answer();
    }),
  };
};

/** Gives the promise jobs of already settled promises a chance to run */
const flush = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("awaitTransactionConfirmation", () => {
  describe("with the provider's own wait", () => {
    it("resolves when the provider confirms, without polling", async () => {
      const provider = waiter(async () => true);
      await expect(
        awaitTransactionConfirmation(provider, TX),
      ).resolves.toBeUndefined();
      expect(provider.awaitTransactionConfirmation).toHaveBeenCalledTimes(1);
      expect(provider.awaitTransactionConfirmation).toHaveBeenCalledWith(
        TX,
        120_000,
      );
      expect(provider.fetchTxInfo).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it("passes a given timeout to the provider", async () => {
      const provider = waiter(async () => true);
      await awaitTransactionConfirmation(provider, TX, { timeoutMs: 30_000 });
      expect(provider.awaitTransactionConfirmation).toHaveBeenCalledWith(
        TX,
        30_000,
      );
    });

    it("reads false from the provider as a timeout", async () => {
      const provider = waiter(async () => false);
      const error = await awaitTransactionConfirmation(provider, TX, {
        timeoutMs: 30_000,
      }).catch((e) => e);
      expect(TxConfirmTimeoutError.is(error)).toBe(true);
      expect(error.txHash).toBe(TX);
      expect(error.timeoutMs).toBe(30_000);
      expect("cause" in error).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("times out on its own when the provider never answers", async () => {
      const provider = waiter(() => new Promise<boolean>(() => {}));
      const wait = track(
        awaitTransactionConfirmation(provider, TX, { timeoutMs: 1000 }),
      );
      await jest.advanceTimersByTimeAsync(999);
      expect(wait.settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
      expect((wait.error as TxConfirmTimeoutError).timeoutMs).toBe(1000);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("leaves no unhandled rejection when the provider rejects after the timeout", async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        const late = deferred<boolean>();
        const provider = waiter(() => late.promise);
        const wait = track(
          awaitTransactionConfirmation(provider, TX, { timeoutMs: 1000 }),
        );
        await jest.advanceTimersByTimeAsync(1000);
        expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
        late.reject(new Error("late"));
        await flush();
        await new Promise((resolve) =>
          jest.requireActual("timers").setImmediate(resolve),
        );
        expect(unhandled).toEqual([]);
        expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });

    it("passes on a rejection before the deadline unchanged", async () => {
      const failure = new Error("connection reset");
      await expect(
        awaitTransactionConfirmation(
          waiter(async () => {
            throw failure;
          }),
          TX,
        ),
      ).rejects.toBe(failure);

      const own = new TxConfirmTimeoutError(TX, 5);
      await expect(
        awaitTransactionConfirmation(
          waiter(async () => {
            throw own;
          }),
          TX,
        ),
      ).rejects.toBe(own);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("reads a rejection from the provider's own timer of the same length as a timeout", async () => {
      const provider = {
        awaitTransactionConfirmation: (_txHash: string, timeoutMs = 0) =>
          new Promise<boolean>((_resolve, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs),
          ),
      };
      const wait = track(
        awaitTransactionConfirmation(provider, TX, { timeoutMs: 2000 }),
      );
      await jest.advanceTimersByTimeAsync(2000);
      expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
      expect((wait.error as TxConfirmTimeoutError).timeoutMs).toBe(2000);
    });

    it("reads a rejection once the deadline has passed as a timeout, before its timer runs", async () => {
      const late = deferred<boolean>();
      const wait = track(
        awaitTransactionConfirmation(
          waiter(() => late.promise),
          TX,
          { timeoutMs: 2000 },
        ),
      );
      // The clock passes the deadline while the timer has not run yet
      jest.setSystemTime(Date.now() + 2000);
      late.reject(new Error("Timeout"));
      await Promise.resolve();
      await Promise.resolve();
      expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
    });
  });

  describe("polling fetchTxInfo", () => {
    it("resolves after one call when the transaction is there", async () => {
      const provider = poller(async () => txInfo());
      await expect(
        awaitTransactionConfirmation(provider, TX),
      ).resolves.toBeUndefined();
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
      expect(provider.fetchTxInfo).toHaveBeenCalledWith(TX);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("resolves for a transaction whose scripts failed", async () => {
      const provider = poller(async () => txInfo({ validContract: false }));
      await expect(
        awaitTransactionConfirmation(provider, TX),
      ).resolves.toBeUndefined();
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
    });

    it("repeats not found after each pause", async () => {
      const provider = poller(
        async () => {
          throw notFound();
        },
        async () => {
          throw notFound();
        },
        async () => txInfo(),
      );
      const wait = track(awaitTransactionConfirmation(provider, TX));
      await flush();
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(4999);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(2);
      expect(wait.settled).toBe(false);
      await jest.advanceTimersByTimeAsync(5000);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(3);
      expect(wait.settled).toBe(true);
      expect(wait.rejected).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("pauses for a given pollMs", async () => {
      const provider = poller(
        async () => {
          throw notFound();
        },
        async () => txInfo(),
      );
      const wait = track(
        awaitTransactionConfirmation(provider, TX, { pollMs: 300 }),
      );
      await jest.advanceTimersByTimeAsync(299);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(2);
      expect(wait.settled && !wait.rejected).toBe(true);
    });

    it("throws a ProviderError of another kind at once", async () => {
      const unauthorized = new ProviderError("bad key", {
        kind: "unauthorized",
        status: 403,
      });
      const provider = poller(async () => {
        throw unauthorized;
      });
      const wait = track(awaitTransactionConfirmation(provider, TX));
      await flush();
      expect(wait.error).toBe(unauthorized);
      await jest.advanceTimersByTimeAsync(200_000);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("reads not found from another copy of the package", async () => {
      let Other: typeof ProviderError | undefined;
      jest.isolateModules(() => {
        Other = require("@meshsdk/common").ProviderError;
      });
      expect(Other).not.toBe(ProviderError);
      const otherNotFound = new Other!("missing", { kind: "notFound" });
      expect(otherNotFound instanceof ProviderError).toBe(false);
      const provider = poller(
        async () => {
          throw otherNotFound;
        },
        async () => txInfo(),
      );
      const wait = track(awaitTransactionConfirmation(provider, TX));
      await jest.advanceTimersByTimeAsync(5000);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(2);
      expect(wait.settled && !wait.rejected).toBe(true);

      const otherUnauthorized = new Other!("bad key", { kind: "unauthorized" });
      const failing = poller(async () => {
        throw otherUnauthorized;
      });
      const failed = track(awaitTransactionConfirmation(failing, TX));
      await flush();
      expect(failed.error).toBe(otherUnauthorized);
    });

    it("repeats other thrown values until the deadline and keeps the last as cause", async () => {
      const text = JSON.stringify({ data: "bad key", status: 403 });
      const plain = new Error("fetch failed");
      const provider = poller(
        async () => {
          throw text;
        },
        () => {
          throw plain;
        },
      );
      const wait = track(
        awaitTransactionConfirmation(provider, TX, {
          timeoutMs: 12_000,
          pollMs: 5000,
        }),
      );
      await jest.advanceTimersByTimeAsync(11_999);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(3);
      expect(wait.settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
      expect((wait.error as TxConfirmTimeoutError).cause).toBe(plain);

      const textOnly = poller(async () => {
        throw text;
      });
      const waitText = track(
        awaitTransactionConfirmation(textOnly, TX, { timeoutMs: 6000 }),
      );
      await jest.advanceTimersByTimeAsync(6000);
      expect(textOnly.fetchTxInfo).toHaveBeenCalledTimes(2);
      expect((waitText.error as TxConfirmTimeoutError).cause).toBe(text);
    });

    it("times out at the deadline when never found, and asks no more", async () => {
      const provider = poller(async () => {
        throw notFound();
      });
      const wait = track(
        awaitTransactionConfirmation(provider, TX, { timeoutMs: 20_000 }),
      );
      await jest.advanceTimersByTimeAsync(19_999);
      expect(wait.settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      const error = wait.error as TxConfirmTimeoutError;
      expect(TxConfirmTimeoutError.is(error)).toBe(true);
      expect(error.txHash).toBe(TX);
      expect(error.timeoutMs).toBe(20_000);
      const calls = provider.fetchTxInfo.mock.calls.length;
      expect(calls).toBe(4);
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(100_000);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(calls);
    });
  });

  describe("signal", () => {
    it("rejects with the reason of a signal aborted before the call", async () => {
      const reason = new Error("stopped");
      const provider = poller(async () => txInfo());
      const own = waiter(async () => true);
      await expect(
        awaitTransactionConfirmation(provider, TX, {
          signal: AbortSignal.abort(reason),
        }),
      ).rejects.toBe(reason);
      await expect(
        awaitTransactionConfirmation(own, TX, {
          signal: AbortSignal.abort(reason),
        }),
      ).rejects.toBe(reason);
      expect(provider.fetchTxInfo).not.toHaveBeenCalled();
      expect(own.awaitTransactionConfirmation).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it("rejects with the reason of a signal aborted during a pause", async () => {
      const controller = new AbortController();
      const provider = poller(async () => {
        throw notFound();
      });
      const wait = track(
        awaitTransactionConfirmation(provider, TX, {
          signal: controller.signal,
        }),
      );
      await jest.advanceTimersByTimeAsync(7000);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(2);
      controller.abort("user left");
      await flush();
      expect(wait.error).toBe("user left");
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(200_000);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(2);
    });

    it("rejects with an AbortError when aborted without a reason", async () => {
      const controller = new AbortController();
      const provider = waiter(() => new Promise<boolean>(() => {}));
      const wait = track(
        awaitTransactionConfirmation(provider, TX, {
          signal: controller.signal,
        }),
      );
      await flush();
      controller.abort();
      await flush();
      expect(wait.rejected).toBe(true);
      expect((wait.error as Error).name).toBe("AbortError");
      expect(wait.error).toBe(controller.signal.reason);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("removes its abort listener once settled in another way", async () => {
      const controller = new AbortController();
      const remove = jest.spyOn(controller.signal, "removeEventListener");
      await awaitTransactionConfirmation(
        poller(async () => txInfo()),
        TX,
        {
          signal: controller.signal,
        },
      );
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));

      const other = new AbortController();
      const add = jest.spyOn(other.signal, "addEventListener");
      const removeOther = jest.spyOn(other.signal, "removeEventListener");
      await awaitTransactionConfirmation(
        waiter(async () => false),
        TX,
        { signal: other.signal },
      ).catch(() => {});
      expect(removeOther).toHaveBeenCalledWith("abort", add.mock.calls[0]![1]);
    });
  });

  describe("refusals", () => {
    it("rejects a provider with neither method as unsupported", async () => {
      for (const provider of [{}, { fetchTxInfo: "yes" }]) {
        const error = await awaitTransactionConfirmation(
          provider as unknown as Parameters<
            typeof awaitTransactionConfirmation
          >[0],
          TX,
        ).catch((e) => e);
        expect(ProviderError.is(error)).toBe(true);
        expect(error.kind).toBe("unsupported");
        expect(error.retryable).toBe(false);
        expect("status" in error).toBe(false);
        expect(error.message).toMatch(/awaitTransactionConfirmation/);
        expect(error.message).toMatch(/fetchTxInfo/);
        expect(jest.getTimerCount()).toBe(0);
      }
    });

    it("checks the options first, then the methods, then the signal", async () => {
      const signal = AbortSignal.abort(new Error("stopped"));
      const unsupported = await awaitTransactionConfirmation({}, TX, {
        signal,
      }).catch((e) => e);
      expect(ProviderError.is(unsupported)).toBe(true);

      const badOption = await awaitTransactionConfirmation({}, TX, {
        signal,
        pollMs: 0,
      }).catch((e) => e);
      expect(ProviderError.is(badOption)).toBe(false);
      expect(badOption).toBeInstanceOf(Error);
      expect(badOption.message).toMatch(/pollMs/);
    });

    it("rejects a bad pollMs or timeoutMs before the provider is asked", async () => {
      const bad: [string, number][] = [
        ["pollMs", 0],
        ["pollMs", -1],
        ["pollMs", NaN],
        ["pollMs", 2_147_483_648],
        ["timeoutMs", -1],
        ["timeoutMs", NaN],
        ["timeoutMs", Infinity],
        ["timeoutMs", 2_147_483_648],
      ];
      for (const [option, value] of bad) {
        const own = waiter(async () => true);
        const polled = poller(async () => txInfo());
        for (const provider of [own, polled]) {
          const wait = awaitTransactionConfirmation(provider, TX, {
            [option]: value,
          });
          const error = await wait.catch((e) => e);
          expect(error).toBeInstanceOf(Error);
          expect(error.message).toContain(option);
          expect(error.message).toContain(String(value));
        }
        expect(own.awaitTransactionConfirmation).not.toHaveBeenCalled();
        expect(polled.fetchTxInfo).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
      }
    });

    it("accepts the limits of pollMs and timeoutMs", async () => {
      await expect(
        awaitTransactionConfirmation(
          poller(async () => txInfo()),
          TX,
          {
            pollMs: 2_147_483_647,
            timeoutMs: 2_147_483_647,
          },
        ),
      ).resolves.toBeUndefined();
      await expect(
        awaitTransactionConfirmation(
          poller(async () => txInfo()),
          TX,
          {
            pollMs: 1,
          },
        ),
      ).resolves.toBeUndefined();
    });

    it("passes on the provider's own rejection that comes before the timer of a timeoutMs of 0", async () => {
      const unauthorized = new ProviderError("bad key", {
        kind: "unauthorized",
      });
      const provider = waiter(async () => {
        throw unauthorized;
      });
      await expect(
        awaitTransactionConfirmation(provider, TX, { timeoutMs: 0 }),
      ).rejects.toBe(unauthorized);
      expect(provider.awaitTransactionConfirmation).toHaveBeenCalledWith(TX, 0);
      expect(jest.getTimerCount()).toBe(0);
    });
    it("times out with a timeoutMs of 0 when the provider's own wait is slower than the timer", async () => {
      const late = deferred<boolean>();
      const wait = track(
        awaitTransactionConfirmation(
          waiter(() => late.promise),
          TX,
          { timeoutMs: 0 },
        ),
      );
      await flush();
      late.reject(new Error("Timeout"));
      await flush();
      expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
      expect((wait.error as TxConfirmTimeoutError).timeoutMs).toBe(0);
    });
    it("asks once and times out with a timeoutMs of 0", async () => {
      const provider = poller(async () => {
        throw notFound();
      });
      const wait = track(
        awaitTransactionConfirmation(provider, TX, { timeoutMs: 0 }),
      );
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(TxConfirmTimeoutError.is(wait.error)).toBe(true);
      expect((wait.error as TxConfirmTimeoutError).timeoutMs).toBe(0);
      expect(provider.fetchTxInfo).toHaveBeenCalledTimes(1);
    });
  });
});
