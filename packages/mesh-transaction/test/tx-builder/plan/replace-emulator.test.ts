import * as vm from "node:vm";

import type { TxEmulator } from "@meshsdk/tx-emulator";
import { CachedFetcher, ProviderError } from "@meshsdk/common";
import { deserializeAddress, mConStr0 } from "@meshsdk/core";

import type { BuildEvent, TxPlan } from "../../../src/tx-builder";
import { guard, output, spend, validity } from "../../../src/tx-builder";
import { NOT_UNPAID } from "../../../src/tx-builder/errors";
import { encodePlan, readPlan } from "../../../src/tx-builder/plan/json";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import { asMesh, ref } from "../utxo-util";
import { coins, fragmented, pay as payValue } from "./consolidate-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  forwarding,
  hashOf,
  reasonOf,
  recipient,
  submitterOf,
  swallowing,
  walletOf,
  wrap,
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
// before it in a block. No test but those that state a limit (going by time, a payment given
// under a new name) ends with a recipient paid twice, and each says so.

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

/**
 * A search that answers "not found" for the hashes in `hidden`, and fails, saying nothing, for
 * those in `failing`
 */
const hiding = (hidden: Set<string>, failing = new Set<string>()) => ({
  fetchTxInfo: (forward: (hash: string) => unknown, hash: string) => {
    if (hidden.has(hash.toLowerCase()))
      throw new ProviderError("not found", {
        kind: "notFound",
        status: 404,
        retryable: false,
      });
    if (failing.has(hash.toLowerCase())) throw tooMany();
    return forward(hash);
  },
});

/** A failure of a provider that says nothing of what was asked */
const tooMany = () =>
  new ProviderError("too many requests", {
    kind: "rateLimited",
    status: 429,
    retryable: true,
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

    it("a fork where the old step lands stops the new plan", async () => {
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
      // Once a is final, the new plan builds b alone
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
          outputs: old.step("a").outputs.length,
          pays: [...new Set(old.step("a").outputs.map((o) => o.address))],
          seenBefore: old.step("a").seen,
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

    it("replan() gives it again as the plan's own: a link by label to it works in the new plan", async () => {
      const { emulator, old } = await withFund();
      advance(emulator, 1);
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["fund", "payout"]);
      // Built anew at a later tip, on the output labelled f of the same transaction
      expect(next.step("payout").txHash).not.toBe(old.step("payout").txHash);
      const f = next.step("fund").outputs.find((o) => o.label === "f")!;
      expect(next.step("payout").inputs.map(key)).toContain(key(f));
      expect(next.step("payout").standsOn).toEqual(["fund"]);
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

    it("less deep than final: CANNOT_OBSERVE; at that depth replan() without steps refuses the plan and marks nothing; given steps, it builds them", async () => {
      const { emulator, old, sHash } = await failing();
      const early = await caught(old.replan({ id: "order:2" }));
      expect([early.code, reasonOf(early), early.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        sHash,
      ]);
      advance(emulator, 3);
      // The steps left would pay carol and close the order with bob never paid
      const failed = await caught(old.replan({ id: "order:2" }));
      expect([failed.code, failed.details.option]).toEqual([
        "INVALID_OPTION",
        "steps",
      ]);
      expect(failed.message).toContain(
        'step "s" failed its script: its parts need fixing; give the steps of the new plan',
      );
      expect(old.replacedBy).toBeUndefined();
      // The application decides what the new plan pays
      const next = await old.replan({
        id: "order:2",
        steps: { t: payTo(carol, 13n * ADA) },
      });
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
    /**
     * @param keepOff A wallet of more coins, and a plan in place whose selection keeps off the
     *   inputs of the old consolidation step
     */
    const stuckAtConsolidation = async (keepOff = false) => {
      const ctx = await fragmented(coins(keepOff ? 500 : 250, 2n * ADA), {
        maxTxSize: 4096,
      });
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
      const ofSecond = new Set(old.step("consolidate-2").inputs.map(key));
      const next = await old.replan({
        id: "order:2",
        ...(keepOff && {
          canSelect: (utxo: { txHash: string; outputIndex: number }) =>
            !ofSecond.has(key(utxo)),
        }),
      });
      // The new main spends an input of the old consolidation step; its own consolidation
      // steps come before it
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
      "released after the new consolidation steps landed, before its main step is sent: the new plan stops, and only its consolidation steps landed",
      async () => {
        const { emulator, old, next, own, held, oldMain } =
          await stuckAtConsolidation(true);
        const ofSecond = new Set(old.step("consolidate-2").inputs.map(key));
        expect(
          own.some((step) => step.inputs.some((i) => ofSecond.has(key(i)))),
        ).toBe(false);
        for (const _ of own) await next.run({ waitFor: "sent" });
        await next.refresh();
        for (const step of own)
          expect(next.step(step.name).status).toBe("final");
        await emulator.submitTx(held);
        const submitter = forwarding(emulator);
        const error = await caught(next.run({ submitter }));
        expect([error.code, error.txHash]).toEqual([
          "INVALID_STATE",
          old.step("consolidate-2").txHash,
        ]);
        expect(submitter.calls).toEqual([]);
        expect(await onChain(emulator, next.step("main").txHash)).toBe(false);
        // The old main may have lost other inputs to the new consolidation steps: it pays once
        // when it lands, and nothing else pays
        const landed = !(await refused(emulator, oldMain));
        expect(times(emulator, recipient, 480n * ADA)).toBe(landed ? 1 : 0);
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

    /** A plan of one payment whose only input was spent elsewhere, past its end */
    const deadMain = async () => {
      const ctx = await stepSetup("scalus", { funds: [100n * ADA] });
      const old = await ctx.builder.plan(
        { main: payTo(alice, 11n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign();
      ctx.emulator.removeUtxos(old.step("main").inputs.map(ref));
      ctx.emulator.fund(ctx.address, { lovelace: 50n * ADA });
      expect((await caught(old.run())).code).toBe("REJECTED");
      return { ...ctx, old };
    };

    /** Holds the second read of the payer's address until `release` */
    const holdSecondRead = (
      provider: Awaited<ReturnType<typeof stepSetup>>["provider"],
      address: string,
    ) => {
      let reads = 0;
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        at: string,
      ) => {
        if (at === address && ++reads === 2) await released;
        return forward(at);
      };
      return { release, reads: () => reads };
    };

    it("without a store, two calls at once on one object: one plan, paid once", async () => {
      const { emulator, provider, address, old } = await deadMain();
      advance(emulator, 700);
      await old.refresh();
      const held = holdSecondRead(provider, address);
      const a = old.replan({ id: "order:2" });
      const b = old.replan({ id: "order:2" });
      const first = await a;
      await first.run();
      expect(first.status).toBe("final");
      held.release();
      expect(await b).toBe(first);
      // The second call waited, and read nothing
      expect(held.reads()).toBe(1);
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("two calls at once: when the first is refused, the second goes on as a first call; with another id, refused", async () => {
      const { emulator, old } = await deadMain();
      // Before the end of main: the first call waits on it, and so does the second
      const [one, two] = await Promise.all([
        caught(old.replan({ id: "order:2" })),
        caught(old.replan({ id: "order:2" })),
      ]);
      expect([one.code, two.code]).toEqual(["STILL_LIVE", "STILL_LIVE"]);
      advance(emulator, 700);
      const first = old.replan({ id: "order:2" });
      const other = caught(old.replan({ id: "order:2b" }));
      expect((await other).code).toBe("INVALID_STATE");
      expect(old.replacedBy).toBe("order:2");
      await (await first).run();
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    /**
     * Holds the first read of the payer's address until `release`, then answers it, or throws
     * `fails` when given
     */
    const holdFirstRead = (
      provider: Awaited<ReturnType<typeof stepSetup>>["provider"],
      address: string,
      fails?: () => Error,
    ) => {
      let reads = 0;
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let reach!: () => void;
      const reached = new Promise<void>((resolve) => (reach = resolve));
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        at: string,
      ) => {
        if (at === address && ++reads === 1) {
          reach();
          await released;
          if (fails !== undefined) throw fails();
        }
        return forward(at);
      };
      return { release, reached };
    };

    /** What a promise gives within `ms`, or "waiting" */
    const within = <T>(promise: Promise<T>, ms: number) =>
      Promise.race([
        promise,
        new Promise<"waiting">((resolve) =>
          setTimeout(() => resolve("waiting"), ms),
        ),
      ]);

    /** Runs `body` and gives the rejections no handler took meanwhile */
    const unhandledIn = async (body: () => Promise<void>) => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => void unhandled.push(reason);
      process.on("unhandledRejection", onUnhandled);
      try {
        await body();
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
      return unhandled;
    };

    it("two calls at once: the first aborted while its payer read hangs ends ABORTED at once, and the second goes on as a first call", async () => {
      const unhandled = await unhandledIn(async () => {
        const { emulator, provider, address, old } = await deadMain();
        advance(emulator, 700);
        await old.refresh();
        const held = holdFirstRead(provider, address);
        const controller = new AbortController();
        const a = caught(
          old.replan({ id: "order:2", signal: controller.signal }),
        );
        await held.reached;
        const b = old.replan({ id: "order:2" });
        controller.abort();
        const first = await within(a, 2_000);
        expect(first === "waiting" ? first : first.code).toBe("ABORTED");
        // The second, with its own read, makes the plan while the first read still hangs
        const second = await within(b, 10_000);
        expect(second).not.toBe("waiting");
        expect(old.replacedBy).toBe("order:2");
        await (second as TxPlan).run();
        // What the hung read answers now is dropped
        held.release();
        expect(times(emulator, alice, 11n * ADA)).toBe(1);
      });
      expect(unhandled).toEqual([]);
    });

    it("two calls at once: when the first fails at its payer read, the second looks for itself and returns its plan", async () => {
      const unhandled = await unhandledIn(async () => {
        const { emulator, provider, address, old } = await deadMain();
        advance(emulator, 700);
        await old.refresh();
        const held = holdFirstRead(provider, address, tooMany);
        const a = caught(old.replan({ id: "order:2" }));
        await held.reached;
        const b = old.replan({ id: "order:2" });
        held.release();
        expect((await a).code).toBe("PROVIDER_FAILED");
        const second = await b;
        expect(old.replacedBy).toBe("order:2");
        await second.run();
        expect(times(emulator, alice, 11n * ADA)).toBe(1);
      });
      expect(unhandled).toEqual([]);
    });

    it("two calls at once: the second's own signal ends its wait, ABORTED at once, while the first goes on", async () => {
      const { emulator, provider, address, old } = await deadMain();
      advance(emulator, 700);
      await old.refresh();
      const held = holdFirstRead(provider, address);
      const a = old.replan({ id: "order:2" });
      await held.reached;
      const controller = new AbortController();
      const b = caught(
        old.replan({ id: "order:2", signal: controller.signal }),
      );
      controller.abort();
      const second = await within(b, 2_000);
      expect(second === "waiting" ? second : second.code).toBe("ABORTED");
      held.release();
      const first = await a;
      expect(old.replacedBy).toBe("order:2");
      expect(await old.replan({ id: "order:2" })).toBe(first);
      await first.run();
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("without a store, a step added to the same object while replan reads its payer: CANNOT_OBSERVE, no mark", async () => {
      const { emulator, provider, address, old } = await stuck();
      let once = true;
      provider.control.hooks.fetchAddressUTxOs = async (
        forward,
        at: string,
      ) => {
        if (once && at === address) {
          once = false;
          await old.add({ x: payTo(dave, 2n * ADA) });
        }
        return forward(at);
      };
      const error = await caught(old.replan({ id: "order:2" }));
      expect([error.code, reasonOf(error)]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
      ]);
      expect(old.replacedBy).toBeUndefined();
      expect(names(old)).toEqual(["a", "b", "c", "x"]);
      expect(times(emulator, dave, 2n * ADA)).toBe(0);
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

  describe("what a provider does not answer", () => {
    /** A step that landed while the search hid it, past its end: expired */
    const hiddenAndExpired = async (failing = new Set<string>()) => {
      const hidden = new Set<string>();
      const ctx = await stepSetup("scalus", {
        hooks: hiding(hidden, failing),
        funds: [100n * ADA, 50n * ADA],
      });
      const old = await ctx.builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      const aHash = old.step("a").txHash;
      hidden.add(aHash);
      await caught(old.run({ timeoutMs: 300 }));
      advance(ctx.emulator, 700);
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "expired" });
      return { ...ctx, hidden, old, aHash };
    };

    it("a search that fails at the look of replan: the step called dead earlier is not dead, and the call waits", async () => {
      const failing = new Set<string>();
      const { emulator, hidden, old, aHash } = await hiddenAndExpired(failing);
      hidden.delete(aHash);
      failing.add(aHash);
      emulator.removeUtxos([ref(old.step("a").change[0]!)]);
      emulator.removeUtxos([
        ref(old.step("a").outputs.find((o) => o.address === alice)!),
      ]);
      // Past its end and the margin, without an answer: no time to wait for, a look to make again
      const error = await caught(old.replan({ id: "order:2" }));
      expect([
        error.code,
        reasonOf(error),
        error.retryable,
        error.retryAfterMs,
      ]).toEqual(["CANNOT_OBSERVE", "unconfirmed", true, FAST.pollMs]);
      expect(old.replacedBy).toBeUndefined();
      expect(times(emulator, alice, 11n * ADA)).toBe(0);
      expect(await onChain(emulator, aHash)).toBe(true);
    });

    it("a read of the address a dead step pays that fails: refused with the read's error", async () => {
      const { emulator, provider, old } = await hiddenAndExpired();
      emulator.removeUtxos([ref(old.step("a").change[0]!)]);
      provider.control.hooks.fetchAddressUTxOs = (forward, address: string) => {
        if (address === alice) throw tooMany();
        return forward(address);
      };
      const error = await caught(old.replan({ id: "order:2" }));
      expect(error.code).toBe("PROVIDER_FAILED");
      expect(error.message).toContain(
        `reading the UTxOs at ${alice}, which a transaction the search does not find pays, failed or gave no list`,
      );
      expect(old.replacedBy).toBeUndefined();
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("two plans on, the payment of a transaction of the plans before at the address a dead step pays: CANNOT_OBSERVE", async () => {
      const hidden = new Set<string>();
      const { emulator, builder, wallet } = await stepSetup("scalus", {
        hooks: hiding(hidden),
        funds: [100n * ADA, 50n * ADA],
      });
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.sign();
      const aHash = old.step("a").txHash;
      const relay = relayOf(emulator, (txHash) => txHash === aHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      advance(emulator, 1);
      const next = await old.replan({ id: "order:2" });
      // The old a lands, and the search hides it from then on
      hidden.add(aHash);
      await emulator.submitTx(relay.kept[0]!);
      expect((await caught(next.run({ timeoutMs: 2_000 }))).code).toBe(
        "REJECTED",
      );
      advance(emulator, 700);
      await next.refresh();
      await next.refresh();
      expect(statuses(next)).toEqual({ a: "expired" });
      emulator.removeUtxos([ref(old.step("a").change[0]!)]);
      const error = await caught(next.replan({ id: "order:3" }));
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        aHash,
      ]);
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("two plans on, the address an old transaction pays, which only it pays, is read: CANNOT_OBSERVE", async () => {
      const hidden = new Set<string>();
      const { emulator, builder, wallet, funded } = await stepSetup("scalus", {
        hooks: hiding(hidden),
        funds: [100n * ADA, 50n * ADA, 40n * ADA],
      });
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      await old.sign();
      const aHash = old.step("a").txHash;
      const ofA = new Set(old.step("a").inputs.map(key));
      const extra = funded.find((u) => !ofA.has(key(u.input)))!;
      const relay = relayOf(emulator, (txHash) => txHash === aHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      advance(emulator, 1);
      // The new a spends the old a's input and one more, and lives long
      const next = await old.replan({
        id: "order:2",
        ttlMs: 3_600_000,
        steps: {
          a: [payTo(alice, 11n * ADA), spend.pubKey({ utxo: extra })],
        },
      });
      expect(next.toJSON().before!.open[0]!.pays).toContain(alice);
      // The old a lands and the search hides it; its change is spent, its payment stays
      hidden.add(aHash);
      await emulator.submitTx(relay.kept[0]!);
      emulator.removeUtxos([ref(old.step("a").change[0]!)]);
      advance(emulator, 700);
      await next.refresh();
      expect(statuses(next)).toEqual({ a: "built" });
      const error = await caught(next.replan({ id: "order:3" }));
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        aHash,
      ]);
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("a read of the address a dead step pays that gives no list: refused as a read that failed", async () => {
      const { emulator, provider, old } = await hiddenAndExpired();
      emulator.removeUtxos([ref(old.step("a").change[0]!)]);
      provider.control.hooks.fetchAddressUTxOs = (forward, address: string) =>
        address === alice ? undefined : forward(address);
      const error = await caught(old.replan({ id: "order:2" }));
      expect(error.code).toBe("PROVIDER_FAILED");
      expect(old.replacedBy).toBeUndefined();
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
    });

    it("tells NO_SHARED_INPUT how many addresses past the 16 were not read", async () => {
      const hidden = new Set<string>();
      const { emulator, builder, wallet } = await stepSetup("scalus", {
        hooks: hiding(hidden),
        funds: [100n * ADA, 50n * ADA],
      });
      const many = Array.from({ length: 17 }, (_, i) => baseAddress(30 + i));
      const old = await builder.plan(
        { a: many.map((address) => payTo(address, 2n * ADA)) },
        { id: "order", payer: wallet },
      );
      const aHash = old.step("a").txHash;
      hidden.add(aHash);
      await caught(old.run({ timeoutMs: 300 }));
      advance(emulator, 700);
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "expired" });
      // Nothing of it is left at any address
      emulator.removeUtxos(old.step("a").outputs.map(ref));
      const { events, trace } = tracer();
      await old.replan({ id: "order:2", trace });
      expect(
        events.filter(
          (event) =>
            event.type === "warning" && event.code === "NO_SHARED_INPUT",
        ),
      ).toEqual([{ ...noSharedInput("a", aHash), unread: 1 }]);
    });

    it("two plans on, an old transaction that pays more than 16 addresses: its entry keeps 16, and NO_SHARED_INPUT counts the rest as unread", async () => {
      const hidden = new Set<string>();
      const { emulator, builder, wallet, funded } = await stepSetup("scalus", {
        hooks: hiding(hidden),
        funds: [100n * ADA, 50n * ADA, 40n * ADA],
      });
      // 16 other addresses first, alice 17th, the change 18th
      const others = Array.from({ length: 16 }, (_, i) => baseAddress(30 + i));
      const parts = [
        ...others.map((address) => payTo(address, 2n * ADA)),
        payTo(alice, 11n * ADA),
      ];
      const old = await builder.plan(
        { a: parts },
        { id: "order", payer: wallet },
      );
      await old.sign();
      const aHash = old.step("a").txHash;
      const ofA = new Set(old.step("a").inputs.map(key));
      const extra = funded.find((u) => !ofA.has(key(u.input)))!;
      const relay = relayOf(emulator, (txHash) => txHash === aHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      advance(emulator, 1);
      const next = await old.replan({
        id: "order:2",
        ttlMs: 3_600_000,
        steps: { a: [...parts, spend.pubKey({ utxo: extra })] },
      });
      const entry = next.toJSON().before!.open[0]!;
      expect(entry.pays).toEqual(others);
      expect(entry.paysMore).toBe(2);
      // The old a lands, hidden by the search; all but alice's payment is spent
      hidden.add(aHash);
      await emulator.submitTx(relay.kept[0]!);
      emulator.removeUtxos(
        old
          .step("a")
          .outputs.filter((output) => output.address !== alice)
          .map(ref),
      );
      advance(emulator, 700);
      await next.refresh();
      expect(statuses(next)).toEqual({ a: "built" });
      const { events, trace } = tracer();
      await next.replan({ id: "order:3", trace });
      expect(
        events.filter(
          (event) =>
            event.type === "warning" && event.code === "NO_SHARED_INPUT",
        ),
      ).toEqual([{ ...noSharedInput("a", aHash), unread: 2 }]);
    });

    it("a provider that does not say whether scripts passed: a plain old step found is kept, and the plan in place of the one it stopped is made", async () => {
      const { emulator, provider, old, bytes } = await stuck();
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
        const { validContract: _, ...info } = (await forward(hash)) as Record<
          string,
          unknown
        >;
        return info;
      };
      const next = await old.replan({ id: "order:2" });
      await emulator.submitTx(bytes.b);
      const stopped = await caught(next.run());
      expect([stopped.code, reasonOf(stopped)]).toEqual([
        "INVALID_STATE",
        "stopped",
      ]);
      const last = await next.replan({ id: "order:3" });
      expect(names(last)).toEqual(["c"]);
      await last.run();
      expect(last.status).toBe("final");
      paidOnce(emulator);
    });
  });

  describe("add on a plan made in place of another", () => {
    /** O: one payment held by a relay; N in its place */
    const heldOne = async (hidden: Set<string>) => {
      const ctx = await stepSetup("scalus", {
        hooks: hiding(hidden),
        funds: [100n * ADA, 50n * ADA],
      });
      const old = await ctx.builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign();
      const aHash = old.step("a").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === aHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      advance(ctx.emulator, 1);
      const next = await old.replan({ id: "order:2" });
      return { ...ctx, old, next, aHash, held: relay.kept[0]! };
    };

    it("a payer's read that lists an output of a transaction of the plans before the search does not find: CANNOT_OBSERVE", async () => {
      const hidden = new Set<string>();
      const { emulator, next, aHash, held } = await heldOne(hidden);
      hidden.add(aHash);
      await emulator.submitTx(held);
      const error = await caught(next.add({ y: payTo(dave, 14n * ADA) }));
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        aHash,
      ]);
      expect(names(next)).toEqual(["a"]);
    });

    it("a step that spends an output of a transaction of the plans before: CANNOT_OBSERVE", async () => {
      const { address, next, aHash } = await heldOne(new Set());
      const error = await caught(
        next.add({
          y: [
            spend.pubKey({
              utxo: {
                txHash: aHash,
                outputIndex: 1,
                address,
                value: { lovelace: 80n * ADA },
              },
            }),
            payTo(dave, 14n * ADA),
          ],
        }),
      );
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        aHash,
      ]);
      expect(names(next)).toEqual(["a"]);
    });

    it("the addresses of the old transactions called dead are read in the order of the line, 16 a call: those of one that passes by time, past them, are counted in the warning's unread", async () => {
      const { emulator, provider, builder, wallet } = await stepSetup(
        "scalus",
        { funds: [100n * ADA, 50n * ADA] },
      );
      const partner = await walletOf(1);
      const own = emulator.fund((await partner.getChangeAddress())!, {
        lovelace: 100n * ADA,
      });
      const d = await builder.build(
        [
          spend.pubKey({ utxo: own }),
          payTo(carol, 13n * ADA),
          validity({ until: builder.timeAt(emulator.slot) + 300_000 }),
        ],
        { payer: partner },
      );
      await d.sign();
      // g pays 17 addresses of its own: its entry keeps 16 of them
      const many = Array.from({ length: 17 }, (_, i) =>
        payTo(baseAddress(40 + i), 1_500_000n),
      );
      const old = await builder.plan(
        { g: many, d },
        { id: "order", payer: wallet },
      );
      await old.sign({ signers: [wallet] });
      const held = new Set([old.step("g").txHash, d.txHash]);
      await caught(
        old.run({
          submitter: relayOf(emulator, (txHash) => held.has(txHash)),
          timeoutMs: 300,
        }),
      );
      advance(emulator, 700);
      await old.refresh();
      expect(statuses(old)).toEqual({ g: "expired", d: "expired" });
      // The wallet's h spends an input of g; d passes by time
      const { events, trace } = tracer();
      const next = await old.replan({
        id: "order:2",
        steps: { h: payTo(bob, 12n * ADA) },
        trace,
      });
      expect(next.toJSON().before!.open.map((entry) => entry.step)).toEqual([
        "g",
        "d",
      ]);
      // The step added stands on h: g is kept apart from it, d is not. The 16 addresses g's entry
      // keeps come first in the line, and d's are left unread
      const read: string[] = [];
      provider.control.hooks.fetchAddressUTxOs = (forward, address: string) => {
        read.push(address);
        return forward(address);
      };
      const told = events.length;
      await next.add({ e: payTo(alice, 11n * ADA) });
      expect(read).toEqual(
        expect.arrayContaining([...next.toJSON().before!.open[0]!.pays!]),
      );
      expect(read).not.toContain(carol);
      expect(
        events
          .slice(told)
          .filter(
            (event) =>
              event.type === "warning" && event.code === "NO_SHARED_INPUT",
          ),
      ).toEqual([{ ...noSharedInput("d", d.txHash.toLowerCase()), unread: 4 }]);
      expect(names(next)).toEqual(["h", "e"]);
    });
  });

  it("tells NO_SHARED_INPUT only by a call that returns its plan", async () => {
    const { emulator, builder, wallet, address, store } = await storeSetup({
      funds: [100n * ADA],
    });
    const old = await builder.plan(
      { main: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.sign();
    const mainHash = old.step("main").txHash;
    emulator.removeUtxos(old.step("main").inputs.map(ref));
    emulator.fund(address, { lovelace: 50n * ADA });
    await caught(old.run());
    advance(emulator, 700);
    // The first record's save fails: the mark is written, the plan is not
    store.hooks.save = async (forward, json, rev) => {
      if (json.id === "order:2") throw new Error("down");
      return forward(json, rev);
    };
    const { events, trace } = tracer();
    const failed = await caught(old.replan({ id: "order:2", trace }));
    const told = () =>
      events.filter(
        (event) => event.type === "warning" && event.code === "NO_SHARED_INPUT",
      );
    expect(failed.code).toBe("STORE_FAILED");
    expect(told()).toEqual([]);
    delete store.hooks.save;
    const next = await old.replan({ id: "order:2", trace });
    expect(told()).toEqual([noSharedInput("main", mainHash)]);
    await next.run();
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
  });

  describe("fixes each of which a test holds", () => {
    it("add on a plan made in place of another judges an old transaction found where no block is known", async () => {
      const { emulator, provider, old } = await stuck();
      const treasury = await treasuryOf(emulator);
      const next = await old.replan({ id: "order:2" });
      // The old b is found, with no slot: neither in a block nor not found
      const bHash = old.step("b").txHash;
      provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
        hash === bHash ? { hash: bHash } : forward(hash);
      const error = await caught(
        next.add({
          x: { parts: payTo(dave, 14n * ADA), payer: treasury.other },
        }),
      );
      expect(error.code).toBe("STILL_LIVE");
      expect(error.details.txHashes).toContain(bHash);
      expect(names(next)).toEqual(["b", "c"]);
    });

    it("a link by position to a kept step given by its bytes; a link to its change, which none marks, refused", async () => {
      const { emulator, builder, wallet, address } = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
      });
      const fund = await builder.build(
        [payTo(address, 20n * ADA, "f"), payTo(address, 15n * ADA, "g")],
        { payer: wallet },
      );
      await fund.sign();
      // Given by its bytes: no output of it is marked change
      const old = await builder.plan(
        { fund: fund.signedTx!, pay: payTo(bob, 12n * ADA) },
        { id: "order", payer: wallet },
      );
      const payHash = old.step("pay").txHash;
      const relay = relayOf(emulator, (txHash) => txHash === payHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({ fund: "final", pay: "sent" });
      advance(emulator, 1);
      const f = old.step("fund").outputs[0]!;
      const g = old.step("fund").outputs[1]!;
      // A link to the change of a kept step given built with none marked would spend nothing
      const changeLink = await caught(
        old.replan({
          id: "order:2",
          steps: {
            pay: [
              spend.pubKey({ utxo: { step: "fund", change: true } }),
              payTo(bob, 12n * ADA),
            ],
          },
        }),
      );
      expect([changeLink.code, changeLink.details?.option]).toEqual([
        "INVALID_OPTION",
        "steps",
      ]);
      const next = await old.replan({
        id: "order:2",
        steps: {
          pay: [
            spend.pubKey({ utxo: { step: "fund", output: 0 } }),
            payTo(bob, 12n * ADA),
          ],
          more: [
            spend.pubKey({ utxo: { step: "fund", output: g.outputIndex } }),
            payTo(carol, 13n * ADA),
          ],
        },
      });
      expect(next.step("pay").inputs.map(key)).toContain(key(f));
      expect(next.step("more").inputs.map(key)).toContain(key(g));
      await next.run();
      expect(next.status).toBe("final");
      expect(await refused(emulator, relay.kept[0]!)).toBe(true);
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
      expect(times(emulator, carol, 13n * ADA)).toBe(1);
    });
  });

  describe("rules each of which a test holds", () => {
    it("refuses a step given that spends an output of an open transaction of the plan", async () => {
      const { old } = await stuck();
      const change = old.step("b").change[0]!;
      const error = await caught(
        old.replan({
          id: "order:2",
          steps: {
            b: payTo(bob, 12n * ADA),
            c: [spend.pubKey({ utxo: change }), payTo(carol, 13n * ADA)],
          },
        }),
      );
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        old.step("b").txHash,
      ]);
      expect(old.replacedBy).toBeUndefined();
    });

    it("a step named __proto__, as JSON.parse and Object.fromEntries give one: builder.plan, add and replan refuse it, and nothing is recorded", async () => {
      const { builder, wallet, store } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
      const named = (entries: [string, unknown][]) =>
        Object.fromEntries(entries) as never;
      const proto = (error: any) => {
        expect([error.code, error.details.option]).toEqual([
          "INVALID_OPTION",
          "steps",
        ]);
        expect(error.message).toContain('the step name "__proto__"');
      };
      const steps = named([
        ["a", payTo(alice, 11n * ADA)],
        ["__proto__", payTo(bob, 12n * ADA)],
        ["c", payTo(carol, 13n * ADA)],
      ]);
      expect(Object.keys(steps)).toEqual(["a", "__proto__", "c"]);
      proto(await caught(builder.plan(steps, { id: "order", payer: wallet })));
      expect(await store.inner.load("order")).toBeUndefined();
      const plan = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      proto(
        await caught(plan.add(named([["__proto__", payTo(bob, 12n * ADA)]]))),
      );
      expect(names(plan)).toEqual(["a"]);
      proto(
        await caught(
          plan.replan({
            id: "order:2",
            steps: named([["__proto__", payTo(bob, 12n * ADA)]]),
          }),
        ),
      );
      expect(await store.inner.load("order:2")).toBeUndefined();
      expect(plan.replacedBy).toBeUndefined();
      // What is left is an object without a prototype: each name is a member of its own
      expect(Object.getPrototypeOf(plan.rest)).toBeNull();
      expect(Object.keys(plan.rest)).toEqual(["a"]);
    });

    /** Steps built by assignment into a plain object, as from the lines of an order */
    const assigned = (entries: [string, unknown][]) => {
      const steps: Record<string, unknown> = {};
      for (const [name, step] of entries) steps[name] = step;
      return steps as never;
    };

    /** INVALID_OPTION (`steps`) for an object of steps whose prototype is another */
    const ownPrototype = (error: any) => {
      expect([error.code, error.details.option, error.details.value]).toEqual([
        "INVALID_OPTION",
        "steps",
        "object",
      ]);
      expect(error.message).toMatch(
        /^invalid steps: the steps are not a plain object \(their prototype is another\): give them as a plain object, or built with Object\.fromEntries/,
      );
    };

    it("a list of parts set as the prototype of the steps, by a member __proto__ of a literal or by assignment: builder.plan refuses the steps, and nothing is recorded", async () => {
      const { builder, wallet, store } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
      const literal = {
        a: payTo(alice, 11n * ADA),
        __proto__: [payTo(bob, 12n * ADA)],
      } as never;
      const byAssignment = assigned([
        ["a", payTo(alice, 11n * ADA)],
        ["__proto__", [payTo(bob, 12n * ADA)]],
      ]);
      for (const steps of [literal, byAssignment]) {
        // No name lists the step of bob
        expect(Object.keys(steps)).toEqual(["a"]);
        ownPrototype(
          await caught(builder.plan(steps, { id: "order", payer: wallet })),
        );
        expect(await store.inner.load("order")).toBeUndefined();
      }
      // An object of another class is refused the same way; one without a prototype is taken
      class Steps {
        a = payTo(alice, 11n * ADA);
      }
      ownPrototype(
        await caught(
          builder.plan(new Steps() as never, { id: "order", payer: wallet }),
        ),
      );
      const bare = Object.assign(Object.create(null), {
        a: payTo(alice, 11n * ADA),
      });
      const plan = await builder.plan(bare, { id: "order", payer: wallet });
      expect(names(plan)).toEqual(["a"]);
    });

    it("one part set as the prototype of the steps, by a member __proto__ of a literal or by assignment: builder.plan refuses the steps and makes no step main, and nothing is recorded", async () => {
      const { builder, wallet, store } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
      const literal = {
        __proto__: payTo(alice, 11n * ADA),
        b: payTo(bob, 12n * ADA),
      } as never;
      const byAssignment = assigned([
        ["__proto__", payTo(alice, 11n * ADA)],
        ["b", payTo(bob, 12n * ADA)],
      ]);
      for (const steps of [literal, byAssignment]) {
        // The kind of the part is inherited, not the object's own
        expect((steps as { kind?: string }).kind).toBe("output");
        ownPrototype(
          await caught(builder.plan(steps, { id: "order", payer: wallet })),
        );
        expect(await store.inner.load("order")).toBeUndefined();
      }
    });

    it("steps that are not a plain object, a Map, an object of a class or of another realm, one part whose kind is inherited: refused, and the message says what is wrong; a frozen object, a Proxy of one and one without a prototype are taken", async () => {
      const { builder, wallet, store } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
      const part = payTo(alice, 11n * ADA);
      class Steps {
        a = part;
      }
      for (const steps of [
        new Map([["a", part]]),
        new Steps(),
        vm.runInNewContext("({ a: part })", { part }),
        vm.runInNewContext("({ ...part })", { part }),
        Object.create(part),
      ]) {
        ownPrototype(
          await caught(
            builder.plan(steps as never, { id: "order", payer: wallet }),
          ),
        );
        expect(await store.inner.load("order")).toBeUndefined();
      }
      // The same part inherited by a step, or in a list, is a part
      const inherited = await builder.plan(
        { a: Object.create(part) as never },
        { id: "named", payer: wallet },
      );
      expect(names(inherited)).toEqual(["a"]);
      const bare = Object.assign(Object.create(null), { a: part });
      for (const [i, steps] of [
        Object.freeze({ a: part }),
        new Proxy({ a: part }, {}),
        bare,
      ].entries()) {
        const plan = await builder.plan(steps, {
          id: `taken-${i}`,
          payer: wallet,
        });
        expect(names(plan)).toEqual(["a"]);
      }
    });

    it("add and replan of steps that set their own prototype: refused, nothing added and nothing written; rest of the plan replaced has no prototype", async () => {
      const { emulator, builder, wallet, store } = await storeSetup({
        funds: [100n * ADA, 50n * ADA],
      });
      const old = await builder.plan(
        { a: payTo(alice, 11n * ADA), b: payTo(bob, 12n * ADA) },
        { id: "order", payer: wallet },
      );
      ownPrototype(
        await caught(
          old.add(
            assigned([
              ["c", payTo(carol, 13n * ADA)],
              ["__proto__", [payTo(carol, 13n * ADA)]],
            ]),
          ),
        ),
      );
      expect(names(old)).toEqual(["a", "b"]);
      expect(
        (await store.inner.load("order"))!.steps.map(
          (step: { name: string }) => step.name,
        ),
      ).toEqual(["a", "b"]);
      await old.sign();
      const held = old.step("b").txHash;
      const relay = relayOf(emulator, (txHash) => txHash === held);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      advance(emulator, 700);
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "final", b: "expired" });
      for (const steps of [
        assigned([
          ["__proto__", payTo(bob, 12n * ADA)],
          ["d", payTo(dave, 14n * ADA)],
        ]),
        assigned([["__proto__", [payTo(bob, 12n * ADA)]]]),
      ]) {
        ownPrototype(await caught(old.replan({ id: "order:2", steps })));
        expect(await store.inner.load("order:2")).toBeUndefined();
        expect(old.replacedBy).toBeUndefined();
      }
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["b"]);
      expect(Object.getPrototypeOf(old.rest)).toBeNull();
      expect(Object.keys(old.rest)).toEqual([]);
      await next.run();
      expect(next.status).toBe("final");
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
    });

    it("a step named kind, given as CBOR hex: builder.plan makes it a step of that name, alone or beside another, and add adds it", async () => {
      const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
      const { emulator, builder, wallet } = ctx;
      // A partner's transaction, built and signed on its own UTxO
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      const own = emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const built = await builderOf(wrap(emulator)).build(
        [
          spend.pubKey({ utxo: own }),
          output({ address: carol, value: { lovelace: 13n * ADA } }),
        ],
        { payer: partner },
      );
      await built.sign();
      const hex = built.partialTx;
      const alone = await builder.plan({ kind: hex } as never, {
        id: "alone",
        payer: wallet,
      });
      expect(names(alone)).toEqual(["kind"]);
      expect(alone.step("kind").txHash).toBe(built.txHash);
      const beside = await builder.plan(
        { a: payTo(alice, 11n * ADA), kind: hex } as never,
        { id: "beside", payer: wallet },
      );
      expect(names(beside)).toEqual(["a", "kind"]);
      expect(beside.step("kind").txHash).toBe(built.txHash);
      const plan = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "base", payer: wallet },
      );
      await plan.add({ kind: hex } as never);
      expect(names(plan)).toEqual(["a", "kind"]);
      expect(plan.step("kind").txHash).toBe(built.txHash);
      // A step of parts whose own kind names a part is still one part: the step main
      const one = await builder.plan(payTo(alice, 11n * ADA), {
        id: "one",
        payer: wallet,
      });
      expect(names(one)).toEqual(["main"]);
    });

    it("steps named tx and txHash, both given as CBOR hex: builder.plan makes them steps of those names, and add adds them; the data of a transaction is still refused", async () => {
      const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
      const { emulator, builder, wallet } = ctx;
      /** A partner's transaction that pays an address, built and signed on its own UTxO */
      const partnerTx = async (index: number, address: string) => {
        const partner = await walletOf(index);
        const own = emulator.fund((await partner.getChangeAddress())!, {
          lovelace: 100n * ADA,
        });
        const built = await builderOf(wrap(emulator)).build(
          [
            spend.pubKey({ utxo: own }),
            output({ address, value: { lovelace: 13n * ADA } }),
          ],
          { payer: partner },
        );
        await built.sign();
        return built;
      };
      const one = await partnerTx(1, carol);
      const other = await partnerTx(2, dave);
      const plan = await builder.plan(
        { tx: one.partialTx, txHash: other.partialTx } as never,
        { id: "order", payer: wallet },
      );
      expect(names(plan)).toEqual(["tx", "txHash"]);
      expect(plan.step("tx").txHash).toBe(one.txHash);
      expect(plan.step("txHash").txHash).toBe(other.txHash);
      const base = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "base", payer: wallet },
      );
      await base.add({ tx: one.partialTx, txHash: other.partialTx } as never);
      expect(names(base)).toEqual(["a", "tx", "txHash"]);
      // The data of a transaction, as a spread of the object gives it, is no steps
      const data = await caught(
        builder.plan({ ...one } as never, { id: "data", payer: wallet }),
      );
      expect([data.code, data.details.option]).toEqual([
        "INVALID_OPTION",
        "steps",
      ]);
      expect(data.message).toContain("expected one list of parts");
    });

    it("the data of a transaction is told by the texts tx and txHash with the lists inputs and outputs, whatever its fee: a copy through JSON with its bigints as text is refused as data, as the steps and as a step, by builder.plan and by add; steps named tx, txHash, fee, inputs and outputs that are no such data are steps", async () => {
      const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
      const { emulator, builder, wallet, store } = ctx;
      /** A partner's transaction that pays carol, built and signed on its own UTxO */
      const partnerTx = async (index: number) => {
        const partner = await walletOf(index);
        const own = emulator.fund((await partner.getChangeAddress())!, {
          lovelace: 100n * ADA,
        });
        const built = await builderOf(wrap(emulator)).build(
          [
            spend.pubKey({ utxo: own }),
            output({ address: carol, value: { lovelace: 13n * ADA } }),
          ],
          { payer: partner },
        );
        await built.sign();
        return built;
      };
      const built = await partnerTx(1);
      const data = { ...built };
      expect(typeof data.fee).toBe("bigint");
      /** Through JSON, its bigints written as text, as an application's own store may keep it */
      const asText = JSON.parse(
        JSON.stringify(data, (_key, value: unknown) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      );
      expect(typeof asText.fee).toBe("string");
      const base = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "base", payer: wallet },
      );
      for (const [i, form] of [data, asText].entries()) {
        const whole = await caught(
          builder.plan(form as never, { id: `whole-${i}`, payer: wallet }),
        );
        expect([whole.code, whole.details.option]).toEqual([
          "INVALID_OPTION",
          "steps",
        ]);
        expect(whole.message).toContain("expected one list of parts");
        const named = await caught(
          builder.plan({ x: form } as never, {
            id: `named-${i}`,
            payer: wallet,
          }),
        );
        expect([named.code, named.details.option]).toEqual([
          "INVALID_OPTION",
          "steps",
        ]);
        expect(named.message).toContain(
          'step "x" is the data or the JSON of a transaction built before',
        );
        const added = await caught(base.add({ x: form } as never));
        expect([added.code, added.details.option]).toEqual([
          "INVALID_OPTION",
          "steps",
        ]);
        expect(added.message).toContain(
          'step "x" is the data or the JSON of a transaction built before',
        );
        expect(await store.inner.load(`whole-${i}`)).toBeUndefined();
        expect(await store.inner.load(`named-${i}`)).toBeUndefined();
      }
      expect(names(base)).toEqual(["a"]);
      // Without the lists, the texts tx and txHash alone are no data
      const bare = await caught(
        builder.plan({ x: { tx: data.tx, txHash: data.txHash } } as never, {
          id: "bare",
          payer: wallet,
        }),
      );
      expect(bare.message).toContain('step "x" is neither parts nor');
      // Steps under the names of the data's members, which are no data, are steps
      const [one, two, three] = [built, await partnerTx(2), await partnerTx(3)];
      const plan = await builder.plan(
        {
          tx: one.partialTx,
          txHash: two.partialTx,
          fee: three.partialTx,
          inputs: payTo(alice, 11n * ADA),
          outputs: payTo(bob, 12n * ADA),
        } as never,
        { id: "named-like-data", payer: wallet },
      );
      expect(names(plan)).toEqual(["tx", "txHash", "fee", "inputs", "outputs"]);
      expect(plan.step("fee").txHash).toBe(three.txHash);
    });

    it("a step given as CBOR hex under the name __proto__: by assignment or in a literal the name sets nothing and no check can see the step; through Object.fromEntries, a spread or Object.create(null) the name is kept and refused", async () => {
      const ctx = await storeSetup({ funds: [100n * ADA, 50n * ADA] });
      const { emulator, builder, wallet, store } = ctx;
      // A partner's transaction, built and signed on its own UTxO
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      const own = emulator.fund(partnerAddress, { lovelace: 100n * ADA });
      const built = await builderOf(wrap(emulator)).build(
        [
          spend.pubKey({ utxo: own }),
          output({ address: carol, value: { lovelace: 13n * ADA } }),
        ],
        { payer: partner },
      );
      await built.sign();
      const hex = built.partialTx;
      // The language sets no prototype that is not an object, and makes no member: the object
      // is a plain one with a alone, and the partner's transaction is not in it
      const literal = { a: payTo(alice, 11n * ADA), __proto__: hex } as never;
      const byAssignment = assigned([
        ["a", payTo(alice, 11n * ADA)],
        ["__proto__", hex],
      ]);
      for (const [i, steps] of [literal, byAssignment].entries()) {
        expect(Object.keys(steps)).toEqual(["a"]);
        expect(Object.getPrototypeOf(steps)).toBe(Object.prototype);
        const plan = await builder.plan(steps, {
          id: `lost-${i}`,
          payer: wallet,
        });
        expect(names(plan)).toEqual(["a"]);
      }
      const plan = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      await plan.add(
        assigned([
          ["b", payTo(bob, 12n * ADA)],
          ["__proto__", hex],
        ]),
      );
      expect(names(plan)).toEqual(["a", "b"]);
      // Built so that every name is kept, the step is refused by its name
      const entries: [string, unknown][] = [
        ["c", payTo(carol, 13n * ADA)],
        ["__proto__", hex],
      ];
      const bare: Record<string, unknown> = Object.create(null);
      for (const [name, step] of entries) bare[name] = step;
      for (const steps of [
        Object.fromEntries(entries),
        { ...Object.fromEntries(entries) },
        bare,
      ]) {
        expect(Object.keys(steps)).toEqual(["c", "__proto__"]);
        for (const error of [
          await caught(
            builder.plan(steps as never, { id: "kept", payer: wallet }),
          ),
          await caught(plan.add(steps as never)),
        ]) {
          expect([error.code, error.details.option]).toEqual([
            "INVALID_OPTION",
            "steps",
          ]);
          expect(error.message).toContain('the step name "__proto__"');
        }
      }
      expect(await store.inner.load("kept")).toBeUndefined();
      expect(names(plan)).toEqual(["a", "b"]);
    });

    it("refuses to replace a final plan, and an empty id", async () => {
      const { builder, wallet } = await stepSetup("scalus", {
        funds: [100n * ADA],
      });
      const plan = await builder.plan(
        { a: payTo(alice, 11n * ADA) },
        { id: "order", payer: wallet },
      );
      const empty = await caught(plan.replan({ id: "" }));
      expect(empty.code).toBe("MISSING_ID");
      await plan.run();
      expect(plan.status).toBe("final");
      const final = await caught(plan.replan({ id: "order:2" }));
      expect([final.code, reasonOf(final)]).toEqual(["INVALID_STATE", "final"]);
    });

    it("searches every transaction of the plans before, also one found in a block: kept, the new plan stands on it", async () => {
      const { emulator, builder, wallet } = await stepSetup("scalus", {
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
      await caught(next.run());
      expect(next.toJSON().before!.open[0]!.seen).toBeDefined();
      // The old b is searched again, found final, and kept: the new b is settled by it
      const last = await next.replan({
        id: "order:3",
        steps: { x: payTo(dave, 14n * ADA) },
      });
      expect(names(last)).toEqual(["x"]);
      expect(last.toJSON().before).toEqual({ final: ["a", "b"], open: [] });
      await last.run();
      expect(times(emulator, bob, 12n * ADA)).toBe(1);
    });

    it("add on a plan made in place of another: what is final of it settles a transaction it excludes", async () => {
      const { emulator, wallet, old } = await stuck();
      const treasury = await treasuryOf(emulator);
      const next = await old.replan({ id: "order:2" });
      // The new b lands: the old b and c can never land
      await next.run({ waitFor: "sent" });
      await next.refresh();
      expect(statuses(next)).toEqual({ b: "final", c: "built" });
      await next.add({
        x: { parts: payTo(dave, 14n * ADA), payer: treasury.other },
      });
      expect(names(next)).toEqual(["b", "c", "x"]);
      await next.run({ signers: [wallet, treasury.other] });
      expect(next.status).toBe("final");
      paidOnce(emulator);
    });
  });
});

/* ---------------------------------------------------------------------------------------------
 * A step in a block and not final: the new plan holds it as a step of its own
 * ------------------------------------------------------------------------------------------- */

/** The planDefaults of a chain where a step in a block is final three blocks later */
const DEEP = { ...FAST, confirmations: 3 };

/**
 * The plan "order" of three payments, `a`, `b`, `c` (11, 12 and 13 ada to three recipients),
 * signed; `a` sent and in a block, not final; `b` sent to a relay that holds it; `c` signed; a
 * slot on, so that no step built is an old one byte for byte. `before` is a fork taken first: a
 * rollback is `provider.control.target = before`
 */
const inBlock = async (
  options: Parameters<typeof stepSetup>[1] = {},
  more: { confirmations?: number } = {},
) => {
  const ctx = await stepSetup("scalus", {
    funds: [100n * ADA, 50n * ADA],
    builder: {
      planDefaults: { ...DEEP, confirmations: more.confirmations ?? 3 },
    },
    ...options,
  });
  const before = ctx.emulator.fork();
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
  expect(statuses(old)).toEqual({ a: "included", b: "sent", c: "signed" });
  advance(ctx.emulator, 1);
  return {
    ...ctx,
    before,
    old,
    relay,
    bytes: {
      a: old.step("a").signedTx!,
      b: relay.kept[0]!,
      c: old.step("c").signedTx!,
    },
  };
};

/** A rollback that is undone: the chain everyone reads and submits to is the fork without `a` */
const rollBack = (
  ctx: { emulator: TxEmulator; provider: { control: { target: TxEmulator } } },
  fork: TxEmulator,
  slots = 1,
) => {
  fork.advanceTo({ slot: ctx.emulator.slot + slots });
  ctx.provider.control.target = fork;
};

/** No recipient of these tests holds two payments of one amount */
const neverTwice = (emulator: TxEmulator) => {
  for (const [address, lovelace] of [
    [alice, 11n * ADA],
    [bob, 12n * ADA],
    [carol, 13n * ADA],
    [dave, 14n * ADA],
  ] as const)
    expect(times(emulator, address, lovelace)).toBeLessThanOrEqual(1);
};

/** CANNOT_OBSERVE (`unconfirmed`) with this hash, retryable after `pollMs`, and no mark */
const waits = (error: any, txHash: string, old: TxPlan) => {
  expect([error.code, reasonOf(error), error.txHash]).toEqual([
    "CANNOT_OBSERVE",
    "unconfirmed",
    txHash,
  ]);
  expect([error.retryable, error.retryAfterMs]).toEqual([true, FAST.pollMs]);
  expect(old.replacedBy).toBeUndefined();
};

describe("a plan in place of one whose step is in a block and not final", () => {
  it("takes a step that is in a block and not final, at once", async () => {
    const { emulator, old, bytes } = await inBlock();
    const a = old.step("a");
    const next = await old.replan({ id: "order:2" });
    expect(names(next)).toEqual(["a", "b", "c"]);
    expect(next.step("a")).toMatchObject({
      txHash: a.txHash,
      signedTx: a.signedTx,
      seen: a.seen,
      status: "included",
    });
    const json = next.toJSON();
    expect(json.steps[0]).toMatchObject({ taken: true, sends: 0 });
    expect(json.steps.slice(1).map((step) => step.taken)).toEqual([
      undefined,
      undefined,
    ]);
    expect(next.landed.map((step) => step.name)).toEqual(["a"]);
    expect(next.step("b").inputs.map(key)).toContain(key(a.change[0]!));
    expect(next.step("b").standsOn).toEqual(["a"]);
    expect(json.before).toEqual({
      final: [],
      open: [
        expect.objectContaining({ step: "b", txHash: old.step("b").txHash }),
        expect.objectContaining({ step: "c", txHash: old.step("c").txHash }),
      ],
    });
    expect(next.fee).toBe(a.fee + next.step("b").fee + next.step("c").fee);
    expect(old.replacedBy).toBe("order:2");
    expect(old.status).toBe("stopping");
    expect(old.rest).toEqual({});

    await next.run({ waitFor: "included" });
    advance(emulator, 3);
    await next.refresh();
    expect(next.status).toBe("final");
    expect(await refused(emulator, bytes.b)).toBe(true);
    expect(await refused(emulator, bytes.c)).toBe(true);
    paidOnce(emulator);
  });

  describe("a step built that does not stand on the step in a block is built at once", () => {
    it("a stuck step of another payer in the old plan: the call passes at once, and the step built is sent while a is not final", async () => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
      });
      const treasury = await treasuryOf(ctx.emulator);
      const old = await ctx.builder.plan(
        {
          a: payTo(alice, 11n * ADA),
          t: { parts: payTo(dave, 14n * ADA), payer: treasury.other },
        },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign();
      await old.sign({ signers: [treasury.other] });
      const tHash = old.step("t").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === tHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({ a: "included", t: "sent" });
      advance(ctx.emulator, 1);
      const a = old.step("a");
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["a", "t"]);
      expect(old.replacedBy).toBe("order:2");
      expect(next.step("a").status).toBe("included");
      // The treasury's step spends no output of a, and stands on nothing
      expect(next.step("t").standsOn).toEqual([]);
      expect(next.step("t").txHash).not.toBe(tHash);
      expect(
        next.step("t").inputs.some((input) => key(input) === key(a.change[0]!)),
      ).toBe(false);
      // It is sent at once, before a is final
      await next.run({ signers: [treasury.other], waitFor: "included" });
      expect(statuses(next)).toEqual({ a: "included", t: "included" });
      advance(ctx.emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      expect(await refused(ctx.emulator, relay.kept[0]!)).toBe(true);
      expect(times(ctx.emulator, alice, 11n * ADA)).toBe(1);
      expect(times(ctx.emulator, dave, 14n * ADA)).toBe(1);
      neverTwice(ctx.emulator);
    });

    it("a step given built that spends no output of the step in a block: recorded at once, and sent", async () => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
      });
      const { emulator, builder, wallet } = ctx;
      const treasury = await treasuryOf(emulator);
      const old = await builder.plan(
        {
          a: payTo(alice, 11n * ADA),
          t: { parts: payTo(dave, 14n * ADA), payer: treasury.other },
        },
        { id: "order", payer: wallet },
      );
      await old.sign({ signers: [wallet, treasury.other] });
      const tHash = old.step("t").txHash;
      const relay = relayOf(emulator, (txHash) => txHash === tHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({ a: "included", t: "sent" });
      advance(emulator, 1);
      // The treasury's payment, given built: it spends the one UTxO the old t spends
      const built = await builder.build(payTo(dave, 14n * ADA), {
        payer: treasury.other,
      });
      const signed = await built.sign({ signers: [treasury.other] });
      const next = await old.replan({ id: "order:2", steps: { x: signed } });
      expect(names(next)).toEqual(["a", "x"]);
      expect(next.step("x").txHash).toBe(signed.txHash);
      expect(next.step("x").standsOn).toEqual([]);
      expect(old.replacedBy).toBe("order:2");
      await next.run({ waitFor: "included" });
      expect(statuses(next)).toEqual({ a: "included", x: "included" });
      advance(emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      expect(await refused(emulator, relay.kept[0]!)).toBe(true);
      expect(times(emulator, alice, 11n * ADA)).toBe(1);
      expect(times(emulator, dave, 14n * ADA)).toBe(1);
      neverTwice(emulator);
    });

    it("a step given built beside the stuck steps that nothing keeps apart: the pair rule answers (STILL_LIVE), the call does not wait for a", async () => {
      const { emulator, builder, old } = await inBlock();
      const treasury = await treasuryOf(emulator);
      const built = await builder.build(payTo(dave, 14n * ADA), {
        payer: treasury.other,
      });
      const error = await caught(
        old.replan({
          id: "order:2",
          steps: {
            b: payTo(bob, 12n * ADA),
            c: payTo(carol, 13n * ADA),
            x: built,
          },
        }),
      );
      expect(error.code).toBe("STILL_LIVE");
      expect([...error.details.txHashes].sort()).toEqual(
        [old.step("b").txHash, old.step("c").txHash].sort(),
      );
      expect(old.replacedBy).toBeUndefined();
      neverTwice(emulator);
    });
  });

  describe("a step that cannot stand on the step in a block makes the call wait", () => {
    it("the payer's address read from the fork before a; read fresh, the call passes", async () => {
      const { emulator, provider, before, old } = await inBlock();
      provider.control.hooks.fetchAddressUTxOs = (_forward, address: string) =>
        before.fetchAddressUTxOs(address);
      const error = await caught(old.replan({ id: "order:2" }));
      waits(error, old.step("a").txHash, old);
      expect(error.message).toContain("its change is not in the payer's read");
      delete provider.control.hooks.fetchAddressUTxOs;
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["a", "b", "c"]);
      await next.run({ waitFor: "included" });
      advance(emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      paidOnce(emulator);
    });

    it("a step given beside the stuck step of another payer, and a canSelect that refuses the change of a: waits; once a is final a plan of the step left passes", async () => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
      });
      const { emulator, builder, wallet } = ctx;
      const treasury = await treasuryOf(emulator);
      const old = await builder.plan(
        {
          a: payTo(alice, 11n * ADA),
          t: { parts: payTo(carol, 13n * ADA), payer: treasury.other },
        },
        { id: "order", payer: wallet },
      );
      await old.sign();
      await old.sign({ signers: [treasury.other] });
      const tHash = old.step("t").txHash;
      const relay = relayOf(emulator, (txHash) => txHash === tHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({ a: "included", t: "sent" });
      advance(emulator, 1);
      const changeOfA = key(old.step("a").change[0]!);
      const call = () =>
        old.replan({
          id: "order:2",
          steps: {
            x: payTo(dave, 14n * ADA),
            t: { parts: payTo(carol, 13n * ADA), payer: treasury.other },
          },
          canSelect: (utxo) => key(utxo) !== changeOfA,
        });
      const error = await caught(call());
      waits(error, old.step("a").txHash, old);
      expect(error.message).toContain(
        "canSelect does not let its change through",
      );
      advance(emulator, 3);
      // Once a is final: x of the wallet shares no input with the old t of the treasury, so the
      // new plan pays t alone
      const next = await old.replan({
        id: "order:2",
        steps: {
          t: { parts: payTo(carol, 13n * ADA), payer: treasury.other },
        },
      });
      expect(names(next)).toEqual(["t"]);
      expect(next.toJSON().before!.final).toEqual(["a"]);
      await next.run({
        signers: [wallet, treasury.other],
        waitFor: "included",
      });
      advance(emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      expect(await refused(emulator, relay.kept[0]!)).toBe(true);
      neverTwice(emulator);
    });
  });

  it("a plan with one step in a block and one failed step, given steps: the call passes", async () => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA],
      builder: { planDefaults: DEEP },
    });
    const { emulator, provider, builder, wallet } = ctx;
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10n * ADA,
    });
    const old = await builder.plan(
      {
        a: payTo(alice, 11n * ADA),
        s: [
          spend.plutus({
            utxo: locked,
            script: plutus,
            redeemer: { data: mConStr0([]) },
          }),
          payTo(bob, 12n * ADA),
        ],
      },
      { id: "order", payer: wallet },
    );
    await old.run({ waitFor: "sent" });
    await old.refresh();
    await old.run({ waitFor: "sent", submitter: swallowing() });
    // The provider shows s in a block, deep, with is_valid = false; it never reached the chain
    const sHash = old.step("s").txHash;
    const at = emulator.slot;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
      hash === sHash
        ? {
            hash: sHash,
            slot: at - 20,
            block: "b".repeat(64),
            blockHeight: at - 20,
            validContract: false,
          }
        : forward(hash);
    advance(emulator, 1);
    await old.refresh();
    expect(statuses(old)).toEqual({ a: "included", s: "failed" });
    const next = await old.replan({
      id: "order:2",
      steps: { s: payTo(bob, 12n * ADA) },
    });
    expect(names(next)).toEqual(["a", "s"]);
    expect(next.toJSON().steps[0]!.taken).toBe(true);
    await next.run({ waitFor: "included" });
    advance(emulator, 3);
    await next.refresh();
    expect(next.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  });

  describe("what the new plan cannot hold still waits", () => {
    it("the search of a fails in this call", async () => {
      const { emulator, provider, old } = await inBlock();
      const aHash = old.step("a").txHash;
      provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
        if (hash.toLowerCase() === aHash) throw tooMany();
        return forward(hash);
      };
      waits(await caught(old.replan({ id: "order:2" })), aHash, old);
      neverTwice(emulator);
    });

    it("the old b lands after the new plan was made: it stops; replan of it waits, then builds c alone", async () => {
      const { emulator, old, bytes } = await inBlock();
      const next = await old.replan({ id: "order:2" });
      await emulator.submitTx(bytes.b);
      const submitter = forwarding(emulator);
      const stopped = await caught(next.run({ submitter }));
      expect([stopped.code, reasonOf(stopped), stopped.txHash]).toEqual([
        "INVALID_STATE",
        "stopped",
        old.step("b").txHash,
      ]);
      expect(submitter.calls).toEqual([]);
      waits(
        await caught(next.replan({ id: "order:3" })),
        old.step("b").txHash,
        next,
      );
      advance(emulator, 3);
      const last = await next.replan({ id: "order:3" });
      expect(names(last)).toEqual(["c"]);
      expect(last.toJSON().before!.final).toEqual(["a", "b"]);
      await last.run({ waitFor: "included" });
      advance(emulator, 3);
      await last.refresh();
      expect(last.status).toBe("final");
      expect(await refused(emulator, bytes.c)).toBe(true);
      paidOnce(emulator);
    });

    it("a and b in a block, the search hiding a: b stands on what the search does not find", async () => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
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
      await old.run({ waitFor: "sent" });
      await old.refresh();
      await old.run({ waitFor: "sent" });
      await old.refresh();
      expect(statuses(old)).toEqual({
        a: "included",
        b: "included",
        c: "signed",
      });
      const aHash = old.step("a").txHash;
      ctx.provider.control.hooks.fetchTxInfo = hiding(
        new Set([aHash]),
      ).fetchTxInfo;
      const error = await caught(old.replan({ id: "order:2" }));
      waits(error, aHash, old);
      expect(error.message).toContain(`step "b"`);
      neverTwice(ctx.emulator);
    });
  });

  describe("names, links, after and the limit", () => {
    const given = 7_777_777n;

    it("refuses the name of the step in a block, after: old, and 32 steps beside it; no message holds a value given", async () => {
      const { emulator, provider, old } = await inBlock();
      const name = await caught(
        old.replan({ id: "order:2", steps: { a: payTo(dave, given) } }),
      );
      const after = await caught(
        old.replan({
          id: "order:2",
          steps: { x: payTo(dave, given) },
          after: old,
        }),
      );
      const reads = provider.control.count("fetchAddressUTxOs");
      const many = await caught(
        old.replan({
          id: "order:2",
          steps: Object.fromEntries(
            Array.from({ length: 32 }, (_, i) => [`s${i}`, payTo(dave, given)]),
          ),
        }),
      );
      expect(provider.control.count("fetchAddressUTxOs")).toBe(reads);
      expect(
        [name, after, many].map((error) => [error.code, error.details?.option]),
      ).toEqual([
        ["INVALID_OPTION", "steps"],
        ["INVALID_OPTION", "after"],
        ["INVALID_OPTION", "steps"],
      ]);
      expect(name.message).toContain("in a block in this plan");
      expect(many.message).toContain(
        "holds 1 of this plan that are in a block",
      );
      for (const error of [name, after, many]) {
        expect(error.message).not.toContain(String(given));
        expect(JSON.stringify(error.details ?? {})).not.toContain(
          String(given),
        );
      }
      expect(old.replacedBy).toBeUndefined();
      neverTwice(emulator);
    });

    it("a given step linked to the change of the step in a block, which the old b spends too: built, the output spent once, the link kept", async () => {
      const { emulator, old, bytes } = await inBlock();
      const change = key(old.step("a").change[0]!);
      const next = await old.replan({
        id: "order:2",
        steps: {
          b: [
            spend.pubKey({ utxo: { step: "a", change: true } }),
            payTo(bob, 12n * ADA),
          ],
          c: payTo(carol, 13n * ADA),
        },
      });
      expect(
        next.step("b").inputs.filter((input) => key(input) === change),
      ).toHaveLength(1);
      const parts = next.toJSON().steps[1]!.given!.parts as {
        link?: unknown;
      }[];
      expect(parts[0]!.link).toEqual({ step: "a", change: true });
      await next.run({ waitFor: "included" });
      advance(emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      expect(await refused(emulator, bytes.b)).toBe(true);
      paidOnce(emulator);
    });

    it("a taken step whose own parts link to a final step is recorded with the output", async () => {
      const { emulator, builder, wallet } = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
      });
      const old = await builder.plan(
        {
          a: payTo(alice, 11n * ADA),
          b: [
            spend.pubKey({ utxo: { step: "a", change: true } }),
            payTo(bob, 12n * ADA),
          ],
          c: payTo(carol, 13n * ADA),
        },
        { id: "order", payer: wallet },
      );
      await old.sign();
      await old.run({ waitFor: "sent" });
      advance(emulator, 3);
      await old.refresh();
      await old.run({ waitFor: "sent" });
      await old.refresh();
      expect(statuses(old)).toEqual({
        a: "final",
        b: "included",
        c: "signed",
      });
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["b", "c"]);
      const parts = next.toJSON().steps[0]!.given!.parts as {
        link?: unknown;
        input?: { transaction_id: string; index: number };
      }[];
      expect(parts[0]!.link).toBeUndefined();
      const change = old.step("a").change[0]!;
      expect(parts[0]!.input).toEqual({
        transaction_id: change.txHash,
        index: change.outputIndex,
      });
      expect(next.toJSON().before!.final).toEqual(["a"]);
      await next.run({ waitFor: "included" });
      advance(emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      paidOnce(emulator);
    });
  });

  describe("kinds", () => {
    it("a step given built and in a block: taken with its kind and witnesses; after a rollback the new plan submits it", async () => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
      });
      const before = ctx.emulator.fork();
      const built = await ctx.builder.build(payTo(alice, 11n * ADA), {
        payer: ctx.wallet,
      });
      const signed = await built.sign({ signers: [ctx.wallet] });
      const old = await ctx.builder.plan(
        { p: signed, b: payTo(bob, 12n * ADA) },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign();
      const bHash = old.step("b").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
      await caught(old.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(old)).toEqual({ p: "included", b: "sent" });
      advance(ctx.emulator, 1);
      const next = await old.replan({ id: "order:2" });
      expect(next.step("p")).toMatchObject({
        kind: "prebuilt",
        status: "included",
        signedTx: old.step("p").signedTx,
      });
      expect(next.toJSON().steps[0]).toMatchObject({
        kind: "prebuilt",
        taken: true,
      });
      rollBack(ctx, before);
      await next.refresh();
      expect(next.step("p").status).toBe("sent");
      const submitter = forwarding(before);
      await next.run({ submitter, waitFor: "included" });
      expect(submitter.calls[0]).toBe(old.step("p").signedTx);
      before.advanceTo({ slot: before.slot + 3 });
      await next.refresh();
      expect(next.status).toBe("final");
      expect(times(before, alice, 11n * ADA)).toBe(1);
      expect(times(before, bob, 12n * ADA)).toBe(1);
      neverTwice(before);
    });

    it("a step another party sent, one witness not held: taken as it is; after a rollback run asks the co-signer and submits", async () => {
      const ctx = await stepSetup("scalus", {
        funds: [100n * ADA, 50n * ADA],
        builder: { planDefaults: DEEP },
      });
      const before = ctx.emulator.fork();
      const cosigner = await walletOf(1);
      const keyHash = deserializeAddress(
        (await cosigner.getChangeAddress())!,
      ).pubKeyHash;
      const old = await ctx.builder.plan(
        {
          a: [payTo(alice, 11n * ADA), guard.pubKey({ keyHash })],
          b: payTo(bob, 12n * ADA),
        },
        { id: "order", payer: ctx.wallet },
      );
      await old.sign();
      expect(statuses(old)).toEqual({ a: "built", b: "signed" });
      // The other party signs it whole and sends it
      const whole = await cosigner.signTx(
        await ctx.wallet.signTx(old.step("a").tx, true),
        true,
      );
      await ctx.emulator.submitTx(whole);
      await old.refresh();
      expect(statuses(old)).toEqual({ a: "included", b: "signed" });
      advance(ctx.emulator, 1);
      const next = await old.replan({ id: "order:2" });
      expect(next.step("a")).toMatchObject({ status: "included" });
      expect(next.step("a").signedTx).toBeUndefined();
      expect(next.step("a").missing.map((each) => each.keyHash)).toEqual([
        keyHash,
      ]);
      rollBack(ctx, before);
      await next.refresh();
      expect(next.step("a").status).toBe("sent");
      await next.run({ signers: [ctx.wallet, cosigner], waitFor: "included" });
      before.advanceTo({ slot: before.slot + 3 });
      await next.refresh();
      expect(next.status).toBe("final");
      expect(times(before, alice, 11n * ADA)).toBe(1);
      expect(times(before, bob, 12n * ADA)).toBe(1);
    });

    it("a consolidation step in a block: taken with its kind, the step built stands on it, the record reads back; the step built's own consolidation steps are numbered after it", async () => {
      const ctx = await fragmented(coins(250, 2n * ADA), {
        maxTxSize: 4096,
        confirmations: 3,
      });
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
        "consolidate-1": "included",
        "consolidate-2": "sent",
        main: "signed",
      });
      advance(ctx.emulator, 1);
      const next = await old.replan({ id: "order:2" });
      expect(next.step("consolidate-1")).toMatchObject({
        kind: "consolidation",
        status: "included",
        txHash: old.step("consolidate-1").txHash,
      });
      expect(next.toJSON().steps[0]!.taken).toBe(true);
      const built = next.steps.slice(1);
      expect(built.at(-1)!.name).toBe("main");
      // Its own consolidation steps, if any, come after the taken one by number
      for (const step of built.slice(0, -1)) {
        expect(step.kind).toBe("consolidation");
        expect(Number(step.name.slice("consolidate-".length))).toBeGreaterThan(
          1,
        );
      }
      expect(built[0]!.standsOn).toContain("consolidate-1");
      expect(readPlan(JSON.parse(JSON.stringify(next.toJSON())))).toBeDefined();
      await next.run({ waitFor: "included" });
      for (const _ of built) {
        advance(ctx.emulator, 1);
        await next.run({ waitFor: "included" });
      }
      advance(ctx.emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      expect(await refused(ctx.emulator, relay.kept[0]!)).toBe(true);
      expect(times(ctx.emulator, recipient, 480n * ADA)).toBe(1);
    }, 120_000);
  });

  it("another payer for the new plan: the record says whose step the taken one is", async () => {
    const { emulator, wallet, address, old } = await inBlock();
    const treasury = await treasuryOf(emulator);
    const next = await old.replan({
      id: "order:2",
      payer: treasury.other,
      steps: {
        b: { parts: payTo(bob, 12n * ADA), payer: wallet },
        c: { parts: payTo(carol, 13n * ADA), payer: wallet },
      },
    });
    const json = next.toJSON();
    expect(json.options.changeAddress).toBe(treasury.address);
    expect(json.steps[0]!.given!.options!.changeAddress).toBe(address);
    expect(encodeRead(json)).toEqual(json);
    // Once b is final the old b and c cannot land: a step of the new payer is added
    await next.run({ signers: [wallet], waitFor: "sent" });
    await next.refresh();
    advance(emulator, 3);
    await next.refresh();
    expect(statuses(next)).toMatchObject({ a: "final", b: "final" });
    await next.add({ d: payTo(dave, 14n * ADA) });
    expect(
      next
        .step("d")
        .inputs.every((input) => input.address === treasury.address),
    ).toBe(true);
    await next.run({ signers: [wallet, treasury.other], waitFor: "included" });
    advance(emulator, 3);
    await next.refresh();
    expect(next.status).toBe("final");
    paidOnce(emulator);
    neverTwice(emulator);
  });

  it("add on a plan with a taken step: the added step stands on the last step of its payer, also after a rollback", async () => {
    const ctx = await inBlock();
    const { emulator, old, before } = ctx;
    const next = await old.replan({ id: "order:2" });
    await next.add({ d: payTo(dave, 14n * ADA) });
    expect(next.step("d").standsOn).toEqual(["c"]);
    await next.run({ waitFor: "included" });
    advance(emulator, 3);
    await next.refresh();
    expect(next.status).toBe("final");
    paidOnce(emulator);
    neverTwice(emulator);

    // The same after a rollback, while the taken step is sent
    const again = await inBlock();
    const other = await again.old.replan({ id: "order:2" });
    rollBack(again, again.before);
    await other.refresh();
    expect(other.step("a").status).toBe("sent");
    await other.add({ d: payTo(dave, 14n * ADA) });
    expect(other.step("d").standsOn).toEqual(["c"]);
    await other.run({ waitFor: "included" });
    again.before.advanceTo({ slot: again.before.slot + 3 });
    await other.refresh();
    expect(other.status).toBe("final");
    paidOnce(again.before);
    neverTwice(again.before);
    void before;
  });

  it("the deadlines given judge the taken step too", async () => {
    const { emulator, old } = await inBlock();
    const next = await old.replan({ id: "order:2", confirmations: 0 });
    await next.refresh();
    expect(next.step("a").status).toBe("final");
    await old.refresh();
    expect(old.step("a").status).toBe("included");
    neverTwice(emulator);
  });
});

/** The JSON of a plan, read back and written again */
const encodeRead = (json: ReturnType<TxPlan["toJSON"]>) =>
  encodePlan(readPlan(JSON.parse(JSON.stringify(json))));

describe("rules of a taken step, each held", () => {
  it("after that names a taken transaction and nothing else: INVALID_OPTION (after)", async () => {
    const { emulator, old } = await inBlock();
    const error = await caught(
      old.replan({ id: "order:2", after: old.step("a") }),
    );
    expect([error.code, error.details.option]).toEqual([
      "INVALID_OPTION",
      "after",
    ]);
    expect(old.replacedBy).toBeUndefined();
    neverTwice(emulator);
  });

  it("an included step that runs a Plutus script, found with no word on its scripts, is not taken: the look refuses the call (noValidity)", async () => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA],
      builder: { planDefaults: DEEP },
    });
    const { emulator, provider, builder, wallet } = ctx;
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10n * ADA,
    });
    const old = await builder.plan(
      {
        s: [
          spend.plutus({
            utxo: locked,
            script: plutus,
            redeemer: { data: mConStr0([]) },
          }),
          payTo(bob, 12n * ADA),
        ],
        t: payTo(carol, 13n * ADA),
      },
      { id: "order", payer: wallet },
    );
    await old.sign();
    await old.run({ waitFor: "sent" });
    await old.refresh();
    expect(statuses(old)).toEqual({ s: "included", t: "signed" });
    // The search finds s in its block and says nothing of its scripts
    const sHash = old.step("s").txHash;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      const info = await forward(hash);
      return hash === sHash ? { ...info, validContract: undefined } : info;
    };
    advance(emulator, 1);
    // The look itself refuses such a find: the provider can never say whether s passed
    const error = await caught(old.replan({ id: "order:2" }));
    expect([error.code, reasonOf(error), error.retryable]).toEqual([
      "CANNOT_OBSERVE",
      "noValidity",
      false,
    ]);
    expect(old.replacedBy).toBeUndefined();
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
    neverTwice(emulator);
  });

  it("a taken step given built keeps the set tags its witnesses came with", async () => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA],
      builder: { planDefaults: DEEP },
    });
    const built = await ctx.builder.build(payTo(alice, 11n * ADA), {
      payer: ctx.wallet,
    });
    const signed = await built.sign({ signers: [ctx.wallet] });
    const old = await ctx.builder.plan(
      { p: signed, b: payTo(bob, 12n * ADA) },
      { id: "order", payer: ctx.wallet },
    );
    await old.sign();
    const bHash = old.step("b").txHash;
    const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    expect(statuses(old)).toEqual({ p: "included", b: "sent" });
    const tags = recordOf(old).steps[0]!.tags;
    expect(tags).toBeDefined();
    advance(ctx.emulator, 1);
    const next = await old.replan({ id: "order:2" });
    expect(recordOf(next).steps[0]!.tags).toEqual(tags);
    expect(next.toJSON().steps[0]!.tx.witnesses).toBe(
      old.toJSON().steps[0]!.tx.witnesses,
    );
    neverTwice(ctx.emulator);
  });

  it("a transaction a taken step excludes, one input of which the payer still holds, gets that input as its guard", async () => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA],
      builder: { planDefaults: DEEP },
    });
    const { emulator, builder, wallet } = ctx;
    // X and Y in the order a body spends them: by hash
    const [x, y] = [...ctx.funded].sort((one, two) =>
      one.input.txHash < two.input.txHash ? -1 : 1,
    );
    const isY = (utxo: { txHash: string; outputIndex: number }) =>
      key(utxo) === key(y!.input);
    // O0: a0 spends X and Y, sent and held
    const o0 = await builder.plan(
      {
        a: [
          payTo(alice, 11n * ADA),
          spend.pubKey({ utxo: x! }),
          spend.pubKey({ utxo: y! }),
        ],
      },
      { id: "order", payer: wallet },
    );
    await o0.sign();
    const a0 = o0.step("a").txHash;
    const hold0 = relayOf(emulator, (txHash) => txHash === a0);
    await caught(o0.run({ submitter: hold0, timeoutMs: 300 }));
    advance(emulator, 1);
    // O: a1 spends X alone, in a block; b1 stuck
    const o = await o0.replan({
      id: "order:2",
      steps: {
        a: [payTo(alice, 11n * ADA), spend.pubKey({ utxo: x! })],
        b: payTo(bob, 12n * ADA),
      },
      canSelect: (utxo) => !isY(utxo),
    });
    expect(o.step("a").inputs.some(isY)).toBe(false);
    const b1 = o.step("b").txHash;
    const hold1 = relayOf(emulator, (txHash) => txHash === b1);
    await caught(o.run({ submitter: hold1, timeoutMs: 300 }));
    expect(statuses(o)).toEqual({ a: "included", b: "sent" });
    advance(emulator, 1);
    // N: a1 taken; a0, which a1 excludes, may land after a rollback: Y is its guard
    const n = await o.replan({
      id: "order:3",
      canSelect: (utxo) => !isY(utxo),
    });
    expect(n.toJSON().steps[0]).toMatchObject({ name: "a", taken: true });
    expect(n.step("b").inputs.some(isY)).toBe(true);
    await n.run({ waitFor: "included" });
    advance(emulator, 3);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(await refused(emulator, hold0.kept[0]!)).toBe(true);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
  });
});

describe("rollbacks under a plan that took a step", () => {
  it("a rollback that is undone: the new plan sends the step again, the old plan nothing", async () => {
    const ctx = await inBlock();
    const { old, before, bytes } = ctx;
    const a = old.step("a");
    const next = await old.replan({ id: "order:2" });
    rollBack(ctx, before);
    await next.refresh();
    expect(next.step("a").status).toBe("sent");
    expect(next.step("a").seen).toEqual(a.seen);
    expect(next.landed).toEqual([]);
    expect(next.rest).not.toHaveProperty("a");
    const quiet = forwarding(before);
    const stopped = await caught(old.run({ submitter: quiet }));
    expect([stopped.code, reasonOf(stopped)]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    expect(quiet.calls).toEqual([]);
    const submitter = forwarding(before);
    await next.run({ submitter, waitFor: "included" });
    expect(submitter.calls[0]).toBe(bytes.a);
    expect(await Promise.all(submitter.calls.map(hashOf))).toEqual([
      a.txHash,
      next.step("b").txHash,
      next.step("c").txHash,
    ]);
    before.advanceTo({ slot: before.slot + 3 });
    await next.refresh();
    expect(next.status).toBe("final");
    expect(await refused(before, bytes.b)).toBe(true);
    paidOnce(before);
  });

  it("a rollback that is not undone: the new plan stops and is never final; the plan in its place pays everything once", async () => {
    const ctx = await inBlock();
    const { old, before, bytes } = ctx;
    const a = old.step("a");
    const next = await old.replan({ id: "order:2" });
    rollBack(ctx, before, 700);
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({
      a: "expired",
      b: "orphaned",
      c: "orphaned",
    });
    expect(next.status).toBe("stopped");
    expect(next.rest).not.toHaveProperty("a");
    const submitter = forwarding(before);
    const error = await caught(next.run({ submitter }));
    expect([error.code, error.step]).toEqual(["EXPIRED", "a"]);
    expect(submitter.calls).toEqual([]);
    const last = await next.replan({ id: "order:3" });
    expect(names(last)).toEqual(["a", "b", "c"]);
    expect(last.toJSON().steps.every((step) => step.taken === undefined)).toBe(
      true,
    );
    expect(
      last
        .step("a")
        .inputs.some((input) =>
          a.inputs.some((each) => key(each) === key(input)),
        ),
    ).toBe(true);
    expect(last.toJSON().before!.open).toContainEqual(
      expect.objectContaining({
        step: "a",
        txHash: a.txHash,
        seenBefore: a.seen,
      }),
    );
    await last.run({ waitFor: "included" });
    before.advanceTo({ slot: before.slot + 3 });
    await last.refresh();
    expect(last.status).toBe("final");
    expect(await refused(before, bytes.a)).toBe(true);
    paidOnce(before);
  });

  it("a rollback that is not undone, the input of a taken by another transaction: STILL_LIVE with no safeAfter, no mark", async () => {
    const ctx = await inBlock();
    const { old, before } = ctx;
    const next = await old.replan({ id: "order:2" });
    before.removeUtxos(old.step("a").inputs.map(ref));
    rollBack(ctx, before, 700);
    await next.refresh();
    await next.refresh();
    expect(next.status).toBe("stopped");
    const error = await caught(next.replan({ id: "order:3" }));
    expect(error.code).toBe("STILL_LIVE");
    expect(error.details.safeAfter).toBeUndefined();
    expect(error.details.txHashes).toContain(old.step("a").txHash);
    expect(error.retryable).toBe(false);
    expect(next.replacedBy).toBeUndefined();
    neverTwice(before);
  });

  it("a rollback after a step built on the taken step was sent, and after it landed", async () => {
    // Sent and held by a relay, then a rollback: a, then the same bytes of b, then c
    {
      const ctx = await inBlock();
      const next = await ctx.old.replan({ id: "order:2" });
      const bHash = next.step("b").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
      await caught(next.run({ submitter: relay, timeoutMs: 300 }));
      expect(statuses(next)).toMatchObject({ a: "included", b: "sent" });
      rollBack(ctx, ctx.before);
      await next.refresh();
      expect(statuses(next)).toMatchObject({ a: "sent", b: "sent" });
      const submitter = forwarding(ctx.before);
      await next.run({ submitter, waitFor: "included" });
      expect(submitter.calls.slice(0, 2)).toEqual([ctx.bytes.a, relay.kept[0]]);
      ctx.before.advanceTo({ slot: ctx.before.slot + 3 });
      await next.refresh();
      expect(next.status).toBe("final");
      paidOnce(ctx.before);
    }
    // All landed, then a rollback: all three sent with their blocks; run submits them in order
    {
      const ctx = await inBlock();
      const next = await ctx.old.replan({ id: "order:2" });
      await next.run({ waitFor: "included" });
      rollBack(ctx, ctx.before);
      await next.refresh();
      expect(statuses(next)).toEqual({ a: "sent", b: "sent", c: "sent" });
      for (const step of next.steps) expect(step.seen).toBeDefined();
      const submitter = forwarding(ctx.before);
      await next.run({ submitter, waitFor: "included" });
      expect(await Promise.all(submitter.calls.map(hashOf))).toEqual(
        next.steps.map((step) => step.txHash),
      );
      ctx.before.advanceTo({ slot: ctx.before.slot + 3 });
      await next.refresh();
      expect(next.status).toBe("final");
      paidOnce(ctx.before);
    }
    // All landed, a rollback, the fork past the end of a: stopped; the plan in its place pays
    {
      const ctx = await inBlock();
      const next = await ctx.old.replan({ id: "order:2" });
      await next.run({ waitFor: "included" });
      const second = next.step("b").signedTx!;
      rollBack(ctx, ctx.before, 700);
      await next.refresh();
      await next.refresh();
      expect(next.status).toBe("stopped");
      const last = await next.replan({ id: "order:3" });
      expect(names(last)).toEqual(["a", "b", "c"]);
      await last.run({ waitFor: "included" });
      ctx.before.advanceTo({ slot: ctx.before.slot + 3 });
      await last.refresh();
      expect(last.status).toBe("final");
      expect(await refused(ctx.before, second)).toBe(true);
      paidOnce(ctx.before);
    }
  });

  it("replan of the new plan takes the step again while it is in a block, and keeps it once it is final", async () => {
    {
      const ctx = await inBlock();
      const next = await ctx.old.replan({ id: "order:2" });
      const bHash = next.step("b").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
      await caught(next.run({ submitter: relay, timeoutMs: 300 }));
      advance(ctx.emulator, 1);
      const last = await next.replan({ id: "order:3" });
      expect(names(last)).toEqual(["a", "b", "c"]);
      expect(last.toJSON().steps[0]).toMatchObject({ name: "a", taken: true });
      expect(last.step("a").txHash).toBe(ctx.old.step("a").txHash);
      await last.run({ waitFor: "included" });
      advance(ctx.emulator, 3);
      await last.refresh();
      expect(last.status).toBe("final");
      expect(await refused(ctx.emulator, relay.kept[0]!)).toBe(true);
      paidOnce(ctx.emulator);
    }
    {
      const ctx = await inBlock();
      const next = await ctx.old.replan({ id: "order:2" });
      const bHash = next.step("b").txHash;
      const relay = relayOf(ctx.emulator, (txHash) => txHash === bHash);
      await caught(next.run({ submitter: relay, timeoutMs: 300 }));
      advance(ctx.emulator, 3);
      const last = await next.replan({ id: "order:3" });
      expect(names(last)).toEqual(["b", "c"]);
      expect(last.toJSON().before!.final).toEqual(["a"]);
      await last.run({ waitFor: "included" });
      advance(ctx.emulator, 3);
      await last.refresh();
      expect(last.status).toBe("final");
      paidOnce(ctx.emulator);
    }
  });

  it("a line of three plans: a transaction a taken step excludes is watched, and stops the new plan when it lands after a rollback", async () => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA, 7n * ADA],
      builder: { planDefaults: DEEP },
    });
    const { emulator, builder, wallet } = ctx;
    const voucher = ctx.funded[2]!;
    const isVoucher = (utxo: { txHash: string; outputIndex: number }) =>
      key(utxo) === key(voucher.input);
    const before = emulator.fork();
    // O0: one step a, sent and held (a0)
    const o0 = await builder.plan(
      { a: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet, canSelect: (utxo) => !isVoucher(utxo) },
    );
    await o0.sign();
    const a0Hash = o0.step("a").txHash;
    const hold0 = relayOf(emulator, (txHash) => txHash === a0Hash);
    await caught(o0.run({ submitter: hold0, timeoutMs: 300 }));
    advance(emulator, 1);
    // O: a1 shares the input X with a0 and spends the voucher V; b1 is stuck
    const o = await o0.replan({
      id: "order:2",
      steps: {
        a: [payTo(alice, 11n * ADA), spend.pubKey({ utxo: voucher })],
        b: payTo(bob, 12n * ADA),
      },
    });
    const x = o0.step("a").inputs.map(key);
    expect(o.step("a").inputs.some((input) => x.includes(key(input)))).toBe(
      true,
    );
    const b1Hash = o.step("b").txHash;
    const hold1 = relayOf(emulator, (txHash) => txHash === b1Hash);
    await caught(o.run({ submitter: hold1, timeoutMs: 300 }));
    expect(statuses(o)).toEqual({ a: "included", b: "sent" });
    advance(emulator, 1);
    // N in place of O at once: a1 taken, b2 on it; a0 is watched, not settled
    const n = await o.replan({ id: "order:3" });
    expect(n.toJSON().steps[0]).toMatchObject({ name: "a", taken: true });
    expect(n.toJSON().before!.open.map((entry) => entry.txHash)).toEqual(
      expect.arrayContaining([a0Hash, b1Hash]),
    );
    // B1 rolled back, and a0 lands
    rollBack(ctx, before);
    await before.submitTx(hold0.kept[0]!);
    await n.refresh();
    expect(n.step("a").status).toBe("sent");
    const entry = n
      .toJSON()
      .before!.open.find((each) => each.txHash === a0Hash)!;
    expect(entry.seen).toBeDefined();
    const stopped = await caught(n.run({ submitter: forwarding(before) }));
    expect([stopped.code, reasonOf(stopped), stopped.txHash]).toEqual([
      "INVALID_STATE",
      "stopped",
      a0Hash,
    ]);
    // replan of it waits until a0 is final, then builds b alone
    waits(await caught(n.replan({ id: "order:4" })), a0Hash, n);
    before.advanceTo({ slot: before.slot + 3 });
    const last = await n.replan({ id: "order:4" });
    expect(names(last)).toEqual(["b"]);
    await last.run({ waitFor: "included" });
    before.advanceTo({ slot: before.slot + 3 });
    await last.refresh();
    expect(last.status).toBe("final");
    expect(times(before, alice, 11n * ADA)).toBe(1);
    expect(times(before, bob, 12n * ADA)).toBe(1);
    neverTwice(before);
  });
});

/* ---------------------------------------------------------------------------------------------
 * Two payers beside a step in a block: what a step built that does not stand on it may do
 * ------------------------------------------------------------------------------------------- */

describe("two payers beside a step in a block", () => {
  /**
   * The order: the shop's wallet pays the supplier in `a`, the treasury pays a partner in `t`.
   * `a` is in a block with few confirmations; `t` was held back and is past its end. A fork
   * taken before `a` landed is the chain a rollback goes back to. One ada of the supplier's
   * payment is 11, of the partner's 14. With `withB`, the wallet pays bob 12 in `b`, on the
   * change of `a`, which lands too. With `more`, `a` pays that many addresses besides, 1.5 each
   */
  const order = async (withB = false, more = 0) => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA],
      builder: { planDefaults: { ...FAST, confirmations: 1000 } },
    });
    const treasury = await treasuryOf(ctx.emulator);
    const before = ctx.emulator.fork();
    const besides = Array.from({ length: more }, (_, i) =>
      payTo(baseAddress(60 + i), 1_500_000n),
    );
    const old = await ctx.builder.plan(
      {
        a:
          more === 0
            ? payTo(alice, 11n * ADA)
            : [payTo(alice, 11n * ADA), ...besides],
        ...(withB && { b: payTo(bob, 12n * ADA) }),
        t: { parts: payTo(dave, 14n * ADA), payer: treasury.other },
      },
      { id: "order", payer: ctx.wallet },
    );
    await old.sign({ signers: [ctx.wallet, treasury.other] });
    const tHash = old.step("t").txHash;
    const relay = relayOf(ctx.emulator, (txHash) => txHash === tHash);
    await caught(old.run({ submitter: relay, timeoutMs: 300 }));
    const b = withB ? { b: "included" } : {};
    expect(statuses(old)).toEqual({ a: "included", ...b, t: "sent" });
    advance(ctx.emulator, 700);
    await old.refresh();
    expect(statuses(old)).toEqual({ a: "included", ...b, t: "expired" });
    return {
      ...ctx,
      treasury,
      before,
      old,
      bytes: { a: old.step("a").signedTx!, t: relay.kept[0]! },
    };
  };

  /** STILL_LIVE with these hashes alone, no `safeAfter`, not retryable */
  const takenOut = (error: any, txHashes: string[]) => {
    expect([error.code, error.retryable, error.retryAfterMs]).toEqual([
      "STILL_LIVE",
      false,
      undefined,
    ]);
    expect(error.details).toEqual({ txHashes });
  };

  it("the call passes at once and the treasury's step is sent; no rollback: final, each recipient paid once", async () => {
    const { emulator, treasury, old, bytes } = await order();
    const a = old.step("a");
    const next = await old.replan({ id: "order:2" });
    expect(names(next)).toEqual(["a", "t"]);
    expect(next.toJSON().steps.map((step) => step.taken)).toEqual([
      true,
      undefined,
    ]);
    expect(next.step("t").txHash).not.toBe(old.step("t").txHash);
    expect(next.step("t").standsOn).toEqual([]);
    expect(
      next.step("t").inputs.some((input) => key(input) === key(a.change[0]!)),
    ).toBe(false);
    expect(old.replacedBy).toBe("order:2");
    // Sent while a is in a block, not final
    await next.run({ signers: [treasury.other], waitFor: "included" });
    expect(statuses(next)).toEqual({ a: "included", t: "included" });
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    advance(emulator, 1000);
    await next.refresh();
    expect(next.status).toBe("final");
    expect(await refused(emulator, bytes.t)).toBe(true);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
  });

  it("the block of a is rolled back and a cannot land again: the new plan stops, never final, the partner paid once; replan of it pays the supplier once", async () => {
    const ctx = await order();
    const { treasury, before, old, bytes } = ctx;
    const a = old.step("a");
    const next = await old.replan({ id: "order:2" });
    await next.run({ signers: [treasury.other], waitFor: "included" });
    const tBytes = next.step("t").signedTx!;
    expect(statuses(next)).toEqual({ a: "included", t: "included" });
    // The chain everyone reads is a fork where the treasury's payment is in a block and a is
    // not, and where the end of a has passed
    rollBack(ctx, before);
    await before.submitTx(tBytes);
    before.advanceTo({ slot: before.slot + 1 });
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "included" });
    expect(await refused(before, bytes.a)).toBe(true);
    before.advanceTo({ slot: before.slot + 1000 });
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "final" });
    // The partner is paid, the supplier is not: the plan shows it
    expect(next.status).toBe("stopped");
    expect(times(before, dave, 14n * ADA)).toBe(1);
    expect(times(before, alice, 11n * ADA)).toBe(0);
    const submitter = forwarding(before);
    const error = await caught(next.run({ submitter }));
    expect([error.code, error.step]).toEqual(["EXPIRED", "a"]);
    expect(submitter.calls).toEqual([]);

    // replan of it builds a again, on an input of the old a, and nothing else
    const last = await next.replan({ id: "order:3" });
    expect(names(last)).toEqual(["a"]);
    expect(last.toJSON().before!.final).toEqual(["t"]);
    expect(
      last
        .step("a")
        .inputs.some((input) =>
          a.inputs.some((each) => key(each) === key(input)),
        ),
    ).toBe(true);
    await last.run({ waitFor: "included" });
    before.advanceTo({ slot: before.slot + 1000 });
    await last.refresh();
    expect(last.status).toBe("final");
    expect(await refused(before, bytes.a)).toBe(true);
    expect(await refused(before, bytes.t)).toBe(true);
    expect(times(before, alice, 11n * ADA)).toBe(1);
    expect(times(before, dave, 14n * ADA)).toBe(1);
  });

  it("the block of a is rolled back and a lands again: the new plan sends it again, each recipient paid once", async () => {
    const ctx = await order();
    const { treasury, before, old, bytes } = ctx;
    const next = await old.replan({ id: "order:2" });
    await next.run({ signers: [treasury.other], waitFor: "included" });
    const tBytes = next.step("t").signedTx!;
    // The fork holds the treasury's payment and not a, and a is still valid: it comes back
    before.advanceTo({ slot: ctx.emulator.slot - 600 });
    ctx.provider.control.target = before;
    await before.submitTx(tBytes);
    before.advanceTo({ slot: before.slot + 1 });
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "sent", t: "included" });
    const submitter = forwarding(before);
    await next.run({ submitter, waitFor: "included" });
    expect(submitter.calls).toEqual([bytes.a]);
    before.advanceTo({ slot: before.slot + 1000 });
    await next.refresh();
    expect(next.status).toBe("final");
    expect(times(before, alice, 11n * ADA)).toBe(1);
    expect(times(before, dave, 14n * ADA)).toBe(1);
  });

  it("a rollback before the first run(), undone: the new plan sends a, then the treasury's step; each recipient paid once", async () => {
    const ctx = await order();
    const { treasury, before, old, bytes } = ctx;
    const next = await old.replan({ id: "order:2" });
    before.advanceTo({ slot: ctx.emulator.slot - 600 });
    ctx.provider.control.target = before;
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "sent", t: "built" });
    const submitter = forwarding(before);
    await next.run({
      submitter,
      signers: [treasury.other],
      waitFor: "included",
    });
    expect(await Promise.all(submitter.calls.map(hashOf))).toEqual([
      old.step("a").txHash,
      next.step("t").txHash,
    ]);
    expect(submitter.calls[0]).toBe(bytes.a);
    before.advanceTo({ slot: before.slot + 1000 });
    await next.refresh();
    expect(next.status).toBe("final");
    expect(await refused(before, bytes.t)).toBe(true);
    expect(times(before, alice, 11n * ADA)).toBe(1);
    expect(times(before, dave, 14n * ADA)).toBe(1);
  });

  it("a rollback before the first run(), not undone: nothing is sent and nobody is paid; the next replan is the pair rule's, as for the old plan itself", async () => {
    const ctx = await order();
    const { treasury, before, old } = ctx;
    const next = await old.replan({ id: "order:2" });
    rollBack(ctx, before);
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "built" });
    expect(next.status).toBe("stopping");
    const submitter = forwarding(before);
    const error = await caught(
      next.run({ submitter, signers: [treasury.other] }),
    );
    expect([error.code, error.step]).toEqual(["EXPIRED", "a"]);
    expect(submitter.calls).toEqual([]);
    expect(times(before, alice, 11n * ADA)).toBe(0);
    expect(times(before, dave, 14n * ADA)).toBe(0);
    // The step of the treasury beside a step of the wallet that was found in a block once: no
    // time settles the pair, as it would not for the old plan itself. The treasury's step may
    // still land: the message is the one of any pair
    const refusal = await caught(next.replan({ id: "order:3" }));
    expect(refusal.code).toBe("STILL_LIVE");
    expect(refusal.details.safeAfter).toBeUndefined();
    expect(refusal.details.txHashes).toEqual([
      next.step("t").txHash,
      old.step("a").txHash,
    ]);
    expect(refusal.message).toMatch(/^a step built could land beside /);
    expect(refusal.message).toContain(
      "no time settles it, as one of them has no end of validity or was found in a block once: steps that hold that transaction or spend an input of it, under the names of the steps they pay for, are the way",
    );
    expect(next.replacedBy).toBeUndefined();
    // Once the treasury's step is past its end, only a is left: the message says what happened
    before.advanceTo({ slot: before.slot + 700 });
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "expired" });
    const a = old.step("a").txHash;
    for (let i = 0; i < 2; i++) {
      const later = await caught(next.replan({ id: "order:3" }));
      takenOut(later, [a]);
      expect(later.message).toBe(
        `step "a" (${a}) of this plan or a plan before it was found in a block, the search does not find it now, and its end of validity has passed: a rollback took it out, and it lands again only if the chain goes back to the blocks that held it, or the provider lost it while it stayed in its block. No plan is made in its place: no step this call builds by default is kept apart from it; the application decides how to pay what is left. ${NOT_UNPAID}`,
      );
      before.advanceTo({ slot: before.slot + 1000 });
    }
    expect(next.replacedBy).toBeUndefined();
    expect(times(before, alice, 11n * ADA)).toBe(0);
    expect(times(before, dave, 14n * ADA)).toBe(0);
  });

  it("the same rollback when a pays 16 addresses besides alice's: the cap leaves addresses of a unread, so the refusal is the one of any pair, which names steps under the names they pay for; with 14 every address is read and the refusal says what happened", async () => {
    for (const [more, plain] of [
      [16, false],
      [14, true],
    ] as const) {
      const ctx = await order(false, more);
      const { before, old } = ctx;
      const next = await old.replan({ id: "order:2" });
      rollBack(ctx, before);
      await next.refresh();
      await next.refresh();
      before.advanceTo({ slot: before.slot + 700 });
      await next.refresh();
      expect(statuses(next)).toEqual({ a: "expired", t: "expired" });
      const a = old.step("a").txHash;
      const error = await caught(next.replan({ id: "order:3" }));
      takenOut(error, [a]);
      if (plain)
        expect(error.message).toMatch(
          new RegExp(
            `^step "a" \\(${a}\\) of this plan or a plan before it was found in a block, the search does not find it now`,
          ),
        );
      else {
        expect(error.message).toMatch(
          new RegExp(`^a step built could land beside step "a" \\(${a}\\) `),
        );
        expect(error.message).toContain(
          "under the names of the steps they pay for, are the way",
        );
      }
      expect(next.replacedBy).toBeUndefined();
      expect(times(before, alice, 11n * ADA)).toBe(0);
    }
  });

  it("a rollback takes a and the treasury's step out of their blocks: replan answers as for any pair while they are valid, and once both ends have passed says that a rollback took them out; nobody is paid", async () => {
    const ctx = await order();
    const { treasury, before, old } = ctx;
    const next = await old.replan({ id: "order:2" });
    await next.run({ signers: [treasury.other], waitFor: "included" });
    expect(statuses(next)).toEqual({ a: "included", t: "included" });
    const a = old.step("a").txHash;
    const t = next.step("t").txHash;
    // The chain everyone reads is a fork where neither is in a block; the end of a has passed
    rollBack(ctx, before);
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "sent" });
    const valid = await caught(next.replan({ id: "order:3" }));
    expect([valid.code, valid.retryable]).toEqual(["STILL_LIVE", false]);
    expect(valid.details).toEqual({ txHashes: [t, a] });
    expect(valid.message).toMatch(/^a step built could land beside /);
    // Nobody sends them again before the end of the treasury's step passes too
    before.advanceTo({ slot: before.slot + 700 });
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "expired" });
    expect([next.status, next.live, next.landed]).toEqual(["stopped", [], []]);
    for (let i = 0; i < 3; i++) {
      const error = await caught(next.replan({ id: "order:3" }));
      takenOut(error, [t, a]);
      expect(error.message).toBe(
        `step "t" (${t}), step "a" (${a}) of this plan or a plan before it were found in a block, the search does not find them now, and their ends of validity have passed: a rollback took them out, and they land again only if the chain goes back to the blocks that held them, or the provider lost them while they stayed in their blocks. No plan is made in its place: no step this call builds by default is kept apart from them; the application decides how to pay what is left. ${NOT_UNPAID}`,
      );
      before.advanceTo({ slot: before.slot + 1000 });
    }
    expect(next.replacedBy).toBeUndefined();
    expect(times(before, alice, 11n * ADA)).toBe(0);
    expect(times(before, dave, 14n * ADA)).toBe(0);
  });

  it("after that refusal the message names no steps as a way out: no step this call builds by default is kept apart from them, and the application decides how to pay what is left", async () => {
    const ctx = await order();
    const { treasury, before, old } = ctx;
    const next = await old.replan({ id: "order:2" });
    await next.run({ signers: [treasury.other], waitFor: "included" });
    rollBack(ctx, before);
    await next.refresh();
    await next.refresh();
    before.advanceTo({ slot: before.slot + 700 });
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "expired" });
    const refusal = await caught(next.replan({ id: "order:3" }));
    takenOut(refusal, [next.step("t").txHash, old.step("a").txHash]);
    expect(refusal.message).toContain(
      "No plan is made in its place: no step this call builds by default is kept apart from them; the application decides how to pay what is left",
    );
    expect(refusal.message).not.toMatch(/spend an input|are the way/);
    expect(next.replacedBy).toBeUndefined();
  });

  /**
   * The order of the tests above, `a` taken by the plan in its place and the treasury's step
   * never signed; then a rollback that takes `a` out past its end. The application pays what is
   * left by one step of the wallet named `name`, which pays alice, dave and bob and spends an
   * input of `a`; it is in a block. Then the chain goes back to the block that held `a`, where
   * that step cannot land, and every plan of the line is past its ends: none is final
   */
  const paidAgainAs = async (name: string) => {
    const ctx = await order();
    const { emulator, wallet, before, old } = ctx;
    const next = await old.replan({ id: "order:2" });
    expect(statuses(next)).toEqual({ a: "included", t: "built" });
    rollBack(ctx, before);
    await next.refresh();
    await next.refresh();
    before.advanceTo({ slot: before.slot + 700 });
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({ a: "expired", t: "expired" });
    takenOut(await caught(next.replan({ id: "order:3" })), [
      old.step("a").txHash,
    ]);
    const p3 = await next.replan({
      id: "order:3",
      steps: {
        [name]: [
          payTo(alice, 11n * ADA),
          payTo(dave, 14n * ADA),
          payTo(bob, 100n * ADA),
        ],
      },
    });
    const ofA = old.step("a").inputs.map(key);
    expect(p3.step(name).inputs.some((input) => ofA.includes(key(input)))).toBe(
      true,
    );
    await p3.run({ signers: [wallet], waitFor: "included" });
    expect(statuses(p3)).toEqual({ [name]: "included" });
    expect(times(before, alice, 11n * ADA)).toBe(1);
    // Back on the chain that holds a, past every end
    emulator.advanceTo({ slot: before.slot + 1 });
    ctx.provider.control.target = emulator;
    await p3.refresh();
    emulator.advanceTo({ slot: emulator.slot + 700 });
    await p3.refresh();
    await p3.refresh();
    emulator.advanceTo({ slot: emulator.slot + 1001 });
    for (const plan of [p3, next, old]) await plan.refresh();
    expect([old.status, next.status, p3.status]).toEqual([
      "stopped",
      "stopped",
      "stopped",
    ]);
    expect(statuses(p3)).toEqual({ [name]: "expired" });
    expect([p3.replacedBy, p3.live]).toEqual([undefined, []]);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    return { ...ctx, p3 };
  };

  it("a step that pays what an old step was to pay, under a new name: back on the chain that held the old step, replan of its plan without steps builds it again and pays alice twice (the limit a new name leaves)", async () => {
    const { emulator, wallet, p3 } = await paidAgainAs("both");
    const again = await p3.replan({ id: "order:4" });
    expect(names(again)).toEqual(["both"]);
    await again.run({ signers: [wallet], waitFor: "included" });
    expect(times(emulator, alice, 11n * ADA)).toBe(2);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    expect(times(emulator, bob, 100n * ADA)).toBe(1);
  });

  it("the same step under the name of the old step it pays for: there the name is final, nothing is built again under it, and alice is paid once", async () => {
    const { emulator, p3 } = await paidAgainAs("a");
    const error = await caught(p3.replan({ id: "order:4" }));
    expect([error.code, error.details.option]).toEqual([
      "INVALID_OPTION",
      "steps",
    ]);
    expect(error.message).toContain("nothing of the plan is left to build");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 100n * ADA)).toBe(0);
  });

  it("the same rollback with a second step of the wallet on a: the look calls it orphaned, and past its end the refusal names it among those a rollback took out", async () => {
    const ctx = await order(true);
    const { treasury, before, old } = ctx;
    const next = await old.replan({ id: "order:2" });
    expect(names(next)).toEqual(["a", "b", "t"]);
    expect(next.step("b").standsOn).toEqual(["a"]);
    await next.run({ signers: [treasury.other], waitFor: "included" });
    expect(statuses(next)).toEqual({
      a: "included",
      b: "included",
      t: "included",
    });
    rollBack(ctx, before);
    await next.refresh();
    await next.refresh();
    before.advanceTo({ slot: before.slot + 700 });
    await next.refresh();
    await next.refresh();
    expect(statuses(next)).toEqual({
      a: "expired",
      b: "orphaned",
      t: "expired",
    });
    expect(next.step("b").seen).toBeDefined();
    const a = next.step("a").txHash;
    const b = next.step("b").txHash;
    const t = next.step("t").txHash;
    for (let i = 0; i < 2; i++) {
      const error = await caught(next.replan({ id: "order:3" }));
      takenOut(error, [t, a, b]);
      expect(error.message).toBe(
        `step "t" (${t}), step "a" (${a}), step "b" (${b}) of this plan or a plan before it were found in a block, the search does not find them now, and their ends of validity have passed: a rollback took them out, and they land again only if the chain goes back to the blocks that held them, or the provider lost them while they stayed in their blocks. No plan is made in its place: no step this call builds by default is kept apart from them; the application decides how to pay what is left. ${NOT_UNPAID}`,
      );
      before.advanceTo({ slot: before.slot + 1000 });
    }
    expect(next.replacedBy).toBeUndefined();
    expect(times(before, alice, 11n * ADA)).toBe(0);
    expect(times(before, bob, 12n * ADA)).toBe(0);
    expect(times(before, dave, 14n * ADA)).toBe(0);
  });

  it("an old step found in a block before the plan in its place was made, then out of it past its end: its entry keeps no end, and add and replan of a step of another payer give the message of any pair", async () => {
    const ctx = await stepSetup("scalus", {
      funds: [100n * ADA, 50n * ADA],
      builder: { planDefaults: { ...FAST, confirmations: 1000 } },
    });
    const { emulator, builder, wallet } = ctx;
    const treasury = await treasuryOf(emulator);
    const before = emulator.fork();
    const old = await builder.plan(
      { x: payTo(alice, 11n * ADA) },
      { id: "order", payer: wallet },
    );
    await old.run({ waitFor: "included" });
    const x = old.step("x").txHash;
    // A rollback inside the end of x: out of its block, it may land again
    rollBack(ctx, before);
    await old.refresh();
    await old.refresh();
    expect(old.step("x").status).toBe("sent");
    expect(old.step("x").seen).toBeDefined();
    const next = await old.replan({ id: "order:2", ttlMs: 3_600_000 });
    const entry = next.toJSON().before!.open.find((each) => each.txHash === x)!;
    expect(entry.seenBefore).toBeDefined();
    expect(entry.until).toBeUndefined();
    // Past the end of x and any margin
    before.advanceTo({ slot: before.slot + 2000 });
    const d = { d: { parts: payTo(dave, 14n * ADA), payer: treasury.other } };
    const added = await caught(next.add(d));
    expect([added.code, added.retryable]).toEqual(["STILL_LIVE", false]);
    expect(added.details).toEqual({ txHashes: [x] });
    expect(added.message).toMatch(
      new RegExp(`^a step built could land beside step "x" \\(${x}\\) `),
    );
    const replanned = await caught(next.replan({ id: "order:3", steps: d }));
    expect([replanned.code, replanned.retryable]).toEqual([
      "STILL_LIVE",
      false,
    ]);
    expect(replanned.details.txHashes).toContain(x);
    expect(replanned.message).toMatch(/^a step built could land beside /);
    expect(names(next)).toEqual(["x"]);
    expect(times(before, dave, 14n * ADA)).toBe(0);
  });
});

describe("an old transaction that only a step in a block keeps from landing", () => {
  /**
   * A line of three plans. O0 is one step `a`, given built, with no end of validity, sent and
   * held by a relay (a0). O replaces it with a1, which shares the input X with a0 and spends the
   * voucher V besides, and a step `s` after it, sent and held; a1 lands, in a block and not final
   * (1000 confirmations). a0 is in `before.open` of O and not settled: only a1 keeps it from
   * landing, and a step of N that does not stand on a1 could land beside it after a rollback.
   * `before`: the chain taken before a1 landed, where a0 can land
   */
  const line = async (options: { ends?: true } = {}) => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA, 7n * ADA],
      planDefaults: { ...FAST, confirmations: 1000 },
    });
    const { emulator, builder, wallet } = ctx;
    const treasury = await treasuryOf(emulator);
    const voucher = ctx.funded[2]!;
    const isVoucher = (utxo: { txHash: string; outputIndex: number }) =>
      key(utxo) === key(voucher.input);
    const built = await builder.build(payTo(alice, 11n * ADA), {
      payer: wallet,
      canSelect: (utxo) => !isVoucher(utxo),
    });
    const o0 = await builder.plan(
      options.ends === true
        ? { a: payTo(alice, 11n * ADA) }
        : { a: await built.sign({ signers: [wallet] }) },
      { id: "order", payer: wallet, canSelect: (utxo) => !isVoucher(utxo) },
    );
    await o0.sign();
    const a0 = o0.step("a").txHash;
    const hold0 = relayOf(emulator, (txHash) => txHash === a0);
    await caught(o0.run({ submitter: hold0, timeoutMs: 300 }));
    advance(emulator, 1);
    const o = await o0.replan({
      id: "order:2",
      steps: {
        a: [payTo(alice, 11n * ADA), spend.pubKey({ utxo: voucher })],
        s: payTo(bob, 12n * ADA),
      },
    });
    const x = o0.step("a").inputs.map(key);
    expect(o.step("a").inputs.some((input) => x.includes(key(input)))).toBe(
      true,
    );
    const sHash = o.step("s").txHash;
    const before = emulator.fork();
    await caught(
      o.run({
        submitter: relayOf(emulator, (txHash) => txHash === sHash),
        timeoutMs: 300,
      }),
    );
    expect(statuses(o)).toEqual({ a: "included", s: "sent" });
    advance(emulator, 1);
    return {
      ...ctx,
      treasury,
      before,
      o0,
      o,
      a0,
      a1: o.step("a").txHash,
      hold0,
      sHash,
    };
  };

  /** The treasury's payment to a partner, a step with a payer of its own */
  const treasuryStep = (treasury: { other: unknown }) => ({
    parts: payTo(dave, 14n * ADA),
    payer: treasury.other as any,
  });

  /** The record of the new plan is not there, and the old plan is not marked */
  const nothingWritten = async (store: { inner: any }, id: string) => {
    expect(await store.inner.load(id)).toBeUndefined();
    expect((await store.inner.load("order:2"))!.replacedBy).toBeUndefined();
  };

  it("a step of another payer beside it: the call waits for the step in a block and writes nothing; once that step is final it passes", async () => {
    const { emulator, store, treasury, o, a0, a1, hold0 } = await line();
    // s is past its end and dead; a0 has no end, so it is never dead
    advance(emulator, 700);
    await o.refresh();
    expect(statuses(o)).toEqual({ a: "included", s: "expired" });
    const entry = o.toJSON().before!.open.find((each) => each.txHash === a0);
    expect(entry).toBeDefined();
    expect(entry!.until).toBeUndefined();
    const call = () =>
      o.replan({ id: "order:3", steps: { t: treasuryStep(treasury) } });
    const error = await caught(call());
    waits(error, a1, o);
    expect(error.message).toContain(
      `step "t" could land beside step "a" (${a0}) of the plans before, which only step "a" (${a1}), in a block and not final, keeps from landing`,
    );
    await nothingWritten(store, "order:3");
    advance(emulator, 1);
    waits(await caught(call()), a1, o);
    expect(o.replacedBy).toBeUndefined();
    // Once a1 is final, a0 is settled, and the call passes
    advance(emulator, 1000);
    const n = await call();
    expect(names(n)).toEqual(["t"]);
    expect(n.toJSON().before!.final).toEqual(["a"]);
    expect(n.toJSON().before!.open.map((entry) => entry.txHash)).not.toContain(
      a0,
    );
    expect(o.replacedBy).toBe("order:3");
    await n.run({ signers: [treasury.other], waitFor: "included" });
    advance(emulator, 1000);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(await refused(emulator, hold0.kept[0]!)).toBe(true);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    neverTwice(emulator);
  });

  it("a step given built that spends no output of the step in a block: the same wait", async () => {
    const { emulator, builder, store, treasury, o, a0, a1 } = await line();
    advance(emulator, 700);
    await o.refresh();
    const built = await builder.build(payTo(dave, 14n * ADA), {
      payer: treasury.other,
    });
    const signed = await built.sign({ signers: [treasury.other] });
    const call = () => o.replan({ id: "order:3", steps: { x: signed } });
    const error = await caught(call());
    waits(error, a1, o);
    expect(error.message).toContain(
      `step "x" could land beside step "a" (${a0})`,
    );
    await nothingWritten(store, "order:3");
    advance(emulator, 1000);
    const n = await call();
    expect(names(n)).toEqual(["x"]);
    await n.run({ waitFor: "included" });
    advance(emulator, 1000);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    neverTwice(emulator);
  });

  it("the same line with one payer: the step built stands on the step in a block, and the call passes at once", async () => {
    const { emulator, o, a0, hold0 } = await line();
    advance(emulator, 700);
    await o.refresh();
    const n = await o.replan({
      id: "order:3",
      steps: { x: payTo(dave, 14n * ADA) },
    });
    expect(names(n)).toEqual(["a", "x"]);
    expect(n.step("x").standsOn).toEqual(["a"]);
    // a0 is watched: only a1 keeps it from landing, and a1 is not final
    expect(n.toJSON().before!.open.map((entry) => entry.txHash)).toContain(a0);
    await n.run({ waitFor: "included" });
    advance(emulator, 1000);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(await refused(emulator, hold0.kept[0]!)).toBe(true);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    neverTwice(emulator);
  });

  it("a pair that nothing keeps apart beside a pair held by the step in a block: STILL_LIVE comes first", async () => {
    // s is not past its end: it may still land, and nothing keeps the step of the treasury from it
    const { store, treasury, o, sHash } = await line();
    const error = await caught(
      o.replan({ id: "order:3", steps: { t: treasuryStep(treasury) } }),
    );
    expect(error.code).toBe("STILL_LIVE");
    // The held a0 is not among them: s alone is what the call is refused for
    expect(error.details.txHashes).toEqual([sHash]);
    await nothingWritten(store, "order:3");
  });

  it("a transaction that is dead is held too: the step of another payer waits for the step in a block; once it is final the call passes, and trace is told of s alone", async () => {
    // a0 has an end this time: past it, a0 and s are dead, and only a1 keeps a0 from landing
    const { emulator, store, treasury, o, a0, a1, sHash } = await line({
      ends: true,
    });
    advance(emulator, 700);
    await o.refresh();
    expect(statuses(o)).toEqual({ a: "included", s: "expired" });
    const { events, trace } = tracer();
    const call = () =>
      o.replan({
        id: "order:3",
        steps: { t: treasuryStep(treasury) },
        trace,
      });
    const error = await caught(call());
    waits(error, a1, o);
    expect(error.message).toContain(
      `step "t" could land beside step "a" (${a0}) of the plans before, which only step "a" (${a1}), in a block and not final, keeps from landing`,
    );
    await nothingWritten(store, "order:3");
    const warnings = () => events.filter((event) => event.type === "warning");
    expect(warnings()).toEqual([]);
    // Once a1 is final, a0 is settled: no warning of it; s passes by time, as any dead step
    advance(emulator, 1000);
    const n = await call();
    expect(names(n)).toEqual(["t"]);
    expect(n.toJSON().before!.final).toEqual(["a"]);
    expect(warnings()).toEqual([noSharedInput("s", sHash)]);
    await n.run({ signers: [treasury.other], waitFor: "included" });
    advance(emulator, 1000);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    neverTwice(emulator);
  });

  it("a dead old payment that only the step in a block keeps from landing, then a rollback deeper than the margin and less deep than final: the recipient is paid once", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 1000 },
    });
    const { emulator, builder, wallet, provider } = ctx;
    const treasury = await treasuryOf(emulator);
    // O0: the wallet pays dave; a relay holds its bytes (t0)
    const o0 = await builder.plan(
      { t: payTo(dave, 14n * ADA) },
      { id: "order", payer: wallet },
    );
    await o0.sign();
    const t0 = o0.step("t").txHash;
    const hold0 = relayOf(emulator, (txHash) => txHash === t0);
    await caught(o0.run({ submitter: hold0, timeoutMs: 300 }));
    // The chain a rollback goes back to: t0 in no block, its end not passed
    const fork = emulator.fork();
    advance(emulator, 1);
    // O: alice first, then dave again, by the wallet; a1 spends the input of t0 it shares
    const o = await o0.replan({
      id: "order:2",
      steps: { a: payTo(alice, 11n * ADA), t: payTo(dave, 14n * ADA) },
    });
    const x = o0.step("t").inputs.map(key);
    expect(o.step("a").inputs.some((input) => x.includes(key(input)))).toBe(
      true,
    );
    const a1 = o.step("a").txHash;
    const t1 = o.step("t").txHash;
    const hold1 = relayOf(emulator, (txHash) => txHash === t1);
    await caught(o.run({ submitter: hold1, timeoutMs: 300 }));
    advance(emulator, 700);
    await o.refresh();
    expect(statuses(o)).toEqual({ a: "included", t: "expired" });
    // The treasury pays dave in place of the wallet: t0 is dead, and only a1 keeps it from
    // landing; the call waits for a1
    const treasuryCall = () =>
      o.replan({ id: "order:3", steps: { t: treasuryStep(treasury) } });
    const error = await caught(treasuryCall());
    waits(error, a1, o);
    expect(error.message).toContain(
      `step "t" could land beside step "t" (${t0}) of the plans before, which only step "a" (${a1})`,
    );
    await nothingWritten(ctx.store, "order:3");
    // A rollback of 702 blocks, less than the 1000 of final: on the fork t0 lands, a1 cannot
    fork.advanceTo({ slot: fork.slot + 1 });
    provider.control.target = fork;
    expect(await refused(fork, hold0.kept[0]!)).toBe(false);
    advance(fork, 1);
    await o.refresh();
    await o.refresh();
    expect(o.toJSON().stopped).toBe(true);
    expect(o.status).toBe("stopping");
    expect(await refused(fork, o.step("a").signedTx!)).toBe(true);
    // t0 paid dave: once it is final its name is kept, and a plan in place of O pays alice alone
    advance(fork, 1001);
    const kept = await caught(treasuryCall());
    expect([kept.code, kept.details.option]).toEqual([
      "INVALID_OPTION",
      "steps",
    ]);
    const n = await o.replan({ id: "order:3" });
    expect(names(n)).toEqual(["a"]);
    expect(n.toJSON().before!.final).toEqual(["t"]);
    await n.run({ waitFor: "included" });
    advance(fork, 1001);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(await refused(fork, hold1.kept[0]!)).toBe(true);
    expect(times(fork, dave, 14n * ADA)).toBe(1);
    expect(times(fork, alice, 11n * ADA)).toBe(1);
    neverTwice(fork);
  });

  /**
   * N in place of O: a1 taken, s built again on its change and given a long end, so that it
   * waits for a1 to be final unsent
   */
  const replaced = async () => {
    const ctx = await line();
    const { emulator, o, a0 } = ctx;
    advance(emulator, 700);
    await o.refresh();
    const n = await o.replan({ id: "order:3", ttlMs: 3_600_000 });
    expect(names(n)).toEqual(["a", "s"]);
    expect(n.toJSON().steps[0]!.taken).toBe(true);
    expect(n.toJSON().before!.open.map((entry) => entry.txHash)).toContain(a0);
    return { ...ctx, n };
  };

  /** The record of N holds the steps it was made with, and no other */
  const nothingAdded = async (store: { inner: any }) => {
    const record = (await store.inner.load("order:3"))!;
    expect(record.steps.map((step: { name: string }) => step.name)).toEqual([
      "a",
      "s",
    ]);
  };

  it("add of a step of another payer to a plan that holds the step in a block: the call waits for it and adds nothing; once it is final the same add passes, each recipient paid once", async () => {
    const { emulator, store, wallet, treasury, n, a0, a1, hold0 } =
      await replaced();
    const call = () => n.add({ t: treasuryStep(treasury) });
    const error = await caught(call());
    expect([error.code, reasonOf(error), error.txHash]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
      a1,
    ]);
    expect([error.retryable, error.retryAfterMs]).toEqual([true, FAST.pollMs]);
    expect(error.message).toContain(
      `step "t" could land beside step "a" (${a0}) of the plans before, which only step "a" (${a1}), in a block and not final, keeps from landing`,
    );
    expect(names(n)).toEqual(["a", "s"]);
    await nothingAdded(store);
    advance(emulator, 1);
    expect((await caught(call())).txHash).toBe(a1);
    // Once a1 is final, a0 is settled, and the same add passes
    advance(emulator, 1000);
    await call();
    expect(names(n)).toEqual(["a", "s", "t"]);
    await n.run({ signers: [wallet, treasury.other], waitFor: "included" });
    advance(emulator, 1000);
    await n.refresh();
    expect(n.status).toBe("final");
    expect(await refused(emulator, hold0.kept[0]!)).toBe(true);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    neverTwice(emulator);
  });

  it("add beside a pair that nothing keeps apart and a pair held by the step in a block: STILL_LIVE comes first", async () => {
    // s is not past its end: N builds it again on the change of a1, and the old s may still land
    const { store, treasury, o, sHash } = await line();
    const n = await o.replan({ id: "order:3" });
    expect(names(n)).toEqual(["a", "s"]);
    const error = await caught(n.add({ t: treasuryStep(treasury) }));
    expect(error.code).toBe("STILL_LIVE");
    expect(error.details.txHashes).toEqual([sHash]);
    await nothingAdded(store);
  });

  it("add of a step of another payer to a plan that holds the step in a block: while it waits, the step in a block is rolled back for good and the old transaction lands; the plan stops and takes no step, nobody paid twice", async () => {
    const ctx = await replaced();
    const { emulator, provider, store, before, treasury, n, a0, a1, hold0 } =
      ctx;
    const call = () => n.add({ t: treasuryStep(treasury) });
    expect((await caught(call())).txHash).toBe(a1);
    // The chain everyone reads is the fork where a1 never landed; a0 lands there
    before.advanceTo({ slot: emulator.slot + 1 });
    provider.control.target = before;
    expect(await refused(before, hold0.kept[0]!)).toBe(false);
    advance(before, 1);
    await n.refresh();
    expect(n.toJSON().stopped).toBe(true);
    const stopped = await caught(call());
    expect([stopped.code, reasonOf(stopped)]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    await nothingAdded(store);
    // Once a0 is final, a plan in place of N pays bob alone: a0 paid alice
    advance(before, 1001);
    const next = await n.replan({ id: "order:4" });
    expect(names(next)).toEqual(["s"]);
    expect(next.toJSON().before!.final).toEqual(["a"]);
    await next.run({ waitFor: "included" });
    advance(before, 1001);
    await next.refresh();
    expect(next.status).toBe("final");
    expect(await refused(before, ctx.o.step("a").signedTx!)).toBe(true);
    expect(times(before, alice, 11n * ADA)).toBe(1);
    expect(times(before, bob, 12n * ADA)).toBe(1);
    expect(times(before, dave, 14n * ADA)).toBe(0);
    neverTwice(before);
  });

  /**
   * A line for `add`: O0 pays dave (t0), held by a relay; O in its place pays alice (a1, which
   * spends an input of t0) and bob (s1, held); a1 lands, not final; 700 slots on, t0 and s1 are
   * dead. N in place of O holds a1 and builds s again with a long end. `fork`: the chain taken
   * before a1 landed, where t0 can land before its end
   */
  const addLine = async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 1000 },
    });
    const { emulator, builder, wallet } = ctx;
    const treasury = await treasuryOf(emulator);
    const o0 = await builder.plan(
      { t: payTo(dave, 14n * ADA) },
      { id: "order", payer: wallet },
    );
    await o0.sign();
    const t0 = o0.step("t").txHash;
    const hold0 = relayOf(emulator, (txHash) => txHash === t0);
    await caught(o0.run({ submitter: hold0, timeoutMs: 300 }));
    const fork = emulator.fork();
    advance(emulator, 1);
    const o = await o0.replan({
      id: "order:2",
      steps: { a: payTo(alice, 11n * ADA), s: payTo(bob, 12n * ADA) },
    });
    const x = o0.step("t").inputs.map(key);
    expect(o.step("a").inputs.some((input) => x.includes(key(input)))).toBe(
      true,
    );
    const s1 = o.step("s").txHash;
    await caught(
      o.run({
        submitter: relayOf(emulator, (txHash) => txHash === s1),
        timeoutMs: 300,
      }),
    );
    advance(emulator, 700);
    await o.refresh();
    expect(statuses(o)).toEqual({ a: "included", s: "expired" });
    const n = await o.replan({ id: "order:3", ttlMs: 3_600_000 });
    expect(names(n)).toEqual(["a", "s"]);
    expect(n.toJSON().before!.open.map((entry) => entry.txHash)).toContain(t0);
    return {
      ...ctx,
      treasury,
      fork,
      o,
      n,
      t0,
      a1: o.step("a").txHash,
      s1,
      hold0,
    };
  };

  it("add of a step of another payer beside a dead old payment that only the step in a block keeps from landing: the call waits; a rollback deeper than the margin and less deep than final lands the old payment, the plan stops and takes no step, and each recipient is paid once", async () => {
    const { provider, store, treasury, fork, n, t0, a1, hold0 } =
      await addLine();
    const call = () => n.add({ d: treasuryStep(treasury) });
    const error = await caught(call());
    expect([error.code, reasonOf(error), error.txHash]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
      a1,
    ]);
    expect([error.retryable, error.retryAfterMs]).toEqual([true, FAST.pollMs]);
    expect(error.message).toContain(
      `step "d" could land beside step "t" (${t0}) of the plans before, which only step "a" (${a1}), in a block and not final, keeps from landing`,
    );
    expect(names(n)).toEqual(["a", "s"]);
    await nothingAdded(store);
    // A switch to the fork before a1, 702 blocks deep, less than the 1000 of final: t0 lands
    fork.advanceTo({ slot: fork.slot + 1 });
    provider.control.target = fork;
    expect(await refused(fork, hold0.kept[0]!)).toBe(false);
    advance(fork, 1);
    await n.refresh();
    await n.refresh();
    expect(n.toJSON().stopped).toBe(true);
    const stopped = await caught(call());
    expect([stopped.code, reasonOf(stopped)]).toEqual([
      "INVALID_STATE",
      "stopped",
    ]);
    await nothingAdded(store);
    // Once t0 is final, a plan in place of N pays alice and bob
    advance(fork, 1001);
    const next = await n.replan({ id: "order:4" });
    await next.run({ waitFor: "included" });
    advance(fork, 1001);
    await next.refresh();
    expect(next.status).toBe("final");
    expect(times(fork, alice, 11n * ADA)).toBe(1);
    expect(times(fork, bob, 12n * ADA)).toBe(1);
    expect(times(fork, dave, 14n * ADA)).toBe(1);
    neverTwice(fork);
  });

  it("add held by the plan's step that becomes final last: the wait says the plan is final with it and takes no step; once it is final the add is INVALID_STATE (final), and a plan after this one pays the step once", async () => {
    const { emulator, builder, store, wallet, treasury, n, a1, s1 } =
      await addLine();
    await n.run({ waitFor: "included" });
    expect(statuses(n)).toEqual({ a: "included", s: "included" });
    const s2 = n.step("s").txHash;
    // Every step of N in a block and N pending: told to add steps, or to make a plan after it
    const told = await caught(
      n.replan({ id: "order:4", steps: { d: treasuryStep(treasury) } }),
    );
    expect([told.code, reasonOf(told)]).toEqual([
      "CANNOT_OBSERVE",
      "unconfirmed",
    ]);
    expect(told.message).toContain(
      "to pay more, add steps to it while it is pending, or make a plan after it",
    );
    const call = () => n.add({ d: treasuryStep(treasury) });
    const lastForm =
      "once that step is final the plan is final and takes no step: pay it by a plan after this one (after)";
    for (const slots of [0, 400]) {
      // At once, and once a1 is final: s2 is the step that becomes final last
      advance(emulator, slots);
      const error = await caught(call());
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        s2,
      ]);
      expect(error.message).toContain(
        `step "d" could land beside step "s" (${s1}) of the plans before, which only step "s" (${s2}), in a block and not final, keeps from landing: ${lastForm}`,
      );
      expect(error.message).not.toContain("the call passes");
      await nothingAdded(store);
    }
    await n.refresh();
    expect(statuses(n)).toEqual({ a: "final", s: "included" });
    // s2 final: N is final, and takes no step
    advance(emulator, 1000);
    await n.refresh();
    expect(n.status).toBe("final");
    const final = await caught(call());
    expect([final.code, reasonOf(final)]).toEqual(["INVALID_STATE", "final"]);
    // The plan after it pays dave
    const after = await builder.plan(
      { d: treasuryStep(treasury) },
      { id: "order:after", payer: wallet, after: n },
    );
    await after.run({ signers: [treasury.other], waitFor: "included" });
    advance(emulator, 1001);
    await after.refresh();
    expect(after.status).toBe("final");
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
    expect(times(emulator, dave, 14n * ADA)).toBe(1);
    neverTwice(emulator);
    void a1;
  });

  it("add beside two old transactions, each kept from landing by another step in a block: the wait names the step in a block last and says the plan is final with it; once that step is final the add is INVALID_STATE (final)", async () => {
    const ctx = await storeSetup({
      funds: [100n * ADA, 50n * ADA],
      planDefaults: { ...FAST, confirmations: 1000 },
    });
    const { emulator, builder, wallet, store } = ctx;
    const treasury = await treasuryOf(emulator);
    const third = await walletOf(2);
    emulator.fund((await third.getChangeAddress())!, { lovelace: 50n * ADA });
    // O0: the wallet pays dave (t0), held by a relay until it is dead
    const o0 = await builder.plan(
      { t: payTo(dave, 14n * ADA) },
      { id: "order", payer: wallet },
    );
    await o0.sign();
    const t0 = o0.step("t").txHash;
    await caught(
      o0.run({
        submitter: relayOf(emulator, (txHash) => txHash === t0),
        timeoutMs: 300,
      }),
    );
    advance(emulator, 700);
    await o0.refresh();
    // O in its place: the treasury pays carol (u1), held by a relay until it is dead
    const o = await o0.replan({
      id: "order:2",
      steps: { u: { parts: payTo(carol, 13n * ADA), payer: treasury.other } },
    });
    const u1 = o.step("u").txHash;
    await caught(
      o.run({
        signers: [treasury.other],
        submitter: relayOf(emulator, (txHash) => txHash === u1),
        timeoutMs: 300,
      }),
    );
    advance(emulator, 700);
    await o.refresh();
    // N in place of O: p of the treasury spends an input of u1, q of the wallet one of t0
    const n = await o.replan({
      id: "order:3",
      ttlMs: 3_600_000,
      steps: {
        p: { parts: payTo(alice, 11n * ADA), payer: treasury.other },
        q: payTo(bob, 12n * ADA),
      },
    });
    expect(n.toJSON().before!.open.map((entry) => entry.txHash)).toEqual([
      u1,
      t0,
    ]);
    // p lands first; q is held once and lands five slots later
    const q = n.step("q").txHash;
    await caught(
      n.run({
        signers: [wallet, treasury.other],
        submitter: relayOf(emulator, (txHash) => txHash === q),
        timeoutMs: 300,
      }),
    );
    advance(emulator, 5);
    await n.run({ signers: [wallet, treasury.other], waitFor: "included" });
    expect(statuses(n)).toEqual({ p: "included", q: "included" });
    const p = n.step("p").txHash;
    expect(n.step("q").seen!.slot).toBeGreaterThan(n.step("p").seen!.slot);
    // A step of a third payer stands on neither: q is named, at once and once p is final
    const call = () =>
      n.add({ d: { parts: payTo(dave, 15n * ADA), payer: third } });
    const names3 = async () =>
      (await store.inner.load("order:3"))!.steps.map(
        (step: { name: string }) => step.name,
      );
    for (const slots of [0, 996]) {
      advance(emulator, slots);
      const error = await caught(call());
      expect([error.code, reasonOf(error), error.txHash]).toEqual([
        "CANNOT_OBSERVE",
        "unconfirmed",
        q,
      ]);
      expect([error.retryable, error.retryAfterMs]).toEqual([
        true,
        FAST.pollMs,
      ]);
      expect(error.message).toContain(
        `step "d" could land beside step "t" (${t0}) of the plans before, which only step "q" (${q}), in a block and not final, keeps from landing: once that step is final the plan is final and takes no step: pay it by a plan after this one (after)`,
      );
      expect(error.message).not.toContain(p);
      expect(names(n)).toEqual(["p", "q"]);
      expect(await names3()).toEqual(["p", "q"]);
    }
    expect(statuses(n)).toEqual({ p: "final", q: "included" });
    // q final: N is final, and takes no step
    advance(emulator, 10);
    await n.refresh();
    expect(n.status).toBe("final");
    const final = await caught(call());
    expect([final.code, reasonOf(final)]).toEqual(["INVALID_STATE", "final"]);
    expect(times(emulator, alice, 11n * ADA)).toBe(1);
    expect(times(emulator, bob, 12n * ADA)).toBe(1);
    expect(times(emulator, carol, 13n * ADA)).toBe(0);
    expect(times(emulator, dave, 14n * ADA)).toBe(0);
    expect(times(emulator, dave, 15n * ADA)).toBe(0);
  });
});
