import type { IFetcher } from "@meshsdk/common";
import {
  customNetwork,
  DEFAULT_PROTOCOL_PARAMETERS,
  mConStr0,
} from "@meshsdk/core";

import type {
  StoredTxPlanJSON,
  TxBuilderOptions,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import { spend, TxBuilder, TxError, TxPlan } from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import { caught, pay, setup } from "./plan-emulator-util";
import { watchStore } from "./store-util";

// The checks of a builder with a store that come before any request, and those of resume.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

/** A provider that reads a tip and counts every call; the members given replace its own */
const countingProvider = (members: Record<string, unknown> = {}) => {
  const calls: string[] = [];
  const provider = {
    fetchLatestBlock: async () => {
      calls.push("fetchLatestBlock");
      return { slot: "1", height: 1 };
    },
    fetchAddressUTxOs: async () => {
      calls.push("fetchAddressUTxOs");
      return [];
    },
    fetchTxInfo: async () => {
      calls.push("fetchTxInfo");
      throw new Error("not here");
    },
    ...members,
  };
  return { provider: provider as unknown as IFetcher, calls };
};

const builderWith = (options: Partial<TxBuilderOptions> = {}) =>
  new TxBuilder({
    network: "preprod",
    params: { ...DEFAULT_PROTOCOL_PARAMETERS },
    ...options,
  });

const thrown = (run: () => unknown): any => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

describe("TxBuilder with a store", () => {
  it("is INVALID_OPTION (store) from the constructor for a store without load and save, never holding the value", () => {
    const { provider } = countingProvider();
    const handle = { secret: "database password" };
    for (const store of [{}, { load() {}, handle }, null, "store"]) {
      const error = thrown(
        () =>
          new TxBuilder({
            network: "preprod",
            provider,
            store: store as never,
          }),
      ) as TxBuildError<"INVALID_OPTION">;
      expectCode(error, "INVALID_OPTION");
      expect(error.details.option).toBe("store");
      expect(typeof error.details.value).toBe("string");
      expect(JSON.stringify(error.details)).not.toContain("database password");
    }
    const store = watchStore();
    const builder = new TxBuilder({ network: "preprod", provider, store });
    expect(builder.store).toBe(store);
    // A builder made by add keeps the same store
    expect(builder.add(pay()).store).toBe(store);
  });

  it("is MISSING_ID at once without an id that is a non-empty string, after the checks of every plan", () => {
    const { provider, calls } = countingProvider();
    const store = watchStore();
    const builder = new TxBuilder({ network: "preprod", provider, store });
    for (const options of [{}, { id: "" }, { id: 7 as unknown as string }]) {
      const error = thrown(() =>
        builder.plan(pay(), options),
      ) as TxPlanError<"MISSING_ID">;
      expectCode(error, "MISSING_ID");
      expect(error.retryable).toBe(false);
    }
    // The checks of every plan come first: a deadline, then the provider
    expectCode(
      thrown(() => builder.plan(pay(), { ttlMs: 0 })),
      "INVALID_OPTION",
    );
    expectCode(
      thrown(() =>
        new TxBuilder({
          network: "preprod",
          params: { ...DEFAULT_PROTOCOL_PARAMETERS },
          store,
        }).plan(pay()),
      ),
      "CANNOT_OBSERVE",
    );
    // An id is checked before the parts
    expectCode(
      thrown(() =>
        builder.plan(
          spend.plutus({
            utxo: { txHash: "a".repeat(64), outputIndex: 0 },
            script: plutus,
            redeemer: { data: (tx) => mConStr0([tx.self]) },
          }),
        ),
      ),
      "MISSING_ID",
    );
    expect(calls).toEqual([]);
    expect(store.calls).toEqual([]);
    // Without a store no id is needed
    expect(
      new TxBuilder({ network: "preprod", provider }).plan(pay()).id,
    ).toBeUndefined();
  });

  it("is INVALID_OPTION (after) at once for a parent made by a builder without a store", () => {
    const { provider, calls } = countingProvider();
    const store = watchStore();
    const parent = new TxBuilder({ network: "preprod", provider }).plan(pay(), {
      id: "parent",
    });
    const error = thrown(() =>
      new TxBuilder({ network: "preprod", provider, store }).plan(pay(), {
        id: "child",
        after: parent,
      }),
    ) as TxBuildError<"INVALID_OPTION">;
    expectCode(error, "INVALID_OPTION");
    expect(error.details.option).toBe("after");
    expect(error.details.value).toEqual(["parent"]);
    expect(calls).toEqual([]);
    expect(store.calls).toEqual([]);
    // A parent of a builder with another store is taken
    const other = new TxBuilder({
      network: "preprod",
      provider,
      store: watchStore(),
    }).plan(pay(), { id: "parent" });
    expect(
      new TxBuilder({ network: "preprod", provider, store }).plan(pay(), {
        id: "child",
        after: other,
      }),
    ).toBeInstanceOf(TxPlan);
  });
});

describe("TxBuilder.resume", () => {
  it("is MISSING_STORE without a store, and MISSING_ID for an id that is not a non-empty string", async () => {
    const { provider } = countingProvider();
    const error = (await caught(
      new TxBuilder({ network: "preprod", provider }).resume("order-1"),
    )) as TxPlanError;
    expectCode(error, "MISSING_STORE");
    expect(error.retryable).toBe(false);
    const store = watchStore();
    const builder = new TxBuilder({ network: "preprod", provider, store });
    for (const id of ["", 7 as unknown as string])
      expectCode(await caught(builder.resume(id)), "MISSING_ID");
    expect(store.calls).toEqual([]);
  });

  it("is PLAN_NOT_FOUND without a record, and STORE_FAILED when the store throws", async () => {
    const { provider, calls } = countingProvider();
    const store = watchStore();
    const builder = new TxBuilder({ network: "preprod", provider, store });
    const missing = (await caught(builder.resume("order-1"))) as TxPlanError;
    expectCode(missing, "PLAN_NOT_FOUND");
    expect(missing.planId).toBe("order-1");
    store.hooks.load = async () => {
      throw new Error("the database is down");
    };
    const failed = (await caught(builder.resume("order-1"))) as TxPlanError;
    expectCode(failed, "STORE_FAILED");
    expect(failed.planId).toBe("order-1");
    expect(failed.cause).toEqual(new Error("the database is down"));
    expect(calls).toEqual([]);
  });

  it("is CANNOT_OBSERVE for a provider no plan can run on, before the store, also for a final record", async () => {
    const store = watchStore();
    const { emulator, builder, wallet } = await setup({ builder: { store } });
    const plan = builder.plan(pay(), { id: "order-1", payer: wallet });
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
    store.reset();
    const params = await emulator.fetchProtocolParameters();
    for (const [members, reason] of [
      [{ fetchLatestBlock: undefined }, "noTip"],
      [{ isCachingEnabled: () => true }, "addressCache"],
    ] as const) {
      const { provider } = countingProvider(members);
      const error = (await caught(
        builderWith({ provider, store, params }).resume("order-1"),
      )) as TxPlanError<"CANNOT_OBSERVE">;
      expectCode(error, "CANNOT_OBSERVE");
      expect(error.details.reason).toBe(reason);
      expect(error.planId).toBe("order-1");
    }
    expect(store.calls).toEqual([]);
  });

  it("is NETWORK_MISMATCH for a record of a network with another slot clock; the same network restores it", async () => {
    const { provider } = countingProvider();
    const store = watchStore();
    const devnet = (zeroTime: number) =>
      customNetwork({
        name: "devnet",
        systemStart: zeroTime,
        slotLengthMs: 1000,
        epochLength: 500,
      });
    await builderWith({ network: devnet(1_700_000_000_000), provider, store })
      .plan(pay(), { id: "order-1" })
      .abandon();
    const error = (await caught(
      builderWith({
        network: devnet(1_700_000_100_000),
        provider,
        store,
      }).resume("order-1"),
    )) as TxBuildError<"NETWORK_MISMATCH">;
    expectCode(error, "NETWORK_MISMATCH");
    expect(error.message).toMatch(/slot clock/);
    expect(error.details.found).toEqual([
      { role: "record", network: "devnet", networkId: 0 },
    ]);
    const again = await builderWith({
      network: devnet(1_700_000_000_000),
      provider,
      store,
    }).resume("order-1");
    expect(again.status).toBe("abandoned");
    // The first await of builder.plan compares the same way
    expectCode(
      await caught(
        builderWith({ network: devnet(1_700_000_100_000), provider, store })
          .plan(pay(), { id: "order-1" })
          .refresh(),
      ),
      "NETWORK_MISMATCH",
    );
  });

  it("is recordVersion for a record of version 1 whose shape it cannot read; nothing built, written or sent", async () => {
    const { provider, calls } = countingProvider();
    const store = watchStore();
    const builder = new TxBuilder({ network: "preprod", provider, store });
    await builder.plan(pay(), { id: "order-1" }).abandon();
    const json = (await store.inner.load("order-1"))!;
    const { ttlMs: _ttl, ...deadlines } = json.deadlines;
    await store.inner.save(
      { ...json, rev: 2, deadlines } as unknown as StoredTxPlanJSON,
      1,
    );
    store.reset();
    const error = (await caught(
      builder.resume("order-1"),
    )) as TxPlanError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("recordVersion");
    expect(error.message).toMatch(/deadlines\.ttlMs/);
    expect(store.saves()).toEqual([]);
    expect(calls).toEqual([]);
  });
});
