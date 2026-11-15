import type { NativeScript } from "@meshsdk/core";
import { deserializeAddress } from "@meshsdk/core";

import type {
  StoredTxPlanJSON,
  TxBuilderOptions,
  TxPlan,
  TxPlanError,
} from "../../../src/tx-builder";
import type { WatchedStore } from "./store-util";
import {
  guard,
  output,
  signedKeyHashes,
  spend,
  TxError,
} from "../../../src/tx-builder";
import {
  advance,
  builderOf,
  caught,
  FAST,
  forwarding,
  hashOf,
  pay,
  reasonOf,
  recipient,
  setup,
  submitterOf,
  swallowing,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { stored, watchStore } from "./store-util";

// The writes of plans with a store: two objects on one record, refused and failed writes, the
// read before a pause, a rollback another object saw, and the crash table of a restart.

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** An emulator, a wallet and a builder over a watched store */
const storeSetup = async (
  options: {
    funds?: bigint[];
    planDefaults?: TxBuilderOptions["planDefaults"];
  } = {},
) => {
  const store = watchStore();
  const planDefaults = options.planDefaults ?? FAST;
  // A chain behind the local clock: a step past its end of validity is past it by both
  const ctx = await setup({
    builder: { store, planDefaults },
    slot: 100_000_000,
    ...(options.funds && { funds: options.funds }),
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

/** Whether a record holds a delivery of its first step */
const delivered = (json: StoredTxPlanJSON) => json.steps[0]!.sends > 0;

/** The answers of the saves a store made, in order */
const answers = (store: WatchedStore) =>
  store.saves().map((c) => c.op === "save" && c.answer);

/** A guard part that needs the payment key of another wallet of the seed */
const secondKey = async () => {
  const other = await walletOf(1);
  const address = (await other.getChangeAddress())!;
  return { other, part: guard.pubKey({ address }) };
};

/** The statuses of a plan's steps */
const statuses = (plan: TxPlan) => plan.steps.map((step) => step.status);

describe("Two objects on one record", () => {
  it("sends nothing once the other object wrote the stop mark", async () => {
    const { builder, wallet, instance, store, provider } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    const other = instance();
    const b = await other.builder.resume("pay");
    await a.stop();
    expect(a.status).toBe("stopping");
    const sends = provider.control.count("submitTx");
    const submitter = swallowing();

    const error = await caught(b.run({ submitter }));
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("stopped");
    expect(submitter.calls).toEqual([]);
    expect(provider.control.count("submitTx")).toBe(sends);
    expect(other.provider.control.count("submitTx")).toBe(0);
    expect(other.store.written()).toEqual([]);
    expect(b.toJSON().stopped).toBe(true);
    expect((await stored(store, "pay")).steps[0]!.status).toBe("signed");
  });

  it("writes the stop mark over a delivery the other object recorded first", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    const b = await instance().builder.resume("pay");
    await b.run({ waitFor: "sent", submitter: swallowing() });
    store.reset();

    await a.stop();
    // One refused write, the record read again, the mark written over it
    expect(answers(store)).toEqual([false, true]);
    expect(store.loads("pay")).toBe(1);
    const record = await stored(store, "pay");
    expect(record.status).toBe("stopping");
    expect(record.stopped).toBe(true);
    expect(record.steps[0]!.status).toBe("sent");
    expect(a.status).toBe("stopping");
    expect(a.toJSON()).toStrictEqual(record);
  });

  it("records one of two first writes of one id made at once; the other returns that record for the same steps, whatever it went through, and is PLAN_EXISTS for others", async () => {
    for (const then of ["built", "final", "other steps"] as const) {
      const { wallet, instance, store, emulator } = await storeSetup();
      const a = instance();
      const b = instance();
      // a reads the store, finds no record and builds; its first write waits
      const held = holdSave(a.store, () => true);
      const making = a.builder
        .plan(then === "other steps" ? pay(7_000_000n) : pay(), {
          id: "pay",
          payer: wallet,
        })
        .then(
          (plan) => ({ plan }),
          (error: unknown) => ({ error }),
        );
      await held.reached;
      expect(a.store.loads("pay")).toBe(1);
      // Meanwhile b reads, finds no record either, builds and records first
      const won = await b.builder.plan(pay(), { id: "pay", payer: wallet });
      if (then === "final") await won.run({ submitter: forwarding(emulator) });
      const record = await stored(store, "pay");
      held.open();

      const result = await making;
      if (then === "other steps") {
        expect("error" in result).toBe(true);
        const error = (result as { error: Error }).error;
        expectCode(error, "PLAN_EXISTS");
        expect(error.message).toMatch(/nothing was written/);
        expect(error.message).toMatch(/builder\.resume\(id\)/);
        expect(error.message).toMatch(
          /under a new id the same steps are paid again/,
        );
      } else {
        expect("plan" in result).toBe(true);
        const lost = (result as { plan: TxPlan }).plan;
        expect(lost.toJSON()).toStrictEqual(record);
        expect(lost.status).toBe(then === "final" ? "final" : "pending");
      }
      expect(answers(a.store)).toEqual([false]);
      expect(b.store.saves()[0]).toMatchObject({
        expectedRev: 0,
        rev: 1,
        answer: true,
      });
      expect(await stored(store, "pay")).toStrictEqual(record);
    }
  });

  it("applies a first delivery that lost to the other object's signature to the fresh record", async () => {
    const { builder, wallet, instance, store, emulator } = await storeSetup();
    const other = await walletOf(1);
    const a = await builder.plan(pay(), {
      id: "pay",
      payer: wallet,
      extraKeyWitnesses: 1,
    });
    await a.sign();
    expect(statuses(a)).toEqual(["signed"]);
    const b = await instance().builder.resume("pay");
    // a's delivery is written only after the other object records a witness the fee counts as
    // an extra one
    const held = holdSave(store, delivered);
    const submitter = forwarding(emulator);
    const sending = a.run({ waitFor: "sent", submitter });
    await held.reached;
    await b.addWitnesses(await other.signTx(a.step("main").tx, true));
    const key = deserializeAddress(
      (await other.getChangeAddress())!,
    ).pubKeyHash;
    store.reset();
    held.open();
    await sending;

    expect(submitter.calls).toHaveLength(1);
    expect(answers(store)).toEqual([false, true]);
    expect(store.loads("pay")).toBe(1);
    // The bytes sent carry the other object's witness too
    expect(await signedKeyHashes(submitter.calls[0]!)).toContain(key);
    expect(submitter.calls[0]).toBe(a.step("main").signedTx);
    expect((await stored(store, "pay")).steps[0]!.sends).toBe(1);
  });

  it("answers a signature by the other object's record read again: a stopped plan takes none", async () => {
    const { builder, wallet, address, instance, store } = await storeSetup();
    const second = await secondKey();
    // Two keys sign: the payer's and the guard's
    const a = await builder.plan([pay(), second.part], {
      id: "pay",
      payer: address,
    });
    const witness = await wallet.signTx(a.step("main").tx, true);
    // The other object records the same witness, then stops the plan
    const b = await instance().builder.resume("pay");
    await b.addWitnesses(witness);
    await b.stop();
    store.reset();

    const error = await caught(a.addWitnesses(witness));
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("stopped");
    expect(store.written()).toEqual([]);
    expect(a.toJSON().stopped).toBe(true);
  });

  it("returns from stop() whose mark meets a final record, and writes nothing", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.run({ waitFor: "sent", submitter: swallowing() });
    const other = instance();
    const b = await other.builder.resume("pay");
    const held = holdSave(other.store, (json) => json.stopped === true);
    const stopping = b.stop();
    await held.reached;
    // Meanwhile the first object sends the same bytes again, and they land
    await a.run({ submitter: forwarding(emulator) });
    expect(a.status).toBe("final");
    held.open();

    await stopping;
    expect(b.status).toBe("final");
    expect(b.toJSON().stopped).toBeUndefined();
    expect(answers(other.store)).toEqual([false]);
  });

  it("sends nothing when a first delivery's write meets a stopped record", async () => {
    const { builder, wallet, instance } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    const other = instance();
    const b = await other.builder.resume("pay");
    const held = holdSave(other.store, delivered);
    const submitter = swallowing();
    const sending = caught(b.run({ submitter }));
    await held.reached;
    // Meanwhile the first object stops the plan, which was never sent
    await a.stop();
    held.open();

    const error = await sending;
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("stopped");
    expect(submitter.calls).toEqual([]);
    expect(other.provider.control.count("submitTx")).toBe(0);
    expect(other.store.written()).toEqual([]);
    expect(b.toJSON().stopped).toBe(true);
  });

  it("returns from a first delivery refused after the other object carried the plan to final; nothing written", async () => {
    const { builder, wallet, emulator, instance, store } = await storeSetup();
    const held = gate();
    // The bytes reach the node only after the other object made them land: it refuses them
    const submitter = submitterOf(async (tx) => {
      await held.pass();
      return emulator.submitTx(tx);
    });
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    const call = a.run({ submitter });
    await held.reached;
    expect((await stored(store, "pay")).steps[0]!.sends).toBe(1);
    const b = await instance().builder.resume("pay", { payer: wallet });
    await b.run({ waitFor: "final", submitter: forwarding(emulator) });
    expect(b.status).toBe("final");
    const final = await stored(store, "pay");
    store.reset();
    held.open();

    await call;
    expect(a.status).toBe("final");
    expect(a.step("main").txHash).toBe(b.step("main").txHash);
    expect(submitter.calls).toHaveLength(1);
    expect(store.written()).toEqual([]);
    expect(await stored(store, "pay")).toEqual(final);
  });

  it("stops at a first delivery refused after the other object found the step dead; nothing written", async () => {
    const { builder, wallet, emulator, instance, store } = await storeSetup();
    const held = gate();
    // The bytes reach the node only past their end of validity: it refuses them
    const submitter = submitterOf(async (tx) => {
      await held.pass();
      return emulator.submitTx(tx);
    });
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    const call = caught(a.run({ submitter }));
    await held.reached;
    expect((await stored(store, "pay")).steps[0]!.sends).toBe(1);
    advance(emulator, 700);
    const b = await instance().builder.resume("pay", { payer: wallet });
    await b.refresh();
    expect(b.status).toBe("stopped");
    const dead = await stored(store, "pay");
    store.reset();
    held.open();

    const error = await call;
    expectCode(error, "EXPIRED");
    expect(a.status).toBe("stopped");
    expect(statuses(a)).toEqual(["expired"]);
    expect(submitter.calls).toHaveLength(1);
    expect(store.written()).toEqual([]);
    expect(await stored(store, "pay")).toEqual(dead);
  });

  it("goes on from included after a first delivery refused once the other object saw the step in a block; nothing written", async () => {
    const planDefaults = { ...FAST, confirmations: 2 };
    const { builder, wallet, emulator, instance, store } = await storeSetup({
      planDefaults,
    });
    const held = gate();
    // The bytes reach the node only after the other object's copy is in a block: it refuses them
    const submitter = submitterOf(async (tx) => {
      await held.pass();
      return emulator.submitTx(tx);
    });
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    const call = a.run({ waitFor: "included", submitter });
    await held.reached;
    const b = await instance().builder.resume("pay", { payer: wallet });
    await b.run({ waitFor: "included", submitter: forwarding(emulator) });
    expect(statuses(b)).toEqual(["included"]);
    const included = await stored(store, "pay");
    store.reset();
    held.open();

    await call;
    expect(statuses(a)).toEqual(["included"]);
    expect(a.landed.map((step) => step.txHash)).toEqual([
      b.step("main").txHash,
    ]);
    expect(submitter.calls).toHaveLength(1);
    expect(store.written()).toEqual([]);
    expect(await stored(store, "pay")).toEqual(included);
  });

  it("sends the same bytes when two calls of run() on one object decide on the same signed step", async () => {
    const { builder, wallet, store } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    store.reset();
    const submitter = swallowing();
    const results = await Promise.allSettled([
      a.run({ waitFor: "sent", submitter }),
      a.run({ waitFor: "sent", submitter }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(new Set(submitter.calls)).toEqual(
      new Set([a.step("main").signedTx]),
    );
    const record = await stored(store.inner, "pay");
    // Every delivery is recorded before its bytes leave
    expect(record.steps[0]!.sends).toBe(submitter.calls.length);
    expect(statuses(a)).toEqual(["sent"]);
  });

  it("writes the mark once when two calls on one object stop the plan at once", async () => {
    for (const second of ["stop", "refresh"] as const) {
      const { builder, wallet, emulator, store } = await storeSetup();
      const a = await builder.plan(pay(), { id: "pay", payer: wallet });
      await a.sign();
      advance(emulator, 700);
      // The write of the mark takes a while, and the second call's write queues behind it
      store.hooks.save = async (forward, json, rev) => {
        if (json.stopped === true)
          await new Promise((resolve) => setTimeout(resolve, 50));
        return forward(json, rev);
      };
      store.reset();
      await Promise.all([a.stop(), a[second]()]);
      expect(a.toJSON().stopped).toBe(true);
      // No write is refused: the second waits for the first, and the mark is written once
      expect(answers(store).every((answer) => answer === true)).toBe(true);
      if (second === "stop") {
        expect(store.written()).toHaveLength(1);
        expect(a.status).toBe("stopping");
      } else {
        expect(store.written()).toHaveLength(2);
        expect(a.status).toBe("stopped");
      }
      expect((await stored(store, "pay")).stopped).toBe(true);
    }
  });
});

describe("Refused and failed writes", () => {
  it("is VERSION_CONFLICT after four refused writes of a first delivery; nothing is sent", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    store.hooks.save = async (forward, json, rev) =>
      delivered(json) ? false : forward(json, rev);
    store.reset();

    const error = await caught(a.run());
    expectCode(error, "VERSION_CONFLICT");
    expect(provider.control.count("submitTx")).toBe(0);
    expect(store.saves()).toHaveLength(4);
    expect(answers(store)).toEqual([false, false, false, false]);
    // The read at the start of the call, and one after each of three refused writes
    expect(store.loads("pay")).toBe(4);
    expect(statuses(a)).toEqual(["signed"]);

    delete store.hooks.save;
    const again = await builderOf(provider, { store }).resume("pay");
    await again.run({ waitFor: "sent" });
    expect(statuses(again)).toEqual(["sent"]);
    expect(provider.control.count("submitTx")).toBe(1);
  });

  it("takes a save answering anything but true as another revision: a first delivery is not sent", async () => {
    for (const answer of [undefined, 1, "ok"]) {
      const { builder, wallet, store, provider } = await storeSetup();
      const a = await builder.plan(pay(), { id: "pay", payer: wallet });
      await a.sign();
      store.hooks.save = async (forward, json, rev) =>
        delivered(json) ? (answer as unknown as boolean) : forward(json, rev);
      const submitter = swallowing();
      expectCode(await caught(a.run({ submitter })), "VERSION_CONFLICT");
      expect(submitter.calls).toEqual([]);
      expect(provider.control.count("submitTx")).toBe(0);
      expect(statuses(a)).toEqual(["signed"]);
    }
  });

  it("takes a save answering anything but true as another revision: a first record is not handed out", async () => {
    for (const answer of [undefined, 1, "ok"]) {
      const store = watchStore();
      const { builder, wallet } = await setup({ builder: { store } });
      store.hooks.save = async () => answer as unknown as boolean;
      const error = (await caught(
        builder.plan(pay(), { id: "pay", payer: wallet }),
      )) as TxPlanError;
      expectCode(error, "VERSION_CONFLICT");
      expect(error.planId).toBe("pay");
      expect(await store.inner.load("pay")).toBeUndefined();
    }
  });

  it("is STORE_FAILED when the first write throws; the next builder.plan goes on by what the store holds", async () => {
    for (const writes of [true, false]) {
      const store = watchStore();
      const { builder, wallet } = await setup({ builder: { store } });
      store.hooks.save = async (forward, json, rev) => {
        delete store.hooks.save;
        if (writes) await forward(json, rev);
        throw new Error("the connection dropped");
      };
      const error = await caught(
        builder.plan(pay(), { id: "pay", payer: wallet }),
      );
      expectCode(error, "STORE_FAILED");
      expect((error as TxError).cause).toEqual(
        new Error("the connection dropped"),
      );
      const kept = await store.inner.load("pay");
      expect(kept !== undefined).toBe(writes);
      store.reset();

      const again = await builder.plan(pay(), { id: "pay", payer: wallet });
      if (writes) {
        // The written record is the plan
        expect(again.toJSON()).toStrictEqual(kept);
        expect(store.saves()).toEqual([]);
      } else {
        // As if no plan had been made
        expect(answers(store)).toEqual([true]);
        expect(again.toJSON().rev).toBe(1);
      }
    }
  });

  it("is STORE_FAILED when the write of a first delivery throws; nothing is sent, and resume goes on by what the store holds", async () => {
    for (const writes of [true, false]) {
      const { builder, wallet, store, provider } = await storeSetup();
      const a = await builder.plan(pay(), { id: "pay", payer: wallet });
      await a.sign();
      const bytes = a.step("main").signedTx!;
      store.hooks.save = async (forward, json, rev) => {
        if (!delivered(json)) return forward(json, rev);
        if (writes) await forward(json, rev);
        throw new Error("the connection dropped");
      };
      const submitter = swallowing();
      const error = await caught(a.run({ submitter }));
      expectCode(error, "STORE_FAILED");
      expect((error as TxError).cause).toEqual(
        new Error("the connection dropped"),
      );
      expect(submitter.calls).toEqual([]);
      expect(provider.control.count("submitTx")).toBe(0);
      expect(statuses(a)).toEqual(["signed"]);
      delete store.hooks.save;
      store.reset();

      const again = await builderOf(provider, { store }).resume("pay");
      expect(statuses(again)).toEqual([writes ? "sent" : "signed"]);
      const next = swallowing();
      await again.run({ waitFor: "sent", submitter: next });
      // The same bytes either way, each delivery recorded before they leave
      expect(next.calls).toEqual([bytes]);
      expect((await stored(store, "pay")).steps[0]!.sends).toBe(writes ? 2 : 1);
    }
  });

  it("is PLAN_NOT_FOUND when the record is gone at the read after a refused write; never written anew", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    store.hooks.save = async () => false;
    let reads = 0;
    store.hooks.load = async (forward, id) =>
      // The read at the start of the call finds the record; the one after the refusal does not
      reads++ === 0 ? forward(id) : undefined;
    store.reset();
    const error = (await caught(a.run())) as TxPlanError;
    expectCode(error, "PLAN_NOT_FOUND");
    expect(error.planId).toBe("pay");
    expect(provider.control.count("submitTx")).toBe(0);
    expect(store.saves()).toHaveLength(1);
    expect(
      store.saves().some((c) => c.op === "save" && c.expectedRev === 0),
    ).toBe(false);
  });
});

describe("The read before a pause", () => {
  /** A plan sent through a submitter that passes nothing on */
  const waiting = async () => {
    const ctx = await storeSetup();
    const a = await ctx.builder.plan(pay(), {
      id: "pay",
      payer: ctx.wallet,
    });
    const submitter = swallowing();
    await a.run({ waitFor: "sent", submitter });
    const old = a.step("main").signedTx!;
    return { ...ctx, a, submitter, old };
  };

  /** Holds up the next load of the store until the gate opens */
  const holdNextLoad = (store: WatchedStore, skip = 0) => {
    const held = gate();
    let seen = 0;
    store.hooks.load = async (forward, id) => {
      if (seen++ < skip) return forward(id);
      delete store.hooks.load;
      await held.pass();
      return forward(id);
    };
    return held;
  };

  it("ends the wait once the other object found the step dead: nothing more is sent", async () => {
    const { a, submitter, old, instance, emulator, store } = await waiting();
    // The read at the start of the call passes; the one before its first pause waits
    const held = holdNextLoad(store, 1);
    const call = caught(a.run({ submitter }));
    await held.reached;
    const sends = submitter.calls.length;
    advance(emulator, 700);
    const b = await instance().builder.resume("pay");
    await b.refresh();
    expect(b.status).toBe("stopped");
    held.open();
    const error = await call;
    expectCode(error, "EXPIRED");
    expect(a.status).toBe("stopped");
    expect(submitter.calls).toHaveLength(sends);
    expect(submitter.calls.every((tx) => tx === old)).toBe(true);
  });

  it("reads the record first in a call after a restart: a step the other object saw final is not sent again", async () => {
    const { old, instance, emulator, wallet } = await waiting();
    const restored = instance();
    const c = await restored.builder.resume("pay");
    const b = await instance().builder.resume("pay", { payer: wallet });
    await b.run({ submitter: forwarding(emulator) });
    expect(b.status).toBe("final");
    // Without a tip, c's own look sees nothing: only the store tells it
    restored.provider.control.hooks.fetchLatestBlock = async () => {
      throw new Error("down");
    };
    const mine = submitterOf(hashOf);
    await c.run({ submitter: mine });
    expect(c.status).toBe("final");
    expect(mine.calls).toEqual([]);
    expect(mine.calls).not.toContain(old);
  });

  it("is STORE_FAILED when the read before a resend throws; nothing is sent", async () => {
    const { a, store } = await waiting();
    store.hooks.load = async () => {
      throw new Error("the database is down");
    };
    const submitter = swallowing();
    const error = await caught(a.run({ waitFor: "included", submitter }));
    expectCode(error, "STORE_FAILED");
    expect(submitter.calls).toEqual([]);
  });

  it("is PLAN_NOT_FOUND when the record is gone while a call waits; nothing more is sent or written", async () => {
    const { a, store } = await waiting();
    store.reset();
    let saves = -1;
    const submitter = submitterOf(async (tx) => {
      // From the second resend on, the record is gone
      if (submitter.calls.length === 2) {
        store.hooks.load = async () => undefined;
        saves = store.saves().length;
      }
      return hashOf(tx);
    });
    const error = (await caught(
      a.run({ waitFor: "included", submitter }),
    )) as TxPlanError;
    expectCode(error, "PLAN_NOT_FOUND");
    expect(error.planId).toBe("pay");
    expect(submitter.calls).toHaveLength(2);
    expect(store.saves()).toHaveLength(saves);
  });
});

describe("A rollback of a step another object saw in a block", () => {
  /**
   * The first object sends through a submitter that passes nothing on; the other sends the same
   * bytes for real and records them included; then the chain rolls back to before them. The
   * first object still holds its record of `sent`
   */
  const rolledBack = async () => {
    const planDefaults = { ...FAST, confirmations: 2 };
    const ctx = await storeSetup({ planDefaults });
    const a = await ctx.builder.plan(pay(), {
      id: "pay",
      payer: ctx.wallet,
    });
    await a.run({ waitFor: "sent", submitter: swallowing() });
    const before = ctx.emulator.fork();
    const b = await ctx.instance().builder.resume("pay");
    await b.run({ waitFor: "included", submitter: forwarding(ctx.emulator) });
    expect(statuses(b)).toEqual(["included"]);
    ctx.provider.control.target = before;
    await expect(
      before.fetchTxInfo(a.step("main").txHash),
    ).rejects.toBeDefined();
    expect(statuses(a)).toEqual(["sent"]);
    expect((await stored(ctx.store, "pay")).steps[0]!.status).toBe("included");
    return { ...ctx, a, before };
  };

  it("stops with the mark written over what the record holds; after a look the step is sent and nothing landed", async () => {
    for (const refreshFirst of [false, true]) {
      const { a, store } = await rolledBack();
      if (refreshFirst) await a.refresh();
      await a.stop();
      expect(a.status).toBe("stopping");
      expect(a.toJSON().stopped).toBe(true);
      const record = await stored(store, "pay");
      expect(record.stopped).toBe(true);
      expect(record).toStrictEqual(a.toJSON());
      await a.refresh();
      expect(statuses(a)).toEqual(["sent"]);
      expect(a.landed).toEqual([]);
      expect(a.live.map((step) => step.name)).toEqual(["main"]);
    }
  });

  it("sends the bytes again from run() waiting for included, instead of returning", async () => {
    const failing = await rolledBack();
    const down = submitterOf(async () => {
      throw new Error("the network is down");
    });
    const error = await caught(
      failing.a.run({ waitFor: "included", timeoutMs: 100, submitter: down }),
    );
    expectCode(error, "CONFIRM_TIMEOUT");
    expect(down.calls.length).toBeGreaterThan(0);
    expect(statuses(failing.a)).toEqual(["sent"]);
    expect(failing.a.landed).toEqual([]);
    expect((await stored(failing.store, "pay")).steps[0]!.status).toBe("sent");

    const { a, before } = await rolledBack();
    const resent = forwarding(before);
    await a.run({ waitFor: "included", submitter: resent });
    expect(resent.calls).toEqual([a.step("main").signedTx]);
    expect(statuses(a)).toEqual(["included"]);
    const txHash = a.step("main").txHash;
    expect((await before.fetchTxInfo(txHash)).hash).toBe(txHash);
  });
});

describe("A record this library does not read, read again", () => {
  const MUTATIONS: [string, (json: StoredTxPlanJSON) => object, RegExp][] = [
    ["a newer version", (json) => ({ ...json, version: 3 }), /version 3/],
    ["another kind", (json) => ({ ...json, kind: "Other" }), /"Other"/],
    [
      "an unknown part kind",
      (json) => ({
        ...json,
        steps: json.steps.map((step) => ({
          ...step,
          given: {
            ...step.given,
            parts: [{ ...(step.given!.parts[0] as object), kind: "teleport" }],
          },
        })),
      }),
      /teleport/,
    ],
    [
      "an unknown step status",
      (json) => ({
        ...json,
        steps: json.steps.map((step) => ({ ...step, status: "levitating" })),
      }),
      /levitating/,
    ],
  ];

  /** Puts the mutated record over the stored one, as a newer instance would */
  const newer = async (
    store: WatchedStore,
    mutate: (json: StoredTxPlanJSON) => object,
  ) => {
    const now = (await store.inner.load("pay"))!;
    await store.inner.save(
      { ...mutate(now), rev: now.rev + 1 } as StoredTxPlanJSON,
      now.rev,
    );
  };

  const expectUnread = (error: unknown, named: RegExp) => {
    const failure = error as TxPlanError<"INVALID_STATE">;
    expectCode(failure, "INVALID_STATE");
    expect(failure.details.reason).toBe("recordVersion");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(named);
  };

  it.each(MUTATIONS)(
    "is recordVersion at the read after a refused write: %s",
    async (_, mutate, named) => {
      const { builder, wallet, store, provider } = await storeSetup();
      const a = await builder.plan(pay(), { id: "pay", payer: wallet });
      await a.sign();
      store.hooks.save = async () => {
        delete store.hooks.save;
        await newer(store, mutate);
        return false;
      };
      store.reset();
      expectUnread(await caught(a.run()), named);
      expect(provider.control.count("submitTx")).toBe(0);
      expect(store.written()).toEqual([]);
    },
  );

  it.each(MUTATIONS)(
    "is recordVersion at the read before a pause: %s",
    async (_, mutate, named) => {
      const { builder, wallet, store } = await storeSetup();
      const a = await builder.plan(pay(), { id: "pay", payer: wallet });
      await a.run({ waitFor: "sent", submitter: swallowing() });
      let written = -1;
      const submitter = submitterOf(async (tx) => {
        // The resend's delivery is recorded; then a newer instance writes over it
        written = store.written().length;
        await newer(store, mutate);
        return hashOf(tx);
      });
      expectUnread(
        await caught(a.run({ waitFor: "included", submitter })),
        named,
      );
      expect(submitter.calls).toHaveLength(1);
      expect(store.written()).toHaveLength(written);
    },
  );
});

describe("The crash table, after a restart on the same store", () => {
  it("delivers a stored signed step, and sends the same bytes of a stored sent one", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const restart = () => builderOf(provider, { store, planDefaults: FAST });
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.sign();
    // A crash before the delivery is written: the store holds signed
    const first = await restart().resume("pay");
    const sends = provider.control.count("submitTx");
    await first.run({ waitFor: "sent" });
    expect(provider.control.count("submitTx")).toBe(sends + 1);
    expect(first.toJSON().steps[0]!.sends).toBe(1);

    // A crash after the delivery is written, before its answer
    const b = await builder.plan(pay(4_000_000n), {
      id: "pay-2",
      payer: wallet,
    });
    await b.sign();
    const hanging = submitterOf(() => new Promise<string>(() => undefined));
    // The call of the object that crashed never gets its answer: the test ends it by its signal
    const crash = new AbortController();
    const crashed = caught(b.run({ submitter: hanging, signal: crash.signal }));
    try {
      while (!delivered((await store.load("pay-2"))!))
        await new Promise((resolve) => setTimeout(resolve, 5));
      const after = await restart().resume("pay-2");
      expect(statuses(after)).toEqual(["sent"]);
      const resent = swallowing();
      await after.run({ waitFor: "sent", submitter: resent });
      expect(resent.calls).toEqual([hanging.calls[0]]);
    } finally {
      crash.abort();
    }
    expectCode(await crashed, "ABORTED");
  });

  it("collects the other signatures with addWitnesses after a crash between them", async () => {
    const { builder, wallet, address, store, provider } = await storeSetup();
    const second = await secondKey();
    const a = await builder.plan([pay(), second.part], {
      id: "pay",
      payer: address,
    });
    const { tx } = a.step("main");
    await a.addWitnesses(await wallet.signTx(tx, true));
    expect(a.step("main").missing).toHaveLength(1);
    const again = await builderOf(provider, { store }).resume("pay");
    expect(again.step("main").missing).toEqual(a.step("main").missing);
    await again.addWitnesses(await second.other.signTx(tx, true));
    expect(statuses(again)).toEqual(["signed"]);
    await again.run();
    expect(again.status).toBe("final");
  });

  it("refuses run() after a crash between the stop mark and stopped; a look then stops it", async () => {
    const { builder, wallet, store, provider, emulator } = await storeSetup();
    const a = await builder.plan(pay(), { id: "pay", payer: wallet });
    await a.run({ waitFor: "sent", submitter: swallowing() });
    await a.stop();
    const again = await builderOf(provider, { store }).resume("pay", {
      payer: wallet,
    });
    expect(again.status).toBe("stopping");
    const sends = provider.control.count("submitTx");
    const error = await caught(again.run());
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("stopped");
    expect(provider.control.count("submitTx")).toBe(sends);
    advance(emulator, 700);
    await again.refresh();
    expect(again.status).toBe("stopped");
    expect((await stored(store, "pay")).status).toBe("stopped");
  });

  it("takes signatures over two restarts, and sends once both are in", async () => {
    const { emulator, provider, store } = await storeSetup();
    const alice = await walletOf(0);
    const bob = await walletOf(1);
    const keyOf = async (wallet: typeof alice) =>
      deserializeAddress((await wallet.getChangeAddress())!).pubKeyHash;
    const vault: NativeScript = {
      type: "all",
      scripts: [
        { type: "sig", keyHash: await keyOf(alice) },
        { type: "sig", keyHash: await keyOf(bob) },
      ],
    };
    const builder = builderOf(provider, { store });
    const vaultAddress = builder.scriptAddress(vault);
    const vaultUtxo = emulator.fund(vaultAddress, { lovelace: 80_000_000n });
    const plan = await builder.plan(
      [
        spend.native({ utxo: vaultUtxo, script: vault }),
        output({ address: recipient, value: { lovelace: 50_000_000n } }),
        guard.pubKey({ keyHash: await keyOf(alice) }),
        guard.pubKey({ keyHash: await keyOf(bob) }),
      ],
      { id: "payout-17", payer: vaultAddress, ttlMs: 3 * 86_400_000 },
    );
    const { tx } = plan.step("main");
    const monday = await builderOf(provider, { store }).resume("payout-17");
    await monday.addWitnesses(await alice.signTx(tx, true));
    expect(monday.step("main").missing).toHaveLength(1);
    const wednesday = await builderOf(provider, { store }).resume("payout-17");
    await wednesday.addWitnesses(await bob.signTx(tx, true));
    expect(statuses(wednesday)).toEqual(["signed"]);
    await wednesday.run();
    expect(wednesday.status).toBe("final");
  });
});
