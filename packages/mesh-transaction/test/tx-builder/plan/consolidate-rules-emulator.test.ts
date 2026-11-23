import type { NativeScript } from "@meshsdk/core";
import type { TxEmulator } from "@meshsdk/tx-emulator";
import { deserializeAddress, resolveNativeScriptHash } from "@meshsdk/core";

import type {
  BuildEvent,
  BuiltTxData,
  TxPlan,
  Utxo,
} from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import {
  mint,
  output,
  spend,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import {
  builderOf,
  caught,
  emulatorOf,
  recipient,
  VALIDATORS,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob, carol } from "./run-util";
import { watchStore } from "./store-util";

// Rules of consolidation steps in a plan: which parked outputs a later step's selection is
// given when it mints or burns, what a final consolidation step leaves, which errors pass as they
// are, the forms of the option `consolidate` and how a record reads it back, one build per
// consolidation step, and which error a plan for a fragmented wallet may throw.

const LONG = 120_000;

/** The builder's limit in these tests, so that a few hundred UTxOs fragment a wallet */
const MAX_TX_SIZE = 4096;

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
 * An emulator holding the wallet's UTxOs with these values, a provider over it and builders with
 * the fast defaults and a smaller transaction size limit; a native policy of the wallet's key
 * and a token of it
 */
const fragmented = async (
  v: Validator,
  values: (unit: string) => readonly Record<string, bigint>[],
  options: { store?: ReturnType<typeof watchStore> } = {},
) => {
  const emulator = await emulatorOf(v, 100_000_000);
  const provider = wrap(emulator);
  const params = await emulator.fetchProtocolParameters();
  const builderFor = (store = options.store) =>
    builderOf(provider, {
      params: { ...params, maxTxSize: MAX_TX_SIZE },
      ...(store !== undefined && { store }),
    });
  const builder = builderFor();
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  const policy: NativeScript = {
    type: "sig",
    keyHash: deserializeAddress(address).pubKeyHash,
  };
  const name = "cafe";
  const unit = `${resolveNativeScriptHash(policy)}${name}`;
  for (const value of values(unit)) emulator.fund(address, value);
  return {
    emulator,
    provider,
    builder,
    builderFor,
    wallet,
    address,
    policy,
    name,
    unit,
  };
};

/** `count` UTxOs of 2 ada and one token each */
const withToken = (count: number) => (unit: string) =>
  Array.from({ length: count }, () => ({ lovelace: 2n * ADA, [unit]: 1n }));

/** `count` UTxOs of `lovelace` each */
const coins = (count: number, lovelace: bigint) => () =>
  Array.from({ length: count }, () => ({ lovelace }));

const pay = (value: Record<string, bigint>, address = recipient) =>
  output({ address, value });

const names = (plan: TxPlan) => plan.steps.map((step) => step.name);

const consolidationsOf = (plan: TxPlan) =>
  plan.steps.filter((step) => step.kind === "consolidation");

/** The outputs of the plan's consolidation steps that are not change */
const parkedOf = (plan: TxPlan) =>
  consolidationsOf(plan).flatMap((step) =>
    step.outputs.filter((each) => each.change !== true),
  );

/** The inputs of a step that are parked outputs of the plan */
const parkedSpentBy = (plan: TxPlan, step: BuiltTxData) => {
  const parked = new Set(parkedOf(plan).map(keyOf));
  return step.inputs.filter((input) => parked.has(keyOf(input)));
};

const sumOf = (utxos: readonly Utxo[], unit: string) =>
  utxos.reduce((sum, utxo) => sum + (utxo.value[unit] ?? 0n), 0n);

/** How much of a unit an address holds on the emulator */
const unitAt = (emulator: TxEmulator, address: string, unit: string) =>
  emulator
    .utxos({ address })
    .flatMap((u) => u.output.amount)
    .filter((a) => a.unit === unit)
    .reduce((sum, a) => sum + BigInt(a.quantity), 0n);

/**
 * A filter that lets every UTxO be selected and keeps the out refs it was asked about: those a
 * build could select
 */
const askedFilter = () => {
  const asked = new Set<string>();
  return {
    asked,
    canSelect: (utxo: Utxo) => {
      asked.add(keyOf(utxo));
      return true;
    },
  };
};

/** The events a trace got, and how many builds of a consolidation step it saw */
const tracer = () => {
  const events: BuildEvent[] = [];
  return {
    events,
    trace: (event: BuildEvent) => events.push(event),
    // A consolidation step is built from a payer of no UTxOs: it selects nothing
    consolidationBuilds: () =>
      events.filter((event) => event.type === "payer" && event.utxos === 0)
        .length,
  };
};

/** A TX_TOO_LARGE of the step by its selection, its name first */
const expectServedTooLarge = (error: unknown, step: string) => {
  expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
  expect((error as TxBuildError<"TX_TOO_LARGE">).details.cause).toBe(
    "selection",
  );
  expect(
    (error as Error).message.startsWith(`step ${JSON.stringify(step)}: `),
  ).toBe(true);
};

/** A step's build replaced, for builds of a consolidation step, by one that throws */
const failingConsolidation = (
  builder: object,
  failure: () => unknown,
): void => {
  const inner = builder as {
    buildList: (...args: unknown[]) => Promise<unknown>;
  };
  const original = inner.buildList.bind(builder);
  inner.buildList = async (...args: unknown[]) => {
    const source = args[0] as {
      form: string;
      snapshot?: { utxos: readonly unknown[] };
    };
    // A consolidation step is built from a payer of no UTxOs: it selects nothing
    if (source.form === "snapshot" && source.snapshot!.utxos.length === 0)
      throw failure();
    return original(...args);
  };
};

describe.each(VALIDATORS)("the token units a later step needs (%s)", (v) => {
  it(
    "a later step that mints the token it pays is given no parked output of it",
    async () => {
      const { emulator, builder, wallet, policy, name, unit } =
        await fragmented(v, withToken(250));
      const { asked, canSelect } = askedFilter();
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 400n * ADA }),
          second: {
            parts: [
              mint.native({ script: policy, assets: { [name]: 500n } }),
              pay({ lovelace: 2n * ADA, [unit]: 500n }, alice),
            ],
            canSelect,
          },
        },
        { payer: wallet },
      );
      const parked = parkedOf(plan);
      expect(sumOf(parked, unit)).toBeGreaterThan(0n);
      // Its selection was never asked about a parked output, and took none
      for (const each of parked) expect(asked.has(keyOf(each))).toBe(false);
      expect(asked.size).toBeGreaterThan(0);
      expect(parkedSpentBy(plan, plan.step("second"))).toEqual([]);

      await plan.run();
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, unit)).toBe(500n);
    },
    LONG,
  );

  it(
    "a later step that burns a parked token is given the parked outputs, and the plan is made and runs",
    async () => {
      const { emulator, builder, wallet, address, policy, name, unit } =
        await fragmented(v, withToken(250));
      const first = pay({ lovelace: 450n * ADA });
      // What the step alone parks: more than the wallet holds outside the parked outputs
      const parked = sumOf(
        parkedOf(await builder.plan({ first }, { payer: wallet })),
        unit,
      );
      expect(parked).toBeGreaterThan(250n - parked);

      const plan = await builder.plan(
        {
          first,
          second: [
            mint.native({ script: policy, assets: { [name]: -parked } }),
          ],
        },
        { payer: wallet },
      );
      expect(sumOf(parkedOf(plan), unit)).toBe(parked);
      expect(parkedSpentBy(plan, plan.step("first"))).toEqual([]);
      expect(parkedSpentBy(plan, plan.step("second")).length).toBeGreaterThan(
        0,
      );

      await plan.run();
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, address, unit)).toBe(250n - parked);
    },
    LONG,
  );
});

describe.each(VALIDATORS)("errors of a step consolidation serves (%s)", (v) => {
  it(
    "the served step's own error stands when consolidation has nothing it may spend",
    async () => {
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA));
      // A filter that lets each UTxO through once: the step's selection takes what it lets
      // through, and a consolidation step may spend none of it
      const once = () => {
        const seen = new Set<string>();
        return (utxo: Utxo) => {
          const key = keyOf(utxo);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        };
      };
      const payment = pay({ lovelace: 400n * ADA });
      const alone = await caught(
        builder.build(payment, { payer: wallet, canSelect: once() }),
      );
      expect(TxBuildError.is(alone, "TX_TOO_LARGE")).toBe(true);
      expect(alone.details.cause).toBe("selection");

      const { trace, consolidationBuilds } = tracer();
      const error = await caught(
        builder.plan(payment, { payer: wallet, canSelect: once(), trace }),
      );
      expectServedTooLarge(error, "main");
      // The same text as the step alone gives: no word of consolidation, no cause
      expect(error.message).toMatch(
        /^step "main": the transaction takes \d+ bytes, more than the 4096 allowed$/,
      );
      expect(alone.message).toMatch(
        /^the transaction takes \d+ bytes, more than the 4096 allowed$/,
      );
      expect(error.message).not.toMatch(/consolidat/);
      expect(error.cause).toBeUndefined();
      expect(error.details.maxTxSize).toBe(MAX_TX_SIZE);
      expect(consolidationBuilds()).toBe(0);
    },
    LONG,
  );

  it(
    "a provider failure and an abort inside a consolidation step's build pass as they are",
    async () => {
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA));
      const payment = pay({ lovelace: 400n * ADA });
      // No provider call is made by such a build today: the failure is put in its place
      const failure = new TxBuildError(
        "PROVIDER_FAILED",
        "fetching the UTxOs failed",
        { details: { operation: "fetchUTxOs" } },
      );
      failingConsolidation(builder, () => failure);
      const failed = await caught(builder.plan(payment, { payer: wallet }));
      expect(failed).toBe(failure);
      expect(TxBuildError.is(failed, "PROVIDER_FAILED")).toBe(true);
      expect(failed.details).toEqual({ operation: "fetchUTxOs" });
      expect(failed.message).toBe('step "main": fetching the UTxOs failed');

      const other = (await fragmented(v, coins(300, 2n * ADA))).builder;
      const abort = new TxBuildError("ABORTED", "the call was aborted");
      failingConsolidation(other, () => abort);
      const aborted = await caught(other.plan(payment, { payer: wallet }));
      expect(aborted).toBe(abort);
      expect(TxBuildError.is(aborted, "ABORTED")).toBe(true);
      expect(aborted.message).toBe('step "main": the call was aborted');

      // Any other failure is told as the served step's error, with it as the cause
      const third = (await fragmented(v, coins(300, 2n * ADA))).builder;
      const short = new TxBuildError("FEE_NOT_CONVERGED", "no fee");
      failingConsolidation(third, () => short);
      const told = await caught(third.plan(payment, { payer: wallet }));
      expectServedTooLarge(told, "main");
      expect(told.cause).toBe(short);
    },
    LONG,
  );
});

describe.each(VALIDATORS)("what a final consolidation step left (%s)", (v) => {
  it(
    "an added step takes it from the payer's read: a parked output spent outside the plan is never given to it",
    async () => {
      const { emulator, builder, wallet, address, unit } = await fragmented(
        v,
        withToken(250),
      );
      // A step of a second payer, left unsigned, keeps the plan going once the others are final
      const other = await walletOf(1);
      emulator.fund((await other.getChangeAddress())!, {
        lovelace: 50n * ADA,
      });
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 400n * ADA }),
          x: { parts: pay({ lovelace: 2n * ADA }, bob), payer: other },
        },
        { payer: wallet },
      );
      const parked = parkedOf(plan);
      expect(parked.length).toBeGreaterThan(0);
      const error = await caught(plan.run());
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      for (const step of plan.steps)
        expect(step.status).toBe(step.name === "x" ? "built" : "final");

      // The payer spends the parked outputs outside the plan
      const moved = sumOf(parked, unit);
      const outside = await builder.build(
        [
          ...parked.map((each) => spend.pubKey({ utxo: each })),
          pay({ lovelace: 2n * ADA, [unit]: moved }, alice),
        ],
        { payer: wallet },
      );
      await emulator.submitTx(await wallet.signTx(outside.tx, true));

      const { asked, canSelect } = askedFilter();
      await plan.add({
        second: {
          parts: pay({ lovelace: 2n * ADA, [unit]: 20n }, carol),
          canSelect,
        },
      });
      for (const each of parked) expect(asked.has(keyOf(each))).toBe(false);
      expect(parkedSpentBy(plan, plan.step("second"))).toEqual([]);

      await plan.run({ signers: [wallet, other] });
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, unit)).toBe(moved);
      expect(unitAt(emulator, carol, unit)).toBe(20n);
      expect(unitAt(emulator, address, unit)).toBe(250n - moved - 20n);
    },
    LONG,
  );
});

describe.each(VALIDATORS)("a step with sendAllTo (%s)", (v) => {
  it(
    "is never consolidated, after other steps too, and nothing is recorded",
    async () => {
      const store = watchStore();
      const { builder, wallet } = await fragmented(v, coins(300, 2n * ADA), {
        store,
      });
      const { trace, events, consolidationBuilds } = tracer();
      const error = await caught(
        builder.plan(
          {
            first: pay({ lovelace: 2n * ADA }, alice),
            sweep: { parts: [], sendAllTo: bob },
          },
          { payer: wallet, id: "sweep", trace },
        ),
      );
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.message.startsWith('step "sweep": ')).toBe(true);
      expect(error.message).not.toMatch(/consolidat/);
      expect(error.cause).toBeUndefined();
      expect(consolidationBuilds()).toBe(0);
      expect(events.filter((event) => event.type === "warning")).toEqual([]);
      expect(store.saves()).toEqual([]);
    },
    LONG,
  );
});

/** 700 UTxOs of 2 ada, and a payment that takes five consolidation steps */
const FIVE_STEPS = { utxos: 700, lovelace: 1190n * ADA };

describe.each(VALIDATORS)("the option consolidate (%s)", (v) => {
  it(
    "true and {} allow four consolidation steps, { maxSteps } as many as it says; each is recorded as given",
    async () => {
      const { builder, wallet } = await fragmented(
        v,
        coins(FIVE_STEPS.utxos, 2n * ADA),
      );
      const payment = pay({ lovelace: FIVE_STEPS.lovelace });
      const made = await builder.plan(payment, {
        payer: wallet,
        consolidate: { maxSteps: 5 },
      });
      expect(consolidationsOf(made)).toHaveLength(5);
      expect(made.toJSON().options.consolidate).toEqual({ maxSteps: 5 });

      for (const [form, allowed] of [
        [true, 4],
        [{}, 4],
        [undefined, 4],
        [{ maxSteps: 2 }, 2],
      ] as const) {
        const error = await caught(
          builder.plan(payment, {
            payer: wallet,
            ...(form !== undefined && { consolidate: form }),
          }),
        );
        expectServedTooLarge(error, "main");
        expect(error.message).toMatch(
          new RegExp(`allows ${allowed} consolidation step`),
        );
      }

      // Recorded as given, and absent when not given
      const small = pay({ lovelace: 2n * ADA }, alice);
      for (const form of [true, {}, { maxSteps: 3 }, false]) {
        const plan = await builder.plan(small, {
          payer: wallet,
          consolidate: form,
        });
        expect(plan.toJSON().options.consolidate).toEqual(form);
      }
      expect(
        (await builder.plan(small, { payer: wallet })).toJSON().options,
      ).not.toHaveProperty("consolidate");
    },
    LONG,
  );

  it(
    "add follows the option read back from a record and from a store",
    async () => {
      const store = watchStore();
      const { builder, builderFor, wallet } = await fragmented(
        v,
        coins(FIVE_STEPS.utxos, 2n * ADA),
        { store },
      );
      const small = pay({ lovelace: 2n * ADA }, alice);
      const big = pay({ lovelace: FIVE_STEPS.lovelace - 2n * ADA }, bob);
      const forms = [
        { id: "true", consolidate: true, allowed: 4 },
        { id: "empty", consolidate: {}, allowed: 4 },
        { id: "two", consolidate: { maxSteps: 2 }, allowed: 2 },
        { id: "five", consolidate: { maxSteps: 5 }, allowed: 5 },
      ] as const;
      for (const { id, consolidate, allowed } of forms) {
        const plan = await builder.plan(
          { a: small },
          { payer: wallet, id, consolidate },
        );
        const json = JSON.parse(JSON.stringify(plan.toJSON()));
        for (const from of ["record", "store"] as const) {
          const restarted = builderFor(from === "store" ? store : undefined);
          const read =
            from === "store"
              ? await restarted.resume(id, { payer: wallet })
              : await restarted.resume(json, { payer: wallet });
          expect(read.toJSON().options.consolidate).toEqual(consolidate);
          if (allowed < 5) {
            const before = JSON.stringify(read.toJSON());
            const error = await caught(read.add({ b: big }));
            expectServedTooLarge(error, "b");
            expect(error.message).toMatch(
              new RegExp(`allows ${allowed} consolidation step`),
            );
            expect(JSON.stringify(read.toJSON())).toBe(before);
          } else {
            await read.add({ b: big });
            expect(names(read)).toEqual([
              "a",
              ...[1, 2, 3, 4, 5].map((n) => `consolidate-${n}`),
              "b",
            ]);
          }
        }
      }
    },
    LONG,
  );
});

describe.each(VALIDATORS)("consolidation steps are built once (%s)", (v) => {
  it(
    "one build per consolidation step, with tokens parked or not",
    async () => {
      for (const values of [
        coins(FIVE_STEPS.utxos, 2n * ADA),
        withToken(400),
      ]) {
        const { builder, wallet } = await fragmented(v, values);
        const { trace, consolidationBuilds } = tracer();
        const plan = await builder.plan(pay({ lovelace: 700n * ADA }), {
          payer: wallet,
          trace,
        });
        const steps = consolidationsOf(plan).length;
        expect(steps).toBeGreaterThanOrEqual(2);
        expect(consolidationBuilds()).toBe(steps);
      }
    },
    LONG,
  );
});

describe.each(VALIDATORS)("a plan for random fragmented wallets (%s)", (v) => {
  it(
    "is made and runs, or throws the served step's TX_TOO_LARGE and records nothing",
    async () => {
      const random = seeded(20261116);
      const units = ["f1", "f2"].flatMap((p) =>
        Array.from(
          { length: 20 },
          (_, i) => `${p.repeat(28)}${i.toString(16).padStart(6, "0")}`,
        ),
      );
      const CASES = 8;
      let made = 0;
      let thrown = 0;
      for (let c = 0; c < CASES; c++) {
        // A token the payment takes, spread over many UTxOs, in every other wallet
        const spread = c % 2 === 1;
        // A step before it, whose change it stands on, in half of them
        const before = c % 4 >= 2;
        let wantedUnit = "";
        const store = watchStore();
        const { emulator, builder, wallet, address } = await fragmented(
          v,
          (unit) => {
            wantedUnit = unit;
            return Array.from(
              { length: 250 + Math.floor(random() * 650) },
              () => {
                const value: Record<string, bigint> = {
                  lovelace: BigInt(
                    1_200_000 + Math.floor(random() * 2_000_000),
                  ),
                };
                if (random() < 0.3)
                  for (let k = 1 + Math.floor(random() * 4); k > 0; k--)
                    value[units[Math.floor(random() * units.length)]!] = BigInt(
                      1 + Math.floor(random() * 1000),
                    );
                if (spread && random() < 0.6)
                  value[unit] = BigInt(1 + Math.floor(random() * 5));
                return value;
              },
            );
          },
          { store },
        );
        // A filter that refuses about a tenth of the wallet, in some of them
        const refused = new Set<string>();
        if (random() < 0.5)
          for (const u of emulator.utxos({ address }))
            if (random() < 0.1) refused.add(keyOf(u.input));
        const canSelect =
          refused.size > 0
            ? (utxo: Utxo) => !refused.has(keyOf(utxo))
            : undefined;
        const allowed = emulator
          .utxos({ address })
          .filter((u) => !refused.has(keyOf(u.input)))
          .flatMap((u) => u.output.amount);
        const total = (unit: string) =>
          allowed
            .filter((a) => a.unit === unit)
            .reduce((sum, a) => sum + BigInt(a.quantity), 0n);
        const payment: Record<string, bigint> = {
          lovelace:
            (total("lovelace") * BigInt(40 + Math.floor(random() * 55))) / 100n,
        };
        if (spread)
          payment[wantedUnit] =
            (total(wantedUnit) * BigInt(40 + Math.floor(random() * 50))) / 100n;
        const steps = {
          ...(before && { pre: pay({ lovelace: 3n * ADA }, alice) }),
          main: pay(payment),
        };
        let plan: TxPlan;
        try {
          plan = await builder.plan(steps, {
            payer: wallet,
            id: `r${c}`,
            ...(canSelect && { canSelect }),
          });
        } catch (error) {
          expectServedTooLarge(error, "main");
          expect((error as Error).message).toMatch(
            /allows 4 consolidation step/,
          );
          expect(store.saves()).toEqual([]);
          expect(await store.load(`r${c}`)).toBeUndefined();
          thrown++;
          continue;
        }
        made++;
        expect(names(plan).at(-1)).toBe("main");
        for (const step of consolidationsOf(plan)) {
          for (const each of step.outputs) expect(each.address).toBe(address);
          for (const input of step.inputs)
            expect(refused.has(keyOf(input))).toBe(false);
        }
        await plan.run();
        expect(plan.status).toBe("final");
        for (const [unit, quantity] of Object.entries(payment))
          expect(unitAt(emulator, recipient, unit)).toBe(quantity);
      }
      expect(made).toBeGreaterThanOrEqual(2);
      expect(thrown).toBeGreaterThanOrEqual(1);
    },
    LONG,
  );
});
