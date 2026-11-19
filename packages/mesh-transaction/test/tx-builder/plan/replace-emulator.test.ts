import type { TxEmulator } from "@meshsdk/tx-emulator";
import { CachedFetcher, ProviderError } from "@meshsdk/common";
import { deserializeAddress, mConStr0 } from "@meshsdk/core";

import type { BuildEvent, TxPlan } from "../../../src/tx-builder";
import { guard, spend, validity } from "../../../src/tx-builder";
import { encodePlan, readPlan } from "../../../src/tx-builder/plan/json";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
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

  describe("a step that cannot stand on the step in a block makes the call wait", () => {
    it("a stuck step of another payer in the old plan; three blocks later the call passes", async () => {
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
      waits(
        await caught(old.replan({ id: "order:2" })),
        old.step("a").txHash,
        old,
      );
      advance(ctx.emulator, 3);
      const next = await old.replan({ id: "order:2" });
      expect(names(next)).toEqual(["t"]);
      expect(next.toJSON().before!.final).toEqual(["a"]);
      await next.run({ signers: [treasury.other], waitFor: "included" });
      advance(ctx.emulator, 3);
      await next.refresh();
      expect(next.status).toBe("final");
      expect(await refused(ctx.emulator, relay.kept[0]!)).toBe(true);
      neverTwice(ctx.emulator);
    });

    it("a step given built that spends no output of it", async () => {
      const { emulator, builder, old } = await inBlock();
      const treasury = await treasuryOf(emulator);
      const built = await builder.build(payTo(dave, 14n * ADA), {
        payer: treasury.other,
      });
      waits(
        await caught(
          old.replan({
            id: "order:2",
            steps: {
              b: payTo(bob, 12n * ADA),
              c: payTo(carol, 13n * ADA),
              x: built,
            },
          }),
        ),
        old.step("a").txHash,
        old,
      );
      neverTwice(emulator);
    });

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
