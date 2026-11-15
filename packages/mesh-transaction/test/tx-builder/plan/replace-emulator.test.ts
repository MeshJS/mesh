import type { TxEmulator } from "@meshsdk/tx-emulator";
import { CachedFetcher, ProviderError } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";

import type { BuildEvent, TxPlan } from "../../../src/tx-builder";
import { spend, validity } from "../../../src/tx-builder";
import { alwaysSucceedCbor } from "../../test-util";
import { asMesh, ref } from "../utxo-util";
import { coins, fragmented, pay as payValue } from "./consolidate-util";
import {
  advance,
  caught,
  FAST,
  forwarding,
  hashOf,
  reasonOf,
  recipient,
  submitterOf,
  swallowing,
  walletOf,
} from "./plan-emulator-util";
import {
  ADA,
  alice,
  bob,
  carol,
  dave,
  paidTo,
  payTo,
  stepSetup,
} from "./run-util";
import { storeSetup } from "./store-util";

// A plan made in place of another with `replan`: what it stands on, the input it shares with
// each transaction of the plan before it that may still land, the wait where it shares none,
// the mark on the plan it replaces, and what a plan does that finds a transaction of the plan
// before it in a block. No test but the one that states the limit of going by time ends with a
// recipient paid twice, and each says so.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const statuses = (plan: TxPlan) =>
  Object.fromEntries(plan.steps.map((step) => [step.name, step.status]));

const names = (plan: TxPlan) => plan.steps.map((step) => step.name);

/** An out ref as text */
const key = (utxo: { txHash: string; outputIndex: number }) =>
  `${utxo.txHash}#${utxo.outputIndex}`;

/** How many outputs of exactly this amount an address holds */
const times = (emulator: TxEmulator, address: string, lovelace: bigint) =>
  paidTo(emulator, address).filter((each) => each === lovelace).length;

/** Whether the chain holds a transaction */
const onChain = (emulator: TxEmulator, txHash: string) =>
  emulator.fetchTxInfo(txHash).then(
    () => true,
    () => false,
  );

/** Whether the ledger refuses these bytes now */
const refused = (emulator: TxEmulator, tx: string) =>
  emulator.submitTx(tx).then(
    () => false,
    () => true,
  );

/** A search that answers "not found" for the hashes in the set */
const hiding = (hidden: Set<string>) => ({
  fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
    if (hidden.has(hash.toLowerCase()))
      throw new ProviderError("not found", {
        kind: "notFound",
        status: 404,
        retryable: false,
      });
    return forward(hash);
  },
});

/** A relay that passes bytes on to the chain, but keeps those `hold` picks and answers */
const relayOf = (emulator: TxEmulator, hold: (txHash: string) => boolean) => {
  const kept: string[] = [];
  const submitter = submitterOf(async (tx) => {
    const txHash = await hashOf(tx);
    if (!hold(txHash)) return emulator.submitTx(tx);
    if (!kept.includes(tx)) kept.push(tx);
    return txHash;
  });
  return Object.assign(submitter, { kept });
};

/** Waits until a condition holds, polling */
const until = async (holds: () => boolean, ms = 5_000) => {
  const started = Date.now();
  while (!holds()) {
    if (Date.now() - started > ms) throw new Error("the condition never held");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

/** A trace that keeps what it is told */
const tracer = () => {
  const events: BuildEvent[] = [];
  return { events, trace: (event: BuildEvent) => void events.push(event) };
};

const noSharedInput = (step: string, txHash: string) => ({
  type: "warning",
  code: "NO_SHARED_INPUT",
  step,
  txHash,
});

/** A second payer, funded */
const treasuryOf = async (emulator: TxEmulator) => {
  const other = await walletOf(1);
  const address = (await other.getChangeAddress())!;
  emulator.fund(address, { lovelace: 50n * ADA });
  return { other, address };
};

/**
 * A plan of three payments: `a` final, `b` sent and held by a relay, `c` signed. A relay holds
 * the bytes of `b`; the search does not find it
 */
const stuck = async (options: Parameters<typeof stepSetup>[1] = {}) => {
  const ctx = await stepSetup("scalus", {
    funds: [100n * ADA, 50n * ADA],
    ...options,
  });
  const old = await ctx.builder.plan(
    {
      a: payTo(alice, 11n * ADA),
      b: payTo(bob, 12n * ADA),
      c: payTo(carol, 13n * ADA),
    },
    { id: "order", payer: ctx.wallet },
  );
  await old.sign();
  const bHash = old.step("b").txHash;
  const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
  const error = await caught(old.run({ submitter: relay, timeoutMs: 300 }));
  expect([error.code, error.step]).toEqual(["CONFIRM_TIMEOUT", "b"]);
  expect(statuses(old)).toEqual({ a: "final", b: "sent", c: "signed" });
  // A slot on: a step built now ends later, so that no new step is an old one byte for byte
  advance(ctx.emulator, 1);
  return {
    ...ctx,
    old,
    relay,
    bytes: { b: relay.kept[0]!, c: old.step("c").signedTx! },
  };
};

/** Each of the three payments of `stuck` made once */
const paidOnce = (emulator: TxEmulator) => {
  expect(times(emulator, alice, 11n * ADA)).toBe(1);
  expect(times(emulator, bob, 12n * ADA)).toBe(1);
  expect(times(emulator, carol, 13n * ADA)).toBe(1);
};

describe("a plan in place of another", () => {
  it("replaces a plan whose step was refused, at once", async () => {
    const { emulator, builder, wallet, funded } = await stepSetup("scalus", {
      funds: [100n * ADA, 7n * ADA],
    });
    const voucher = funded[1]!;
    const isVoucher = (utxo: { txHash: string; outputIndex: number }) =>
      key(utxo) === key(voucher.input);
    const old = await builder.plan(
      {
        a: payTo(alice, 11n * ADA),
        b: [payTo(bob, 12n * ADA), spend.pubKey({ utxo: voucher })],
        c: payTo(carol, 13n * ADA),
      },
      { id: "order", payer: wallet, canSelect: (utxo) => !isVoucher(utxo) },
    );
    await old.sign();
    const bytes = [old.step("b").signedTx!, old.step("c").signedTx!];
    // Another transaction took the voucher
    emulator.removeUtxos([ref(voucher.input)]);
    const error = await caught(old.run());
    expect([error.code, error.step]).toEqual(["REJECTED", "b"]);

    // The new b spends the change of a, as the old b does, also where its selection may not
    const changeOfA = key(old.step("a").change[0]!);
    const next = await old.replan({
      id: "order:2",
      steps: { b: payTo(bob, 12n * ADA), c: payTo(carol, 13n * ADA) },
      canSelect: (utxo) => key(utxo) !== changeOfA,
    });
    expect(old.step("b").inputs.map(key)).toContain(changeOfA);
    expect(next.step("b").inputs.map(key)).toContain(changeOfA);
    const json = next.toJSON();
    expect(json.replaces).toBe("order");
    expect(json.before!.final).toEqual(["a"]);
    expect(
      json.before!.open.map((entry) => [entry.step, entry.txHash]),
    ).toEqual([
      ["b", old.step("b").txHash],
      ["c", old.step("c").txHash],
    ]);
    expect(old.replacedBy).toBe("order:2");
    expect(old.status).toBe("stopping");

    await next.run();
    expect(next.status).toBe("final");
    for (const tx of bytes) expect(await refused(emulator, tx)).toBe(true);
    paidOnce(emulator);
  });

  it("reads every payer after the look, from the provider and not from what an earlier read left", async () => {
    const { provider, address, old } = await stuck();
    // What an earlier read of the address left in the provider's shared cache
    await CachedFetcher.wrap(provider).fetchAddressUTxOs(address);
    const calls: string[] = [];
    for (const name of ["fetchTxInfo", "fetchLatestBlock", "fetchAddressUTxOs"])
      provider.control.hooks[name] = (forward, ...args: unknown[]) => {
        calls.push(name);
        return forward(...args);
      };
    await old.replan({ id: "order:2" });
    const look = calls.indexOf("fetchLatestBlock");
    expect(look).toBeGreaterThan(calls.indexOf("fetchTxInfo"));
    expect(calls.indexOf("fetchAddressUTxOs")).toBeGreaterThan(look);
  });

  it("old bytes that arrive late, after the new step landed: refused", async () => {
    const { emulator, old, bytes } = await stuck();
    const next = await old.replan({ id: "order:2" });
    expect(names(next)).toEqual(["b", "c"]);
    await next.run();
    expect(next.status).toBe("final");
    expect(await refused(emulator, bytes.b)).toBe(true);
    expect(await refused(emulator, bytes.c)).toBe(true);
    paidOnce(emulator);
  });

  it("old bytes that arrive before the new plan sends: it stops and sends nothing; replan of it builds c alone", async () => {
    const { emulator, old, bytes } = await stuck();
    const next = await old.replan({ id: "order:2" });
    await emulator.submitTx(bytes.b);
    const submitter = forwarding(emulator);
    const error = await caught(next.run({ submitter }));
    expect([error.code, reasonOf(error), error.txHash]).toEqual([
      "INVALID_STATE",
      "stopped",
      old.step("b").txHash,
    ]);
    expect(submitter.calls).toEqual([]);
    expect(next.status).toBe("stopping");
    // The way on is a plan in place of this one: b is paid
    expect(Object.keys(next.rest)).toEqual(["c"]);
    const last = await next.replan({ id: "order:3" });
    expect(names(last)).toEqual(["c"]);
    expect(last.toJSON().before!.final).toEqual(["a", "b"]);
    await last.run();
    expect(last.status).toBe("final");
    expect(await refused(emulator, bytes.c)).toBe(true);
    paidOnce(emulator);
  });

  describe("a search that hides a landed step", () => {
    const hidden = async () => {
      const set = new Set<string>();
      const ctx = await stepSetup("scalus", {
        hooks: hiding(set),
        funds: [100n * ADA, 50n * ADA],
      });
      const before = ctx.emulator.fork();
      const old = await ctx.builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      const aHash = old.step("a").txHash;
      set.add(aHash);
      const error = await caught(old.run({ timeoutMs: 300 }));
      expect(error.code).toBe("CONFIRM_TIMEOUT");
      expect(await onChain(ctx.emulator, aHash)).toBe(true);
      advance(ctx.emulator, 700);
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "expired" });
      expect(old.status).toBe("stopped");
      return { ...ctx, set, before, old, aHash };
    };

    it("read fresh, the address shows it: CANNOT_OBSERVE, and nothing marked", async () => {
      const { old, aHash } = await hidden();
      const error = await caught(old.replan({ id: "order:2" }));
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        aHash,
      ]);
      expect(error.retryable).toBe(true);
      expect(old.replacedBy).toBeUndefined();
    });

    it("read from a fork before it: the ledger refuses the new step, and once the search shows the old one the new plan stops", async () => {
      const { emulator, provider, set, before, old, aHash } = await hidden();
      provider.control.hooks.fetchAddressUTxOs = (_forward, address: string) =>
        before.fetchAddressUTxOs(address);
      const next = await old.replan({ id: "order:2" });
      expect(next.step("a").inputs.map(key)).toContain(
        key(old.step("a").inputs[0]!),
      );
      const error = await caught(next.run());
      expect([error.code, error.step]).toEqual(["REJECTED", "a"]);
      set.delete(aHash);
      await next.refresh();
      expect(next.toJSON().before!.open[0]!.seen).toBeDefined();
      expect(next.status).toBe("stopping");
      await old.refresh();
      expect(old.status).toBe("final");
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("the limit of going by time: with its change and its payment spent since, the new plan pays a second time", async () => {
      const { emulator, old, aHash } = await hidden();
      const change = old.step("a").change[0]!;
      emulator.removeUtxos([ref(change)]);
      // Its payment is still at the recipient's address
      const shown = await caught(old.replan({ id: "order:2" }));
      expect([shown.code, reasonOf(shown), shown.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        aHash,
      ]);
      expect(old.replacedBy).toBeUndefined();
      // That spent too: nothing the provider shows tells that it landed
      const payment = old.step("a").outputs.find((o) => o.address === alice)!;
      emulator.removeUtxos([ref(payment)]);
      const { events, trace } = tracer();
      const next = await old.replan({ id: "order:2", trace });
      expect(events).toContainEqual(noSharedInput("a", aHash));
      await next.run();
      expect(next.status).toBe("final");
      // The limit, as it stands: both transactions paid the recipient
      expect(await onChain(emulator, aHash)).toBe(true);
      expect(await onChain(emulator, next.step("a").txHash)).toBe(true);
      expect(
        [old.step("a"), next.step("a")].map(
          (step) =>
            step.outputs.filter(
              (o) => o.address === alice && o.value.lovelace === 11n * ADA,
            ).length,
        ),
      ).toEqual([1, 1]);
    });
  });

  it("waits where no input is left: STILL_LIVE, then by time with NO_SHARED_INPUT", async () => {
    const { emulator, builder, wallet, address } = await stepSetup("scalus", {
      funds: [100n * ADA],
    });
    const old = await builder.plan(
      { main: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const mainHash = old.step("main").txHash;
    // Another transaction of the wallet spent its only input
    emulator.removeUtxos(old.step("main").inputs.map(ref));
    emulator.fund(address, { lovelace: 50n * ADA });
    const error = await caught(old.run());
    expect([error.code, error.step]).toEqual(["REJECTED", "main"]);

    const still = await caught(old.replan({ id: "order:2" }));
    expect(still.code).toBe("STILL_LIVE");
    expect(still.details).toEqual({
      txHashes: [mainHash],
      safeAfter: old.step("main").validity!.until! + FAST.expiryMarginMs,
    });
    expect(still.retryable).toBe(true);
    expect(still.retryAfterMs).toBeGreaterThan(0);
    expect(old.replacedBy).toBeUndefined();

    advance(emulator, 700);
    const { events, trace } = tracer();
    const next = await old.replan({ id: "order:2", trace });
    expect(events).toContainEqual(noSharedInput("main", mainHash));
    expect(statuses(old)).toEqual({ main: "expired" });
    await next.run();
    expect(next.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
  });

  describe("a rollback", () => {
    const deep = { builder: { planDefaults: { ...FAST, confirmations: 3 } } };

    it("waits while a step is in a block and not final; a fork where the old step lands stops the new plan", async () => {
      const { emulator, provider, builder, wallet } = await stepSetup(
        "scalus",
        {
          ...deep,
          funds: [100n * ADA, 50n * ADA],
        },
      );
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.sign();
      const bBytes = old.step("b").signedTx!;
      await old.run({ waitFor: "sent" });
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "included", b: "signed" });
      const early = await caught(old.replan({ id: "order:2" }));
      expect([early.code, reasonOf(early), early.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        old.step("a").txHash,
      ]);
      expect(old.replacedBy).toBeUndefined();

      advance(emulator, 3);
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["b"]);
      const fork = emulator.fork();
      await next.run({ waitFor: "sent" });
      await next.refresh();
      expect(statuses(next)).toEqual({ b: "included" });
      // The chain is a fork where the old b landed
      await fork.submitTx(bBytes);
      fork.advanceTo({ slot: emulator.slot + 1 });
      provider.control.target = fork;
      await next.refresh();
      const error = await caught(next.run());
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "INVALID_STATE",
        "stopped",
        old.step("b").txHash,
      ]);
      expect(times(fork, bob, 12n * ADA)).toBe(1);
      expect(times(fork, alice, 11n * ADA)).toBe(1);
    });

    const goneWithTheFork = async () => {
      const ctx = await stepSetup("scalus", {
        ...deep,
        funds: [100n * ADA, 50n * ADA],
      });
      const fork = ctx.emulator.fork();
      const old = await ctx.builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      await old.run({ waitFor: "sent" });
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "included" });
      ctx.provider.control.target = fork;
      fork.advanceTo({ slot: ctx.emulator.slot + 700 });
      // Out of the block, then expired by a look that searches the source of its input
      await old.refresh();
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "expired" });
      expect(old.step("a").seen).toBeDefined();
      return { ...ctx, fork, old };
    };

    it("a step found in a block and gone with the fork: the new step spends its input, and the entry kept of it has no end", async () => {
      const { fork, old } = await goneWithTheFork();
      const next = await old.replan({ id: "order:2" });
      expect(next.step("a").inputs.map(key)).toContain(
        key(old.step("a").inputs[0]!),
      );
      expect(next.toJSON().before!.open).toEqual([
        {
          step: "a",
          txHash: old.step("a").txHash,
          spends: old.step("a").inputs.map(key),
        },
      ]);
      await next.run();
      expect(times(fork, alice, 11n * ADA)).toBe(1);
    });

    it("a step found in a block and gone, its input spent there by another transaction: STILL_LIVE with no safeAfter", async () => {
      const { fork, old } = await goneWithTheFork();
      fork.removeUtxos(old.step("a").inputs.map(ref));
      const error = await caught(old.replan({ id: "order:2" }));
      expect(error.code).toBe("STILL_LIVE");
      expect(error.details).toEqual({ txHashes: [old.step("a").txHash] });
      expect(error.retryable).toBe(false);
      expect(old.replacedBy).toBeUndefined();
    });
  });

  it("several stuck steps: one root, one guard; the old ones are refused once the new plan is final", async () => {
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      funds: [100n * ADA, 100n * ADA],
    });
    const old = await builder.plan(
      {
        a: payTo(alice, 11n * ADA),
        b: payTo(bob, 12n * ADA),
        c: payTo(carol, 13n * ADA),
        d: payTo(dave, 14n * ADA),
      },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const relay = relayOf(emulator, () => true);
    await old.run({ waitFor: "sent", submitter: relay });
    const bytes = [
      relay.kept[0]!,
      ...["b", "c", "d"].map((name) => old.step(name).signedTx!),
    ];
    advance(emulator, 1);
    // The guard goes in whatever the selection may take
    const ofA = new Set(old.step("a").inputs.map(key));
    const next = await old.replan({
      id: "order:2",
      canSelect: (utxo) => !ofA.has(key(utxo)),
    });
    expect(next.step("a").txHash).not.toBe(old.step("a").txHash);
    expect(next.step("a").inputs.some((i) => ofA.has(key(i)))).toBe(true);
    for (const name of ["b", "c", "d"])
      expect(next.step(name).inputs.some((i) => ofA.has(key(i)))).toBe(false);
    await next.run();
    expect(next.status).toBe("final");
    for (const tx of bytes) expect(await refused(emulator, tx)).toBe(true);
    for (const [address, lovelace] of [
      [alice, 11n],
      [bob, 12n],
      [carol, 13n],
      [dave, 14n],
    ] as const)
      expect(times(emulator, address, lovelace * ADA)).toBe(1);
  });

  describe("two payers", () => {
    const twoPayers = async (hidden?: Set<string>) => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA],
        ...(hidden !== undefined && { hooks: hiding(hidden) }),
      });
      const treasury = await treasuryOf(ctx.emulator);
      const fork = ctx.emulator.fork();
      const old = await ctx.builder.plan(
        {
          a: payTo(alice, 11n * ADA),
          b: { parts: payTo(bob, 12n * ADA), payer: treasury.other },
        },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign({ signers: [ctx.wallet, treasury.other] });
      const relay = relayOf(ctx.emulator, () => true);
      await old.run({ waitFor: "sent", submitter: relay });
      expect(statuses(old)).toEqual({ a: "sent", b: "signed" });
      advance(ctx.emulator, 1);
      return { ...ctx, treasury, fork, old, relay };
    };

    it("both held: STILL_LIVE with both; past both ends, each new step spends an input of its own payer's old one", async () => {
      const { emulator, wallet, address, treasury, old } = await twoPayers();
      const still = await caught(old.replan({ id: "order:2" }));
      expect(still.code).toBe("STILL_LIVE");
      expect([...still.details.txHashes].sort()).toEqual(
        [old.step("a").txHash, old.step("b").txHash].sort(),
      );
      expect(old.replacedBy).toBeUndefined();

      advance(emulator, 700);
      const { events, trace } = tracer();
      const next = await old.replan({ id: "order:2", trace });
      expect(events).toEqual(
        expect.arrayContaining([
          noSharedInput("a", old.step("a").txHash),
          noSharedInput("b", old.step("b").txHash),
        ]),
      );
      const inputs = (name: string) => old.step(name).inputs.map(key);
      expect(
        next.step("a").inputs.some((i) => inputs("a").includes(key(i))),
      ).toBe(true);
      expect(
        next.step("b").inputs.some((i) => inputs("b").includes(key(i))),
      ).toBe(true);
      expect(next.step("a").change.every((o) => o.address === address)).toBe(
        true,
      );
      expect(
        next.step("b").change.every((o) => o.address === treasury.address),
      ).toBe(true);
      await next.run({ signers: [wallet, treasury.other] });
      expect(next.status).toBe("final");
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
    });

    it("b landed and hidden, the treasury read from a fork: the ledger refuses the new b", async () => {
      const hidden = new Set<string>();
      const { emulator, provider, wallet, treasury, fork, old } =
        await twoPayers(hidden);
      const bHash = old.step("b").txHash;
      hidden.add(bHash);
      await emulator.submitTx(old.step("b").signedTx!);
      advance(emulator, 700);
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "expired", b: "expired" });
      provider.control.hooks.fetchAddressUTxOs = (_forward, address: string) =>
        fork.fetchAddressUTxOs(address);
      const next = await old.replan({ id: "order:2" });
      const error = await caught(
        next.run({ signers: [wallet, treasury.other] }),
      );
      expect([error.code, error.step]).toEqual(["REJECTED", "b"]);
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });
  });

  it("a halted plan whose step came back: the new step spends the change of the step it came back on", async () => {
    const hidden = new Set<string>();
    const { emulator, builder, wallet } = await stepSetup("scalus", {
      hooks: hiding(hidden),
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
      funds: [100n * ADA, 50n * ADA],
    });
    const soon = builder.timeAt(emulator.slot) + 60_000;
    const old = await builder.plan(
      {
        a: [payTo(alice, 11n * ADA), validity({ until: soon })],
        b: payTo(bob, 12n * ADA),
      },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const aHash = old.step("a").txHash;
    const bHash = old.step("b").txHash;
    await old.run({ waitFor: "sent" });
    await old.refresh();
    expect(statuses(old)).toEqual({ a: "included", b: "signed" });
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await old.run({ waitFor: "sent", submitter: relay });
    // a is hidden past its end and the margin: the plan comes to stopped
    hidden.add(aHash);
    advance(emulator, 100);
    // Out of the block, then expired by a look that searches the source of its input
    await old.refresh();
    await old.refresh();
    expect(statuses(old)).toEqual({ a: "expired", b: "orphaned" });
    expect(old.status).toBe("stopped");
    // a is shown again: final, b sent, the plan stopping
    hidden.delete(aHash);
    await old.refresh();
    expect(statuses(old)).toEqual({ a: "final", b: "sent" });
    expect(old.status).toBe("stopping");

    const next = await old.replan({ id: "order:2" });
    expect(next.step("b").inputs.map(key)).toContain(
      key(old.step("a").change[0]!),
    );
    // The held b is let go first: it lands, and the new plan stops
    await emulator.submitTx(relay.kept[0]!);
    const error = await caught(next.run());
    expect([error.code, error.txHash]).toEqual(["INVALID_STATE", bHash]);
    expect(await onChain(emulator, next.step("b").txHash)).toBe(false);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  });

  describe("a step given built that never expires", () => {
    const withFund = async () => {
      const ctx = await stepSetup("scalus", { funds: [100n * ADA] });
      const treasury = await treasuryOf(ctx.emulator);
      const fund = await ctx.builder.build(payTo(ctx.address, 20n * ADA, "f"), {
        payer: treasury.other,
      });
      expect(fund.validity?.until).toBeUndefined();
      const old = await ctx.builder.plan(
        {
          fund,
          payout: [
            spend.pubKey({ utxo: { step: "fund", output: "f" } }),
            payTo(alice, 11n * ADA),
          ],
        },
        { id: "order", payer: ctx.wallet },
      );
      expect(old.step("payout").standsOn).toEqual(["fund"]);
      return { ...ctx, fund, old };
    };

    it("replan() holds it byte for byte", async () => {
      const { old } = await withFund();
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["fund", "payout"]);
      expect(next.step("fund").txHash).toBe(old.step("fund").txHash);
      // Built on the same output of it, at the same tip, the payout is the old one byte for
      // byte too: the same transaction, and no second one
      expect(next.step("payout").txHash).toBe(old.step("payout").txHash);
      expect(next.toJSON().before!.open).toEqual([]);
    });

    it("steps without it: STILL_LIVE with no safeAfter, not retryable", async () => {
      const { old } = await withFund();
      const error = await caught(
        old.replan({
          id: "order:2",
          steps: { payout: payTo(alice, 11n * ADA) },
        }),
      );
      expect(error.code).toBe("STILL_LIVE");
      expect(error.details.txHashes).toContain(old.step("fund").txHash);
      expect(error.details.safeAfter).toBeUndefined();
      expect(error.retryable).toBe(false);
      expect(old.replacedBy).toBeUndefined();
    });

    it("steps that spend an input of it: built", async () => {
      const { old } = await withFund();
      const input = old.step("fund").inputs[0]!;
      const next = await old.replan({
        id: "order:2",
        steps: {
          payout: [spend.pubKey({ utxo: input }), payTo(alice, 11n * ADA)],
        },
      });
      expect(names(next)).toEqual(["payout"]);
      expect(next.step("payout").inputs.map(key)).toContain(key(input));
    });
  });

  describe("stands only on what is final", () => {
    const given = 7_777_777n;

    const withFinal = async () => {
      const ctx = await stepSetup("scalus", { funds: [100n * ADA, 50n * ADA] });
      const old = await ctx.builder.plan(
        { a: payTo(ctx.address, 11n * ADA, "x"), b: payTo(bob, 12n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign();
      const bHash = old.step("b").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({ a: "final", b: "sent" });
      return { ...ctx, old };
    };

    it("refuses a final name, a link to a step neither given nor final, an open transaction in after, and an id it cannot take", async () => {
      const { old } = await withFinal();
      const refusals = [
        await caught(
          old.replan({ id: "order:2", steps: { a: payTo(bob, given) } }),
        ),
        await caught(
          old.replan({
            id: "order:2",
            steps: {
              b: [
                spend.pubKey({ utxo: { step: "z", output: 0 } }),
                payTo(bob, given),
              ],
            },
          }),
        ),
        await caught(old.replan({ id: "order:2", after: old })),
        await caught(old.replan({ id: 7 as unknown as string })),
        await caught(old.replan({ id: "order" })),
      ];
      expect(
        refusals.map((error) => [error.code, error.details?.option]),
      ).toEqual([
        ["INVALID_OPTION", "steps"],
        ["INVALID_OPTION", "steps"],
        ["INVALID_OPTION", "after"],
        ["INVALID_OPTION", "id"],
        ["INVALID_OPTION", "id"],
      ]);
      const missing = await caught(old.replan({} as unknown as { id: string }));
      expect(missing.code).toBe("MISSING_ID");
      for (const error of [...refusals, missing]) {
        expect(error.message).not.toContain(String(given));
        expect(JSON.stringify(error.details ?? {})).not.toContain(
          String(given),
        );
      }
      expect(old.replacedBy).toBeUndefined();
    });

    it("fills a link to a final step: rest of the new plan gives the output itself", async () => {
      const { emulator, old } = await withFinal();
      const x = old.step("a").outputs.find((o) => o.label === "x")!;
      const next = await old.replan({
        id: "order:2",
        steps: {
          b: [
            spend.pubKey({ utxo: { step: "a", output: "x" } }),
            payTo(bob, 12n * ADA),
          ],
        },
      });
      expect(next.step("b").inputs.map(key)).toContain(key(x));
      const parts = next.rest.b as readonly {
        kind: string;
        input?: { transaction_id: string; index: number };
        link?: unknown;
      }[];
      // The output in place of the link; the input shared with the old b is no part given
      expect(parts.map((part) => part.kind)).toEqual(["spend", "output"]);
      expect(parts[0]!.link).toBeUndefined();
      expect(parts[0]!.input).toEqual({
        transaction_id: x.txHash,
        index: x.outputIndex,
      });
      await next.run();
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
    });
  });

  it("add keeps the rule: a step of another payer is STILL_LIVE, a step of its own payer is added", async () => {
    const { emulator, old } = await stuck();
    const treasury = await treasuryOf(emulator);
    const next = await old.replan({ id: "order:2" });
    const error = await caught(
      next.add({ x: { parts: payTo(dave, 14n * ADA), payer: treasury.other } }),
    );
    expect(error.code).toBe("STILL_LIVE");
    expect([...error.details.txHashes].sort()).toEqual(
      [old.step("b").txHash, old.step("c").txHash].sort(),
    );
    expect(names(next)).toEqual(["b", "c"]);
    await next.add({ y: payTo(dave, 14n * ADA) });
    expect(names(next)).toEqual(["b", "c", "y"]);
    await next.run();
    expect(next.status).toBe("final");
    paidOnce(emulator);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
  });

  describe("a step whose script failed", () => {
    const failing = async () => {
      const ctx = await stepSetup("scalus", {
        builder: { planDefaults: { ...FAST, confirmations: 3 } },
        funds: [100n * ADA, 50n * ADA],
      });
      const { emulator, provider, builder, wallet } = ctx;
      const locked = emulator.fund(builder.scriptAddress(plutus), {
        lovelace: 10n * ADA,
      });
      const s = [
        spend.plutus({
          utxo: locked,
          script: plutus,
          redeemer: { data: mConStr0([]) },
        }),
        payTo(bob, 12n * ADA),
      ];
      const old = await builder.plan(
        { s, t: payTo(carol, 13n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.run({ waitFor: "sent", submitter: swallowing() });
      // The provider shows s in a block with is_valid = false; it never reached the chain
      const sHash = old.step("s").txHash;
      const at = emulator.slot;
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
        hash === sHash
          ? {
              hash: sHash,
              slot: at,
              block: "b".repeat(64),
              blockHeight: at,
              validContract: false,
            }
          : forward(hash);
      await old.refresh();
      expect(statuses(old)).toEqual({ s: "failed", t: "orphaned" });
      return { ...ctx, locked, s, old, sHash };
    };

    it("less deep than final: CANNOT_OBSERVE; at that depth replan() leaves it out", async () => {
      const { emulator, old, sHash } = await failing();
      const early = await caught(old.replan({ id: "order:2" }));
      expect([early.code, reasonOf(early), early.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        sHash,
      ]);
      advance(emulator, 3);
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["t"]);
      expect(next.toJSON().before!.open).toEqual([]);
      await next.run();
      expect(times(emulator, carol, 13n * ADA)).toBe(1);
      expect(times(emulator, bob, 12n * ADA)).toBe(0);
    });

    it("given again in steps it is built, also when its inputs were spent since; one of its outputs in a payer's read: CANNOT_OBSERVE", async () => {
      const { emulator, provider, address, locked, s, old, sHash } =
        await failing();
      advance(emulator, 3);
      // A read that lists an output of it: the search and the address differ
      const output = old.step("s").outputs.find((o) => o.address === address)!;
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        at: string,
      ) => {
        const utxos = await forward(at);
        return at === address ? [...utxos, asMesh(output)] : utxos;
      };
      const shown = await caught(
        old.replan({ id: "order:2", steps: { s, t: payTo(carol, 13n * ADA) } }),
      );
      expect([shown.code, reasonOf(shown), shown.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        sHash,
      ]);
      expect(old.replacedBy).toBeUndefined();
      delete provider.control.hooks.fetchAddressUTxOs;
      emulator.removeUtxos([ref(locked.input)]);
      const next = await old.replan({
        id: "order:2",
        steps: { s, t: payTo(carol, 13n * ADA) },
      });
      expect(names(next)).toEqual(["s", "t"]);
      expect(next.step("s").inputs.map(key)).toContain(key(locked.input));
    });
  });

  describe("consolidation steps in the old and in the new plan", () => {
    const LONG = 120_000;

    /** A plan stuck at its second consolidation step, held by a relay; the plan in its place */
    const stuckAtConsolidation = async () => {
      const ctx = await fragmented(coins(250, 2n * ADA), { maxTxSize: 4096 });
      const old = await ctx.builder.plan(payValue({ lovelace: 480n * ADA }), {
        id: "order",
        payer: ctx.wallet,
      });
      expect(names(old)).toEqual(["consolidate-1", "consolidate-2", "main"]);
      await old.sign();
      const second = old.step("consolidate-2").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === second);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({
        "consolidate-1": "final",
        "consolidate-2": "sent",
        main: "signed",
      });
      advance(ctx.emulator, 1);
      const next = await old.replan({ id: "order:2" });
      // The new main spends an input of the old consolidation step; its own consolidation
      // steps come before it
      const ofSecond = new Set(old.step("consolidate-2").inputs.map(key));
      expect(
        next.step("main").inputs.some((input) => ofSecond.has(key(input))),
      ).toBe(true);
      const own = next.steps.filter((step) => step.kind === "consolidation");
      expect(own.length).toBeGreaterThan(0);
      expect(names(next)).toEqual([...own.map((step) => step.name), "main"]);
      return {
        ...ctx,
        old,
        next,
        own,
        held: relay.kept[0]!,
        oldMain: old.step("main").signedTx!,
      };
    };

    it(
      "released before the new plan sends: it stops and sends nothing, and the old main pays",
      async () => {
        const { emulator, old, next, held, oldMain } =
          await stuckAtConsolidation();
        await emulator.submitTx(held);
        const submitter = forwarding(emulator);
        const error = await caught(next.run({ submitter }));
        expect([error.code, error.txHash]).toEqual([
          "INVALID_STATE",
          old.step("consolidate-2").txHash,
        ]);
        expect(submitter.calls).toEqual([]);
        await emulator.submitTx(oldMain);
        expect(times(emulator, recipient, 480n * ADA)).toBe(1);
      },
      LONG,
    );

    it(
      "released once the new consolidation steps landed, or once the new plan is final: refused, and the old main too",
      async () => {
        const { emulator, old, next, own, held, oldMain } =
          await stuckAtConsolidation();
        for (const _ of own) await next.run({ waitFor: "sent" });
        await next.refresh();
        for (const step of own)
          expect(next.step(step.name).status).toBe("final");
        expect(next.step("main").status).toBe("built");
        // The new consolidation steps select from what the payer holds, inputs of the old one
        // among them: the old one cannot land beside them
        const ofSecond = new Set(old.step("consolidate-2").inputs.map(key));
        expect(
          own.some((step) => step.inputs.some((i) => ofSecond.has(key(i)))),
        ).toBe(true);
        expect(await refused(emulator, held)).toBe(true);
        await next.run();
        expect(next.status).toBe("final");
        expect(await refused(emulator, held)).toBe(true);
        expect(await refused(emulator, oldMain)).toBe(true);
        expect(times(emulator, recipient, 480n * ADA)).toBe(1);
      },
      LONG,
    );
  });

  it("the old plan after the mark: it signs, takes witnesses, adds and runs no more; the same call returns the new plan and reads no payer; a run of a second object sends nothing after", async () => {
    const { emulator, provider, builder, wallet, store, instance } =
      await storeSetup({ funds: [100n * ADA, 50n * ADA] });
    const old = await builder.plan(
      {
        a: payTo(alice, 11n * ADA),
        b: payTo(bob, 12n * ADA),
        c: payTo(carol, 13n * ADA),
      },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    advance(emulator, 1);

    // A second object waits for b, sending its bytes again, when the mark is written
    const other = await instance().builder.resume("order", { payer: wallet });
    const second = relayOf(emulator, (txHash) => txHash === bHash);
    const controller = new AbortController();
    const running = caught(
      other.run({
        submitter: second,
        timeoutMs: 20_000,
        signal: controller.signal,
      }),
    );
    await until(() => second.calls.length > 1);
    const next = await old.replan({ id: "order:2" });
    const sendsOf = async () =>
      (await store.inner.load("order"))!.steps.find(
        (step) => step.name === "b",
      )!.sends;
    const atMark = await sendsOf();
    const error = await running;
    controller.abort();
    expect([error.code, reasonOf(error)]).toEqual(["INVALID_STATE", "stopped"]);
    // No delivery is recorded after the mark, and every byte string sent was a recorded one
    expect((await store.inner.load("order"))!.replacedBy).toBe("order:2");
    expect(await sendsOf()).toBe(atMark);
    const ofB = async (calls: readonly string[]) =>
      (await Promise.all(calls.map(hashOf))).filter((h: string) => h === bHash)
        .length;
    expect(atMark).toBeGreaterThanOrEqual(
      (await ofB(relay.calls)) + (await ofB(second.calls)),
    );

    for (const call of [
      () => old.sign(),
      () => old.addWitnesses("00"),
      () => old.add({ y: payTo(dave, 2n * ADA) }),
      () => old.run(),
    ]) {
      const refusal = await caught(call());
      expect([refusal.code, reasonOf(refusal)]).toEqual([
        "INVALID_STATE",
        "stopped",
      ]);
    }
    const reads = provider.control.count("fetchAddressUTxOs", "fetchTxInfo");
    const again = await old.replan({ id: "order:2" });
    expect(provider.control.count("fetchAddressUTxOs", "fetchTxInfo")).toBe(
      reads,
    );
    expect(again.steps.map((step) => step.txHash)).toEqual(
      next.steps.map((step) => step.txHash),
    );
    await again.run();
    expect(again.status).toBe("final");
    paidOnce(emulator);
  });

  describe("the same call again", () => {
    it("without a store, on a plan whose only step is dead: returns the plan this object made, and rest is empty", async () => {
      const { emulator, builder, wallet, address } = await stepSetup("scalus", {
        funds: [100n * ADA],
      });
      const old = await builder.plan(
        { main: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.sign();
      emulator.removeUtxos(old.step("main").inputs.map(ref));
      emulator.fund(address, { lovelace: 50n * ADA });
      expect((await caught(old.run())).code).toBe("REJECTED");
      advance(emulator, 700);
      const first = await old.replan({ id: "order:2" });
      await first.run();
      expect(first.status).toBe("final");
      // A reconciliation run again on the same object: nothing is left, and the call made again
      // returns the same plan
      await old.refresh();
      expect(old.rest).toEqual({});
      expect(await old.replan({ id: "order:2" })).toBe(first);
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("without a store, after the plan made in its place is final and the old steps are past their end: the same plan", async () => {
      const { emulator, old } = await stuck();
      const first = await old.replan({ id: "order:2" });
      await first.run();
      expect(first.status).toBe("final");
      expect(await old.replan({ id: "order:2" })).toBe(first);
      advance(emulator, 700);
      await old.refresh();
      expect(await old.replan({ id: "order:2" })).toBe(first);
      paidOnce(emulator);
    });

    it("without a store, an object resumed from a JSON saved after the mark: INVALID_STATE, naming the plan made in its place", async () => {
      const { builder, old } = await stuck();
      await old.replan({ id: "order:2" });
      const copy = await builder.resume(old.toJSON());
      const error = await caught(copy.replan({ id: "order:2" }));
      expect([error.code, reasonOf(error)]).toEqual([
        "INVALID_STATE",
        "stopped",
      ]);
      expect(error.message).toContain('"order:2"');
      expect(copy.rest).toEqual({});
    });

    it("with a store, on a marked plan that came to final since: the recorded plan", async () => {
      const { emulator, builder, wallet } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.sign();
      const bHash = old.step("b").txHash;
      const relay = relayOf(emulator, (txHash) => txHash === bHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      advance(emulator, 1);
      const next = await old.replan({ id: "order:2" });
      await emulator.submitTx(relay.kept[0]!);
      await old.refresh();
      expect(old.status).toBe("final");
      const again = await old.replan({ id: "order:2" });
      expect(again.steps.map((step) => step.txHash)).toEqual(
        next.steps.map((step) => step.txHash),
      );
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
    });
  });
});
