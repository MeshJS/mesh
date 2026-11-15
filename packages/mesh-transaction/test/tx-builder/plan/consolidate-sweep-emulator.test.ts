import type { TxPlan } from "../../../src/tx-builder";
import { TxPlanError } from "../../../src/tx-builder";
import {
  consolidationsOf,
  fragmented,
  keyOf,
  parkedOf,
  pay,
  unitAt,
  wanted,
  withWanted,
} from "./consolidate-util";
import { caught, walletOf } from "./plan-emulator-util";
import { ADA, alice, bob, paidTo } from "./run-util";

// A step with sendAllTo after consolidation steps of its payer: it takes every output they
// parked, so that the payer is left with nothing, whether the consolidation steps are in the
// same call, in a block, or final.

const LONG = 300_000;

/** The parked outputs of the plan, each once, as out refs */
const parkedKeys = (plan: TxPlan) => parkedOf(plan).map(keyOf);

/** The inputs of a step as out refs, each once */
const inputKeys = (plan: TxPlan, name: string) =>
  plan.step(name).inputs.map(keyOf);

describe("a sweep after consolidation steps", () => {
  it(
    "takes every output the plan parked: the payer is left with nothing",
    async () => {
      for (const parts of [[pay({ lovelace: 1n * ADA }, alice)], []]) {
        const { emulator, builder, wallet, address } = await fragmented(
          withWanted(250),
          { maxTxSize: 4096 },
        );
        const plan = await builder.plan(
          {
            first: pay({ lovelace: 400n * ADA }),
            sweep: { parts, sendAllTo: alice },
          },
          { payer: wallet, consolidate: { maxSteps: 8 } },
        );
        expect(consolidationsOf(plan).length).toBeGreaterThan(0);
        const parked = parkedKeys(plan);
        expect(parked.length).toBeGreaterThan(0);
        // The served step leaves them, the sweep takes them all
        const first = inputKeys(plan, "first");
        for (const each of parked) expect(first).not.toContain(each);
        expect(inputKeys(plan, "sweep")).toEqual(
          expect.arrayContaining(parked),
        );

        await plan.run();
        expect(plan.status).toBe("final");
        expect(emulator.utxos({ address })).toEqual([]);
        expect(unitAt(emulator, alice, wanted)).toBe(250n);
      }
    },
    LONG,
  );

  it(
    "an added sweep takes the parked outputs of a final consolidation step from the payer's read",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096 },
      );
      // A step of a second payer, left unsigned, keeps the plan going once the others are final
      const other = await walletOf(1);
      emulator.fund((await other.getChangeAddress())!, { lovelace: 50n * ADA });
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 400n * ADA }),
          x: { parts: pay({ lovelace: 2n * ADA }, bob), payer: other },
        },
        { payer: wallet },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      const error = await caught(plan.run());
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      for (const step of plan.steps)
        expect(step.status).toBe(step.name === "x" ? "built" : "final");

      await plan.add({ sweep: { parts: [], sendAllTo: alice } });
      const sweep = inputKeys(plan, "sweep");
      expect(sweep).toEqual(expect.arrayContaining(parked));
      expect(new Set(sweep).size).toBe(sweep.length);
      await plan.run({ signers: [wallet, other] });
      expect(plan.status).toBe("final");
      expect(emulator.utxos({ address })).toEqual([]);
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
      expect(paidTo(emulator, bob)).toEqual([2n * ADA]);
    },
    LONG,
  );

  it(
    "an added sweep takes the parked outputs of a consolidation step in a block and not final, each once",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096, confirmations: 3 },
      );
      const plan = await builder.plan(
        { first: pay({ lovelace: 400n * ADA }) },
        { payer: wallet },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      await plan.run();
      for (const step of plan.steps) expect(step.status).toBe("included");

      // The payer's read lists the parked outputs, and so does the copy of the step the build
      // is given: the sweep spends each once
      await plan.add({ sweep: { parts: [], sendAllTo: alice } });
      const sweep = inputKeys(plan, "sweep");
      expect(sweep).toEqual(expect.arrayContaining(parked));
      expect(new Set(sweep).size).toBe(sweep.length);
      await plan.run();
      expect(plan.step("sweep").status).toBe("included");
      expect(emulator.utxos({ address })).toEqual([]);
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
    },
    LONG,
  );
});
