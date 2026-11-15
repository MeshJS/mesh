import type { BuiltTx } from "../../../src/tx-builder";
import {
  output,
  spend,
  TxBuildError,
  TxPlanError,
} from "../../../src/tx-builder";
import { caught } from "./plan-emulator-util";
import { ADA, alice, bob, payTo, stepSetup } from "./run-util";
import { storeSetup } from "./store-util";

// A step given as text that no transaction is read from is refused before any request; the
// object `rest` gives for a step given built holds what the record has for it.

const LONG = 120_000;

/** The calls of a provider, all methods together */
const allCalls = (calls: Record<string, number>) =>
  Object.values(calls).reduce((sum, n) => sum + n, 0);

/** Texts no transaction is read from: empty, not hex, and refused by the walk of the bytes */
const UNREAD = ["", "hello", "84", "a0"];

describe("a step given built, by its form", () => {
  it(
    "refuses a text no transaction is read from before any request, as fromCbor does",
    async () => {
      const ctx = await storeSetup();
      const plan = await ctx.builder.plan(
        { a: payTo(alice, 2n * ADA) },
        { payer: ctx.wallet, id: "forms" },
      );
      for (const text of UNREAD) {
        const alone = await caught(ctx.builder.fromCbor(text));
        expect(TxBuildError.is(alone, "INVALID_OPTION")).toBe(true);
        const calls = allCalls(ctx.provider.control.calls);
        const loads = ctx.store.loads();
        for (const call of [
          () =>
            ctx.builder.plan(
              { x: text, b: payTo(bob, 1n * ADA) },
              { payer: ctx.wallet, id: "other" },
            ),
          () => plan.add({ x: text }),
        ]) {
          const error = await caught(call());
          expect(error.code).toBe(alone.code);
          expect(error.details).toEqual(alone.details);
          expect(error.message).toBe(`step "x": ${alone.message}`);
        }
        expect(allCalls(ctx.provider.control.calls)).toBe(calls);
        expect(ctx.store.loads()).toBe(loads);
      }
      expect(plan.steps.map((step) => step.name)).toEqual(["a"]);
    },
    LONG,
  );

  it(
    "rest gives a step given built back with its witnesses, labels and change marks, and no payer",
    async () => {
      const ctx = await stepSetup("scalus", {
        funds: [1000n * ADA, 20n * ADA],
      });
      // Built here, not signed: its labels and change come with the object
      const fund = await ctx.builder.build(
        [
          output({
            address: ctx.address,
            value: { lovelace: 10n * ADA },
            label: "vault",
          }),
          payTo(alice, 2n * ADA),
        ],
        { payer: ctx.wallet },
      );
      const steps = {
        fund,
        next: [
          spend.pubKey({ utxo: { step: "fund", output: "vault" } }),
          payTo(bob, 3n * ADA),
        ],
      };
      const plan = await ctx.builder.plan(steps, { payer: ctx.wallet });
      const { rest } = plan;
      const back = rest.fund as BuiltTx;
      expect(back.txHash).toBe(fund.txHash);
      expect(back.outputs.map((o) => o.label)).toEqual(
        fund.outputs.map((o) => o.label),
      );
      expect(back.outputs.map((o) => o.change === true)).toEqual(
        fund.outputs.map((o) => o.change === true),
      );
      expect(back.change).toEqual(fund.change);
      expect(back.missing).toEqual(fund.missing);
      // No payer: without a signer it signs nothing
      const unsigned = await caught(back.sign());
      expect(TxPlanError.is(unsigned, "MISSING_SIGNATURES")).toBe(true);
      // A plan made from rest keeps the link by label
      const again = await ctx.builder.plan(rest, { payer: ctx.wallet });
      expect(again.step("fund").outputs[0]!.label).toBe("vault");
      expect(
        again
          .step("next")
          .inputs.filter((u) => u.txHash === fund.txHash)
          .map((u) => u.outputIndex),
      ).toContain(0);
    },
    LONG,
  );
});
