import type { UTxO } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";

import type { TxIntent, TxIntentError } from "../../../src/tx-builder";
import { spend, TxError } from "../../../src/tx-builder";
import { intentOver, recordOf } from "../../../src/tx-builder/intent/intent";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  pay,
  reasonOf,
  setup,
  submitterOf,
  swallowing,
  walletOf,
  wrap,
} from "./intent-emulator-util";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const notFound = () => {
  throw { kind: "notFound", status: 404 };
};

/** The fields every error of an intent's method carries, and its closing sentence */
const expectIntentFields = (
  error: TxIntentError,
  intent: TxIntent,
  status: string,
  txHash: string | undefined,
) => {
  expect(error.intent).toBe(intent);
  expect(Object.keys(error)).not.toContain("intent");
  expect(error.intentId).toBe(intent.id);
  expect(error.status).toBe(status);
  expect(error.txHash).toBe(txHash);
  expect(error.message).toMatch(
    /does not mean that the payment did not go through: only an abandoned intent did not pay\.$/,
  );
};

/** Waits until the condition holds, checking every few ms */
const eventually = async (condition: () => boolean) => {
  for (let i = 0; i < 1_000; i++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("the condition never held");
};

/** An intent whose payer anchor changed: its first attempt refused, its anchor spent */
const changedAnchor = async () => {
  const context = await setup();
  const { emulator, builder, wallet } = context;
  const intent = builder.intent(pay(), { id: "changed", payer: wallet });
  await caught(
    intent.send({
      submitter: submitterOf(async () => {
        throw { kind: "rejected" };
      }),
    }),
  );
  const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
  emulator.removeUtxos([anchor.input]);
  emulator.advanceTo({ time: intent.attempts[0]!.until });
  await intent.build();
  expect(recordOf(intent).anchor.anchors).toHaveLength(2);
  return { ...context, intent };
};

describe("TxIntent.abandon and the closing on TxEmulator", () => {
  it("records the mark before STILL_LIVE, and then builds, signs and sends nothing", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { id: "pay-1", payer: wallet });
    await intent.send({ submitter: swallowing() });
    const attempt = intent.attempts[0]!;
    const error = (await caught(
      intent.abandon(),
    )) as TxIntentError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expectIntentFields(error, intent, "sent", attempt.txHash);
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({
      txHashes: [attempt.txHash],
      safeAfter: attempt.until,
    });
    expect(error.retryAfterMs).toBe(
      attempt.until - builder.timeAt(emulator.slot),
    );
    expect(intent.closing).toBe(true);
    expect(intent.status).toBe("sent");

    const submits = provider.control.count("submitTx");
    for (const call of [
      () => intent.send(),
      () => intent.send({ waitFor: "included" }),
      () => intent.build(),
      () => intent.sign({ signers: wallet }),
      () => intent.addWitnesses(intent.signedTx!),
    ]) {
      const refused = (await caught(call())) as TxIntentError<"INVALID_STATE">;
      expectCode(refused, "INVALID_STATE");
      expect(refused.details.reason).toBe("closing");
    }
    expect(provider.control.count("submitTx")).toBe(submits);
    expect(intent.attempts).toHaveLength(1);
    // A later abandon() before safeAfter says the same, and the mark stays
    expectCode(await caught(intent.abandon()), "STILL_LIVE");
    expect(intent.closing).toBe(true);
  });

  it("is ATTEMPT_ON_CHAIN for a landed attempt, records no mark, and the intent goes on", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { intentDefaults: { ...FAST, confirmations: 3 } },
    });
    const intent = builder.intent(pay(), { id: "pay-2", payer: wallet });
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("included");
    const error = (await caught(
      intent.abandon(),
    )) as TxIntentError<"ATTEMPT_ON_CHAIN">;
    expectCode(error, "ATTEMPT_ON_CHAIN");
    expectIntentFields(error, intent, "included", intent.txHash);
    expect(error.retryable).toBe(false);
    expect(error.details.landed).toEqual(intent.landed);
    expect(intent.closing).toBe(false);
    advance(emulator, 3);
    await intent.send({ waitFor: "final" });
    expect(intent.status).toBe("final");
  });

  it("answers on a closed intent without a request", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const reads = () =>
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "submitTx",
      );
    const paid = builder.intent(pay(), { payer: wallet });
    await paid.send({ waitFor: "final" });
    let before = reads();
    const onChain = (await caught(
      paid.abandon(),
    )) as TxIntentError<"ATTEMPT_ON_CHAIN">;
    expectCode(onChain, "ATTEMPT_ON_CHAIN");
    expect(onChain.details.landed.txHash).toBe(paid.txHash);
    expect(reads()).toBe(before);

    const dropped = builder.intent(pay(), { payer: wallet });
    await dropped.send({ submitter: swallowing() });
    emulator.advanceTo({ time: dropped.attempts[0]!.until });
    await dropped.abandon();
    expect(dropped.status).toBe("abandoned");
    before = reads();
    expect(await dropped.abandon()).toBe(dropped);
    expect(await dropped.advance()).toBe(dropped);
    await dropped.refresh();
    expect(reads()).toBe(before);
  });

  it("closes an intent with no live attempt in the same call: a failed attempt does not stop it", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const intent = builder.intent(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await intent.send();
    const txHash = intent.txHash!;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      const info = await forward(hash);
      return hash === txHash ? { ...info, validContract: false } : info;
    };
    await intent.refresh();
    expect(intent.status).toBe("failed");
    expect(intent.live).toEqual([]);
    await intent.abandon();
    expect(intent.status).toBe("abandoned");
    expect(intent.closing).toBe(true);
  });

  it("closes after the deadline, the anchor's witness being the emulator's answer for a funded UTxO", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    emulator.advanceTo({ time: intent.attempts[0]!.until });
    const searched: string[] = [];
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      searched.push(hash);
      return forward(hash);
    };
    await intent.abandon();
    expect(intent.status).toBe("abandoned");
    expect(intent.live).toEqual([]);
    expect(intent.attempts.map((a) => a.status)).toEqual(["expired"]);
    // Two polls, each searching the attempt and the transaction that created the anchor
    expect(
      searched.filter((hash) => hash === anchor.input.txHash),
    ).toHaveLength(2);
  });

  it("does not close an intent whose expired attempt a closing search finds without its slot", async () => {
    for (const validContract of [undefined, true]) {
      const { emulator, builder, wallet, provider } = await setup();
      const intent = builder.intent(pay(), { payer: wallet });
      await intent.send({ submitter: swallowing() });
      const { txHash, until } = intent.attempts[0]!;
      emulator.advanceTo({ time: until });
      await intent.refresh();
      expect(intent.status).toBe("expired");
      // The attempt did land: a later search finds it, though not where it can be placed
      const { height } = await emulator.fetchLatestBlock();
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
        hash === txHash
          ? {
              hash,
              block: "00".repeat(32),
              blockHeight: height,
              ...(validContract !== undefined && { validContract }),
            }
          : forward(hash);
      const error = (await caught(
        intent.abandon(),
      )) as TxIntentError<"CANNOT_OBSERVE">;
      expectCode(error, "CANNOT_OBSERVE");
      expect(error.details.reason).toBe("unconfirmed");
      expect(error.message).toMatch(/is found, and not where it can be placed/);
      expect(intent.status).toBe("expired");
      expect(intent.closing).toBe(true);
    }
  });

  it("does not close on an attempt another instance recorded expired while this tip is within the margin", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { intentDefaults: { ...FAST, expiryMarginMs: 2_000 } },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const { until } = intent.attempts[0]!;
    // This instance's tip: past the deadline, within the margin
    emulator.advanceTo({ time: until + 1_000 });
    const behind = await emulator.fetchLatestBlock();
    // The other instance's tip is past the margin: it records the attempt expired
    emulator.advanceTo({ time: until + 3_000 });
    await intent.refresh();
    expect(intent.status).toBe("expired");
    const late = intentOver(
      builderOf(wrap(emulator, { fetchLatestBlock: async () => behind })),
      recordOf(intent),
    );
    const error = await caught(late.abandon());
    expectCode(error, "CANNOT_OBSERVE");
    expect(reasonOf(error)).toBe("unconfirmed");
    expect(error.message).toMatch(/before .* deadline and the margin/);
    expect(late.status).toBe("expired");
  });

  it("is CANNOT_OBSERVE (unconfirmed) without a tip, before and after the deadline, and keeps the mark", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { id: "pay-3", payer: wallet });
    await intent.send({ submitter: swallowing() });
    provider.control.hooks.fetchLatestBlock = () => {
      throw new Error("down");
    };
    for (const time of [emulator.time, intent.attempts[0]!.until + 60_000]) {
      emulator.advanceTo({ time });
      const error = (await caught(
        intent.abandon(),
      )) as TxIntentError<"CANNOT_OBSERVE">;
      expectCode(error, "CANNOT_OBSERVE");
      expectIntentFields(error, intent, "sent", intent.txHash);
      expect(error.details.reason).toBe("unconfirmed");
      expect(error.retryable).toBe(true);
      expect(intent.closing).toBe(true);
      expect(intent.status).not.toBe("abandoned");
    }
    // With the tip back, the closing finishes
    provider.control.hooks.fetchLatestBlock = undefined;
    await intent.abandon();
    expect(intent.status).toBe("abandoned");
  });

  it("finishes the closing with advance(): no error before safeAfter, unconfirmed without a tip, then abandoned", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    expectCode(await caught(intent.abandon()), "STILL_LIVE");
    const submits = provider.control.count("submitTx");
    expect(await intent.advance({ waitFor: "included" })).toBe(intent);
    expect(intent.status).toBe("sent");
    expect(provider.control.count("submitTx")).toBe(submits);

    provider.control.hooks.fetchLatestBlock = () => {
      throw new Error("down");
    };
    const error = (await caught(
      intent.advance(),
    )) as TxIntentError<"CANNOT_OBSERVE">;
    expectCode(error, "CANNOT_OBSERVE");
    expect(error.details.reason).toBe("unconfirmed");
    provider.control.hooks.fetchLatestBlock = undefined;

    emulator.advanceTo({ time: intent.attempts[0]!.until });
    await intent.advance({ signers: wallet });
    expect(intent.status).toBe("abandoned");
    expect(intent.attempts).toHaveLength(1);
    expect(provider.control.count("submitTx")).toBe(submits);
  });

  it("leads an attempt that lands after the mark to included and final, and never sends it again", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      builder: { intentDefaults: { ...FAST, confirmations: 3 } },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    expectCode(await caught(intent.abandon()), "STILL_LIVE");
    const before = emulator.fork();
    await emulator.submitTx(intent.signedTx!);
    const submits = provider.control.count("submitTx");

    await intent.advance();
    expect(intent.status).toBe("included");
    expect(intent.closing).toBe(true);
    // The landing is no reason to throw from abandon() on: it says so
    expectCode(await caught(intent.abandon()), "ATTEMPT_ON_CHAIN");

    // A rollback: back to sent, and the closing path sends nothing
    provider.control.target = before;
    await intent.advance({ waitFor: "included" });
    expect(intent.status).toBe("sent");
    expect(intent.landed).toBeUndefined();
    expect(provider.control.count("submitTx")).toBe(submits);

    // Back on the chain where it landed, it becomes final
    provider.control.target = emulator;
    await intent.advance();
    expect(intent.status).toBe("included");
    advance(emulator, 3);
    await intent.advance();
    expect(intent.status).toBe("final");
    expect(provider.control.count("submitTx")).toBe(submits);
  });

  it("searches the attempts on the previous anchor at the closing, though the current anchor is in place", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    let hidden: string | undefined;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) =>
      hash === hidden ? notFound() : forward(hash);
    const intent = builder.intent(pay(), { payer: wallet });
    // It lands, and the provider does not show it
    await intent.send({
      submitter: {
        submitTx: async (tx: string) => {
          const txHash = await emulator.submitTx(tx);
          hidden = txHash;
          return txHash;
        },
      },
    });
    const first = intent.attempts[0]!;
    const firstAnchor = recordOf(intent).anchor.anchors[0]!.utxo;
    emulator.advanceTo({ time: first.until });
    await intent.refresh();
    expect(intent.status).toBe("expired");

    // The anchor is spent and no attempt is found: the anchor changes
    const second = await intent.build();
    expect(second.txHash).not.toBe(first.txHash);
    const anchors = recordOf(intent).anchor.anchors;
    expect(anchors).toHaveLength(2);
    expect(anchors[0]!.utxo.input).toEqual(firstAnchor.input);
    expect(anchors[1]!.kind).toBe("payer");
    expect(anchors[1]!.attempts).toEqual([second.txHash]);
    expect(second.inputs.map((u) => u.input)).not.toContainEqual(
      firstAnchor.input,
    );

    // The first attempt shows up; the second expires with its anchor in place
    hidden = undefined;
    emulator.advanceTo({ time: intent.attempts[1]!.until });
    const error = (await caught(
      intent.abandon(),
    )) as TxIntentError<"ATTEMPT_ON_CHAIN">;
    expectCode(error, "ATTEMPT_ON_CHAIN");
    expect(error.details.landed.txHash).toBe(first.txHash);
    expect(intent.closing).toBe(true);
    expect(intent.landed?.txHash).toBe(first.txHash);
    expect(
      emulator
        .utxos({ address: anchors[1]!.utxo.output.address })
        .some((u) => u.input.txHash === anchors[1]!.utxo.input.txHash),
    ).toBe(true);
  });
});

describe("TxIntent anchor change on TxEmulator", () => {
  it("changes the payer's anchor once it is spent, past the deadline, after the double check", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await caught(
      intent.send({
        submitter: {
          submitTx: async () => {
            throw { kind: "rejected" };
          },
        },
      }),
    );
    expect(intent.status).toBe("rejected");
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    // Spent by someone else, before the deadline: STILL_LIVE, nothing built
    emulator.removeUtxos([anchor.input]);
    const early = (await caught(intent.build())) as TxIntentError<"STILL_LIVE">;
    expectCode(early, "STILL_LIVE");
    expect(early.details.txHashes).toEqual([intent.attempts[0]!.txHash]);
    expect(early.details.safeAfter).toBe(intent.attempts[0]!.until);
    expect(intent.attempts).toHaveLength(1);

    emulator.advanceTo({ time: intent.attempts[0]!.until });
    const next = await intent.build();
    const anchors = recordOf(intent).anchor.anchors;
    expect(anchors).toHaveLength(2);
    expect(next.inputs.map((u) => u.input)).toContainEqual(
      anchors[1]!.utxo.input,
    );
    expect(intent.attempts.map((a) => a.status)).toEqual(["expired", "built"]);
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
  });

  it("is CANNOT_OBSERVE (unconfirmed) at once when the transaction that created the anchor is rolled back", async () => {
    const { emulator, builder, wallet, provider, address } = await setup({
      funds: [],
      builder: {
        intentDefaults: { ...FAST, expiryMarginMs: 3_000 },
      },
    });
    // The payer's only UTxO comes from a transaction of another wallet
    const other = await walletOf(1);
    const otherAddress = (await other.getChangeAddress())!;
    const source = emulator.fund(otherAddress, { lovelace: 200_000_000n });
    const before = emulator.fork();
    const funding = await builder.build(pay(100_000_000n, address), {
      payer: { changeAddress: otherAddress, utxos: [source] },
    });
    await emulator.submitTx(await other.signTx(funding.tx));

    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    expect(recordOf(intent).anchor.anchors[0]!.utxo.input.txHash).toBe(
      funding.txHash,
    );
    // The provider now reads a chain without that transaction; the address holds another UTxO
    before.advanceTo({ time: intent.attempts[0]!.until + 3_000 });
    before.fund(address, { lovelace: 50_000_000n });
    provider.control.target = before;
    await intent.refresh();
    expect(intent.status).toBe("expired");

    const timed = async (call: () => Promise<unknown>) => {
      const started = performance.now();
      const error = await caught(call());
      expect(performance.now() - started).toBeLessThan(2_000);
      return error;
    };
    const fromBuild = await timed(() => intent.build());
    expectCode(fromBuild, "CANNOT_OBSERVE");
    expect(reasonOf(fromBuild)).toBe("unconfirmed");
    expect(intent.attempts).toHaveLength(1);
    expect(recordOf(intent).anchor.anchors).toHaveLength(1);

    const fromAbandon = await timed(() => intent.abandon());
    expectCode(fromAbandon, "CANNOT_OBSERVE");
    expect(reasonOf(fromAbandon)).toBe("unconfirmed");
    expect(intent.closing).toBe(true);
    expect(intent.status).not.toBe("abandoned");
  });

  it("returns an earlier attempt the check before a payer anchor change finds landed", async () => {
    // Deep enough that the landed attempt is not final yet when the deadline has passed
    const { emulator, builder, wallet, provider } = await setup({
      builder: { intentDefaults: { ...FAST, confirmations: 10_000 } },
    });
    let hidden: string | undefined;
    let hide = 0;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) =>
      hash === hidden && hide-- > 0 ? notFound() : forward(hash);
    const intent = builder.intent(pay(), { payer: wallet });
    // It lands, and the submitter reports a refusal
    await caught(
      intent.send({
        submitter: submitterOf(async (tx) => {
          hidden = await emulator.submitTx(tx);
          throw { kind: "rejected" };
        }),
      }),
    );
    expect(intent.status).toBe("rejected");
    const first = intent.attempts[0]!;
    emulator.advanceTo({ time: first.until });
    // The search of build() does not find it; the anchor is spent; the check finds it
    hide = 1;
    const built = await intent.build();
    expect(built.txHash).toBe(first.txHash);
    expect(intent.status).toBe("included");
    expect(intent.landed?.txHash).toBe(first.txHash);
    expect(intent.attempts).toHaveLength(1);
    expect(recordOf(intent).anchor.anchors).toHaveLength(1);
  });

  it("changes no payer anchor when the second poll of the check gets no answer, or shows the anchor again", async () => {
    for (const fault of ["search", "anchor"] as const) {
      const { emulator, builder, wallet, provider } = await setup();
      const intent = builder.intent(pay(), { payer: wallet });
      await caught(
        intent.send({
          submitter: submitterOf(async () => {
            throw { kind: "rejected" };
          }),
        }),
      );
      const attempt = intent.attempts[0]!;
      const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
      emulator.removeUtxos([anchor.input]);
      emulator.advanceTo({ time: attempt.until });
      // The search of build(), the first poll, then the second poll
      let searches = 0;
      let reads = 0;
      provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
        if (hash === attempt.txHash && ++searches === 3 && fault === "search")
          throw new Error("no answer");
        return forward(hash);
      };
      // The read before the check, the first poll's, then the second poll's
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        address: string,
      ) => {
        const listed = await forward(address);
        if (address !== anchor.output.address) return listed;
        return ++reads === 3 && fault === "anchor"
          ? [...listed, anchor]
          : listed;
      };
      const error = await caught(intent.build());
      expectCode(error, "CANNOT_OBSERVE");
      expect(reasonOf(error)).toBe("unconfirmed");
      expect(fault === "search" ? searches : reads).toBe(3);
      expect(intent.attempts).toHaveLength(1);
      expect(recordOf(intent).anchor.anchors).toHaveLength(1);
    }
  });

  it.each([
    [2, "empty"],
    [2, "throws"],
    [3, "empty"],
    [3, "throws"],
  ] as const)(
    "changes no payer anchor when read %i of its address gives no answer (%s)",
    async (faulty, answer) => {
      const { emulator, builder, wallet, provider } = await setup();
      const intent = builder.intent(pay(), { payer: wallet });
      await caught(
        intent.send({
          submitter: submitterOf(async () => {
            throw { kind: "rejected" };
          }),
        }),
      );
      const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
      emulator.removeUtxos([anchor.input]);
      emulator.advanceTo({ time: intent.attempts[0]!.until });
      // The read before the check, the first poll's, then the second poll's
      let reads = 0;
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        address: string,
      ) => {
        if (address !== anchor.output.address) return forward(address);
        if (++reads !== faulty) return forward(address);
        if (answer === "empty") return [];
        throw new Error("no answer");
      };
      const error = await caught(intent.build());
      expectCode(error, "CANNOT_OBSERVE");
      expect(reasonOf(error)).toBe("unconfirmed");
      expect(reads).toBe(faulty);
      expect(intent.attempts).toHaveLength(1);
      expect(recordOf(intent).anchor.anchors).toHaveLength(1);
    },
  );

  it("is STILL_LIVE until the deadline and the margin for a payer anchor spent by someone else", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { intentDefaults: { ...FAST, expiryMarginMs: 5_000 } },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await caught(
      intent.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    emulator.removeUtxos([anchor.input]);
    const { txHash, until } = intent.attempts[0]!;
    // Past the deadline, within the margin
    emulator.advanceTo({ time: until });
    const error = (await caught(intent.build())) as TxIntentError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expect(error.details.txHashes).toEqual([txHash]);
    expect(error.details.safeAfter).toBe(until + 5_000);
    expect(intent.attempts).toHaveLength(1);
    expect(recordOf(intent).anchor.anchors).toHaveLength(1);
  });

  it("searches the attempts on the previous anchor before a resend: one found landed is not sent again", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    let hidden: string | undefined;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) =>
      hash === hidden ? notFound() : forward(hash);
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({
      submitter: submitterOf(async (tx) => {
        hidden = await emulator.submitTx(tx);
        return hidden;
      }),
    });
    const first = intent.attempts[0]!;
    emulator.advanceTo({ time: first.until });
    await intent.refresh();
    await intent.build();
    expect(recordOf(intent).anchor.anchors).toHaveLength(2);
    await intent.send({ submitter: swallowing() });
    expect(intent.status).toBe("sent");

    // The first attempt shows up: the resend finds it, and sends nothing
    hidden = undefined;
    const counting = swallowing();
    await intent.send({ submitter: counting });
    expect(counting.calls).toHaveLength(0);
    expect(intent.landed?.txHash).toBe(first.txHash);
    expect(intent.txHash).toBe(first.txHash);
  });

  it("sends nothing again once the closing mark is recorded during the search before a resend", async () => {
    const { provider, intent } = await changedAnchor();
    const earlier = intent.attempts[0]!.txHash;
    await intent.send({ submitter: swallowing() });
    expect(intent.status).toBe("sent");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === earlier && !held) {
        held = true;
        await gate;
      }
      return forward(hash);
    };
    const counting = swallowing();
    const waiting = intent.send({ waitFor: "included", submitter: counting });
    await eventually(() => held);
    expectCode(await caught(intent.abandon()), "STILL_LIVE");
    expect(intent.closing).toBe(true);
    release();
    const error = (await caught(waiting)) as TxIntentError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("closing");
    expect(counting.calls).toHaveLength(0);
  });

  it("keeps the anchor while the read of its address gives no answer", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    emulator.advanceTo({ time: intent.attempts[0]!.until });
    // An empty answer is no evidence: the anchor stays and the next attempt spends it
    provider.control.hooks.fetchAddressUTxOs = async () => [];
    await intent.refresh();
    expect(intent.status).toBe("expired");
    emulator.removeUtxos([anchor.input]);
    const next = await intent.build({
      payer: {
        changeAddress: anchor.output.address,
        utxos: emulator.utxos({ address: anchor.output.address }),
      },
    });
    expect(next.inputs.map((u: UTxO) => u.input)).toContainEqual(anchor.input);
    expect(recordOf(intent).anchor.anchors).toHaveLength(1);
  });
});
