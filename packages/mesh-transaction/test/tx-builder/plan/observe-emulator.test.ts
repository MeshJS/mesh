import { jest } from "@jest/globals";

import { mConStr0 } from "@meshsdk/core";

import type { TxPlanError } from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import { spend, TxError } from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  emulatorOf,
  FAST,
  pay,
  setup,
  submitterOf,
  swallowing,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";

// How a plan reads the chain: depth by block heights, the probe of the provider, the validity
// of a Plutus step, when a step is expired, what a call asks of a plan that is final, and the
// times a call waits.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

/** A slot whose time is behind the local clock, so that a step can pass its end of validity */
const PAST = 100_000_000;

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** The reason of a CANNOT_OBSERVE error */
const reasonOf = (error: unknown) => {
  expectCode(error, "CANNOT_OBSERVE");
  return (error as TxPlanError<"CANNOT_OBSERVE">).details.reason;
};

const withoutHeight = async (forward: () => Promise<object>) => {
  const { height: _height, ...tip } = (await forward()) as {
    height?: number;
  };
  return tip;
};

const findWithoutHeight = async (
  forward: (hash: string) => Promise<object>,
  hash: string,
) => {
  const { blockHeight: _height, ...info } = (await forward(hash)) as {
    blockHeight?: number;
  };
  return info;
};

const findWithoutValidity = async (
  forward: (hash: string) => Promise<object>,
  hash: string,
) => {
  const { validContract: _valid, ...info } = (await forward(hash)) as {
    validContract?: boolean;
  };
  return info;
};

/** A step that spends an output locked by the always-succeeding script */
const unlock = (utxo: Parameters<typeof spend.plutus>[0]["utxo"]) =>
  spend.plutus({ utxo, script: plutus, redeemer: { data: mConStr0([]) } });

describe.each(VALIDATORS)("TxPlan observation on TxEmulator (%s)", (v) => {
  it("is final only once the step's block is confirmations deep", async () => {
    const { emulator, builder, wallet } = await setup(v, {
      builder: {
        planDefaults: { confirmations: 30, expiryMarginMs: 0, pollMs: 10 },
      },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run();
    expect(statuses(plan)).toEqual({ main: "included" });
    const slot = plan.step("main").seen!.slot;
    expect(slot).toBe(emulator.slot);
    emulator.advanceTo({ slot: slot + 29 });
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "included" });
    emulator.advanceTo({ slot: slot + 30 });
    await plan.refresh();
    expect(plan.status).toBe("final");
    expect(statuses(plan)).toEqual({ main: "final" });
    expect(plan.landed.map((step) => step.name)).toEqual(["main"]);
  });

  it("declares no final while the tip's height stands still", async () => {
    const { emulator, builder, wallet, provider } = await setup(v, {
      builder: {
        planDefaults: { confirmations: 3, expiryMarginMs: 0, pollMs: 10 },
      },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run();
    const held = (await emulator.fetchLatestBlock()).height;
    provider.control.hooks.fetchLatestBlock = async (forward) => ({
      ...(await forward()),
      height: held,
    });
    advance(emulator, 40);
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "included" });
  });

  it("declares no final when the heights do not agree with the slots", async () => {
    for (const confirmations of [0, 3]) {
      const { emulator, builder, wallet } = await setup(v, {
        hooks: {
          fetchLatestBlock: async (forward) => {
            const tip = await forward();
            return { ...tip, height: tip.height + 100 };
          },
        },
        builder: {
          planDefaults: { confirmations, expiryMarginMs: 0, pollMs: 10 },
        },
      });
      const plan = await builder.plan(pay(), { payer: wallet });
      await plan.run();
      advance(emulator, 5);
      await plan.refresh();
      expect(statuses(plan)).toEqual({ main: "included" });
    }
  });

  it("is CANNOT_OBSERVE (noDepth) from builder.plan on a provider whose finds have no block height", async () => {
    const { builder, wallet, provider } = await setup(v, {
      hooks: { fetchTxInfo: findWithoutHeight },
    });
    const error = await caught(builder.plan(pay(), { payer: wallet }));
    expect(reasonOf(error)).toBe("noDepth");
    expect((error as TxPlanError).retryable).toBe(false);
    expect((error as TxPlanError).plan).toBeUndefined();
    expect(provider.control.count("submitTx")).toBe(0);
  });

  it("is CANNOT_OBSERVE (noDepth) from run() for a step found without heights; refresh() shows it", async () => {
    for (const drop of ["tip", "find"] as const) {
      const { builder, wallet, provider } = await setup(v, {
        builder: {
          planDefaults: { confirmations: 3, expiryMarginMs: 0, pollMs: 10 },
        },
      });
      const plan = await builder.plan(pay(), { payer: wallet });
      await plan.run({ waitFor: "sent" });
      if (drop === "tip")
        provider.control.hooks.fetchLatestBlock = withoutHeight;
      else provider.control.hooks.fetchTxInfo = findWithoutHeight;
      await plan.refresh();
      expect(statuses(plan)).toEqual({ main: "included" });
      expect(reasonOf(await caught(plan.run()))).toBe("noDepth");
      expect(reasonOf(await caught(plan.run({ waitFor: "final" })))).toBe(
        "noDepth",
      );
      expect(statuses(plan)).toEqual({ main: "included" });
      expect(provider.control.count("submitTx")).toBe(1);
    }
  });

  it("probes before the first delivery of a plan it did not make", async () => {
    const emulator = await emulatorOf(v);
    const wallet = await walletOf();
    emulator.fund((await wallet.getChangeAddress())!, {
      lovelace: 100_000_000n,
    });
    const made = await builderOf(emulator).plan(pay(), { payer: wallet });
    await made.sign();
    expect(statuses(made)).toEqual({ main: "signed" });

    const provider = wrap(emulator, { fetchLatestBlock: withoutHeight });
    const resumed = await builderOf(provider).resume(made.toJSON());
    expect(provider.control.count("fetchTxInfo", "fetchLatestBlock")).toBe(0);
    const error = await caught(resumed.run());
    expect(reasonOf(error)).toBe("noDepth");
    expect(provider.control.count("submitTx")).toBe(0);
    expect(statuses(resumed)).toEqual({ main: "signed" });
    expect(resumed.toJSON().steps[0]!.sends).toBe(0);
  });

  it("makes the plan when the probe gets no answer, and probes again before the first delivery", async () => {
    let failures = 1;
    const searched: string[] = [];
    const { builder, wallet, provider } = await setup(v, {
      hooks: {
        fetchTxInfo: async (forward, hash: string) => {
          searched.push(hash);
          if (failures-- > 0) throw new Error("try later");
          return forward(hash);
        },
      },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    expect(statuses(plan)).toEqual({ main: "built" });
    const source = plan.step("main").inputs[0]!.txHash;
    expect(searched).toEqual([source]);
    // The look of run() searches the step and its source; the probe searches the source again
    await plan.run({ waitFor: "sent" });
    expect(searched.filter((hash) => hash === source).length).toBe(3);
    expect(provider.control.count("submitTx")).toBe(1);
  });

  it("is CANNOT_OBSERVE (noValidity) for a Plutus step the provider cannot judge", async () => {
    // When the plan is made: nothing is built into a plan, and a plan without a Plutus step is
    // not concerned
    const first = await setup(v, {
      hooks: { fetchTxInfo: findWithoutValidity },
    });
    const locked = first.emulator.fund(first.builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    expect(
      reasonOf(
        await caught(
          first.builder.plan(unlock(locked), { payer: first.wallet }),
        ),
      ),
    ).toBe("noValidity");
    await first.builder.plan(pay(), { payer: first.wallet });

    // After the plan was sent: run() throws, refresh() keeps the status it had
    const later = await setup(v);
    const lockedLater = later.emulator.fund(
      later.builder.scriptAddress(plutus),
      { lovelace: 10_000_000n },
    );
    const sent = await later.builder.plan(unlock(lockedLater), {
      payer: later.wallet,
    });
    await sent.run({ submitter: swallowing(), waitFor: "sent" });
    expect(statuses(sent)).toEqual({ main: "sent" });
    await later.emulator.submitTx(sent.step("main").signedTx!);
    later.provider.control.hooks.fetchTxInfo = findWithoutValidity;
    expect(reasonOf(await caught(sent.run()))).toBe("noValidity");
    expect(statuses(sent)).toEqual({ main: "sent" });
    expect(reasonOf(await caught(sent.run({ waitFor: "sent" })))).toBe(
      "noValidity",
    );
    await sent.refresh();
    expect(statuses(sent)).toEqual({ main: "sent" });
  });

  it("is CANNOT_OBSERVE (noValidity) from the wait of run() once the provider stops giving the validity", async () => {
    const { emulator, builder, wallet, provider } = await setup(v);
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const plan = await builder.plan(unlock(locked), { payer: wallet });
    // From the delivery on, the provider finds transactions without their validity
    const submitter = submitterOf(async (tx) => {
      provider.control.hooks.fetchTxInfo = findWithoutValidity;
      return emulator.submitTx(tx);
    });
    // A wait that ran on to its end would give CONFIRM_TIMEOUT
    const error = await caught(
      plan.run({ submitter, waitFor: "final", timeoutMs: 2_000 }),
    );
    expect(reasonOf(error)).toBe("noValidity");
    expect(submitter.calls).toHaveLength(1);
    expect(statuses(plan)).toEqual({ main: "sent" });
  });

  it("is expired past the margin only when the search answers that it is not found and finds a source of it", async () => {
    const { emulator, builder, wallet, provider } = await setup(v, {
      slot: PAST,
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const { txHash, inputs } = plan.step("main");
    emulator.advanceTo({ time: plan.until! + 1_000 });
    // A search that does not answer decides nothing
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === txHash) throw new Error("search down");
      return forward(hash);
    };
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "sent" });
    // A search that finds no transaction its inputs come from knows nothing of the chain before it
    const sources = new Set(inputs.map((input) => input.txHash));
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (sources.has(hash)) throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "sent" });
    provider.control.hooks.fetchTxInfo = undefined;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "expired" });
    expect(plan.status).toBe("stopped");
  });

  it("never expires a step the search found without a slot", async () => {
    const { emulator, builder, wallet, provider } = await setup(v, {
      slot: PAST,
    });
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const plans = [
      await builder.plan(pay(), { payer: wallet }),
      await builder.plan(unlock(locked), { payer: wallet }),
    ];
    for (const plan of plans)
      await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const found = new Map<string, boolean>(
      plans.map((plan, i) => [plan.step("main").txHash, i === 0]),
    );
    // Found, without a slot: valid for the payment, is_valid = false for the script spend
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
      found.has(hash)
        ? {
            hash,
            block: "00".repeat(32),
            blockHeight: 1,
            validContract: found.get(hash),
          }
        : forward(hash);
    emulator.advanceTo({
      time: Math.max(...plans.map((plan) => plan.until!)) + 1_000,
    });
    for (const plan of plans) {
      // Its inputs are still unspent: nothing was submitted to the ledger
      const input = plan.step("main").inputs[0]!;
      expect(
        emulator
          .utxos({ address: input.address })
          .some(
            (utxo) =>
              utxo.input.txHash === input.txHash &&
              utxo.input.outputIndex === input.outputIndex,
          ),
      ).toBe(true);
      await plan.refresh();
      expect(statuses(plan)).toEqual({ main: "sent" });
    }
  });

  it("reads no address in a look", async () => {
    const { emulator, builder, wallet, provider } = await setup(v, {
      slot: PAST,
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    emulator.advanceTo({ time: plan.until! + 1_000 });
    const reads = provider.control.count("fetchAddressUTxOs", "fetchUTxOs");
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "expired" });
    expect(provider.control.count("fetchAddressUTxOs", "fetchUTxOs")).toBe(
      reads,
    );
  });

  it("moves final by confirmations only, and expired by the margin only", async () => {
    const finalAt: number[] = [];
    for (const expiryMarginMs of [0, 600_000]) {
      const { emulator, builder, wallet } = await setup(v, {
        builder: {
          planDefaults: { confirmations: 3, expiryMarginMs, pollMs: 10 },
        },
      });
      const plan = await builder.plan(pay(), { payer: wallet });
      await plan.run();
      const slot = plan.step("main").seen!.slot;
      for (let at = slot + 1; plan.status !== "final"; at++) {
        emulator.advanceTo({ slot: at });
        await plan.refresh();
      }
      finalAt.push(emulator.slot - slot);
    }
    expect(finalAt).toEqual([3, 3]);

    const expiredAt: number[] = [];
    for (const confirmations of [0, 30]) {
      const { emulator, builder, wallet } = await setup(v, {
        slot: PAST,
        builder: {
          planDefaults: { confirmations, expiryMarginMs: 5_000, pollMs: 10 },
        },
      });
      const plan = await builder.plan(pay(), { payer: wallet });
      await plan.run({ submitter: swallowing(), waitFor: "sent" });
      const until = plan.until!;
      for (
        let at = until;
        plan.step("main").status !== "expired";
        at += 1_000
      ) {
        emulator.advanceTo({ time: at });
        await plan.refresh();
      }
      expiredAt.push(emulator.time - until);
    }
    expect(expiredAt).toEqual([5_000, 5_000]);
  });

  it("makes no request on a final plan", async () => {
    const { builder, wallet, provider } = await setup(v);
    const reads = () =>
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "submitTx",
      );
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ waitFor: "final" });
    expect(plan.status).toBe("final");
    const before = reads();
    expect(await plan.refresh()).toBe(plan);
    expect(await plan.run()).toBe(plan);
    expect(await plan.run({ waitFor: "sent" })).toBe(plan);
    expect(await plan.run({ waitFor: "final", signers: wallet })).toBe(plan);
    expect(await plan.sign({ signers: wallet })).toBe(plan);
    const rev = plan.toJSON().rev;
    expect(await plan.stop()).toBe(plan);
    expect(plan.toJSON().rev).toBe(rev);
    expect(plan.toJSON().stopped).toBeUndefined();
    expect(reads()).toBe(before);
  });

  it("waits 120 s by default, and confirmations × 30 s + 120 s for final", async () => {
    // The builder's confirmations differ from each plan's: the plan's recorded value counts
    const { builder, wallet } = await setup(v, {
      builder: { planDefaults: { confirmations: 10, expiryMarginMs: 0 } },
    });
    const plan = await builder.plan(pay(), {
      payer: wallet,
      confirmations: 30,
    });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const shallow = await builder.plan(pay(), {
      payer: wallet,
      confirmations: 4,
    });
    await shallow.run({ submitter: swallowing(), waitFor: "sent" });
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    try {
      for (const [target, waitFor, timeoutMs] of [
        [shallow, "included", 120_000],
        [shallow, "final", 240_000],
        [plan, "final", 1_020_000],
      ] as const) {
        let thrown: unknown;
        const waiting = target
          .run({ submitter: swallowing(), waitFor })
          .catch((error) => {
            thrown = error;
          });
        await jest.advanceTimersByTimeAsync(timeoutMs + 10_000);
        await waiting;
        expectCode(thrown, "CONFIRM_TIMEOUT");
        expect((thrown as TxPlanError<"CONFIRM_TIMEOUT">).details).toEqual({
          waitedFor: waitFor,
          timeoutMs,
        });
      }
    } finally {
      jest.useRealTimers();
    }
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(statuses(shallow)).toEqual({ main: "sent" });
  });

  it("keeps the deadlines it was made with when its builder's defaults change", async () => {
    const { emulator, builder, wallet } = await setup(v, {
      slot: PAST,
      builder: { planDefaults: { ...FAST, ttlMs: 120_000 } },
    });
    const tipTime = builder.timeAt(emulator.slot);
    const plan = await builder.plan(pay(), { payer: wallet });
    expect(plan.until).toBe(tipTime + 120_000);
    Object.defineProperty(builder, "planDefaults", {
      value: Object.freeze({ ...FAST, ttlMs: 1_000, expiryMarginMs: 600_000 }),
    });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    // Expired by the recorded margin of 0, not by the one the builder was given later
    emulator.advanceTo({ time: plan.until! + 1_000 });
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "expired" });
  });
});
