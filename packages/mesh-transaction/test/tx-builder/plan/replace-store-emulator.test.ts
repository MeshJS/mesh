import type { TxEmulator } from "@meshsdk/tx-emulator";
import type { MeshWallet } from "@meshsdk/wallet";

import type {
  BuildEvent,
  StoredTxPlanJSON,
  TxPlan,
} from "../../../src/tx-builder";
import type { Fault, StoreFault } from "./fault-util";
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
import { ADA, alice, bob, carol, dave, paidTo, payTo } from "./run-util";
import { holdSave, storeSetup } from "./store-util";

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

const paidOnce = (emulator: TxEmulator) => {
  expect(times(emulator, alice, 11n * ADA)).toBe(1);
  expect(times(emulator, bob, 12n * ADA)).toBe(1);
  expect(times(emulator, carol, 13n * ADA)).toBe(1);
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
      const { builder, wallet, store } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
        planDefaults: { ...FAST, confirmations: 3 },
      });
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.run({ waitFor: "sent" });
      await old.refresh();
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
});
