import type { UTxO } from "@meshsdk/core";
import { mConStr0 } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";

import type {
  StoredTxPlanJSON,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import { output, spend, toUtxo, TxError } from "../../../src/tx-builder";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import {
  builderOf,
  caught,
  FAST,
  pay,
  setup,
  swallowing,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { stored, watchStore } from "./store-util";

// A recorded id given again to builder.plan: a repeated request handler, and the comparison of
// its steps, deadlines, data options and payer with the record; a record this library does not
// read; the payer of a plan restored with resume.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** An emulator, a wallet and a builder over a watched store; `instance()` is another process */
const storeSetup = async (
  v: Validator,
  options: Parameters<typeof setup>[1] = {},
) => {
  const store = watchStore();
  const ctx = await setup(v, {
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

/** Two payments, the second standing on the first */
const twoSteps = () => ({ a: pay(), b: pay(2_000_000n, baseAddress(3)) });

describe.each(VALIDATORS)("A recorded id given to builder.plan (%s)", (v) => {
  it("is the recorded plan for the same steps and options: nothing is built or written", async () => {
    const { builder, wallet, instance, store } = await storeSetup(v);
    const first = await builder.plan(twoSteps(), {
      id: "order-1",
      payer: wallet,
    });
    const record = await stored(store, "order-1");
    const other = instance();
    const again = await other.builder.plan(twoSteps(), {
      id: "order-1",
      payer: wallet,
    });
    expect(again.toJSON()).toStrictEqual(record);
    expect(again.steps.map((step) => step.txHash)).toEqual(
      first.steps.map((step) => step.txHash),
    );
    expect(other.store.saves()).toEqual([]);
    expect(other.store.loads("order-1")).toBe(1);
    expect(requests(other.provider)).toBe(0);
  });

  it("is the recorded plan, as it stands, after the payer's UTxOs are gone: no error and no read of them", async () => {
    const { builder, wallet, instance, emulator, address } =
      await storeSetup(v);
    const first = await builder.plan(pay(), { id: "order-1", payer: wallet });
    await first.run();
    expect(first.status).toBe("final");
    // The wallet is drained after the payment landed
    emulator.removeUtxos(emulator.utxos({ address }).map((utxo) => utxo.input));
    expect(emulator.utxos({ address })).toEqual([]);

    const other = instance();
    const payer = counted(wallet);
    const again = await other.builder.plan(pay(), {
      id: "order-1",
      payer: payer.wallet,
    });
    expect(again.status).toBe("final");
    expect(again.toJSON()).toStrictEqual(first.toJSON());
    expect(other.provider.control.count("fetchAddressUTxOs")).toBe(0);
    expect(requests(other.provider)).toBe(0);
    expect(payer.calls.getUtxos ?? 0).toBe(0);
    expect(payer.calls.getUsedUTxOs ?? 0).toBe(0);
    expect(other.store.saves()).toEqual([]);
  });

  it("is PLAN_EXISTS for other steps, also the same steps in another order or under other names; nothing built or written", async () => {
    const { builder, wallet, instance, store } = await storeSetup(v);
    await builder.plan(twoSteps(), { id: "order-1", payer: wallet });
    const before = await stored(store, "order-1");
    const { a, b } = twoSteps();
    const variants: Parameters<typeof builder.plan>[0][] = [
      { a: pay(6_000_000n), b },
      { b, a },
      { first: a, second: b },
      [a, b],
      { a },
    ];
    for (const others of variants) {
      const other = instance();
      const error = (await caught(
        other.builder.plan(others, { id: "order-1", payer: wallet }),
      )) as TxPlanError;
      expectCode(error, "PLAN_EXISTS");
      expect(error.planId).toBe("order-1");
      expect(error.retryable).toBe(false);
      expect(error.message).toMatch(/nothing was built or written/);
      expect(other.store.saves()).toEqual([]);
      expect(requests(other.provider)).toBe(0);
    }
    expect(await stored(store, "order-1")).toStrictEqual(before);
  });

  it("is PLAN_EXISTS for an explicit deadline other than the recorded one; the builder's defaults are not compared", async () => {
    const { builder, wallet, instance } = await storeSetup(v);
    await builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
      expiryMarginMs: 0,
    });
    for (const deadline of [
      { expiryMarginMs: 600_000 },
      { ttlMs: 1_234_000 },
      { confirmations: 7 },
    ]) {
      const other = instance();
      const error = await caught(
        other.builder.plan(pay(), {
          id: "order-1",
          payer: wallet,
          ...deadline,
        }),
      );
      expectCode(error, "PLAN_EXISTS");
      expect(other.store.saves()).toEqual([]);
    }
    // A deploy with other defaults goes on with the recorded deadlines
    const deployed = instance({
      planDefaults: { ...FAST, ttlMs: 1_234_000, confirmations: 7 },
    });
    const plan = await deployed.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    expect(plan.toJSON().deadlines).toEqual({
      ttlMs: 600_000,
      expiryMarginMs: 0,
      confirmations: 0,
    });
    expect(deployed.store.saves()).toEqual([]);
  });

  it("compares the data options with the recorded ones", async () => {
    const { builder, wallet, instance, funded, address } = await storeSetup(v);
    const known = funded.map((utxo) => toUtxo(utxo));
    await builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
      fee: 400_000n,
      extraKeyWitnesses: 1,
      knownUtxos: known,
    });
    const given = { fee: 400_000n, extraKeyWitnesses: 1, knownUtxos: known };
    for (const options of [
      { ...given, fee: 500_000n },
      { ...given, extraKeyWitnesses: 2 },
      // An entry the step names with other contents
      {
        ...given,
        knownUtxos: known.map((utxo) => ({
          ...utxo,
          value: { lovelace: utxo.value.lovelace + 1n },
        })),
      },
      // An option given where the record holds none
      { ...given, sendAllTo: address },
      { ...given, topUpCollateral: false },
      { ...given, collateralReturn: false },
      { ...given, registeredPools: ["pool1"] },
      // An option the record holds that is not given
      { fee: 400_000n, extraKeyWitnesses: 1 },
    ]) {
      const other = instance();
      const error = await caught(
        other.builder.plan(pay(), { id: "order-1", payer: wallet, ...options }),
      );
      expectCode(error, "PLAN_EXISTS");
      expect(other.store.saves()).toEqual([]);
      expect(requests(other.provider)).toBe(0);
    }
    // The same values pass
    const other = instance();
    await other.builder.plan(pay(), { id: "order-1", payer: wallet, ...given });
    expect(other.store.saves()).toEqual([]);
  });

  it("compares of knownUtxos the entries for the out refs the recorded steps name: an entry for another may change or go, and none is the option left out", async () => {
    const { builder, wallet, instance, funded } = await storeSetup(v);
    const [, named] = funded as [UTxO, UTxO];
    const steps = () => [
      spend.pubKey({
        utxo: {
          txHash: named.input.txHash,
          outputIndex: named.input.outputIndex,
        },
      }),
      pay(),
    ];
    const elsewhere = (lovelace: string): UTxO => ({
      input: { txHash: "dd".repeat(32), outputIndex: 0 },
      output: {
        address: baseAddress(3),
        amount: [{ unit: "lovelace", quantity: lovelace }],
      },
    });
    await builder.plan(steps(), {
      id: "order-1",
      payer: wallet,
      knownUtxos: [named, elsewhere("5000000")],
    });
    for (const knownUtxos of [
      [named, elsewhere("5000000")],
      [named],
      [elsewhere("6000000"), toUtxo(named)],
    ]) {
      const other = instance();
      await other.builder.plan(steps(), {
        id: "order-1",
        payer: wallet,
        knownUtxos,
      });
      expect(other.store.saves()).toEqual([]);
    }
    const changed: UTxO = {
      ...named,
      output: {
        ...named.output,
        amount: [{ unit: "lovelace", quantity: "1" }],
      },
    };
    for (const knownUtxos of [[changed], [elsewhere("5000000")]]) {
      const other = instance();
      expectCode(
        await caught(
          other.builder.plan(steps(), {
            id: "order-1",
            payer: wallet,
            knownUtxos,
          }),
        ),
        "PLAN_EXISTS",
      );
      expect(other.store.saves()).toEqual([]);
    }
    // A record whose steps name none of its knownUtxos: the option left out is the same as []
    await builder.plan(steps(), {
      id: "order-2",
      payer: wallet,
      knownUtxos: [elsewhere("5000000")],
    });
    for (const options of [
      {},
      { knownUtxos: [] },
      { knownUtxos: [elsewhere("6000000")] },
    ]) {
      const other = instance();
      await other.builder.plan(steps(), {
        id: "order-2",
        payer: wallet,
        ...options,
      });
      expect(other.store.saves()).toEqual([]);
    }
    expectCode(
      await caught(
        instance().builder.plan(steps(), {
          id: "order-2",
          payer: wallet,
          knownUtxos: [named],
        }),
      ),
      "PLAN_EXISTS",
    );
  });

  it("takes the same knownUtxos in any form the builder takes as the same option", async () => {
    const { builder, wallet, instance, funded } = await storeSetup(v);
    await builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
      knownUtxos: funded,
    });
    for (const knownUtxos of [
      funded,
      funded.map((utxo) => toUtxo(utxo)),
      funded.map((utxo) => toTxUnspentOutput(utxo).toCbor().toString()),
    ]) {
      const other = instance();
      await other.builder.plan(pay(), {
        id: "order-1",
        payer: wallet,
        knownUtxos,
      });
      expect(other.store.saves()).toEqual([]);
    }
  });

  it("copies knownUtxos for the same call again as for the first: an entry the copy refuses is refused before the record is compared", async () => {
    const { builder, wallet, instance, funded } = await storeSetup(v);
    await builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
      knownUtxos: funded,
    });
    const value = { lovelace: 5_000_000n };
    const thrown = new Error("cannot be read");
    Object.defineProperty(value, "lovelace", {
      enumerable: true,
      get() {
        throw thrown;
      },
    });
    const throwing = { ...toUtxo(funded[0]!), txHash: "ee".repeat(32), value };
    for (const knownUtxos of [[...funded, throwing], [throwing]]) {
      const other = instance();
      const error = await caught(
        other.builder.plan(pay(), {
          id: "order-1",
          payer: wallet,
          knownUtxos: knownUtxos as never,
        }),
      );
      expectCode(error, "INVALID_OPTION");
      expect(error.message).toContain(
        `invalid knownUtxos: entry ${knownUtxos.length - 1} is not a UTxO: it throws when read`,
      );
      expect(error.cause).toBe(thrown);
      expect(other.store.saves()).toEqual([]);
    }
  });

  it("is PLAN_EXISTS for another sendAllTo than the recorded one; the same one passes", async () => {
    const { builder, wallet, instance } = await storeSetup(v);
    await builder.plan([], {
      id: "order-1",
      payer: wallet,
      sendAllTo: baseAddress(3),
    });
    const other = instance();
    const error = await caught(
      other.builder.plan([], {
        id: "order-1",
        payer: wallet,
        sendAllTo: baseAddress(4),
      }),
    );
    expectCode(error, "PLAN_EXISTS");
    const same = await other.builder.plan([], {
      id: "order-1",
      payer: wallet,
      sendAllTo: baseAddress(3),
    });
    expect(same.status).toBe("pending");
    expect(other.store.saves()).toEqual([]);
  });

  it("is PLAN_EXISTS for a payer of another change address, of the plan or of a step", async () => {
    const { builder, wallet, instance } = await storeSetup(v);
    const foreign = await walletOf(1);
    await builder.plan(pay(), { id: "plain", payer: wallet });
    await builder.plan(
      { a: pay(), b: { parts: pay(2_000_000n), payer: wallet } },
      { id: "named", payer: wallet },
    );
    const other = instance();
    for (const call of [
      other.builder.plan(pay(), { id: "plain", payer: foreign }),
      other.builder.plan(
        { a: pay(), b: { parts: pay(2_000_000n), payer: foreign } },
        { id: "named", payer: wallet },
      ),
    ])
      expectCode(await caught(call), "PLAN_EXISTS");
    expect(other.store.saves()).toEqual([]);
    expect(requests(other.provider)).toBe(0);
  });

  it("is STORE_FAILED when the read throws: nothing built or written; the next call reads again", async () => {
    const { builder, wallet, instance } = await storeSetup(v);
    const first = await builder.plan(pay(), { id: "order-1", payer: wallet });
    const other = instance();
    other.store.hooks.load = async () => {
      delete other.store.hooks.load;
      throw new Error("the database is down");
    };
    const error = (await caught(
      other.builder.plan(pay(), { id: "order-1", payer: wallet }),
    )) as TxPlanError;
    expectCode(error, "STORE_FAILED");
    expect(error.planId).toBe("order-1");
    expect(error.cause).toEqual(new Error("the database is down"));
    expect(requests(other.provider)).toBe(0);
    const again = await other.builder.plan(pay(), {
      id: "order-1",
      payer: wallet,
    });
    expect(other.store.loads("order-1")).toBe(2);
    expect(again.toJSON()).toStrictEqual(first.toJSON());
    expect(other.store.saves()).toEqual([]);
  });

  it("is NOT_SERIALIZABLE for a redeemer function with a store, before any request; nothing written; without one it works in memory", async () => {
    const { builder, wallet, emulator, provider, store } = await storeSetup(v);
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
    const error = (await caught(
      builder.plan(parts, { id: "unlock", payer: wallet }),
    )) as TxBuildError;
    expectCode(error, "NOT_SERIALIZABLE");
    expect(error).toMatchObject({ part: "spend", label: "unlock" });
    expect(store.saves()).toEqual([]);
    expect(requests(provider)).toBe(calls);

    const inMemory = await builderOf(provider).plan(parts, { payer: wallet });
    await inMemory.run();
    expect(inMemory.status).toBe("final");
  });

  it("is NETWORK_MISMATCH from resume and from builder.plan for a record of another network", async () => {
    const { builder, wallet, store, emulator } = await storeSetup(v);
    await builder.plan(pay(), { id: "order-1", payer: wallet });
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
      preview.plan(pay(), { id: "order-1", payer: wallet }),
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

describe.each(VALIDATORS)("A record this library does not read (%s)", (v) => {
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

  const stage = async (mutate: (json: StoredTxPlanJSON) => object) => {
    const ctx = await storeSetup(v);
    await ctx.builder.plan(pay(), { id: "order-1", payer: ctx.wallet });
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
    "is recordVersion from builder.plan, before anything is built: %s",
    async (_, mutate, named) => {
      const { instance, wallet } = await stage(mutate);
      const other = instance();
      expectUnread(
        await caught(
          other.builder.plan(pay(), { id: "order-1", payer: wallet }),
        ),
        named,
      );
      expect(other.store.saves()).toEqual([]);
      expect(requests(other.provider)).toBe(0);
    },
  );
});

describe.each(VALIDATORS)("The payer after resume (%s)", (v) => {
  it("is not needed to send the recorded bytes again", async () => {
    const { builder, wallet, instance } = await storeSetup(v);
    const plan = await builder.plan(pay(), { id: "pay", payer: wallet });
    const submitter = swallowing();
    await plan.run({ waitFor: "sent", submitter });
    const again = await instance().builder.resume("pay");
    const resent = swallowing();
    await again.run({ waitFor: "sent", submitter: resent });
    expect(resent.calls).toEqual(submitter.calls);
    expect(resent.calls).toEqual([plan.step("main").signedTx]);
  });

  it("is never called at resume and at a resend, and never compared with the record", async () => {
    const { builder, wallet, instance, store } = await storeSetup(v);
    const plan = await builder.plan(pay(), { id: "pay", payer: wallet });
    const submitter = swallowing();
    await plan.run({ waitFor: "sent", submitter });
    const foreign = counted(await walletOf(1));
    const again = await instance().builder.resume("pay", {
      payer: foreign.wallet,
    });
    const resent = swallowing();
    await again.run({ waitFor: "sent", submitter: resent });
    expect(foreign.calls).toEqual({});
    expect(resent.calls).toEqual(submitter.calls);
    expect((await stored(store, "pay")).options.changeAddress).toBe(
      await wallet.getChangeAddress(),
    );
  });

  it("restores the recorded steps only: the parts the builder holds from add are not read", async () => {
    const { builder, wallet, instance, store } = await storeSetup(v);
    await builder.plan(pay(), { id: "pay", payer: wallet });
    const holding = instance().builder.add(
      output({
        label: "extra",
        address: baseAddress(4),
        value: { lovelace: 3_000_000n },
      }),
    );
    const again = await holding.resume("pay", { payer: wallet });
    expect(again.toJSON()).toStrictEqual(await stored(store, "pay"));
    expect(
      again.step("main").outputs.some((o) => o.address === baseAddress(4)),
    ).toBe(false);
    await again.run();
    expect(again.status).toBe("final");
  });
});
