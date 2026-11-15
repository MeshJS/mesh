import { ProviderError } from "@meshsdk/common";

import type {
  StoredTxPlanJSON,
  TxPlanStore,
} from "../../../src/tx-builder/plan/types";
import { memoryPlanStore } from "../../../src/tx-builder";
import { makePlan } from "../../../src/tx-builder/plan/make";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import {
  advance,
  builderOf,
  caught,
  FAST,
  submitterOf,
  swallowing,
  walletOf,
} from "./plan-emulator-util";
import { ADA, alice, bob, paidTo, payTo, stepSetup } from "./run-util";

// What a stopped plan gives back, and the record a store holds: `rest` keeps a step's own
// payer and leaves out every step that is or was found in a block; a record resumed from its
// JSON on a builder with a store never undoes what the store holds.

describe("rest", () => {
  it("gives a step of its own payer back with that payer's change address, and a plan built from it pays from there", async () => {
    const { emulator, builder, wallet, address } = await stepSetup("scalus");
    const treasury = await walletOf(1);
    const treasuryAddress = (await treasury.getChangeAddress())!;
    emulator.fund(treasuryAddress, { lovelace: 500n * ADA });
    const plan = await builder.plan(
      {
        a: payTo(alice, 5n * ADA),
        b: { parts: payTo(bob, 50n * ADA), payer: treasury, fee: 400_000n },
      },
      { payer: wallet, ttlMs: 60_000 },
    );
    await plan.stop();
    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");

    const rest = plan.rest as Record<string, unknown>;
    expect(Object.keys(rest)).toEqual(["a", "b"]);
    expect(Array.isArray(rest.a)).toBe(true);
    expect(rest.b).toMatchObject({ payer: treasuryAddress, fee: 400_000n });

    // The new plan is given the plan's payer; b is built on the treasury's UTxOs all the same
    const again = await makePlan(builder, plan.rest, { payer: wallet });
    const b = again.steps.find((step) => step.name === "b")!.built;
    expect(b.inputs.every((input) => input.address === treasuryAddress)).toBe(
      true,
    );
    expect(b.change.map((change) => change.address)).toEqual([treasuryAddress]);
    const a = again.steps.find((step) => step.name === "a")!.built;
    expect(a.inputs.every((input) => input.address === address)).toBe(true);
  });

  it("leaves out a step found in a block after it was called dead: the recipient is paid once", async () => {
    const hidden = new Set<string>();
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: {
        fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
          if (hidden.has(hash.toLowerCase()))
            throw new ProviderError("not found", {
              kind: "notFound",
              status: 404,
              retryable: false,
            });
          return forward(hash);
        },
      },
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      ttlMs: 60_000,
    });
    // The search lags: the step lands and is not found, past its end of validity
    hidden.add(plan.step("main").txHash);
    await plan.run({ waitFor: "sent" });
    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");
    expect(Object.keys(plan.rest)).toEqual(["main"]);

    // The search catches up before a new plan is made
    hidden.clear();
    await plan.refresh();
    expect(plan.status).toBe("final");
    expect(plan.rest).toEqual({});
    const error = await caught(makePlan(builder, plan.rest, { payer: wallet }));
    expect(error.code).toBe("INVALID_OPTION");
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });

  it("leaves out a step that was found in a block and rolled back", async () => {
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
    });
    const before = emulator.fork();
    await plan.run();
    expect(plan.step("main").status).toBe("included");
    provider.control.target = before;
    await plan.refresh();
    expect(plan.step("main")).toMatchObject({ status: "sent" });
    expect(plan.step("main").seen).toBeDefined();
    expect(plan.rest).toEqual({});
  });
});

describe("a record resumed from its JSON on a builder with a store", () => {
  it("takes the stored record at the same or a later revision, refuses a JSON ahead of the store, and never undoes a stop", async () => {
    const store = memoryPlanStore();
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { store },
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet, id: "e1" },
    );
    await plan.sign();
    const snapshot = plan.toJSON();
    // A copy run without a store goes one step on
    const storeless = await builderOf(provider, { evaluator: emulator }).resume(
      snapshot,
    );
    const held = swallowing();
    await storeless.run({ waitFor: "sent", submitter: held });
    const forked = storeless.toJSON();
    // Meanwhile the stored plan is stopped, at the same revision
    await plan.stop();
    expect(plan.toJSON().rev).toBe(forked.rev);

    const withStore = builderOf(provider, { store, evaluator: emulator });
    const resumed = await withStore.resume(forked);
    expect(resumed.toJSON().stopped).toBe(true);
    expect(resumed.toJSON()).toEqual(plan.toJSON());
    const ran = await caught(
      resumed.run({ submitter: submitterOf((tx) => emulator.submitTx(tx)) }),
    );
    expect([ran.code, ran.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    // An older JSON gives the stored record too
    const older = await withStore.resume(snapshot);
    expect(older.toJSON().stopped).toBe(true);

    // The copy goes further: its JSON is ahead of the store, and is refused
    await storeless.run({ waitFor: "sent", submitter: held });
    const ahead = storeless.toJSON();
    expect(ahead.rev).toBeGreaterThan(plan.toJSON().rev);
    const refused = await caught(withStore.resume(ahead));
    expect(refused.code).toBe("VERSION_CONFLICT");
    const stored = (await store.load("e1")) as StoredTxPlanJSON & {
      stopped?: true;
    };
    expect(stored.stopped).toBe(true);
    expect(paidTo(emulator, bob)).toEqual([]);
  });

  it("is replaced by a stored record of the same revision that differs from it", async () => {
    const records = new Map<string, StoredTxPlanJSON>();
    const store: TxPlanStore & { put(json: StoredTxPlanJSON): void } = {
      load: async (id) => records.get(id),
      save: async (json, expectedRev) => {
        if ((records.get(json.id!)?.rev ?? 0) !== expectedRev) return false;
        records.set(json.id!, JSON.parse(JSON.stringify(json)));
        return true;
      },
      put: (json) => records.set(json.id!, json),
    };
    const { emulator, provider, builder, wallet } = await stepSetup("scalus", {
      builder: { store },
    });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      id: "e2",
    });
    await plan.sign();
    // Another copy of the same revision, with the mark, lands in the store by another route
    const copy = await builderOf(provider, { evaluator: emulator }).resume(
      plan.toJSON(),
    );
    await copy.stop();
    const marked = copy.toJSON();
    store.put({
      ...marked,
      rev: plan.toJSON().rev,
    } as unknown as StoredTxPlanJSON);
    await plan.refresh();
    expect(recordOf(plan).stopped).toBe(true);
    const ran = await caught(plan.run());
    expect([ran.code, ran.details.reason]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    expect(paidTo(emulator, alice)).toEqual([]);
  });
});
