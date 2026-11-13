import type { NativeScript } from "@meshsdk/core";
import { deserializeAddress } from "@meshsdk/core";

import type {
  StoredTxIntentJSON,
  TxIntentError,
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
} from "./intent-emulator-util";
import { stored, watchStore } from "./store-util";

// The writes of intents with a store: two objects on one record, refused and failed writes, the
// read before a resend, and the crash table of a restart.

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** An emulator, a wallet and a builder over a watched store */
const storeSetup = async (funds?: bigint[]) => {
  const store = watchStore();
  const ctx = await setup({ builder: { store }, ...(funds && { funds }) });
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
      builder: builderOf(provider, { store: own }),
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

/**
 * Waits until a provider has had no call for a while: the calls under way have reached a gate or
 * a queue
 */
const settled = async (provider: {
  control: { calls: Record<string, number> };
}) => {
  const total = () =>
    Object.values(provider.control.calls).reduce((a, b) => a + b, 0);
  let last = -1;
  for (let quiet = 0; quiet < 5;) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const now = total();
    quiet = now === last ? quiet + 1 : 0;
    last = now;
  }
};

/** Holds up the first save of a store that `when` picks until the gate opens */
const holdSave = (
  store: WatchedStore,
  when: (json: StoredTxIntentJSON) => boolean,
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

/** A guard part that needs the payment key of another wallet of the seed */
const secondKey = async () => {
  const other = await walletOf(1);
  const address = (await other.getChangeAddress())!;
  return { other, part: guard.pubKey({ address }) };
};

describe("Two objects on one record", () => {
  it("stops a first delivery once the other object wrote the closing mark", async () => {
    const { builder, wallet, instance, store, provider } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    const other = instance();
    const b = await other.builder.resume("pay");
    expectCode(await caught(a.abandon()), "STILL_LIVE");
    expect(a.closing).toBe(true);
    const sends = provider.control.count("submitTx");
    const submitter = swallowing();

    const error = await caught(b.send({ submitter }));
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("closing");
    expect(submitter.calls).toEqual([]);
    expect(provider.control.count("submitTx")).toBe(sends);
    expect(other.provider.control.count("submitTx")).toBe(0);
    expect(other.store.written()).toEqual([]);
    expect(b.closing).toBe(true);
    expect((await stored(store, "pay")).status).toBe("signed");
  });

  it("writes the closing mark over a first delivery the other object recorded first", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    const other = instance();
    const b = await other.builder.resume("pay");
    await b.send({ submitter: swallowing() });
    store.reset();

    expectCode(await caught(a.abandon()), "STILL_LIVE");
    // One refused write, the record read again, the mark written over it
    expect(store.saves().map((c) => c.op === "save" && c.answer)).toEqual([
      false,
      true,
    ]);
    expect(store.loads("pay")).toBe(1);
    const record = await stored(store, "pay");
    expect(record.status).toBe("sent");
    expect(record.closing).toBe(true);
    expect(a.status).toBe("sent");
    expect(a.toJSON()).toStrictEqual(record);
  });

  it("stops a new attempt once the other object wrote the closing mark", async () => {
    const { builder, wallet, instance, emulator, store, provider } =
      await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    advance(emulator, 700);
    await a.refresh();
    expect(a.status).toBe("expired");
    const other = instance();
    const b = await other.builder.resume("pay", { payer: wallet });
    // Without a tip the closing cannot finish: only the mark is recorded
    provider.control.hooks.fetchLatestBlock = async () => {
      throw new Error("down");
    };
    expectCode(await caught(a.abandon()), "CANNOT_OBSERVE");
    delete provider.control.hooks.fetchLatestBlock;
    expect((await stored(store, "pay")).closing).toBe(true);

    const error = await caught(b.build());
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("closing");
    expect(b.attempts).toHaveLength(1);
    expect(other.store.written()).toEqual([]);
    expect((await stored(store, "pay")).attempts).toHaveLength(1);
  });

  it("lets one of two first attempts built at once be recorded; the other hands nothing out", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    const b = instance().builder.intent(pay(), { id: "pay", payer: wallet });
    // Both read the store before either writes
    await a.refresh();
    await b.refresh();
    const [ra, rb] = await Promise.allSettled([a.build(), b.build()]);
    const won = [ra, rb].filter((r) => r.status === "fulfilled");
    const lost = [ra, rb].filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expectCode((lost[0] as PromiseRejectedResult).reason, "VERSION_CONFLICT");
    const record = await stored(store, "pay");
    expect(record.attempts).toHaveLength(1);
    const winner = (won[0] as PromiseFulfilledResult<{ txHash: string }>).value;
    expect(record.attempts[0]!.txHash).toBe(winner.txHash);
    // The loser took the record read again: build() returns the recorded attempt
    const loser = ra.status === "rejected" ? a : b;
    expect((await loser.build()).txHash).toBe(winner.txHash);
    expect(loser.attempts).toHaveLength(1);
  });

  it("applies a first delivery that lost to another object's signature to the fresh record", async () => {
    const { builder, wallet, instance, store, emulator } = await storeSetup();
    const other = await walletOf(1);
    const a = builder.intent(pay(), {
      id: "pay",
      payer: wallet,
      extraKeyWitnesses: 1,
    });
    await a.build();
    await a.sign();
    expect(a.status).toBe("signed");
    // Another object records a witness the fee counts as an extra one
    const b = await instance().builder.resume("pay");
    await b.addWitnesses(await other.signTx(a.built!.tx, true));
    const key = deserializeAddress(
      (await other.getChangeAddress())!,
    ).pubKeyHash;
    store.reset();

    const submitter = forwarding(emulator);
    await a.send({ submitter });
    expect(submitter.calls).toHaveLength(1);
    expect(store.saves().map((c) => c.op === "save" && c.answer)).toEqual([
      false,
      true,
    ]);
    expect(store.loads("pay")).toBe(1);
    // The bytes sent carry the other object's witness too
    expect(await signedKeyHashes(submitter.calls[0]!)).toContain(key);
    expect(submitter.calls[0]).toBe(a.signedTx);
    expect((await stored(store, "pay")).attempts[0]!.sends).toBe(1);
  });

  it("is INVALID_WITNESS (staleAttempt) for signatures of an attempt another object replaced, and keeps those of the current one", async () => {
    const { builder, wallet, address, instance, emulator, store } =
      await storeSetup();
    const second = await secondKey();
    // Two keys sign: the payer's and the guard's
    const a = builder.intent([pay(), second.part], {
      id: "pay",
      payer: address,
    });
    const first = await a.build();
    advance(emulator, 700);
    const b = await instance().builder.resume("pay", { payer: wallet });
    const next = await b.build();
    expect(next.txHash).not.toBe(first.txHash);

    // a does not know of the new attempt: its signature is written, refused, read again
    const error = (await caught(
      a.addWitnesses(await wallet.signTx(first.tx, true)),
    )) as TxIntentError<"INVALID_WITNESS">;
    expectCode(error, "INVALID_WITNESS");
    expect(error.details.reason).toBe("staleAttempt");
    expect(a.txHash).toBe(next.txHash);

    // Signatures of the current attempt from two objects are both kept
    const c = await instance().builder.resume("pay");
    await c.addWitnesses(await second.other.signTx(next.tx, true));
    await a.addWitnesses(await wallet.signTx(next.tx, true));
    const record = await stored(store, "pay");
    expect(record.attempts[1]!.status).toBe("signed");
    expect(a.status).toBe("signed");
    expect(a.missing).toEqual([]);
  });

  it("abandons from draft as the first record of the id; a late first build hands nothing out", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const late = instance().builder.intent(pay(), {
      id: "pay",
      payer: wallet,
    });
    const reading = instance().builder.intent(pay(), {
      id: "pay",
      payer: wallet,
    });
    // This one reads the store before the record is written: it finds none
    await reading.refresh();
    await builder.intent(pay(), { id: "pay" }).abandon();
    expect(store.saves("pay")).toEqual([
      expect.objectContaining({
        expectedRev: 0,
        rev: 1,
        status: "abandoned",
        answer: true,
      }),
    ]);
    // The first read finds the record abandoned
    let error = await caught(late.build());
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("terminal");
    expect(late.status).toBe("abandoned");
    // The one that read before loses its own first write and reads again
    error = await caught(reading.build());
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("terminal");
    expect(reading.status).toBe("abandoned");
    expect(reading.built).toBeUndefined();
    expect((await stored(store, "pay")).rev).toBe(1);
  });

  it("goes by a record that appeared while abandon() was in draft, and is INTENT_EXISTS for other parts", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const same = instance().builder.intent(pay(), { id: "pay" });
    const theirs = instance();
    const otherParts = theirs.builder.intent(pay(7_000_000n), {
      id: "pay",
      payer: wallet,
    });
    await same.refresh();
    await otherParts.refresh();
    await builder.intent(pay(), { id: "pay", payer: wallet }).build();
    const before = await stored(store, "pay");

    expectCode(await caught(otherParts.abandon()), "INTENT_EXISTS");
    expect(otherParts.status).toBe("draft");
    expect(await stored(store, "pay")).toStrictEqual(before);
    // It took no record: its next methods read and compare again, before anything else
    theirs.store.reset();
    const requests = theirs.provider.control.count(
      ...Object.keys(theirs.provider.control.calls),
    );
    expectCode(await caught(otherParts.refresh()), "INTENT_EXISTS");
    expectCode(await caught(otherParts.build()), "INTENT_EXISTS");
    expect(theirs.store.loads("pay")).toBe(2);
    expect(theirs.store.saves()).toEqual([]);
    expect(
      theirs.provider.control.count(
        ...Object.keys(theirs.provider.control.calls),
      ),
    ).toBe(requests);
    expect(otherParts.status).toBe("draft");

    // The same parts: the mark goes over the record, which has a live attempt
    expectCode(await caught(same.abandon()), "STILL_LIVE");
    const record = await stored(store, "pay");
    expect(record.closing).toBe(true);
    expect(record.attempts).toHaveLength(1);
    expect(same.closing).toBe(true);
  });

  it("is VERSION_CONFLICT for a first delivery another object recorded first; nothing is sent", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    const b = await instance().builder.resume("pay");
    await b.send({ submitter: swallowing() });
    const after = await stored(store.inner, "pay");
    store.reset();

    const mine = swallowing();
    const error = await caught(a.send({ submitter: mine }));
    expectCode(error, "VERSION_CONFLICT");
    expect(mine.calls).toEqual([]);
    expect(store.saves().map((c) => c.op === "save" && c.answer)).toEqual([
      false,
    ]);
    expect(store.loads("pay")).toBe(1);
    expect(await stored(store.inner, "pay")).toStrictEqual(after);
    // The record read again is the object's now
    expect(a.status).toBe("sent");
  });

  it("hands out no attempt another writer recorded while two calls on one object build", async () => {
    for (const mark of [false, true]) {
      const { builder, wallet, emulator, instance, store, provider } =
        await storeSetup();
      const a = builder.intent(pay(), { id: "pay", payer: wallet });
      const first = await a.build();
      await a.sign();
      advance(emulator, 700);
      await a.refresh();
      expect(a.status).toBe("expired");
      // The first call's write of its attempt waits; the second call's queues behind it
      const held = holdSave(store, (json) => json.attempts.length === 2);
      const calls = [a.build(), a.build()];
      await held.reached;
      await settled(provider);
      // Meanwhile another instance replaces the attempt, and may write the closing mark
      advance(emulator, 1);
      const b = await instance().builder.resume("pay", { payer: wallet });
      const next = await b.build();
      expect(next.txHash).not.toBe(first.txHash);
      if (mark) expectCode(await caught(b.abandon()), "STILL_LIVE");
      store.reset();
      held.open();

      for (const result of await Promise.allSettled(calls)) {
        expect(result.status).toBe("rejected");
        const error = (result as PromiseRejectedResult).reason;
        if (mark) {
          expectCode(error, "INVALID_STATE");
          expect(reasonOf(error)).toBe("closing");
        } else expectCode(error, "VERSION_CONFLICT");
      }
      expect(store.written()).toEqual([]);
      expect(a.txHash).toBe(next.txHash);
      expect(
        (await stored(store.inner, "pay")).attempts.map((x) => x.txHash),
      ).toEqual([first.txHash, next.txHash]);
    }
  });

  it("answers signatures by another writer's record read again, also when it holds them already", async () => {
    for (const then of ["mark", "replace"] as const) {
      const { builder, wallet, address, instance, emulator, store } =
        await storeSetup();
      const second = await secondKey();
      const a = builder.intent([pay(), second.part], {
        id: "pay",
        payer: address,
      });
      const built = await a.build();
      const witness = await wallet.signTx(built.tx, true);
      // Another object records the same witness, then marks the intent or replaces the attempt
      const b = await instance().builder.resume("pay", { payer: wallet });
      await b.addWitnesses(witness);
      if (then === "mark") expectCode(await caught(b.abandon()), "STILL_LIVE");
      else {
        advance(emulator, 700);
        await b.build();
      }
      store.reset();

      const error = (await caught(
        a.addWitnesses(witness),
      )) as TxIntentError<"INVALID_WITNESS">;
      if (then === "mark") {
        expectCode(error, "INVALID_STATE");
        expect(reasonOf(error)).toBe("closing");
      } else {
        expectCode(error, "INVALID_WITNESS");
        expect(error.details.reason).toBe("staleAttempt");
      }
      expect(store.written()).toEqual([]);
    }
  });

  it("returns the landed attempt from a build whose write meets a final record, and writes nothing", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    advance(emulator, 700);
    await a.refresh();
    const other = instance();
    const b = await other.builder.resume("pay", { payer: wallet });
    const held = holdSave(other.store, (json) => json.attempts.length === 2);
    const building = b.build();
    await held.reached;
    // Meanwhile the first object replaces the attempt, and the new one lands
    advance(emulator, 1);
    await a.build();
    await a.send({ waitFor: "included", submitter: forwarding(emulator) });
    expect(a.status).toBe("final");
    held.open();

    const built = await building;
    expect(built.txHash).toBe(a.txHash);
    expect(b.status).toBe("final");
    expect(other.store.written()).toEqual([]);
  });

  it("is ATTEMPT_ON_CHAIN from abandon() whose closing mark meets a final record; nothing written", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.send({ submitter: swallowing() });
    const other = instance();
    const b = await other.builder.resume("pay");
    const held = holdSave(other.store, (json) => json.closing === true);
    const closing = b.abandon();
    await held.reached;
    // Meanwhile the first object sends the same bytes again, and they land
    await a.send({ waitFor: "included", submitter: forwarding(emulator) });
    expect(a.status).toBe("final");
    held.open();

    expectCode(await caught(closing), "ATTEMPT_ON_CHAIN");
    expect(b.status).toBe("final");
    expect(other.store.written()).toEqual([]);
  });

  it("sends nothing when a first delivery's write meets an abandoned record", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    const other = instance();
    const b = await other.builder.resume("pay");
    const held = holdSave(other.store, (json) => json.status === "sent");
    const submitter = swallowing();
    const sending = b.send({ submitter });
    await held.reached;
    // Meanwhile the first object closes the intent, which was never sent
    advance(emulator, 700);
    await a.abandon();
    expect(a.status).toBe("abandoned");
    held.open();

    const error = await caught(sending);
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("terminal");
    expect(submitter.calls).toEqual([]);
    expect(other.provider.control.count("submitTx")).toBe(0);
    expect(other.store.written()).toEqual([]);
  });

  it("returns from a closing call whose write queued behind another call that closed the intent", async () => {
    for (const order of [
      ["abandon", "advance"],
      ["advance", "abandon"],
      ["advance", "advance"],
    ] as const) {
      const { builder, wallet, emulator, store } = await storeSetup();
      const a = builder.intent(pay(), { id: "pay", payer: wallet });
      await a.build();
      await a.sign();
      expectCode(await caught(a.abandon()), "STILL_LIVE");
      advance(emulator, 700);
      await a.refresh();
      expect(a.status).toBe("expired");
      // The write of abandoned takes a while: both calls end their searches before it is done,
      // and the second call's write queues behind it
      store.hooks.save = async (forward, json, rev) => {
        if (json.status === "abandoned")
          await new Promise((resolve) => setTimeout(resolve, 50));
        return forward(json, rev);
      };
      await Promise.all([a[order[0]](), a[order[1]]()]);
      expect(a.status).toBe("abandoned");
      expect(
        store
          .written()
          .filter((c) => c.op === "save" && c.status === "abandoned"),
      ).toHaveLength(1);
    }
  });
});

describe("Refused and failed writes", () => {
  it("is VERSION_CONFLICT after four refused writes of a first delivery; nothing is sent", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const restart = () => builderOf(provider, { store });
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    store.hooks.save = async (forward, json, rev) =>
      json.status === "sent" ? false : forward(json, rev);
    store.reset();

    const error = await caught(a.send());
    expectCode(error, "VERSION_CONFLICT");
    expect(provider.control.count("submitTx")).toBe(0);
    expect(store.saves()).toHaveLength(4);
    expect(store.loads("pay")).toBe(3);
    expect(a.status).toBe("signed");

    delete store.hooks.save;
    const again = await restart().resume("pay");
    await again.send();
    expect(again.status).not.toBe("signed");
    expect(provider.control.count("submitTx")).toBe(1);
  });

  it("is STORE_FAILED when the write of a new attempt throws; resume goes on by what the store holds", async () => {
    for (const writes of [true, false]) {
      const { builder, wallet, emulator, store, provider } = await storeSetup();
      const a = builder.intent(pay(), { id: "pay", payer: wallet });
      const first = await a.build();
      await a.sign();
      advance(emulator, 700);
      await a.refresh();
      expect(a.status).toBe("expired");
      store.hooks.save = async (forward, json, rev) => {
        if (json.attempts.length < 2) return forward(json, rev);
        if (writes) await forward(json, rev);
        throw new Error("the connection dropped");
      };
      const error = await caught(a.build());
      expectCode(error, "STORE_FAILED");
      expect((error as TxError).cause).toEqual(
        new Error("the connection dropped"),
      );
      // The object is not ahead of what it knows was written
      expect(a.attempts).toHaveLength(1);
      expect(a.txHash).toBe(first.txHash);
      delete store.hooks.save;

      const again = await builderOf(provider, { store }).resume("pay", {
        payer: wallet,
      });
      if (writes) {
        // The written attempt goes on
        expect(again.attempts).toHaveLength(2);
        expect(again.status).toBe("built");
      } else {
        // As if no build happened
        expect(again.attempts).toHaveLength(1);
        expect(again.status).toBe("expired");
        expect((await again.build()).txHash).not.toBe(first.txHash);
      }
    }
  });

  it("is STORE_FAILED when the write of a first delivery throws; nothing is sent, and resume goes on by what the store holds", async () => {
    for (const writes of [true, false]) {
      const { builder, wallet, store, provider } = await storeSetup();
      const a = builder.intent(pay(), { id: "pay", payer: wallet });
      await a.build();
      await a.sign();
      const bytes = a.signedTx!;
      store.hooks.save = async (forward, json, rev) => {
        if (json.status !== "sent") return forward(json, rev);
        if (writes) await forward(json, rev);
        throw new Error("the connection dropped");
      };
      const submitter = swallowing();
      const error = await caught(a.send({ submitter }));
      expectCode(error, "STORE_FAILED");
      expect((error as TxError).cause).toEqual(
        new Error("the connection dropped"),
      );
      expect(submitter.calls).toEqual([]);
      expect(provider.control.count("submitTx")).toBe(0);
      expect(a.status).toBe("signed");
      delete store.hooks.save;
      store.reset();

      const again = await builderOf(provider, { store }).resume("pay");
      expect(again.status).toBe(writes ? "sent" : "signed");
      const next = swallowing();
      await again.send({ submitter: next });
      // A stored delivery is sent again without a write; a stored signed one is delivered
      expect(next.calls).toEqual([bytes]);
      expect(again.attempts[0]!.sends).toBe(1);
      expect(
        store.written().map((c) => (c.op === "save" ? c.status : "")),
      ).toEqual(writes ? [] : ["sent"]);
    }
  });

  it("is INTENT_NOT_FOUND when the record is gone at the read after a refused write; never written anew", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    store.hooks.save = async () => false;
    store.hooks.load = async () => undefined;
    store.reset();
    const error = (await caught(a.send())) as TxIntentError;
    expectCode(error, "INTENT_NOT_FOUND");
    expect(error.intentId).toBe("pay");
    expect(provider.control.count("submitTx")).toBe(0);
    expect(store.saves()).toHaveLength(1);
    expect(
      store.saves().some((c) => c.op === "save" && c.expectedRev === 0),
    ).toBe(false);
  });
});

describe("The read before a resend", () => {
  /** An intent sent through a submitter that passes nothing on, and another instance */
  const waiting = async () => {
    const ctx = await storeSetup();
    const a = ctx.builder.intent(pay(), { id: "pay", payer: ctx.wallet });
    const submitter = swallowing();
    await a.send({ submitter });
    const old = a.signedTx!;
    return { ...ctx, a, submitter, old };
  };

  /** Holds up the next load of the store before a resend until the gate opens */
  const holdNextLoad = (store: WatchedStore) => {
    const held = gate();
    store.hooks.load = async (forward, id) => {
      delete store.hooks.load;
      await held.pass();
      return forward(id);
    };
    return held;
  };

  it("sends the old bytes no more once another object replaced the attempt", async () => {
    const { a, submitter, old, instance, emulator, wallet, store } =
      await waiting();
    const held = holdNextLoad(store);
    const call = a.send({ waitFor: "included", submitter });
    await held.reached;
    const oldSends = submitter.calls.filter((tx) => tx === old).length;
    // Another instance replaces the expired attempt and the new one lands
    advance(emulator, 700);
    const b = await instance().builder.resume("pay", { payer: wallet });
    await b.refresh();
    await b.build();
    await b.send();
    held.open();
    await call;
    expect(a.status).not.toBe("sent");
    expect(a.txHash).toBe(b.txHash);
    expect(submitter.calls.filter((tx) => tx === old)).toHaveLength(oldSends);
  });

  it("ends the wait once another object abandoned the intent: send() throws, advance() returns", async () => {
    for (const method of ["send", "advance"] as const) {
      const { a, submitter, old, instance, emulator, store } = await waiting();
      const held = holdNextLoad(store);
      const call = a[method]({ waitFor: "included", submitter });
      await held.reached;
      const sends = submitter.calls.length;
      advance(emulator, 700);
      await (await instance().builder.resume("pay")).abandon();
      held.open();
      if (method === "send") {
        const error = await caught(call);
        expectCode(error, "INVALID_STATE");
        expect(reasonOf(error)).toBe("terminal");
      } else await call;
      expect(a.status).toBe("abandoned");
      expect(submitter.calls).toHaveLength(sends);
      expect(submitter.calls.every((tx) => tx === old)).toBe(true);
    }
  });

  it("is INVALID_STATE (closing) once another object recorded the closing mark", async () => {
    const { a, submitter, instance, store } = await waiting();
    const held = holdNextLoad(store);
    const call = a.send({ waitFor: "included", submitter });
    await held.reached;
    const sends = submitter.calls.length;
    expectCode(
      await caught((await instance().builder.resume("pay")).abandon()),
      "STILL_LIVE",
    );
    held.open();
    const error = await caught(call);
    expectCode(error, "INVALID_STATE");
    expect(reasonOf(error)).toBe("closing");
    expect(submitter.calls).toHaveLength(sends);
    expect(a.closing).toBe(true);
  });

  it("reads the record before the first resend of a call after a restart", async () => {
    const { submitter, old, instance, emulator, wallet } = await waiting();
    const restored = instance();
    const c = await restored.builder.resume("pay");
    advance(emulator, 700);
    const b = await instance().builder.resume("pay", { payer: wallet });
    await b.refresh();
    await b.build();
    await b.send({ submitter: swallowing() });
    // Without a tip, c's own observation sees nothing: only the store tells it
    restored.provider.control.hooks.fetchLatestBlock = async () => {
      throw new Error("down");
    };
    const mine = submitterOf(hashOf);
    await c.send({ submitter: mine });
    expect(mine.calls).not.toContain(old);
    expect(c.txHash).toBe(b.txHash);
    expect(mine.calls).toEqual([b.signedTx]);
    expect(submitter.calls.every((tx) => tx === old)).toBe(true);
  });

  it("is STORE_FAILED when the read before a resend throws; nothing is sent", async () => {
    const { a, store } = await waiting();
    store.hooks.load = async () => {
      throw new Error("the database is down");
    };
    const submitter = swallowing();
    const error = await caught(a.send({ waitFor: "included", submitter }));
    expectCode(error, "STORE_FAILED");
    expect(submitter.calls).toEqual([]);
  });

  it("is INTENT_NOT_FOUND when the record is gone while a send waits; nothing more is sent or written", async () => {
    const { a, store } = await waiting();
    store.reset();
    const submitter = submitterOf(async (tx) => {
      // From the second resend on, the record is gone
      if (submitter.calls.length === 2)
        store.hooks.load = async () => undefined;
      return hashOf(tx);
    });
    const error = (await caught(
      a.send({ waitFor: "included", submitter }),
    )) as TxIntentError;
    expectCode(error, "INTENT_NOT_FOUND");
    expect(error.intentId).toBe("pay");
    expect(submitter.calls).toHaveLength(2);
    expect(store.saves()).toEqual([]);
  });
});

describe("A record this library does not read, read again", () => {
  const MUTATIONS: [string, (json: StoredTxIntentJSON) => object, RegExp][] = [
    ["a newer version", (json) => ({ ...json, version: 2 }), /version 2/],
    ["another kind", (json) => ({ ...json, kind: "Other" }), /"Other"/],
    [
      "an unknown part kind",
      (json) => ({
        ...json,
        parts: [{ ...(json.parts[0] as object), kind: "teleport" }],
      }),
      /teleport/,
    ],
    [
      "an unknown attempt status",
      (json) => ({
        ...json,
        attempts: json.attempts.map((attempt) => ({
          ...attempt,
          status: "levitating",
        })),
      }),
      /levitating/,
    ],
  ];

  /** Puts the mutated record over the stored one, as a newer instance would */
  const newer = async (
    store: WatchedStore,
    mutate: (json: StoredTxIntentJSON) => object,
  ) => {
    const now = (await store.inner.load("pay"))!;
    await store.inner.save(
      { ...mutate(now), rev: now.rev + 1 } as StoredTxIntentJSON,
      now.rev,
    );
  };

  it.each(MUTATIONS)(
    "is recordVersion at the read after a refused write: %s",
    async (_, mutate, named) => {
      const { builder, wallet, store, provider } = await storeSetup();
      const a = builder.intent(pay(), { id: "pay", payer: wallet });
      await a.build();
      await a.sign();
      store.hooks.save = async () => {
        delete store.hooks.save;
        await newer(store, mutate);
        return false;
      };
      store.reset();
      const error = (await caught(a.send())) as TxIntentError<"INVALID_STATE">;
      expectCode(error, "INVALID_STATE");
      expect(error.details.reason).toBe("recordVersion");
      expect(error.retryable).toBe(false);
      expect(error.message).toMatch(named);
      expect(provider.control.count("submitTx")).toBe(0);
      expect(store.written()).toEqual([]);
    },
  );

  it.each(MUTATIONS)(
    "is recordVersion at the read before a resend: %s",
    async (_, mutate, named) => {
      const { builder, wallet, store } = await storeSetup();
      const a = builder.intent(pay(), { id: "pay", payer: wallet });
      const submitter = submitterOf(async (tx) => {
        if (submitter.calls.length === 1) await newer(store, mutate);
        const { hashOf } = await import("./intent-emulator-util");
        return hashOf(tx);
      });
      await a.send({ submitter });
      store.reset();
      const error = (await caught(
        a.send({ waitFor: "included", submitter }),
      )) as TxIntentError<"INVALID_STATE">;
      expectCode(error, "INVALID_STATE");
      expect(error.details.reason).toBe("recordVersion");
      expect(error.message).toMatch(named);
      expect(submitter.calls).toHaveLength(1);
      expect(store.written()).toEqual([]);
    },
  );
});

describe("The crash table, after a restart on the same store", () => {
  it("delivers a stored signed attempt, and sends the same bytes of a stored sent one", async () => {
    const { builder, wallet, store, provider } = await storeSetup();
    const restart = () => builderOf(provider, { store });
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.build();
    await a.sign();
    // A crash before the delivery is written: the store holds signed
    const first = await restart().resume("pay");
    const sends = provider.control.count("submitTx");
    await first.send();
    expect(provider.control.count("submitTx")).toBe(sends + 1);
    expect(first.attempts[0]!.sends).toBe(1);

    // A crash after the delivery is written, before its answer
    const b = builder.intent(pay(4_000_000n), { id: "pay-2", payer: wallet });
    await b.build();
    await b.sign();
    const hanging = submitterOf(() => new Promise<string>(() => undefined));
    void b.send({ submitter: hanging });
    while ((await store.load("pay-2"))!.status !== "sent")
      await new Promise((resolve) => setTimeout(resolve, 5));
    const after = await restart().resume("pay-2");
    const resent = swallowing();
    await after.send({ submitter: resent });
    expect(resent.calls).toEqual([hanging.calls[0]]);
    expect(after.attempts[0]!.sends).toBe(1);
  });

  it("collects the other signatures with addWitnesses after a crash between them", async () => {
    const { builder, wallet, address, store, provider } = await storeSetup();
    const second = await secondKey();
    const a = builder.intent([pay(), second.part], {
      id: "pay",
      payer: address,
    });
    const built = await a.build();
    await a.addWitnesses(await wallet.signTx(built.tx, true));
    expect(a.missing).toHaveLength(1);
    const again = await builderOf(provider, { store }).resume("pay");
    expect(again.missing).toEqual(a.missing);
    await again.addWitnesses(await second.other.signTx(built.tx, true));
    expect(again.status).toBe("signed");
    await again.send({ waitFor: "included" });
    expect(again.status).toBe("final");
  });

  it("refuses send() and build() after a crash between the closing mark and abandoned; advance() closes", async () => {
    const { builder, wallet, store, provider, emulator } = await storeSetup();
    const a = builder.intent(pay(), { id: "pay", payer: wallet });
    await a.send({ submitter: swallowing() });
    expectCode(await caught(a.abandon()), "STILL_LIVE");
    const again = await builderOf(provider, { store }).resume("pay", {
      payer: wallet,
    });
    for (const call of [again.send(), again.build()]) {
      const error = await caught(call);
      expectCode(error, "INVALID_STATE");
      expect(reasonOf(error)).toBe("closing");
    }
    advance(emulator, 700);
    await again.advance();
    expect(again.status).toBe("abandoned");
    expect((await stored(store, "pay")).status).toBe("abandoned");
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
    const intent = builder.intent(
      [
        spend.native({ utxo: vaultUtxo, script: vault }),
        output({ address: recipient, value: { lovelace: 50_000_000n } }),
        guard.pubKey({ keyHash: await keyOf(alice) }),
        guard.pubKey({ keyHash: await keyOf(bob) }),
      ],
      { id: "payout-17", payer: vaultAddress, ttlMs: 3 * 86_400_000 },
    );
    const { tx } = await intent.build();
    const monday = await builderOf(provider, { store }).resume("payout-17");
    await monday.addWitnesses(await alice.signTx(tx, true));
    expect(monday.missing).toHaveLength(1);
    const wednesday = await builderOf(provider, { store }).resume("payout-17");
    await wednesday.addWitnesses(await bob.signTx(tx, true));
    expect(wednesday.status).toBe("signed");
    await wednesday.send({ waitFor: "included" });
    expect(wednesday.status).toBe("final");
  });
});
