import { TxBuildError } from "../../../src/tx-builder";
import { coins, consolidationsOf, fragmented, pay } from "./consolidate-util";
import { caught } from "./plan-emulator-util";
import { ADA, alice, bob } from "./run-util";

// The option `consolidate` read strictly, the names of consolidation steps after a record with a
// gap in them, and what a step short of funds after its consolidation steps is told.

const LONG = 300_000;

/** The names of a plan's steps */
const names = (plan: { steps: readonly { name: string }[] }) =>
  plan.steps.map((step) => step.name);

describe("consolidation steps, in detail", () => {
  it(
    "takes consolidate only as a flag or a plain object whose one own member may be maxSteps",
    async () => {
      const { builder, wallet, provider } = await fragmented(
        coins(2, 5n * ADA),
      );
      const calls = provider.control.count("fetchAddressUTxOs");
      const symbol = Symbol("maxSteps");
      for (const value of [
        new Map([["maxSteps", 2]]),
        new Date(0),
        Object.create({ maxSteps: 2 }),
        { [symbol]: 2 },
        Object.defineProperty({}, "hidden", { value: 1, enumerable: false }),
        new (class Options {
          maxSteps = 2;
        })(),
      ]) {
        const error = await caught(
          builder.plan(pay({ lovelace: 2n * ADA }), {
            payer: wallet,
            consolidate: value as never,
          }),
        );
        expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
        expect(error.details).toEqual({
          option: "consolidate",
          value: "object",
          allowed: expect.any(String),
        });
        expect(error.message).not.toMatch(/hidden|Options|Map|Date/);
      }
      expect(provider.control.count("fetchAddressUTxOs")).toBe(calls);
      // An object without a prototype is a plain one
      const bare = Object.assign(Object.create(null), { maxSteps: 2 });
      const plan = await builder.plan(pay({ lovelace: 2n * ADA }), {
        payer: wallet,
        consolidate: bare,
      });
      expect(plan.toJSON().options.consolidate).toEqual({ maxSteps: 2 });
    },
    LONG,
  );

  it(
    "numbers a new consolidation step one above the highest the plan has",
    async () => {
      const { builder, wallet } = await fragmented(coins(900, 2n * ADA), {
        maxTxSize: 4096,
      });
      const plan = await builder.plan(
        { a: pay({ lovelace: 600n * ADA }, alice) },
        { payer: wallet, consolidate: { maxSteps: 12 } },
      );
      const first = consolidationsOf(plan).map((step) => step.name);
      expect(first.length).toBeGreaterThanOrEqual(2);
      // A record whose first consolidation step is numbered above the others
      const text = JSON.stringify(plan.toJSON()).replaceAll(
        '"consolidate-1"',
        '"consolidate-9"',
      );
      const resumed = await builder.resume(JSON.parse(text), { payer: wallet });
      const recorded = names(resumed);
      expect(recorded[0]).toBe("consolidate-9");
      await resumed.add({ b: pay({ lovelace: 600n * ADA }, bob) });
      const added = names(resumed).slice(recorded.length, -1);
      expect(added.length).toBeGreaterThan(0);
      expect(added).toEqual(added.map((_, i) => `consolidate-${10 + i}`));
      expect(names(resumed).at(-1)).toBe("b");
    },
    LONG,
  );

  it(
    "says how many consolidation steps a step short of funds got, and their fees",
    async () => {
      const { builder, wallet } = await fragmented(coins(300, 2n * ADA), {
        maxTxSize: 4096,
      });
      // Enough for the step on the wallet as it is, not after the fees of its consolidation
      // steps
      const error = await caught(
        builder.plan(pay({ lovelace: 598_500_000n }), { payer: wallet }),
      );
      expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
      expect(error.message.startsWith('step "main": ')).toBe(true);
      // The details are those of the step's build: what it found available is the wallet less
      // the fees of its consolidation steps
      expect(error.details.unit).toBe("lovelace");
      const taken = 600n * ADA - (error.details.available as bigint);
      expect(taken).toBeGreaterThan(0n);
      const told =
        /the plan would put (\d+) consolidation step\(s\) before it, whose fees take (\d+) lovelace/.exec(
          error.message,
        );
      expect(told).not.toBeNull();
      expect(Number(told![1])).toBeGreaterThan(0);
      expect(BigInt(told![2]!)).toBe(taken);
    },
    LONG,
  );
});
