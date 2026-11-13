import { mConStr0 } from "@meshsdk/core";

import type { TxBuilderOptions, TxIntent } from "../../../src/tx-builder";
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
} from "./intent-emulator-util";
import { watchStore } from "./store-util";

// Intents with a store, restored after a restart: a new builder over the same store and the same
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

/** The cases of the table: every status a record can hold, and a mark on a live intent */
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

/** An intent with the id "pay" brought to the case's status on a store */
const reach = async (
  which: Case,
): Promise<{ ctx: Ctx; intent: TxIntent; id: string }> => {
  const ctx = await storeSetup();
  const { builder, wallet, address, emulator, provider } = ctx;
  const id = "pay";
  const made = (options: Parameters<typeof builder.intent>[1] = {}) =>
    builder.intent(pay(), { id, payer: wallet, ...options });
  let intent: TxIntent;
  switch (which) {
    case "built":
      intent = builder.intent(pay(), { id, payer: address });
      await intent.build();
      break;
    case "signed":
      intent = made();
      await intent.build();
      await intent.sign();
      break;
    case "sent":
      intent = made();
      await intent.send({ submitter: swallowing() });
      break;
    case "rejected":
      intent = made();
      expectCode(
        await caught(intent.send({ submitter: refusing() })),
        "REJECTED",
      );
      break;
    case "included":
      intent = made({ confirmations: 5 });
      await intent.send({ waitFor: "included" });
      break;
    case "expired":
      intent = made();
      await intent.build();
      await intent.sign();
      advance(emulator, 700);
      await intent.refresh();
      break;
    case "failed": {
      const locked = emulator.fund(builder.scriptAddress(plutus), {
        lovelace: 10_000_000n,
      });
      intent = builder.intent(
        spend.plutus({
          utxo: locked,
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        { id, payer: wallet },
      );
      await intent.send();
      const txHash = intent.txHash!;
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
        const info = await forward(hash);
        return hash === txHash ? { ...info, validContract: false } : info;
      };
      await intent.refresh();
      break;
    }
    case "orphaned": {
      const parent = builder.intent(pay(), { id: "parent", payer: wallet });
      await parent.send({ submitter: swallowing() });
      intent = builder.intent(
        [pay(3_000_000n), validity({ until: emulator.time + 3_600_000 })],
        { id, payer: wallet, after: parent, expiryMarginMs: 5_000 },
      );
      await intent.send({ submitter: swallowing() });
      emulator.advanceTo({ time: parent.attempts[0]!.until + 5_000 });
      await intent.refresh();
      await parent.refresh();
      break;
    }
    case "final":
      intent = made();
      await intent.send({ waitFor: "included" });
      break;
    case "abandoned from draft":
      intent = made();
      await intent.abandon();
      break;
    case "abandoned":
      intent = made();
      await intent.build();
      await intent.sign();
      advance(emulator, 700);
      await intent.abandon();
      break;
    case "closing":
      intent = made();
      await intent.send({ submitter: swallowing() });
      expectCode(await caught(intent.abandon()), "STILL_LIVE");
      break;
  }
  const status =
    which === "abandoned from draft"
      ? "abandoned"
      : which === "closing"
        ? "sent"
        : which;
  expect(intent.status).toBe(status);
  return { ctx, intent, id };
};

/** What an application reads of an intent */
const shown = (intent: TxIntent) => ({
  status: intent.status,
  attempts: intent.attempts,
  live: intent.live,
  landed: intent.landed,
  built: intent.built,
  txHash: intent.txHash,
  missing: intent.missing,
  closing: intent.closing,
});

describe("builder.resume on TxEmulator", () => {
  it.each(CASES)("gives the same intent after a restart: %s", async (which) => {
    const { ctx, intent, id } = await reach(which);
    const record = await ctx.store.load(id);
    // The object is neither ahead of the store nor behind it
    expect(intent.toJSON()).toStrictEqual(record);
    const again = await ctx.restart().resume(id);
    expect(again.toJSON()).toStrictEqual(record);
    expect(shown(again)).toEqual(shown(intent));
    expect(again.id).toBe(id);
    if (which === "closing") expect(again.closing).toBe(true);
  });

  it.each(CASES)(
    "takes the reconcile step with resume(id, { payer }) and advance(): %s",
    async (which) => {
      const { ctx, intent, id } = await reach(which);
      const { provider, wallet, emulator } = ctx;
      const before = intent.attempts.length;
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
          expect(again.status).toBe(intent.status);
          expect(requests()).toBe(calls);
          break;
        case "closing":
          // Before safeAfter the intent is returned as it is; once no attempt can land, closed
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
