import type { TxEmulator } from "@meshsdk/tx-emulator";

import type {
  BuiltTxData,
  SelectInputs,
  TxPlan,
  Utxo,
} from "../../../src/tx-builder";
import {
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
  swallowing,
  walletOf,
  wrap,
} from "./plan-emulator-util";
import { ADA, alice, bob } from "./run-util";

// Tokens a consolidation step parks in outputs of their own: out of reach of the step it serves,
// within reach of a later step of the plan that needs them, in `builder.plan` and `plan.add`.

const LONG = 300_000;

const wanted = `${"d4".repeat(28)}cafe`;

const keyOf = (ref: { txHash: string; outputIndex: number }) =>
  `${ref.txHash}#${ref.outputIndex}`;

/** An emulator holding the wallet's UTxOs with these values, and a builder over it */
const fragmented = async (values: readonly Record<string, bigint>[]) => {
  const emulator = await emulatorOf(100_000_000);
  const provider = wrap(emulator);
  const builder = builderOf(provider);
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  for (const value of values) emulator.fund(address, value);
  return { emulator, provider, builder, wallet, address };
};

/** `count` UTxOs of 2 ada and one `wanted` each */
const withWanted = (count: number) =>
  Array.from({ length: count }, () => ({ lovelace: 2n * ADA, [wanted]: 1n }));

const pay = (value: Record<string, bigint>, address = recipient) =>
  output({ address, value });

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

/** How much of a unit an address holds on the emulator */
const unitAt = (emulator: TxEmulator, address: string, unit: string) =>
  emulator
    .utxos({ address })
    .flatMap((u) => u.output.amount)
    .filter((a) => a.unit === unit)
    .reduce((sum, a) => sum + BigInt(a.quantity), 0n);

/** The outputs at an address on the emulator, each once */
const outputsAt = (emulator: TxEmulator, address: string) =>
  emulator.utxos({ address }).length;

const sumOf = (utxos: readonly Utxo[], unit: string) =>
  utxos.reduce((sum, utxo) => sum + (utxo.value[unit] ?? 0n), 0n);

describe("parked tokens and later steps of the plan", () => {
  it(
    "a later step that pays a token an earlier consolidation step parked spends the parked output",
    async () => {
      const { emulator, builder, wallet } = await fragmented(withWanted(900));
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 1000n * ADA }),
          second: pay({ lovelace: 2n * ADA, [wanted]: 500n }, alice),
        },
        { payer: wallet },
      );
      const extra = consolidationsOf(plan);
      expect(extra.length).toBeGreaterThan(0);
      expect(sumOf(parkedOf(plan), wanted)).toBeGreaterThan(0n);
      // The served step never spends what its consolidation steps parked
      expect(parkedSpentBy(plan, plan.step("first"))).toEqual([]);
      expect(parkedSpentBy(plan, plan.step("second")).length).toBeGreaterThan(
        0,
      );

      await plan.run();
      expect(plan.status).toBe("final");
      expect(outputsAt(emulator, recipient)).toBe(1);
      expect(outputsAt(emulator, alice)).toBe(1);
      expect(unitAt(emulator, alice, wanted)).toBe(500n);
      expect(unitAt(emulator, recipient, "lovelace")).toBe(1000n * ADA);
    },
    LONG,
  );

  it(
    "a later step that needs no parked token spends no parked output, and its own error stands when it is short",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(900),
      );
      const first = pay({ lovelace: 1000n * ADA });
      const plan = await builder.plan(
        { first, second: pay({ lovelace: 50n * ADA }, alice) },
        { payer: wallet },
      );
      expect(consolidationsOf(plan).length).toBeGreaterThan(0);
      for (const step of plan.steps)
        expect(parkedSpentBy(plan, step)).toEqual([]);

      // More lovelace than the wallet holds outside the parked outputs
      const alone = await builder.plan({ first }, { payer: wallet });
      const spent = new Set(alone.steps.flatMap((s) => s.inputs.map(keyOf)));
      const outside =
        emulator
          .utxos({ address })
          .filter((u) => !spent.has(keyOf(u.input)))
          .reduce(
            (sum, u) =>
              sum +
              BigInt(
                u.output.amount.find((a) => a.unit === "lovelace")!.quantity,
              ),
            0n,
          ) + sumOf(alone.step("first").change, "lovelace");
      const error = await caught(
        builder.plan(
          { first, second: pay({ lovelace: 2000n * ADA }, alice) },
          { payer: wallet },
        ),
      );
      expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
      expect(error.message.startsWith('step "second": ')).toBe(true);
      expect(error.details.unit).toBe("lovelace");
      // What it counts as available is the wallet outside the parked outputs
      expect(error.details.available).toBe(outside);
      expect(sumOf(parkedOf(alone), "lovelace")).toBeGreaterThan(0n);
    },
    LONG,
  );

  it(
    "the served step never spends an output its own consolidation steps parked",
    async () => {
      // A token the step pays from a UTxO it names by reference: the consolidation step parks
      // the token, and a selection that takes the least lovelace first would take the parked
      // outputs first
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(600),
      );
      const named = emulator.fund(address, {
        lovelace: 5n * ADA,
        [wanted]: 1000n,
      }).input;
      const leastFirst: SelectInputs = (need, candidates) => {
        const sorted = [...candidates].sort((a, b) =>
          a.value.lovelace < b.value.lovelace
            ? -1
            : a.value.lovelace > b.value.lovelace
              ? 1
              : 0,
        );
        const taken: Utxo[] = [];
        const covered = () =>
          Object.entries(need).every(
            ([unit, n]) => n === undefined || sumOf(taken, unit) >= n,
          );
        for (const utxo of sorted) {
          if (covered()) break;
          taken.push(utxo);
        }
        return taken.map((utxo) => ({
          txHash: utxo.txHash,
          outputIndex: utxo.outputIndex,
        }));
      };
      const plan = await builder.plan(
        [
          spend.pubKey({ utxo: named }),
          pay({ lovelace: 900n * ADA, [wanted]: 1000n }, alice),
        ],
        { payer: wallet, coinSelection: leastFirst },
      );
      expect(consolidationsOf(plan).length).toBeGreaterThan(0);
      expect(sumOf(parkedOf(plan), wanted)).toBeGreaterThan(0n);
      expect(parkedSpentBy(plan, plan.step("main"))).toEqual([]);
      await plan.run();
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, wanted)).toBe(1000n);
    },
    LONG,
  );
  it(
    "an added step spends a parked output of a consolidation step that was sent and is not in a block",
    async () => {
      const { emulator, builder, wallet } = await fragmented(withWanted(900));
      const plan = await builder.plan(
        { first: pay({ lovelace: 1000n * ADA }) },
        { payer: wallet },
      );
      expect(consolidationsOf(plan).length).toBeGreaterThan(0);
      const held = swallowing();
      await plan.run({ submitter: held, waitFor: "sent" });
      expect(plan.step("consolidate-1").status).toBe("sent");
      expect(plan.step("first").status).toBe("built");

      await plan.add({
        second: pay({ lovelace: 2n * ADA, [wanted]: 500n }, alice),
      });
      const second = plan.step("second");
      const parked = parkedSpentBy(plan, second);
      expect(parked.length).toBeGreaterThan(0);
      expect(second.standsOn).toEqual(
        expect.arrayContaining(["consolidate-1", "first"]),
      );

      // The consolidation step lands, and the plan goes on to the end
      await emulator.submitTx(held.calls[0]!);
      await plan.run();
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, wanted)).toBe(500n);
      expect(outputsAt(emulator, alice)).toBe(1);
      expect(unitAt(emulator, recipient, "lovelace")).toBe(1000n * ADA);
    },
    LONG,
  );

  it(
    "an added step takes a parked output of a final consolidation step from the payer's read",
    async () => {
      const { emulator, builder, wallet } = await fragmented(withWanted(900));
      // A step of a second payer, left unsigned, keeps the plan going once the others are final
      const other = await walletOf(1);
      emulator.fund((await other.getChangeAddress())!, {
        lovelace: 50n * ADA,
      });
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 1000n * ADA }),
          x: { parts: pay({ lovelace: 2n * ADA }, bob), payer: other },
        },
        { payer: wallet },
      );
      expect(consolidationsOf(plan).length).toBeGreaterThan(0);
      const error = await caught(plan.run());
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      for (const step of plan.steps)
        expect(step.status).toBe(step.name === "x" ? "built" : "final");

      await plan.add({
        second: pay({ lovelace: 2n * ADA, [wanted]: 500n }, alice),
      });
      const second = plan.step("second");
      expect(parkedSpentBy(plan, second).length).toBeGreaterThan(0);
      await plan.run({ signers: [wallet, other] });
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, wanted)).toBe(500n);
      expect(outputsAt(emulator, alice)).toBe(1);
      expect(outputsAt(emulator, bob)).toBe(1);
    },
    LONG,
  );
  it(
    "a later step whose selection takes parked outputs and still does not fit gets consolidation steps of its own, which park again what it does not need",
    async () => {
      // UTxOs of 10 ada, one wanted and ten tokens of their own: what a consolidation step
      // parks fills several outputs
      const junk = "e5".repeat(28);
      let k = 0;
      const values = Array.from({ length: 200 }, () => {
        const value: Record<string, bigint> = {
          lovelace: 10n * ADA,
          [wanted]: 1n,
        };
        for (let j = 0; j < 10; j++)
          value[`${junk}${(k++).toString(16).padStart(56, "0")}`] = 1n;
        return value;
      });
      const { emulator, builder, wallet } = await fragmented(values);
      const first = pay({ lovelace: 1200n * ADA });
      const alone = await builder.plan({ first }, { payer: wallet });
      const before = consolidationsOf(alone).length;
      expect(before).toBeGreaterThanOrEqual(2);
      // One token of every parked output: the step's selection takes all of them, and only them
      const units = parkedOf(alone).map((each) =>
        Object.keys(each.value).find((u) => u.startsWith(junk))!,
      );
      expect(units.length).toBeGreaterThan(before);
      const second = pay(
        {
          lovelace: 5n * ADA,
          ...Object.fromEntries(units.map((unit) => [unit, 1n])),
        },
        alice,
      );

      // With no room for consolidation steps of its own: TX_TOO_LARGE saying so
      const error = await caught(
        builder.plan(
          { first, second },
          { payer: wallet, consolidate: { maxSteps: before + 1 } },
        ),
      );
      expect(TxBuildError.is(error, "TX_TOO_LARGE")).toBe(true);
      expect(error.details.cause).toBe("selection");
      expect(error.message.startsWith('step "second": ')).toBe(true);
      expect(error.message).toMatch(
        new RegExp(`allows ${before + 1} consolidation step`),
      );

      const plan = await builder.plan(
        { first, second },
        { payer: wallet, consolidate: { maxSteps: 12 } },
      );
      const steps = plan.steps.map((step) => step.name);
      const at = steps.indexOf("first");
      expect(steps.slice(0, at)).toEqual(
        consolidationsOf(alone).map((step) => step.name),
      );
      const own = plan.steps.slice(at + 1, -1);
      expect(own.length).toBeGreaterThan(0);
      expect(steps.at(-1)).toBe("second");
      const earlier = new Set(
        plan.steps
          .slice(0, at)
          .flatMap((step) => step.outputs.filter((o) => o.change !== true))
          .map(keyOf),
      );
      const needed = new Set(units);
      for (const step of own) {
        expect(step.kind).toBe("consolidation");
        // It spends parked outputs, keeps what the step needs in its change, parks the rest
        expect(step.inputs.some((input) => earlier.has(keyOf(input)))).toBe(
          true,
        );
        for (const each of step.outputs)
          if (each.change !== true)
            expect(Object.keys(each.value).some((u) => needed.has(u))).toBe(
              false,
            );
      }
      const ownParked = new Set(
        own.flatMap((step) =>
          step.outputs.filter((o) => o.change !== true).map(keyOf),
        ),
      );
      const last = plan.step("second");
      expect(last.inputs.some((input) => ownParked.has(keyOf(input)))).toBe(
        false,
      );

      await plan.run();
      expect(plan.status).toBe("final");
      for (const unit of units) expect(unitAt(emulator, alice, unit)).toBe(1n);
      expect(outputsAt(emulator, alice)).toBe(1);
      expect(unitAt(emulator, recipient, "lovelace")).toBe(1200n * ADA);
    },
    LONG,
  );
});
