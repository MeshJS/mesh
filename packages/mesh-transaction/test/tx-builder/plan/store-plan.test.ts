import type { IFetcher } from "@meshsdk/common";
import { customNetwork, mConStr0 } from "@meshsdk/core";

import type {
  StoredTxPlanJSON,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import { spend, TxBuilder, TxError } from "../../../src/tx-builder";
import { NOT_UNPAID } from "../../../src/tx-builder/errors";
import { alwaysSucceedCbor } from "../../test-util";
import {
  builderOf,
  caught,
  pay,
  setup,
  submitterOf,
  wrap,
} from "./plan-emulator-util";
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

/** Every request a wrapped provider got */
const requests = (provider: { control: { calls: Record<string, number> } }) =>
  Object.values(provider.control.calls).reduce((a, b) => a + b, 0);

/** A plan of one payment recorded under `order-1` on an emulator, and a watched store */
const recorded = async () => {
  const store = watchStore();
  const ctx = await setup({ builder: { store } });
  const plan = await ctx.builder.plan(pay(), {
    id: "order-1",
    payer: ctx.wallet,
  });
  store.reset();
  return { ...ctx, store, plan };
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

  it("is MISSING_ID from builder.plan without an id that is a non-empty string, before any request or read", async () => {
    const { provider, calls } = countingProvider();
    const store = watchStore();
    const builder = new TxBuilder({ network: "preprod", provider, store });
    for (const options of [{}, { id: "" }]) {
      const error = (await caught(
        builder.plan(pay(), options),
      )) as TxPlanError<"MISSING_ID">;
      expectCode(error, "MISSING_ID");
      expect(error.retryable).toBe(false);
      expect(error.message.endsWith(NOT_UNPAID)).toBe(true);
    }
    // An id that is not a string at all is an option of the wrong type
    const typed = (await caught(
      builder.plan(pay(), { id: 7 as unknown as string }),
    )) as TxBuildError<"INVALID_OPTION">;
    expectCode(typed, "INVALID_OPTION");
    expect(typed.details.option).toBe("id");
    // The id is checked before the parts and the deadlines
    expectCode(
      await caught(
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
    expectCode(await caught(builder.plan(pay(), { ttlMs: 0 })), "MISSING_ID");
    expect(calls).toEqual([]);
    expect(store.calls).toEqual([]);
  });

  it("needs no id without a store, and records nothing", async () => {
    const { builder, wallet } = await setup();
    const plan = await builder.plan(pay(), { payer: wallet });
    expect(plan.id).toBeUndefined();
    expect(plan.toJSON()).not.toHaveProperty("id");
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

  it("makes no request, whatever the provider; the provider is probed before the first delivery, and nothing is sent", async () => {
    const { emulator, store, plan, wallet } = await recorded();
    // A provider that cannot search for a transaction
    const blind = wrap(emulator, { fetchTxInfo: null });
    const again = await builderOf(blind, { store }).resume("order-1", {
      payer: wallet,
    });
    expect(requests(blind)).toBe(0);
    expect(again.toJSON()).toStrictEqual(plan.toJSON());
    const submitter = submitterOf(async () => "never");
    const error = (await caught(
      again.run({ submitter }),
    )) as TxPlanError<"CANNOT_OBSERVE">;
    expectCode(error, "CANNOT_OBSERVE");
    expect(error.details.reason).toBe("noSearch");
    expect(submitter.calls).toEqual([]);
    expect(blind.control.count("submitTx")).toBe(0);
    const record = (await store.load("order-1"))!;
    expect(record.steps[0]!.sends).toBe(0);
  });

  it("is NETWORK_MISMATCH for a record of a network with another slot clock, from resume and from builder.plan; the same network restores it", async () => {
    const { store, plan } = await recorded();
    const devnet = (zeroTime: number) =>
      customNetwork({
        name: "devnet",
        systemStart: zeroTime,
        slotLengthMs: 1000,
        epochLength: 500,
      });
    const json = plan.toJSON() as StoredTxPlanJSON;
    await store.inner.save(
      {
        ...json,
        rev: json.rev + 1,
        network: devnet(1_700_000_000_000),
      } as StoredTxPlanJSON,
      json.rev,
    );
    store.reset();
    const { provider, calls } = countingProvider();
    const other = new TxBuilder({
      network: devnet(1_700_000_100_000),
      provider,
      store,
    });
    for (const call of [
      other.resume("order-1"),
      other.plan(pay(), {
        id: "order-1",
        payer: { changeAddress: "x" } as never,
      }),
    ]) {
      const error = (await caught(call)) as TxBuildError<"NETWORK_MISMATCH">;
      expectCode(error, "NETWORK_MISMATCH");
      expect(error.message).toMatch(/slot clock/);
      expect(error.details.found).toEqual([
        { role: "record", network: "devnet", networkId: 0 },
      ]);
    }
    expect(calls).toEqual([]);
    expect(store.saves()).toEqual([]);
    const again = await new TxBuilder({
      network: devnet(1_700_000_000_000),
      provider,
      store,
    }).resume("order-1");
    expect(again.status).toBe("pending");
    expect(again.step("main").txHash).toBe(plan.step("main").txHash);
  });

  it("is INVALID_STATE (recordVersion) for a record of version 1, saying what it is; nothing built, written or sent", async () => {
    const { provider, calls } = countingProvider();
    const store = watchStore();
    // A record of a plan of one payment rebuilt in attempts
    await store.inner.save(
      {
        kind: "TxPlan",
        version: 1,
        id: "order-1",
        rev: 1,
        status: "draft",
        network: "preprod",
        deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 0 },
        parts: [],
        attempts: [],
        anchor: { anchors: [] },
        options: {},
      } as unknown as StoredTxPlanJSON,
      0,
    );
    const builder = new TxBuilder({ network: "preprod", provider, store });
    const payer = { changeAddress: "x", utxos: [] };
    for (const call of [
      builder.resume("order-1"),
      builder.plan(pay(), { id: "order-1", payer }),
    ]) {
      const error = (await caught(call)) as TxPlanError<"INVALID_STATE">;
      expectCode(error, "INVALID_STATE");
      expect(error.details.reason).toBe("recordVersion");
      expect(error.retryable).toBe(false);
      expect(error.planId).toBe("order-1");
      expect(error.message).toMatch(
        /the version 1: a record of a plan of one payment built anew in attempts, a format this library does not read; it reads version 2/,
      );
    }
    expect(store.saves()).toEqual([]);
    expect(calls).toEqual([]);
  });
});
