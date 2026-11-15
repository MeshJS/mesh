import { jest } from "@jest/globals";

import { ProviderError } from "@meshsdk/common";

import type { BuildEvent, TxPlanError } from "../../../src/tx-builder";
import type { TxPlan } from "../../../src/tx-builder/plan/plan";
import { TxBuildError, TxError, validity } from "../../../src/tx-builder";
import { NOT_UNPAID } from "../../../src/tx-builder/errors";
import { baseAddress } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  forwarding,
  pay,
  setup,
  submitterOf,
  swallowing,
} from "./plan-emulator-util";

// How run() hands a step's bytes to a submitter and reads its answer: the submitter it takes,
// what each kind of failure means, the same bytes sent again, the waits of a call, the deadlines
// of a step, and the fields of every error of a plan.

/** A slot whose time is behind the local clock, so that a step can pass its end of validity */
const PAST = 100_000_000;

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

/** The deliveries recorded of the step main, and how many of them were refused */
const deliveries = (plan: TxPlan) => {
  const { sends, refused } = plan.toJSON().steps[0]!;
  return { sends, refused };
};

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** A submitter that throws what `thrown` gives */
const throwing = (thrown: () => unknown) =>
  submitterOf(async () => {
    throw thrown();
  });

/** A wallet whose submitTx throws what `thrown` gives */
const walletThrowing = (thrown: () => unknown) =>
  ({
    signTx: async () => "",
    submitTx: async () => {
      throw thrown();
    },
  }) as never;

describe("run() on TxEmulator: the submitter and its answer", () => {
  it("signs with the payer, sends once and returns once the step is in a block, without options", async () => {
    const { emulator, provider, builder, wallet } = await setup({
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    expect(await plan.run()).toBe(plan);
    // The default waitFor is included: a step in a block and not final ends the call
    expect(plan.status).toBe("pending");
    expect(statuses(plan)).toEqual({ main: "included" });
    expect(plan.landed.map((step) => step.name)).toEqual(["main"]);
    expect(plan.live).toEqual([]);
    expect(deliveries(plan)).toEqual({ sends: 1, refused: 0 });
    expect(provider.control.count("submitTx")).toBe(1);
    const { signedTx, txHash } = plan.step("main");
    expect(signedTx).toBeDefined();
    expect((await emulator.fetchTxInfo(txHash)).hash).toBe(txHash);
  });

  it("takes another hash from the submitter as no error, tells trace each time, and waits for its own", async () => {
    const { builder, wallet, funded } = await setup();
    const events: BuildEvent[] = [];
    const other = funded[0]!.input.txHash;
    const liar = submitterOf(async () => other);
    const plan = await builder.plan(pay(), {
      payer: wallet,
      trace: (event) => {
        events.push(event);
      },
    });
    await plan.run({ submitter: liar, waitFor: "sent" });
    expect(statuses(plan)).toEqual({ main: "sent" });
    const warnings = () => events.filter((e) => e.type === "warning");
    expect(warnings()).toEqual([
      {
        type: "warning",
        code: "HASH_MISMATCH",
        txHash: plan.step("main").txHash,
        reportedHash: other,
      },
    ]);
    // The other hash is on chain, and decides nothing: the plan waits for its own
    const timeout = await caught(plan.run({ submitter: liar, timeoutMs: 100 }));
    expectCode(timeout, "CONFIRM_TIMEOUT");
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(plan.landed).toEqual([]);
    expect(warnings().length).toBeGreaterThan(1);

    // Not a hash: nothing; the own hash in another form: equal
    const own = plan.step("main").txHash;
    for (const answer of [
      "accepted",
      "ok: queued",
      `  "${own.toUpperCase()}" `,
      `'${own}'`,
    ]) {
      const count = warnings().length;
      await plan.run({
        submitter: submitterOf(async () => answer),
        waitFor: "sent",
      });
      expect(warnings()).toHaveLength(count);
      expect(statuses(plan)).toEqual({ main: "sent" });
    }
  });

  it("warns of nothing for a first answer that is not a hash", async () => {
    const { builder, wallet } = await setup();
    const events: BuildEvent[] = [];
    const plan = await builder.plan(pay(), {
      payer: wallet,
      trace: (event) => {
        events.push(event);
      },
    });
    await plan.run({
      submitter: submitterOf(async () => "ok: queued"),
      waitFor: "sent",
    });
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(deliveries(plan)).toEqual({ sends: 1, refused: 0 });
    expect(events.filter((e) => e.type === "warning")).toEqual([]);
  });

  it("passes the error of a submitter by its kind and status", async () => {
    const { builder, wallet } = await setup();
    const busy = await builder.plan(pay(), { payer: wallet });
    const failed = (await caught(
      busy.run({ submitter: throwing(() => ({ status: 429 })) }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(failed, "SUBMIT_FAILED");
    expect(failed.retryable).toBe(true);
    expect(failed.cause).toEqual({ status: 429 });
    expect(statuses(busy)).toEqual({ main: "sent" });

    // A server error says nothing of the ledger's answer
    const broken = await builder.plan(pay(), { payer: wallet });
    const unknown = (await caught(
      broken.run({ submitter: throwing(() => ({ status: 500 })) }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(unknown, "SUBMIT_FAILED");
    expect(statuses(broken)).toEqual({ main: "sent" });
    expect(deliveries(broken)).toEqual({ sends: 1, refused: 0 });

    // A refusal of the ledger counts: the step stands on nothing and is not found
    const refused = await builder.plan(pay(), { payer: wallet });
    const rejecting = throwing(() => ({ kind: "rejected" }));
    const rejected = (await caught(
      refused.run({ submitter: rejecting }),
    )) as TxPlanError<"REJECTED">;
    expectCode(rejected, "REJECTED");
    expect(rejected.retryable).toBe(false);
    expect(typeof rejected.details.tipAgeMs).toBe("number");
    expect(statuses(refused)).toEqual({ main: "rejected" });
    expect(refused.status).toBe("pending");
    // Thrown again by a later call, which sends the same bytes
    expectCode(await caught(refused.run({ submitter: rejecting })), "REJECTED");
    expect(rejecting.calls).toHaveLength(2);
    expect(rejecting.calls[1]).toBe(rejecting.calls[0]);

    // A wallet's error is never a refusal of the ledger
    const viaWallet = await builder.plan(pay(), { payer: wallet });
    const walletError = (await caught(
      viaWallet.run({
        // A wallet that passes on its provider's refusal: still no refusal of the ledger
        submitter: walletThrowing(() => ({
          code: 1,
          info: "refused",
          kind: "rejected",
          status: 400,
        })),
      }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(walletError, "SUBMIT_FAILED");
    expect(walletError.details.walletCode).toBe(1);
    expect(statuses(viaWallet)).toEqual({ main: "sent" });
  });

  it.each<[string, () => unknown, Record<string, unknown>]>([
    [
      "unavailable",
      () => new ProviderError("x", { kind: "unavailable", status: 503 }),
      { reason: "unavailable", status: 503 },
    ],
    [
      "rateLimited",
      () => JSON.stringify({ data: {}, headers: {}, status: 429 }),
      { reason: "rateLimited", status: 429 },
    ],
    [
      "unauthorized",
      () => ({ status: 401 }),
      { reason: "unauthorized", status: 401 },
    ],
    [
      "unknown",
      () => new Error("the connection was reset"),
      { reason: "unknown" },
    ],
  ])(
    "gives SUBMIT_FAILED the reason %s from a first delivery and from the same bytes again, and the outcome stays unknown",
    async (_, thrown, details) => {
      const { builder, wallet } = await setup();
      const plan = await builder.plan(pay(), { payer: wallet });
      const error = (await caught(
        plan.run({ submitter: throwing(thrown) }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(error, "SUBMIT_FAILED");
      expect(error.retryable).toBe(true);
      expect(error.step).toBe("main");
      expect(error.details).toEqual(details);
      expect(error.message).toMatch(
        /^step "main": the submitter's error .*; the outcome of the delivery is unknown: it may be on its way; the same call sends the same bytes again/,
      );
      expect(error.message.endsWith(NOT_UNPAID)).toBe(true);
      expect(statuses(plan)).toEqual({ main: "sent" });
      expect(deliveries(plan)).toEqual({ sends: 1, refused: 0 });

      // The same bytes again, failing the same way
      const again = (await caught(
        plan.run({ submitter: throwing(thrown), waitFor: "sent" }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(again, "SUBMIT_FAILED");
      expect(again.details).toEqual(details);
      expect(statuses(plan)).toEqual({ main: "sent" });
      expect(deliveries(plan)).toEqual({ sends: 2, refused: 0 });

      // A refusal after deliveries that may have gone through proves nothing
      await plan.run({
        submitter: throwing(() => ({ kind: "rejected" })),
        waitFor: "sent",
      });
      expect(statuses(plan)).toEqual({ main: "sent" });
      expect(deliveries(plan)).toEqual({ sends: 3, refused: 1 });
    },
  );

  it("gives a wallet's failure its reason beside its walletCode", async () => {
    const { builder, wallet } = await setup();
    const plan = await builder.plan(pay(), { payer: wallet });
    const error = (await caught(
      plan.run({
        submitter: walletThrowing(() => ({
          code: 2,
          info: "failure",
          status: 503,
        })),
      }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(error, "SUBMIT_FAILED");
    expect(error.details).toEqual({
      reason: "unavailable",
      status: 503,
      walletCode: 2,
    });
    expect(statuses(plan)).toEqual({ main: "sent" });
  });

  it.each<[string, () => unknown]>([
    [
      "a ProviderError rejected",
      () => new ProviderError("x", { kind: "rejected", status: 400 }),
    ],
    [
      "the text of an HTTP answer 400",
      () =>
        JSON.stringify({
          data: { status_code: 400, error: "Bad Request" },
          headers: {},
          status: 400,
        }),
    ],
  ])(
    "is SUBMIT_FAILED refused when a wallet passes on a refusal of the ledger, %s, and the step stays sent",
    async (_, thrown) => {
      const { builder, wallet } = await setup();
      const refusingWallet = walletThrowing(thrown);
      const plan = await builder.plan(pay(), { payer: wallet });
      const error = (await caught(
        plan.run({ submitter: refusingWallet }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(error, "SUBMIT_FAILED");
      expect(error.retryable).toBe(true);
      expect(error.details).toEqual({ reason: "refused", status: 400 });
      expect(
        error.message.startsWith(
          'step "main": the submitter\'s error is a refusal of the ledger, which proves nothing here (HTTP 400); the outcome of the delivery is unknown: it may be on its way; ',
        ),
      ).toBe(true);
      expect(statuses(plan)).toEqual({ main: "sent" });
      expect(deliveries(plan)).toEqual({ sends: 1, refused: 0 });

      // The same bytes again through the wallet: refused the same way, no refusal recorded
      const again = (await caught(
        plan.run({ submitter: refusingWallet, waitFor: "sent" }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(again, "SUBMIT_FAILED");
      expect(again.details).toEqual({ reason: "refused", status: 400 });
      expect(deliveries(plan)).toEqual({ sends: 2, refused: 0 });

      // A refusal of the ledger after it proves nothing either
      await plan.run({
        submitter: throwing(() => ({ kind: "rejected" })),
        waitFor: "sent",
      });
      expect(statuses(plan)).toEqual({ main: "sent" });
    },
  );

  it("takes a refusal as proving nothing on a plan resumed from a record of a delivery whose answer never came", async () => {
    const { provider, builder, wallet } = await setup();
    const made = await builder.plan(pay(), { payer: wallet });
    // The delivery is recorded before the bytes leave; the process stops before an answer
    await caught(
      made.run({ submitter: throwing(() => new Error("the process died")) }),
    );
    const record = made.toJSON();
    expect(record.steps[0]).toMatchObject({
      status: "sent",
      sends: 1,
      refused: 0,
    });
    const plan = await builderOf(provider).resume(record);
    const refusing = throwing(
      () => new ProviderError("x", { kind: "rejected", status: 400 }),
    );
    await plan.run({ submitter: refusing, waitFor: "sent" });
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(deliveries(plan)).toEqual({ sends: 2, refused: 1 });

    // The same bytes again, refused: it proves nothing still
    await plan.run({ submitter: refusing, waitFor: "sent" });
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(deliveries(plan)).toEqual({ sends: 3, refused: 2 });
    expect(new Set(refusing.calls)).toEqual(
      new Set([plan.step("main").signedTx]),
    );
  });

  it.each<[string, () => unknown]>([
    [
      "a revoked Proxy",
      () => {
        const { proxy, revoke } = Proxy.revocable({ code: 2 }, {});
        revoke();
        return proxy;
      },
    ],
    [
      "a value whose code getter throws",
      () =>
        Object.defineProperty({}, "code", {
          get() {
            throw new Error("no");
          },
        }),
    ],
  ])(
    "is SUBMIT_FAILED when a wallet throws %s, on the first delivery and on the same bytes again",
    async (_, thrown) => {
      const { builder, wallet } = await setup();
      const throwingWallet = walletThrowing(thrown);
      const plan = await builder.plan(pay(), { payer: wallet });
      const first = (await caught(
        plan.run({ submitter: throwingWallet }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(first, "SUBMIT_FAILED");
      expect(first.details).toEqual({ reason: "unknown" });
      expect(statuses(plan)).toEqual({ main: "sent" });
      const again = (await caught(
        plan.run({ submitter: throwingWallet, waitFor: "sent" }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(again, "SUBMIT_FAILED");
      expect(again.details).toEqual({ reason: "unknown" });
      expect(statuses(plan)).toEqual({ main: "sent" });
      expect(deliveries(plan)).toEqual({ sends: 2, refused: 0 });
    },
  );

  it("sends the same bytes again on sent, and a refusal of them proves nothing", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    expect(statuses(plan)).toEqual({ main: "sent" });
    const signedTx = plan.step("main").signedTx!;

    // Accepted
    const accepting = swallowing();
    await plan.run({ submitter: accepting, waitFor: "sent" });
    expect(accepting.calls).toEqual([signedTx]);
    expect(statuses(plan)).toEqual({ main: "sent" });

    // Refused: no error, also with waitFor "sent"
    const refusing = throwing(() => ({ kind: "rejected" }));
    await plan.run({ submitter: refusing, waitFor: "sent" });
    expect(refusing.calls).toEqual([signedTx]);
    expect(statuses(plan)).toEqual({ main: "sent" });

    // Failing otherwise: SUBMIT_FAILED with waitFor "sent"
    for (const [thrown, walletCode] of [
      [{ status: 500 }, undefined],
      [{ status: 503 }, undefined],
      [{ code: 2 }, 2],
      // A wallet that passes on its provider's refusal of a resend
      [{ code: 3, kind: "rejected", status: 400 }, 3],
    ] as const) {
      const failing = {
        ...throwing(() => thrown),
        ...(walletCode !== undefined && { getChangeAddress: async () => "" }),
      };
      const error = (await caught(
        plan.run({ submitter: failing, waitFor: "sent" }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(error, "SUBMIT_FAILED");
      expect(error.retryable).toBe(true);
      expect(error.details.walletCode).toBe(walletCode);
      expect(statuses(plan)).toEqual({ main: "sent" });
    }

    // Waiting for a block: a failed resend is no error, and a later one reaches the chain
    let tries = 0;
    const flaky = submitterOf(async (tx) => {
      tries += 1;
      if (tries < 3) throw { status: 503 };
      return emulator.submitTx(tx);
    });
    await plan.run({ submitter: flaky });
    expect(plan.status).toBe("final");
    expect(tries).toBe(3);
    expect(new Set(flaky.calls)).toEqual(new Set([signedTx]));
  });

  it("counts timeoutMs from the answer to a resend", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const slow = submitterOf(async (tx) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return emulator.submitTx(tx);
    });
    await plan.run({ submitter: slow, timeoutMs: 200 });
    expect(plan.status).toBe("final");
    expect(slow.calls).toHaveLength(1);
  });

  it("waits on a step in a block without sending it again", async () => {
    const { builder, wallet, emulator, provider } = await setup({
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run();
    expect(statuses(plan)).toEqual({ main: "included" });
    const submits = provider.control.count("submitTx");
    const counting = swallowing();
    await plan.run({ submitter: counting, waitFor: "sent" });
    await plan.run({ submitter: counting });
    expect(counting.calls).toEqual([]);
    expect(provider.control.count("submitTx")).toBe(submits);
    advance(emulator, 3);
    await plan.run({ submitter: counting, waitFor: "final" });
    expect(plan.status).toBe("final");
    expect(counting.calls).toEqual([]);
    expect(deliveries(plan)).toEqual({ sends: 1, refused: 0 });
  });

  it("is EXPIRED past the end of validity and the margin for a step it sent, without unsent", async () => {
    const { emulator, builder, wallet } = await setup({ slot: PAST });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    emulator.advanceTo({ time: plan.until! + 1_000 });
    const error = (await caught(plan.run())) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.step).toBe("main");
    expect(error.details.unsent).toBeUndefined();
    expect(typeof error.details.tipAgeMs).toBe("number");
    expect(statuses(plan)).toEqual({ main: "expired" });
    expect(plan.status).toBe("stopped");
  });

  it("asks no signer and sends nothing for a step past its end of validity: CONFIRM_TIMEOUT within the margin, EXPIRED (unsent) after it", async () => {
    const { emulator, builder, wallet } = await setup({
      slot: PAST,
      builder: { planDefaults: { ...FAST, expiryMarginMs: 60_000 } },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    emulator.advanceTo({ time: plan.until! + 1_000 });
    let asked = 0;
    const signer = {
      signTx: async (tx: string) => {
        asked += 1;
        return wallet.signTx(tx, true);
      },
    };
    const submitter = swallowing();
    const waiting = (await caught(
      plan.run({ signers: signer, submitter, timeoutMs: 100 }),
    )) as TxPlanError<"CONFIRM_TIMEOUT">;
    expectCode(waiting, "CONFIRM_TIMEOUT");
    expect(statuses(plan)).toEqual({ main: "built" });

    emulator.advanceTo({ time: plan.until! + 61_000 });
    const error = (await caught(
      plan.run({ signers: signer, submitter }),
    )) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.unsent).toBe(true);
    expect(asked).toBe(0);
    expect(submitter.calls).toEqual([]);
    expect(statuses(plan)).toEqual({ main: "expired" });
  });

  it("sends through the provider when a later call gives no submitter", async () => {
    const { builder, wallet, provider } = await setup();
    const plan = await builder.plan(pay(), { payer: wallet });
    const first = swallowing();
    await plan.run({ submitter: first, waitFor: "sent" });
    expect(first.calls).toHaveLength(1);
    await plan.run({ waitFor: "sent" });
    expect(provider.control.count("submitTx")).toBe(1);
    expect(first.calls).toHaveLength(1);
    await plan.refresh();
    expect(plan.status).toBe("final");
  });

  it("sends through the builder's submitter before the provider", async () => {
    const { emulator, provider, wallet } = await setup();
    const own = forwarding(emulator);
    const builder = builderOf(provider, { submitter: own });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run();
    expect(own.calls).toHaveLength(1);
    expect(provider.control.count("submitTx")).toBe(0);
    expect(plan.status).toBe("final");
  });

  it("is CONFIRM_TIMEOUT after timeoutMs without a block, and the same call waits on", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const started = Date.now();
    const error = (await caught(
      plan.run({ submitter: swallowing(), timeoutMs: 150 }),
    )) as TxPlanError<"CONFIRM_TIMEOUT">;
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    expectCode(error, "CONFIRM_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.step).toBe("main");
    expect(error.details).toEqual({ waitedFor: "included", timeoutMs: 150 });
    expect(statuses(plan)).toEqual({ main: "sent" });
    await plan.run({
      submitter: forwarding(emulator),
      waitFor: "final",
      timeoutMs: 5_000,
    });
    expect(plan.status).toBe("final");
  });

  it("is NOT_YET_VALID before the lower bound, signed and not sent, and delivers after it", async () => {
    const { emulator, builder, wallet } = await setup();
    const from = builder.timeAt(emulator.slot) + 60_000;
    const plan = await builder.plan([pay(), validity({ from })], {
      payer: wallet,
    });
    const error = (await caught(plan.run())) as TxPlanError<"NOT_YET_VALID">;
    expectCode(error, "NOT_YET_VALID");
    expect(error.details.waitMs).toBe(60_000);
    expect(error.retryAfterMs).toBe(error.details.waitMs);
    expect(statuses(plan)).toEqual({ main: "signed" });
    expect(deliveries(plan)).toEqual({ sends: 0, refused: 0 });
    emulator.advanceTo({ time: from });
    await plan.run();
    expect(plan.status).toBe("final");
  });

  it("is MISSING_SUBMITTER when nothing can submit, and the step stays signed", async () => {
    const { builder, wallet } = await setup({ hooks: { submitTx: null } });
    const plan = await builder.plan(pay(), { payer: wallet });
    const error = await caught(plan.run());
    expectCode(error, "MISSING_SUBMITTER");
    expect(error.step).toBe("main");
    expect(statuses(plan)).toEqual({ main: "signed" });
    expect(deliveries(plan)).toEqual({ sends: 0, refused: 0 });
  });

  it("clears the volatile cache after every delivery, whatever the submitter answers", async () => {
    const { builder, wallet } = await setup();
    const cache = (builder as unknown as { cache: { clearVolatile(): void } })
      .cache;
    const plan = await builder.plan(pay(), { payer: wallet });
    const clear = jest.spyOn(cache, "clearVolatile");
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    expect(clear).toHaveBeenCalledTimes(1);
    // A resend, and a failed one
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    expect(clear).toHaveBeenCalledTimes(2);
    await caught(
      plan.run({
        submitter: throwing(() => new Error("lost")),
        waitFor: "sent",
      }),
    );
    expect(clear).toHaveBeenCalledTimes(3);
    // A look that finds nothing new clears nothing
    await plan.refresh();
    expect(clear).toHaveBeenCalledTimes(3);
  });

  it("clears the volatile cache when a look finds the step landed", async () => {
    const { builder, wallet, emulator } = await setup();
    const cache = (builder as unknown as { cache: { clearVolatile(): void } })
      .cache;
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    await emulator.submitTx(plan.step("main").signedTx!);
    const clear = jest.spyOn(cache, "clearVolatile");
    await plan.refresh();
    expect(plan.status).toBe("final");
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("ends a wait for final when another call on the object makes it final", async () => {
    const { builder, wallet, emulator } = await setup({
      builder: {
        planDefaults: {
          confirmations: 3,
          pollMs: 50,
          resendMs: 50,
          expiryMarginMs: 0,
        },
      },
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run();
    expect(statuses(plan)).toEqual({ main: "included" });
    const waiting = plan.run({ waitFor: "final", pollMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    advance(emulator, 3);
    await plan.refresh();
    expect(plan.status).toBe("final");
    const started = Date.now();
    await waiting;
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("gives every plan error the plan, its id, status, step and transaction, and the closing sentence", async () => {
    const { builder, wallet } = await setup();
    const plan = await builder.plan(pay(), { id: "pay-3", payer: wallet });
    const error = (await caught(
      plan.run({ submitter: throwing(() => ({ kind: "rejected" })) }),
    )) as TxPlanError;
    expectCode(error, "REJECTED");
    expect(error.plan).toBe(plan);
    expect(Object.keys(error)).not.toContain("plan");
    expect(JSON.stringify(error)).not.toContain("builder");
    expect(error.planId).toBe("pay-3");
    expect(error.status).toBe("pending");
    expect(error.step).toBe("main");
    expect(error.txHash).toBe(plan.step("main").txHash);
    expect(error.message.endsWith(NOT_UNPAID)).toBe(true);

    // A build error of builder.plan carries none of them
    const buildError = (await caught(
      builder.plan(pay(), { id: "pay-4" }),
    )) as TxBuildError;
    expect(TxBuildError.is(buildError, "MISSING_PAYER")).toBe(true);
    for (const field of ["plan", "planId", "status", "txHash", "step"])
      expect(buildError).not.toHaveProperty(field);
  });

  it("goes on from the record when another call finds the step during a delivery", async () => {
    const { emulator, provider, builder, wallet } = await setup();
    // The bytes reach the ledger; another call finds them final before the refusal of the copy
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({
      submitter: submitterOf(async (tx) => {
        await emulator.submitTx(tx);
        await plan.refresh();
        throw { kind: "rejected" };
      }),
    });
    expect(plan.status).toBe("final");
    expect(deliveries(plan).sends).toBe(1);

    // An object over a record probes before its first delivery; another call finds the step
    // meanwhile, and the delivery is not made
    const made = await builder.plan(pay(), { payer: wallet });
    await made.sign();
    const resumed = await builderOf(provider).resume(made.toJSON());
    const step = resumed.step("main");
    const source = step.inputs[0]!.txHash;
    const submits = provider.control.count("submitTx");
    let sourceSearches = 0;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === source) {
        sourceSearches += 1;
        // The first search of the source is the look of run(), the second the probe
        if (sourceSearches === 2) {
          await emulator.submitTx(step.signedTx!);
          await resumed.refresh();
        }
      }
      return forward(hash);
    };
    await resumed.run();
    expect(resumed.status).toBe("final");
    expect(provider.control.count("submitTx")).toBe(submits);
    expect(deliveries(resumed).sends).toBe(0);
  });

  it("reads the payer once for all its steps, and gives the plan's trace the events of every step's build", async () => {
    const { builder, wallet, provider } = await setup();
    const events: BuildEvent[] = [];
    const reads = provider.control.count("fetchAddressUTxOs", "fetchUTxOs");
    await builder.plan(
      { a: pay(3_000_000n), b: pay(4_000_000n, baseAddress(3)) },
      { payer: wallet, trace: (event) => events.push(event) },
    );
    expect(provider.control.count("fetchAddressUTxOs", "fetchUTxOs")).toBe(
      reads + 1,
    );
    // One event of the payer for each step it builds
    expect(events.filter((e) => e.type === "payer")).toHaveLength(2);
    expect(events.filter((e) => e.type === "round").length).toBeGreaterThan(1);
  });

  it("is ABORTED by an aborted signal, and bytes handed out count as sent", async () => {
    const { provider, builder, wallet } = await setup();
    const aborted = AbortSignal.abort("stop");
    const plan = await builder.plan(pay(), { payer: wallet });
    for (const call of [
      () => plan.sign({ signal: aborted }),
      () => plan.run({ signal: aborted }),
    ]) {
      const error = await caught(call());
      expect(TxBuildError.is(error, "ABORTED")).toBe(true);
      expect(statuses(plan)).toEqual({ main: "built" });
    }
    expect(provider.control.count("submitTx")).toBe(0);

    const controller = new AbortController();
    const hanging = submitterOf(async () => {
      controller.abort();
      return new Promise<string>(() => undefined);
    });
    const error = await caught(
      plan.run({ submitter: hanging, signal: controller.signal }),
    );
    expect(TxBuildError.is(error, "ABORTED")).toBe(true);
    expect(statuses(plan)).toEqual({ main: "sent" });
    expect(hanging.calls).toHaveLength(1);
  });
});

describe("a plan given in after of builder.build", () => {
  it("stands for a step that may still land: its inputs are not selected, its change is", async () => {
    const { builder, wallet, address } = await setup({
      funds: [100_000_000n],
    });
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    const step = plan.step("main");
    const ref = (u: { txHash: string; outputIndex: number }) =>
      `${u.txHash}#${u.outputIndex}`;
    const built = await builder.build(pay(10_000_000n, baseAddress(3)), {
      payer: wallet,
      after: plan,
    });
    expect(built.inputs.map(ref)).not.toEqual(
      expect.arrayContaining(step.inputs.map(ref)),
    );
    expect(built.inputs.map(ref)).toEqual(
      step.change.filter((o) => o.address === address).map(ref),
    );
  });

  it("stands for a step in a block and not final, and for nothing once every step is final", async () => {
    const { emulator, provider, builder, wallet } = await setup({
      funds: [100_000_000n],
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    // A provider whose address reads lag behind the chain: they show the UTxOs before the plan
    const before = emulator.fork();
    const plan = await builder.plan(pay(), { payer: wallet });
    await plan.run();
    expect(statuses(plan)).toEqual({ main: "included" });
    provider.control.hooks.fetchAddressUTxOs = (_, address: string) =>
      before.fetchAddressUTxOs(address);
    const step = plan.step("main");
    const ref = (u: { txHash: string; outputIndex: number }) =>
      `${u.txHash}#${u.outputIndex}`;
    const next = () =>
      builder.build(pay(10_000_000n, baseAddress(3)), {
        payer: wallet,
        after: plan,
      });
    const included = await next();
    expect(included.inputs.map(ref)).toEqual(step.change.map(ref));

    advance(emulator, 3);
    await plan.refresh();
    expect(plan.status).toBe("final");
    const final = await next();
    const alone = await builder.build(pay(10_000_000n, baseAddress(3)), {
      payer: wallet,
    });
    expect(final.inputs.map(ref)).toEqual(alone.inputs.map(ref));
    expect(final.inputs.map(ref)).toEqual(step.inputs.map(ref));
  });

  it("stands for nothing once its steps will not land", async () => {
    const { emulator, builder, wallet } = await setup({
      slot: PAST,
      funds: [100_000_000n],
    });
    const plan = await builder.plan(pay(), { payer: wallet, ttlMs: 60_000 });
    await plan.run({ submitter: swallowing(), waitFor: "sent" });
    advance(emulator, 120);
    await plan.refresh();
    expect(plan.status).toBe("stopped");
    const ref = (u: { txHash: string; outputIndex: number }) =>
      `${u.txHash}#${u.outputIndex}`;
    const after = await builder.build(pay(10_000_000n, baseAddress(3)), {
      payer: wallet,
      after: plan,
    });
    // The input the dead step spent is selectable again
    expect(after.inputs.map(ref)).toEqual(plan.step("main").inputs.map(ref));
  });
});
