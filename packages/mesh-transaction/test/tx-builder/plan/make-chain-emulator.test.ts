import { mConStr0 } from "@meshsdk/core";

import {
  collateral,
  spend,
  TxBuildError,
  TxPartError,
  TxPlanError,
} from "../../../src/tx-builder";
import { makePlan } from "../../../src/tx-builder/plan/make";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor } from "../../test-util";
import { caught, VALIDATORS } from "./plan-emulator-util";
import { ADA, alice, bob, carol, paidTo, payTo, stepSetup } from "./run-util";

// A group as it is built: the steps of one payer stand on each other always, the transactions
// of `after` a step spends from are recorded with it, a linked part is read as strictly
// wherever it comes from, and a link to change another step took names that step.

const script = { code: alwaysSucceedCbor, version: "V3" as const };

describe.each(VALIDATORS)("the steps of one payer (%s)", (v) => {
  it("stand on each other: a step that can spend no change of the step before it of its payer is refused, whatever canSelect lets through", async () => {
    const { builder, wallet } = await stepSetup(v, {
      funds: [100n * ADA, 100n * ADA, 100n * ADA],
    });
    const error = await caught(
      makePlan(
        builder,
        { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
        { payer: wallet, canSelect: (u) => u.value.lovelace >= 100n * ADA },
      ),
    );
    expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
    expect(error.details.option).toBe("steps");
    expect(error.message).toMatch(/step "b"/);
    expect(error.message).toMatch(/step "a"/);
    expect(error.message).toMatch(/canSelect/);
    expect(error.message).toMatch(/link/i);
    expect(error.message).toMatch(/plan of its own/);
  });

  it("spend the change of the step before when canSelect lets it through", async () => {
    const { builder, wallet } = await stepSetup(v, {
      funds: [100n * ADA, 100n * ADA, 100n * ADA],
    });
    const made = await makePlan(
      builder,
      { a: payTo(alice, 5n * ADA), b: payTo(bob, 3n * ADA) },
      { payer: wallet, canSelect: (u) => u.value.lovelace >= 90n * ADA },
    );
    const [a, b] = made.steps;
    expect(b!.standsOn).toEqual(["a"]);
    expect(
      b!.built.inputs.some((input) => input.txHash === a!.built.txHash),
    ).toBe(true);
  });

  it("stand on each other: a step after one that leaves no change at the payer's address is refused", async () => {
    const { builder, wallet } = await stepSetup(v, {
      funds: [100n * ADA, 100n * ADA],
    });
    const error = await caught(
      makePlan(
        builder,
        {
          a: { parts: payTo(alice, 5n * ADA), sendAllTo: carol },
          b: payTo(bob, 3n * ADA),
        },
        { payer: wallet },
      ),
    );
    expect([error.code, error.details.option]).toEqual([
      "INVALID_OPTION",
      "steps",
    ]);
    expect(error.message).toMatch(/step "b"/);
    expect(error.message).toMatch(/no change/);
  });

  it("may link an output of the step before in place of its change", async () => {
    const { builder, wallet } = await stepSetup(v, {
      funds: [100n * ADA, 100n * ADA],
    });
    const made = await makePlan(
      builder,
      {
        a: { parts: payTo(alice, 5n * ADA, "x"), sendAllTo: carol },
        b: [
          spend.pubKey({ utxo: { step: "a", output: "x" } }),
          payTo(bob, 3n * ADA),
        ],
      },
      { payer: wallet },
    );
    expect(made.steps[1]!.standsOn).toEqual(["a"]);
  });
});

describe.each(VALIDATORS)("a link (%s)", (v) => {
  it("to the change of a step that is not the one before names the step that spends it", async () => {
    const { builder, wallet } = await stepSetup(v);
    const error = await caught(
      makePlan(
        builder,
        {
          a: payTo(alice, 5n * ADA),
          b: payTo(bob, 3n * ADA),
          c: [
            spend.pubKey({ utxo: { step: "a", change: true } }),
            payTo(carol, 2n * ADA),
          ],
        },
        { payer: wallet },
      ),
    );
    expect([error.code, error.details.option]).toEqual([
      "INVALID_OPTION",
      "steps",
    ]);
    expect(error.message).toMatch(/step "c"/);
    expect(error.message).toMatch(/step "b" spends/);
  });

  describe("in a part not made by the part builders", () => {
    const made = async (part: unknown) => {
      const { builder, wallet } = await stepSetup(v);
      return caught(
        makePlan(
          builder,
          {
            a: payTo(alice, 5n * ADA),
            b: [part as never, payTo(bob, 1n * ADA)],
          },
          { payer: wallet },
        ),
      );
    };

    it("is refused with all the change on a part other than a key spend", async () => {
      const error = await made({
        ...collateral({ utxo: { step: "a", output: 1 } }),
        link: { step: "a", change: true },
      });
      expect(TxPartError.is(error, "INVALID_OUT_REF")).toBe(true);
      expect(error.message).toMatch(/step "b"/);
    });

    it("is refused with a member a link does not have", async () => {
      const error = await made({
        ...spend.pubKey({ utxo: { step: "a", output: 1 } }),
        link: { step: "a", output: 1, note: "x" },
      });
      expect(TxPartError.is(error, "INVALID_OUT_REF")).toBe(true);
      expect(error.message).toMatch(/note/);
    });

    it("is refused on a part that takes no link, and with a member a linked part does not have", async () => {
      const onOutput = await made({
        ...payTo(bob, 1n * ADA),
        link: { step: "a", output: 0 },
      });
      expect([onOutput.code, onOutput.details.option]).toEqual([
        "INVALID_OPTION",
        "parts",
      ]);
      expect(onOutput.message).toMatch(/output/);
      const extra = await made({
        ...spend.pubKey({ utxo: { step: "a", output: 1 } }),
        input: { transaction_id: "00".repeat(32), index: 0 },
      });
      expect([extra.code, extra.details.option]).toEqual([
        "INVALID_OPTION",
        "parts",
      ]);
      expect(extra.message).toMatch(/input/);
    });

    it("is read as strictly when it comes from JSON", async () => {
      const { builder, wallet } = await stepSetup(v);
      const plan = await builder.plan(
        {
          a: payTo(alice, 5n * ADA),
          b: [
            spend.pubKey({ utxo: { step: "a", output: 1 } }),
            payTo(bob, 1n * ADA),
          ],
        },
        { payer: wallet },
      );
      const rest = JSON.parse(
        JSON.stringify(plan.rest, (_, v) =>
          typeof v === "bigint" ? Number(v) : v,
        ),
      );
      rest.b[0].link.note = "x";
      const error = await caught(
        makePlan(
          builder,
          { a: payTo(alice, 5n * ADA), b: rest.b },
          {
            payer: wallet,
          },
        ),
      );
      expect(TxPartError.is(error, "INVALID_OUT_REF")).toBe(true);
    });
  });
});

describe.each(VALIDATORS)("a transaction of after (%s)", (v) => {
  it("that a step spends from is recorded with it: a refusal while it is not in a block proves nothing", async () => {
    const { emulator, builder, wallet } = await stepSetup(v);
    const pre = await builder.build(payTo(carol, 2n * ADA), { payer: wallet });
    const plan = await builder.plan(payTo(alice, 5n * ADA), {
      payer: wallet,
      after: pre,
    });
    expect(recordOf(plan).steps[0]!.after).toEqual([pre.txHash]);
    expect(plan.toJSON().steps[0]!.after).toEqual([pre.txHash]);
    // The node refuses main: pre is not on chain
    const error = await caught(plan.run({ waitFor: "sent" }));
    expect([error.code, error.details.reason]).toEqual([
      "SUBMIT_FAILED",
      "refused",
    ]);
    expect(plan.step("main").status).toBe("sent");
    expect(plan.status).toBe("pending");

    const signedPre = await wallet.signTx(pre.tx);
    await emulator.submitTx(signedPre);
    await plan.run();
    expect(plan.status).toBe("final");
    expect(paidTo(emulator, alice)).toEqual([5n * ADA]);
  });
});

describe.each(VALIDATORS)("a Plutus step (%s)", (v) => {
  it("that would end past the forecast horizon is refused when the plan is made", async () => {
    const { builder, wallet } = await stepSetup(v);
    const vault = builder.scriptAddress(script);
    const error = await caught(
      makePlan(
        builder,
        {
          lock: payTo(vault, 10n * ADA, "vault"),
          unlock: [
            spend.plutus({
              utxo: { step: "lock", output: "vault" },
              script,
              redeemer: { data: mConStr0([]) },
            }),
            payTo(bob, 4n * ADA),
          ],
        },
        { payer: wallet, ttlMs: 3 * 24 * 3_600_000 },
      ),
    );
    expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
    expect(error.details.reason).toBe("pastHorizon");
    expect(error.message).toMatch(/step "unlock"/);
  });
});
