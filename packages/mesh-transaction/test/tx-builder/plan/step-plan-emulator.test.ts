import { ProviderError } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";

import type { TxPlanError } from "../../../src/tx-builder";
import type { StepPlanJSON } from "../../../src/tx-builder/plan/step-json";
import type { StepPlan } from "../../../src/tx-builder/plan/step-plan";
import { memoryPlanStore, spend } from "../../../src/tx-builder";
import { makePlan } from "../../../src/tx-builder/plan/make";
import {
  createStepPlan,
  resumeStepPlan,
  STEP_NOT_UNPAID,
} from "../../../src/tx-builder/plan/step-plan";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  hashOf,
  Hooks,
  submitterOf,
  swallowing,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  paidTo,
  payTo,
  planOf,
  refusal,
  stepSetup,
  VALIDATORS,
} from "./step-plan-util";

// The object that runs a plan of steps, on the emulator: the walk-throughs of one payment, of a
// lock and its unlock, of a crash and a resume, and of a payment that does not land; lost
// answers, refusals that count and refusals that do not, a rollback, how far a call waits,
// stopping, and two objects on one stored plan.

const statuses = (plan: StepPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

const script = { code: alwaysSucceedCbor, version: "V3" as const };

/** Three payments, each standing on the one before */
const threeSteps = () => ({
  a: payTo(alice, 5n * ADA),
  b: payTo(bob, 3n * ADA),
  c: payTo(carol, 2n * ADA),
});

describe.each(VALIDATORS)("a plan of steps run on TxEmulator (%s)", (v) => {
  it("one payment: built, then run to final with the payer as signer", async () => {
    const { emulator, builder, wallet } = await stepSetup(v);
    const plan = await planOf(builder, payTo(alice, 5n * ADA), {
      payer: wallet,
    });
    expect(plan.status).toBe("pending");
    expect(statuses(plan)).toEqual({ main: "built" });
    expect(plan.fee).toBe(plan.step("main").fee);
    expect(plan.fee).toBeGreaterThan(0n);
    expect(plan.until).toBe(plan.step("main").validity!.until);
    expect(paidTo(emulator, alice)).toEqual([]);

    await plan.run();
    expect(plan.status).toBe("final");
    expect(statuses(plan)).toEqual({ main: "final" });
    expect(plan.landed.map((step) => step.name)).toEqual(["main"]);
    expect(plan.live).toEqual([]);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });

  it("lock, then unlock by alias with all the change of the first: both signed before anything is sent, then run to final", async () => {
    const { emulator, provider, builder, wallet, address } = await stepSetup(v);
    const vault = builder.scriptAddress(script);
    const plan = await planOf(
      builder,
      {
        lock: payTo(vault, 10n * ADA, "vault"),
        unlock: [
          spend.plutus({
            utxo: { step: "lock", output: "vault" },
            script,
            redeemer: { data: mConStr0([]) },
          }),
          spend.pubKey({ utxo: { step: "lock", change: true } }),
          payTo(bob, 4n * ADA),
        ],
      },
      { payer: wallet },
    );
    // The vault output carries an inline datum, so the Plutus spend works it out
    expect(statuses(plan)).toEqual({ lock: "built", unlock: "built" });
    const lock = plan.step("lock");
    const unlock = plan.step("unlock");
    expect(unlock.standsOn).toEqual(["lock"]);
    expect(unlock.inputs.map((i) => `${i.txHash}#${i.outputIndex}`)).toEqual(
      expect.arrayContaining([
        `${lock.txHash}#${lock.outputs[0]!.outputIndex}`,
        ...lock.change.map((o) => `${o.txHash}#${o.outputIndex}`),
      ]),
    );
    expect(unlock.redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
    expect(emulator.utxos({ address: vault })).toHaveLength(0);

    await plan.sign();
    expect(statuses(plan)).toEqual({ lock: "signed", unlock: "signed" });
    expect(plan.steps.every((step) => step.missing.length === 0)).toBe(true);
    expect(provider.control.count("submitTx")).toBe(0);

    await plan.run();
    expect(plan.status).toBe("final");
    expect(statuses(plan)).toEqual({ lock: "final", unlock: "final" });
    expect(paidTo(emulator, bob)).toEqual([4n * ADA]);
    expect(emulator.utxos({ address: vault })).toHaveLength(0);
    expect(emulator.utxos({ address })).toHaveLength(1);
  });

  it("goes on from what the chain shows after a crash once step 1 was sent; a second process on the record changes nothing; every recipient is paid once", async () => {
    const store = memoryPlanStore();
    const { emulator, provider, builder, wallet } = await stepSetup(v, {
      builder: { store },
    });
    const plan = await planOf(builder, threeSteps(), {
      payer: wallet,
      id: "order-7",
    });
    await plan.sign();
    expect(statuses(plan)).toEqual({ a: "signed", b: "signed", c: "signed" });
    const stale = plan.toJSON();
    await plan.run({ waitFor: "sent" });
    expect(statuses(plan)).toEqual({ a: "sent", b: "signed", c: "signed" });
    expect(provider.control.count("submitTx")).toBe(1);

    // A new process: a new builder over the same store, without a wallet
    const restarted = builderOf(provider, { store, evaluator: emulator });
    const resumed = await resumeStepPlan(restarted, "order-7");
    expect(resumed.steps.map((step) => step.txHash)).toEqual(
      plan.steps.map((step) => step.txHash),
    );
    await resumed.run();
    expect(resumed.status).toBe("final");
    expect(statuses(resumed)).toEqual({ a: "final", b: "final", c: "final" });
    // a was found by the first look, not sent again
    expect(provider.control.count("submitTx")).toBe(3);

    const second = await resumeStepPlan(
      builderOf(provider, { store, evaluator: emulator }),
      "order-7",
    );
    await second.run();
    expect(second.status).toBe("final");
    // From the stale record, without a store: one look, nothing sent
    const fromStale = await resumeStepPlan(
      builderOf(provider, { evaluator: emulator }),
      stale,
    );
    expect(statuses(fromStale)).toEqual({
      a: "signed",
      b: "signed",
      c: "signed",
    });
    await fromStale.run();
    expect(statuses(fromStale)).toEqual({ a: "final", b: "final", c: "final" });
    expect(provider.control.count("submitTx")).toBe(3);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
    expect(paidTo(emulator, carol)).toEqual([2n * ADA]);
  });

  it("does not pay when the bytes are lost: CONFIRM_TIMEOUT, then stopped after the deadline, and the lost bytes are refused by the ledger", async () => {
    const { emulator, builder, wallet } = await stepSetup(v);
    const plan = await planOf(builder, payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
    });
    const lost = swallowing();
    const error = (await caught(
      plan.run({ submitter: lost, timeoutMs: 200 }),
    )) as TxPlanError<"CONFIRM_TIMEOUT">;
    expect(error.code).toBe("CONFIRM_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.step).toBe("main");
    expect(error.txHash).toBe(plan.step("main").txHash);
    expect(error.message.endsWith(STEP_NOT_UNPAID)).toBe(true);
    expect(plan.status).toBe("pending");
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(lost.calls.length).toBeGreaterThanOrEqual(1);
    expect(new Set(lost.calls).size).toBe(1);

    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");
    expect(statuses(plan)).toEqual({ main: "expired" });
    expect(plan.landed).toEqual([]);
    expect(plan.live).toEqual([]);
    const dead = await caught(plan.run());
    expect(dead.code).toBe("EXPIRED");
    expect(dead.step).toBe("main");
    await expect(emulator.submitTx(lost.calls[0]!)).rejects.toThrow();
    expect(paidTo(emulator, alice)).toEqual([]);
  });

  it("sends the same bytes after a lost answer, and pays once", async () => {
    const { emulator, builder, wallet } = await stepSetup(v);
    // The bytes arrive and the answer is lost
    const arrived = await planOf(builder, payTo(alice, 5n * ADA), {
      payer: wallet,
    });
    const answerLost = submitterOf(async (tx) => {
      await emulator.submitTx(tx);
      throw new Error("socket hang up");
    });
    const first = await caught(arrived.run({ submitter: answerLost }));
    expect(first.code).toBe("SUBMIT_FAILED");
    expect(first.retryable).toBe(true);
    expect(first.step).toBe("main");
    expect(statuses(arrived)).toEqual({ main: "sent" });
    await arrived.run({ submitter: answerLost });
    expect(arrived.status).toBe("final");
    expect(answerLost.calls).toHaveLength(1);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);

    // The bytes are lost with the answer, then sent again
    const sentAgain = await planOf(builder, payTo(bob, 3n * ADA), {
      payer: wallet,
    });
    let drop = true;
    const flaky = submitterOf(async (tx) => {
      if (drop) {
        drop = false;
        throw new Error("socket hang up");
      }
      return emulator.submitTx(tx);
    });
    expect((await caught(sentAgain.run({ submitter: flaky }))).code).toBe(
      "SUBMIT_FAILED",
    );
    await sentAgain.run({ submitter: flaky });
    expect(sentAgain.status).toBe("final");
    expect(flaky.calls).toHaveLength(2);
    expect(flaky.calls[1]).toBe(flaky.calls[0]);
    expect(flaky.calls[0]).toBe(sentAgain.step("main").signedTx);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
  });

  it("does not count a refusal of a step while the step it stands on is not found in a block: the plan goes on", async () => {
    const hidden = new Set<string>();
    const { emulator, builder, wallet } = await stepSetup(v, {
      hooks: {
        fetchTxInfo: (forward, hash: string) => {
          if (hidden.delete(hash.toLowerCase()))
            throw new ProviderError("not found", {
              kind: "notFound",
              status: 404,
              retryable: false,
            });
          return forward(hash);
        },
      },
    });
    const plan = await planOf(
      builder,
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet },
    );
    const a = plan.step("a").txHash;
    const b = plan.step("b").txHash;
    // A node that has not seen a refuses b, and the search right after it does not show a
    let refuseB = true;
    const submitter = submitterOf(async (tx) => {
      if ((await hashOf(tx)) === b && refuseB) {
        refuseB = false;
        hidden.add(a);
        throw refusal();
      }
      return emulator.submitTx(tx);
    });
    await plan.run({ waitFor: "sent", submitter });
    expect(statuses(plan)).toEqual({ a: "sent", b: "built" });
    const error = (await caught(
      plan.run({ waitFor: "sent", submitter }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expect(error.code).toBe("SUBMIT_FAILED");
    expect(error.details.reason).toBe("refused");
    expect(error.retryable).toBe(true);
    expect(error.step).toBe("b");
    expect(plan.status).toBe("pending");
    expect(statuses(plan)).toEqual({ a: "final", b: "sent" });

    await plan.run({ submitter });
    expect(plan.status).toBe("final");
    const sentB = [];
    for (const tx of submitter.calls)
      if ((await hashOf(tx)) === b) sentB.push(tx);
    expect(sentB).toHaveLength(2);
    expect(sentB[1]).toBe(sentB[0]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);

    // A call that waits goes on waiting and sends the same bytes again
    const waiting = await planOf(
      builder,
      { a: payTo(alice, 1n * ADA), b: payTo(carol, 2n * ADA) },
      { payer: wallet },
    );
    const a2 = waiting.step("a").txHash;
    const b2 = waiting.step("b").txHash;
    let refuse = true;
    const once = submitterOf(async (tx) => {
      if ((await hashOf(tx)) === b2 && refuse) {
        refuse = false;
        hidden.add(a2);
        throw refusal();
      }
      return emulator.submitTx(tx);
    });
    await waiting.run({ submitter: once });
    expect(waiting.status).toBe("final");
    const hashes = await Promise.all(once.calls.map(hashOf));
    expect(hashes).toEqual([a2, b2, b2]);
    expect(once.calls[2]).toBe(once.calls[1]);
    expect(paidTo(emulator, carol)).toEqual([2n * ADA]);
  });

  it("sends a step only when the step before it is in a block, and the same bytes of the step before until then", async () => {
    const { emulator, builder, wallet } = await stepSetup(v);
    const plan = await planOf(builder, threeSteps(), { payer: wallet });
    // A submitter that takes the bytes and holds them: nothing reaches a block
    const held = swallowing();
    await plan.run({ waitFor: "sent", submitter: held });
    await plan.run({ waitFor: "sent", submitter: held });
    const error = await caught(plan.run({ submitter: held, timeoutMs: 100 }));
    expect(error.code).toBe("CONFIRM_TIMEOUT");
    expect(error.step).toBe("a");
    const a = plan.step("a").txHash;
    expect(await Promise.all(held.calls.map(hashOf))).toEqual(
      held.calls.map(() => a),
    );
    expect(new Set(held.calls).size).toBe(1);
    expect(statuses(plan)).toEqual({ a: "sent", b: "built", c: "built" });

    // Once a is in a block, b goes
    await emulator.submitTx(held.calls[0]!);
    await plan.run({ waitFor: "sent", submitter: held });
    expect(await hashOf(held.calls.at(-1)!)).toBe(plan.step("b").txHash);
    expect(statuses(plan)).toEqual({ a: "final", b: "sent", c: "built" });
  });

  it("stops at a refusal that counts: landed, live and rest say what landed and what did not, and the later step never goes", async () => {
    const { emulator, builder, wallet, funded } = await stepSetup(v, {
      funds: [1000n * ADA, 7n * ADA],
    });
    const voucher = funded[1]!;
    const plan = await planOf(
      builder,
      {
        a: payTo(alice, 5n * ADA),
        b: [spend.pubKey({ utxo: voucher }), payTo(bob, 3n * ADA)],
        c: payTo(carol, 2n * ADA),
      },
      {
        payer: wallet,
        ttlMs: 60_000,
        canSelect: (utxo) => utxo.txHash !== voucher.input.txHash,
      },
    );
    expect(plan.steps.map((step) => step.standsOn)).toEqual([[], ["a"], ["b"]]);
    // Another transaction takes the voucher
    emulator.removeUtxos([voucher.input]);
    const submitter = submitterOf((tx) => emulator.submitTx(tx));
    const error = (await caught(
      plan.run({ submitter }),
    )) as TxPlanError<"REJECTED">;
    expect(error.code).toBe("REJECTED");
    expect(error.step).toBe("b");
    expect(error.txHash).toBe(plan.step("b").txHash);
    expect(error.retryable).toBe(false);
    expect(plan.status).toBe("pending");
    expect(statuses(plan)).toEqual({ a: "final", b: "rejected", c: "built" });
    expect(plan.landed.map((step) => step.name)).toEqual(["a"]);
    expect(plan.live.map((step) => step.name)).toEqual(["b", "c"]);
    expect(Object.keys(plan.rest)).toEqual(["b", "c"]);
    // As the steps were given: b with its voucher, c with its payment
    const restB = plan.rest.b as readonly { kind: string }[];
    expect(restB.map((part) => part.kind)).toEqual(["spend", "output"]);
    const restC = plan.rest.c as readonly { kind: string }[];
    expect(restC.map((part) => part.kind)).toEqual(["output"]);
    const sent = async () => Promise.all(submitter.calls.map(hashOf));
    expect(await sent()).toEqual([
      plan.step("a").txHash,
      plan.step("b").txHash,
    ]);

    // The same call sends the same bytes again; c never goes
    expect((await caught(plan.run({ submitter }))).code).toBe("REJECTED");
    expect(submitter.calls[2]).toBe(submitter.calls[1]);

    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");
    expect(statuses(plan)).toEqual({ a: "final", b: "expired", c: "orphaned" });
    const dead = await caught(plan.run({ submitter }));
    expect(dead.code).toBe("EXPIRED");
    expect(dead.step).toBe("b");
    expect((await sent()).includes(plan.step("c").txHash)).toBe(false);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
    expect(paidTo(emulator, bob)).toEqual([]);
    expect(paidTo(emulator, carol)).toEqual([]);
  });

  it("sends a step again after a rollback, then the steps after it, in order", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup(v, {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await planOf(
      builder,
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet },
    );
    const before = emulator.fork();
    await plan.run();
    expect(plan.status).toBe("pending");
    expect(statuses(plan)).toEqual({ a: "included", b: "included" });
    expect(provider.control.count("submitTx")).toBe(2);

    provider.control.target = before;
    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "sent", b: "sent" });
    expect(plan.landed).toEqual([]);

    await plan.run();
    expect(statuses(plan)).toEqual({ a: "included", b: "included" });
    expect(provider.control.count("submitTx")).toBe(4);
    advance(before, 3);
    await plan.refresh();
    expect(plan.status).toBe("final");
    expect(paidTo(before, alice)).toEqual([5n * ADA]);
    expect(paidTo(before, bob)).toEqual([3n * ADA]);
  });

  it("goes as far as waitFor says: sent does one step a call, included every block, final every depth", async () => {
    let ticking = false;
    const { emulator, provider, builder, wallet } = await stepSetup(v, {
      builder: { planDefaults: { ...FAST, confirmations: 2 } },
      hooks: {
        fetchLatestBlock: (forward) => {
          if (ticking) advance(emulator, 1);
          return forward();
        },
      },
    });
    const plan = await planOf(builder, threeSteps(), { payer: wallet });
    const submits = () => provider.control.count("submitTx");
    await plan.run({ waitFor: "sent" });
    expect([submits(), statuses(plan)]).toEqual([
      1,
      { a: "sent", b: "built", c: "built" },
    ]);
    await plan.run({ waitFor: "sent" });
    expect([submits(), statuses(plan)]).toEqual([
      2,
      { a: "included", b: "sent", c: "built" },
    ]);
    await plan.run({ waitFor: "sent" });
    expect(submits()).toBe(3);
    await plan.run({ waitFor: "sent" });
    expect([submits(), statuses(plan)]).toEqual([
      3,
      { a: "included", b: "included", c: "included" },
    ]);

    const other = await planOf(
      builder,
      { a: payTo(alice, 1n * ADA), b: payTo(bob, 1n * ADA) },
      { payer: wallet },
    );
    await other.run();
    expect(statuses(other)).toEqual({ a: "included", b: "included" });
    expect(other.status).toBe("pending");

    ticking = true;
    await plan.run({ waitFor: "final" });
    expect(plan.status).toBe("final");
    expect(statuses(plan)).toEqual({ a: "final", b: "final", c: "final" });
    expect(submits()).toBe(5);
  });

  it("stop(): signs and sends nothing more; stopping while a step may land, then stopped", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup(v);
    const plan = await planOf(
      builder,
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet, ttlMs: 60_000 },
    );
    // b is signed: only the mark keeps it from going
    await plan.sign();
    await plan.run({ waitFor: "sent" });
    await plan.stop();
    expect(plan.status).toBe("stopping");
    expect(plan.toJSON().stopped).toBe(true);
    const ran = await caught(plan.run());
    expect([ran.code, ran.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    const signed = await caught(plan.sign());
    expect([signed.code, signed.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    expect(provider.control.count("submitTx")).toBe(1);

    await plan.refresh();
    expect(statuses(plan)).toEqual({ a: "final", b: "signed" });
    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");
    expect(statuses(plan)).toEqual({ a: "final", b: "expired" });
    expect(plan.landed.map((step) => step.name)).toEqual(["a"]);
    const rev = plan.toJSON().rev;
    await plan.stop();
    expect(plan.toJSON().rev).toBe(rev);
    expect(paidTo(emulator, bob)).toEqual([]);
  });

  it("two objects running one stored plan at once send the same bytes and pay each recipient once", async () => {
    const store = memoryPlanStore();
    const { emulator, provider, builder, wallet } = await stepSetup(v, {
      builder: { store },
    });
    const one = await planOf(builder, threeSteps(), {
      payer: wallet,
      id: "order-9",
    });
    const two = await resumeStepPlan(
      builderOf(provider, { store, evaluator: emulator }),
      "order-9",
      { payer: wallet },
    );
    const submitter = submitterOf((tx) => emulator.submitTx(tx));
    await Promise.all([one.run({ submitter }), two.run({ submitter })]);
    expect(one.status).toBe("final");
    await two.refresh();
    expect(two.status).toBe("final");
    const hashes = new Set(one.steps.map((step) => step.txHash));
    const signed = new Set(one.steps.map((step) => step.signedTx));
    expect(signed.size).toBe(3);
    expect(new Set(submitter.calls)).toEqual(signed);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
    expect(paidTo(emulator, carol)).toEqual([2n * ADA]);
    const stored = (await store.load("order-9")) as unknown as StepPlanJSON;
    expect(stored.status).toBe("final");
    expect(new Set(stored.steps.map((step) => step.txHash))).toEqual(hashes);
  });
});

describe("a plan of steps made on a provider", () => {
  it("probes the provider when it is made: a search, block heights, and validity for a Plutus step", async () => {
    const make = async (hooks: Hooks) => {
      const { builder, wallet } = await stepSetup("scalus", { hooks });
      const vault = builder.scriptAddress(script);
      const made = await makePlan(
        builder,
        {
          lock: payTo(vault, 10n * ADA, "vault"),
          unlock: [
            spend.plutus({
              utxo: { step: "lock", output: "vault" },
              script,
              redeemer: { data: mConStr0([]) },
            }),
            payTo(bob, 4n * ADA),
          ],
        },
        { payer: wallet },
      );
      return caught(createStepPlan(builder, made, { payer: wallet }));
    };
    const noSearch = await make({ fetchTxInfo: null });
    expect([noSearch.code, noSearch.details.reason]).toEqual([
      "CANNOT_OBSERVE",
      "noSearch",
    ]);
    const noDepth = await make({
      fetchLatestBlock: async (forward) => ({
        ...(await forward()),
        height: undefined,
      }),
    });
    expect([noDepth.code, noDepth.details.reason]).toEqual([
      "CANNOT_OBSERVE",
      "noDepth",
    ]);
    const noValidity = await make({
      fetchTxInfo: async (forward, hash: string) => {
        const { validContract: _validContract, ...info } = await forward(hash);
        return info;
      },
    });
    expect([noValidity.code, noValidity.details.reason]).toEqual([
      "CANNOT_OBSERVE",
      "noValidity",
    ]);
    expect(noValidity.message.endsWith(STEP_NOT_UNPAID)).toBe(true);
  });

  it("refuses a recorded id with other steps, and gives the recorded plan for the same steps", async () => {
    const store = memoryPlanStore();
    const { builder, provider, wallet } = await stepSetup("scalus", {
      builder: { store },
    });
    const first = await planOf(builder, payTo(alice, 5n * ADA), {
      payer: wallet,
      id: "order-1",
    });
    const again = await planOf(builder, payTo(alice, 5n * ADA), {
      payer: wallet,
      id: "order-1",
    });
    expect(again.step("main").txHash).toBe(first.step("main").txHash);
    const other = await caught(
      planOf(builder, payTo(alice, 6n * ADA), { payer: wallet, id: "order-1" }),
    );
    expect(other.code).toBe("PLAN_EXISTS");
    const missing = await caught(
      planOf(builder, payTo(alice, 5n * ADA), { payer: wallet }),
    );
    expect(missing.code).toBe("MISSING_ID");
    expect((await caught(resumeStepPlan(builder, "nothing"))).code).toBe(
      "PLAN_NOT_FOUND",
    );
    const storeless = builderOf(provider);
    expect((await caught(resumeStepPlan(storeless, "order-1"))).code).toBe(
      "MISSING_STORE",
    );
    expect(() => first.step("nope")).toThrow(/step/);
  });
});
