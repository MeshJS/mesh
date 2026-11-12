import { bech32 } from "bech32";

import {
  Action,
  DEFAULT_PROTOCOL_PARAMETERS,
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
  IEvaluator,
  IFetcher,
  mConStr0,
  Protocol,
  resolveScriptRef,
  UTxO,
} from "@meshsdk/core";
import {
  Address,
  resolvePlutusScriptAddress,
  toTxUnspentOutput,
  Transaction,
  TxCBOR,
} from "@meshsdk/core-cst";

import {
  BuildEvent,
  BuildOptions,
  collateral,
  output,
  PartsInput,
  spend,
  TxBuilder,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
} from "../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../test-util";

const network = "preprod";
const params: Protocol = { ...DEFAULT_PROTOCOL_PARAMETERS };
const costModels = [
  DEFAULT_V1_COST_MODEL_LIST,
  DEFAULT_V2_COST_MODEL_LIST,
  DEFAULT_V3_COST_MODEL_LIST,
];
const wallet = baseAddress(1);
const recipient = baseAddress(2);
const plutusScript = { code: alwaysSucceedCbor, version: "V3" as const };
const scriptAddress = resolvePlutusScriptAddress(plutusScript, 0);

const hexOf = (address: string) =>
  Address.fromString(address)!.toBytes().toString();
const cborOf = (utxo: UTxO) => toTxUnspentOutput(utxo).toCbor().toString();

/** The same address on mainnet */
const onMainnet = (address: string) => {
  const bytes = bech32.fromWords(bech32.decode(address, 200).words);
  bytes[0] = bytes[0]! | 0x01;
  return bech32.encode("addr", bech32.toWords(bytes), 200);
};

const ada = (n: number) => BigInt(n) * 1_000_000n;
let nextHash = 0xf00;
const utxo = (lovelace: bigint, extra: Partial<UTxO["output"]> = {}): UTxO => ({
  input: {
    txHash: (++nextHash).toString(16).padStart(64, "e"),
    outputIndex: 0,
  },
  output: {
    address: wallet,
    amount: [{ unit: "lovelace", quantity: String(lovelace) }],
    ...extra,
  },
});
const ref = (u: UTxO) => `${u.input.txHash}#${u.input.outputIndex}`;
const pay = (n = 2) =>
  output({ address: recipient, value: { lovelace: ada(n) } });

const funds = [utxo(ada(10)), utxo(ada(20))];
/** An always-succeeding script's output, named by out ref and served by the provider */
const locked = utxo(ada(10), {
  address: scriptAddress,
  plutusData: "d87980",
});
const unlock = () =>
  spend.plutus({
    utxo: { txHash: locked.input.txHash, outputIndex: 0 },
    script: plutusScript,
    redeemer: { data: mConStr0([]) },
  });

const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected an error");
};

const expectCode = async <C extends TxBuildErrorCode>(
  run: () => unknown,
  code: C,
): Promise<TxBuildError<C>> => {
  const error = await caught(run);
  expect(error).toBeInstanceOf(TxBuildError);
  expect((error as TxBuildError).code).toBe(code);
  expect(TxError.is(error, code)).toBe(true);
  return error as TxBuildError<C>;
};

/** Redeemer tags as `IEvaluator` reports them, by the ledger's tag number */
const TAGS: Action["tag"][] = [
  "SPEND",
  "MINT",
  "CERT",
  "REWARD",
  "VOTE",
  "PROPOSE",
];

/** Prices every redeemer at fixed units */
const fakeEvaluator = (): IEvaluator => ({
  evaluateTx: async (tx) =>
    (
      Transaction.fromCbor(TxCBOR(tx)).witnessSet().redeemers()?.values() ?? []
    ).map((r) => ({
      tag: TAGS[r.tag()]!,
      index: Number(r.index()),
      budget: { mem: 1000, steps: 2000 },
    })),
});

/** A promise settled from outside */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Serves the funds and the locked output, recording every call */
const fakeProvider = (overrides: Partial<IFetcher> = {}) => {
  const calls: string[] = [];
  const all = [...funds, locked];
  const provider = {
    fetchAddressUTxOs: async (address: string) => {
      calls.push("fetchAddressUTxOs");
      return all.filter((u) => u.output.address === address);
    },
    fetchUTxOs: async (txHash: string) => {
      calls.push("fetchUTxOs");
      return all.filter((u) => u.input.txHash === txHash);
    },
    ...overrides,
  } as unknown as IFetcher;
  return { provider, calls };
};

/** A wallet in the Mesh format, recording its calls */
const meshFormat = (getUtxos = async () => funds) => {
  const calls: string[] = [];
  return {
    calls,
    wallet: {
      getChangeAddress: async () => {
        calls.push("getChangeAddress");
        return wallet;
      },
      getUtxos: async () => {
        calls.push("getUtxos");
        return getUtxos();
      },
      getNetworkId: async () => {
        calls.push("getNetworkId");
        return 0;
      },
    },
  };
};

const builderWith = (
  options: Partial<ConstructorParameters<typeof TxBuilder>[0]> = {},
) =>
  new TxBuilder({
    network,
    params,
    costModels,
    evaluator: fakeEvaluator(),
    ...options,
  });

/**
 * Runs, then waits long enough for a rejection that no handler took to surface. Jest fails the
 * running test on such a rejection (a listener of the test's own sees none), so it has to
 * surface before the test ends.
 */
const settled = async (run: () => Promise<void>) => {
  await run();
  await tick();
  await tick();
};

describe("TxBuilder: signal", () => {
  it("is ABORTED for a signal aborted before the call, with nothing called", async () => {
    const { provider, calls: providerCalls } = fakeProvider();
    const { wallet: payer, calls } = meshFormat();
    const controller = new AbortController();
    const reason = new Error("stop");
    controller.abort(reason);
    const error = await expectCode(
      () =>
        builderWith({ provider }).build(unlock(), {
          payer,
          signal: controller.signal,
        }),
      "ABORTED",
    );
    expect(error.cause).toBe(reason);
    expect(error.retryable).toBe(false);
    expect(calls).toEqual([]);
    expect(providerCalls).toEqual([]);
  });

  it("judges the payer, the options and the networks before an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const { signal } = controller;
    const payer = { changeAddress: wallet, utxos: funds };
    await expectCode(
      () => builderWith().build(pay(), { signal }),
      "MISSING_PAYER",
    );
    await expectCode(
      () =>
        builderWith().build(pay(), {
          payer,
          signal,
          fee: 5 as unknown as bigint,
        }),
      "INVALID_OPTION",
    );
    await expectCode(
      () =>
        builderWith().build(pay(), {
          payer,
          signal,
          sendAllTo: baseAddress(3).replace("addr_test", "addr"),
        }),
      "INVALID_OPTION",
    );
    await expectCode(
      () =>
        builderWith().build(
          output({
            address: onMainnet(recipient),
            value: { lovelace: ada(2) },
          }),
          { payer, signal },
        ),
      "NETWORK_MISMATCH",
    );
    await expectCode(
      () => builderWith().build(pay(), { payer, signal }),
      "ABORTED",
    );
  });

  /** Aborts a build while `pending` is not settled, then fails what is pending */
  const abortWhile = async (
    start: (signal: AbortSignal) => Promise<unknown>,
    pending: { reject: (error: unknown) => void },
  ) => {
    const controller = new AbortController();
    const reason = { why: "the user left" };
    let error: unknown;
    await settled(async () => {
      const build = start(controller.signal).catch((e: unknown) => e);
      await tick();
      controller.abort(reason);
      error = await build;
      // What is pending fails later: dropped, not left unhandled
      pending.reject(new Error("late"));
    });
    expect(error).toBeInstanceOf(TxBuildError);
    expect(TxError.is(error, "ABORTED")).toBe(true);
    expect((error as TxBuildError).retryable).toBe(false);
    expect((error as TxBuildError).cause).toBe(reason);
  };

  it("stops waiting for a pending wallet read", async () => {
    const pending = deferred<UTxO[]>();
    const { wallet: payer, calls } = meshFormat(() => pending.promise);
    await abortWhile(
      (signal) => builderWith().build(pay(), { payer, signal }),
      pending,
    );
    expect(calls).toContain("getUtxos");
  });

  it("stops waiting for a pending lookup", async () => {
    const pending = deferred<UTxO[]>();
    const { provider } = fakeProvider({ fetchUTxOs: () => pending.promise });
    await abortWhile(
      (signal) =>
        builderWith({ provider }).build(unlock(), {
          payer: { changeAddress: wallet, utxos: funds },
          signal,
        }),
      pending,
    );
  });

  it("stops waiting for a pending evaluation, and starts no other", async () => {
    const pending = deferred<never>();
    const evaluateTx = jest.fn(() => pending.promise);
    const { provider } = fakeProvider();
    await abortWhile(
      (signal) =>
        builderWith({ provider, evaluator: { evaluateTx } }).build(unlock(), {
          payer: { changeAddress: wallet, utxos: funds },
          signal,
        }),
      pending,
    );
    expect(evaluateTx).toHaveBeenCalledTimes(1);
  });

  it("stops waiting for a pending getCollateral call", async () => {
    const pending = deferred<string[]>();
    const getCollateral = jest.fn(() => pending.promise);
    const { provider } = fakeProvider();
    const dust = utxo(100_000n);
    await abortWhile(
      (signal) =>
        builderWith({ provider }).build(unlock(), {
          payer: {
            getNetworkId: async () => 0,
            getChangeAddress: async () => hexOf(wallet),
            getUtxos: async () => [cborOf(dust)],
            signTx: async () => "a0",
            getCollateral,
          },
          signal,
        }),
      pending,
    );
    expect(getCollateral).toHaveBeenCalledTimes(1);
  });

  it("builds as without a signal when it never aborts", async () => {
    const parts: PartsInput = [pay()];
    const options: BuildOptions = {
      payer: { changeAddress: wallet, utxos: funds },
    };
    const plain = await builderWith().build(parts, options);
    const signalled = await builderWith().build(parts, {
      ...options,
      signal: new AbortController().signal,
    });
    expect(signalled.tx).toBe(plain.tx);
  });
});

describe("TxBuilder: trace", () => {
  it("sends payer, fetched, round and evaluated events, in that order, and no warning", async () => {
    const { provider } = fakeProvider();
    const { wallet: payer } = meshFormat();
    const events: BuildEvent[] = [];
    const built = await builderWith({ provider }).build([unlock(), pay(25)], {
      payer,
      canSelect: (u) => ref(u) !== ref(funds[0]!),
      trace: (event) => events.push(event),
    });

    const types = events.map((e) => e.type).join(",");
    expect(types).toMatch(
      /^payer,fetched(,round)+,evaluated(,round)+,evaluated$/,
    );
    expect(events[0]).toEqual({
      type: "payer",
      changeAddress: wallet,
      utxos: 2,
      selectable: 1,
    });
    expect(events[1]).toEqual({ type: "fetched", outRefs: [ref(locked)] });

    const rounds = events.filter(
      (e): e is Extract<BuildEvent, { type: "round" }> => e.type === "round",
    );
    expect(rounds[0]!.round).toBeGreaterThanOrEqual(0);
    for (const r of rounds) {
      expect(typeof r.fee).toBe("bigint");
      expect(r.size).toBeGreaterThan(0);
      expect(r.size).toBeLessThanOrEqual(params.maxTxSize);
    }
    const last = rounds[rounds.length - 1]!;
    expect(last.fee).toBe(built.fee);
    expect(last.selected).toBe(built.selectedInputs.length);

    const evaluations = events.filter(
      (e): e is Extract<BuildEvent, { type: "evaluated" }> =>
        e.type === "evaluated",
    );
    expect(evaluations.map((e) => e.round)).toEqual([0, 1]);
    for (const e of evaluations)
      expect(e.redeemers).toEqual([
        expect.objectContaining({
          tag: "SPEND",
          index: built.redeemers[0]!.index,
          exUnits: { mem: 1000, steps: 2000 },
          part: expect.objectContaining({ kind: "spend" }),
        }),
      ]);
    expect(events.some((e) => e.type === "warning")).toBe(false);
  });

  it("lists an output read by two parts once in the fetched event", async () => {
    // Two script outputs unlocked with one reference script, given by out ref only
    const holder = utxo(ada(20), { scriptRef: resolveScriptRef(plutusScript) });
    const second = utxo(ada(10), {
      address: scriptAddress,
      plutusData: "d87980",
    });
    // A key output that one part spends and another puts up as collateral
    const key = utxo(ada(5));
    const all = [locked, second, holder, key];
    const viaHolder = (u: UTxO) =>
      spend.plutus({
        utxo: u.input,
        script: { reference: holder.input },
        redeemer: { data: mConStr0([]) },
      });
    const cases: [PartsInput, UTxO[]][] = [
      [
        [viaHolder(locked), viaHolder(second)],
        [locked, holder, second],
      ],
      [
        [
          unlock(),
          spend.pubKey({ utxo: key.input }),
          collateral({ utxo: key.input }),
        ],
        [locked, key],
      ],
    ];
    for (const [parts, read] of cases) {
      const events: BuildEvent[] = [];
      // A provider of its own each time, so that no lookup is served by the shared cache
      const fetchUTxOs = jest.fn(async (txHash: string) =>
        all.filter((u) => u.input.txHash === txHash),
      );
      const { provider } = fakeProvider({ fetchUTxOs });
      await builderWith({ provider }).build(parts, {
        payer: { changeAddress: wallet, utxos: funds },
        trace: (event) => events.push(event),
      });
      expect(events.filter((e) => e.type === "fetched")).toEqual([
        { type: "fetched", outRefs: read.map(ref) },
      ]);
      expect(fetchUTxOs).toHaveBeenCalledTimes(read.length);
    }
  });

  it("sends no round event from the pass that prices the collateral to ask a wallet for", async () => {
    const { provider } = fakeProvider();
    const dust = utxo(100_000n);
    const reserve = utxo(ada(5));
    const log: string[] = [];
    const getCollateral = jest.fn(async () => {
      log.push("getCollateral");
      return [cborOf(reserve)];
    });
    const built = await builderWith({ provider }).build(unlock(), {
      payer: {
        getNetworkId: async () => 0,
        getChangeAddress: async () => hexOf(wallet),
        getUtxos: async () => [cborOf(dust)],
        signTx: async () => "a0",
        getCollateral,
      },
      trace: (event) =>
        log.push(event.type === "round" ? `round ${event.round}` : event.type),
    });
    expect(getCollateral).toHaveBeenCalledTimes(1);
    expect(ref(built.collateral!.inputs[0]!)).toBe(ref(reserve));
    // The settled pass prices one round with a fee of 0, whose collateral the dust covers, and
    // then falls short; the pass that prices the amount to ask for sends nothing before the call
    expect(log).toEqual([
      "payer",
      "fetched",
      "round 0",
      "round 1",
      "evaluated",
      "round 0",
      "getCollateral",
      "round 0",
      "round 1",
      "round 2",
      "evaluated",
    ]);
  });

  it("numbers the rounds within each pass from 0, as coinSelection sees them", async () => {
    const events: BuildEvent[] = [];
    const seen: number[] = [];
    await builderWith().build(pay(25), {
      payer: { changeAddress: wallet, utxos: funds },
      coinSelection: (_, candidates, { round }) => {
        seen.push(round);
        return candidates.slice(0, 1);
      },
      trace: (event) => events.push(event),
    });
    const rounds = events.flatMap((e) => (e.type === "round" ? [e.round] : []));
    // Rounds that only select price nothing, so their numbers are skipped
    expect(seen.length).toBeGreaterThan(0);
    for (const round of seen) expect(rounds).not.toContain(round);
    expect(rounds[0]).toBeGreaterThan(Math.max(...seen));
  });

  it("sends a payer event and no fetched one for a snapshot and nothing to look up", async () => {
    const events: BuildEvent[] = [];
    await builderWith().build(pay(), {
      payer: { changeAddress: hexOf(wallet), utxos: funds.map(cborOf) },
      trace: (event) => events.push(event),
    });
    expect(events[0]).toEqual({
      type: "payer",
      changeAddress: wallet,
      utxos: 2,
      selectable: 2,
    });
    expect(events.map((e) => e.type)).not.toContain("fetched");
    expect(events.map((e) => e.type)).not.toContain("evaluated");
    expect(events.filter((e) => e.type === "payer")).toHaveLength(1);
  });

  it("is not changed by a trace that throws or rejects, and logs nothing", async () => {
    const { provider } = fakeProvider();
    const parts = () => [unlock(), pay()];
    const options: BuildOptions = {
      payer: { changeAddress: wallet, utxos: funds },
    };
    const plain = await builderWith({ provider }).build(parts(), options);
    const logged = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => jest.spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      const traces: [string, jest.Mock][] = [
        [
          "throws",
          jest.fn(() => {
            throw new Error("trace failed");
          }),
        ],
        [
          "rejects",
          jest.fn(async () => {
            throw new Error("trace failed");
          }),
        ],
      ];
      for (const [, trace] of traces) {
        let built: unknown;
        await settled(async () => {
          built = await builderWith({ provider }).build(parts(), {
            ...options,
            trace,
          });
        });
        expect((built as { tx: string }).tx).toBe(plain.tx);
        expect(trace.mock.calls.length).toBeGreaterThan(3);
      }
      for (const spy of logged) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of logged) spy.mockRestore();
    }
  });

  it("is typed: a warning event carries its code and both hashes", () => {
    const read = (event: BuildEvent): string[] => {
      if (event.type === "warning") {
        const code: "HASH_MISMATCH" = event.code;
        return [code, event.txHash, event.reportedHash];
      }
      // @ts-expect-error only a warning has a code
      return [event.code];
    };
    expect(
      read({
        type: "warning",
        code: "HASH_MISMATCH",
        txHash: "a",
        reportedHash: "b",
      }),
    ).toEqual(["HASH_MISMATCH", "a", "b"]);
  });
});
