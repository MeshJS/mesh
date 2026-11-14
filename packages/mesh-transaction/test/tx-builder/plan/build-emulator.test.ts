import type { UTxO } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import type { TxBuildError, TxPlanError, Utxo } from "../../../src/tx-builder";
import {
  collateral,
  mint,
  spend,
  TxError,
  validity,
} from "../../../src/tx-builder";
import { planOver, recordOf } from "../../../src/tx-builder/plan/plan";
import { cip30Wallet } from "../../cip30-wallet";
import { alwaysSucceedCbor } from "../../test-util";
import { asMesh, ref } from "../utxo-util";
import {
  advance,
  caught,
  FAST,
  pay,
  setup,
  submitterOf,
  swallowing,
  walletOf,
  words,
} from "./plan-emulator-util";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

/** `txHash#index` of a UTxO given in the Mesh form or returned in the builder's */
const keyOf = (utxo: UTxO | Utxo) => {
  const { txHash, outputIndex } = "input" in utxo ? utxo.input : utxo;
  return `${txHash}#${outputIndex}`;
};

const refusing = () =>
  submitterOf(async () => {
    throw { kind: "rejected" };
  });

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

describe("TxPlan.build on TxEmulator", () => {
  it("is SCRIPT_FAILED for an attempt found with is_valid = false, and builds nothing", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const plan = builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await plan.send();
    const txHash = plan.txHash!;
    // The provider now says the attempt's scripts failed
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      const info = await forward(hash);
      return hash === txHash ? { ...info, validContract: false } : info;
    };
    expectCode(await caught(plan.send()), "SCRIPT_FAILED");
    expect(plan.status).toBe("failed");
    expect(plan.live).toEqual([]);
    const reads = () =>
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "fetchProtocolParameters",
      );
    const before = reads();
    expectCode(await caught(plan.build()), "SCRIPT_FAILED");
    expect(reads()).toBe(before);
    expect(plan.attempts).toHaveLength(1);
  });

  it("is SCRIPT_FAILED when the search before a new attempt finds an expired attempt with is_valid = false", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const plan = builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await plan.send({ submitter: swallowing() });
    const { txHash, until } = plan.attempts[0]!;
    emulator.advanceTo({ time: until });
    await plan.refresh();
    expect(plan.status).toBe("expired");
    // A late search finds it in a block, its scripts failed
    const tip = await emulator.fetchLatestBlock();
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) =>
      hash === txHash
        ? {
            hash,
            slot: String(Number(tip.slot) - 1),
            block: tip.hash,
            blockHeight: tip.height,
            validContract: false,
          }
        : forward(hash);
    expectCode(await caught(plan.build()), "SCRIPT_FAILED");
    expect(plan.status).toBe("failed");
    expect(plan.attempts).toHaveLength(1);
    expect(plan.live).toEqual([]);
  });

  it("spends the anchor in a later attempt, also where selection would not take it", async () => {
    const { emulator, builder, wallet, address } = await setup({
      funds: [20_000_000n],
    });
    const plan = builder.plan(pay(), { payer: wallet });
    const first = await plan.build();
    const anchor = recordOf(plan).anchor.anchors[0]!;
    expect(anchor.kind).toBe("payer");
    expect(first.inputs.map(ref)).toEqual([ref(anchor.utxo)]);
    await plan.sign();
    await caught(plan.send({ submitter: refusing() }));
    // A larger UTxO arrives: selection alone would pay from it
    emulator.fund(address, { lovelace: 500_000_000n });
    advance(emulator, 1);
    const second = await plan.build();
    expect(second.inputs).toHaveLength(1);
    expect(second.inputs.map(ref)).toContainEqual(ref(anchor.utxo));
    expect(recordOf(plan).anchor.anchors).toHaveLength(1);
    expect(recordOf(plan).anchor.anchors[0]!.attempts).toEqual([
      first.txHash,
      second.txHash,
    ]);
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
  });

  it("is INPUTS_SPENT for an explicit input that is gone", async () => {
    const { emulator, builder, wallet, address, funded } = await setup();
    const explicit = funded[1]!;
    const plan = builder.plan(
      [spend.pubKey({ utxo: explicit }), pay(30_000_000n)],
      { payer: wallet },
    );
    await plan.build();
    // Another transaction spends the explicit input
    const spender = await builder.build(
      [spend.pubKey({ utxo: explicit }), pay(2_000_000n, address)],
      { payer: { changeAddress: address, utxos: [explicit] } },
    );
    await emulator.submitTx(await wallet.signTx(spender.tx));
    expectCode(await caught(plan.send()), "REJECTED");
    const error = (await caught(plan.build())) as TxPlanError<"INPUTS_SPENT">;
    expectCode(error, "INPUTS_SPENT");
    expect(error.retryable).toBe(false);
    expect(error.details.inputs).toEqual([explicit.input]);
    expect(plan.attempts).toHaveLength(1);
  });

  it("is INPUTS_SPENT for an explicit input gone before the first attempt; nothing recorded, signed or sent", async () => {
    // The input covers the payment, or the payment also needs a UTxO of the payer
    for (const lovelace of [3_000_000n, 30_000_000n]) {
      const { emulator, builder, wallet, address, funded, provider } =
        await setup();
      const explicit = funded[1]!;
      const spender = await builder.build(
        [spend.pubKey({ utxo: explicit }), pay(2_000_000n, address)],
        { payer: { changeAddress: address, utxos: [explicit] } },
      );
      await emulator.submitTx(await wallet.signTx(spender.tx));
      // The plan signs with a wallet's signTxWitnesses where it has one
      const signers = [
        jest.spyOn(wallet, "signTxWitnesses"),
        jest.spyOn(wallet, "signTx"),
      ];
      const plan = builder.plan(
        [spend.pubKey({ utxo: explicit }), pay(lovelace)],
        { payer: wallet },
      );
      for (const call of [
        () => plan.build(),
        () => plan.build(),
        () => plan.send(),
      ]) {
        const error = (await caught(call())) as TxPlanError<"INPUTS_SPENT">;
        expectCode(error, "INPUTS_SPENT");
        expect(error.retryable).toBe(false);
        expect(error.details.inputs).toEqual([explicit.input]);
      }
      expect(plan.status).toBe("draft");
      expect(plan.attempts).toHaveLength(0);
      for (const signer of signers) expect(signer).not.toHaveBeenCalled();
      expect(provider.control.count("submitTx")).toBe(0);
    }
  });

  it("builds a first attempt on an explicit input of knownUtxos that the provider does not know yet", async () => {
    const { builder, wallet, address, funded } = await setup();
    // An output of a transaction that is not on chain yet
    const parent = await builder.build([pay(10_000_000n, address)], {
      payer: { changeAddress: address, utxos: [funded[1]!] },
    });
    const pending = parent.outputs[0]!;
    const plan = builder.plan(
      [spend.pubKey({ utxo: pending }), pay(30_000_000n)],
      { payer: wallet, knownUtxos: [pending] },
    );
    const built = await plan.build();
    expect(built.inputs.map(ref)).toContainEqual(ref(pending));
    expect(plan.status).toBe("built");
  });

  it("is INVALID_OPTION at builder.plan for an entry of knownUtxos that is not a UTxO", async () => {
    const { builder, wallet, funded } = await setup();
    let error: unknown;
    try {
      builder.plan(pay(), {
        payer: wallet,
        knownUtxos: [funded[0]!, { txHash: "ab".repeat(32) } as never],
      });
    } catch (e) {
      error = e;
    }
    expectCode(error, "INVALID_OPTION");
    expect((error as TxBuildError<"INVALID_OPTION">).details).toMatchObject({
      option: "knownUtxos",
      value: { txHash: "ab".repeat(32) },
    });
    expect((error as Error).message).toContain("entry 1 is not a UTxO");
  });

  it("builds the replacement when the read of an explicit input's address gives no answer", async () => {
    const noAnswers = [
      async () => [],
      async () => {
        throw new Error("down");
      },
    ];
    for (const noAnswer of noAnswers) {
      const { emulator, builder, wallet, address, funded, provider } =
        await setup();
      const explicit = funded[1]!;
      const plan = builder.plan(
        [spend.pubKey({ utxo: explicit }), pay(30_000_000n)],
        { payer: wallet },
      );
      await plan.build();
      const spender = await builder.build(
        [spend.pubKey({ utxo: explicit }), pay(2_000_000n, address)],
        { payer: { changeAddress: address, utxos: [explicit] } },
      );
      await emulator.submitTx(await wallet.signTx(spender.tx));
      expectCode(await caught(plan.send()), "REJECTED");
      // An empty or failed read is unknown: the input is not taken as spent
      provider.control.hooks.fetchAddressUTxOs = noAnswer;
      advance(emulator, 1);
      const next = await plan.build({
        payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
      });
      expect(plan.attempts).toHaveLength(2);
      expect(plan.txHash).toBe(next.txHash);
      expect(next.inputs.map(ref)).toContainEqual(explicit.input);
    }
  });

  it("returns the attempt that landed between its search and the read of an explicit input", async () => {
    const { emulator, builder, wallet, provider, funded } = await setup();
    const explicit = funded[1]!;
    const plan = builder.plan(
      [spend.pubKey({ utxo: explicit }), pay(30_000_000n)],
      { payer: wallet },
    );
    // The submitter passes the bytes on, then says they were refused
    await caught(
      plan.send({
        submitter: submitterOf(async (tx) => {
          await emulator.submitTx(tx);
          throw { kind: "rejected" };
        }),
      }),
    );
    expect(plan.status).toBe("rejected");
    // The first search does not find it
    let hidden = 1;
    const txHash = plan.txHash!;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === txHash && hidden-- > 0)
        throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    const built = await plan.build();
    expect(built.txHash).toBe(txHash);
    expect(plan.status).toBe("final");
    expect(plan.attempts).toHaveLength(1);
  });

  it("returns and shows an earlier attempt that landed after a later one was built", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    let hidden: string | undefined;
    let anchor: Utxo | undefined;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === hidden) throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    // A lagging provider: while the first attempt is hidden, its address still lists the anchor
    provider.control.hooks.fetchAddressUTxOs = async (forward, address) => {
      const utxos: UTxO[] = await forward(address);
      return hidden && anchor && anchor.address === address
        ? [...utxos, asMesh(anchor)]
        : utxos;
    };
    const plan = builder.plan(pay(), { payer: wallet });
    const first = await plan.build();
    anchor = recordOf(plan).anchor.anchors[0]!.utxo;
    // The submitter passes the bytes on and says they were refused; the search does not see them
    hidden = first.txHash;
    await caught(
      plan.send({
        submitter: submitterOf(async (tx) => {
          await emulator.submitTx(tx);
          throw { kind: "rejected" };
        }),
      }),
    );
    expect(plan.status).toBe("rejected");
    advance(emulator, 1);
    const second = await plan.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(plan.txHash).toBe(second.txHash);

    // The first attempt shows up
    hidden = undefined;
    await plan.refresh();
    expect(plan.status).toBe("final");
    expect(plan.landed?.txHash).toBe(first.txHash);
    expect(plan.txHash).toBe(first.txHash);
    expect(plan.built).toBe(first);
    expect((await plan.build()).txHash).toBe(first.txHash);
    expect(plan.attempts).toHaveLength(2);
  });

  it("records one attempt when two calls on the object build at once", async () => {
    const { builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    const [a, b] = await Promise.all([plan.build(), plan.build()]);
    expect(b.txHash).toBe(a.txHash);
    expect(plan.attempts).toHaveLength(1);
    const asked: string[] = [];
    const counting = {
      signTx: async (tx: string) => {
        asked.push(tx);
        return wallet.signTx(tx, true);
      },
    };
    await plan.send({ signers: counting, waitFor: "included" });
    expect(asked).toEqual([a.tx]);
    expect(plan.txHash).toBe(a.txHash);
    expect(plan.status).toBe("final");

    // A build and a send from draft at once
    const other = builder.plan(pay(), { payer: wallet });
    const [built] = await Promise.all([
      other.build(),
      other.send({ waitFor: "included" }),
    ]);
    expect(other.attempts).toHaveLength(1);
    expect(other.txHash).toBe(built.txHash);
    expect(other.status).toBe("final");
  });

  it("puts up the collateral a CIP-30 payer gives through getCollateral", async () => {
    const { emulator, builder, address } = await setup({ funds: [] });
    const reserve = emulator.fund(address, { lovelace: 5_000_000n });
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 20_000_000n,
    });
    const asked: string[] = [];
    // The wallet keeps its collateral out of getUtxos
    const api = await cip30Wallet({
      words,
      fetcher: emulator,
      utxos: async () => [],
      collateral: async ({ amount }) => {
        asked.push(amount);
        return [toTxUnspentOutput(reserve).toCbor().toString()];
      },
    });
    const plan = builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: api },
    );
    const built = await plan.build();
    expect(asked).toHaveLength(1);
    expect(built.collateral!.inputs.map(ref)).toEqual([reserve.input]);
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
  });

  it("tops up given collateral in each attempt, and records the option", async () => {
    const { emulator, builder, wallet, address } = await setup({
      funds: [100_000_000n],
    });
    // Too small to be the collateral alone
    const given = emulator.fund(address, { lovelace: 200_000n });
    const five = emulator.fund(address, { lovelace: 5_000_000n });
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 20_000_000n,
    });
    const parts = () => [
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      collateral({ utxo: given.input, label: "given" }),
    ];
    const plan = builder.plan(parts(), {
      payer: wallet,
      topUpCollateral: true,
    });
    expect(recordOf(plan).options).toMatchObject({ topUpCollateral: true });
    const first = await plan.build();
    expect(first.collateral!.inputs.map(ref)).toEqual([
      given.input,
      five.input,
    ]);
    await plan.send({ submitter: submitterOf(async () => plan.txHash!) });
    emulator.advanceTo({ time: plan.attempts[0]!.until + 1_000 });
    expectCode(await caught(plan.send()), "EXPIRED");
    const second = await plan.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.collateral!.inputs.map(ref)).toEqual([
      given.input,
      five.input,
    ]);
    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");

    // Turned off, the given input is put up as given, and falls short
    const off = builder.plan(parts(), {
      payer: wallet,
      topUpCollateral: false,
    });
    expect(recordOf(off).options).toMatchObject({ topUpCollateral: false });
    expectCode(await caught(off.build()), "INSUFFICIENT_COLLATERAL");
    expect(off.attempts).toHaveLength(0);
  });

  it("is MISSING_PAYER without a payer, and after a snapshot served an attempt", async () => {
    const { emulator, builder, wallet, address } = await setup();
    const none = builder.plan(pay());
    const error = (await caught(none.build())) as TxBuildError;
    expectCode(error, "MISSING_PAYER");
    expect(error.message).toContain("snapshot");
    expect(none.status).toBe("draft");

    const snapshot = () => ({
      changeAddress: address,
      utxos: emulator.utxos({ address }),
    });
    const plan = builder.plan(pay(), { payer: snapshot() });
    await plan.build();
    await caught(plan.send({ submitter: refusing(), signers: wallet }));
    expect(plan.status).toBe("rejected");
    advance(emulator, 1);
    expectCode(await caught(plan.build()), "MISSING_PAYER");
    await plan.build({ payer: snapshot() });
    expect(plan.attempts).toHaveLength(2);
  });

  it("checks the payer when it builds, not when the plan is made", async () => {
    const { builder } = await setup();
    const empty = builder.plan(pay(), { payer: null as never });
    expect(empty.status).toBe("draft");
    expectCode(await caught(empty.build()), "MISSING_PAYER");
    const odd = builder.plan(pay(), { payer: 42 as never });
    expectCode(await caught(odd.build()), "INVALID_OPTION");
    expect(odd.status).toBe("draft");
    const over = planOver(builder, recordOf(odd), { payer: 42 as never });
    expectCode(await caught(over.build()), "INVALID_OPTION");
  });

  it("over a record without a payer: takes witnesses, resends, observes, and builds nothing new", async () => {
    const { emulator, builder, wallet } = await setup();
    const made = builder.plan(pay(), { payer: wallet });
    await made.build();
    const restored = planOver(builder, recordOf(made));
    expect(restored.status).toBe("built");
    await restored.addWitnesses(await wallet.signTx(made.built!.tx, true));
    expect(restored.status).toBe("signed");
    await restored.send({
      submitter: submitterOf(async () => restored.txHash!),
    });
    expect(restored.status).toBe("sent");
    // The same bytes again, through the provider
    await restored.send({ waitFor: "included" });
    expect(restored.status).toBe("final");

    const lost = builder.plan(pay(), { payer: wallet });
    await lost.send({ submitter: submitterOf(async () => lost.txHash!) });
    emulator.advanceTo({ time: lost.attempts[0]!.until + 1_000 });
    const over = planOver(builder, recordOf(lost));
    expectCode(await caught(over.send()), "EXPIRED");
    expectCode(await caught(over.build()), "MISSING_PAYER");
    // advance() with a signer builds through build(): MISSING_PAYER too
    expectCode(
      await caught(over.advance({ signers: wallet })),
      "MISSING_PAYER",
    );
    expect(over.attempts).toHaveLength(1);
    // It closes without a payer
    await over.abandon();
    expect(over.status).toBe("abandoned");
  });

  it("is CANNOT_OBSERVE (unconfirmed) without a tip, and with a tip older than one read", async () => {
    let tipFails = true;
    const { builder, wallet, provider } = await setup({
      hooks: {
        fetchLatestBlock: async (forward) => {
          if (tipFails) throw new Error("no tip now");
          return forward();
        },
      },
    });
    let asked = 0;
    const signer = {
      signTx: async (tx: string) => {
        asked += 1;
        return wallet.signTx(tx, true);
      },
    };
    for (const parts of [
      pay(),
      [pay(), validity({ until: Date.now() + 600_000 })],
    ]) {
      const plan = builder.plan(parts, { payer: wallet });
      const error = (await caught(
        plan.send({ signers: signer }),
      )) as TxPlanError<"CANNOT_OBSERVE">;
      expectCode(error, "CANNOT_OBSERVE");
      expect(error.details.reason).toBe("unconfirmed");
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(10);
      expect(plan.status).toBe("draft");
      expect(asked).toBe(0);
    }

    // An older tip
    tipFails = false;
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.build();
    await caught(plan.send({ submitter: refusing() }));
    const tip = await provider.control.target.fetchLatestBlock();
    provider.control.hooks.fetchLatestBlock = async () => ({
      ...tip,
      slot: String(Number(tip.slot) - 5),
      height: tip.height! - 5,
    });
    const error = (await caught(plan.build())) as TxPlanError<"CANNOT_OBSERVE">;
    expectCode(error, "CANNOT_OBSERVE");
    expect(error.details.reason).toBe("unconfirmed");
    expect(plan.attempts).toHaveLength(1);
  });

  it("sets the deadline from the tip and ttlMs, and keeps an explicit until", async () => {
    const { emulator, builder, wallet } = await setup();
    const ttlMs = 120_000;
    const plan = builder.plan(pay(), { payer: wallet, ttlMs });
    const parts = recordOf(plan).parts;
    const built = await plan.build();
    expect(built.validity?.until).toBe(emulator.time + ttlMs);
    expect(plan.attempts[0]?.until).toBe(emulator.time + ttlMs);
    expect(recordOf(plan).parts).toBe(parts);
    expect(recordOf(plan).parts).toHaveLength(1);

    // A lower bound later than the tip: from + ttlMs
    const from = emulator.time + 30_000;
    const later = builder.plan([pay(), validity({ from, label: "start" })], {
      payer: wallet,
      ttlMs,
    });
    expect((await later.build()).validity).toMatchObject({
      from,
      until: from + ttlMs,
    });

    // An explicit until is kept
    const until = emulator.time + 50_000;
    const fixed = builder.plan([pay(), validity({ until })], {
      payer: wallet,
      ttlMs,
    });
    expect((await fixed.build()).validity?.until).toBe(until);
  });

  it("is INVALID_STATE (pastHorizon) for a Plutus attempt past the forecast horizon", async () => {
    const { emulator, builder, wallet } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const spendLocked = spend.plutus({
      utxo: locked,
      script: plutus,
      redeemer: { data: mConStr0([]) },
    });
    const far = builder.plan(spendLocked, {
      payer: wallet,
      ttlMs: 129_601_000,
    });
    const error = (await caught(far.build())) as TxPlanError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("pastHorizon");
    expect(far.status).toBe("draft");
    // At the horizon itself
    const near = builder.plan(spendLocked, {
      payer: wallet,
      ttlMs: 129_600_000,
    });
    await near.build();
    // A native script is not checked
    const native = builder.plan(
      mint.native({
        script: { type: "all", scripts: [] },
        assets: { "01": 1n },
      }),
      { payer: wallet, ttlMs: 129_601_000 },
    );
    await native.build();
    expect(native.attempts).toHaveLength(1);
  });

  it("is INVALID_STATE (tooManyAttempts) for a 17th attempt", async () => {
    const { emulator, builder, wallet } = await setup();
    const plan = builder.plan(pay(), { payer: wallet });
    for (let i = 0; i < 16; i++) {
      advance(emulator, 1);
      await plan.build();
      await caught(plan.send({ submitter: refusing() }));
    }
    expect(plan.attempts).toHaveLength(16);
    advance(emulator, 1);
    const error = (await caught(plan.build())) as TxPlanError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("tooManyAttempts");
    expect(plan.attempts).toHaveLength(16);
  }, 30_000);

  it("compares the payer with the record only when it builds a new attempt", async () => {
    const { emulator, builder, wallet, address } = await setup();
    const other = await walletOf(1);
    const otherAddress = (await other.getChangeAddress())!;
    emulator.fund(otherAddress, { lovelace: 50_000_000n });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: submitterOf(async () => plan.txHash!) });
    const sent = plan.built!;
    // While sent, a build with another payer returns the attempt, and send resends it
    expect(await plan.build({ payer: other })).toBe(sent);
    const resent = submitterOf(async () => plan.txHash!);
    await plan.send({ submitter: resent });
    expect(resent.calls).toEqual([plan.signedTx]);

    emulator.advanceTo({ time: plan.attempts[0]!.until + 1_000 });
    expectCode(await caught(plan.send()), "EXPIRED");
    const error = (await caught(plan.build())) as TxPlanError<"PAYER_MISMATCH">;
    expectCode(error, "PAYER_MISMATCH");
    expect(error.details).toEqual({ recorded: address, given: otherAddress });
    expect(plan.attempts).toHaveLength(1);
    // The same from advance() with signers, which builds; nothing built
    expectCode(
      await caught(plan.advance({ signers: wallet })),
      "PAYER_MISMATCH",
    );
    expect(plan.attempts).toHaveLength(1);

    // Another change address that holds the recorded anchor is accepted; the change goes to the
    // recorded address
    const anchor = recordOf(plan).anchor.anchors[0]!.utxo;
    const built = await plan.build({
      payer: {
        changeAddress: otherAddress,
        utxos: emulator.utxos({ address }),
      },
    });
    expect(plan.attempts).toHaveLength(2);
    expect(built.inputs.map(ref)).toContainEqual(ref(anchor));
    expect(built.change.every((c) => c.address === address)).toBe(true);
  });

  it("is FEE_TOO_LOW for a new attempt its fee does not cover, and records nothing", async () => {
    const { emulator, builder, wallet, address } = await setup({
      funds: [10_000_000n, 10_000_000n],
    });
    const parts = pay(15_000_000n);
    const plain = await builder.build(parts, { payer: wallet });
    const fee = plain.fee + 2_000n;
    const plan = builder.plan(parts, { payer: wallet, fee });
    const first = await plan.build();
    expect(first.fee).toBe(fee);
    expect(first.inputs).toHaveLength(2);
    expect(first.warnings.map((w) => w.code)).toContain("FEE_ABOVE_MINIMUM");
    await plan.send({ submitter: submitterOf(async () => plan.txHash!) });
    emulator.advanceTo({ time: plan.attempts[0]!.until + 1_000 });
    expectCode(await caught(plan.send()), "EXPIRED");

    // The other UTxO is replaced with small ones: selection takes more of them
    const anchor = recordOf(plan).anchor.anchors[0]!.utxo;
    const others = emulator
      .utxos({ address })
      .filter((utxo) => utxo.input.txHash !== anchor.txHash);
    emulator.removeUtxos(others.map((utxo) => utxo.input));
    for (let i = 0; i < 8; i++)
      emulator.fund(address, { lovelace: 1_500_000n });
    const error = (await caught(plan.build())) as TxBuildError<"FEE_TOO_LOW">;
    expectCode(error, "FEE_TOO_LOW");
    expect(error.details.fee).toBe(fee);
    expect(error.details.minFee).toBeGreaterThan(fee);
    expect(plan.attempts).toHaveLength(1);
    expect(plan.status).toBe("expired");
  });

  it("chooses the first anchor among the payer's inputs a fresh read shows", async () => {
    const { emulator, builder, provider, address } = await setup();
    // The wallet reads its UTxOs from the emulator itself, not through the wrapped provider
    const wallet = new MeshWallet({
      networkId: 0,
      key: { type: "mnemonic", words },
      fetcher: emulator,
      submitter: emulator,
    });
    await wallet.init();
    const hidden = new Set<string>();
    const key = keyOf;
    provider.control.hooks.fetchAddressUTxOs = async (forward, a: string) =>
      ((await forward(a)) as UTxO[]).filter((utxo) => !hidden.has(key(utxo)));
    // A UTxO that is never selected, so that a read hiding the others still answers
    const kept = emulator.fund(address, { lovelace: 3_000_000n });
    const canSelect = (utxo: Utxo) => key(utxo) !== key(kept);
    const options = { payer: wallet, canSelect };

    // Both payer inputs hidden: no anchor can be confirmed
    const both = builder.plan(pay(110_000_000n), options);
    for (const utxo of emulator.utxos({ address }))
      if (key(utxo) !== key(kept)) hidden.add(key(utxo));
    const error = (await caught(both.build())) as TxPlanError<"CANNOT_OBSERVE">;
    expectCode(error, "CANNOT_OBSERVE");
    expect(error.details.reason).toBe("unconfirmed");
    expect(error.retryAfterMs).toBe(10);
    expect(both.status).toBe("draft");
    hidden.clear();
    await both.build();
    expect(both.status).toBe("built");

    // The first in the ledger's order hidden: the second is the anchor
    const plan = builder.plan(pay(110_000_000n), options);
    const probe = await builder.build(pay(110_000_000n), options);
    const [firstInput, secondInput] = probe.inputs;
    hidden.add(key(firstInput!));
    const built = await plan.build();
    expect(built.inputs).toEqual(probe.inputs);
    expect(recordOf(plan).anchor.anchors.map((a) => ref(a.utxo))).toEqual([
      ref(secondInput!),
    ]);
    hidden.clear();
    await caught(plan.send({ submitter: refusing() }));
    advance(emulator, 1);

    // A read that answers [] or throws is unknown: the first candidate is the anchor
    for (const answer of [
      async () => [],
      async () => {
        throw new Error("down");
      },
    ]) {
      provider.control.hooks.fetchAddressUTxOs = answer;
      const plain = builder.plan(pay(110_000_000n), options);
      await plain.build();
      expect(recordOf(plain).anchor.anchors.map((a) => ref(a.utxo))).toEqual([
        ref(firstInput!),
      ]);
    }

    // The replacement spends the recorded anchor: the other input is gone, and a larger UTxO
    // would pay alone
    delete provider.control.hooks.fetchAddressUTxOs;
    emulator.removeUtxos([ref(firstInput!)]);
    emulator.fund(address, { lovelace: 300_000_000n });
    const next = await plan.build({
      payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
    });
    expect(plan.attempts).toHaveLength(2);
    const spent = next.inputs.map(ref);
    expect(spent).toContainEqual(ref(secondInput!));
    expect(spent).not.toContainEqual(ref(firstInput!));
  });

  it("reads only the tip, or nothing, when it returns an attempt it has", async () => {
    let tipFails = false;
    const { emulator, builder, wallet, provider } = await setup({
      hooks: {
        fetchLatestBlock: async (forward) => {
          if (tipFails) throw new Error("no tip now");
          return forward();
        },
      },
    });
    const reads = () =>
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "fetchProtocolParameters",
      );
    const plan = builder.plan(pay(), { payer: wallet });
    const built = await plan.build();
    let before = reads();
    expect(await plan.build()).toBe(built);
    expect(reads()).toBe(before + 1);
    expect(provider.control.count("fetchLatestBlock")).toBeGreaterThan(0);
    tipFails = true;
    expect(await plan.build()).toBe(built);
    tipFails = false;

    await plan.sign();
    expect(plan.status).toBe("signed");
    before = reads();
    expect(await plan.build()).toBe(built);
    expect(reads()).toBe(before + 1);

    await plan.send({ submitter: submitterOf(async () => plan.txHash!) });
    before = reads();
    expect(await plan.build()).toBe(built);
    expect(reads()).toBe(before);

    await plan.send({ waitFor: "included" });
    expect(plan.status).toBe("final");
    before = reads();
    expect(await plan.build()).toBe(built);
    expect(reads()).toBe(before);

    // In included, on a builder with a depth: the landed attempt, without a request
    const deep = await setup({
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const landing = deep.builder.plan(pay(), { payer: deep.wallet });
    await landing.send({ waitFor: "included" });
    expect(landing.status).toBe("included");
    const deepReads = () =>
      deep.provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "fetchProtocolParameters",
      );
    before = deepReads();
    expect(await landing.build()).toBe(landing.built);
    expect(deepReads()).toBe(before);

    // Past its until, a built attempt gets a new one
    const late = builder.plan(pay(), { payer: wallet });
    const old = await late.build();
    emulator.advanceTo({ time: late.attempts[0]!.until });
    const fresh = await late.build();
    expect(fresh.txHash).not.toBe(old.txHash);
    expect(late.attempts).toHaveLength(2);
  });

  it("takes only the payer UTxOs the replaced attempt used in a new attempt of a plan with sendAllTo", async () => {
    const { emulator, builder, address } = await setup({ funds: [] });
    // A UTxO too small to put up as collateral with its tokens, and one the wallet keeps for it
    const token = "c0ffee".padEnd(56, "0") + "746f6b656e";
    const funded = [
      emulator.fund(address, { lovelace: 1_300_000n, [token]: 5n }),
    ];
    const reserve = emulator.fund(address, { lovelace: 5_000_000n });
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 20_000_000n,
    });
    const cbor = (utxo: UTxO) => toTxUnspentOutput(utxo).toCbor().toString();
    const key = keyOf;
    // The wallet keeps its collateral out of getUtxos, and lists every other UTxO it has
    const api = await cip30Wallet({
      words,
      fetcher: emulator,
      utxos: async () =>
        emulator
          .utxos({ address })
          .filter((utxo) => key(utxo) !== key(reserve))
          .map(cbor),
      collateral: async () => [cbor(reserve)],
    });
    const to = (await (await walletOf(1)).getChangeAddress())!;
    const plan = builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: api, sendAllTo: to },
    );
    const first = await plan.build();
    const paid = new Set(funded.map(key));
    expect(new Set(first.inputs.map(key))).toEqual(
      new Set([...paid, key(locked)]),
    );
    expect(first.collateral!.inputs.map(key)).toEqual([key(reserve)]);
    await plan.sign({ signers: api.wallet });
    await plan.send({ submitter: submitterOf(async () => first.txHash) });

    // A UTxO that arrives later is not taken, with or without a filter
    const later = emulator.fund(address, { lovelace: 300_000_000n });
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    expectCode(await caught(plan.send()), "EXPIRED");
    const second = await plan.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(new Set(second.inputs.map(key))).toEqual(
      new Set([...paid, key(locked)]),
    );
    expect(second.inputs.map(key)).not.toContain(key(later));
    // The collateral-only UTxO is collateral again, and is not spent
    expect(second.collateral!.inputs.map(key)).toEqual([key(reserve)]);
    expect(second.inputs.map(key)).not.toContain(key(reserve));

    // None of them left: INSUFFICIENT_FUNDS, nothing built
    await plan.sign({ signers: api.wallet });
    await plan.send({ submitter: submitterOf(async () => second.txHash) });
    emulator.advanceTo({ time: plan.attempts[1]!.until });
    expectCode(await caught(plan.send()), "EXPIRED");
    emulator.removeUtxos([...funded, reserve].map((utxo) => utxo.input));
    const error = (await caught(plan.build())) as TxBuildError;
    expectCode(error, "INSUFFICIENT_FUNDS");
    expect(error.message).toContain("sendAllTo");
    expect(plan.attempts).toHaveLength(2);
  });

  it("builds a new attempt of a plan with sendAllTo again from its parts when it used no other payer UTxO", async () => {
    const { emulator, builder, wallet, funded } = await setup({
      funds: [50_000_000n],
    });
    const to = (await (await walletOf(1)).getChangeAddress())!;
    const named = funded[0]!;
    const key = keyOf;
    const plan = builder.plan([spend.pubKey({ utxo: named }), pay()], {
      payer: wallet,
      sendAllTo: to,
    });
    const first = await plan.build();
    expect(first.inputs.map(key)).toEqual([key(named)]);
    await plan.send({ submitter: submitterOf(async () => first.txHash) });
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    expectCode(await caught(plan.send()), "EXPIRED");
    const second = await plan.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.inputs.map(key)).toEqual([key(named)]);
    expect(second.outputs.some((o) => o.address === to)).toBe(true);
    expect(plan.attempts).toHaveLength(2);
  });

  it("keeps the pinned UTxOs of sendAllTo when their read gives no answer, and takes a new anchor from them", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      funds: [30_000_000n, 20_000_000n, 10_000_000n],
    });
    const to = (await (await walletOf(1)).getChangeAddress())!;
    const key = keyOf;
    const swallow = (txHash: string) => submitterOf(async () => txHash);
    const plan = builder.plan(pay(), { payer: wallet, sendAllTo: to });
    const first = await plan.build();
    const pinned = new Set(first.inputs.map(key));
    expect(pinned.size).toBe(3);
    await plan.send({ submitter: swallow(first.txHash) });
    emulator.advanceTo({ time: plan.attempts[0]!.until });
    await plan.refresh();
    expect(plan.status).toBe("expired");

    // An empty read is no answer: the replaced attempt's inputs are taken as they are
    provider.control.hooks.fetchAddressUTxOs = async () => [];
    const second = await plan.build();
    provider.control.hooks.fetchAddressUTxOs = undefined;
    expect(second.txHash).not.toBe(first.txHash);
    expect(new Set(second.inputs.map(key))).toEqual(pinned);

    // The anchor alone is spent: the new anchor is one of the other pinned UTxOs
    await plan.send({ submitter: swallow(second.txHash) });
    const anchor = recordOf(plan).anchor.anchors[0]!.utxo;
    emulator.removeUtxos([ref(anchor)]);
    emulator.advanceTo({ time: plan.attempts[1]!.until });
    await plan.refresh();
    expect(plan.status).toBe("expired");
    const third = await plan.build();
    const anchors = recordOf(plan).anchor.anchors;
    expect(anchors).toHaveLength(2);
    const rest = new Set([...pinned].filter((k) => k !== key(anchor)));
    expect(rest.has(key(anchors[1]!.utxo))).toBe(true);
    expect(new Set(third.inputs.map(key))).toEqual(rest);
  });

  it("is INVALID_STATE (status) when the parts give the same body again", async () => {
    const { emulator, builder, wallet, address, funded } = await setup();
    const until = emulator.time + 300_000;
    const snapshot = () => ({
      changeAddress: address,
      utxos: emulator.utxos({ address }),
    });
    const plan = builder.plan([pay(110_000_000n), validity({ until })], {
      payer: snapshot(),
    });
    const first = await plan.build();
    await plan.sign({ signers: wallet });
    await caught(plan.send({ submitter: refusing() }));
    expect(plan.status).toBe("rejected");

    const again = snapshot();
    const error = (await caught(
      plan.build({ payer: again }),
    )) as TxPlanError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("status");
    expect(error.message).toContain(first.txHash);
    expect(plan.status).toBe("rejected");
    expect(plan.attempts).toHaveLength(1);
    // The snapshot was not used up
    expectCode(await caught(plan.build()), "INVALID_STATE");

    // Another UTxO in place of the one spent next to the anchor: a new body on the same anchor
    const anchor = recordOf(plan).anchor.anchors[0]!.utxo;
    const other = funded.find((utxo) => utxo.input.txHash !== anchor.txHash)!;
    emulator.removeUtxos([other.input]);
    emulator.fund(address, { lovelace: 30_000_000n });
    const second = await plan.build({ payer: snapshot() });
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.inputs.map(ref)).toContainEqual(ref(anchor));
    expect(plan.attempts).toHaveLength(2);
  });
});
