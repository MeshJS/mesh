import type {
  StoredTxPlanJSON,
  TxBuilderOptions,
  TxPlan,
} from "../../../src/tx-builder";
import type { WatchedStore } from "./store-util";
import { TxError } from "../../../src/tx-builder";
import {
  builderOf,
  caught,
  FAST,
  hashOf,
  pay,
  reasonOf,
  recipient,
  setup,
  submitterOf,
  swallowing,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, paidTo, payTo } from "./run-util";
import { stored, watchStore } from "./store-util";

// Steps added to a plan kept in a store: two objects that add at once, a stop written during the
// build, a write whose answer was lost, and the id of a plan that took steps.

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** An emulator, a wallet and a builder over a watched store */
const storeSetup = async (
  options: { planDefaults?: TxBuilderOptions["planDefaults"] } = {},
) => {
  const store = watchStore();
  const planDefaults = options.planDefaults ?? FAST;
  const ctx = await setup({
    builder: { store, planDefaults },
    slot: 100_000_000,
    funds: [1000n * ADA],
  });
  /**
   * Another instance: a new builder over the same records, through its own watched store and
   * provider, so that each instance's calls can be told apart and held up
   */
  const instance = () => {
    const own = watchStore(store.inner);
    const provider = wrap(ctx.emulator);
    return {
      store: own,
      provider,
      builder: builderOf(provider, { store: own, planDefaults }),
    };
  };
  return { ...ctx, store, instance };
};

/** A promise that a test opens; `reached` resolves once something waits at it */
const gate = () => {
  let open!: () => void;
  let reached!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const arrived = new Promise<void>((resolve) => (reached = resolve));
  return {
    open,
    reached: arrived,
    pass: () => {
      reached();
      return opened;
    },
  };
};

/** Holds up the first save of a store that `when` picks until the gate opens */
const holdSave = (
  store: WatchedStore,
  when: (json: StoredTxPlanJSON) => boolean,
) => {
  const held = gate();
  store.hooks.save = async (forward, json, rev) => {
    if (when(json)) {
      delete store.hooks.save;
      await held.pass();
    }
    return forward(json, rev);
  };
  return held;
};

/** The answers of the saves a store made, in order */
const answers = (store: WatchedStore) =>
  store.saves().map((c) => c.op === "save" && c.answer);

/** The names of the steps of a plan, or of a record */
const names = (plan: TxPlan | StoredTxPlanJSON) =>
  ("toJSON" in plan ? plan.toJSON() : plan).steps.map((step) => step.name);

/** A save that holds two steps or more: the write of an add */
const adding = (json: StoredTxPlanJSON) => json.steps.length > 1;

describe("two objects that add steps to one plan", () => {
  it("records exactly one of two objects adding different steps at once; the other is VERSION_CONFLICT, and its steps are in no record", async () => {
    const { builder, wallet, instance, store, emulator } = await storeSetup();
    await builder.plan(pay(), { id: "pay", payer: wallet });
    const one = instance();
    const two = instance();
    const a = await one.builder.resume("pay", { payer: wallet });
    const b = await two.builder.resume("pay", { payer: wallet });
    const held = holdSave(one.store, adding);
    const losing = caught(a.add({ x: payTo(alice, 5n * ADA) }));
    await held.reached;
    await b.add({ y: payTo(bob, 3n * ADA) });
    held.open();
    const error = await losing;
    expectCode(error, "VERSION_CONFLICT");
    expect(error.message).toMatch(/none of them is recorded/);
    expect(answers(one.store)).toEqual([false]);
    expect(names(await stored(store, "pay"))).toEqual(["main", "y"]);
    expect(names(a)).toEqual(["main", "y"]);
    expect(names(b)).toEqual(["main", "y"]);

    // The same call again builds on the plan as it is
    await a.add({ x: payTo(alice, 5n * ADA) });
    expect(names(await stored(store, "pay"))).toEqual(["main", "y", "x"]);
    expect(a.step("x").standsOn).toEqual(["y"]);
    await a.run();
    expect(a.status).toBe("final");
    expect(paidTo(emulator, recipient)).toEqual([5n * ADA]);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
    expect(paidTo(emulator, bob)).toEqual([3n * ADA]);
  });

  it("returns the recorded steps when two objects add the same steps at once, and applies its event over a change that added nothing", async () => {
    // The same steps at once
    {
      const { builder, wallet, instance, store } = await storeSetup();
      await builder.plan(pay(), { id: "pay", payer: wallet });
      const one = instance();
      const two = instance();
      const a = await one.builder.resume("pay", { payer: wallet });
      const b = await two.builder.resume("pay", { payer: wallet });
      const held = holdSave(one.store, adding);
      const late = a.add({ x: payTo(alice, 5n * ADA) });
      await held.reached;
      await b.add({ x: payTo(alice, 5n * ADA) });
      held.open();
      expect(await late).toBe(a);
      expect(answers(one.store)).toEqual([false]);
      const record = await stored(store, "pay");
      expect(names(record)).toEqual(["main", "x"]);
      expect(a.step("x").txHash).toBe(record.steps[1]!.txHash);
      expect(a.toJSON()).toStrictEqual(record);
    }
    // A delivery recorded during the build
    {
      const { builder, wallet, instance, store } = await storeSetup();
      const first = await builder.plan(pay(), { id: "pay", payer: wallet });
      await first.sign();
      const one = instance();
      const two = instance();
      const a = await one.builder.resume("pay", { payer: wallet });
      const b = await two.builder.resume("pay", { payer: wallet });
      const read = gate();
      one.provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        ...args: unknown[]
      ) => {
        delete one.provider.control.hooks.fetchAddressUTxOs;
        await read.pass();
        return forward(...args);
      };
      const adding = a.add({ x: payTo(alice, 5n * ADA) });
      await read.reached;
      await b.run({ waitFor: "sent", submitter: swallowing() });
      one.store.reset();
      read.open();
      await adding;
      expect(answers(one.store)).toEqual([false, true]);
      expect(one.provider.control.count("fetchAddressUTxOs")).toBe(1);
      const record = await stored(store, "pay");
      expect(names(record)).toEqual(["main", "x"]);
      expect(record.steps[0]!.sends).toBe(1);
      expect(a.toJSON()).toStrictEqual(record);
    }
  });

  it("a stop another object wrote during the build wins", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    await builder.plan(pay(), { id: "pay", payer: wallet });
    const one = instance();
    const a = await one.builder.resume("pay", { payer: wallet });
    const b = await instance().builder.resume("pay");
    const read = gate();
    one.provider.control.hooks.fetchAddressUTxOs = async (
      forward,
      ...args: unknown[]
    ) => {
      delete one.provider.control.hooks.fetchAddressUTxOs;
      await read.pass();
      return forward(...args);
    };
    const adding = caught(a.add({ x: payTo(alice, 5n * ADA) }));
    await read.reached;
    await b.stop();
    read.open();
    const error = await adding;
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("stopped");
    expect(names(await stored(store, "pay"))).toEqual(["main"]);
    expect(names(a)).toEqual(["main"]);
    expect(a.toJSON().stopped).toBe(true);
  });
});

describe("a write whose answer was lost", () => {
  it("finds the steps of a write that passed while its answer was lost", async () => {
    const { builder, wallet, instance, store, emulator, provider } =
      await storeSetup();
    const plan = await builder.plan(pay(), { id: "pay", payer: wallet });
    store.hooks.save = async (forward, json, rev) => {
      const written = await forward(json, rev);
      if (adding(json)) {
        delete store.hooks.save;
        throw new Error("the answer was lost");
      }
      return written;
    };
    const error = await caught(plan.add({ x: payTo(alice, 5n * ADA) }));
    expectCode(error, "STORE_FAILED");
    expect(names(plan)).toEqual(["main"]);
    expect(names(await stored(store, "pay"))).toEqual(["main", "x"]);
    const recorded = (await stored(store, "pay")).steps[1]!.txHash;

    // The same call returns the plan, with the one transaction under the name, and reads nothing
    // but the store
    const asked = provider.control.count(
      "fetchAddressUTxOs",
      "fetchLatestBlock",
      "fetchTxInfo",
    );
    expect(await plan.add({ x: payTo(alice, 5n * ADA) })).toBe(plan);
    expect(
      provider.control.count(
        "fetchAddressUTxOs",
        "fetchLatestBlock",
        "fetchTxInfo",
      ),
    ).toBe(asked);
    expect(names(plan)).toEqual(["main", "x"]);
    expect(plan.step("x").txHash).toBe(recorded);

    // Also after a restart, on a new builder; run() then sends the step once
    const restarted = instance();
    const again = await restarted.builder.resume("pay", { payer: wallet });
    const reads = restarted.provider.control.count("fetchAddressUTxOs");
    expect(await again.add({ x: payTo(alice, 5n * ADA) })).toBe(again);
    expect(restarted.provider.control.count("fetchAddressUTxOs")).toBe(reads);
    expect(names(again)).toEqual(["main", "x"]);
    const submitter = submitterOf((tx) => emulator.submitTx(tx));
    await again.run({ submitter });
    const hashes: string[] = await Promise.all(
      submitter.calls.map((tx) => hashOf(tx)),
    );
    expect(hashes.filter((hash) => hash === recorded)).toHaveLength(1);
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });
});

describe("the id of a plan that took steps", () => {
  it("builder.plan with the id returns the recorded plan after an add", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const plan = await builder.plan(pay(), { id: "pay", payer: wallet });
    await plan.add({ x: payTo(alice, 5n * ADA) });
    const record = await stored(store, "pay");
    expect(record.steps[1]!.added).toBe(true);

    const reads = provider.control.count("fetchAddressUTxOs");
    const same = await builder.plan(pay(), { id: "pay", payer: wallet });
    expect(same.toJSON()).toStrictEqual(record);
    expect(names(same)).toEqual(["main", "x"]);
    expect(provider.control.count("fetchAddressUTxOs")).toBe(reads);

    const error = await caught(
      builder.plan(
        { main: pay(), x: payTo(alice, 5n * ADA) },
        { id: "pay", payer: wallet },
      ),
    );
    expectCode(error, "PLAN_EXISTS");
    expect(await stored(store, "pay")).toStrictEqual(record);
  });
});
