import type { TxEmulator } from "@meshsdk/tx-emulator";
import type { MeshWallet } from "@meshsdk/wallet";
import { mConStr0 } from "@meshsdk/core";

import type {
  BuildEvent,
  StoredTxPlanJSON,
  TxPlan,
} from "../../../src/tx-builder";
import type { Fault, StoreFault } from "./fault-util";
import { output, spend, validity } from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import { ref } from "../utxo-util";
import { codeOf, Process, runStep, World } from "./fault-util";
import {
  advance,
  caught,
  FAST,
  forwarding,
  hashOf,
  reasonOf,
  submitterOf,
  walletOf as walletOfIndex,
} from "./plan-emulator-util";
import { seeded } from "./plan-util";
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
import { holdSave, storeSetup, watchStore } from "./store-util";

// A plan made in place of another on a builder with a store: two processes that replace one
// plan at once, a crash after the mark and after the first record, a store that answers with
// the record before the mark, a call that throws, a record that moves under the build, and a
// process that dies at any request of the call.

/** How many outputs of exactly this amount an address holds */
const times = (emulator: TxEmulator, address: string, lovelace: bigint) =>
  paidTo(emulator, address).filter((each) => each === lovelace).length;

/** A relay that passes bytes on to the chain, but keeps those `hold` picks and answers */
const relayOf = (emulator: TxEmulator, hold: (txHash: string) => boolean) => {
  const kept: string[] = [];
  const submitter = submitterOf(async (tx) => {
    const txHash = await hashOf(tx);
    if (!hold(txHash)) return emulator.submitTx(tx);
    if (!kept.includes(tx)) kept.push(tx);
    return txHash;
  });
  return Object.assign(submitter, { kept });
};

const names = (plan: TxPlan) => plan.steps.map((step) => step.name);

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

/** A wallet that counts the bodies it is handed */
const counting = (wallet: MeshWallet) => {
  const handed: string[] = [];
  const signer = new Proxy(wallet, {
    get(target, name, receiver) {
      if (name === "signTx")
        return (tx: string, partial?: boolean) => {
          handed.push(tx);
          return target.signTx(tx, partial);
        };
      const value = Reflect.get(target, name, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as MeshWallet;
  return { signer, handed };
};

/**
 * A plan of three payments on a store: `a` final, `b` sent and held by a relay, `c` signed; a
 * slot on, so that a step built now is no old one byte for byte
 */
const stuck = async (
  options: Parameters<typeof storeSetup>[0] = {
    funds: [100n * ADA, 50n * ADA],
  },
) => {
  const ctx = await storeSetup(options);
  const old = await ctx.builder.plan(
    {
      a: payTo(alice, 11n * ADA),
      b: payTo(bob, 12n * ADA),
      c: payTo(carol, 13n * ADA),
    },
    { id: "order", payer: ctx.wallet },
  );
  await old.sign();
  const bHash = old.step("b").txHash;
  const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
  await caught(old.run({ submitter: relay, timeoutMs: 300 }));
  expect(old.steps.map((step) => step.status)).toEqual([
    "final",
    "sent",
    "signed",
  ]);
  advance(ctx.emulator, 1);
  return { ...ctx, old, held: relay.kept[0]! };
};

/** Each payment made once; with `atMost`, none made twice */
const paidOnce = (emulator: TxEmulator, atMost = false) => {
  for (const [address, lovelace] of [
    [alice, 11n * ADA],
    [bob, 12n * ADA],
    [carol, 13n * ADA],
  ] as const)
    if (atMost)
      expect(times(emulator, address, lovelace)).toBeLessThanOrEqual(1);
    else expect(times(emulator, address, lovelace)).toBe(1);
};

describe("a plan in place of another, on a store", () => {
  it("add tells NO_SHARED_INPUT only when its steps are recorded", async () => {
    const { emulator, store, wallet, address, builder, provider, instance } =
      await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
    const other = await walletOfIndex(1);
    emulator.fund((await other.getChangeAddress())!, { lovelace: 50n * ADA });
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const relay = submitterOf(async (tx) => hashOf(tx));
    await old.run({ waitFor: "sent", submitter: relay });
    advance(emulator, 1);
    const next = await old.replan({ id: "i1", ttlMs: 3_600_000 });
    // The old a was never on chain: past its end it is dead
    advance(emulator, 700);
    await next.refresh();
    const events: BuildEvent[] = [];
    const told = () =>
      events.filter(
        (event) => event.type === "warning" && event.code === "NO_SHARED_INPUT",
      );
    const resumed = await builder.resume("i1", {
      payer: wallet,
      trace: (event) => void events.push(event),
    });
    store.hooks.save = async (forward, json, rev) => {
      if (json.id === "i1" && json.steps.length > 1) throw new Error("down");
      return forward(json, rev);
    };
    const failed = await caught(
      resumed.add({ x: { parts: payTo(dave, 2n * ADA), payer: other } }),
    );
    expect(failed.code).toBe("STORE_FAILED");
    expect(told()).toEqual([]);
    delete store.hooks.save;
    // Another object adds the same step while this one reads its payers: this one's write finds
    // it recorded, writes nothing, and tells nothing
    const second = instance();
    const by = await second.builder.resume("i1", { payer: wallet });
    let once = true;
    provider.control.hooks.fetchAddressUTxOs = async (forward, at: string) => {
      if (once) {
        once = false;
        await by.add({ x: { parts: payTo(dave, 2n * ADA), payer: other } });
      }
      return forward(at);
    };
    await resumed.add({ x: { parts: payTo(dave, 2n * ADA), payer: other } });
    expect(names(resumed)).toEqual(["a", "x"]);
    expect(told()).toEqual([]);
    void address;
  });

  it("an old transaction that pays 17 addresses: its entry keeps 16 and counts one more, the record reads back, and add tells it as unread", async () => {
    const { emulator, wallet, builder } = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
    });
    const other = await walletOfIndex(1);
    emulator.fund((await other.getChangeAddress())!, { lovelace: 50n * ADA });
    // 15 other addresses, alice, and the change: 17
    const others = Array.from({ length: 15 }, (_, i) => baseAddress(30 + i));
    const old = await builder.plan(
      {
        a: [
          ...others.map((at) => payTo(at, 2n * ADA)),
          payTo(alice, 11n * ADA),
        ],
      },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const aHash = old.step("a").txHash;
    await old.run({
      waitFor: "sent",
      submitter: submitterOf(async (tx) => hashOf(tx)),
    });
    advance(emulator, 1);
    await old.replan({ id: "i1", ttlMs: 3_600_000 });
    // The record of the new plan reads back from the store
    const events: BuildEvent[] = [];
    const resumed = await builder.resume("i1", {
      payer: wallet,
      trace: (event) => void events.push(event),
    });
    const entry = resumed.toJSON().before!.open[0]!;
    expect(entry.pays).toEqual([...others, alice]);
    expect(entry.paysMore).toBe(1);
    // A record written before entries counted what they could not keep still reads
    const { paysMore: _, ...older } = entry;
    const json = resumed.toJSON();
    expect(
      (
        await builder.resume(
          {
            ...json,
            id: "i1-copy",
            before: { ...json.before!, open: [older] },
          },
          { payer: wallet },
        )
      ).toJSON().before!.open[0]!.paysMore,
    ).toBeUndefined();
    // The old a was never on chain: past its end it is dead
    advance(emulator, 700);
    await resumed.refresh();
    await resumed.add({ x: { parts: payTo(dave, 2n * ADA), payer: other } });
    expect(
      events.filter(
        (event) => event.type === "warning" && event.code === "NO_SHARED_INPUT",
      ),
    ).toEqual([
      {
        type: "warning",
        code: "NO_SHARED_INPUT",
        step: "a",
        txHash: aHash,
        unread: 1,
      },
    ]);
  });

  it("a repeat with other steps is PLAN_EXISTS", async () => {
    const { old } = await stuck();
    await old.replan({ id: "i1" });
    const error = await caught(
      old.replan({ id: "i1", steps: { b: payTo(bob, 99n * ADA) } }),
    );
    expect(error.code).toBe("PLAN_EXISTS");
  });

  it("a first record refused because another plan took the id: PLAN_EXISTS, not that plan", async () => {
    const { store, builder, wallet, old } = await stuck();
    store.hooks.save = async (forward, json, rev) => {
      if (json.id === "i1" && rev === 0 && json.replaces === "order") {
        delete store.hooks.save;
        await builder.plan(payTo(dave, 2n * ADA), { id: "i1", payer: wallet });
      }
      return forward(json, rev);
    };
    const error = await caught(old.replan({ id: "i1" }));
    expect(error.code).toBe("PLAN_EXISTS");
    // The call looked and built: what it built was not recorded, signed or sent
    expect(error.message).toContain(
      "the steps this call built were not recorded, and none was signed or sent",
    );
    expect((await store.inner.load("i1"))!.replaces).toBeUndefined();
  });

  it("a transaction of the plans before found in a block between the payer's read and the mark: CANNOT_OBSERVE, no mark", async () => {
    const { emulator, provider, store, wallet, instance, old, held } =
      await stuck();
    const next = await old.replan({ id: "i1" });
    const other = await instance().builder.resume("i1", { payer: wallet });
    // After the payer's read and before the mark: at the probe of the provider
    let read = false;
    provider.control.hooks.fetchAddressUTxOs = (forward, address: string) => {
      read = true;
      return forward(address);
    };
    provider.control.hooks.fetchLatestBlock = async (forward) => {
      if (read) {
        read = false;
        await emulator.submitTx(held);
        await other.refresh();
      }
      return forward();
    };
    const error = await caught(
      next.replan({ id: "i2", steps: { x: payTo(dave, 2n * ADA) } }),
    );
    expect([error.code, reasonOf(error)]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
    ]);
    expect((await store.inner.load("i1"))!.replacedBy).toBeUndefined();
    expect(await store.inner.load("i2")).toBeUndefined();
  });

  it("two processes replace one plan at once, with two ids: one is recorded, the other call is refused and its id has no record", async () => {
    const { emulator, store, wallet, instance, held } = await stuck();
    const one = instance();
    const two = instance();
    const first = counting(wallet);
    const second = counting(wallet);
    const x = await one.builder.resume("order", { payer: first.signer });
    const y = await two.builder.resume("order", { payer: second.signer });
    // x's mark waits until y has marked the plan and recorded its own
    const gate = holdSave(
      one.store,
      (json) => json.id === "order" && json.replacedBy !== undefined,
    );
    const xCall = caught(x.replan({ id: "i1" }));
    await gate.reached;
    const winner = await y.replan({ id: "i2" });
    gate.open();
    const error = await xCall;
    expect([error.code, reasonOf(error)]).toEqual(["INVALID_STATE", "stopped"]);
    expect((await store.inner.load("order"))!.replacedBy).toBe("i2");
    expect(await store.inner.load("i1")).toBeUndefined();
    expect((await store.inner.load("i2"))!.replaces).toBe("order");
    expect([first.handed, second.handed]).toEqual([[], []]);

    await winner.run();
    expect(winner.status).toBe("final");
    await emulator.submitTx(held).catch(() => undefined);
    paidOnce(emulator);
  });

  it("two processes replace one plan at once, with one id: both return the one record", async () => {
    const { emulator, store, wallet, instance } = await stuck();
    const one = instance();
    const two = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    const y = await two.builder.resume("order", { payer: wallet });
    const gate = holdSave(
      one.store,
      (json) => json.id === "order" && json.replacedBy !== undefined,
    );
    const xCall = x.replan({ id: "i1" });
    await gate.reached;
    const fromY = await y.replan({ id: "i1" });
    gate.open();
    const fromX = await xCall;
    const recorded = (await store.inner.load("i1"))!;
    for (const plan of [fromX, fromY])
      expect(plan.steps.map((step) => step.txHash)).toEqual(
        recorded.steps.map((step) => step.txHash),
      );
    await fromX.run();
    expect(fromX.status).toBe("final");
    paidOnce(emulator);
  });

  it("a crash after the mark: the old plan names a plan the store does not hold, sends nothing, and the same call makes it", async () => {
    const { emulator, store, builder, wallet, instance, old } = await stuck();
    const one = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    // The save of the first record never returns: the process dies there
    let reached = false;
    one.store.hooks.save = (forward, json, rev) => {
      if (json.id !== "i1") return forward(json, rev);
      reached = true;
      return new Promise<boolean>(() => undefined);
    };
    const controller = new AbortController();
    const call = caught(x.replan({ id: "i1", signal: controller.signal }));
    while (!reached) await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    expect((await call).code).toBe("ABORTED");
    expect((await store.inner.load("order"))!.replacedBy).toBe("i1");
    expect((await caught(builder.resume("i1"))).code).toBe("PLAN_NOT_FOUND");
    const submitter = forwarding(emulator);
    const refused = await caught(old.run({ submitter }));
    expect([refused.code, reasonOf(refused)]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    expect(submitter.calls).toEqual([]);

    // The same call from a new builder builds and records it; another id is refused
    const two = instance();
    const y = await two.builder.resume("order", { payer: wallet });
    const made = await y.replan({ id: "i1" });
    expect((await store.inner.load("i1"))!.replaces).toBe("order");
    const other = await caught(y.replan({ id: "i9" }));
    expect([other.code, reasonOf(other)]).toEqual(["INVALID_STATE", "stopped"]);
    expect(await store.inner.load("i9")).toBeUndefined();

    // After the record: the same call returns it and reads no payer
    const three = instance();
    const z = await three.builder.resume("order", { payer: wallet });
    const again = await z.replan({ id: "i1" });
    expect(three.provider.control.count("fetchAddressUTxOs")).toBe(0);
    expect(again.steps.map((step) => step.txHash)).toEqual(
      made.steps.map((step) => step.txHash),
    );
    await again.run();
    expect(again.status).toBe("final");
    paidOnce(emulator);
  });

  it("a store that answers with the record before the mark: a second replan is VERSION_CONFLICT, with no record under its id", async () => {
    const { store, wallet, instance, old } = await stuck();
    const one = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    const before = (await store.inner.load("order"))!;
    await old.replan({ id: "i1" });
    one.store.hooks.load = async (forward, id) =>
      id === "order" ? before : forward(id);
    const error = await caught(x.replan({ id: "i2" }));
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(await store.inner.load("i2")).toBeUndefined();
    expect((await store.inner.load("order"))!.replacedBy).toBe("i1");
  });

  describe("a call that throws marks nothing", () => {
    /** Neither a mark on the old record nor a record under the id */
    const nothing = async (
      store: {
        inner: { load(id: string): Promise<StoredTxPlanJSON | undefined> };
      },
      id: string,
    ) => {
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect((await store.inner.load(id))?.replaces).toBeUndefined();
    };

    it("STILL_LIVE", async () => {
      const { emulator, builder, wallet, address, store } = await storeSetup({
        funds: [100n * ADA],
      });
      const old = await builder.plan(
        { main: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.sign();
      emulator.removeUtxos(old.step("main").inputs.map(ref));
      emulator.fund(address, { lovelace: 50n * ADA });
      await caught(old.run());
      const error = await caught(old.replan({ id: "i1" }));
      expect(error.code).toBe("STILL_LIVE");
      await nothing(store, "i1");
    });

    it("CANNOT_OBSERVE", async () => {
      const { builder, wallet, store, provider } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
        planDefaults: { ...FAST, confirmations: 3 },
      });
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.run({ waitFor: "sent" });
      await old.refresh();
      // a is in a block, and this call's search gives no answer for it: no fact to hold it on
      const aHash = old.step("a").txHash;
      provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
        if (hash.toLowerCase() === aHash) throw new Error("too many requests");
        return forward(hash);
      };
      const error = await caught(old.replan({ id: "i1" }));
      expect([error.code, reasonOf(error)]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
      ]);
      await nothing(store, "i1");
    });

    it("INSUFFICIENT_FUNDS, and an id the store holds", async () => {
      const { builder, wallet, store, old } = await stuck();
      const poor = await caught(
        old.replan({ id: "i1", steps: { b: payTo(bob, 100_000n * ADA) } }),
      );
      expect(poor.code).toBe("INSUFFICIENT_FUNDS");
      await nothing(store, "i1");
      await builder.plan(payTo(dave, 2n * ADA), { id: "taken", payer: wallet });
      const taken = await caught(old.replan({ id: "taken" }));
      expect(taken.code).toBe("PLAN_EXISTS");
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect((await store.inner.load("taken"))!.replaces).toBeUndefined();
    });
  });

  describe("a record that moved under the build", () => {
    it("another object adds a step while the payer is read: CANNOT_OBSERVE, no mark", async () => {
      const { provider, store, wallet, instance, old } = await stuck();
      const other = await instance().builder.resume("order", {
        payer: wallet,
      });
      let once = true;
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        address: string,
      ) => {
        if (once) {
          once = false;
          await other.add({ x: payTo(dave, 2n * ADA) });
        }
        return forward(address);
      };
      const error = await caught(old.replan({ id: "i1" }));
      expect([error.code, reasonOf(error)]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
      ]);
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect(await store.inner.load("i1")).toBeUndefined();
    });

    it("another object finds a step in a block while the payer is read: CANNOT_OBSERVE, no mark", async () => {
      const { emulator, provider, store, wallet, instance, old, held } =
        await stuck();
      const other = await instance().builder.resume("order", {
        payer: wallet,
      });
      let once = true;
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        address: string,
      ) => {
        if (once) {
          once = false;
          await emulator.submitTx(held);
          await other.refresh();
        }
        return forward(address);
      };
      const error = await caught(old.replan({ id: "i1" }));
      expect([error.code, reasonOf(error)]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
      ]);
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect(await store.inner.load("i1")).toBeUndefined();
    });
  });
});

// A process that dies before, and after, each request of one call of `replan`: each call of the
// store, of the provider (the look, the payer's read, the probe) and of the payer. A new process
// makes the same call and runs the new plan to its end; the old bytes a relay held land at a
// drawn moment, by `PLAN_REPLACE_FAULT_SEED`.

const FAULT_SEED = Number(process.env.PLAN_REPLACE_FAULT_SEED ?? 1);

/** The old plan of a world: a final, b sent and held, c signed */
const oldPlanOf = async (world: World) => {
  const maker = new Process();
  const builder = world.builder(maker);
  const old = await builder.plan(
    {
      a: payTo(alice, 11n * ADA),
      b: payTo(bob, 12n * ADA),
      c: payTo(carol, 13n * ADA),
    },
    { id: "order", payer: world.wallet },
  );
  await old.sign();
  await old.run({ waitFor: "sent" });
  await old.refresh();
  world.submitMode = "hold";
  await old.run({ waitFor: "sent" });
  world.submitMode = "forward";
  expect(old.steps.map((step) => step.status)).toEqual([
    "final",
    "sent",
    "signed",
  ]);
  advance(world.emulator, 1);
  return old;
};

/** The calls of one process that resumes the old plan and replaces it, without a fault */
const countCalls = async () => {
  const world = await World.create();
  await oldPlanOf(world);
  const proc = new Process();
  const builder = world.builder(proc);
  const plan = await builder.resume("order", { payer: world.wallet });
  await plan.replan({ id: "order:2" });
  return { store: proc.storeCalls, io: proc.ioCalls };
};

/** One case: a process with this fault, then a new process that carries the plans to the end */
const crashCase = async (fault: Fault, release: number) => {
  const world = await World.create();
  await oldPlanOf(world);
  const proc = new Process(fault);
  const crashed = world.builder(proc);
  const end = await runStep(proc, async () => {
    const plan = await crashed.resume("order", { payer: world.wallet });
    return plan.replan({ id: "order:2" });
  });
  expect({ fault, fired: proc.fired, hung: end.hung === true }).toEqual({
    fault,
    fired: true,
    hung: true,
  });
  const log = [`fault ${JSON.stringify(fault)}`, ...proc.log];
  if (!end.hung && "error" in end) log.push(`the call: ${codeOf(end.error)}`);
  await world.checkObject(undefined, "order", "after the fault");

  // A new process makes the same call and runs the new plan; the held old bytes land at a drawn
  // moment: before it runs, or once it is final
  const fresh = new Process();
  const builder = world.builder(fresh);
  const resumed = await builder.resume("order", { payer: world.wallet });
  let next: TxPlan = await resumed.replan({ id: "order:2" });
  if (release === 0) await world.flush();
  try {
    await next.run({ waitFor: "final" });
  } catch (error) {
    log.push(`order:2 run: ${codeOf(error)}`);
    // The old b landed first: the plan made in place of this one pays what is left
    next = await next.replan({ id: "order:3" });
    await next.run({ waitFor: "final" });
  }
  if (release === 1) await world.flush();
  await world.checkObject(next, next.id!, "at the end");

  // One record names the old plan; each payment is made once
  const named = [];
  for (const id of ["order:2", "order:3"]) {
    const json = await world.inner.load(id);
    if (json?.replaces === "order") named.push(id);
  }
  expect({ log, named }).toEqual({ log, named: ["order:2"] });
  expect({ log, violations: world.violations }).toEqual({
    log,
    violations: [],
  });
  for (const [address, lovelace] of [
    [alice, 11n],
    [bob, 12n],
    [carol, 13n],
  ] as const)
    expect({
      log,
      address,
      paid: times(world.emulator, address, lovelace * ADA),
    }).toEqual({
      log,
      address,
      paid: 1,
    });
};

/**
 * A plan of three payments on a store, with three confirmations: `a` in a block and not final,
 * `b` sent and held by a relay, `c` signed; a slot on. `before`: a fork taken first, the chain
 * of a rollback
 */
const inBlock = async (confirmations = 3) => {
  const ctx = await storeSetup({
    funds: [100n * ADA, 50n * ADA],
    planDefaults: { ...FAST, confirmations },
  });
  const before = ctx.emulator.fork();
  const old = await ctx.builder.plan(
    {
      a: payTo(alice, 11n * ADA),
      b: payTo(bob, 12n * ADA),
      c: payTo(carol, 13n * ADA),
    },
    { id: "order", payer: ctx.wallet },
  );
  await old.sign();
  const bHash = old.step("b").txHash;
  const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
  await caught(old.run({ submitter: relay, timeoutMs: 300 }));
  expect(old.steps.map((step) => step.status)).toEqual([
    "included",
    "sent",
    "signed",
  ]);
  advance(ctx.emulator, 1);
  return { ...ctx, before, old, held: relay.kept[0]! };
};

describe("a plan in place of one whose step is in a block, on a store", () => {
  it("a crash after the mark, then a rollback: the same call builds the step again on an input it shares", async () => {
    const { store, wallet, instance, before, emulator, old } = await inBlock();
    const a = old.step("a");
    const one = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    one.store.hooks.save = (forward, json, rev) => {
      if (json.id === "i1") throw new Error("the process dies here");
      return forward(json, rev);
    };
    const failed = await caught(x.replan({ id: "i1" }));
    expect(failed.code).toBe("STORE_FAILED");
    expect((await store.inner.load("order"))!.replacedBy).toBe("i1");
    expect(await store.inner.load("i1")).toBeUndefined();
    // A rollback: a is in no block of the chain the next process reads
    before.advanceTo({ slot: emulator.slot + 1 });
    const two = instance();
    two.provider.control.target = before;
    const y = await two.builder.resume("order", { payer: wallet });
    const made = await y.replan({ id: "i1" });
    expect(names(made)).toEqual(["a", "b", "c"]);
    expect(made.toJSON().steps.every((step) => step.taken === undefined)).toBe(
      true,
    );
    expect(
      made
        .step("a")
        .inputs.some((input) =>
          a.inputs.some(
            (each) =>
              each.txHash === input.txHash &&
              each.outputIndex === input.outputIndex,
          ),
        ),
    ).toBe(true);
    await made.run({ waitFor: "included" });
    before.advanceTo({ slot: before.slot + 3 });
    await made.refresh();
    expect(made.status).toBe("final");
    expect(
      await before.submitTx(old.step("a").signedTx!).then(
        () => false,
        () => true,
      ),
    ).toBe(true);
    paidOnce(before);
  });

  it("a step in a block rolled back between the payer's read and the mark: CANNOT_OBSERVE, no mark", async () => {
    const { emulator, provider, store, wallet, instance, before, old } =
      await inBlock();
    const one = instance();
    const other = await one.builder.resume("order", { payer: wallet });
    // During the payer's read another object of the old plan sees the rollback
    let once = true;
    provider.control.hooks.fetchAddressUTxOs = async (
      forward,
      address: string,
    ) => {
      if (once) {
        once = false;
        before.advanceTo({ slot: emulator.slot + 1 });
        one.provider.control.target = before;
        await other.refresh();
        expect(other.step("a").status).toBe("sent");
      }
      return forward(address);
    };
    const error = await caught(old.replan({ id: "i1" }));
    expect([error.code, reasonOf(error), error.retryable]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
      true,
    ]);
    expect(error.message).toContain(
      "a step that was in a block is in none now",
    );
    expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
    expect(await store.inner.load("i1")).toBeUndefined();
    paidOnce(emulator, true);
  });

  it("two processes replace one plan at once while a step is in a block, with two ids: one record, the other call refused", async () => {
    const { emulator, store, wallet, instance, held } = await inBlock();
    const one = instance();
    const two = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    const y = await two.builder.resume("order", { payer: wallet });
    const gate = holdSave(
      one.store,
      (json) => json.id === "order" && json.replacedBy !== undefined,
    );
    const xCall = caught(x.replan({ id: "i1" }));
    await gate.reached;
    const winner = await y.replan({ id: "i2" });
    gate.open();
    const error = await xCall;
    expect([error.code, reasonOf(error)]).toEqual(["INVALID_STATE", "stopped"]);
    expect(await store.inner.load("i1")).toBeUndefined();
    const recorded = (await store.inner.load("i2"))!;
    expect(recorded.steps[0]).toMatchObject({ name: "a", taken: true });
    await winner.run({ waitFor: "included" });
    advance(emulator, 3);
    await winner.refresh();
    expect(winner.status).toBe("final");
    await emulator.submitTx(held).catch(() => undefined);
    paidOnce(emulator);
  });

  it("two processes replace one plan at once while a step is in a block, with one id: both return one record, whose first step is taken", async () => {
    const { emulator, store, wallet, instance } = await inBlock();
    const one = instance();
    const two = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    const y = await two.builder.resume("order", { payer: wallet });
    const gate = holdSave(
      one.store,
      (json) => json.id === "order" && json.replacedBy !== undefined,
    );
    const xCall = x.replan({ id: "i1" });
    await gate.reached;
    const fromY = await y.replan({ id: "i1" });
    gate.open();
    const fromX = await xCall;
    const recorded = (await store.inner.load("i1"))!;
    expect(recorded.steps[0]).toMatchObject({ name: "a", taken: true });
    for (const plan of [fromX, fromY])
      expect(plan.steps.map((step) => step.txHash)).toEqual(
        recorded.steps.map((step) => step.txHash),
      );
    await fromX.run({ waitFor: "included" });
    advance(emulator, 3);
    await fromX.refresh();
    expect(fromX.status).toBe("final");
    paidOnce(emulator);
  });

  it("the same call again with steps, while the recorded plan holds a taken step: the recorded plan", async () => {
    const { emulator, wallet, instance, old } = await inBlock();
    const steps = {
      b: [
        spend.pubKey({ utxo: { step: "a", change: true } }),
        payTo(bob, 12n * ADA),
      ],
      c: payTo(carol, 13n * ADA),
    };
    const made = await old.replan({ id: "i1", steps });
    expect(made.toJSON().steps[0]!.taken).toBe(true);
    const hashes = made.steps.map((step) => step.txHash);
    // From another process: the recorded plan, and no payer read
    const one = instance();
    const x = await one.builder.resume("order", { payer: wallet });
    const again = await x.replan({ id: "i1", steps });
    expect(one.provider.control.count("fetchAddressUTxOs")).toBe(0);
    expect(again.steps.map((step) => step.txHash)).toEqual(hashes);
    // With other steps: PLAN_EXISTS
    const other = await caught(
      x.replan({ id: "i1", steps: { b: payTo(bob, 12n * ADA) } }),
    );
    expect(other.code).toBe("PLAN_EXISTS");
    // Also once a is final in the old plan: its link stays a link
    advance(emulator, 3);
    await old.refresh();
    expect(old.step("a").status).toBe("final");
    const two = instance();
    const y = await two.builder.resume("order", { payer: wallet });
    const late = await y.replan({ id: "i1", steps });
    expect(late.steps.map((step) => step.txHash)).toEqual(hashes);
    await late.run({ waitFor: "included" });
    advance(emulator, 3);
    await late.refresh();
    expect(late.status).toBe("final");
    paidOnce(emulator);
  });
});

/**
 * The old plan of a second world, whose depth of final is three blocks: a in a block and not
 * final, b sent and held, c signed; and a fork taken before it, the chain of a rollback
 */
const inBlockPlanOf = async (world: World) => {
  const before = world.emulator.fork();
  const maker = new Process();
  const builder = world.builder(maker);
  const old = await builder.plan(
    {
      a: payTo(alice, 11n * ADA),
      b: payTo(bob, 12n * ADA),
      c: payTo(carol, 13n * ADA),
    },
    { id: "order", payer: world.wallet },
  );
  await old.sign();
  await old.run({ waitFor: "sent" });
  await old.refresh();
  world.submitMode = "hold";
  await old.run({ waitFor: "sent" });
  world.submitMode = "forward";
  expect(old.steps.map((step) => step.status)).toEqual([
    "included",
    "sent",
    "signed",
  ]);
  advance(world.emulator, 1);
  return { old, before };
};

/** The calls of one process that replaces the plan of the second world, without a fault */
const countInBlockCalls = async () => {
  const world = await World.create(undefined, 3);
  await inBlockPlanOf(world);
  const proc = new Process();
  const plan = await world
    .builder(proc)
    .resume("order", { payer: world.wallet });
  const next = await plan.replan({ id: "order:2" });
  expect(next.toJSON().steps[0]!.taken).toBe(true);
  return { store: proc.storeCalls, io: proc.ioCalls };
};

/**
 * One case of the second world: a process with this fault; a rollback of the block of a, or
 * none, by `rollback`; then a new process makes the same call and carries the line to its end
 */
const crashInBlockCase = async (
  fault: Fault,
  rollback: boolean,
  release: number,
) => {
  const world = await World.create(undefined, 3);
  const { before } = await inBlockPlanOf(world);
  const proc = new Process(fault);
  const end = await runStep(proc, async () => {
    const plan = await world
      .builder(proc)
      .resume("order", { payer: world.wallet });
    return plan.replan({ id: "order:2" });
  });
  expect({ fault, fired: proc.fired, hung: end.hung === true }).toEqual({
    fault,
    fired: true,
    hung: true,
  });
  const log = [
    `fault ${JSON.stringify(fault)}, rollback ${rollback}`,
    ...proc.log,
  ];
  if (rollback) {
    before.advanceTo({ slot: world.emulator.slot + 1 });
    world.rollTo(before);
  }
  /** Three blocks on, and a look */
  const deepen = async (plan: TxPlan) => {
    advance(world.emulator, 3);
    await plan.refresh();
  };
  const fresh = new Process();
  const resumed = await world
    .builder(fresh)
    .resume("order", { payer: world.wallet });
  let next: TxPlan = await resumed.replan({ id: "order:2" });
  if (release === 0) await world.flush();
  try {
    await next.run({ waitFor: "included" });
    await deepen(next);
  } catch (error) {
    log.push(`order:2 run: ${codeOf(error)}`);
    // The old b landed first: once it is final the plan in place of this one pays what is left
    await deepen(next);
    next = await next.replan({ id: "order:3" });
    await next.run({ waitFor: "included" });
    await deepen(next);
  }
  if (release === 1) await world.flush();
  expect({ log, status: next.status }).toEqual({ log, status: "final" });
  await world.checkObject(next, next.id!, "at the end");
  const named = [];
  for (const id of ["order:2", "order:3"]) {
    const json = await world.inner.load(id);
    if (json?.replaces === "order") named.push(id);
  }
  expect({ log, named }).toEqual({ log, named: ["order:2"] });
  expect({ log, violations: world.violations }).toEqual({
    log,
    violations: [],
  });
  for (const [address, lovelace] of [
    [alice, 11n],
    [bob, 12n],
    [carol, 13n],
  ] as const)
    expect({
      log,
      address,
      paid: times(world.emulator, address, lovelace * ADA),
    }).toEqual({ log, address, paid: 1 });
};

describe("the same call again, compared by the recorded plan", () => {
  /** Steps that link to the change of a */
  const linked = () => ({
    b: [
      spend.pubKey({ utxo: { step: "a", change: true } }),
      payTo(bob, 12n * ADA),
    ],
    c: payTo(carol, 13n * ADA),
  });
  const settle = (promise: Promise<TxPlan>): Promise<any> =>
    promise.then(
      (plan) => plan,
      (error) => error,
    );

  it("two processes, one id, with steps that link to a: the one that took a writes first, the one that saw a final second; both return the one record", async () => {
    const { emulator, store, wallet, instance } = await inBlock();
    const one = instance();
    const two = instance();
    const taker = await one.builder.resume("order", { payer: wallet });
    const late = await two.builder.resume("order", { payer: wallet });
    const takerGate = holdSave(one.store, (json) => json.id === "i1");
    const takerCall = settle(taker.replan({ id: "i1", steps: linked() }));
    await takerGate.reached;
    advance(emulator, 3);
    const lateGate = holdSave(two.store, (json) => json.id === "i1");
    const lateCall = settle(late.replan({ id: "i1", steps: linked() }));
    await lateGate.reached;
    takerGate.open();
    const first = await takerCall;
    lateGate.open();
    const second = await lateCall;
    const recorded = (await store.inner.load("i1"))!;
    expect(recorded.steps[0]).toMatchObject({ name: "a", taken: true });
    for (const plan of [first, second])
      expect(plan.steps.map((step: { txHash: string }) => step.txHash)).toEqual(
        recorded.steps.map((step) => step.txHash),
      );
    await first.run({ waitFor: "included" });
    advance(emulator, 3);
    await first.refresh();
    expect(first.status).toBe("final");
    paidOnce(emulator);
  });

  it("two processes, one id, with steps that link to a: the one that saw a final writes first, the one that took a second; both return the one record", async () => {
    const { emulator, store, wallet, instance } = await inBlock();
    const one = instance();
    const two = instance();
    const taker = await one.builder.resume("order", { payer: wallet });
    const late = await two.builder.resume("order", { payer: wallet });
    const takerGate = holdSave(one.store, (json) => json.id === "i1");
    const takerCall = settle(taker.replan({ id: "i1", steps: linked() }));
    await takerGate.reached;
    advance(emulator, 3);
    const first = await settle(late.replan({ id: "i1", steps: linked() }));
    takerGate.open();
    const second = await takerCall;
    const recorded = (await store.inner.load("i1"))!;
    expect(recorded.steps.some((step) => step.taken === true)).toBe(false);
    expect(recorded.before!.final).toEqual(["a"]);
    for (const plan of [first, second])
      expect(plan.steps.map((step: { txHash: string }) => step.txHash)).toEqual(
        recorded.steps.map((step) => step.txHash),
      );
    await first.run({ waitFor: "included" });
    advance(emulator, 3);
    await first.refresh();
    expect(first.status).toBe("final");
    paidOnce(emulator);
  });

  it("a repeat after the old step given again under its name landed late and is final in the old plan: the recorded plan", async () => {
    const { emulator, wallet, instance, old, held } = await stuck();
    const steps = () => ({
      b: payTo(bob, 12n * ADA),
      c: [
        spend.pubKey({ utxo: { step: "b", change: true } }),
        payTo(carol, 13n * ADA),
      ],
    });
    const made = await old.replan({ id: "i1", steps: steps() });
    await emulator.submitTx(held);
    await old.refresh();
    expect(old.step("b").status).toBe("final");
    const one = instance();
    const again = await (
      await one.builder.resume("order", { payer: wallet })
    ).replan({ id: "i1", steps: steps() });
    expect(again.steps.map((step) => step.txHash)).toEqual(
      made.steps.map((step) => step.txHash),
    );
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
  });

  it("a repeat with a link to a name the recorded plan neither keeps, holds nor was given: PLAN_EXISTS", async () => {
    const { emulator, old } = await stuck();
    await old.replan({
      id: "i1",
      steps: { b: payTo(bob, 12n * ADA), c: payTo(carol, 13n * ADA) },
    });
    const error = await caught(
      old.replan({
        id: "i1",
        steps: {
          b: payTo(bob, 12n * ADA),
          c: [
            spend.pubKey({ utxo: { step: "z", output: 0 } }),
            payTo(carol, 13n * ADA),
          ],
        },
      }),
    );
    expect(error.code).toBe("PLAN_EXISTS");
    expect(error.message).toContain("nothing was looked at, built or written");
    expect(times(emulator, bob, 12n * ADA)).toBe(0);
  });
});

describe("rules of a taken step", () => {
  it("the mark written already, and another object saw a rollback of a step this call found in a block: CANNOT_OBSERVE, no first record", async () => {
    const { emulator, store, wallet, instance, before } = await inBlock();
    // A call that dies at the first record: the mark is written
    const one = instance();
    one.store.hooks.save = (forward, json, rev) => {
      if (json.id === "i1") throw new Error("the process dies here");
      return forward(json, rev);
    };
    const x = await one.builder.resume("order", { payer: wallet });
    expect((await caught(x.replan({ id: "i1" }))).code).toBe("STORE_FAILED");
    expect((await store.inner.load("order"))!.replacedBy).toBe("i1");
    // The same call from another process; during its payer read a third sees the rollback
    const two = instance();
    const three = instance();
    const y = await two.builder.resume("order", { payer: wallet });
    const z = await three.builder.resume("order", { payer: wallet });
    let once = true;
    two.provider.control.hooks.fetchAddressUTxOs = async (
      forward,
      address: string,
    ) => {
      if (once) {
        once = false;
        before.advanceTo({ slot: emulator.slot + 1 });
        three.provider.control.target = before;
        await z.refresh();
        expect(z.step("a").status).toBe("sent");
      }
      return forward(address);
    };
    const error = await caught(y.replan({ id: "i1" }));
    expect([error.code, reasonOf(error)]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
    ]);
    expect(await store.inner.load("i1")).toBeUndefined();
    paidOnce(emulator, true);
  });

  it("two taken steps, the second on the first: the new plan's record holds what each stands on, and reads back through resume", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 3 },
    });
    const { emulator, builder, wallet } = ctx;
    const old = await builder.plan(
      {
        a: payTo(alice, 11n * ADA),
        b: payTo(bob, 12n * ADA),
        c: payTo(carol, 13n * ADA),
      },
      { id: "order", payer: wallet },
    );
    await old.sign();
    await old.run({ waitFor: "sent" });
    await old.refresh();
    await old.run({ waitFor: "sent" });
    await old.refresh();
    expect(old.steps.map((step) => step.status)).toEqual([
      "included",
      "included",
      "signed",
    ]);
    advance(emulator, 1);
    const next = await old.replan({ id: "i1" });
    expect(next.toJSON().steps.map((step) => step.taken)).toEqual([
      true,
      true,
      undefined,
    ]);
    expect(next.step("b").standsOn).toEqual(["a"]);
    const read = await builder.resume("i1", { payer: wallet });
    expect(read.steps.map((step) => [step.name, step.standsOn])).toEqual([
      ["a", []],
      ["b", ["a"]],
      ["c", ["b"]],
    ]);
    await read.run({ waitFor: "included" });
    advance(emulator, 3);
    await read.refresh();
    expect(read.status).toBe("final");
    paidOnce(emulator);
  });

  it("a taken step keeps its extra key witnesses and the transactions of after it stands on", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 3 },
    });
    const { emulator, builder, wallet, address } = ctx;
    // A transaction on chain, given in after: a spends its output
    const fund = await builder.build(
      output({ address, value: { lovelace: 30n * ADA } }),
      { payer: wallet },
    );
    await (await fund.sign({ signers: [wallet] })).submit();
    advance(emulator, 1);
    const old = await builder.plan(
      {
        a: [
          spend.pubKey({ utxo: { txHash: fund.txHash, outputIndex: 0 } }),
          payTo(alice, 11n * ADA),
        ],
        b: payTo(bob, 12n * ADA),
      },
      { id: "order", payer: wallet, after: fund, extraKeyWitnesses: 1 },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(old.steps.map((step) => step.status)).toEqual(["included", "sent"]);
    const before = recordOf(old).steps[0]!;
    expect(before.after).toEqual([fund.txHash]);
    expect(before.extraKeyWitnesses).toBe(1);
    advance(emulator, 1);
    await old.replan({ id: "i1" });
    const taken = recordOf(await builder.resume("i1")).steps[0]!;
    expect(taken).toMatchObject({
      name: "a",
      taken: true,
      after: [fund.txHash],
      extraKeyWitnesses: 1,
    });
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
  });
});

describe("a step left whose end of validity has passed", () => {
  /**
   * A plan of `a`, final, and `b`, sent and held by a relay: `b` from parts with an end of its own
   * 30 s on (`own`), given built with that end (`built`), or with its end from the plan's
   * `ttlMs` of 30 s (`ttl`); with `more`, a third step `c` from `ttlMs`, signed. Then `slots`
   * slots on
   */
  const late = async (
    kind: "own" | "built" | "ttl",
    slots: number,
    more = false,
  ) => {
    const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const { emulator, builder, wallet } = ctx;
    const until = validity({ until: builder.timeAt(emulator.slot) + 30_000 });
    const b =
      kind === "built"
        ? await builder.build([payTo(bob, 12n * ADA), until], {
            payer: wallet,
          })
        : kind === "own"
          ? [payTo(bob, 12n * ADA), until]
          : payTo(bob, 12n * ADA);
    const old = await builder.plan(
      {
        a: payTo(alice, 11n * ADA),
        b,
        ...(more && { c: payTo(carol, 13n * ADA) }),
      },
      { id: "order", payer: wallet, ttlMs: 30_000 },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(old.step("a").status).toBe("final");
    expect(old.step("b").status).toBe("sent");
    advance(emulator, slots);
    return { ...ctx, old };
  };

  /** INVALID_OPTION (`steps`) naming step b, no mark and no record; the same again */
  const refusedForB = async (
    ctx: Awaited<ReturnType<typeof late>>,
    built: boolean,
  ) => {
    const { old, store } = ctx;
    for (let i = 0; i < 2; i++) {
      const error = await caught(old.replan({ id: "i1" }));
      expect([error.code, error.details.option, error.retryable]).toEqual([
        "INVALID_OPTION",
        "steps",
        false,
      ]);
      expect(error.message).toContain(
        built
          ? `step "b" was given built and its end of validity has passed`
          : `step "b" cannot be built again as it was given`,
      );
      expect(old.replacedBy).toBeUndefined();
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect(await store.inner.load("i1")).toBeUndefined();
    }
  };

  it("a step from parts whose own end has passed: refused; with steps given, the call passes", async () => {
    const ctx = await late("own", 40);
    await refusedForB(ctx, false);
    const next = await ctx.old.replan({
      id: "i1",
      steps: { b: payTo(bob, 12n * ADA) },
    });
    await next.run();
    expect(next.status).toBe("final");
    expect(times(ctx.emulator, bob, 12n * ADA)).toBe(1);
    expect(times(ctx.emulator, alice, 11n * ADA)).toBe(1);
  });

  it("a step given built whose end has passed: refused; with steps given, the call passes", async () => {
    const ctx = await late("built", 40);
    await refusedForB(ctx, true);
    const next = await ctx.old.replan({
      id: "i1",
      steps: { b: payTo(bob, 12n * ADA) },
    });
    await next.run();
    expect(next.status).toBe("final");
    expect(times(ctx.emulator, bob, 12n * ADA)).toBe(1);
  });

  it("a step from parts whose own end has not passed: built again as it was given, with that end", async () => {
    const ctx = await late("own", 1);
    const next = await ctx.old.replan({ id: "i1" });
    expect(next.step("b").validity!.until).toBe(
      ctx.old.step("b").validity!.until,
    );
    await next.run();
    expect(next.status).toBe("final");
    expect(times(ctx.emulator, bob, 12n * ADA)).toBe(1);
  });

  it("a step whose end came from ttlMs and has passed: built again with a new end", async () => {
    const ctx = await late("ttl", 40);
    const next = await ctx.old.replan({ id: "i1" });
    expect(next.step("b").validity!.until!).toBeGreaterThan(
      ctx.old.step("b").validity!.until!,
    );
    await next.run();
    expect(next.status).toBe("final");
    expect(times(ctx.emulator, bob, 12n * ADA)).toBe(1);
  });

  it("one such step beside a step from ttlMs: the call is refused whole", async () => {
    const ctx = await late("own", 40, true);
    await refusedForB(ctx, false);
    expect(times(ctx.emulator, carol, 13n * ADA)).toBe(0);
  });

  it("a step given built that stands on a step built again from its parts: refused, naming both; with steps that leave it out, the call passes", async () => {
    const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const { emulator, builder, wallet, store } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet, ttlMs: 30_000 },
    );
    // p, given built with an end of 600 s, spends the change of a
    const p = await builder.build(
      [
        spend.pubKey({ utxo: old.step("a").change[0]! }),
        payTo(bob, 12n * ADA),
        validity({ until: builder.timeAt(emulator.slot) + 600_000 }),
      ],
      { payer: wallet, after: old.step("a") },
    );
    await old.add({ p });
    await old.sign();
    const aHash = old.step("a").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === aHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    advance(emulator, 40);
    await old.refresh();
    expect(old.steps.map((step) => [step.name, step.status])).toEqual([
      ["a", "expired"],
      ["p", "orphaned"],
    ]);
    // a is built again as another transaction: the output p spends will never exist
    for (let i = 0; i < 2; i++) {
      const error = await caught(old.replan({ id: "i1" }));
      expect([error.code, error.details.option, error.retryable]).toEqual([
        "INVALID_OPTION",
        "steps",
        false,
      ]);
      expect(error.message).toContain(
        `step "p" was given built and spends, reads or puts up an output of step "a", which the new plan builds again as another transaction: the transaction given built could not land in the new plan; give the steps of the new plan`,
      );
      expect(old.replacedBy).toBeUndefined();
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect(await store.inner.load("i1")).toBeUndefined();
      advance(emulator, 1);
    }
    // The application's steps leave p out
    const next = await old.replan({
      id: "i1",
      steps: { a: payTo(alice, 11n * ADA) },
    });
    await next.run();
    expect(next.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(0);
  });

  it("a step given built on the change of a step the search hides, whose change a payer's read lists: the read answers first (CANNOT_OBSERVE); the step lands, and the plan is final", async () => {
    const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const { emulator, provider, builder, wallet, store } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    // p, given built with an end an hour on, spends the change of a
    const p = await builder.build(
      [
        spend.pubKey({ utxo: old.step("a").change[0]! }),
        payTo(bob, 12n * ADA),
        validity({ until: builder.timeAt(emulator.slot) + 3_600_000 }),
      ],
      { payer: wallet, after: old.step("a") },
    );
    await old.add({ p });
    await old.sign();
    const aHash = old.step("a").txHash;
    const pHash = old.step("p").txHash;
    // a lands, and the search does not find it; p is never sent
    const hide = { on: true };
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hide.on && hash.toLowerCase() === aHash)
        throw Object.assign(new Error("not found"), {
          kind: "notFound",
          status: 404,
        });
      return forward(hash);
    };
    const relay = relayOf(emulator, (txHash) => txHash === pHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    advance(emulator, 700);
    await old.refresh();
    expect(old.steps.map((step) => [step.name, step.status])).toEqual([
      ["a", "expired"],
      ["p", "orphaned"],
    ]);
    // The wallet's read lists the change of a: the call waits, and p may still land
    const error = await caught(old.replan({ id: "i1" }));
    expect([
      error.code,
      reasonOf(error),
      error.txHash,
      error.retryable,
    ]).toEqual(["CANNOT_OBSERVE", "unconfirmed", aHash, true]);
    expect(old.replacedBy).toBeUndefined();
    expect(await store.inner.load("i1")).toBeUndefined();
    expect(relay.kept).toEqual([]);
    await emulator.submitTx(old.step("p").signedTx!);
    advance(emulator, 1);
    hide.on = false;
    await old.refresh();
    expect(old.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  });

  it("a step given built that stands on a step in a block: not refused by this rule, held as it is", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 3 },
    });
    const { emulator, builder, wallet } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    const p = await builder.build(
      [
        spend.pubKey({ utxo: old.step("a").change[0]! }),
        payTo(bob, 12n * ADA),
        validity({ until: builder.timeAt(emulator.slot) + 600_000 }),
      ],
      { payer: wallet, after: old.step("a") },
    );
    await old.add({ p });
    await old.sign();
    const pHash = old.step("p").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === pHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(old.steps.map((step) => step.status)).toEqual(["included", "sent"]);
    advance(emulator, 1);
    const next = await old.replan({ id: "i1" });
    expect(next.steps.map((step) => [step.name, step.txHash])).toEqual([
      ["a", old.step("a").txHash],
      ["p", pHash],
    ]);
    await next.run({ waitFor: "included" });
    advance(emulator, 3);
    await next.refresh();
    expect(next.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  });

  it("a step given built that stands on another step given built that is left: not refused by this rule, both held as they are", async () => {
    const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const { emulator, builder, wallet } = ctx;
    const until = validity({ until: builder.timeAt(emulator.slot) + 600_000 });
    const q = await builder.build([payTo(alice, 11n * ADA), until], {
      payer: wallet,
    });
    const p = await builder.build(
      [spend.pubKey({ utxo: q.change[0]! }), payTo(bob, 12n * ADA), until],
      { payer: wallet, after: q },
    );
    const old = await builder.plan({ q, p }, { id: "order", payer: wallet });
    await old.stop();
    const next = await old.replan({ id: "i1" });
    expect(next.steps.map((step) => [step.name, step.txHash])).toEqual([
      ["q", q.txHash],
      ["p", p.txHash],
    ]);
    await next.run();
    expect(next.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  });
});

describe("a plan with nothing left to pay", () => {
  /** A plan of one payment on a store, `a` in a block and three blocks short of final */
  const oneInBlock = async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 3 },
    });
    const before = ctx.emulator.fork();
    const old = await ctx.builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: ctx.wallet },
    );
    await old.run({ waitFor: "sent" });
    await old.refresh();
    expect(old.step("a").status).toBe("included");
    advance(ctx.emulator, 1);
    return { ...ctx, before, old };
  };

  it("every step in a block: the call waits with steps and without, marks and writes nothing; once final it is INVALID_STATE (final)", async () => {
    const { emulator, store, old } = await oneInBlock();
    for (const steps of [{ x: payTo(dave, 14n * ADA) }, undefined]) {
      const error = await caught(
        old.replan({ id: "order:2", ...(steps !== undefined && { steps }) }),
      );
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        old.step("a").txHash,
      ]);
      expect(error.retryable).toBe(true);
      expect(error.message).toContain(
        "every step of the plan is in a block, and none is left for a plan in its place",
      );
      expect(old.replacedBy).toBeUndefined();
      expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
      expect(await store.inner.load("order:2")).toBeUndefined();
    }
    advance(emulator, 3);
    const final = await caught(
      old.replan({ id: "order:2", steps: { x: payTo(dave, 14n * ADA) } }),
    );
    expect([final.code, reasonOf(final)]).toEqual(["INVALID_STATE", "final"]);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(0);
  });

  it("after a rollback that leaves the step open, the call goes on: the step is built again on an input it shares", async () => {
    const { emulator, provider, before, old } = await oneInBlock();
    const a = old.step("a");
    before.advanceTo({ slot: emulator.slot + 1 });
    provider.control.target = before;
    const next = await old.replan({ id: "order:2" });
    expect(next.toJSON().steps.some((step) => step.taken === true)).toBe(false);
    expect(
      next
        .step("a")
        .inputs.some((input) =>
          a.inputs.some(
            (each) =>
              each.txHash === input.txHash &&
              each.outputIndex === input.outputIndex,
          ),
        ),
    ).toBe(true);
    await next.run({ waitFor: "included" });
    before.advanceTo({ slot: before.slot + 3 });
    await next.refresh();
    expect(next.status).toBe("final");
    expect(times(before, alice, 11n * ADA)).toBe(1);
  });
});

describe("edges of the refusals of replan", () => {
  it("a stopped plan whose every step landed: the call waits with the stopped form of its message; after a rollback that leaves a step open the same call makes the plan", async () => {
    const { emulator, store, wallet, instance, old, held } = await inBlock();
    // A fork with a in its block and b, c in none
    const mid = emulator.fork();
    // A call that dies at its first record: the mark is written
    const one = instance();
    one.store.hooks.save = (forward, json, rev) => {
      if (json.id === "i1") throw new Error("the process dies here");
      return forward(json, rev);
    };
    const x = await one.builder.resume("order", { payer: wallet });
    expect((await caught(x.replan({ id: "i1" }))).code).toBe("STORE_FAILED");
    // Every step lands
    await emulator.submitTx(held);
    await emulator.submitTx(old.step("c").signedTx!);
    const two = instance();
    const y = await two.builder.resume("order", { payer: wallet });
    const error = await caught(y.replan({ id: "i1" }));
    expect([error.code, reasonOf(error), error.retryable]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
      true,
    ]);
    expect(error.message).toContain(
      "the plan is stopped and sends nothing more; once its steps are final it is final, and after a rollback that leaves a step open the same call makes the plan in its place",
    );
    expect(error.message).not.toContain("add steps");
    expect(await store.inner.load("i1")).toBeUndefined();
    // A rollback takes b and c out of their blocks
    mid.advanceTo({ slot: emulator.slot + 1 });
    two.provider.control.target = mid;
    const made = await y.replan({ id: "i1" });
    expect(made.toJSON().steps[0]).toMatchObject({ name: "a", taken: true });
    expect((await store.inner.load("i1"))!.replaces).toBe("order");
    paidOnce(mid, true);
  });

  it("a final step beside a step in a block: nothing is left, the call waits, with steps and without", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 3 },
    });
    const { emulator, builder, wallet, store } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.sign();
    await old.run({ waitFor: "sent" });
    advance(emulator, 3);
    await old.refresh();
    await old.run({ waitFor: "sent" });
    await old.refresh();
    expect(old.steps.map((step) => step.status)).toEqual(["final", "included"]);
    for (const steps of [undefined, { x: payTo(dave, 14n * ADA) }]) {
      const error = await caught(
        old.replan({ id: "i1", ...(steps !== undefined && { steps }) }),
      );
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        old.step("b").txHash,
      ]);
      expect(error.message).toContain(
        "every step of the plan is in a block, and none is left",
      );
      expect(old.replacedBy).toBeUndefined();
      expect(await store.inner.load("i1")).toBeUndefined();
    }
    expect(times(emulator, dave, 14n * ADA)).toBe(0);
    paidOnce(emulator, true);
  });

  /**
   * A plan of a, final, and b with an end of its own, sent and held by a relay; then the chain
   * moved to the slot of that end
   */
  const endAt = async (form: "until" | "invalidHereafter") => {
    const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const { emulator, builder, wallet } = ctx;
    const slot = emulator.slot + 40;
    const end =
      form === "until"
        ? validity({ until: builder.timeAt(slot) })
        : validity({ invalidHereafter: slot });
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA), b: [payTo(bob, 12n * ADA), end] },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(old.steps.map((step) => step.status)).toEqual(["final", "sent"]);
    emulator.advanceTo({ slot });
    return { ...ctx, old };
  };

  it("a step whose own end is exactly the tip's time: refused", async () => {
    const { emulator, store, builder, old } = await endAt("until");
    expect(old.step("b").validity!.until).toBe(builder.timeAt(emulator.slot));
    const error = await caught(old.replan({ id: "i1" }));
    expect([error.code, error.details.option]).toEqual([
      "INVALID_OPTION",
      "steps",
    ]);
    expect(error.message).toContain(
      `step "b" cannot be built again as it was given`,
    );
    expect(await store.inner.load("i1")).toBeUndefined();
  });

  it("a step whose parts give invalidHereafter that the tip has reached: refused as one that gives until", async () => {
    const { store, old } = await endAt("invalidHereafter");
    const error = await caught(old.replan({ id: "i1" }));
    expect([error.code, error.details.option]).toEqual([
      "INVALID_OPTION",
      "steps",
    ]);
    expect(error.message).toContain(
      `step "b" cannot be built again as it was given`,
    );
    expect(await store.inner.load("i1")).toBeUndefined();
  });
});

describe("a crash at every request of replan", () => {
  const STORE_KINDS: readonly StoreFault[] = ["hangBefore", "hangAfter"];

  it("a new process makes the same call and runs the new plan: one record names the old plan, one payment each", async () => {
    const counted = await countCalls();
    expect(counted.store).toBeGreaterThan(2);
    expect(counted.io).toBeGreaterThan(4);
    const cases: Fault[] = [];
    for (let k = 1; k <= counted.store; k++)
      for (const kind of STORE_KINDS) cases.push({ where: "store", k, kind });
    for (let k = 1; k <= counted.io; k++) {
      cases.push({ where: "io", k });
      cases.push({ where: "io", k, after: true });
    }
    const random = seeded(FAULT_SEED);
    for (const fault of cases) await crashCase(fault, random.int(2));
  }, 600_000);

  it("a second world, a in a block and not final, rolled back at a drawn moment before the new process runs: one record names the old plan, one payment each", async () => {
    const counted = await countInBlockCalls();
    const cases: Fault[] = [];
    for (let k = 1; k <= counted.store; k++)
      for (const kind of STORE_KINDS) cases.push({ where: "store", k, kind });
    for (let k = 1; k <= counted.io; k++) {
      cases.push({ where: "io", k });
      cases.push({ where: "io", k, after: true });
    }
    const random = seeded(FAULT_SEED + 1);
    let rolledBack = 0;
    for (const fault of cases) {
      const rollback = random.chance(0.5);
      if (rollback) rolledBack++;
      await crashInBlockCase(fault, rollback, random.int(2));
    }
    expect(rolledBack).toBeGreaterThan(0);
    expect(rolledBack).toBeLessThan(cases.length);
  }, 600_000);
});

describe("the reconciliation loop of the README", () => {
  /**
   * Passes of the README's reconciliation loop over the ids the application keeps, the body as
   * the README has it; time moves on between passes, by `slots` (700 by default), on the chain
   * `chain` gives (the emulator by default). Gives the ids closed and what was reported
   */
  const reconcile = async (
    ctx: Pick<
      Awaited<ReturnType<typeof storeSetup>>,
      "builder" | "wallet" | "emulator"
    >,
    passes: number,
    slots: number | ((pass: number) => number) = 700,
    chain: () => TxEmulator = () => ctx.emulator,
  ) => {
    const { builder, wallet } = ctx;
    const open = ["order"];
    const closed: string[] = [];
    const reported: string[] = [];
    const db = {
      openPlanIds: async () => [...open],
      close: async (id: string, _status: string) => {
        open.splice(open.indexOf(id), 1);
        closed.push(id);
      },
    };
    const payerFor = async (_id: string) => wallet;
    const report = (error: unknown) =>
      void reported.push(`${codeOf(error)}/${reasonOf(error) ?? ""}`);
    for (let n = 0; n < passes; n++) {
      for (const id of await db.openPlanIds()) {
        try {
          let plan = await builder.resume(id, { payer: await payerFor(id) });
          await plan.refresh();
          // A final plan has paid: the line ends there. Else a plan made in its place is named in
          // `replacedBy`; and a plan gets one once no step of it may still land outside a block
          // (`live` is empty) while a step of it is in none. Its steps that are in a block go on as
          // steps of the new plan. The same call again returns that plan. A pass makes one plan
          // at most: a plan given less time than a pass takes is dead as soon as it is made
          let made = false;
          while (
            plan.status !== "final" &&
            (plan.replacedBy !== undefined ||
              (!made &&
                plan.live.length === 0 &&
                plan.landed.length < plan.steps.length))
          ) {
            made ||= plan.replacedBy === undefined;
            plan = await plan.replan({
              id: plan.replacedBy ?? `${plan.id}:next`,
            });
            await plan.refresh();
          }
          await plan.run({ waitFor: "sent" }).catch(report); // a look, then what can be done at once
          if (plan.status === "final") await db.close(id, plan.status); // release the goods
        } catch (error) {
          report(error); // the pass goes on; the next one repeats the call
        }
      }
      advance(chain(), typeof slots === "number" ? slots : slots(n));
    }
    return { closed, reported };
  };

  /** A plan of two payments on a store: `a` final, `b` sent and held by a relay; a slot on */
  const heldB = async () => {
    const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const { emulator, builder, wallet } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(old.steps.map((step) => step.status)).toEqual(["final", "sent"]);
    advance(emulator, 1);
    return { ...ctx, old, held: relay.kept[0]! };
  };

  const paidOnceEach = (emulator: TxEmulator) => {
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  };

  /**
   * A plan of two payments on a store whose depth of final is 100 blocks: `a`, ending 600 s on,
   * in a block; `b`, ending 30 s on (the plan's `ttlMs`; with `ownEnd`, a validity part of its
   * own), sent and held by a relay; then 40 slots on, past the end of `b`, with `a` in a block
   * and not final. `before`: a fork taken first, the chain of a rollback
   */
  const deadBesideInBlock = async (ownEnd = false) => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 100 },
    });
    const { emulator, builder, wallet } = ctx;
    const before = emulator.fork();
    const now = builder.timeAt(emulator.slot);
    const old = await builder.plan(
      {
        a: [payTo(alice, 11n * ADA), validity({ until: now + 600_000 })],
        b: [payTo(bob, 12n * ADA), ownEnd && validity({ until: now + 30_000 })],
      },
      { id: "order", payer: wallet, ttlMs: 30_000 },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(old.steps.map((step) => step.status)).toEqual(["included", "sent"]);
    advance(emulator, 40);
    return { ...ctx, before, old, held: relay.kept[0]! };
  };

  it("the old step lands after the replan: the line closes at the old plan, everyone paid once", async () => {
    const ctx = await heldB();
    const { emulator, old, held } = ctx;
    await old.replan({ id: "order:2" });
    await emulator.submitTx(held);
    advance(emulator, 50);
    const { closed, reported } = await reconcile(ctx, 4);
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    paidOnceEach(emulator);
  });

  it("a crash after the mark, then the old step lands: the line closes at the old plan, everyone paid once", async () => {
    const ctx = await heldB();
    const { emulator, store, old, held } = ctx;
    store.hooks.save = async (forward, json, rev) => {
      if (json.id === "order:2") throw new Error("down");
      return forward(json, rev);
    };
    expect((await caught(old.replan({ id: "order:2" }))).code).toBe(
      "STORE_FAILED",
    );
    delete store.hooks.save;
    expect(old.replacedBy).toBe("order:2");
    await emulator.submitTx(held);
    advance(emulator, 50);
    const { closed, reported } = await reconcile(ctx, 4);
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    paidOnceEach(emulator);
  });

  it("a line of three plans whose middle plan's step lands late: the line closes at the middle plan, everyone paid once", async () => {
    const ctx = await heldB();
    const { emulator, builder, old } = ctx;
    // The middle plan's b is held by a relay too
    const middle = await old.replan({ id: "order:2" });
    const relay = relayOf(emulator, () => true);
    await caught(middle.run({ submitter: relay, timeoutMs: 300 }));
    expect(middle.step("b").status).toBe("sent");
    advance(emulator, 1);
    await middle.replan({ id: "order:3" });
    // The middle plan's b lands
    await emulator.submitTx(relay.kept[0]!);
    advance(emulator, 50);
    const { closed, reported } = await reconcile(ctx, 4);
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    await middle.refresh();
    expect(middle.status).toBe("final");
    // The last plan sent nothing
    const last = await builder.resume("order:3");
    expect(last.steps.map((step) => step.status)).not.toContain("sent");
    paidOnceEach(emulator);
  });

  it("a plan with a dead step beside one in a block is replaced on the same pass", async () => {
    const ctx = await deadBesideInBlock();
    const { emulator, store, builder, held } = ctx;
    // Time moves 4 slots after the first pass, then 120 after each
    const first = await reconcile(ctx, 1, 4);
    expect(first.closed).toEqual([]);
    const next = (await store.inner.load("order:next"))!;
    expect(next.replaces).toBe("order");
    expect(next.steps[0]).toMatchObject({ name: "a", taken: true });
    const { closed, reported } = await reconcile(ctx, 3, 120);
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    expect((await builder.resume("order:next")).status).toBe("final");
    expect(
      await emulator.submitTx(held).then(
        () => false,
        () => true,
      ),
    ).toBe(true);
    paidOnceEach(emulator);
  });

  it("a step whose own parts give an end that has passed: every pass reports INVALID_OPTION, no plan is made, and the order stays open", async () => {
    const ctx = await deadBesideInBlock(true);
    const { store } = ctx;
    const { closed, reported } = await reconcile(ctx, 3, 1);
    expect(closed).toEqual([]);
    expect(reported).toEqual([
      "INVALID_OPTION/",
      "INVALID_OPTION/",
      "INVALID_OPTION/",
    ]);
    expect(await store.inner.load("order:next")).toBeUndefined();
    expect((await store.inner.load("order"))!.replacedBy).toBeUndefined();
    expect(times(ctx.emulator, bob, 12n * ADA)).toBe(0);
    expect(times(ctx.emulator, alice, 11n * ADA)).toBe(1);
  });

  /** Each payment of the plans of `inBlock` made once */
  const paidThrice = (chain: TxEmulator) => {
    paidOnceEach(chain);
    expect(times(chain, carol, 13n * ADA)).toBe(1);
  };

  it("after a rollback that is undone the loop goes on with the new plan", async () => {
    // a in a block, ten blocks short of final; replaced at once, a taken
    const ctx = await inBlock(10);
    const { store, provider, before, emulator, old } = ctx;
    await old.replan({ id: "order:next" });
    expect((await store.inner.load("order:next"))!.steps[0]!.taken).toBe(true);
    // The block of a is rolled back; the fork can take it again. Time moves 1 slot between the
    // first three passes, then 120
    before.advanceTo({ slot: emulator.slot + 1 });
    provider.control.target = before;
    const { closed, reported } = await reconcile(
      ctx,
      7,
      (n) => (n < 3 ? 1 : 120),
      () => before,
    );
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    expect((await store.inner.load("order:next"))!.status).toBe("final");
    expect(await store.inner.load("order:next:next")).toBeUndefined();
    paidThrice(before);
  });

  it("after a rollback that is not undone the loop makes a third plan and closes at it", async () => {
    const ctx = await inBlock(10);
    const { store, provider, before, emulator, old } = ctx;
    await old.replan({ id: "order:next" });
    expect((await store.inner.load("order:next"))!.steps[0]!.taken).toBe(true);
    // The fork is moved past the end of a; time moves 1 slot, then 120, between the passes
    before.advanceTo({ slot: emulator.slot + 700 });
    provider.control.target = before;
    const { closed, reported } = await reconcile(
      ctx,
      7,
      (n) => (n < 2 ? 1 : 120),
      () => before,
    );
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    expect((await store.inner.load("order:next"))!.status).toBe("stopped");
    const third = (await store.inner.load("order:next:next"))!;
    expect(third.replaces).toBe("order:next");
    expect(third.steps.some((step) => step.taken === true)).toBe(false);
    expect(third.status).toBe("final");
    paidThrice(before);
  });

  /**
   * A plan on a store whose depth of final is 3 blocks, with the steps given, `s` among them,
   * which spends a script UTxO and pays bob. A relay holds it, so that it never reaches the
   * chain, and the provider shows it in a block with a failed script; `run` lands the steps
   * before it
   */
  const failedStep = async (
    steps: (s: readonly unknown[]) => Record<string, unknown>,
  ) => {
    const ctx = await stepSetup("scalus", {
      builder: {
        store: watchStore(),
        planDefaults: { ...FAST, confirmations: 3 },
      },
      funds: [100n * ADA, 50n * ADA],
    });
    const { emulator, provider, builder, wallet } = ctx;
    const plutus = { code: alwaysSucceedCbor, version: "V3" as const };
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10n * ADA,
    });
    const s = [
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      payTo(bob, 12n * ADA),
    ];
    const old = await builder.plan(steps(s) as never, {
      id: "order",
      payer: wallet,
    });
    const sHash = old.step("s").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === sHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    const at = emulator.slot;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
      hash === sHash
        ? {
            hash: sHash,
            slot: at,
            block: "b".repeat(64),
            blockHeight: at,
            validContract: false,
          }
        : forward(hash);
    await old.refresh();
    return { ...ctx, old };
  };

  it("a step that failed its script beside a step left: every pass reports INVALID_OPTION, no plan is made, and the order stays open", async () => {
    const ctx = await failedStep((s) => ({
      a: payTo(alice, 11n * ADA),
      s,
      c: payTo(carol, 13n * ADA),
    }));
    const { emulator, builder, old } = ctx;
    expect(statuses(old)).toMatchObject({ s: "failed", c: "orphaned" });
    advance(emulator, 5);
    const { closed, reported } = await reconcile(ctx, 3, 5);
    expect(closed).toEqual([]);
    expect(reported).toEqual([
      "INVALID_OPTION/",
      "INVALID_OPTION/",
      "INVALID_OPTION/",
    ]);
    expect(await builder.store!.load("order:next")).toBeUndefined();
    expect((await builder.store!.load("order"))!.replacedBy).toBeUndefined();
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(0);
    expect(times(emulator, carol, 13n * ADA)).toBe(0);
  });

  it("a step that failed its script, the step on it orphaned: the loop waits while it is not final, then reports INVALID_OPTION on every pass, and the order stays open", async () => {
    const ctx = await failedStep((s) => ({ s, t: payTo(carol, 13n * ADA) }));
    const { emulator, builder, old } = ctx;
    expect(statuses(old)).toEqual({ s: "failed", t: "orphaned" });
    const { closed, reported } = await reconcile(ctx, 4, 5);
    expect(closed).toEqual([]);
    expect(reported).toEqual([
      "CANNOT_OBSERVE/unconfirmed",
      "INVALID_OPTION/",
      "INVALID_OPTION/",
      "INVALID_OPTION/",
    ]);
    expect(await builder.store!.load("order:next")).toBeUndefined();
    expect(times(emulator, bob, 12n * ADA)).toBe(0);
    expect(times(emulator, carol, 13n * ADA)).toBe(0);
  });

  it("a plan that came back from stopped with every step in a block is left to become final", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 1_000 },
    });
    const { emulator, provider, builder, wallet, store } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    const aHash = old.step("a").txHash;
    // A search that hides a until it is past its end and the margin: expired, stopped
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash.toLowerCase() === aHash)
        throw Object.assign(new Error("not found"), {
          kind: "notFound",
          status: 404,
        });
      return forward(hash);
    };
    await caught(old.run({ timeoutMs: 300 }));
    advance(emulator, 700);
    await old.refresh();
    expect(old.status).toBe("stopped");
    delete provider.control.hooks.fetchTxInfo;
    // Time moves 10 slots between the passes, then 1000: a is in a block, not final, then final
    const { closed, reported } = await reconcile(ctx, 3, (n) =>
      n < 1 ? 10 : 1_000,
    );
    expect(closed).toEqual(["order"]);
    expect(
      reported.filter((each) => each.startsWith("INVALID_OPTION")),
    ).toEqual([]);
    expect(await store.inner.load("order:next")).toBeUndefined();
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
  });

  it("a plan whose every step is in a block: a plan in its place is refused, and the loop closes the order at it with nothing unsent", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 3 },
    });
    const { emulator, builder, wallet, store } = ctx;
    const old = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.run({ waitFor: "sent" });
    await old.refresh();
    const refused = await caught(
      old.replan({ id: "order:2", steps: { x: payTo(dave, 14n * ADA) } }),
    );
    expect(reasonOf(refused)).toBe("unconfirmed");
    // Time moves one slot after the first pass, then three
    const { closed, reported } = await reconcile(ctx, 3, (n) =>
      n < 1 ? 1 : 3,
    );
    expect({ closed, reported }).toEqual({ closed: ["order"], reported });
    expect(await store.inner.load("order:2")).toBeUndefined();
    expect(await store.inner.load("order:next")).toBeUndefined();
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(0);
  });
});
