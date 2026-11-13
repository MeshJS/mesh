import { mConStr0 } from "@meshsdk/core";

import type { TxBuilderOptions, TxPlan } from "../../../src/tx-builder";
import { spend, TxError, validity } from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  pay,
  setup,
  submitterOf,
  swallowing,
} from "./plan-emulator-util";
import { watchStore } from "./store-util";

// Plans with a store, restored after a restart: a new builder over the same store and the same
// emulator. Every status a record can hold is reached, restored with resume(id), and taken one
// step further with advance(), as a reconcile job does.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const refusing = () =>
  submitterOf(async () => {
    throw { kind: "rejected" };
  });

/** An emulator, a wallet and a builder over a watched store; `restart` is a new builder */
const storeSetup = async (options: Parameters<typeof setup>[0] = {}) => {
  const store = watchStore();
  const ctx = await setup({
    ...options,
    builder: { store, ...options.builder },
  });
  const restart = (extra: Partial<TxBuilderOptions> = {}) =>
    builderOf(ctx.provider, { store, ...extra });
  return { ...ctx, store, restart };
};

type Ctx = Awaited<ReturnType<typeof storeSetup>>;

/** The cases of the table: every status a record can hold, and a mark on a live plan */
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
  "abandoned from draft",
  "abandoned",
  "closing",
] as const;
type Case = (typeof CASES)[number];

/** A plan with the id "pay" brought to the case's status on a store */
const reach = async (
  which: Case,
): Promise<{ ctx: Ctx; plan: TxPlan; id: string }> => {
  const ctx = await storeSetup();
  const { builder, wallet, address, emulator, provider } = ctx;
  const id = "pay";
  const made = (options: Parameters<typeof builder.plan>[1] = {}) =>
    builder.plan(pay(), { id, payer: wallet, ...options });
  let plan: TxPlan;
  switch (which) {
    case "built":
      plan = builder.plan(pay(), { id, payer: address });
      await plan.build();
      break;
    case "signed":
      plan = made();
      await plan.build();
      await plan.sign();
      break;
    case "sent":
      plan = made();
      await plan.send({ submitter: swallowing() });
      break;
    case "rejected":
      plan = made();
      expectCode(
        await caught(plan.send({ submitter: refusing() })),
        "REJECTED",
      );
      break;
    case "included":
      plan = made({ confirmations: 5 });
      await plan.send({ waitFor: "included" });
      break;
    case "expired":
      plan = made();
      await plan.build();
      await plan.sign();
      advance(emulator, 700);
      await plan.refresh();
      break;
    case "failed": {
      const locked = emulator.fund(builder.scriptAddress(plutus), {
        lovelace: 10_000_000n,
      });
      plan = builder.plan(
        spend.plutus({
          utxo: locked,
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        { id, payer: wallet },
      );
      await plan.send();
      const txHash = plan.txHash!;
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
        const info = await forward(hash);
        return hash === txHash ? { ...info, validContract: false } : info;
      };
      await plan.refresh();
      break;
    }
    case "orphaned": {
      const parent = builder.plan(pay(), { id: "parent", payer: wallet });
      await parent.send({ submitter: swallowing() });
      plan = builder.plan(
        [pay(3_000_000n), validity({ until: emulator.time + 3_600_000 })],
        { id, payer: wallet, after: parent, expiryMarginMs: 5_000 },
      );
      await plan.send({ submitter: swallowing() });
      emulator.advanceTo({ time: parent.attempts[0]!.until + 5_000 });
      await plan.refresh();
      await parent.refresh();
      break;
    }
    case "final":
      plan = made();
      await plan.send({ waitFor: "included" });
      break;
    case "abandoned from draft":
      plan = made();
      await plan.abandon();
      break;
    case "abandoned":
      plan = made();
      await plan.build();
      await plan.sign();
      advance(emulator, 700);
      await plan.abandon();
      break;
    case "closing":
      plan = made();
      await plan.send({ submitter: swallowing() });
      expectCode(await caught(plan.abandon()), "STILL_LIVE");
      break;
  }
  const status =
    which === "abandoned from draft"
      ? "abandoned"
      : which === "closing"
        ? "sent"
        : which;
  expect(plan.status).toBe(status);
  return { ctx, plan, id };
};

/** What an application reads of a plan */
const shown = (plan: TxPlan) => ({
  status: plan.status,
  attempts: plan.attempts,
  live: plan.live,
  landed: plan.landed,
  built: plan.built,
  txHash: plan.txHash,
  missing: plan.missing,
  closing: plan.closing,
});

describe("builder.resume on TxEmulator", () => {
  it.each(CASES)("gives the same plan after a restart: %s", async (which) => {
    const { ctx, plan, id } = await reach(which);
    const record = await ctx.store.load(id);
    // The object is neither ahead of the store nor behind it
    expect(plan.toJSON()).toStrictEqual(record);
    const again = await ctx.restart().resume(id);
    expect(again.toJSON()).toStrictEqual(record);
    expect(shown(again)).toEqual(shown(plan));
    expect(again.id).toBe(id);
    if (which === "closing") expect(again.closing).toBe(true);
  });

  it.each(CASES)(
    "takes the reconcile step with resume(id, { payer }) and advance(): %s",
    async (which) => {
      const { ctx, plan, id } = await reach(which);
      const { provider, wallet, emulator } = ctx;
      const before = plan.attempts.length;
      const again = await ctx.restart().resume(id, { payer: wallet });
      const requests = () =>
        Object.values(provider.control.calls).reduce((a, b) => a + b, 0);
      const sent = () => provider.control.count("submitTx");
      const calls = requests();
      const sends = sent();
      switch (which) {
        case "built":
        case "signed":
          // Signs with the payer where it must, then the first delivery
          await again.advance();
          expect(again.status).not.toBe(which);
          expect(again.attempts).toHaveLength(1);
          expect(again.attempts[0]!.sends).toBe(1);
          expect(sent()).toBe(sends + 1);
          break;
        case "sent":
          // The same bytes again
          await again.advance();
          expect(again.attempts).toHaveLength(1);
          expect(again.attempts[0]!.sends).toBe(1);
          expect(sent()).toBe(sends + 1);
          break;
        case "included":
          await again.advance();
          expect(again.status).toBe("included");
          expect(sent()).toBe(sends);
          break;
        case "rejected":
          expectCode(await caught(again.advance()), "REJECTED");
          expect(again.attempts).toHaveLength(before);
          break;
        case "expired":
          // Replaced once, with the payer as the signer, and sent
          await again.advance();
          expect(again.attempts).toHaveLength(2);
          expect(again.attempts[1]!.sends).toBe(1);
          expect(sent()).toBe(sends + 1);
          break;
        case "failed":
          expectCode(await caught(again.advance()), "SCRIPT_FAILED");
          expect(again.attempts).toHaveLength(1);
          break;
        case "orphaned":
          // The parent has no live attempt to stand on
          expectCode(await caught(again.advance()), "ORPHANED");
          expect(again.attempts).toHaveLength(1);
          break;
        case "final":
        case "abandoned from draft":
        case "abandoned":
          // Returned at once, without a request
          await again.advance();
          expect(again.status).toBe(plan.status);
          expect(requests()).toBe(calls);
          break;
        case "closing":
          // Before safeAfter the plan is returned as it is; once no attempt can land, closed
          await again.advance();
          expect(again.status).toBe("sent");
          expect(sent()).toBe(sends);
          advance(emulator, 700);
          await again.advance();
          expect(again.status).toBe("abandoned");
          expect(sent()).toBe(sends);
          break;
      }
      // Every step is in the store before the call returned
      expect(await ctx.store.load(id)).toStrictEqual(again.toJSON());
    },
  );
});
