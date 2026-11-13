import { jest } from "@jest/globals";

import type { BuildEvent, TxIntentError } from "../../../src/tx-builder";
import {
  output,
  spend,
  TxBuildError,
  TxError,
  TxIntent,
  validity,
} from "../../../src/tx-builder";
import { intentOver, recordOf } from "../../../src/tx-builder/intent/intent";
import { baseAddress } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  pay,
  setup,
  submitterOf,
  wrap,
} from "./intent-emulator-util";

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

describe("TxIntent.send on TxEmulator", () => {
  it("builds, signs with the payer, submits and waits in one call", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    expect(intent).toBeInstanceOf(TxIntent);
    await intent.send({ waitFor: "included" });
    expect(["included", "final"]).toContain(intent.status);
    expect(intent.landed?.txHash).toBe(intent.txHash);
    expect(intent.live.map((a) => a.txHash)).toEqual([intent.txHash]);
    expect(intent.attempts).toHaveLength(1);
    expect(intent.attempts[0]).toMatchObject({ sends: 1 });
    expect(intent.signedTx).toBeDefined();
    expect((await emulator.fetchTxInfo(intent.txHash!)).hash).toBe(
      intent.txHash,
    );
  });

  it("builds the held parts first, then the given ones", async () => {
    const { builder, wallet } = await setup();
    const first = output({
      label: "held",
      address: baseAddress(3),
      value: { lovelace: 2_000_000n },
    });
    const intent = builder
      .add(first)
      .intent(pay(3_000_000n), { payer: wallet });
    const built = await intent.build();
    expect(built.outputs[0]?.label).toBe("held");
    expect(built.outputs[1]?.output.amount).toEqual([
      { unit: "lovelace", quantity: "3000000" },
    ]);
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
    const intent = builder.intent(pay(), { payer: wallet });
    const error = (await caught(intent.send())) as TxIntentError;
    expectCode(error, "SUBMIT_FAILED");
    expect(error.retryable).toBe(true);
    expect(intent.status).toBe("sent");
    expect(provider.control.count("submitTx")).toBe(1);
    await intent.send();
    // Found in a block at once: the tests' depth is 0
    expect(intent.status).toBe("final");
    expect(intent.attempts).toHaveLength(1);
    expect(provider.control.count("submitTx")).toBe(1);
  });

  it("takes another hash from the submitter as no error, keeps it once and traces each", async () => {
    const { builder, wallet, funded } = await setup();
    const events: BuildEvent[] = [];
    const other = funded[0]!.input.txHash;
    const liar = submitterOf(async () => other);
    const intent = builder.intent(pay(), {
      payer: wallet,
      trace: (event) => {
        events.push(event);
      },
    });
    await intent.send({ submitter: liar });
    expect(intent.status).toBe("sent");
    expect(intent.attempts[0]?.reportedHash).toBe(other);
    const warnings = () => events.filter((e) => e.type === "warning");
    expect(warnings()).toEqual([
      {
        type: "warning",
        code: "HASH_MISMATCH",
        txHash: intent.txHash,
        reportedHash: other,
      },
    ]);
    // The other hash is on chain, and decides nothing: the intent waits for its own
    const timeout = await caught(
      intent.send({ submitter: liar, waitFor: "included", timeoutMs: 100 }),
    );
    expectCode(timeout, "CONFIRM_TIMEOUT");
    expect(intent.status).toBe("sent");
    expect(intent.landed).toBeUndefined();
    expect(warnings().length).toBeGreaterThan(1);
    expect(intent.attempts[0]?.reportedHash).toBe(other);

    // Not a hash: nothing; the own hash in another form: equal
    for (const answer of [
      "accepted",
      `  "${intent.txHash!.toUpperCase()}" `,
      `'${intent.txHash}'`,
    ]) {
      const count = warnings().length;
      await intent.send({ submitter: submitterOf(async () => answer) });
      expect(warnings()).toHaveLength(count);
    }
    expect(intent.attempts[0]?.reportedHash).toBe(other);
  });

  it("writes nothing for an answer that is not a hash", async () => {
    const { builder, wallet } = await setup();
    const events: BuildEvent[] = [];
    const intent = builder.intent(pay(), {
      payer: wallet,
      trace: (event) => {
        events.push(event);
      },
    });
    await intent.send({ submitter: submitterOf(async () => "ok: queued") });
    expect(intent.status).toBe("sent");
    expect(intent.attempts[0]?.reportedHash).toBeUndefined();
    expect(events.filter((e) => e.type === "warning")).toEqual([]);
  });

  it("is REJECTED when the ledger refuses, and a new attempt spends the same anchor", async () => {
    const { emulator, builder, wallet, address } = await setup();
    // Both of the payer's UTxOs are needed, so another transaction can spend the one that is not
    // the anchor
    const intent = builder.intent(pay(110_000_000n), { payer: wallet });
    const first = await intent.build();
    expect(first.inputs).toHaveLength(2);
    const [anchor] = recordOf(intent).anchor.anchors;
    const other = first.inputs.find(
      (utxo) => utxo.input.txHash !== anchor!.utxo.input.txHash,
    )!;
    const spender = await builder.build(
      [spend.pubKey({ utxo: other }), pay(2_000_000n, address)],
      { payer: { changeAddress: address, utxos: [other] } },
    );
    await emulator.submitTx(await wallet.signTx(spender.tx));

    const error = (await caught(intent.send())) as TxIntentError<"REJECTED">;
    expectCode(error, "REJECTED");
    expect(error.retryable).toBe(false);
    expect(error.details.otherLive).toEqual([]);
    expect(typeof error.details.tipAgeMs).toBe("number");
    expect(intent.status).toBe("rejected");
    // Thrown again by a later send()
    expectCode(await caught(intent.send()), "REJECTED");

    const second = await intent.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.inputs.map((u) => u.input)).toContainEqual(
      anchor!.utxo.input,
    );
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
    expect(intent.attempts.map((a) => a.status)).toEqual(["rejected", "final"]);
    expect(intent.txHash).toBe(second.txHash);
  });

  it("passes the error of a submitter by its kind and status", async () => {
    const { builder, wallet } = await setup();
    const busy = builder.intent(pay(), { payer: wallet });
    const failed = (await caught(
      busy.send({
        submitter: submitterOf(async () => {
          throw { status: 429 };
        }),
      }),
    )) as TxIntentError<"SUBMIT_FAILED">;
    expectCode(failed, "SUBMIT_FAILED");
    expect(failed.retryable).toBe(true);
    expect(failed.cause).toEqual({ status: 429 });
    expect(busy.status).toBe("sent");

    const refused = builder.intent(pay(), { payer: wallet });
    const rejected = await caught(
      refused.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    expectCode(rejected, "REJECTED");
    expect((rejected as TxIntentError).retryable).toBe(false);
    expect(refused.status).toBe("rejected");

    // A wallet's error is never a refusal of the ledger
    const viaWallet = builder.intent(pay(), { payer: wallet });
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
    )) as TxIntentError<"SUBMIT_FAILED">;
    expectCode(walletError, "SUBMIT_FAILED");
    expect(walletError.details.walletCode).toBe(1);
    expect(viaWallet.status).toBe("sent");
  });

  it("sends the same bytes again on sent, and a refusal of them proves nothing", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    expect(intent.status).toBe("sent");
    const signedTx = intent.signedTx!;

    // Accepted
    const accepting = swallowing();
    await intent.send({ submitter: accepting });
    expect(accepting.calls).toEqual([signedTx]);
    expect(intent.status).toBe("sent");

    // Refused: no error, also with waitFor "sent"
    const refusing = submitterOf(async () => {
      throw { kind: "rejected" };
    });
    await intent.send({ submitter: refusing });
    expect(refusing.calls).toEqual([signedTx]);
    expect(intent.status).toBe("sent");
    expect(intent.attempts[0]?.sends).toBe(1);

    // Failing otherwise: SUBMIT_FAILED with waitFor "sent"
    for (const [thrown, walletCode] of [
      [{ status: 503 }, undefined],
      [{ code: 2 }, 2],
    ] as const) {
      const failing = {
        ...submitterOf(async () => {
          throw thrown;
        }),
        ...(walletCode !== undefined && { getChangeAddress: async () => "" }),
      };
      const error = (await caught(
        intent.send({ submitter: failing }),
      )) as TxIntentError<"SUBMIT_FAILED">;
      expectCode(error, "SUBMIT_FAILED");
      expect(error.retryable).toBe(true);
      expect(error.details.walletCode).toBe(walletCode);
      expect(intent.status).toBe("sent");
    }

    // Waiting for a block: a failed resend is ignored, and a later one reaches the chain
    let tries = 0;
    const flaky = submitterOf(async (tx) => {
      tries += 1;
      if (tries < 3) throw { status: 503 };
      return emulator.submitTx(tx);
    });
    await intent.send({ submitter: flaky, waitFor: "included" });
    expect(intent.status).toBe("final");
    expect(tries).toBe(3);
    expect(intent.attempts[0]?.sends).toBe(1);
  });

  it("counts timeoutMs from the answer to the first resend", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const slow = submitterOf(async (tx) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return emulator.submitTx(tx);
    });
    await intent.send({ submitter: slow, waitFor: "included", timeoutMs: 200 });
    expect(intent.status).toBe("final");
  });

  it("waits on an included intent without sending", async () => {
    const { builder, wallet, emulator, provider } = await setup({
      builder: { intentDefaults: { confirmations: 3, pollMs: 10 } },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("included");
    const submits = provider.control.count("submitTx");
    const counting = swallowing();
    await intent.send({ submitter: counting });
    await intent.send({ submitter: counting, waitFor: "included" });
    expect(counting.calls).toEqual([]);
    expect(provider.control.count("submitTx")).toBe(submits);
    advance(emulator, 3);
    await intent.send({ submitter: counting, waitFor: "final" });
    expect(intent.status).toBe("final");
    expect(counting.calls).toEqual([]);
  });

  it("is EXPIRED past the deadline and the margin, and a new attempt spends the same anchor", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const first = intent.attempts[0]!;
    emulator.advanceTo({ time: first.until + 1_000 });
    const error = (await caught(intent.send())) as TxIntentError<"EXPIRED">;
    expectCode(error, "EXPIRED");
    expect(error.details.otherLive).toEqual([]);
    expect(error.details.unsent).toBeUndefined();
    expect(intent.status).toBe("expired");
    const second = await intent.build();
    const [anchor] = recordOf(intent).anchor.anchors;
    expect(recordOf(intent).anchor.anchors).toHaveLength(1);
    expect(second.inputs.map((u) => u.input)).toContainEqual(
      anchor!.utxo.input,
    );
    await intent.send({ waitFor: "included" });
    expect(intent.attempts.map((a) => a.status)).toEqual(["expired", "final"]);
  });

  it("goes back to sent on a rollback and sends the bytes again", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      builder: {
        intentDefaults: {
          confirmations: 5,
          pollMs: 10,
          resendMs: 10,
          expiryMarginMs: 0,
        },
      },
    });
    const before = emulator.fork();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("included");
    expect(intent.landed).toBeDefined();

    provider.control.target = before;
    await intent.refresh();
    expect(intent.status).toBe("sent");
    expect(intent.landed).toBeUndefined();

    const submits = provider.control.count("submitTx");
    await intent.send({ waitFor: "included" });
    expect(provider.control.count("submitTx")).toBe(submits + 1);
    expect(intent.status).toBe("included");
    expect((await before.fetchTxInfo(intent.txHash!)).hash).toBe(intent.txHash);
  });

  it("sends through the provider when a later call gives no submitter", async () => {
    const { builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    const first = swallowing();
    await intent.send({ submitter: first });
    expect(first.calls).toHaveLength(1);
    await intent.send();
    expect(provider.control.count("submitTx")).toBe(1);
    expect(first.calls).toHaveLength(1);
    await intent.refresh();
    expect(intent.status).toBe("final");
  });

  it("sends through the builder's submitter before the provider", async () => {
    const { emulator, provider, wallet } = await setup();
    const own = submitterOf((tx) => emulator.submitTx(tx));
    const { builderOf } = await import("./intent-emulator-util");
    const builder = builderOf(provider, { submitter: own });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send();
    expect(own.calls).toHaveLength(1);
    expect(provider.control.count("submitTx")).toBe(0);
  });

  it("is CONFIRM_TIMEOUT after timeoutMs without a block, and the same call waits on", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const started = Date.now();
    const error = (await caught(
      intent.send({
        submitter: swallowing(),
        waitFor: "included",
        timeoutMs: 150,
      }),
    )) as TxIntentError<"CONFIRM_TIMEOUT">;
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    expectCode(error, "CONFIRM_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ waitedFor: "included", timeoutMs: 150 });
    expect(intent.status).toBe("sent");
    await intent.send({
      submitter: submitterOf((tx) => emulator.submitTx(tx)),
      waitFor: "final",
      timeoutMs: 5_000,
    });
    expect(intent.status).toBe("final");
  });

  it("is NOT_YET_VALID before the lower bound, signed, and delivers after it", async () => {
    const { emulator, builder, wallet } = await setup();
    const from = emulator.time + 60_000;
    const intent = builder.intent([pay(), validity({ from })], {
      payer: wallet,
    });
    const error = (await caught(
      intent.send(),
    )) as TxIntentError<"NOT_YET_VALID">;
    expectCode(error, "NOT_YET_VALID");
    expect(error.details.waitMs).toBe(from - emulator.time);
    expect(error.retryAfterMs).toBe(error.details.waitMs);
    expect(intent.status).toBe("signed");
    expect(intent.attempts[0]?.sends).toBe(0);
    emulator.advanceTo({ time: from });
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
  });

  it("is MISSING_SUBMITTER when nothing can submit, and stays signed", async () => {
    const { builder, wallet } = await setup({ hooks: { submitTx: null } });
    const intent = builder.intent(pay(), { payer: wallet });
    const error = await caught(intent.send());
    expectCode(error, "MISSING_SUBMITTER");
    expect(intent.status).toBe("signed");
    expect(intent.attempts[0]?.sends).toBe(0);
  });

  it("clears the volatile cache after every delivery, whatever the submitter answers", async () => {
    const { builder, wallet } = await setup();
    const cache = (builder as unknown as { cache: { clearVolatile(): void } })
      .cache;
    const clear = jest.spyOn(cache, "clearVolatile");
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    expect(clear).toHaveBeenCalledTimes(1);
    // A resend, and a failed one
    await intent.send({ submitter: swallowing() });
    expect(clear).toHaveBeenCalledTimes(2);
    await caught(
      intent.send({
        submitter: submitterOf(async () => {
          throw new Error("lost");
        }),
      }),
    );
    expect(clear).toHaveBeenCalledTimes(3);
    // An observation that finds nothing new clears nothing
    await intent.refresh();
    expect(clear).toHaveBeenCalledTimes(3);
  });

  it("clears the volatile cache when an observation finds the attempt landed", async () => {
    const { builder, wallet, emulator } = await setup();
    const cache = (builder as unknown as { cache: { clearVolatile(): void } })
      .cache;
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    await emulator.submitTx(intent.signedTx!);
    const clear = jest.spyOn(cache, "clearVolatile");
    await intent.refresh();
    expect(intent.status).toBe("final");
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("ends a wait for final when another call on the object makes it final", async () => {
    const { builder, wallet, emulator } = await setup({
      builder: {
        intentDefaults: {
          confirmations: 3,
          pollMs: 50,
          resendMs: 50,
          expiryMarginMs: 0,
        },
      },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ waitFor: "included" });
    const waiting = intent.send({ waitFor: "final", pollMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    advance(emulator, 3);
    await intent.refresh();
    expect(intent.status).toBe("final");
    const started = Date.now();
    await waiting;
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("gives every intent error the intent, its id, status and attempt, and a closing sentence", async () => {
    const { builder, wallet } = await setup();
    const intent = builder.intent(pay(), { id: "pay-3", payer: wallet });
    const error = (await caught(
      intent.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    )) as TxIntentError;
    expectCode(error, "REJECTED");
    expect(error.intent).toBe(intent);
    expect(Object.keys(error)).not.toContain("intent");
    expect(JSON.stringify(error)).not.toContain("builder");
    expect(error.intentId).toBe("pay-3");
    expect(error.status).toBe("rejected");
    expect(error.txHash).toBe(intent.txHash);
    expect(error.message).toMatch(
      /does not mean that the payment did not go through: only an abandoned intent did not pay\.$/,
    );

    // A build error from the same methods carries none of them
    const noPayer = builder.intent(pay(), { id: "pay-4" });
    const buildError = (await caught(noPayer.send())) as TxBuildError;
    expect(TxBuildError.is(buildError, "MISSING_PAYER")).toBe(true);
    for (const field of ["intent", "intentId", "status", "txHash"])
      expect(buildError).not.toHaveProperty(field);
  });

  it("goes on from the record when another call finds the attempt during a delivery", async () => {
    const { emulator, builder, wallet } = await setup();
    // The bytes reach the ledger; another call finds them final before the refusal of the copy
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({
      submitter: submitterOf(async (tx) => {
        await emulator.submitTx(tx);
        await intent.refresh();
        throw { kind: "rejected" };
      }),
    });
    expect(intent.status).toBe("final");
    expect(intent.attempts[0]!.sends).toBe(1);

    // An object over a record probes before its first delivery; another call finds the attempt
    // meanwhile
    const made = builder.intent(pay(), { payer: wallet });
    await made.build();
    await made.sign();
    const provider = wrap(emulator);
    const restored = intentOver(builderOf(provider), recordOf(made));
    const attempt = restored.txHash!;
    const anchor = recordOf(restored).anchor.anchors[0]!.utxo.input.txHash;
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

  it("gives the intent's trace the events of every attempt's build", async () => {
    const { emulator, builder, wallet } = await setup();
    const events: BuildEvent[] = [];
    const intent = builder.intent(pay(), {
      payer: wallet,
      trace: (event) => events.push(event),
    });
    const payerReads = () => events.filter((e) => e.type === "payer").length;
    const rounds = () => events.filter((e) => e.type === "round").length;
    await intent.build();
    expect(payerReads()).toBe(1);
    const first = rounds();
    expect(first).toBeGreaterThan(0);
    await caught(
      intent.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    advance(emulator, 1);
    await intent.build();
    expect(intent.attempts).toHaveLength(2);
    expect(payerReads()).toBe(2);
    expect(rounds()).toBeGreaterThan(first);
  });

  it("is ABORTED by an aborted signal, and bytes handed out count as sent", async () => {
    const { builder, wallet } = await setup();
    const aborted = AbortSignal.abort("stop");
    const intent = builder.intent(pay(), { payer: wallet });
    for (const call of [
      () => intent.build({ signal: aborted }),
      () => intent.send({ signal: aborted }),
    ]) {
      const error = await caught(call());
      expect(TxBuildError.is(error, "ABORTED")).toBe(true);
      expect(intent.status).toBe("draft");
    }
    await intent.build();
    expect(
      TxBuildError.is(
        await caught(intent.sign({ signal: aborted })),
        "ABORTED",
      ),
    ).toBe(true);
    expect(intent.status).toBe("built");

    const controller = new AbortController();
    const hanging = submitterOf(async () => {
      controller.abort();
      return new Promise<string>(() => undefined);
    });
    const error = await caught(
      intent.send({ submitter: hanging, signal: controller.signal }),
    );
    expect(TxBuildError.is(error, "ABORTED")).toBe(true);
    expect(intent.status).toBe("sent");
    expect(hanging.calls).toHaveLength(1);
  });
});
