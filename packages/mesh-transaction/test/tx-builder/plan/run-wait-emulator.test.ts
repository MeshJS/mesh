import { ProviderError } from "@meshsdk/common";
import { Crypto } from "@meshsdk/core-cst";

import type { BuildEvent, TxBuilder } from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import { guard, memoryPlanStore, validity } from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { addWitnesses } from "../../../src/tx-builder/sign";
import { keysSigner, testKey } from "../hash-signer-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  hashOf,
  submitterOf,
  swallowing,
  walletOf,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  paidTo,
  payTo,
  stepSetup,
  witnessSetOf,
} from "./run-util";

// How the object that runs a plan looks at the chain and waits: a call that never
// repeats a turn without a pause, a step called dead that is still looked for, the time by the
// tip and by the local clock, the bytes of a step fixed by its first delivery, and the steps a
// look leaves out.

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

/** A search that answers "not found" for the hashes in the set */
const hiding = (hidden: Set<string>) => ({
  fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
    if (hidden.has(hash.toLowerCase()))
      throw new ProviderError("not found", {
        kind: "notFound",
        status: 404,
        retryable: false,
      });
    return forward(hash);
  },
});

/**
 * The local clock set to the emulator's time plus `offset.ms`, moving on with real time, so
 * that the chain's time and the clock agree as they do on a live network
 */
const clockOnChain = (
  builder: TxBuilder,
  slot: () => number,
  offset = { ms: 0 },
) => {
  const real = Date.now.bind(Date);
  const start = real();
  return jest
    .spyOn(Date, "now")
    .mockImplementation(
      () => builder.timeAt(slot()) + offset.ms + (real() - start),
    );
};

afterEach(() => jest.restoreAllMocks());

describe("a call of run() that cannot send", () => {
  beforeAll(() => Crypto.ready());

  it("waits and looks for a step another party sent without a witness the plan holds, and never spins", async () => {
    const co = testKey();
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await builder.plan(
      { a: [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: co.keyHash })] },
      { payer: wallet },
    );
    await plan.sign();
    const step = plan.step("a");
    // The co-signer gathers both witnesses and submits elsewhere; then the block is rolled back
    const full = await addWitnesses(
      step.tx,
      await wallet.signTx(step.tx, true),
      witnessSetOf(co.answer(step.txHash)),
    );
    const before = emulator.fork();
    await emulator.submitTx(full);
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "included" });
    provider.control.target = before;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "sent" });
    expect(plan.step("a").signedTx).toBeUndefined();

    // A signal that counts how often it is read: a call that spins reads it without end
    let reads = 0;
    const signal = {
      get aborted() {
        reads += 1;
        return false;
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as AbortSignal;
    const looks = provider.control.count("fetchTxInfo");
    const started = Date.now();
    const error = await caught(plan.run({ signal, timeoutMs: 300 }));
    expect([error.code, error.step]).toEqual(["CONFIRM_TIMEOUT", "a"]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
    expect(reads).toBeLessThan(1_000);
    expect(provider.control.count("fetchTxInfo") - looks).toBeGreaterThan(2);
    expect(provider.control.count("submitTx")).toBe(0);

    // With the co-signer among the call's signers the step has its bytes, and they go again
    await plan.run({ signers: [keysSigner("object", co).signer] });
    expect(statuses(plan)).toEqual({ a: "included" });
    expect(provider.control.count("submitTx")).toBe(1);
    expect(paidTo(before, alice)).toEqual([5n * ADA]);
  });

  it("asks a signer once a call for a step: MISSING_SIGNATURES, nothing sent, before the call's time is up", async () => {
    const co = testKey();
    const { provider, builder, wallet } = await stepSetup("scalus");
    const plan = await builder.plan(
      { a: [payTo(alice, 5n * ADA), guard.pubKey({ keyHash: co.keyHash })] },
      { payer: wallet },
    );
    const error = await caught(plan.run({ timeoutMs: 300 }));
    expect([error.code, error.step]).toEqual(["MISSING_SIGNATURES", "a"]);
    expect(provider.control.count("submitTx")).toBe(0);
  });
});

describe("a step called dead", () => {
  it("is looked for again; found in a block it is included, the plan leaves stopped, and trace is told", async () => {
    const hidden = new Set<string>();
    const events: BuildEvent[] = [];
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: hiding(hidden),
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
      trace: (event) => events.push(event),
    });
    // The search lags: the step lands, and the provider does not find it
    hidden.add(plan.step("main").txHash);
    await plan.run({ waitFor: "sent" });
    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");
    expect(statuses(plan)).toEqual({ main: "expired" });
    expect(events.some((e) => e.type === "warning")).toBe(false);

    // The search catches up: the chain wins
    hidden.clear();
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "final" });
    expect(plan.status).toBe("final");
    expect(events).toContainEqual({
      type: "warning",
      code: "DEAD_STEP_FOUND",
      step: "main",
      txHash: plan.step("main").txHash,
      was: "expired",
    });
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });

  it("is looked for by run() on a stopped plan, which looks first and then refuses to send", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus");
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
    });
    await plan.run({ waitFor: "sent", submitter: swallowing() });
    await plan.stop();
    expect(plan.status).toBe("stopping");
    advance(emulator, 120);
    const looks = provider.control.count("fetchTxInfo");
    const error = await caught(plan.run());
    expect([error.code, error.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    // The look came first: the plan is stopped, and the error says so
    expect(provider.control.count("fetchTxInfo")).toBeGreaterThan(looks);
    expect(plan.status).toBe("stopped");
    expect(error.status).toBe("stopped");
    expect(provider.control.count("submitTx")).toBe(0);
  });

  it("stops the plan; a step of another payer that was sent goes again, the same bytes, and nothing goes for the first time", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const other = await walletOf(1);
    emulator.fund((await other.getChangeAddress())!, { lovelace: 100n * ADA });
    const later = builder.timeAt(emulator.slot) + 3_600_000;
    const plan = await builder.plan(
      {
        a: payTo(alice, 5n * ADA),
        b: {
          parts: [payTo(bob, 3n * ADA), validity({ until: later })],
          payer: other,
        },
        c: payTo(carol, 2n * ADA),
      },
      { payer: wallet, ttlMs: 60_000 },
    );
    const before = emulator.fork();
    const submitter = submitterOf((tx) => provider.control.target.submitTx(tx));
    const signers = [wallet, other];
    await plan.run({ submitter, signers, waitFor: "sent" });
    await plan.run({ submitter, signers, waitFor: "sent" });
    expect(statuses(plan)).toEqual({ a: "included", b: "sent", c: "built" });
    await plan.refresh();
    expect(statuses(plan)).toEqual({
      a: "included",
      b: "included",
      c: "built",
    });

    // Both blocks are rolled back, and a's end of validity passes
    provider.control.target = before;
    advance(before, 120);
    await plan.refresh();
    // The look after the rollback finds them gone; the next one finds a dead
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "expired", b: "sent", c: "orphaned" });
    expect(plan.status).toBe("stopping");

    const sends = submitter.calls.length;
    const error = await caught(plan.run({ submitter, signers }));
    expect([error.code, error.step]).toEqual(["EXPIRED", "a"]);
    expect(submitter.calls.slice(sends)).toEqual([plan.step("b").signedTx]);
    expect(paidTo(before, bob)).toEqual([3n * ADA]);
    expect(paidTo(before, carol)).toEqual([]);
  });
});

describe("an orphaned step", () => {
  it("comes back when the step it stands on is found after all: the same bytes go again and land, the recipient is paid once, and nothing goes for the first time", async () => {
    const hidden = new Set<string>();
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: hiding(hidden),
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
      funds: [1000n * ADA, 1000n * ADA, 1000n * ADA],
    });
    const later = builder.timeAt(emulator.slot) + 3_600_000;
    const plan = await builder.plan(
      {
        a: payTo(alice, 5n * ADA),
        b: [payTo(bob, 3n * ADA), validity({ until: later })],
        c: [payTo(carol, 2n * ADA), validity({ until: later })],
      },
      { payer: wallet, ttlMs: 60_000 },
    );
    const b = plan.step("b").txHash;
    // The first send of b is held on its way, and may land later
    const held: string[] = [];
    const submitter = submitterOf(async (tx) => {
      if ((await hashOf(tx)) === b && held.length === 0) {
        held.push(tx);
        return b;
      }
      return emulator.submitTx(tx);
    });
    await plan.run({ submitter, waitFor: "sent" });
    await plan.run({ submitter, waitFor: "sent" });
    expect(statuses(plan)).toEqual({ a: "included", b: "sent", c: "built" });

    // The search hides a past its end of validity and the margin: a is called expired
    hidden.add(plan.step("a").txHash.toLowerCase());
    advance(emulator, 120);
    await plan.refresh();
    await plan.refresh();
    expect(statuses(plan)).toEqual({
      a: "expired",
      b: "orphaned",
      c: "orphaned",
    });
    expect(plan.status).toBe("stopped");
    expect(plan.toJSON().halted).toBe(true);

    // Resumed from its JSON, the plan keeps that it came to stopped
    const resumed = await builder.resume(plan.toJSON(), { payer: wallet });
    expect(recordOf(resumed).halted).toBe(true);

    // The search catches up; run() looks first: a is in a block, b was sent and goes again, the
    // same bytes, and lands; c was never sent and does not go
    hidden.clear();
    const sends = submitter.calls.length;
    const error = await caught(resumed.run({ submitter }));
    expect([error.code, error.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    expect(resumed.step("a").status).not.toBe("expired");
    expect(resumed.step("b").status).toBe("included");
    expect(resumed.step("c").status).toBe("built");
    expect(resumed.status).toBe("stopping");
    expect(submitter.calls.slice(sends)).toEqual([held[0]]);
    expect(Object.keys(resumed.rest)).toEqual(["c"]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
    expect(paidTo(emulator, carol)).toEqual([]);

    // The bytes that were held arrive: they are the transaction that landed
    await expect(emulator.submitTx(held[0]!)).rejects.toBeDefined();
    await plan.refresh();
    expect(plan.step("b").status).toBe("included");
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });

  it("comes back for run() on the object that saw it orphaned, and the plan is final with the recipient paid once", async () => {
    const hidden = new Set<string>();
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: hiding(hidden),
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
      funds: [1000n * ADA, 1000n * ADA, 1000n * ADA],
    });
    const later = builder.timeAt(emulator.slot) + 3_600_000;
    const plan = await builder.plan(
      {
        a: payTo(alice, 5n * ADA),
        b: [payTo(bob, 3n * ADA), validity({ until: later })],
      },
      { payer: wallet, ttlMs: 60_000 },
    );
    const b = plan.step("b").txHash;
    const held: string[] = [];
    const submitter = submitterOf(async (tx) => {
      if ((await hashOf(tx)) === b && held.length === 0) {
        held.push(tx);
        return b;
      }
      return emulator.submitTx(tx);
    });
    await plan.run({ submitter, waitFor: "sent" });
    await plan.run({ submitter, waitFor: "sent" });
    hidden.add(plan.step("a").txHash.toLowerCase());
    advance(emulator, 120);
    await plan.refresh();
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "expired", b: "orphaned" });
    expect(Object.keys(plan.rest)).toEqual(["b"]);

    hidden.clear();
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "final", b: "sent" });
    expect(plan.status).toBe("stopping");
    await plan.run({ submitter });
    expect(statuses(plan)).toEqual({ a: "final", b: "included" });
    // Blocks on top of it
    advance(emulator, 100);
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "final", b: "final" });
    expect(plan.status).toBe("final");
    expect(plan.rest).toEqual({});
    expect(new Set(submitter.calls.filter((tx) => tx === held[0]))).toEqual(
      new Set([plan.step("b").signedTx]),
    );
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
  });
});

describe("the time of a plan", () => {
  it("expires nothing by a tip from the future, and tells trace; the step that was on its way lands", async () => {
    let lie = 0;
    const events: BuildEvent[] = [];
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: {
        fetchLatestBlock: async (forward: () => Promise<{ slot: number }>) => {
          const block = await forward();
          return lie === 0 ? block : { ...block, slot: block.slot + lie };
        },
      },
      builder: { planDefaults: { ...FAST, expiryMarginMs: 600_000 } },
    });
    clockOnChain(builder, () => emulator.slot);
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
      trace: (event) => events.push(event),
    });
    const held = swallowing();
    await plan.run({ waitFor: "sent", submitter: held });
    // A provider whose tip is a day ahead of the clock
    lie = 100_000;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(plan.status).toBe("pending");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "warning", code: "TIP_AHEAD_OF_CLOCK" }),
    );
    lie = 0;
    await emulator.submitTx(held.calls[0]!);
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "included" });
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });

  it("expires a step only when both the tip and the local clock are past its end of validity and the margin", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus");
    const offset = { ms: 0 };
    clockOnChain(builder, () => emulator.slot, offset);
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
    });
    await plan.run({ waitFor: "sent", submitter: swallowing() });
    advance(emulator, 90);
    // The local clock is 60 s behind the tip: before the end of validity
    offset.ms = -60_000;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "sent" });
    // Both past
    offset.ms = 0;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ main: "expired" });
    expect(plan.status).toBe("stopped");
  });

  it("is CONFIRM_TIMEOUT, not EXPIRED, while a step past its end of validity may still land; EXPIRED once it is dead", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, expiryMarginMs: 120_000 } },
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet, ttlMs: 60_000 },
    );
    // The chain passes the end of validity right after a lands
    const late = submitterOf(async (tx) => {
      const hash = await emulator.submitTx(tx);
      advance(emulator, 61);
      return hash;
    });
    const error = await caught(plan.run({ submitter: late, timeoutMs: 200 }));
    expect([error.code, error.step, error.status]).toEqual([
      "CONFIRM_TIMEOUT",
      "b",
      "pending",
    ]);
    expect(error.message).toMatch(/end of validity/);
    expect(statuses(plan)).toEqual({ a: "final", b: "built" });
    const quick = await caught(plan.run({ waitFor: "sent", timeoutMs: 50 }));
    expect(quick.code).toBe("CONFIRM_TIMEOUT");
    expect(late.calls).toHaveLength(1);

    advance(emulator, 120);
    const dead = await caught(plan.run());
    expect([dead.code, dead.step, dead.details.unsent]).toEqual([
      "EXPIRED",
      "b",
      true,
    ]);
    expect(plan.status).toBe("stopped");
  });

  it("counts timeoutMs anew after each delivery", async () => {
    const hidden = new Set<string>();
    const shown = new Map<string, number>();
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: {
        fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
          const at = shown.get(hash.toLowerCase());
          if (at !== undefined && Date.now() < at)
            throw new ProviderError("not found", {
              kind: "notFound",
              status: 404,
              retryable: false,
            });
          return forward(hash);
        },
      },
    });
    void hidden;
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet },
    );
    // Each step is found 250 ms after it is sent: 500 ms in all, within 400 ms of each delivery
    const slow = submitterOf(async (tx) => {
      const hash = await emulator.submitTx(tx);
      shown.set(hash.toLowerCase(), Date.now() + 250);
      return hash;
    });
    await plan.run({ submitter: slow, timeoutMs: 400 });
    expect(statuses(plan)).toEqual({ a: "final", b: "final" });
  });

  it("is NOT_YET_VALID before a step's lower bound, and sends nothing", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus");
    const from = builder.timeAt(emulator.slot) + 300_000;
    const plan = await builder.plan(
      [payTo(alice, 5n * ADA), validity({ from })],
      { payer: wallet },
    );
    const error = await caught(plan.run());
    expect([error.code, error.step, error.retryable]).toEqual([
      "NOT_YET_VALID",
      "main",
      true,
    ]);
    expect(error.retryAfterMs).toBeGreaterThan(290_000);
    expect(provider.control.count("submitTx")).toBe(0);
    advance(emulator, 301);
    await plan.run();
    expect(plan.status).toBe("final");
  });
});

describe("the bytes of a step", () => {
  it("are fixed by its first delivery: a witness added later changes nothing and is no error", async () => {
    const { builder, wallet } = await stepSetup("scalus");
    const other = await walletOf(2);
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      extraKeyWitnesses: 1,
    });
    const recording = swallowing();
    await plan.run({ waitFor: "sent", submitter: recording });
    const first = plan.step("main").signedTx;
    await plan.addWitnesses(await other.signTx(plan.step("main").tx, true));
    await plan.sign({ signers: [other] });
    expect(plan.step("main").signedTx).toBe(first);
    await plan.run({ waitFor: "sent", submitter: recording });
    expect(recording.calls).toHaveLength(2);
    expect(new Set(recording.calls)).toEqual(new Set([first]));
  });
});

describe("a look", () => {
  it("leaves out a step never sent that stands on a step not in a block, and searches it once that step is", async () => {
    const searched: string[] = [];
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: {
        fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
          searched.push(hash.toLowerCase());
          return forward(hash);
        },
      },
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet },
    );
    const [a, b] = plan.steps.map((step) => step.txHash.toLowerCase());
    const held = swallowing();
    await plan.run({ waitFor: "sent", submitter: held });
    searched.length = 0;
    await plan.refresh();
    expect(searched).toContain(a);
    expect(searched).not.toContain(b);

    // a lands: the same look searches b
    await emulator.submitTx(held.calls[0]!);
    searched.length = 0;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "final", b: "built" });
    expect(searched.filter((hash) => hash === b)).toHaveLength(1);
  });
});

describe("a call that waits", () => {
  it("reads the store again before each pause: a stop written by another process ends it", async () => {
    const store = memoryPlanStore();
    // No resend while it waits: the object writes nothing, and only a read shows the mark
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { store, planDefaults: { ...FAST, resendMs: 60_000 } },
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      id: "o1",
    });
    const other = await builderOf(provider, {
      store,
      evaluator: emulator,
    }).resume("o1");
    const running = caught(
      plan.run({ submitter: swallowing(), timeoutMs: 5_000 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    await other.stop();
    const started = Date.now();
    const error = await running;
    expect([error.code, error.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(recordOf(plan).stopped).toBe(true);
  });
});

describe("a plan built after another plan", () => {
  it("expires a step every input of which comes from that plan when that plan does not land: a look finds the transaction before them", async () => {
    const { emulator, builder, wallet, funded } = await stepSetup("scalus");
    const first = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(carol, 2n * ADA) },
      { payer: wallet, ttlMs: 60_000 },
    );
    const held = swallowing();
    await first.run({ waitFor: "sent", submitter: held });
    const second = await builder.plan(payTo(bob, 3n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
      after: first,
    });
    // It spends the change of step b, which spends the change of step a
    const [step] = second.toJSON().steps;
    expect(step!.after).toEqual([first.step("b").txHash]);
    // The source it is shown expired by is followed back through a and b to the chain: the
    // transaction that funded the wallet
    expect(step!.expirySource).toBe(funded[0]!.input.txHash);
    // The record reads back with it
    expect(
      (await builder.resume(second.toJSON())).toJSON().steps[0]!.expirySource,
    ).toBe(step!.expirySource);
    await second.run({ waitFor: "sent", submitter: held });
    for (let i = 0; i < 5; i++) {
      advance(emulator, 600);
      await first.refresh();
      await second.refresh();
    }
    expect(statuses(first)).toEqual({ a: "expired", b: "orphaned" });
    expect(second.status).toBe("stopped");
    expect(second.step("main").status).toBe("expired");
    expect((await caught(second.run())).code).toBe("EXPIRED");
    // Nobody was paid
    expect(paidTo(emulator, bob)).toEqual([]);
    expect(paidTo(emulator, alice)).toEqual([]);
  });

  it("never expires such a step by a search that finds nothing", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: { fetchTxInfo: async () => Promise.reject(new Error("404")) },
    });
    const first = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
    });
    const held = swallowing();
    await first.run({ waitFor: "sent", submitter: held });
    const second = await builder.plan(payTo(bob, 3n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
      after: first,
    });
    await second.run({ waitFor: "sent", submitter: held });
    for (let i = 0; i < 5; i++) {
      advance(emulator, 600);
      await second.refresh();
    }
    expect(second.step("main").status).toBe("sent");
    expect(second.status).toBe("pending");
  });
});
