import type { TransactionPrototype } from "@meshsdk/common";
import type { TxEmulator } from "@meshsdk/tx-emulator";
import { mConStr0 } from "@meshsdk/core";
import {
  resolvePlutusScriptAddress,
  transactionPrototypeToHex,
} from "@meshsdk/core-cst";

import type {
  BuildEvent,
  BuiltTxData,
  TxPlan,
  TxStep,
  Utxo,
} from "../../../src/tx-builder";
import type { Value } from "../../../src/tx-builder/value";
import type { Validator } from "./plan-emulator-util";
import {
  output,
  spend,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import { MAX_STEPS } from "../../../src/tx-builder/plan/make";
import { addValues, valueOf } from "../../../src/tx-builder/value";
import { alwaysSucceedCbor } from "../../test-util";
import {
  builderOf,
  caught,
  emulatorOf,
  recipient,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, paidTo } from "./run-util";
import { watchStore } from "./store-util";

// A plan for a fragmented wallet: a step that does not fit a transaction because of the inputs
// its selection needs gets consolidation steps before it, which pay the payer alone. Made by
// `builder.plan` and `plan.add`, run on the emulator, recorded, resumed and made again by id.

const LONG = 180_000;
const script = { code: alwaysSucceedCbor, version: "V3" as const };

const keyOf = (ref: { txHash: string; outputIndex: number }) =>
  `${ref.txHash}#${ref.outputIndex}`;

/** A seeded generator of numbers in [0, 1), the same on every run */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * An emulator holding the wallet's UTxOs with these values, a provider over it and a builder
 * with the fast defaults; with `maxTxSize` the builder takes the emulator's parameters with a
 * smaller limit, so that fewer UTxOs fragment the wallet
 */
const fragmented = async (
  v: Validator,
  values: readonly Record<string, bigint>[],
  options: {
    maxTxSize?: number;
    store?: ReturnType<typeof watchStore>;
    plutus?: boolean;
  } = {},
) => {
  const emulator = await emulatorOf(v, 100_000_000);
  const provider = wrap(emulator);
  const params = await emulator.fetchProtocolParameters();
  const builderFor = (store = options.store) =>
    builderOf(provider, {
      ...(options.maxTxSize !== undefined && {
        params: { ...params, maxTxSize: options.maxTxSize },
      }),
      ...(store !== undefined && { store }),
      ...(options.plutus && { evaluator: emulator }),
    });
  const builder = builderFor();
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  for (const value of values) emulator.fund(address, value);
  return {
    emulator,
    provider,
    builder,
    builderFor,
    wallet,
    address,
    maxTxSize: options.maxTxSize ?? params.maxTxSize,
  };
};

/** `count` UTxOs of `lovelace` each */
const coins = (count: number, lovelace: bigint) =>
  Array.from({ length: count }, () => ({ lovelace }));

const pay = (value: Record<string, bigint>, address = recipient) =>
  output({ address, value });

const names = (plan: TxPlan) => plan.steps.map((step) => step.name);

const consolidationsOf = (plan: TxPlan) =>
  plan.steps.filter((step) => step.kind === "consolidation");

const sumOf = (utxos: readonly Utxo[]): Value =>
  addValues(...utxos.map((utxo) => valueOf(utxo.value)));

const asRecord = (value: Value) => ({
  lovelace: value.coin,
  ...Object.fromEntries(
    Array.from(value.assets).filter(([, quantity]) => quantity !== 0n),
  ),
});

/** What an address holds on the emulator */
const heldAt = (emulator: TxEmulator, address: string): Value =>
  addValues(
    ...emulator
      .utxos({ address })
      .map((u) =>
        valueOf(
          Object.fromEntries(
            u.output.amount.map((a) => [a.unit, BigInt(a.quantity)]),
          ) as Utxo["value"],
        ),
      ),
  );

/** Every output at the payer's address, and what goes in comes out, the fee aside */
const expectPaysOnlyThePayer = (step: BuiltTxData, address: string) => {
  expect(step.outputs.length).toBeGreaterThan(0);
  for (const each of step.outputs) expect(each.address).toBe(address);
  expect(step.collateral).toBeUndefined();
  expect(step.selectedInputs).toEqual([]);
  const into = sumOf(step.inputs);
  const out = addValues(sumOf(step.outputs), {
    coin: step.fee,
    assets: new Map(),
  });
  expect(asRecord(out)).toEqual(asRecord(into));
};

/**
 * The consolidation steps right before the served step: at least one, each on the one before,
 * and the served step on the last
 */
const expectChain = (plan: TxPlan, served: string) => {
  const at = names(plan).indexOf(served);
  let from = at;
  while (from > 0 && plan.steps[from - 1]!.kind === "consolidation") from--;
  const steps = plan.steps.slice(from, at);
  expect(steps.length).toBeGreaterThan(0);
  for (const [i, step] of steps.entries()) {
    if (i > 0) {
      expect(step.standsOn).toEqual([steps[i - 1]!.name]);
      expect(step.inputs.map(keyOf)).toContain(keyOf(steps[i - 1]!.change[0]!));
    }
  }
  const last = steps.at(-1)!;
  expect(plan.step(served).standsOn).toContain(last.name);
  expect(plan.step(served).inputs.map(keyOf)).toContain(keyOf(last.change[0]!));
};

/** The warnings a trace got */
const tracer = () => {
  const events: BuildEvent[] = [];
  return {
    events,
    trace: (event: BuildEvent) => events.push(event),
    warnings: () =>
      events.filter(
        (event): event is Extract<BuildEvent, { code: string }> =>
          event.type === "warning",
      ),
  };
};

const expectTooLarge = (error: unknown, cause: "selection" | "parts") => {
  expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
  expect((error as TxBuildError<"TX_TOO_LARGE">).details.cause).toBe(cause);
  expect((error as Error).message.startsWith('step "main": ')).toBe(true);
};

describe.each(VALIDATORS)("a plan for a fragmented wallet (%s)", (v) => {
  it(
    "puts consolidation steps before a step that does not fit: 1000 UTxOs of 2 ada and a payment of 1900 ada",
    async () => {
      const { emulator, builder, wallet, address, maxTxSize } =
        await fragmented(v, coins(1000, 2n * ADA));
      const payment = pay({ lovelace: 1900n * ADA });
      const alone = await caught(builder.build(payment, { payer: wallet }));
      expect(TxBuildError.is(alone, "TX_TOO_LARGE")).toBe(true);
      expect(alone.details.cause).toBe("selection");

      const { trace, warnings } = tracer();
      const started = Date.now();
      const plan = await builder.plan(payment, { payer: wallet, trace });
      const took = Date.now() - started;
      console.log(`a plan for 1000 UTxOs made in ${took} ms`);
      expect(took).toBeLessThan(30_000);

      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThanOrEqual(2);
      expect(names(plan)).toEqual([
        ...extra.map((_, i) => `consolidate-${i + 1}`),
        "main",
      ]);
      expect(plan.step("main").kind).toBeUndefined();
      expect(extra[0]!.standsOn).toEqual([]);
      expectChain(plan, "main");
      for (const step of extra) {
        expectPaysOnlyThePayer(step, address);
        expect(step.validity!.invalidHereafter).toBe(
          plan.step("main").validity!.invalidHereafter,
        );
      }
      const fees = plan.steps.reduce((sum, step) => sum + step.fee, 0n);
      expect(plan.fee).toBe(fees);
      // The application is told before anything is signed: how many, and their fees
      expect(warnings()).toEqual([
        {
          type: "warning",
          code: "CONSOLIDATION_STEPS",
          steps: extra.length,
          fee: extra.reduce((sum, step) => sum + step.fee, 0n),
        },
      ]);
      expect(plan.steps.every((step) => step.status === "built")).toBe(true);
      console.log(
        `fees: ${plan.steps.map((s) => `${s.name} ${s.inputs.length} in ${s.fee}`).join(", ")}; total ${plan.fee}`,
      );

      const before = heldAt(emulator, address);
      await plan.run();
      expect(plan.status).toBe("final");
      for (const step of plan.steps)
        expect(step.signedTx!.length / 2).toBeLessThanOrEqual(maxTxSize);
      expect(paidTo(emulator, recipient)).toEqual([1900n * ADA]);
      expect(before.coin - heldAt(emulator, address).coin).toBe(
        1900n * ADA + fees,
      );
    },
    LONG,
  );

  it(
    "parks tokens the step does not need: the served step spends the last change alone of them, and no step spends a parked output",
    async () => {
      const policies = ["a1", "b2", "c3"].map((p) => p.repeat(28));
      const values = Array.from({ length: 200 }, (_, i) => ({
        lovelace: 10n * ADA,
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, j) => [
            `${policies[j % 3]}${(i * 8 + j).toString(16).padStart(56, "0")}`,
            1n,
          ]),
        ),
      }));
      const { emulator, builder, wallet, address } = await fragmented(
        v,
        values,
      );
      const plan = await builder.plan(pay({ lovelace: 1000n * ADA }), {
        payer: wallet,
      });
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThanOrEqual(1);
      expectChain(plan, "main");
      const parked: Utxo[] = [];
      for (const step of extra) {
        expectPaysOnlyThePayer(step, address);
        const outside = step.outputs.filter((each) => each.change !== true);
        expect(outside.length).toBeGreaterThan(0);
        // Every token of its inputs is parked, and its change holds lovelace alone
        expect(asRecord({ coin: 0n, assets: sumOf(outside).assets })).toEqual(
          asRecord({ coin: 0n, assets: sumOf(step.inputs).assets }),
        );
        for (const change of step.change)
          expect(Object.keys(change.value)).toEqual(["lovelace"]);
        parked.push(...outside);
      }
      const made = new Set(extra.map((step) => step.txHash));
      const main = plan.step("main");
      expect(main.inputs.filter((each) => made.has(each.txHash))).toEqual([
        expect.objectContaining({
          txHash: extra.at(-1)!.txHash,
          outputIndex: extra.at(-1)!.change[0]!.outputIndex,
        }),
      ]);
      const spent = new Set(
        plan.steps.flatMap((step) => step.inputs.map(keyOf)),
      );
      for (const each of parked) expect(spent.has(keyOf(each))).toBe(false);

      await plan.run();
      expect(plan.status).toBe("final");
      const left = new Set(
        emulator.utxos({ address }).map((u) => keyOf(u.input)),
      );
      for (const each of parked) expect(left.has(keyOf(each))).toBe(true);
      expect(paidTo(emulator, recipient)).toEqual([1000n * ADA]);
    },
    LONG,
  );

  it(
    "consolidate: false leaves the error, and nothing is recorded",
    async () => {
      const store = watchStore();
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA), {
        maxTxSize: 4096,
        store,
      });
      const payment = pay({ lovelace: 500n * ADA });
      const error = await caught(
        builder.plan(payment, { payer: wallet, id: "off", consolidate: false }),
      );
      expectTooLarge(error, "selection");
      expect(error.message).not.toMatch(/consolidat/);
      expect(store.saves()).toEqual([]);
      // The same wallet and payment with the option on gets consolidation steps
      const plan = await builder.plan(payment, { payer: wallet, id: "on" });
      expect(consolidationsOf(plan).length).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    "maxSteps reached is TX_TOO_LARGE saying how many the plan allows, and nothing is recorded",
    async () => {
      const store = watchStore();
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA), {
        maxTxSize: 4096,
        store,
      });
      const payment = pay({ lovelace: 500n * ADA });
      const { trace, warnings } = tracer();
      const error = await caught(
        builder.plan(payment, {
          payer: wallet,
          id: "one",
          consolidate: { maxSteps: 1 },
          trace,
        }),
      );
      expectTooLarge(error, "selection");
      expect(error.message).toMatch(/allows 1 consolidation step/);
      expect(store.saves()).toEqual([]);
      expect(await store.load("one")).toBeUndefined();
      expect(warnings()).toEqual([]);
      // With the steps it needs it is made
      const plan = await builder.plan(payment, {
        payer: wallet,
        id: "two",
        consolidate: { maxSteps: 8 },
      });
      expect(consolidationsOf(plan).length).toBeGreaterThanOrEqual(2);
    },
    LONG,
  );

  it(
    "counts consolidation steps among the 32 steps a plan may have",
    async () => {
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA), {
        maxTxSize: 4096,
      });
      // 30 small steps and one that needs two consolidation steps: room for one
      const steps: Record<string, unknown> = {};
      for (let i = 1; i < MAX_STEPS - 1; i++)
        steps[`s${i}`] = pay({ lovelace: 2n * ADA }, alice);
      steps.big = pay({ lovelace: 450n * ADA });
      const error = await caught(
        builder.plan(steps as never, {
          payer: wallet,
          consolidate: { maxSteps: 8 },
        }),
      );
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.details.cause).toBe("selection");
      expect(error.message.startsWith('step "big": ')).toBe(true);
      expect(error.message).toMatch(/at most 32 steps/);
    },
    LONG,
  );

  it(
    "refuses a consolidate option of another form, naming its type alone",
    async () => {
      const { builder, wallet, provider } = await fragmented(
        v,
        coins(2, 5n * ADA),
      );
      const calls = provider.control.count("fetchAddressUTxOs");
      for (const value of [
        "xprv-secret",
        1,
        null,
        [],
        { maxSteps: 0 },
        { maxSteps: 32 },
        { maxSteps: 1.5 },
        { maxSteps: "2" },
        { steps: 2 },
      ]) {
        const error = await caught(
          builder.plan(pay({ lovelace: 2n * ADA }), {
            payer: wallet,
            consolidate: value as never,
          }),
        );
        expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
        expect(error.details.option).toBe("consolidate");
        expect(error.details.value).toBe(
          value === null ? "null" : typeof value,
        );
        expect(error.message).not.toMatch(/xprv-secret/);
      }
      expect(provider.control.count("fetchAddressUTxOs")).toBe(calls);
    },
    LONG,
  );

  it(
    "does not consolidate a step with sendAllTo: its error stands",
    async () => {
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA), {
        maxTxSize: 4096,
      });
      const error = await caught(
        builder.plan(
          { main: { parts: [], sendAllTo: recipient } },
          { payer: wallet },
        ),
      );
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.message.startsWith('step "main": ')).toBe(true);
      expect(error.message).not.toMatch(/consolidat/);
    },
    LONG,
  );

  it(
    'does not consolidate a step too large by its parts (cause: "parts")',
    async () => {
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA), {
        maxTxSize: 4096,
      });
      const outputs = Array.from({ length: 100 }, () =>
        pay({ lovelace: 1_500_000n }),
      );
      const { trace, warnings } = tracer();
      const error = await caught(
        builder.plan(outputs, { payer: wallet, trace }),
      );
      expectTooLarge(error, "parts");
      expect(error.message).not.toMatch(/consolidat/);
      expect(warnings()).toEqual([]);
    },
    LONG,
  );

  it(
    "gives an added step consolidation steps too, named and counted through the plan",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        v,
        coins(900, 2n * ADA),
        { maxTxSize: 4096 },
      );
      const a = pay({ lovelace: 600n * ADA }, alice);
      const b = pay({ lovelace: 600n * ADA }, bob);

      // As many as the plan's first step needs, and one more: the added step needs more
      const first = consolidationsOf(
        await builder.plan({ a }, { payer: wallet }),
      );
      expect(first.length).toBeGreaterThanOrEqual(2);
      const tight = await builder.plan(
        { a },
        { payer: wallet, consolidate: { maxSteps: first.length + 1 } },
      );
      expect(consolidationsOf(tight)).toHaveLength(first.length);
      const json = JSON.stringify(tight);
      const error = await caught(tight.add({ b }));
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.details.cause).toBe("selection");
      expect(error.message.startsWith('step "b": ')).toBe(true);
      expect(error.message).toMatch(
        new RegExp(`allows ${first.length + 1} consolidation step`),
      );
      expect(JSON.stringify(tight)).toBe(json);

      // Within the limit the added step gets them, numbered after the plan's
      const { trace, warnings } = tracer();
      const plan = await builder.plan(
        { a },
        { payer: wallet, trace, consolidate: { maxSteps: 8 } },
      );
      await plan.add({ b });
      const n = first.length;
      const added = consolidationsOf(plan).slice(n);
      expect(added.length).toBeGreaterThanOrEqual(1);
      expect(names(plan)).toEqual([
        ...first.map((step) => step.name),
        "a",
        ...added.map((_, i) => `consolidate-${n + i + 1}`),
        "b",
      ]);
      expectChain(plan, "b");
      expect(added[0]!.standsOn).toEqual(["a"]);
      const recorded = plan.toJSON().steps;
      for (const step of recorded.slice(n + 1)) expect(step.added).toBe(true);
      for (const step of added) expectPaysOnlyThePayer(step, address);
      expect(warnings().map((w) => (w as { steps: number }).steps)).toEqual([
        n,
        added.length,
      ]);

      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(emulator, alice)).toEqual([600n * ADA]);
      expect(paidTo(emulator, bob)).toEqual([600n * ADA]);
    },
    LONG,
  );

  it(
    "add follows the option the plan records, also after a restart",
    async () => {
      const store = watchStore();
      const { builder, builderFor, wallet } = await fragmented(
        v,
        coins(300, 2n * ADA),
        { maxTxSize: 4096, store },
      );
      const small = pay({ lovelace: 2n * ADA }, alice);
      const big = pay({ lovelace: 450n * ADA }, bob);
      await builder.plan(
        { a: small },
        { payer: wallet, id: "off", consolidate: false },
      );
      await builder.plan({ a: small }, { payer: wallet, id: "on" });
      expect((await store.load("off"))!.options.consolidate).toBe(false);
      expect((await store.load("on"))!.options).not.toHaveProperty(
        "consolidate",
      );

      const restarted = builderFor();
      const off = await restarted.resume("off", { payer: wallet });
      const error = await caught(off.add({ b: big }));
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.message.startsWith('step "b": ')).toBe(true);
      expect(error.message).not.toMatch(/consolidat/);
      expect(names(off)).toEqual(["a"]);

      const on = await restarted.resume("on", { payer: wallet });
      await on.add({ b: big });
      expect(consolidationsOf(on).length).toBeGreaterThan(0);
      expect(names(on).at(-1)).toBe("b");
    },
    LONG,
  );

  it(
    "a repeated id returns the recorded plan with its consolidation steps, building nothing",
    async () => {
      const store = watchStore();
      const { builder, builderFor, wallet, provider } = await fragmented(
        v,
        coins(300, 2n * ADA),
        { maxTxSize: 4096, store },
      );
      const payment = pay({ lovelace: 500n * ADA });
      const options = {
        payer: wallet,
        id: "order-1",
        consolidate: { maxSteps: 6 },
      };
      const plan = await builder.plan(payment, options);
      expect(consolidationsOf(plan).length).toBeGreaterThanOrEqual(2);
      const hashes = plan.steps.map((step) => step.txHash);

      const reads = provider.control.count("fetchAddressUTxOs");
      const saves = store.saves().length;
      const { trace, warnings } = tracer();
      for (const again of [builder, builderFor()]) {
        const same = await again.plan(payment, { ...options, trace });
        expect(same.steps.map((step) => step.txHash)).toEqual(hashes);
        expect(consolidationsOf(same).map((step) => step.name)).toEqual(
          consolidationsOf(plan).map((step) => step.name),
        );
      }
      expect(provider.control.count("fetchAddressUTxOs")).toBe(reads);
      expect(store.saves()).toHaveLength(saves);
      expect(warnings()).toEqual([]);

      // Another option or payment is another plan
      for (const other of [
        builder.plan(payment, { ...options, consolidate: { maxSteps: 5 } }),
        builder.plan(payment, { ...options, consolidate: undefined }),
        builder.plan(pay({ lovelace: 499n * ADA }), options),
      ])
        expect(TxPlanError.is(await caught(other), "PLAN_EXISTS")).toBe(true);
    },
    LONG,
  );

  it(
    "leaves consolidation steps out of rest, and the record reads them back with their kind and no given",
    async () => {
      const { builder, wallet, address } = await fragmented(
        v,
        coins(300, 2n * ADA),
        { maxTxSize: 4096 },
      );
      const payment = pay({ lovelace: 500n * ADA });
      const plan = await builder.plan(
        { pay: payment },
        { payer: wallet, consolidate: { maxSteps: 3 } },
      );
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(plan.rest)).toEqual(["pay"]);

      const json = plan.toJSON();
      expect(json.options.consolidate).toEqual({ maxSteps: 3 });
      for (const step of json.steps) {
        if (step.name.startsWith("consolidate-")) {
          expect(step.kind).toBe("consolidation");
          expect(step).not.toHaveProperty("given");
        } else {
          expect(step).not.toHaveProperty("kind");
          expect(step.given).toBeDefined();
        }
      }
      const read = await builder.resume(JSON.parse(JSON.stringify(json)));
      expect(read.steps.map((step) => [step.name, step.kind])).toEqual(
        plan.steps.map((step) => [step.name, step.kind]),
      );
      expect(read.toJSON()).toEqual(json);
      expect(Object.keys(read.rest)).toEqual(["pay"]);
      for (const step of consolidationsOf(read))
        expectPaysOnlyThePayer(step, address);
    },
    LONG,
  );

  it(
    "resumes in the middle of the consolidation steps and goes on",
    async () => {
      const store = watchStore();
      const { emulator, builder, builderFor, wallet } = await fragmented(
        v,
        coins(300, 2n * ADA),
        { maxTxSize: 4096, store },
      );
      const plan = await builder.plan(pay({ lovelace: 500n * ADA }), {
        payer: wallet,
        id: "middle",
      });
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThanOrEqual(2);
      await plan.sign();
      // The first consolidation step lands outside the plan; the process stops
      await emulator.submitTx(plan.step("consolidate-1").signedTx!);

      const resumed = await builderFor().resume("middle", { payer: wallet });
      expect(consolidationsOf(resumed).map((step) => step.name)).toEqual(
        extra.map((step) => step.name),
      );
      await resumed.run();
      expect(resumed.status).toBe("final");
      expect(paidTo(emulator, recipient)).toEqual([500n * ADA]);
    },
    LONG,
  );

  it(
    "builds a step with a Plutus part after its consolidation steps, with collateral",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        v,
        coins(500, 1_900_000n),
        { plutus: true },
      );
      const locked = { txHash: "7".repeat(64), outputIndex: 0 };
      emulator.addUtxos([
        {
          input: locked,
          output: {
            address: resolvePlutusScriptAddress(script, 0),
            amount: [{ unit: "lovelace", quantity: "20000000" }],
            plutusData: "d87980",
          },
        },
      ]);
      const plan = await builder.plan(
        [
          spend.plutus({
            utxo: locked,
            script,
            redeemer: { data: mConStr0([]) },
          }),
          pay({ lovelace: 900n * ADA }),
        ],
        { payer: wallet },
      );
      expect(consolidationsOf(plan).length).toBeGreaterThanOrEqual(1);
      expectChain(plan, "main");
      for (const step of consolidationsOf(plan))
        expectPaysOnlyThePayer(step, address);
      const main = plan.step("main");
      expect(main.collateral!.inputs.length).toBeGreaterThan(0);
      await plan.run();
      expect(plan.status).toBe("final");
      expect(paidTo(emulator, recipient)).toEqual([900n * ADA]);
    },
    LONG,
  );

  it(
    "tells a consolidation step that cannot be built as the served step's TX_TOO_LARGE, its error as the cause; an abort stays ABORTED",
    async () => {
      const { emulator, provider, wallet, address } = await fragmented(
        v,
        coins(300, 2n * ADA),
      );
      // A builder whose serializer judges every transaction that pays the wallet alone too large
      const params = await emulator.fetchProtocolParameters();
      let abort: (() => void) | undefined;
      const judging = builderOf(provider, {
        params: { ...params, maxTxSize: 4096 },
        serializer: {
          serializeTxPrototype: (prototype: TransactionPrototype) => {
            const hex = transactionPrototypeToHex(prototype);
            const { outputs } = prototype.body;
            if (!outputs.every((each) => each.address === address)) return hex;
            abort?.();
            return hex + "00".repeat(4096);
          },
        } as never,
      });
      const payment = pay({ lovelace: 500n * ADA });
      const error = await caught(judging.plan(payment, { payer: wallet }));
      expectTooLarge(error, "selection");
      expect(error.message).toMatch(/consolidate-1/);
      expect(TxBuildError.is(error.cause, "TX_TOO_LARGE")).toBe(true);
      expect(error.cause.details.cause).toBe("parts");

      const controller = new AbortController();
      abort = () => controller.abort();
      const aborted = await caught(
        judging.plan(payment, { payer: wallet, signal: controller.signal }),
      );
      expect(TxBuildError.is(aborted, "ABORTED")).toBe(true);
      expect(aborted.message.startsWith('step "main": ')).toBe(true);
    },
    LONG,
  );

  it(
    "pays only the payer in every consolidation step, over random fragmented wallets, or throws and records nothing",
    async () => {
      const random = seeded(20261115);
      const units = ["f1", "f2"].flatMap((p) =>
        Array.from(
          { length: 20 },
          (_, i) => `${p.repeat(28)}${i.toString(16).padStart(6, "0")}`,
        ),
      );
      let withSteps = 0;
      for (let c = 0; c < 4; c++) {
        const values = Array.from(
          { length: 150 + Math.floor(random() * 200) },
          () => {
            const value: Record<string, bigint> = {
              lovelace: BigInt(1_200_000 + Math.floor(random() * 3_800_000)),
            };
            if (random() < 0.3)
              for (let k = 1 + Math.floor(random() * 4); k > 0; k--)
                value[units[Math.floor(random() * units.length)]!] = BigInt(
                  1 + Math.floor(random() * 1000),
                );
            return value;
          },
        );
        const store = watchStore();
        const { emulator, builder, wallet, address } = await fragmented(
          v,
          values,
          { maxTxSize: 4096, store },
        );
        const total = heldAt(emulator, address);
        const payment = {
          lovelace:
            (total.coin * BigInt(60 + Math.floor(random() * 30))) / 100n,
        };
        let plan: TxPlan;
        try {
          plan = await builder.plan(pay(payment), {
            payer: wallet,
            id: `r${c}`,
          });
        } catch (error) {
          expect(TxBuildError.is(error)).toBe(true);
          expect(store.saves()).toEqual([]);
          continue;
        }
        if (consolidationsOf(plan).length > 0) withSteps++;
        for (const step of consolidationsOf(plan) as TxStep[])
          expectPaysOnlyThePayer(step, address);
        await plan.run();
        expect(plan.status).toBe("final");
        expect(heldAt(emulator, recipient).coin).toBe(payment.lovelace);
        expect(total.coin - heldAt(emulator, address).coin).toBe(
          payment.lovelace + plan.fee,
        );
      }
      expect(withSteps).toBeGreaterThanOrEqual(2);
    },
    LONG,
  );
});
