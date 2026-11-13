import type { UTxO } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";

import type {
  OutRef,
  StoredTxPlanJSON,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import {
  memoryPlanStore,
  output,
  spend,
  toUtxo,
  TxError,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  pay,
  setup,
  swallowing,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { stored, watchStore } from "./store-util";

// A recorded id given again: a repeated request handler, the comparisons of its parts, deadlines,
// data options and parents with the record; parents after a restart; the payer and the
// selection of a plan restored with resume.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** `txHash#index` of a UTxO given in the Mesh form or returned in the builder's */
const key = (utxo: Pick<UTxO, "input"> | OutRef) => {
  const { txHash, outputIndex } = "input" in utxo ? utxo.input : utxo;
  return `${txHash}#${outputIndex}`;
};

/** An emulator, a wallet and a builder over a watched store; `instance()` is another process */
const storeSetup = async (options: Parameters<typeof setup>[0] = {}) => {
  const store = watchStore();
  const ctx = await setup({
    ...options,
    builder: { store, ...options.builder },
  });
  const instance = (extra: Parameters<typeof builderOf>[1] = {}) => {
    const own = watchStore(store.inner);
    const provider = wrap(ctx.emulator);
    return {
      store: own,
      provider,
      builder: builderOf(provider, { store: own, ...extra }),
    };
  };
  return { ...ctx, store, instance };
};

/** Every request a wrapped provider got */
const requests = (provider: { control: { calls: Record<string, number> } }) =>
  Object.values(provider.control.calls).reduce((a, b) => a + b, 0);

/** A wallet whose calls are counted */
const counted = <T extends object>(wallet: T) => {
  const calls: Record<string, number> = {};
  const proxy = new Proxy(wallet, {
    get(target, name, receiver) {
      const value = Reflect.get(target, name, receiver);
      if (typeof value !== "function" || typeof name !== "string") return value;
      return (...args: unknown[]) => {
        calls[name] = (calls[name] ?? 0) + 1;
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { wallet: proxy, calls };
};

describe("A recorded id given to builder.plan", () => {
  it("is the same plan for the same parts: build() returns the current attempt and writes nothing", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const first = await builder
      .plan([pay(), pay(2_000_000n, baseAddress(3))], {
        id: "order-1",
        payer: wallet,
      })
      .build();
    const other = instance();
    const again = other.builder.plan([pay(), pay(2_000_000n, baseAddress(3))], {
      id: "order-1",
      payer: wallet,
    });
    const built = await again.build();
    expect(built.txHash).toBe(first.txHash);
    expect(again.attempts).toHaveLength(1);
    expect(other.store.saves()).toEqual([]);
    expect((await stored(store, "order-1")).attempts).toHaveLength(1);
  });

  it("is PLAN_EXISTS from the first await for other parts, also the same parts in another order", async () => {
    const { builder, wallet, instance, store } = await storeSetup();
    const parts = [pay(), pay(2_000_000n, baseAddress(3))];
    await builder.plan(parts, { id: "order-1", payer: wallet }).build();
    const before = await stored(store, "order-1");
    for (const others of [[pay(6_000_000n)], [...parts].reverse()]) {
      const other = instance();
      const plan = other.builder.plan(others, {
        id: "order-1",
        payer: wallet,
      });
      const error = (await caught(plan.build())) as TxPlanError;
      expectCode(error, "PLAN_EXISTS");
      expect(error.planId).toBe("order-1");
      expect(error.retryable).toBe(false);
      // It took no record, and the next method compares again
      expect(plan.status).toBe("draft");
      expectCode(await caught(plan.send()), "PLAN_EXISTS");
      expect(other.store.saves()).toEqual([]);
      expect(other.provider.control.count("submitTx")).toBe(0);
    }
    expect(await stored(store, "order-1")).toStrictEqual(before);
  });

  it("is PLAN_EXISTS for an explicit deadline other than the recorded one; the builder's defaults are not compared", async () => {
    const { builder, wallet, instance } = await storeSetup();
    await builder
      .plan(pay(), { id: "order-1", payer: wallet, expiryMarginMs: 0 })
      .build();
    const error = await caught(
      instance()
        .builder.plan(pay(), {
          id: "order-1",
          payer: wallet,
          expiryMarginMs: 600_000,
        })
        .refresh(),
    );
    expectCode(error, "PLAN_EXISTS");
    expect((error as Error).message).toMatch(/expiryMarginMs/);
    // A deploy with other defaults goes on with the recorded deadlines
    const deployed = instance({
      planDefaults: { ...FAST, ttlMs: 1_234_000, confirmations: 7 },
    });
    const plan = deployed.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    await plan.refresh();
    expect(plan.toJSON().deadlines).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: 0,
      confirmations: 0,
    });
  });

  it("compares the data options with the recorded ones, and takes those not given from the record", async () => {
    const { builder, wallet, instance, funded, emulator, address } =
      await storeSetup();
    const first = builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
      fee: 400_000n,
      knownUtxos: funded,
    });
    await first.build();
    // Recorded in the builder's form, whatever form they were given in
    expect(recordOf(first).options.knownUtxos).toEqual(
      funded.map((utxo) => toUtxo(utxo)),
    );
    const given = (options: object) =>
      instance()
        .builder.plan(pay(), { id: "order-1", payer: wallet, ...options })
        .refresh();
    for (const options of [
      { fee: 500_000n, knownUtxos: funded },
      { fee: 400_000n, knownUtxos: [...funded].reverse() },
      // An option given where the record holds none
      { fee: 400_000n, knownUtxos: funded, sendAllTo: address },
      { fee: 400_000n, knownUtxos: funded, extraKeyWitnesses: 1 },
    ]) {
      const other = instance();
      const error = await caught(
        other.builder
          .plan(pay(), { id: "order-1", payer: wallet, ...options })
          .refresh(),
      );
      expectCode(error, "PLAN_EXISTS");
      expect(other.store.saves()).toEqual([]);
    }
    // The same values pass, the same UTxOs in another form too, and so does a plan that gives
    // none of them
    await given({ fee: 400_000n, knownUtxos: funded });
    await given({
      fee: 400_000n,
      knownUtxos: funded.map((utxo) => toUtxo(utxo)),
    });
    await given({
      fee: 400_000n,
      knownUtxos: funded.map((utxo) =>
        toTxUnspentOutput(utxo).toCbor().toString(),
      ),
    });
    await given({ fee: 400_000n });
    const bare = instance().builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    await bare.refresh();
    advance(emulator, 700);
    await bare.refresh();
    expect(bare.status).toBe("expired");
    const next = await bare.build();
    // The new attempt is built with the recorded fee
    expect(next.fee).toBe(400_000n);
    expect(bare.attempts).toHaveLength(2);
  });

  it("is PLAN_EXISTS for another sendAllTo than the recorded one; the same one passes", async () => {
    const { builder, wallet, instance } = await storeSetup();
    await builder
      .plan(pay(), {
        id: "order-1",
        payer: wallet,
        sendAllTo: baseAddress(3),
      })
      .build();
    const other = instance();
    const error = await caught(
      other.builder
        .plan(pay(), {
          id: "order-1",
          payer: wallet,
          sendAllTo: baseAddress(4),
        })
        .refresh(),
    );
    expectCode(error, "PLAN_EXISTS");
    expect((error as Error).message).toMatch(/sendAllTo/);
    const same = other.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
      sendAllTo: baseAddress(3),
    });
    await same.refresh();
    expect(same.attempts).toHaveLength(1);
    expect(other.store.saves()).toEqual([]);
  });

  it("shares the first read between concurrent first calls, and reads again after a read that threw", async () => {
    const { builder, wallet, instance } = await storeSetup();
    await builder.plan(pay(), { id: "order-1", payer: wallet }).build();
    const other = instance();
    const plan = other.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    await Promise.all([plan.refresh(), plan.build(), plan.refresh()]);
    expect(other.store.loads("order-1")).toBe(1);
    expect(plan.attempts).toHaveLength(1);

    const third = instance();
    third.store.hooks.load = async () => {
      delete third.store.hooks.load;
      throw new Error("the database is down");
    };
    const late = third.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    const error = await caught(late.refresh());
    expectCode(error, "STORE_FAILED");
    expect(late.status).toBe("draft");
    // The next method makes the first read again
    await late.refresh();
    expect(third.store.loads("order-1")).toBe(2);
    expect(late.attempts).toHaveLength(1);
    expect(third.store.saves()).toEqual([]);
  });

  it("is synchronous and makes no request; until the first await it shows a draft", async () => {
    const { builder, wallet, instance } = await storeSetup();
    await builder.plan(pay(), { id: "order-1", payer: wallet }).send();
    const other = instance();
    const plan = other.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    expect(requests(other.provider)).toBe(0);
    expect(other.store.calls).toEqual([]);
    expect(plan.status).toBe("draft");
    expect(plan.attempts).toEqual([]);
    expect(plan.live).toEqual([]);
    expect(plan.landed).toBeUndefined();
    expect(plan.built).toBeUndefined();
    expect(plan.signedTx).toBeUndefined();
    expect(plan.txHash).toBeUndefined();
    expect(plan.missing).toEqual([]);
    expect(plan.closing).toBe(false);
    expect(plan.id).toBe("order-1");
    expect(plan.toJSON().rev).toBe(0);
    await plan.refresh();
    expect(plan.status).not.toBe("draft");
    expect(plan.attempts).toHaveLength(1);
    expect(other.store.loads("order-1")).toBe(1);
  });

  it("is NOT_SERIALIZABLE at once for a redeemer function with a store; without one it works in memory", async () => {
    const { builder, wallet, emulator, provider, store } = await storeSetup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const parts = spend.plutus({
      utxo: locked,
      script: plutus,
      redeemer: { data: (tx) => mConStr0([tx.self]) },
      label: "unlock",
    });
    const calls = requests(provider);
    const error = (() => {
      try {
        builder.plan(parts, { id: "unlock", payer: wallet });
      } catch (error) {
        return error;
      }
      return undefined;
    })() as TxBuildError;
    expectCode(error, "NOT_SERIALIZABLE");
    expect(error).toMatchObject({ part: "spend", label: "unlock" });
    expect(requests(provider)).toBe(calls);
    expect(store.calls).toEqual([]);

    const inMemory = builderOf(provider).plan(parts, { payer: wallet });
    await inMemory.send({ waitFor: "included" });
    expect(inMemory.status).toBe("final");
    expectCode(
      (() => {
        try {
          inMemory.toJSON();
        } catch (error) {
          return error;
        }
        return undefined;
      })(),
      "NOT_SERIALIZABLE",
    );
  });

  it("is NETWORK_MISMATCH from resume and from the first await for a record of another network", async () => {
    const { builder, wallet, store, emulator } = await storeSetup();
    await builder.plan(pay(), { id: "order-1", payer: wallet }).build();
    // A provider that reads a tip and states no network
    const tipOnly = {
      fetchLatestBlock: async () => emulator.fetchLatestBlock(),
    } as unknown as Parameters<typeof builderOf>[0];
    const preview = builderOf(tipOnly, {
      store,
      network: "preview",
      params: await emulator.fetchProtocolParameters(),
    });
    for (const call of [
      preview.resume("order-1"),
      preview.plan(pay(), { id: "order-1" }).refresh(),
    ]) {
      const error = (await caught(call)) as TxBuildError<"NETWORK_MISMATCH">;
      expectCode(error, "NETWORK_MISMATCH");
      expect(error.details.expected).toEqual({
        name: "preview",
        networkId: 0,
      });
      expect(error.details.found).toEqual([
        { role: "record", network: "preprod" },
      ]);
    }
  });
});

describe("A record this library does not read", () => {
  const MUTATIONS: [string, (json: StoredTxPlanJSON) => object, RegExp][] = [
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

  const stage = async (mutate: (json: StoredTxPlanJSON) => object) => {
    const ctx = await storeSetup();
    await ctx.builder.plan(pay(), { id: "order-1", payer: ctx.wallet }).build();
    const now = (await ctx.store.inner.load("order-1"))!;
    await ctx.store.inner.save(
      { ...mutate(now), rev: now.rev + 1 } as StoredTxPlanJSON,
      now.rev,
    );
    return ctx;
  };

  const expectUnread = (error: unknown, named: RegExp) => {
    const failure = error as TxPlanError<"INVALID_STATE">;
    expectCode(failure, "INVALID_STATE");
    expect(failure.details.reason).toBe("recordVersion");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(named);
    expect(failure.planId).toBe("order-1");
  };

  it.each(MUTATIONS)(
    "is recordVersion at resume: %s",
    async (_, mutate, named) => {
      const { instance, wallet } = await stage(mutate);
      const other = instance();
      expectUnread(
        await caught(other.builder.resume("order-1", { payer: wallet })),
        named,
      );
      expect(other.store.saves()).toEqual([]);
      expect(requests(other.provider)).toBe(0);
    },
  );

  it.each(MUTATIONS)(
    "is recordVersion at the first await of builder.plan: %s",
    async (_, mutate, named) => {
      const { instance, wallet } = await stage(mutate);
      const other = instance();
      const plan = other.builder.plan(pay(), {
        id: "order-1",
        payer: wallet,
      });
      expectUnread(await caught(plan.send()), named);
      expect(other.store.saves()).toEqual([]);
      expect(other.provider.control.count("submitTx")).toBe(0);
      expect(plan.status).toBe("draft");
    },
  );

  it("is recordVersion for a parent's record of a newer version when its child is restored without after", async () => {
    const { builder, wallet, store, instance } = await storeSetup();
    const parent = builder.plan(pay(), { id: "parent", payer: wallet });
    await parent.send();
    await builder
      .plan(pay(3_000_000n), { id: "child", payer: wallet, after: parent })
      .build();
    const now = (await store.inner.load("parent"))!;
    await store.inner.save({ ...now, version: 2, rev: now.rev + 1 }, now.rev);
    const error = (await caught(
      instance().builder.resume("child"),
    )) as TxPlanError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("recordVersion");
    expect(error.planId).toBe("parent");
    expect(error.message).toMatch(/version 2/);
  });
});

describe("Parents of a plan with a store", () => {
  /** A parent sent to the chain and a child built on its attempt */
  const chain = async () => {
    const ctx = await storeSetup();
    const parent = ctx.builder.plan(pay(), {
      id: "parent",
      payer: ctx.wallet,
    });
    await parent.send({ waitFor: "included" });
    const child = ctx.builder.plan(pay(3_000_000n), {
      id: "child",
      payer: ctx.wallet,
      after: parent,
    });
    await child.build();
    expect(child.attempts[0]!.parents![0]!.planId).toBe("parent");
    return { ...ctx, parent, child };
  };

  it("restores a child with its recorded parent in after, or loaded from the store without after", async () => {
    const { instance, wallet } = await chain();
    const withAfter = instance();
    const parent = await withAfter.builder.resume("parent");
    const a = await withAfter.builder.resume("child", {
      payer: wallet,
      after: parent,
    });
    await a.send({ waitFor: "included" });
    expect(a.status).toBe("final");
  });

  it("loads the parent from the store when no after is given", async () => {
    const { instance, wallet, store } = await chain();
    const other = instance();
    const before = other.store.loads("parent");
    const child = await other.builder.resume("child", { payer: wallet });
    expect(other.store.loads("parent")).toBe(before + 1);
    await child.send({ waitFor: "included" });
    expect(child.status).toBe("final");
    expect(other.store.saves("parent")).toEqual([]);
    expect((await stored(store, "child")).status).toBe("final");
  });

  it("is INVALID_OPTION (after) for another parent or one of the same id from another store; nothing built or written", async () => {
    const { instance, wallet, emulator } = await chain();
    const other = instance();
    // Another plan of the store
    const stranger = other.builder.plan(pay(4_000_000n), {
      id: "stranger",
      payer: wallet,
    });
    await stranger.build();
    // The parent's id over another store: it does not hold the recorded attempt
    advance(emulator, 1);
    const elsewhere = builderOf(wrap(emulator), {
      store: memoryPlanStore(),
    }).plan(pay(), { id: "parent", payer: wallet });
    await elsewhere.build();
    other.store.reset();
    for (const after of [
      stranger,
      elsewhere,
      [await other.builder.resume("parent"), stranger],
    ]) {
      const error = (await caught(
        other.builder.resume("child", { payer: wallet, after }),
      )) as TxBuildError<"INVALID_OPTION">;
      expectCode(error, "INVALID_OPTION");
      expect(error.details.option).toBe("after");
    }
    expect(other.store.saves()).toEqual([]);
  });

  it("is INVALID_OPTION (after) for a plan recorded without parents that is restored with after", async () => {
    const { builder, wallet, instance } = await storeSetup();
    const lone = builder.plan(pay(), { id: "lone", payer: wallet });
    await lone.build();
    const parent = builder.plan(pay(2_000_000n), { id: "p", payer: wallet });
    await parent.build();
    const other = instance();
    const error = (await caught(
      other.builder.resume("lone", {
        after: await other.builder.resume("p"),
      }),
    )) as TxBuildError<"INVALID_OPTION">;
    expectCode(error, "INVALID_OPTION");
    expect(error.details.option).toBe("after");
    expect(other.store.saves()).toEqual([]);
  });

  it("takes an empty after as a set of no parents: INVALID_OPTION at resume and PLAN_EXISTS at builder.plan of a child", async () => {
    const { instance, wallet } = await chain();
    const other = instance();
    const error = (await caught(
      other.builder.resume("child", { payer: wallet, after: [] }),
    )) as TxBuildError<"INVALID_OPTION">;
    expectCode(error, "INVALID_OPTION");
    expect(error.details.option).toBe("after");
    expect(other.store.loads("parent")).toBe(0);
    expectCode(
      await caught(
        other.builder
          .plan(pay(3_000_000n), { id: "child", payer: wallet, after: [] })
          .refresh(),
      ),
      "PLAN_EXISTS",
    );
    expect(other.store.saves()).toEqual([]);
    // A plan recorded without parents takes it
    const parent = await other.builder.resume("parent", { after: [] });
    expect(parent.status).toBe("final");
  });

  it("is PLAN_NOT_FOUND naming the depth for a chain of parents longer than the library follows", async () => {
    const { instance, store } = await chain();
    const child = (await store.inner.load("child"))!;
    const txHash = child.attempts[0]!.txHash;
    // A chain of records, each standing on the attempt of the next one
    const link = (i: number) =>
      ({
        ...child,
        id: `link-${i}`,
        rev: 1,
        attempts: child.attempts.map((attempt) => ({
          ...attempt,
          parents: attempt.parents!.map((parent) => ({
            ...parent,
            txHash,
            planId: `link-${i + 1}`,
          })),
        })),
      }) as StoredTxPlanJSON;
    for (let i = 0; i <= 65; i++) await store.inner.save(link(i), 0);
    const error = (await caught(
      instance().builder.resume("link-0"),
    )) as TxPlanError;
    expectCode(error, "PLAN_NOT_FOUND");
    expect(error.planId).toBe("link-66");
    expect(error.message).toMatch(/longer than the 64 plans/);
    expect(error.message).not.toMatch(/without the id/);
  });

  it("restores a child of two parents with after naming them in the other order", async () => {
    const { builder, wallet, instance } = await storeSetup({
      funds: [100_000_000n, 50_000_000n, 30_000_000n],
    });
    const p1 = builder.plan(pay(), { id: "p1", payer: wallet });
    await p1.send({ waitFor: "included" });
    // Not on the first parent's change, which the child spends
    const p2 = builder.plan(pay(4_000_000n), {
      id: "p2",
      payer: wallet,
      canSelect: (utxo) => utxo.txHash !== p1.txHash,
    });
    await p2.send({ waitFor: "included" });
    const child = builder.plan(pay(3_000_000n), {
      id: "child",
      payer: wallet,
      after: [p1, p2],
    });
    await child.build();
    const other = instance();
    const again = await other.builder.resume("child", {
      payer: wallet,
      after: [
        await other.builder.resume("p2"),
        await other.builder.resume("p1"),
      ],
    });
    await again.send({ waitFor: "included" });
    expect(again.status).toBe("final");
  });

  it("is PLAN_EXISTS for builder.plan of a recorded id with after naming another parent; takes the record's without after", async () => {
    const { builder, wallet, instance } = await chain();
    const stranger = builder.plan(pay(4_000_000n), {
      id: "stranger",
      payer: wallet,
    });
    await stranger.build();
    const other = instance();
    const error = await caught(
      other.builder
        .plan(pay(3_000_000n), {
          id: "child",
          payer: wallet,
          after: await other.builder.resume("stranger"),
        })
        .refresh(),
    );
    expectCode(error, "PLAN_EXISTS");

    // Without after: the recorded parents
    const bare = other.builder.plan(pay(3_000_000n), {
      id: "child",
      payer: wallet,
    });
    await bare.refresh();
    expect(bare.attempts).toHaveLength(1);

    // With after: the recorded parent, made by builder.plan and not read yet
    const third = instance();
    const parent = third.builder.plan(pay(), { id: "parent", payer: wallet });
    expect(parent.status).toBe("draft");
    const child = third.builder.plan(pay(3_000_000n), {
      id: "child",
      payer: wallet,
      after: parent,
    });
    await child.refresh();
    expect(parent.status).not.toBe("draft");
    await child.send({ waitFor: "included" });
    expect(child.status).toBe("final");
  });

  it("allows a parent of another store; after a restart it is given in after", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const theirs = watchStore();
    const provider = wrap(emulator);
    const parent = builderOf(provider, { store: theirs }).plan(pay(), {
      id: "parent",
      payer: wallet,
    });
    await parent.send({ waitFor: "included" });
    const child = builder.plan(pay(3_000_000n), {
      id: "child",
      payer: wallet,
      after: parent,
    });
    await child.build();
    expect(child.attempts[0]!.parents![0]!.txHash).toBe(parent.txHash);

    const other = instance();
    const error = (await caught(
      other.builder.resume("child", { payer: wallet }),
    )) as TxPlanError;
    expectCode(error, "PLAN_NOT_FOUND");
    expect(error.planId).toBe("parent");
    const restored = await builderOf(provider, { store: theirs }).resume(
      "parent",
    );
    const again = await other.builder.resume("child", {
      payer: wallet,
      after: restored,
    });
    await again.send({ waitFor: "included" });
    expect(again.status).toBe("final");
  });

  it("refuses a parent object behind the child's record, and reads stored parents again before a new attempt", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const parent = builder.plan(pay(), { id: "parent", payer: wallet });
    await parent.send({ submitter: swallowing() });
    // An object of the parent restored before its second attempt
    const behind = await instance().builder.resume("parent");
    advance(emulator, 700);
    await parent.refresh();
    await parent.build();
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(pay(3_000_000n), {
      id: "child",
      payer: wallet,
      after: parent,
    });
    await child.build();
    expect(child.attempts[0]!.parents![0]!.txHash).toBe(parent.txHash);

    const other = instance();
    const error = (await caught(
      other.builder.resume("child", { payer: wallet, after: behind }),
    )) as TxBuildError<"INVALID_OPTION">;
    expectCode(error, "INVALID_OPTION");
    expect(error.details.option).toBe("after");
    await other.builder.resume("child", {
      payer: wallet,
      after: await other.builder.resume("parent"),
    });

    // Restored without after; the parent then gets a new attempt from another object
    const loaded = await other.builder.resume("child", { payer: wallet });
    advance(emulator, 700);
    await parent.refresh();
    const third = await parent.build();
    await parent.send({ submitter: swallowing() });
    await loaded.refresh();
    expect(loaded.status).toBe("expired");
    // A reload of the parent that throws: nothing built or written
    const childSaves = other.store.saves("child").length;
    other.store.hooks.load = async (forward, id) => {
      if (id !== "parent") return forward(id);
      delete other.store.hooks.load;
      throw new Error("the database is down");
    };
    expectCode(await caught(loaded.build()), "STORE_FAILED");
    expect(loaded.attempts).toHaveLength(1);
    expect(other.store.saves("child")).toHaveLength(childSaves);
    const loads = other.store.loads("parent");
    await loaded.build();
    expect(other.store.loads("parent")).toBe(loads + 1);
    expect(loaded.attempts[1]!.parents![0]!.txHash).toBe(third.txHash);
    expect(other.store.saves("parent")).toEqual([]);
  });
});

describe("The payer and the selection after resume", () => {
  it("resends the same bytes without a payer, and a new attempt is MISSING_PAYER", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const plan = builder.plan(pay(), { id: "pay", payer: wallet });
    const submitter = swallowing();
    await plan.send({ submitter });
    const again = await instance().builder.resume("pay");
    const resent = swallowing();
    await again.send({ submitter: resent });
    expect(resent.calls).toEqual(submitter.calls);
    advance(emulator, 700);
    await again.refresh();
    expect(again.status).toBe("expired");
    expectCode(await caught(again.build()), "MISSING_PAYER");
    expect(again.attempts).toHaveLength(1);
  });

  it("calls no payer at resume and at a resend; compares it only where a new attempt is built", async () => {
    const { builder, wallet, emulator, instance, store } = await storeSetup();
    const plan = builder.plan(pay(), { id: "pay", payer: wallet });
    await plan.send({ submitter: swallowing() });
    const foreign = counted(await walletOf(1));
    const again = await instance().builder.resume("pay", {
      payer: foreign.wallet,
    });
    await again.send({ submitter: swallowing() });
    expect(foreign.calls).toEqual({});

    advance(emulator, 700);
    await again.refresh();
    const written = store.written().length;
    const recorded = (await stored(store, "pay")).options.changeAddress;
    for (const call of [
      () => again.build(),
      // The foreign wallet can sign: advance() builds, and is refused the same way
      () => again.advance(),
    ]) {
      const error = (await caught(call())) as TxPlanError<"PAYER_MISMATCH">;
      expectCode(error, "PAYER_MISMATCH");
      expect(error.details).toEqual({
        recorded,
        given: await foreign.wallet.getChangeAddress(),
      });
      expect(again.attempts).toHaveLength(1);
    }
    expect(store.written().length).toBe(written);

    // A payer of another change address that holds the recorded anchor is accepted
    const anchor = recordOf(again).anchor.anchors[0]!.utxo;
    const next = await again.build({
      payer: { changeAddress: baseAddress(9), utxos: [anchor] },
    });
    expect(next.inputs.map(key)).toContain(key(anchor));
    expect(next.change[0]!.address).toBe(recorded);
  });

  it("raises no PAYER_MISMATCH for a foreign payer on a plan with the closing mark or a final one", async () => {
    const { builder, wallet, emulator, instance } = await storeSetup();
    const marked = builder.plan(pay(), { id: "marked", payer: wallet });
    await marked.send({ submitter: swallowing() });
    expectCode(await caught(marked.abandon()), "STILL_LIVE");
    const done = builder.plan(pay(4_000_000n), { id: "done", payer: wallet });
    await done.send({ waitFor: "included" });
    const foreign = await walletOf(1);
    const other = instance();
    const a = await other.builder.resume("marked", { payer: foreign });
    await a.advance();
    advance(emulator, 700);
    await a.advance();
    expect(a.status).toBe("abandoned");
    const b = await other.builder.resume("done", { payer: foreign });
    await b.advance();
    expect(b.status).toBe("final");
  });

  it("builds a new attempt without the filter and the selection that are not given again, on the same anchor", async () => {
    const { builder, wallet, emulator, instance, funded } = await storeSetup();
    const filtered: string[] = [];
    const selections: number[] = [];
    const plan = builder.plan(pay(), {
      id: "pay",
      payer: wallet,
      canSelect: (utxo) => {
        filtered.push(key(utxo));
        return key(utxo) !== key(funded[0]!);
      },
      coinSelection: (_need, candidates, { round }) => {
        selections.push(round);
        return candidates;
      },
    });
    const first = await plan.build();
    expect(first.inputs.map(key)).not.toContain(key(funded[0]!));
    const anchor = recordOf(plan).anchor.anchors[0]!.utxo;
    advance(emulator, 700);
    await plan.refresh();
    const seen = [filtered.length, selections.length];
    const again = await instance().builder.resume("pay", { payer: wallet });
    const next = await again.build();
    expect([filtered.length, selections.length]).toEqual(seen);
    expect(next.inputs.map(key)).toContain(key(anchor));
    expect(next.txHash).not.toBe(first.txHash);
  });

  it("keeps a plan with sendAllTo to the UTxOs its replaced attempt used after a restart", async () => {
    const { builder, wallet, emulator, instance, address } = await storeSetup();
    const plan = builder.plan([], {
      id: "sweep",
      payer: wallet,
      sendAllTo: baseAddress(3),
    });
    const first = await plan.build();
    advance(emulator, 700);
    await plan.refresh();
    // A new UTxO reaches the payer
    const late = emulator.fund(address, { lovelace: 33_000_000n });
    const again = await instance().builder.resume("sweep", { payer: wallet });
    const next = await again.build();
    const used = new Set(first.inputs.map(key));
    expect(next.inputs.map(key)).not.toContain(key(late));
    expect(next.inputs.every((utxo) => used.has(key(utxo)))).toBe(true);
  });

  it("restores the recorded parts only: the parts the builder holds from add are not read", async () => {
    const { builder, wallet, emulator, instance, store } = await storeSetup();
    const plan = builder.plan(pay(), { id: "pay", payer: wallet });
    await plan.build();
    advance(emulator, 700);
    await plan.refresh();
    const holding = instance().builder.add(
      output({
        label: "extra",
        address: baseAddress(4),
        value: { lovelace: 3_000_000n },
      }),
    );
    const again = await holding.resume("pay", { payer: wallet });
    expect(again.toJSON().parts).toStrictEqual(
      (await stored(store, "pay")).parts,
    );
    const next = await again.build();
    expect(next.outputs.some((o) => o.address === baseAddress(4))).toBe(false);
  });
});
