import { jest } from "@jest/globals";

import { mConStr0 } from "@meshsdk/core";

import type { TxIntentError } from "../../../src/tx-builder";
import { spend, TxError } from "../../../src/tx-builder";
import {
  advanceIntent,
  draftIntent,
} from "../../../src/tx-builder/intent/core";
import { intentOver, recordOf } from "../../../src/tx-builder/intent/intent";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  emulatorOf,
  FAST,
  pay,
  setup,
  submitterOf,
  walletOf,
  wrap,
} from "./intent-emulator-util";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

/** The reason of a CANNOT_OBSERVE error */
const reasonOf = (error: unknown) => {
  expectCode(error, "CANNOT_OBSERVE");
  return (error as TxIntentError<"CANNOT_OBSERVE">).details.reason;
};

/** A submitter that answers with the hash and passes nothing on */
const swallowing = () =>
  submitterOf(async (tx) => {
    const { Transaction, TxCBOR } = await import("@meshsdk/core-cst");
    return Transaction.fromCbor(TxCBOR(tx)).getId().toString();
  });

const withoutHeight = async (forward: () => Promise<object>) => {
  const { height: _height, ...tip } = (await forward()) as {
    height?: number;
  };
  return tip;
};

describe("TxIntent observation on TxEmulator", () => {
  it("is final only once the attempt's block is confirmations deep", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: {
        intentDefaults: { confirmations: 30, expiryMarginMs: 0, pollMs: 10 },
      },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("included");
    const slot = intent.landed!.seen!.slot;
    expect(slot).toBe(emulator.slot);
    emulator.advanceTo({ slot: slot + 29 });
    await intent.refresh();
    expect(intent.status).toBe("included");
    emulator.advanceTo({ slot: slot + 30 });
    await intent.refresh();
    expect(intent.status).toBe("final");
    expect(intent.landed?.status).toBe("final");
    expect(intent.live.map((a) => a.txHash)).toEqual([intent.txHash]);
  });

  it("declares no final while the tip's height stands still", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      builder: {
        intentDefaults: { confirmations: 3, expiryMarginMs: 0, pollMs: 10 },
      },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ waitFor: "included" });
    const held = (await emulator.fetchLatestBlock()).height;
    provider.control.hooks.fetchLatestBlock = async (forward) => ({
      ...(await forward()),
      height: held,
    });
    advance(emulator, 40);
    await intent.refresh();
    expect(intent.status).toBe("included");
  });

  it("declares no final when the heights do not agree with the slots", async () => {
    for (const confirmations of [0, 3]) {
      const { emulator, builder, wallet } = await setup({
        hooks: {
          fetchLatestBlock: async (forward) => {
            const tip = await forward();
            return { ...tip, height: tip.height + 100 };
          },
        },
        builder: {
          intentDefaults: { confirmations, expiryMarginMs: 0, pollMs: 10 },
        },
      });
      const intent = builder.intent(pay(), { payer: wallet });
      await intent.send();
      advance(emulator, 5);
      await intent.refresh();
      expect(intent.status).toBe("included");
    }
  });

  it("is CANNOT_OBSERVE (noDepth) from the first build on a provider without heights", async () => {
    for (const confirmations of [0, 30]) {
      const { builder, wallet } = await setup({
        hooks: { fetchLatestBlock: withoutHeight },
        builder: {
          intentDefaults: { confirmations, expiryMarginMs: 0, pollMs: 10 },
        },
      });
      const intent = builder.intent(pay(), { payer: wallet });
      const error = await caught(intent.build());
      expect(reasonOf(error)).toBe("noDepth");
      expect((error as TxIntentError).retryable).toBe(false);
      expect(intent.status).toBe("draft");
      expect(intent.attempts).toEqual([]);
    }
    // A find without its block height
    const { builder, wallet } = await setup({
      hooks: {
        fetchTxInfo: async (forward, hash: string) => {
          const { blockHeight: _height, ...info } = await forward(hash);
          return info;
        },
      },
    });
    expect(
      reasonOf(await caught(builder.intent(pay(), { payer: wallet }).build())),
    ).toBe("noDepth");
  });

  it("is CANNOT_OBSERVE (noDepth) from send() for an attempt found without heights; refresh() shows it", async () => {
    for (const drop of ["tip", "find"] as const) {
      const { builder, wallet, provider } = await setup({
        builder: {
          intentDefaults: { confirmations: 3, expiryMarginMs: 0, pollMs: 10 },
        },
      });
      const intent = builder.intent(pay(), { payer: wallet });
      await intent.send();
      if (drop === "tip")
        provider.control.hooks.fetchLatestBlock = withoutHeight;
      else
        provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
          const { blockHeight: _height, ...info } = await forward(hash);
          return info;
        };
      await intent.refresh();
      expect(intent.status).toBe("included");
      expect(reasonOf(await caught(intent.send()))).toBe("noDepth");
      expect(reasonOf(await caught(intent.send({ waitFor: "final" })))).toBe(
        "noDepth",
      );
      expect(intent.status).toBe("included");
    }
  });

  it("probes before the first delivery of an attempt it did not build", async () => {
    const emulator = await emulatorOf();
    const wallet = await walletOf();
    emulator.fund((await wallet.getChangeAddress())!, {
      lovelace: 100_000_000n,
    });
    const made = builderOf(emulator).intent(pay(), { payer: wallet });
    await made.build();
    await made.sign();
    expect(made.status).toBe("signed");

    const provider = wrap(emulator, { fetchLatestBlock: withoutHeight });
    const restored = intentOver(builderOf(provider), recordOf(made));
    const error = await caught(restored.send());
    expect(reasonOf(error)).toBe("noDepth");
    expect(provider.control.count("submitTx")).toBe(0);
    expect(restored.status).toBe("signed");
    expect(restored.attempts[0]?.sends).toBe(0);

    // A resend of the same bytes needs no probe
    const fine = wrap(emulator);
    const sender = intentOver(builderOf(fine), recordOf(made));
    await sender.send({ submitter: swallowing() });
    expect(sender.status).toBe("sent");
    const resender = intentOver(builderOf(provider), recordOf(sender));
    await resender.send();
    expect(provider.control.count("submitTx")).toBe(1);
  });

  it("builds when the probe gets no answer, and probes again before the first delivery", async () => {
    let failures = 1;
    const anchors: string[] = [];
    const { builder, wallet, provider } = await setup({
      hooks: {
        fetchTxInfo: async (forward, hash: string) => {
          anchors.push(hash);
          if (failures-- > 0) throw new Error("try later");
          return forward(hash);
        },
      },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.build();
    expect(intent.status).toBe("built");
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo.input.txHash;
    expect(anchors).toEqual([anchor]);
    await intent.send();
    expect(anchors.filter((hash) => hash === anchor)).toHaveLength(2);
    expect(provider.control.count("submitTx")).toBe(1);
    // Answered once: no more probes
    await intent.refresh();
    expect(anchors.filter((hash) => hash === anchor)).toHaveLength(2);
  });

  it("is CANNOT_OBSERVE (noSearch) for a provider without a search", async () => {
    const { builder, wallet } = await setup({
      hooks: {
        fetchTxInfo: async () => {
          throw { kind: "unsupported" };
        },
      },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    expect(reasonOf(await caught(intent.build()))).toBe("noSearch");
    expect(intent.status).toBe("draft");
  });

  it("is CANNOT_OBSERVE (noValidity) for a Plutus attempt the provider cannot judge", async () => {
    const stripped = async (
      forward: (hash: string) => Promise<object>,
      hash: string,
    ) => {
      const { validContract: _valid, ...info } = (await forward(hash)) as {
        validContract?: boolean;
      };
      return info;
    };
    // From the first build: nothing recorded, nobody asked to sign
    const first = await setup({ hooks: { fetchTxInfo: stripped } });
    const locked = first.emulator.fund(first.builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    let asked = 0;
    const signer = {
      signTx: async (tx: string) => {
        asked += 1;
        return first.wallet.signTx(tx, true);
      },
    };
    const unlock = (utxo: typeof locked) =>
      spend.plutus({ utxo, script: plutus, redeemer: { data: mConStr0([]) } });
    const intent = first.builder.intent(unlock(locked), {
      payer: first.wallet,
    });
    expect(reasonOf(await caught(intent.send({ signers: signer })))).toBe(
      "noValidity",
    );
    expect(intent.status).toBe("draft");
    expect(asked).toBe(0);
    // An attempt without a Plutus script is not concerned
    await first.builder.intent(pay(), { payer: first.wallet }).build();

    // After the first build: send() throws, refresh() shows the earlier status
    const later = await setup();
    const lockedLater = later.emulator.fund(
      later.builder.scriptAddress(plutus),
      { lovelace: 10_000_000n },
    );
    const sent = later.builder.intent(unlock(lockedLater), {
      payer: later.wallet,
    });
    await sent.send();
    expect(sent.status).toBe("sent");
    later.provider.control.hooks.fetchTxInfo = stripped;
    expect(reasonOf(await caught(sent.send()))).toBe("noValidity");
    expect(sent.status).toBe("sent");
    expect(reasonOf(await caught(sent.advance()))).toBe("noValidity");
    expect(sent.status).toBe("sent");
    // abandon() records no closing mark for it
    expect(reasonOf(await caught(sent.abandon()))).toBe("noValidity");
    expect(sent.closing).toBe(false);
    await sent.refresh();
    expect(sent.status).toBe("sent");
  });

  it("is CANNOT_OBSERVE (noValidity) from build() when the search before a new attempt finds an expired Plutus attempt without its validity", async () => {
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
    await intent.send({ submitter: swallowing() });
    const { txHash, until } = intent.attempts[0]!;
    emulator.advanceTo({ time: until });
    await intent.refresh();
    expect(intent.status).toBe("expired");
    // A late search finds it in a block, and cannot tell whether its scripts passed
    const tip = await emulator.fetchLatestBlock();
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
      hash === txHash
        ? {
            hash,
            slot: String(Number(tip.slot) - 1),
            block: tip.hash,
            blockHeight: tip.height,
          }
        : forward(hash);
    expect(reasonOf(await caught(intent.build()))).toBe("noValidity");
    expect(intent.attempts).toHaveLength(1);
    expect(intent.txHash).toBe(txHash);
  });

  it("is CANNOT_OBSERVE (noValidity) from the wait of send() once the provider stops giving the validity", async () => {
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
    // From the delivery on, the provider finds transactions without their validity
    const submitter = submitterOf(async (tx) => {
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
        const { validContract: _valid, ...info } = (await forward(hash)) as {
          validContract?: boolean;
        };
        return info;
      };
      return emulator.submitTx(tx);
    });
    // A wait that ran on to its end would give CONFIRM_TIMEOUT
    const error = await caught(
      intent.send({ submitter, waitFor: "final", timeoutMs: 2_000 }),
    );
    expect(reasonOf(error)).toBe("noValidity");
    expect(submitter.calls).toHaveLength(1);
    expect(intent.status).toBe("sent");
  });

  it("is expired past the margin when the search cannot tell and a fresh read shows the anchor", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const { txHash, until } = intent.attempts[0]!;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === txHash) throw new Error("search down");
      return forward(hash);
    };
    emulator.advanceTo({ time: until + 1_000 });
    // A read that does not answer decides nothing
    const read = provider.control.hooks.fetchAddressUTxOs;
    provider.control.hooks.fetchAddressUTxOs = async () => [];
    await intent.refresh();
    expect(intent.status).toBe("sent");
    provider.control.hooks.fetchAddressUTxOs = read;
    const reads = provider.control.count("fetchAddressUTxOs");
    await intent.refresh();
    expect(provider.control.count("fetchAddressUTxOs")).toBe(reads + 1);
    expect(intent.status).toBe("expired");
  });

  it("never expires an attempt the search found without a slot, whatever the anchor's address shows", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const intents = [
      builder.intent(pay(), { payer: wallet }),
      builder.intent(
        spend.plutus({
          utxo: locked,
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        { payer: wallet },
      ),
    ];
    for (const intent of intents)
      await intent.send({ submitter: swallowing() });
    const found = new Map<string, boolean>(
      intents.map((intent, i) => [intent.txHash!, i === 0]),
    );
    // Found, without a slot: valid for the payment, is_valid = false for the script spend
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
      found.has(hash)
        ? {
            hash,
            block: "00".repeat(32),
            blockHeight: 1,
            validContract: found.get(hash),
          }
        : forward(hash);
    const latest = Math.max(
      ...intents.map((intent) => intent.attempts[0]!.until),
    );
    emulator.advanceTo({ time: latest + 1_000 });
    // The anchors are still in place: nothing was submitted to the ledger
    for (const intent of intents) {
      const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
      expect(
        (await emulator.fetchAddressUTxOs(anchor.output.address)).some(
          (utxo) =>
            utxo.input.txHash === anchor.input.txHash &&
            utxo.input.outputIndex === anchor.input.outputIndex,
        ),
      ).toBe(true);
      await intent.refresh();
      expect(intent.status).toBe("sent");
    }
  });

  it("expires no attempt whose anchor another attempt found without a slot spends", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await caught(
      intent.send({
        submitter: submitterOf(async () => {
          throw { kind: "rejected" };
        }),
      }),
    );
    expect(intent.status).toBe("rejected");
    advance(emulator, 1);
    await intent.build();
    await intent.send({ submitter: swallowing() });
    const [first, second] = intent.attempts;
    expect(intent.attempts).toHaveLength(2);
    expect(first!.status).toBe("rejected");
    expect(second!.status).toBe("sent");
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    // Both attempts spend the one general anchor
    for (const attempt of recordOf(intent).attempts)
      expect(attempt.anchors).toEqual([anchor.input]);
    // The first is found without its slot, the search gives no answer about the second
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === first!.txHash)
        return { hash, block: "00".repeat(32), blockHeight: 1 };
      if (hash === second!.txHash) throw new Error("search down");
      return forward(hash);
    };
    emulator.advanceTo({
      time: Math.max(first!.until, second!.until) + 1_000,
    });
    // The address still lists the anchor: nothing reached the ledger
    expect(
      (await emulator.fetchAddressUTxOs(anchor.output.address)).some(
        (utxo) =>
          utxo.input.txHash === anchor.input.txHash &&
          utxo.input.outputIndex === anchor.input.outputIndex,
      ),
    ).toBe(true);
    await intent.refresh();
    expect(intent.attempts.map((attempt) => attempt.status)).toEqual([
      "rejected",
      "sent",
    ]);
    expect(intent.status).not.toBe("expired");
  });

  it("reads no address while the search answers", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    emulator.advanceTo({ time: intent.attempts[0]!.until + 1_000 });
    const reads = provider.control.count("fetchAddressUTxOs");
    await intent.refresh();
    expect(intent.status).toBe("expired");
    expect(provider.control.count("fetchAddressUTxOs")).toBe(reads);
  });

  it("moves final by confirmations only, and expired by the margin only", async () => {
    const finalAt: number[] = [];
    for (const expiryMarginMs of [0, 600_000]) {
      const { emulator, builder, wallet } = await setup({
        builder: {
          intentDefaults: { confirmations: 3, expiryMarginMs, pollMs: 10 },
        },
      });
      const intent = builder.intent(pay(), { payer: wallet });
      await intent.send({ waitFor: "included" });
      const slot = intent.landed!.seen!.slot;
      for (let at = slot + 1; intent.status !== "final"; at++) {
        emulator.advanceTo({ slot: at });
        await intent.refresh();
      }
      finalAt.push(emulator.slot - slot);
    }
    expect(finalAt).toEqual([3, 3]);

    const expiredAt: number[] = [];
    for (const confirmations of [0, 30]) {
      const { emulator, builder, wallet } = await setup({
        builder: {
          intentDefaults: { confirmations, expiryMarginMs: 5_000, pollMs: 10 },
        },
      });
      const intent = builder.intent(pay(), { payer: wallet });
      await intent.send({ submitter: swallowing() });
      const until = intent.attempts[0]!.until;
      for (let at = until; intent.status !== "expired"; at += 1_000) {
        emulator.advanceTo({ time: at });
        await intent.refresh();
      }
      expiredAt.push(emulator.time - until);
    }
    expect(expiredAt).toEqual([5_000, 5_000]);
  });

  it("makes no request in final and abandoned", async () => {
    const { builder, wallet, provider } = await setup();
    const reads = () =>
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "submitTx",
      );
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ waitFor: "final" });
    expect(intent.status).toBe("final");
    const before = reads();
    await intent.refresh();
    await intent.send();
    await intent.send({ waitFor: "final" });
    expect(await intent.advance()).toBe(intent);
    expect(await intent.advance({ waitFor: "final", signers: wallet })).toBe(
      intent,
    );
    expect(reads()).toBe(before);

    // An abandoned record, closed from draft
    const draft = draftIntent({
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 0 },
      parts: [pay()],
      options: {},
    });
    const closed = advanceIntent(draft, { type: "closing" });
    if (!closed.ok) throw new Error(closed.message);
    const abandoned = intentOver(builder, closed.json);
    expect(abandoned.status).toBe("abandoned");
    await abandoned.refresh();
    const terminal = (await caught(
      abandoned.send(),
    )) as TxIntentError<"INVALID_STATE">;
    expectCode(terminal, "INVALID_STATE");
    expect(terminal.details.reason).toBe("terminal");
    expect(
      ((await caught(abandoned.build())) as TxIntentError<"INVALID_STATE">)
        .details.reason,
    ).toBe("terminal");
    expect(await abandoned.advance({ signers: wallet })).toBe(abandoned);
    expect(await abandoned.abandon()).toBe(abandoned);
    expect(reads()).toBe(before);
  });

  it("waits 120 s by default, and confirmations × 30 s + 120 s for final", async () => {
    // The builder's confirmations differ from each intent's: the intent's recorded value counts
    const { builder, wallet } = await setup({
      builder: { intentDefaults: { confirmations: 10, expiryMarginMs: 0 } },
    });
    const intent = builder.intent(pay(), { payer: wallet, confirmations: 30 });
    await intent.send({ submitter: swallowing() });
    const shallow = builder.intent(pay(), { payer: wallet, confirmations: 4 });
    await shallow.send({ submitter: swallowing() });
    jest.useFakeTimers({
      doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
    });
    try {
      for (const [target, waitFor, timeoutMs] of [
        [shallow, "included", 120_000],
        [shallow, "final", 240_000],
        [intent, "final", 1_020_000],
      ] as const) {
        let thrown: unknown;
        const waiting = target
          .send({ submitter: swallowing(), waitFor })
          .catch((error) => {
            thrown = error;
          });
        await jest.advanceTimersByTimeAsync(timeoutMs + 10_000);
        await waiting;
        expectCode(thrown, "CONFIRM_TIMEOUT");
        expect((thrown as TxIntentError<"CONFIRM_TIMEOUT">).details).toEqual({
          waitedFor: waitFor,
          timeoutMs,
        });
      }
    } finally {
      jest.useRealTimers();
    }
    expect(intent.status).toBe("sent");
    expect(shallow.status).toBe("sent");
  });

  it("keeps the deadlines it was made with when its builder's defaults change", async () => {
    const { emulator, builder, wallet } = await setup({
      builder: { intentDefaults: { ...FAST, ttlMs: 120_000 } },
    });
    const intent = builder.intent(pay(), { payer: wallet });
    Object.defineProperty(builder, "intentDefaults", {
      value: Object.freeze({ ...FAST, ttlMs: 1_000, expiryMarginMs: 600_000 }),
    });
    const built = await intent.build();
    expect(built.validity?.until).toBe(emulator.time + 120_000);
    await intent.send({ submitter: swallowing() });
    // Expired by the recorded margin of 0, not by the builder's new one
    emulator.advanceTo({ time: intent.attempts[0]!.until + 1_000 });
    await intent.refresh();
    expect(intent.status).toBe("expired");
  });
});
