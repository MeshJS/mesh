import type {
  BuildEvent,
  TxBuilder,
  TxPlanStore,
} from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import { memoryPlanStore } from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import {
  builderOf,
  caught,
  submitterOf,
  swallowing,
} from "./plan-emulator-util";
import { ADA, alice, bob, carol, paidTo, payTo, stepSetup } from "./run-util";

// What a plan object takes from its provider, its store and its clock, and how long a call
// waits for them: a tip from the future taken by no look, every request of a call bounded by
// its time, a stale read of the store, and a find without a block.

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

/**
 * The local clock set to the emulator's time, moving on with real time, so that the chain's
 * time and the clock agree as they do on a live network
 */
const clockOnChain = (builder: TxBuilder, slot: () => number) => {
  const real = Date.now.bind(Date);
  const start = real();
  return jest
    .spyOn(Date, "now")
    .mockImplementation(() => builder.timeAt(slot()) + (real() - start));
};

/** A request that never answers */
const never = () => new Promise<never>(() => undefined);

afterEach(() => jest.restoreAllMocks());

describe("a tip from the future", () => {
  it("is taken by no look and kept by none: the honest tips after it are taken, and run() goes on to the end", async () => {
    let lie = 0;
    const events: BuildEvent[] = [];
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      hooks: {
        fetchLatestBlock: async (forward: () => Promise<{ slot: number }>) => {
          const block = await forward();
          return lie === 0 ? block : { ...block, slot: block.slot + lie };
        },
      },
    });
    clockOnChain(builder, () => emulator.slot);
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet, ttlMs: 600_000, trace: (event) => events.push(event) },
    );
    // One look with a tip 100 000 slots ahead of the clock, then an honest provider
    lie = 100_000;
    await plan.refresh();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "warning", code: "TIP_AHEAD_OF_CLOCK" }),
    );
    lie = 0;
    await plan.run({ timeoutMs: 2_000, waitFor: "final" });
    expect(statuses(plan)).toEqual({ a: "final", b: "final" });
    expect(provider.control.count("submitTx")).toBe(2);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
  });
});

describe("a call with timeoutMs", () => {
  /** A plan of one step sent and not found, and a hook that hangs once `hang.on` is set */
  const sentPlan = async (
    hooks: (hang: { on: boolean }) => Parameters<typeof stepSetup>[1],
  ) => {
    const hang = { on: false };
    const made = await stepSetup("scalus", hooks(hang));
    const plan = await made.builder.plan(payTo(alice, 5n * ADA), {
      payer: made.wallet,
      ...(made.builder.store !== undefined && { id: "limits" }),
    });
    await plan.run({ waitFor: "sent", submitter: swallowing() });
    hang.on = true;
    return { ...made, plan };
  };

  /** The call ends with CONFIRM_TIMEOUT by its time, though a request never answers */
  const endsInTime = async (plan: TxPlan, timeoutMs = 300) => {
    const started = Date.now();
    const outcome = await Promise.race([
      caught(plan.run({ timeoutMs, submitter: swallowing() })),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 3_000)),
    ]);
    expect(outcome).not.toBe("pending");
    const error = outcome as { code: string; step: string; retryable: boolean };
    expect([error.code, error.step, error.retryable]).toEqual([
      "CONFIRM_TIMEOUT",
      "main",
      true,
    ]);
    expect(Date.now() - started).toBeLessThan(timeoutMs + 1_000);
    return error;
  };

  it("ends by then when a search never answers", async () => {
    const { plan } = await sentPlan((hang) => ({
      hooks: {
        fetchTxInfo: (forward: (hash: string) => unknown, hash: string) =>
          hang.on ? never() : forward(hash),
      },
    }));
    const error = await endsInTime(plan);
    expect((error as unknown as Error).message).toMatch(/look at the chain/);
  });

  it("ends by then when the tip never answers", async () => {
    const { plan } = await sentPlan((hang) => ({
      hooks: {
        fetchLatestBlock: (forward: () => unknown) =>
          hang.on ? never() : forward(),
      },
    }));
    await endsInTime(plan);
  });

  it("ends by then when a read of the store never answers", async () => {
    const base = memoryPlanStore();
    const hang = { on: false };
    const store: TxPlanStore = {
      load: (id) => (hang.on ? never() : base.load(id)),
      save: (json, rev) => base.save(json, rev),
    };
    const { plan } = await sentPlan(() => ({ builder: { store } }));
    hang.on = true;
    const error = await endsInTime(plan);
    expect((error as unknown as Error).message).toMatch(/read of the plan/);
  });

  it("ends by then when a write of the store never answers: nothing is sent", async () => {
    const base = memoryPlanStore();
    const hang = { on: false };
    const store: TxPlanStore = {
      load: (id) => base.load(id),
      save: (json, rev) => (hang.on ? never() : base.save(json, rev)),
    };
    const { builder, wallet } = await stepSetup("scalus", {
      builder: { store },
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      id: "limits",
    });
    hang.on = true;
    const submitter = swallowing();
    const error = await caught(plan.run({ timeoutMs: 300, submitter }));
    expect(error.code).toBe("CONFIRM_TIMEOUT");
    expect(error.message).toMatch(/write of the plan/);
    expect(submitter.calls).toEqual([]);
  });

  it("ends by then when the submitter never answers: the delivery stays recorded and its outcome unknown", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus");
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
    });
    const silent = submitterOf(() => never());
    const started = Date.now();
    const error = await caught(plan.run({ timeoutMs: 300, submitter: silent }));
    expect([error.code, error.step]).toEqual(["CONFIRM_TIMEOUT", "main"]);
    expect(error.message).toMatch(/submitter did not answer/);
    expect(Date.now() - started).toBeLessThan(1_300);
    expect(silent.calls).toHaveLength(1);
    expect(plan.step("main").status).toBe("sent");
    expect(recordOf(plan).steps[0]!.sends).toBe(1);
    // The same bytes go again with a submitter that answers
    await plan.run({ submitter: submitterOf((tx) => emulator.submitTx(tx)) });
    expect(plan.step("main").status).not.toBe("sent");
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });
});

describe("a read of the store", () => {
  it("of a lower revision than the object holds is not taken: a stopped plan stays stopped", async () => {
    const base = memoryPlanStore();
    let stale: unknown;
    const store: TxPlanStore = {
      load: async (id) =>
        (stale !== undefined ? stale : base.load(id)) as Awaited<
          ReturnType<TxPlanStore["load"]>
        >,
      save: (json, rev) => base.save(json, rev),
    };
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { store },
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      id: "st",
    });
    const held = swallowing();
    await plan.run({ waitFor: "sent", submitter: held });
    const beforeStop = JSON.parse(JSON.stringify(await base.load("st")));
    await plan.stop();
    const marked = recordOf(plan).rev;
    expect(recordOf(plan).stopped).toBe(true);
    // Another object writes the next revision: the step landed
    const other = await builderOf(provider, {
      store,
      evaluator: emulator,
    }).resume("st");
    await emulator.submitTx(held.calls[0]!);
    await other.refresh();
    expect(recordOf(other).rev).toBe(marked + 1);

    // The store answers reads with the record from before the stop
    stale = beforeStop;
    const error = await caught(plan.refresh());
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(recordOf(plan).rev).toBe(marked);
    expect(recordOf(plan).stopped).toBe(true);
    expect(plan.toJSON().stopped).toBe(true);
    // run() looks first, and its write meets the same stale reads: nothing is sent
    const refused = await caught(plan.run({ submitter: held }));
    expect(refused.code).toBe("VERSION_CONFLICT");
    expect(recordOf(plan).stopped).toBe(true);
    expect(held.calls).toHaveLength(1);

    // Fresh reads again: the later revision is taken
    stale = undefined;
    await plan.refresh();
    expect(recordOf(plan).rev).toBeGreaterThan(marked);
    expect(recordOf(plan).stopped).toBe(true);
  });
});

describe("a refusal", () => {
  it("counts a transaction of after as in a block only when the search gives it a block: one found in a mempool does not count", async () => {
    let pending = "";
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: {
        // The provider answers a transaction of its mempool as found, without a block
        fetchTxInfo: (forward: (hash: string) => unknown, hash: string) =>
          hash.toLowerCase() === pending ? { hash: pending } : forward(hash),
      },
    });
    const pre = await builder.build(payTo(carol, 2n * ADA), { payer: wallet });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      after: pre,
    });
    pending = pre.txHash.toLowerCase();
    // The node refuses main: pre is not on chain
    const error = await caught(plan.run({ waitFor: "sent" }));
    expect([error.code, error.details.reason]).toEqual([
      "SUBMIT_FAILED",
      "refused",
    ]);
    expect(plan.step("main").status).toBe("sent");
    expect(paidTo(emulator, alice)).toEqual([]);
  });
});
