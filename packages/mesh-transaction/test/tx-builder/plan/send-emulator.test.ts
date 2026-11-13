import { jest } from "@jest/globals";

import type { BuildEvent, TxPlanError } from "../../../src/tx-builder";
import {
  output,
  spend,
  TxBuildError,
  TxError,
  TxPlan,
  validity,
} from "../../../src/tx-builder";
import { planOver, recordOf } from "../../../src/tx-builder/plan/plan";
import { baseAddress } from "../../test-util";
import { ref } from "../utxo-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  pay,
  setup,
  submitterOf,
  wrap,
} from "./plan-emulator-util";

/** A submitter that answers with the hash and passes nothing on */
const swallowing = () =>
  submitterOf(async (tx) => {
    const { Transaction, TxCBOR } = await import("@meshsdk/core-cst");
    return Transaction.fromCbor(TxCBOR(tx)).getId().toString();
  });

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

describe("TxPlan.send on TxEmulator", () => {
  it("builds, signs with the payer, submits and waits in one call", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    expect(plan).toBeInstanceOf(TxPlan);
    await plan.send({ waitFor: "included" });
    expect(["included", "final"]).toContain(plan.status);
    expect(plan.landed?.txHash).toBe(plan.txHash);
    expect(plan.live.map((a) => a.txHash)).toEqual([plan.txHash]);
    expect(plan.attempts).toHaveLength(1);
    expect(plan.attempts[0]).toMatchObject({ sends: 1 });
    expect(plan.signedTx).toBeDefined();
    expect((await emulator.fetchTxInfo(plan.txHash!)).hash).toBe(plan.txHash);
  });

  it("builds the held parts first, then the given ones", async () => {
    const { builder, wallet } = await setup();
    const first = output({
      label: "held",
      address: baseAddress(3),
      value: { lovelace: 2_000_000n },
    });
    const plan = builder.add(first).plan(pay(3_000_000n), { payer: wallet });
    const built = await plan.build();
    expect(built.outputs[0]?.label).toBe("held");
    expect(built.outputs[1]?.value).toEqual({ lovelace: 3_000_000n });
  });

  it("finds the attempt of a lost answer and sends nothing again", async () => {
    const { builder, wallet, provider } = await setup({
      hooks: {
        submitTx: async (forward, tx) => {
          await forward(tx);
          throw new Error("the connection was reset");
        },
      },
    });
    const plan = builder.plan(pay(), { payer: wallet });
    const error = (await caught(plan.send())) as TxPlanError;
    expectCode(error, "SUBMIT_FAILED");
    expect(error.retryable).toBe(true);
    expect(plan.status).toBe("sent");
    expect(provider.control.count("submitTx")).toBe(1);
    await plan.send();
    // Found in a block at once: the tests' depth is 0
    expect(plan.status).toBe("final");
    expect(plan.attempts).toHaveLength(1);
    expect(provider.control.count("submitTx")).toBe(1);
  });

  it("takes another hash from the submitter as no error, keeps it once and traces each", async () => {
    const { builder, wallet, funded } = await setup();
    const events: BuildEvent[] = [];
    const other = funded[0]!.input.txHash;
    const liar = submitterOf(async () => other);
    const plan = builder.plan(pay(), {
      payer: wallet,
      trace: (event) => {
        events.push(event);
      },
    });
    await plan.send({ submitter: liar });
    expect(plan.status).toBe("sent");
    expect(plan.attempts[0]?.reportedHash).toBe(other);
    const warnings = () => events.filter((e) => e.type === "warning");
    expect(warnings()).toEqual([
      {
        type: "warning",
        code: "HASH_MISMATCH",
        txHash: plan.txHash,
        reportedHash: other,
      },
    ]);
    // The other hash is on chain, and decides nothing: the plan waits for its own
    const timeout = await caught(
      plan.send({ submitter: liar, waitFor: "included", timeoutMs: 100 }),
    );
    expectCode(timeout, "CONFIRM_TIMEOUT");
    expect(plan.status).toBe("sent");
    expect(plan.landed).toBeUndefined();
    expect(warnings().length).toBeGreaterThan(1);
    expect(plan.attempts[0]?.reportedHash).toBe(other);

    // Not a hash: nothing; the own hash in another form: equal
    for (const answer of [
      "accepted",
      `  "${plan.txHash!.toUpperCase()}" `,
      `'${plan.txHash}'`,
    ]) {
      const count = warnings().length;
      await plan.send({ submitter: submitterOf(async () => answer) });
      expect(warnings()).toHaveLength(count);
    }
    expect(plan.attempts[0]?.reportedHash).toBe(other);
  });

  it("writes nothing for an answer that is not a hash", async () => {
    const { builder, wallet } = await setup();
    const events: BuildEvent[] = [];
    const plan = builder.plan(pay(), {
      payer: wallet,
      trace: (event) => {
        events.push(event);
      },
    });
    await plan.send({ submitter: submitterOf(async () => "ok: queued") });
    expect(plan.status).toBe("sent");
    expect(plan.attempts[0]?.reportedHash).toBeUndefined();
    expect(events.filter((e) => e.type === "warning")).toEqual([]);
  });

  it("is REJECTED when the ledger refuses, and a new attempt spends the same anchor", async () => {
    const { emulator, builder, wallet, address } = await setup();
    // Both of the payer's UTxOs are needed, so another transaction can spend the one that is not
    // the anchor
    const plan = builder.plan(pay(110_000_000n), { payer: wallet });
    const first = await plan.build();
    expect(first.inputs).toHaveLength(2);
    const [anchor] = recordOf(plan).anchor.anchors;
    const other = first.inputs.find(
      (utxo) => utxo.txHash !== anchor!.utxo.txHash,
    )!;
    const spender = await builder.build(
      [spend.pubKey({ utxo: other }), pay(2_000_000n, address)],
      { payer: { changeAddress: address, utxos: [other] } },
    );
    await emulator.submitTx(await wallet.signTx(spender.tx));

    const error = (await caught(plan.send())) as TxPlanError<"REJECTED">;
    expectCode(error, "REJECTED");
    expect(error.retryable).toBe(false);
    expect(error.details.otherLive).toEqual([]);
    expect(typeof error.details.tipAgeMs).toBe("number");
    expect(plan.status).toBe("rejected");
    // Thrown again by a later send()
    expectCode(await caught(plan.send()), "REJECTED");

    const second = await plan.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.inputs.map(ref)).toContainEqual(ref(anchor!.utxo));
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
    expect(plan.attempts.map((a) => a.status)).toEqual(["rejected", "final"]);
    expect(plan.txHash).toBe(second.txHash);
  });

  it("passes the error of a submitter by its kind and status", async () => {
    const { builder, wallet } = await setup();
    const busy = builder.plan(pay(), { payer: wallet });
    const failed = (await caught(
      busy.send({
        submitter: submitterOf(async () => {
          throw { status: 429 };
        }),
      }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(failed, "SUBMIT_FAILED");
    expect(failed.retryable).toBe(true);
    expect(failed.cause).toEqual({ status: 429 });
    expect(busy.status).toBe("sent");

    // A server error says nothing of the ledger's answer
    const broken = builder.plan(pay(), { payer: wallet });
    const unknown = (await caught(
      broken.send({
        submitter: submitterOf(async () => {
          throw { status: 500 };
        }),
      }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(unknown, "SUBMIT_FAILED");
    expect(broken.status).toBe("sent");
    expect(recordOf(broken).attempts[0]!.refused).toBe(0);

    const refused = builder.plan(pay(), { payer: wallet });
    const rejected = await caught(
      refused.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    expectCode(rejected, "REJECTED");
    expect((rejected as TxPlanError).retryable).toBe(false);
    expect(refused.status).toBe("rejected");

    // A wallet's error is never a refusal of the ledger
    const viaWallet = builder.plan(pay(), { payer: wallet });
    const walletError = (await caught(
      viaWallet.send({
        submitter: {
          signTx: async () => "",
          // A wallet that passes on its provider's refusal: still no refusal of the ledger
          submitTx: async () => {
            throw { code: 1, info: "refused", kind: "rejected", status: 400 };
          },
        } as never,
      }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(walletError, "SUBMIT_FAILED");
    expect(walletError.details.walletCode).toBe(1);
    expect(viaWallet.status).toBe("sent");
  });

  it("sends the same bytes again on sent, and a refusal of them proves nothing", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    expect(plan.status).toBe("sent");
    const signedTx = plan.signedTx!;

    // Accepted
    const accepting = swallowing();
    await plan.send({ submitter: accepting });
    expect(accepting.calls).toEqual([signedTx]);
    expect(plan.status).toBe("sent");

    // Refused: no error, also with waitFor "sent"
    const refusing = submitterOf(async () => {
      throw { kind: "rejected" };
    });
    await plan.send({ submitter: refusing });
    expect(refusing.calls).toEqual([signedTx]);
    expect(plan.status).toBe("sent");
    expect(plan.attempts[0]?.sends).toBe(1);

    // Failing otherwise: SUBMIT_FAILED with waitFor "sent"
    for (const [thrown, walletCode] of [
      [{ status: 500 }, undefined],
      [{ status: 503 }, undefined],
      [{ code: 2 }, 2],
      // A wallet that passes on its provider's refusal of a resend
      [{ code: 3, kind: "rejected", status: 400 }, 3],
    ] as const) {
      const failing = {
        ...submitterOf(async () => {
          throw thrown;
        }),
        ...(walletCode !== undefined && { getChangeAddress: async () => "" }),
      };
      const error = (await caught(
        plan.send({ submitter: failing }),
      )) as TxPlanError<"SUBMIT_FAILED">;
      expectCode(error, "SUBMIT_FAILED");
      expect(error.retryable).toBe(true);
      expect(error.details.walletCode).toBe(walletCode);
      expect(plan.status).toBe("sent");
    }

    // Waiting for a block: a failed resend is ignored, and a later one reaches the chain
    let tries = 0;
    const flaky = submitterOf(async (tx) => {
      tries += 1;
      if (tries < 3) throw { status: 503 };
      return emulator.submitTx(tx);
    });
    await plan.send({ submitter: flaky, waitFor: "included" });
    expect(plan.status).toBe("final");
    expect(tries).toBe(3);
    expect(plan.attempts[0]?.sends).toBe(1);
  });

  it("counts timeoutMs from the answer to the first resend", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    const slow = submitterOf(async (tx) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return emulator.submitTx(tx);
    });
    await plan.send({ submitter: slow, waitFor: "included", timeoutMs: 200 });
    expect(plan.status).toBe("final");
  });

  it("waits on an included plan without sending", async () => {
    const { builder, wallet, emulator, provider } = await setup({
      builder: { planDefaults: { confirmations: 3, pollMs: 10 } },
    });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("included");
    const submits = provider.control.count("submitTx");
    const counting = swallowing();
    await plan.send({ submitter: counting });
    await plan.send({ submitter: counting, waitFor: "included" });
    expect(counting.calls).toEqual([]);
    expect(provider.control.count("submitTx")).toBe(submits);
    advance(emulator, 3);
    await plan.send({ submitter: counting, waitFor: "final" });
    expect(plan.status).toBe("final");
    expect(counting.calls).toEqual([]);
  });

  it("is EXPIRED past the deadline and the margin, and a new attempt spends the same anchor", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    const first = plan.attempts[0]!;
    emulator.advanceTo({ time: first.until + 1_000 });
    const error = (await caught(plan.send())) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.otherLive).toEqual([]);
    expect(error.details.unsent).toBeUndefined();
    expect(plan.status).toBe("expired");
    const second = await plan.build();
    const [anchor] = recordOf(plan).anchor.anchors;
    expect(recordOf(plan).anchor.anchors).toHaveLength(1);
    expect(second.inputs.map(ref)).toContainEqual(ref(anchor!.utxo));
    await plan.send({ waitFor: "included" });
    expect(plan.attempts.map((a) => a.status)).toEqual(["expired", "final"]);
  });

  it("is EXPIRED (unsent) for a built attempt past its deadline within the margin, and asks no signer", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { planDefaults: { ...FAST, expiryMarginMs: 60_000 } },
    });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.build();
    emulator.advanceTo({ time: plan.attempts[0]!.until + 1_000 });
    let asked = 0;
    const signer = {
      signTx: async (tx: string) => {
        asked += 1;
        return wallet.signTx(tx, true);
      },
    };
    const submitter = swallowing();
    const error = (await caught(
      plan.send({ signers: signer, submitter }),
    )) as TxPlanError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.unsent).toBe(true);
    expect(asked).toBe(0);
    expect(submitter.calls).toEqual([]);
    expect(plan.status).toBe("built");
  });

  it("goes back to sent on a rollback and sends the bytes again", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      builder: {
        planDefaults: {
          confirmations: 5,
          pollMs: 10,
          resendMs: 10,
          expiryMarginMs: 0,
        },
      },
    });
    const before = emulator.fork();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("included");
    expect(plan.landed).toBeDefined();

    provider.control.target = before;
    await plan.refresh();
    expect(plan.status).toBe("sent");
    expect(plan.landed).toBeUndefined();

    const submits = provider.control.count("submitTx");
    await plan.send({ waitFor: "included" });
    expect(provider.control.count("submitTx")).toBe(submits + 1);
    expect(plan.status).toBe("included");
    expect((await before.fetchTxInfo(plan.txHash!)).hash).toBe(plan.txHash);
  });

  it("sends through the provider when a later call gives no submitter", async () => {
    const { builder, wallet, provider } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    const first = swallowing();
    await plan.send({ submitter: first });
    expect(first.calls).toHaveLength(1);
    await plan.send();
    expect(provider.control.count("submitTx")).toBe(1);
    expect(first.calls).toHaveLength(1);
    await plan.refresh();
    expect(plan.status).toBe("final");
  });

  it("sends through the builder's submitter before the provider", async () => {
    const { emulator, provider, wallet } = await setup();
    const own = submitterOf((tx) => emulator.submitTx(tx));
    const { builderOf } = await import("./plan-emulator-util");
    const builder = builderOf(provider, { submitter: own });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send();
    expect(own.calls).toHaveLength(1);
    expect(provider.control.count("submitTx")).toBe(0);
  });

  it("is CONFIRM_TIMEOUT after timeoutMs without a block, and the same call waits on", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    const started = Date.now();
    const error = (await caught(
      plan.send({
        submitter: swallowing(),
        waitFor: "included",
        timeoutMs: 150,
      }),
    )) as TxPlanError<"CONFIRM_TIMEOUT">;
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    expectCode(error, "CONFIRM_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ waitedFor: "included", timeoutMs: 150 });
    expect(plan.status).toBe("sent");
    await plan.send({
      submitter: submitterOf((tx) => emulator.submitTx(tx)),
      waitFor: "final",
      timeoutMs: 5_000,
    });
    expect(plan.status).toBe("final");
  });

  it("is NOT_YET_VALID before the lower bound, signed, and delivers after it", async () => {
    const { emulator, builder, wallet } = await setup();
    const from = emulator.time + 60_000;
    const plan = builder.plan([pay(), validity({ from })], {
      payer: wallet,
    });
    const error = (await caught(plan.send())) as TxPlanError<"NOT_YET_VALID">;
    expectCode(error, "NOT_YET_VALID");
    expect(error.details.waitMs).toBe(from - emulator.time);
    expect(error.retryAfterMs).toBe(error.details.waitMs);
    expect(plan.status).toBe("signed");
    expect(plan.attempts[0]?.sends).toBe(0);
    emulator.advanceTo({ time: from });
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
  });

  it("is MISSING_SUBMITTER when nothing can submit, and stays signed", async () => {
    const { builder, wallet } = await setup({ hooks: { submitTx: null } });
    const plan = builder.plan(pay(), { payer: wallet });
    const error = await caught(plan.send());
    expectCode(error, "MISSING_SUBMITTER");
    expect(plan.status).toBe("signed");
    expect(plan.attempts[0]?.sends).toBe(0);
  });

  it("clears the volatile cache after every delivery, whatever the submitter answers", async () => {
    const { builder, wallet } = await setup();
    const cache = (builder as unknown as { cache: { clearVolatile(): void } })
      .cache;
    const clear = jest.spyOn(cache, "clearVolatile");
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    expect(clear).toHaveBeenCalledTimes(1);
    // A resend, and a failed one
    await plan.send({ submitter: swallowing() });
    expect(clear).toHaveBeenCalledTimes(2);
    await caught(
      plan.send({
        submitter: submitterOf(async () => {
          throw new Error("lost");
        }),
      }),
    );
    expect(clear).toHaveBeenCalledTimes(3);
    // An observation that finds nothing new clears nothing
    await plan.refresh();
    expect(clear).toHaveBeenCalledTimes(3);
  });

  it("clears the volatile cache when an observation finds the attempt landed", async () => {
    const { builder, wallet, emulator } = await setup();
    const cache = (builder as unknown as { cache: { clearVolatile(): void } })
      .cache;
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    await emulator.submitTx(plan.signedTx!);
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
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ waitFor: "included" });
    const waiting = plan.send({ waitFor: "final", pollMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    advance(emulator, 3);
    await plan.refresh();
    expect(plan.status).toBe("final");
    const started = Date.now();
    await waiting;
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("gives every plan error the plan, its id, status and attempt, and a closing sentence", async () => {
    const { builder, wallet } = await setup();
    const plan = builder.plan(pay(), { id: "pay-3", payer: wallet });
    const error = (await caught(
      plan.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    )) as TxPlanError;
    expectCode(error, "REJECTED");
    expect(error.plan).toBe(plan);
    expect(Object.keys(error)).not.toContain("plan");
    expect(JSON.stringify(error)).not.toContain("builder");
    expect(error.planId).toBe("pay-3");
    expect(error.status).toBe("rejected");
    expect(error.txHash).toBe(plan.txHash);
    expect(error.message).toMatch(
      /does not mean that the payment did not go through: only an abandoned plan did not pay\.$/,
    );

    // A build error from the same methods carries none of them
    const noPayer = builder.plan(pay(), { id: "pay-4" });
    const buildError = (await caught(noPayer.send())) as TxBuildError;
    expect(TxBuildError.is(buildError, "MISSING_PAYER")).toBe(true);
    for (const field of ["plan", "planId", "status", "txHash"])
      expect(buildError).not.toHaveProperty(field);
  });

  it("goes on from the record when another call finds the attempt during a delivery", async () => {
    const { emulator, builder, wallet } = await setup();
    // The bytes reach the ledger; another call finds them final before the refusal of the copy
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({
      submitter: submitterOf(async (tx) => {
        await emulator.submitTx(tx);
        await plan.refresh();
        throw { kind: "rejected" };
      }),
    });
    expect(plan.status).toBe("final");
    expect(plan.attempts[0]!.sends).toBe(1);

    // An object over a record probes before its first delivery; another call finds the attempt
    // meanwhile
    const made = builder.plan(pay(), { payer: wallet });
    await made.build();
    await made.sign();
    const provider = wrap(emulator);
    const restored = planOver(builderOf(provider), recordOf(made));
    const attempt = restored.txHash!;
    const anchor = recordOf(restored).anchor.anchors[0]!.utxo.txHash;
    let probed = false;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === attempt && !probed) throw { kind: "notFound", status: 404 };
      if (hash === anchor && !probed) {
        probed = true;
        await emulator.submitTx(made.signedTx!);
        await restored.refresh();
      }
      return forward(hash);
    };
    await restored.send();
    expect(restored.status).toBe("final");
    expect(provider.control.count("submitTx")).toBe(0);
  });

  it("gives the plan's trace the events of every attempt's build", async () => {
    const { emulator, builder, wallet } = await setup();
    const events: BuildEvent[] = [];
    const plan = builder.plan(pay(), {
      payer: wallet,
      trace: (event) => events.push(event),
    });
    const payerReads = () => events.filter((e) => e.type === "payer").length;
    const rounds = () => events.filter((e) => e.type === "round").length;
    await plan.build();
    expect(payerReads()).toBe(1);
    const first = rounds();
    expect(first).toBeGreaterThan(0);
    await caught(
      plan.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    advance(emulator, 1);
    await plan.build();
    expect(plan.attempts).toHaveLength(2);
    expect(payerReads()).toBe(2);
    expect(rounds()).toBeGreaterThan(first);
  });

  it("is ABORTED by an aborted signal, and bytes handed out count as sent", async () => {
    const { builder, wallet } = await setup();
    const aborted = AbortSignal.abort("stop");
    const plan = builder.plan(pay(), { payer: wallet });
    for (const call of [
      () => plan.build({ signal: aborted }),
      () => plan.send({ signal: aborted }),
    ]) {
      const error = await caught(call());
      expect(TxBuildError.is(error, "ABORTED")).toBe(true);
      expect(plan.status).toBe("draft");
    }
    await plan.build();
    expect(
      TxBuildError.is(await caught(plan.sign({ signal: aborted })), "ABORTED"),
    ).toBe(true);
    expect(plan.status).toBe("built");

    const controller = new AbortController();
    const hanging = submitterOf(async () => {
      controller.abort();
      return new Promise<string>(() => undefined);
    });
    const error = await caught(
      plan.send({ submitter: hanging, signal: controller.signal }),
    );
    expect(TxBuildError.is(error, "ABORTED")).toBe(true);
    expect(plan.status).toBe("sent");
    expect(hanging.calls).toHaveLength(1);
  });
});
