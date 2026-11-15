import type { TxEmulator } from "@meshsdk/tx-emulator";
import { mConStr0 } from "@meshsdk/core";

import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import {
  spend,
  TxBuildError,
  TxPlanError,
  validity,
} from "../../../src/tx-builder";
import { MAX_STEPS } from "../../../src/tx-builder/plan/make";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  caught,
  FAST,
  forwarding,
  hashOf,
  reasonOf,
  swallowing,
  walletOf,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  dave,
  paidTo,
  payTo,
  stepSetup,
} from "./run-util";

// Steps added to a plan in progress: what an added step stands on and spends, its deadline, its
// payer, a plan that does not go on, a call made again, and a run() that is going.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

/** An out ref as text */
const ref = (u: { txHash: string; outputIndex: number }) =>
  `${u.txHash}#${u.outputIndex}`;

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

/** The names of a plan's steps */
const names = (plan: TxPlan) => plan.steps.map((step) => step.name);

/** The calls of a provider, all methods together */
const allCalls = (calls: Record<string, number>) =>
  Object.values(calls).reduce((sum, n) => sum + n, 0);

/** A second payer, funded: the plan's payer cannot sign its steps */
const secondPayer = async (emulator: TxEmulator) => {
  const other = await walletOf(1);
  const address = (await other.getChangeAddress())!;
  emulator.fund(address, { lovelace: 50n * ADA });
  return { other, address };
};

/**
 * A plan whose step `a` (of the payer) is final and whose step `x`, of a second payer, is left
 * unsigned: the plan is `pending`
 */
const pendingAfterFinal = async (
  ctx: Awaited<ReturnType<typeof stepSetup>>,
  a: Parameters<TxPlan["add"]>[0][string],
) => {
  const { other } = await secondPayer(ctx.emulator);
  const plan = await ctx.builder.plan(
    { a, x: { parts: payTo(dave, 2n * ADA), payer: other } },
    { payer: ctx.wallet },
  );
  const error = await caught(plan.run());
  expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
  expect(statuses(plan)).toEqual({ a: "final", x: "built" });
  expect(plan.status).toBe("pending");
  return { plan, other };
};

/** Waits real time */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const expectSteps = (error: unknown) => {
  expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
  expect((error as TxBuildError).details).toMatchObject({ option: "steps" });
};

describe("an added step", () => {
  it("adds a step on a step that was sent and is not in a block", async () => {
    const { emulator, builder, wallet, address } = await stepSetup("scalus");
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    const held = swallowing();
    await plan.run({ submitter: held, waitFor: "sent" });
    const recordedA = plan.toJSON().steps[0];
    const returned = await plan.add({ b: payTo(bob, 3n * ADA) });
    expect(returned).toBe(plan);
    expect(names(plan)).toEqual(["a", "b"]);
    const a = plan.step("a");
    const b = plan.step("b");
    // The read still lists what a spends: b spends the change of a alone
    expect(b.standsOn).toEqual(["a"]);
    expect(b.inputs.map(ref)).toEqual(
      a.change.filter((o) => o.address === address).map(ref),
    );
    expect(plan.toJSON().steps[0]).toStrictEqual(recordedA);
    expect(plan.toJSON().steps[1]!.added).toBe(true);
    expect(statuses(plan)).toEqual({ a: "sent", b: "built" });

    // The ledger keeps the order: b is refused before a, and taken after it
    await plan.sign();
    const bytes = plan.step("b").signedTx!;
    await expect(emulator.submitTx(bytes)).rejects.toThrow();
    await emulator.submitTx(held.calls[0]!);
    await emulator.submitTx(bytes);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);

    // A payment the change of a does not cover: the step selects, and never what a spends
    {
      const { builder, wallet, address } = await stepSetup("scalus", {
        funds: [1000n * ADA, 30n * ADA],
      });
      const plan = await builder.plan(
        { a: payTo(alice, 5n * ADA) },
        { payer: wallet, canSelect: (u) => u.value.lovelace !== 30n * ADA },
      );
      await plan.run({ submitter: swallowing(), waitFor: "sent" });
      await plan.add({ b: payTo(bob, 1010n * ADA) });
      const a = plan.step("a");
      const b = plan.step("b");
      const spent = new Set(a.inputs.map(ref));
      expect(b.inputs.some((input) => spent.has(ref(input)))).toBe(false);
      expect(b.inputs.map(ref)).toEqual(
        expect.arrayContaining(
          a.change.filter((o) => o.address === address).map(ref),
        ),
      );
      expect(b.inputs.some((input) => input.value.lovelace === 30n * ADA)).toBe(
        true,
      );
      expect(b.standsOn).toEqual(["a"]);
    }
  });

  it("does not spend twice an output of a landed step that the payer's read and the plan both show", async () => {
    // a and b in a block, not final
    {
      const { emulator, builder, wallet } = await stepSetup("scalus", {
        builder: { planDefaults: { ...FAST, confirmations: 3 } },
      });
      const plan = await builder.plan(
        { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
        { payer: wallet },
      );
      await plan.run();
      expect(statuses(plan)).toEqual({ a: "included", b: "included" });
      await plan.add({ c: payTo(carol, 600n * ADA) });
      const [a, b, c] = plan.steps;
      expect(c!.inputs.map(ref)).toEqual(b!.change.map(ref));
      const spent = new Set([...a!.inputs, ...b!.inputs].map(ref));
      expect(c!.inputs.some((input) => spent.has(ref(input)))).toBe(false);
      expect(c!.standsOn).toEqual(["b"]);
      await plan.run();
      advance(emulator, 3);
      await plan.refresh();
      expect(plan.status).toBe("final");
      expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
      expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
      expect(paidTo(emulator, carol)).toEqual([600n * ADA]);
    }
    // a and b final, the plan pending by a step of a second payer left unsigned
    {
      const ctx = await stepSetup("scalus");
      const { emulator, builder, wallet } = ctx;
      const { other } = await secondPayer(emulator);
      const plan = await builder.plan(
        {
          a: payTo(alice, 5n * ADA),
          b: payTo(bob, 3n * ADA),
          x: { parts: payTo(dave, 2n * ADA), payer: other },
        },
        { payer: wallet },
      );
      await caught(plan.run());
      expect(statuses(plan)).toEqual({ a: "final", b: "final", x: "built" });
      await plan.add({ c: payTo(carol, 600n * ADA) });
      const [a, b, , c] = plan.steps;
      expect(c!.inputs.map(ref)).toEqual(b!.change.map(ref));
      const spent = new Set([...a!.inputs, ...b!.inputs].map(ref));
      expect(c!.inputs.some((input) => spent.has(ref(input)))).toBe(false);
      // A final step is on chain: the added step stands on what it spends of it, and on no order
      expect(c!.standsOn).toEqual(["b"]);
      await plan.run({ signers: [wallet, other] });
      expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
      expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
      expect(paidTo(emulator, carol)).toEqual([600n * ADA]);
      expect(paidTo(emulator, dave)).toEqual([2n * ADA]);
    }
  });

  it("takes of a final step what the payer's read shows, and never what it spent", async () => {
    // A read that lags behind the chain still lists what a spent
    {
      const ctx = await stepSetup("scalus");
      const { emulator, provider } = ctx;
      const before = emulator.fork();
      const { plan } = await pendingAfterFinal(ctx, payTo(alice, 5n * ADA));
      provider.control.hooks.fetchAddressUTxOs = (_, address: string) =>
        before.fetchAddressUTxOs(address);
      const error = await caught(plan.add({ c: payTo(carol, 3n * ADA) }));
      expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
      expect(error.message.startsWith('step "c": ')).toBe(true);
      expect(names(plan)).toEqual(["a", "x"]);
      // Caught up: the change of a, from the read
      delete provider.control.hooks.fetchAddressUTxOs;
      await plan.add({ c: payTo(carol, 3n * ADA) });
      const a = plan.step("a");
      expect(plan.step("c").inputs.map(ref)).toEqual(a.change.map(ref));
      expect(plan.step("c").standsOn).toEqual(["a"]);
      // A final step is no transaction of after of the step that spends what it left
      expect(plan.toJSON().steps[2]!.after).toBeUndefined();
      expect(plan.toJSON().steps[2]!.expirySource).toBeUndefined();
    }
    // The change of a spent outside the plan: what that left
    {
      const ctx = await stepSetup("scalus");
      const { emulator, builder, wallet, address } = ctx;
      const { plan } = await pendingAfterFinal(ctx, payTo(alice, 5n * ADA));
      const outside = await builder.build(payTo(bob, 10n * ADA), {
        payer: wallet,
      });
      expect(outside.inputs.map(ref)).toEqual(plan.step("a").change.map(ref));
      await emulator.submitTx(await wallet.signTx(outside.tx));
      await plan.add({ c: payTo(carol, 3n * ADA) });
      const c = plan.step("c");
      expect(c.inputs.map(ref)).toEqual(
        outside.change.filter((o) => o.address === address).map(ref),
      );
      expect(c.standsOn).toEqual([]);
    }
  });

  it("ends an added step at the tip of the call plus the plan's ttlMs, and keeps an end its parts give", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus");
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    const { ttlMs } = plan.toJSON().deadlines;
    const first = plan.until!;
    advance(emulator, 300);
    const tipMs = builder.timeAt(emulator.slot);
    const given = builder.timeAt(emulator.slot + 5_000);
    await plan.add({
      b: payTo(bob, 3n * ADA),
      c: [payTo(carol, 2n * ADA), validity({ until: given })],
    });
    expect(plan.step("b").validity!.until).toBe(tipMs + ttlMs);
    expect(plan.step("b").validity!.until).toBeGreaterThan(first);
    expect(plan.step("c").validity!.until).toBe(given);
    expect(plan.until).toBe(given);
  });

  it("fills a link to a recorded step from its transaction, final or not", async () => {
    for (const status of ["sent", "final"] as const) {
      const ctx = await stepSetup("scalus");
      const { builder, wallet, address } = ctx;
      const a = payTo(address, 5n * ADA, "x");
      let plan: TxPlan;
      if (status === "final") plan = (await pendingAfterFinal(ctx, a)).plan;
      else {
        plan = await builder.plan({ a }, { payer: wallet });
        await plan.run({ submitter: swallowing(), waitFor: "sent" });
      }
      expect(plan.step("a").status).toBe(status);
      await plan.add({
        b: [
          spend.pubKey({ utxo: { step: "a", output: "x" } }),
          payTo(bob, 3n * ADA),
        ],
      });
      const x = plan.step("a").outputs.find((o) => o.label === "x")!;
      expect(plan.step("b").inputs.map(ref)).toContain(ref(x));
      expect(plan.step("b").standsOn).toEqual(["a"]);
    }

    const { builder, wallet, provider } = await stepSetup("scalus");
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet },
    );
    // The change of a, which b spends
    const taken = await caught(
      plan.add({
        c: [
          spend.pubKey({ utxo: { step: "a", change: true } }),
          payTo(carol, 2n * ADA),
        ],
      }),
    );
    expectSteps(taken);
    expect(taken.message).toMatch(/step "c"/);
    expect(taken.message).toMatch(/step "b" spends/);
    // A step the plan does not have: refused before any request
    const calls = allCalls(provider.control.calls);
    const unknown = await caught(
      plan.add({
        c: [
          spend.pubKey({ utxo: { step: "z", output: 0 } }),
          payTo(carol, 2n * ADA),
        ],
      }),
    );
    expectSteps(unknown);
    expect(unknown.message).toMatch(/which the plan does not have/);
    expect(allCalls(provider.control.calls)).toBe(calls);
    expect(names(plan)).toEqual(["a", "b"]);
  });

  it("refuses a step that cannot stand on the last step of its payer, and takes it once that step is final", async () => {
    const ctx = await stepSetup("scalus");
    const { emulator, builder, wallet, address } = ctx;
    const { other } = await secondPayer(emulator);
    const plan = await builder.plan(
      {
        a: { parts: payTo(alice, 5n * ADA), sendAllTo: carol },
        x: { parts: payTo(dave, 2n * ADA), payer: other },
      },
      { payer: wallet },
    );
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const error = await caught(plan.add({ b: payTo(bob, 3n * ADA) }));
    expectSteps(error);
    expect(error.message).toMatch(/step "b" cannot stand on step "a"/);
    expect(error.message).toMatch(/no change/);
    expect(names(plan)).toEqual(["a", "x"]);

    // a final, the plan pending by x; the payer funded again
    await caught(plan.run());
    expect(statuses(plan)).toEqual({ a: "final", x: "built" });
    emulator.fund(address, { lovelace: 50n * ADA });
    await plan.add({ b: payTo(bob, 3n * ADA) });
    expect(plan.step("b").standsOn).toEqual([]);
  });

  it("is paid by the plan's payer the object holds, else by the step's own", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      funds: [1000n * ADA, 20n * ADA],
    });
    const { other, address: otherAddress } = await secondPayer(emulator);
    const notTwenty = (u: { value: { lovelace: bigint } }) =>
      u.value.lovelace !== 20n * ADA;
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet, extraKeyWitnesses: 1, canSelect: notTwenty },
    );
    expect(plan.step("a").inputs.every(notTwenty)).toBe(true);
    await plan.run({ submitter: swallowing(), waitFor: "sent" });

    // Resumed without a payer, and with another wallet: no UTxO is read
    const reads = () => provider.control.count("fetchAddressUTxOs");
    const before = reads();
    for (const resumed of [
      await builder.resume(plan.toJSON()),
      await builder.resume(plan.toJSON(), { payer: other }),
    ]) {
      const error = await caught(resumed.add({ b: payTo(bob, 3n * ADA) }));
      expect(TxBuildError.is(error, "MISSING_PAYER")).toBe(true);
      expect(error.message).toMatch(/step "b"/);
      expect(names(resumed)).toEqual(["a"]);
    }
    expect(reads()).toBe(before);

    // A step with its own payer: built on that payer, its change address recorded, standing on
    // that payer's last step alone
    const resumed = await builder.resume(plan.toJSON());
    await resumed.add({ b: { parts: payTo(bob, 3n * ADA), payer: other } });
    await resumed.add({ c: { parts: payTo(carol, 2n * ADA), payer: other } });
    const b = resumed.step("b");
    expect(b.standsOn).toEqual([]);
    expect(b.inputs.every((input) => input.address === otherAddress)).toBe(
      true,
    );
    expect(resumed.toJSON().steps[1]!.given!.options).toEqual({
      changeAddress: otherAddress,
    });
    expect(resumed.step("c").standsOn).toEqual(["b"]);
    // The plan's extraKeyWitnesses applies to an added step
    expect(resumed.toJSON().steps[1]!.tx.extraKeyWitnesses).toBe(1);

    // canSelect of builder.plan does not apply to an added step; a step's own does
    const refused = await caught(
      plan.add({ d: { parts: payTo(bob, 1000n * ADA), canSelect: notTwenty } }),
    );
    expect(TxBuildError.is(refused, "INSUFFICIENT_FUNDS")).toBe(true);
    expect(names(plan)).toEqual(["a"]);
    await plan.add({ d: payTo(bob, 1000n * ADA) });
    expect(plan.step("d").inputs.some((input) => !notTwenty(input))).toBe(true);
    expect(plan.toJSON().steps[1]!.tx.extraKeyWitnesses).toBe(1);
  });

  it("refuses a step on the change of a step in a block that the payer's read does not list", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    await plan.run({ submitter: forwarding(emulator) });
    expect(plan.step("a").status).toBe("included");
    // The wallet spends the change of a outside the plan
    const change = plan.step("a").change[0]!;
    const outside = await builder.build(
      [spend.pubKey({ utxo: change }), payTo(bob, 1n * ADA)],
      { payer: wallet },
    );
    await emulator.submitTx(await wallet.signTx(outside.tx));
    const error = await caught(plan.add({ c: payTo(carol, 2n * ADA) }));
    expectSteps(error);
    expect(error.message).toMatch(
      /step "c" cannot stand on step "a", the step before it of the same payer/,
    );
    expect(error.message).toMatch(
      /the change of step "a" is not in the payer's read/,
    );
    expect(error.message).toMatch(
      /spent outside the plan, or the read is behind/,
    );
    expect(error.message).toMatch(/The same call again later tells/);
    expect(names(plan)).toEqual(["a"]);
    expect(plan.toJSON().steps).toHaveLength(1);
  });

  it("refuses a payer that answers two change addresses in one call, and builds nothing", async () => {
    for (const step of ["sent", "included"] as const) {
      const { emulator, builder, wallet, address } = await stepSetup("scalus", {
        builder: { planDefaults: { ...FAST, confirmations: 3 } },
      });
      const plan = await builder.plan(
        { a: payTo(alice, 5n * ADA) },
        { payer: wallet },
      );
      if (step === "sent")
        await plan.run({ submitter: swallowing(), waitFor: "sent" });
      else await plan.run({ submitter: forwarding(emulator) });
      expect(plan.step("a").status).toBe(step);
      // A wallet whose answers alternate: the plan's address, then another one
      let calls = 0;
      const answers = (addresses: readonly string[]) => ({
        getChangeAddress: async () => addresses[calls++ % addresses.length]!,
        getUtxos: () => emulator.fetchAddressUTxOs(address),
        getNetworkId: () => wallet.getNetworkId(),
        signTx: (tx: string, partial?: boolean) => wallet.signTx(tx, partial),
      });
      const rotating = await builder.resume(plan.toJSON(), {
        payer: answers([address, carol]) as never,
      });
      const error = await caught(rotating.add({ b: payTo(bob, 3n * ADA) }));
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.details).toEqual({
        option: "payer",
        value: "object",
        allowed: expect.stringMatching(/one change address/),
      });
      expect(error.message).toMatch(/two change addresses within one call/);
      expect(error.message).toMatch(/snapshot \{ changeAddress, utxos \}/);
      expect(error.message).not.toContain(address);
      expect(error.message).not.toContain(carol);
      expect(names(rotating)).toEqual(["a"]);
      expect(rotating.toJSON().steps).toHaveLength(1);
      // A step's own payer is held to the same
      calls = 0;
      const own = await caught(
        plan.add({
          b: {
            parts: payTo(bob, 3n * ADA),
            payer: answers([address, carol]) as never,
          },
        }),
      );
      expect(TxBuildError.is(own, "INVALID_OPTION")).toBe(true);
      expect(own.details.option).toBe("payer");
      expect(names(plan)).toEqual(["a"]);
      // A wallet that always answers one address is not affected
      calls = 0;
      const steady = await builder.resume(plan.toJSON(), {
        payer: answers([address]) as never,
      });
      await steady.add({ b: payTo(bob, 3n * ADA) });
      expect(steady.step("b").standsOn).toEqual(["a"]);
    }
  });

  it("looks first, and is refused on a plan that does not go on", async () => {
    // A step past its end and the margin, which the look of add shows expired
    {
      const { emulator, provider, builder, wallet } = await stepSetup("scalus");
      const plan = await builder.plan(
        { a: payTo(alice, 5n * ADA) },
        { payer: wallet, ttlMs: 60_000 },
      );
      await plan.run({ submitter: swallowing(), waitFor: "sent" });
      advance(emulator, 120);
      const reads = provider.control.count("fetchAddressUTxOs");
      const error = await caught(plan.add({ b: payTo(bob, 3n * ADA) }));
      expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
      expect(reasonOf(error)).toBe("stopped");
      expect(plan.step("a").status).toBe("expired");
      expect(names(plan)).toEqual(["a"]);
      expect(provider.control.count("fetchAddressUTxOs")).toBe(reads);
    }
    // Stopped, and final
    {
      const { provider, builder, wallet } = await stepSetup("scalus");
      // Another transaction than that of the final plan, which is built on the same UTxO
      const stopped = await builder.plan(
        { a: payTo(alice, 6n * ADA) },
        { payer: wallet },
      );
      await stopped.stop();
      const final = await builder.plan(
        { a: payTo(alice, 5n * ADA) },
        { payer: wallet },
      );
      await final.run();
      expect(final.status).toBe("final");
      const reads = provider.control.count("fetchAddressUTxOs");
      const onStopped = await caught(stopped.add({ b: payTo(bob, 3n * ADA) }));
      expect(TxPlanError.is(onStopped, "INVALID_STATE")).toBe(true);
      expect(reasonOf(onStopped)).toBe("stopped");
      const onFinal = await caught(final.add({ b: payTo(bob, 3n * ADA) }));
      expect(TxPlanError.is(onFinal, "INVALID_STATE")).toBe(true);
      expect(reasonOf(onFinal)).toBe("final");
      expect(onFinal.message).toMatch(/final/);
      expect(provider.control.count("fetchAddressUTxOs")).toBe(reads);
      expect(names(stopped)).toEqual(["a"]);
      expect(names(final)).toEqual(["a"]);
    }
  });

  it("the same call again builds nothing", async () => {
    const { provider, builder, wallet } = await stepSetup("scalus");
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    await plan.add({ b: payTo(bob, 3n * ADA) });
    const hash = plan.step("b").txHash;
    const asked = () =>
      provider.control.count(
        "fetchAddressUTxOs",
        "fetchLatestBlock",
        "fetchTxInfo",
      );
    const again = async (on: TxPlan) => {
      const calls = asked();
      const rev = on.toJSON().rev;
      expect(await on.add({ b: payTo(bob, 3n * ADA) })).toBe(on);
      expect(asked()).toBe(calls);
      expect(on.toJSON().rev).toBe(rev);
      expect(names(on)).toEqual(["a", "b"]);
      expect(on.step("b").txHash).toBe(hash);
    };
    await again(plan);
    await again(await builder.resume(plan.toJSON()));
    await plan.run();
    expect(plan.status).toBe("final");
    await again(plan);

    // Other parts under a name of the plan, and steps only some of which it has
    const other = await caught(plan.add({ b: payTo(bob, 4n * ADA) }));
    expectSteps(other);
    expect(other.message).toMatch(/"b" with other parts or options/);
    const some = await caught(
      plan.add({ b: payTo(bob, 3n * ADA), c: payTo(carol, 2n * ADA) }),
    );
    expectSteps(some);
    expect(some.message).toMatch(/"b" and not "c"/);
    const pending = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    await pending.add({ b: payTo(bob, 3n * ADA) });
    expectSteps(
      await caught(
        pending.add({ b: { parts: payTo(bob, 3n * ADA), fee: 300_000n } }),
      ),
    );
  });

  it("is refused on a builder that holds parts from add, which resuming on one that holds none mends", async () => {
    const { builder, wallet } = await stepSetup("scalus");
    const holding = builder.add(payTo(carol, 1n * ADA));
    const plan = await holding.plan([payTo(alice, 5n * ADA)], {
      payer: wallet,
    });
    for (const on of [
      plan,
      await holding.resume(plan.toJSON(), { payer: wallet }),
    ]) {
      const error = await caught(on.add({ b: payTo(bob, 3n * ADA) }));
      expectSteps(error);
      expect(error.message).toMatch(
        /steps added to a plan are built without the parts a builder holds; resume the plan on a builder that holds none/,
      );
      expect(error.message).not.toMatch(/one list of parts/);
      expect(error.details.allowed).toBe(
        "an object of named steps, on a builder that holds no parts from add",
      );
      expect(names(on)).toEqual(["main"]);
    }
    const resumed = await builder.resume(plan.toJSON(), { payer: wallet });
    await resumed.add({ b: payTo(bob, 3n * ADA) });
    expect(names(resumed)).toEqual(["main", "b"]);
  });

  it("refuses with no request to the provider", async () => {
    const { provider, builder, wallet } = await stepSetup("scalus");
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    const built = await builder.build(payTo(bob, 1n * ADA), { payer: wallet });
    const secret = "ed25519_sk1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_STEPS }, (_, i) => [
        `s${i}`,
        payTo(bob, 1n * ADA),
      ]),
    );
    const calls = allCalls(provider.control.calls);
    const cases: [unknown, unknown, string][] = [
      [[payTo(bob, 1n * ADA)], undefined, "object"],
      [payTo(bob, 1n * ADA), undefined, "object"],
      [secret, undefined, "string"],
      [built, undefined, "object"],
      [{ b: secret }, undefined, "string"],
      [{ b: built }, undefined, "object"],
      [{ "1": payTo(bob, 1n * ADA) }, undefined, ""],
      [{ "consolidate-1": payTo(bob, 1n * ADA) }, undefined, ""],
      [{ "": payTo(bob, 1n * ADA) }, undefined, ""],
      [{}, undefined, "object"],
      [tooMany, undefined, ""],
      [{ b: { parts: payTo(bob, 1n * ADA), note: secret } }, undefined, ""],
    ];
    for (const [steps, options, type] of cases) {
      const error = await caught(plan.add(steps as never, options as never));
      expectSteps(error);
      if (type !== "") expect(error.details.value).toBe(type);
      expect(error.message).not.toContain(secret);
      expect(JSON.stringify(error.details)).not.toContain(secret);
    }
    const tooManyMessage = (await caught(plan.add(tooMany))).message;
    expect(tooManyMessage).toMatch(/at most 32 steps: it has 1, and 32/);
    for (const options of [
      { signal: secret },
      { signal: new AbortController().signal, note: secret },
      secret,
    ]) {
      const error = await caught(
        plan.add({ b: payTo(bob, 1n * ADA) }, options as never),
      );
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.message).not.toContain(secret);
      expect(JSON.stringify(error.details)).not.toContain(secret);
    }
    expect(allCalls(provider.control.calls)).toBe(calls);
    expect(names(plan)).toEqual(["a"]);
  });
});

describe("a plan that takes steps", () => {
  it("a run() that is going sends an added step in its turn", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    const submitter = forwarding(emulator);
    let done = false;
    const running = plan
      .run({ waitFor: "final", submitter, timeoutMs: 30_000 })
      .finally(() => {
        done = true;
      });
    for (let i = 0; i < 500 && plan.step("a").status !== "included"; i++)
      await sleep(5);
    expect(plan.step("a").status).toBe("included");
    await plan.add({ b: payTo(bob, 3n * ADA) });
    for (let i = 0; i < 500 && !done; i++) {
      advance(emulator, 1);
      await sleep(20);
    }
    await running;
    expect(statuses(plan)).toEqual({ a: "final", b: "final" });
    const hashes: string[] = await Promise.all(
      submitter.calls.map((tx) => hashOf(tx)),
    );
    const b = plan.step("b");
    expect(hashes.filter((hash) => hash === b.txHash)).toHaveLength(1);
    expect(submitter.calls[hashes.indexOf(b.txHash)]).toBe(b.signedTx);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
  });

  it("owes the probe again after an add", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
      hooks: {
        fetchTxInfo: async (forward, hash: string) => {
          const { validContract: _valid, ...info } = await forward(hash);
          return info;
        },
      },
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    await plan.run();
    expect(statuses(plan)).toEqual({ a: "included" });
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10n * ADA,
    });
    await plan.add({
      b: [
        spend.plutus({
          utxo: locked,
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        payTo(bob, 4n * ADA),
      ],
    });
    const sent = provider.control.count("submitTx");
    const error = await caught(plan.run());
    expect(TxPlanError.is(error, "CANNOT_OBSERVE")).toBe(true);
    expect(reasonOf(error)).toBe("noValidity");
    expect(provider.control.count("submitTx")).toBe(sent);
    expect(plan.step("b").status).toBe("signed");
  });
});
