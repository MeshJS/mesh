import type { TxPlanError } from "../../../src/tx-builder";
import { TxBuildError, TxError } from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import {
  advance,
  caught,
  FAST,
  pay,
  setup,
  submitterOf,
  swallowing,
} from "./plan-emulator-util";

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const refusing = () =>
  submitterOf(async () => {
    throw { kind: "rejected" };
  });

/** Waits until the condition holds, checking every few ms */
const eventually = async (condition: () => boolean) => {
  for (let i = 0; i < 1_000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("the condition never held");
};

describe("TxPlan.advance on TxEmulator", () => {
  it("replaces an expired attempt on the same anchor, then does the step of send()", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    await plan.advance({ waitFor: "included" });
    expect(plan.attempts.map((a) => a.status)).toEqual(["expired", "final"]);
    const anchors = recordOf(plan).anchor.anchors;
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.attempts).toEqual(plan.attempts.map((a) => a.txHash));
  });

  it("replaces once per call: a second expiry in the same call is thrown", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    const call = plan.advance({
      waitFor: "included",
      submitter: swallowing(),
    });
    // While the call waits for its new attempt, that attempt's deadline passes too
    await eventually(
      () => plan.attempts.length === 2 && plan.status === "sent",
    );
    emulator.advanceTo({ time: plan.attempts[1]!.until });
    const error = (await caught(call)) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.otherLive).toEqual([]);
    expect(plan.attempts.map((a) => a.status)).toEqual(["expired", "expired"]);
  });

  it("replaces an unsent attempt past its until, which may still land", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { planDefaults: { ...FAST, expiryMarginMs: 600_000 } },
    });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.build();
    await plan.sign();
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    // send() refuses it, unsent
    const unsent = (await caught(plan.send())) as TxPlanError<"EXPIRED">;
    expectCode(unsent, "EXPIRED");
    expect(unsent.details.unsent).toBe(true);
    await plan.advance({ waitFor: "included" });
    expect(plan.attempts).toHaveLength(2);
    expect(plan.attempts.map((a) => a.status)).toEqual(["signed", "final"]);
    expect(plan.status).toBe("final");
  });

  it("replaces nothing after REJECTED, nor while another attempt may land", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    expectCode(await caught(plan.send({ submitter: refusing() })), "REJECTED");
    expectCode(await caught(plan.advance({ signers: wallet })), "REJECTED");
    expect(plan.attempts).toHaveLength(1);

    // A second attempt expires while the refused one stays unknown, so it may land
    const first = plan.attempts[0]!;
    advance(emulator, 1);
    await plan.build();
    await plan.send({ submitter: swallowing() });
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === first.txHash) throw new Error("no answer");
      return forward(hash);
    };
    provider.control.hooks.fetchAddressUTxOs = () => {
      throw new Error("no answer");
    };
    emulator.advanceTo({ time: plan.attempts[1]!.until });
    const error = (await caught(
      plan.advance({ signers: wallet }),
    )) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.otherLive).toEqual([first.txHash]);
    expect(plan.attempts).toHaveLength(2);
  });

  it("builds nothing without a signer: the payer as an address gives EXPIRED", async () => {
    const { emulator, builder, wallet, address } = await setup();
    const plan = builder.plan(pay(), { payer: address });
    await plan.build();
    await plan.sign({ signers: wallet });
    await plan.send({ submitter: swallowing() });
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    const error = (await caught(plan.advance())) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.otherLive).toEqual([]);
    expect(plan.attempts).toHaveLength(1);
    // With the call's signers it replaces
    await plan.advance({ signers: wallet, waitFor: "included" });
    expect(plan.attempts.map((a) => a.status)).toEqual(["expired", "final"]);
  });

  it("is ABORTED by an aborted signal, also during the pause of the double check", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { planDefaults: { ...FAST, expiryMarginMs: 5_000 } },
    });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    const error = await caught(
      plan.advance({ signal: AbortSignal.abort("stop") }),
    );
    expect(TxBuildError.is(error, "ABORTED")).toBe(true);
    expect(plan.status).toBe("sent");

    expectCode(await caught(plan.abandon()), "STILL_LIVE");
    emulator.advanceTo({ time: plan.attempts[0]!.until + 5_000 });
    const controller = new AbortController();
    const started = performance.now();
    const call = plan.advance({ signal: controller.signal });
    setTimeout(() => controller.abort("stop"), 200);
    const aborted = await caught(call);
    expect(TxBuildError.is(aborted, "ABORTED")).toBe(true);
    expect(performance.now() - started).toBeLessThan(3_000);
    expect(plan.status).not.toBe("abandoned");
    expect(plan.closing).toBe(true);
  });

  it("is MISSING_SIGNATURES where a signature is needed and nobody in the call can sign", async () => {
    const { builder, address } = await setup();
    const plan = builder.plan(pay(), { payer: address });
    expectCode(await caught(plan.advance()), "MISSING_SIGNATURES");
    expect(plan.status).toBe("built");
  });
});

describe("The end of a wait by a terminal record", () => {
  it("makes a waiting send() throw INVALID_STATE (terminal) and a waiting advance() return when another call closes the plan", async () => {
    for (const method of ["send", "advance"] as const) {
      const { emulator, builder, wallet } = await setup();
      const plan = builder.plan(pay(), { payer: wallet });
      await plan.send({ submitter: swallowing() });
      const sends: string[] = [];
      const waiting = plan[method]({
        waitFor: "included",
        pollMs: 60_000,
        submitter: submitterOf(async (tx) => {
          sends.push(tx);
          return plan.txHash!;
        }),
      });
      await eventually(() => sends.length === 1);
      emulator.advanceTo({ time: plan.attempts[0]!.until });
      await plan.abandon();
      expect(plan.status).toBe("abandoned");
      const started = Date.now();
      if (method === "send") {
        const error = (await caught(waiting)) as TxPlanError<"INVALID_STATE">;
        expectCode(error, "INVALID_STATE");
        expect(error.details.reason).toBe("terminal");
      } else expect(await waiting).toBe(plan);
      expect(Date.now() - started).toBeLessThan(10_000);
    }
  });
});
