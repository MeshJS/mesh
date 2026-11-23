import { mConStr0 } from "@meshsdk/core";

import type {
  TxBuilderOptions,
  TxPlan,
  TxStepStatus,
} from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import { spend, TxError } from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  pay,
  setup,
  submitterOf,
  swallowing,
  VALIDATORS,
} from "./plan-emulator-util";
import { refusal } from "./run-util";
import { watchStore } from "./store-util";

// Plans with a store, restored after a restart: a new builder over the same store and the same
// emulator. Every status a step can hold, and each status of a plan, is reached, restored with
// resume(id), and taken one call further with run(), as a reconcile job does.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const refusing = () =>
  submitterOf(async () => {
    throw refusal();
  });

/** An emulator, a wallet and a builder over a watched store; `restart` is a new builder */
const storeSetup = async (v: Validator) => {
  const store = watchStore();
  // A chain behind the local clock: a step past its end of validity is past it by both
  const ctx = await setup(v, { builder: { store }, slot: 100_000_000 });
  const restart = (extra: Partial<TxBuilderOptions> = {}) =>
    builderOf(ctx.provider, { store, ...extra });
  return { ...ctx, store, restart };
};

type Ctx = Awaited<ReturnType<typeof storeSetup>>;

/** The cases of the table: every status a step can hold, and a plan stopped by its mark */
const CASES = [
  "built",
  "signed",
  "sent",
  "rejected",
  "included",
  "expired",
  "failed",
  "orphaned",
  "final",
  "stopping",
  "stopped",
] as const;
type Case = (typeof CASES)[number];

const statuses = (plan: TxPlan) => plan.steps.map((step) => step.status);

/** A plan with the id "pay" brought to the case's statuses on a store */
const reach = async (
  v: Validator,
  which: Case,
): Promise<{ ctx: Ctx; plan: TxPlan; id: string }> => {
  const ctx = await storeSetup(v);
  const { builder, wallet, address, emulator, provider } = ctx;
  const id = "pay";
  const made = (options: Parameters<typeof builder.plan>[1] = {}) =>
    builder.plan(pay(), { id, payer: wallet, ...options });
  let plan: TxPlan;
  let expected: TxStepStatus[] = [which as TxStepStatus];
  let status = "pending";
  switch (which) {
    case "built":
      // A payer that cannot sign
      plan = await builder.plan(pay(), { id, payer: address });
      break;
    case "signed":
      plan = await made();
      await plan.sign();
      break;
    case "sent":
      plan = await made();
      await plan.run({ waitFor: "sent", submitter: swallowing() });
      break;
    case "rejected":
      plan = await made();
      expectCode(await caught(plan.run({ submitter: refusing() })), "REJECTED");
      break;
    case "included":
      plan = await made({ confirmations: 5 });
      await plan.run();
      break;
    case "expired":
      plan = await made();
      await plan.sign();
      advance(emulator, 700);
      await plan.refresh();
      status = "stopped";
      break;
    case "failed": {
      const locked = emulator.fund(builder.scriptAddress(plutus), {
        lovelace: 10_000_000n,
      });
      plan = await builder.plan(
        spend.plutus({
          utxo: locked,
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        { id, payer: wallet },
      );
      // The provider shows the step in a block with is_valid = false
      const txHash = plan.step("main").txHash;
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
        const info = await forward(hash);
        return hash === txHash ? { ...info, validContract: false } : info;
      };
      expectCode(await caught(plan.run()), "SCRIPT_FAILED");
      status = "stopped";
      break;
    }
    case "orphaned":
      // a is sent and lost; b stands on it
      plan = await builder.plan(
        { a: pay(), b: pay(3_000_000n) },
        { id, payer: wallet },
      );
      await plan.sign();
      await plan.run({ waitFor: "sent", submitter: swallowing() });
      advance(emulator, 700);
      await plan.refresh();
      expected = ["expired", "orphaned"];
      status = "stopped";
      break;
    case "final":
      plan = await made();
      await plan.run();
      status = "final";
      break;
    case "stopping":
      plan = await made();
      await plan.run({ waitFor: "sent", submitter: swallowing() });
      await plan.stop();
      expected = ["sent"];
      status = "stopping";
      break;
    case "stopped":
      plan = await made();
      await plan.sign();
      await plan.stop();
      advance(emulator, 700);
      await plan.refresh();
      expected = ["expired"];
      status = "stopped";
      break;
  }
  expect(statuses(plan)).toEqual(expected);
  expect(plan.status).toBe(status);
  return { ctx, plan, id };
};

/** What an application reads of a plan */
const shown = (plan: TxPlan) => ({
  id: plan.id,
  status: plan.status,
  steps: plan.steps,
  landed: plan.landed,
  live: plan.live,
  fee: plan.fee,
  until: plan.until,
  replacedBy: plan.replacedBy,
});

describe.each(VALIDATORS)("builder.resume on TxEmulator (%s)", (v) => {
  it.each(CASES)("gives the same plan after a restart: %s", async (which) => {
    const { ctx, plan, id } = await reach(v, which);
    const record = await ctx.store.load(id);
    // The object is neither ahead of the store nor behind it
    expect(plan.toJSON()).toStrictEqual(record);
    const again = await ctx.restart().resume(id);
    expect(again.toJSON()).toStrictEqual(record);
    expect(shown(again)).toEqual(shown(plan));
    expect(again.id).toBe(id);
    if (which === "stopping" || which === "stopped")
      expect(again.toJSON().stopped).toBe(true);
  });

  it.each(CASES)(
    "takes the reconcile step with resume(id, { payer }) and run(): %s",
    async (which) => {
      const { ctx, plan, id } = await reach(v, which);
      const { provider, wallet, emulator } = ctx;
      const again = await ctx.restart().resume(id, { payer: wallet });
      const requests = () =>
        Object.values(provider.control.calls).reduce((a, b) => a + b, 0);
      const sent = () => provider.control.count("submitTx");
      const calls = requests();
      const sends = sent();
      const bytes = plan.step(plan.steps[0]!.name).signedTx;
      switch (which) {
        case "built":
        case "signed":
          // Signs with the payer where it must, then the first delivery
          await again.run({ waitFor: "sent" });
          expect(statuses(again)).toEqual(["sent"]);
          expect(sent()).toBe(sends + 1);
          break;
        case "sent":
          // The same bytes again
          await again.run({ waitFor: "sent" });
          expect(again.step("main").signedTx).toBe(bytes);
          expect(sent()).toBe(sends + 1);
          break;
        case "included":
          await again.run();
          expect(statuses(again)).toEqual(["included"]);
          expect(sent()).toBe(sends);
          break;
        case "rejected":
          // The same bytes again, refused again
          expectCode(
            await caught(again.run({ submitter: refusing() })),
            "REJECTED",
          );
          expect(again.step("main").signedTx).toBe(bytes);
          expect(statuses(again)).toEqual(["rejected"]);
          break;
        case "expired":
        case "stopped": {
          const error = await caught(again.run());
          expectCode(error, which === "expired" ? "EXPIRED" : "INVALID_STATE");
          expect(sent()).toBe(sends);
          break;
        }
        case "failed":
          expectCode(await caught(again.run()), "SCRIPT_FAILED");
          expect(sent()).toBe(sends);
          break;
        case "orphaned": {
          // The step b stands on will not land, so b never goes
          const error = await caught(again.run());
          expectCode(error, "EXPIRED");
          expect(error.step).toBe("a");
          expect(statuses(again)).toEqual(["expired", "orphaned"]);
          expect(sent()).toBe(sends);
          break;
        }
        case "final":
          // Returned at once, without a request
          await again.run();
          expect(again.status).toBe("final");
          expect(requests()).toBe(calls);
          break;
        case "stopping":
          // Nothing more goes; once the sent step cannot land, stopped
          expectCode(await caught(again.run()), "INVALID_STATE");
          expect(again.status).toBe("stopping");
          expect(sent()).toBe(sends);
          advance(emulator, 700);
          await again.refresh();
          expect(again.status).toBe("stopped");
          expect(statuses(again)).toEqual(["expired"]);
          expect(sent()).toBe(sends);
          break;
      }
      // Every change is in the store before the call returned
      expect(await ctx.store.load(id)).toStrictEqual(again.toJSON());
    },
  );
});
