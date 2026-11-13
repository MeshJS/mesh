import type { UTxO } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";
import { MeshWallet } from "@meshsdk/wallet";

import type { TxBuildError, TxIntentError } from "../../../src/tx-builder";
import { mint, spend, TxError, validity } from "../../../src/tx-builder";
import { intentOver, recordOf } from "../../../src/tx-builder/intent/intent";
import { cip30Wallet } from "../../cip30-wallet";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  caught,
  FAST,
  pay,
  setup,
  submitterOf,
  walletOf,
  words,
} from "./intent-emulator-util";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const refusing = () =>
  submitterOf(async () => {
    throw { kind: "rejected" };
  });

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

describe("TxIntent.build on TxEmulator", () => {
  it("is SCRIPT_FAILED for an attempt found with is_valid = false, and builds nothing", async () => {
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
    // The provider now says the attempt's scripts failed
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      const info = await forward(hash);
      return hash === txHash ? { ...info, validContract: false } : info;
    };
    expectCode(await caught(intent.send()), "SCRIPT_FAILED");
    expect(intent.status).toBe("failed");
    expect(intent.live).toEqual([]);
    const reads = () =>
      provider.control.count(
        "fetchLatestBlock",
        "fetchTxInfo",
        "fetchAddressUTxOs",
        "fetchUTxOs",
        "fetchProtocolParameters",
      );
    const before = reads();
    expectCode(await caught(intent.build()), "SCRIPT_FAILED");
    expect(reads()).toBe(before);
    expect(intent.attempts).toHaveLength(1);
  });

  it("spends the anchor in a later attempt, also where selection would not take it", async () => {
    const { emulator, builder, wallet, address } = await setup({
      funds: [20_000_000n],
    });
    const intent = builder.intent(pay(), { payer: wallet });
    const first = await intent.build();
    const anchor = recordOf(intent).anchor.anchors[0]!;
    expect(anchor.kind).toBe("payer");
    expect(first.inputs.map((u) => u.input)).toEqual([anchor.utxo.input]);
    await intent.sign();
    await caught(intent.send({ submitter: refusing() }));
    // A larger UTxO arrives: selection alone would pay from it
    emulator.fund(address, { lovelace: 500_000_000n });
    advance(emulator, 1);
    const second = await intent.build();
    expect(second.inputs).toHaveLength(1);
    expect(second.inputs.map((u) => u.input)).toContainEqual(anchor.utxo.input);
    expect(recordOf(intent).anchor.anchors).toHaveLength(1);
    expect(recordOf(intent).anchor.anchors[0]!.attempts).toEqual([
      first.txHash,
      second.txHash,
    ]);
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
  });

  it("is INPUTS_SPENT for an explicit input that is gone", async () => {
    const { emulator, builder, wallet, address, funded } = await setup();
    const explicit = funded[1]!;
    const intent = builder.intent(
      [spend.pubKey({ utxo: explicit }), pay(30_000_000n)],
      { payer: wallet },
    );
    await intent.build();
    // Another transaction spends the explicit input
    const spender = await builder.build(
      [spend.pubKey({ utxo: explicit }), pay(2_000_000n, address)],
      { payer: { changeAddress: address, utxos: [explicit] } },
    );
    await emulator.submitTx(await wallet.signTx(spender.tx));
    expectCode(await caught(intent.send()), "REJECTED");
    const error = (await caught(
      intent.build(),
    )) as TxIntentError<"INPUTS_SPENT">;
    expectCode(error, "INPUTS_SPENT");
    expect(error.retryable).toBe(false);
    expect(error.details.inputs).toEqual([explicit.input]);
    expect(intent.attempts).toHaveLength(1);
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
      const intent = builder.intent(
        [spend.pubKey({ utxo: explicit }), pay(30_000_000n)],
        { payer: wallet },
      );
      await intent.build();
      const spender = await builder.build(
        [spend.pubKey({ utxo: explicit }), pay(2_000_000n, address)],
        { payer: { changeAddress: address, utxos: [explicit] } },
      );
      await emulator.submitTx(await wallet.signTx(spender.tx));
      expectCode(await caught(intent.send()), "REJECTED");
      // An empty or failed read is unknown: the input is not taken as spent
      provider.control.hooks.fetchAddressUTxOs = noAnswer;
      advance(emulator, 1);
      const next = await intent.build({
        payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
      });
      expect(intent.attempts).toHaveLength(2);
      expect(intent.txHash).toBe(next.txHash);
      expect(next.inputs.map((u) => u.input)).toContainEqual(explicit.input);
    }
  });

  it("returns the attempt that landed between its search and the read of an explicit input", async () => {
    const { emulator, builder, wallet, provider, funded } = await setup();
    const explicit = funded[1]!;
    const intent = builder.intent(
      [spend.pubKey({ utxo: explicit }), pay(30_000_000n)],
      { payer: wallet },
    );
    // The submitter passes the bytes on, then says they were refused
    await caught(
      intent.send({
        submitter: submitterOf(async (tx) => {
          await emulator.submitTx(tx);
          throw { kind: "rejected" };
        }),
      }),
    );
    expect(intent.status).toBe("rejected");
    // The first search does not find it
    let hidden = 1;
    const txHash = intent.txHash!;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === txHash && hidden-- > 0)
        throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    const built = await intent.build();
    expect(built.txHash).toBe(txHash);
    expect(intent.status).toBe("final");
    expect(intent.attempts).toHaveLength(1);
  });

  it("returns and shows an earlier attempt that landed after a later one was built", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    let hidden: string | undefined;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      if (hash === hidden) throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    const intent = builder.intent(pay(), { payer: wallet });
    const first = await intent.build();
    // The submitter passes the bytes on and says they were refused; the search does not see them
    hidden = first.txHash;
    await caught(
      intent.send({
        submitter: submitterOf(async (tx) => {
          await emulator.submitTx(tx);
          throw { kind: "rejected" };
        }),
      }),
    );
    expect(intent.status).toBe("rejected");
    advance(emulator, 1);
    const second = await intent.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(intent.txHash).toBe(second.txHash);

    // The first attempt shows up
    hidden = undefined;
    await intent.refresh();
    expect(intent.status).toBe("final");
    expect(intent.landed?.txHash).toBe(first.txHash);
    expect(intent.txHash).toBe(first.txHash);
    expect(intent.built).toBe(first);
    expect((await intent.build()).txHash).toBe(first.txHash);
    expect(intent.attempts).toHaveLength(2);
  });

  it("records one attempt when two calls on the object build at once", async () => {
    const { builder, wallet } = await setup();
    const intent = builder.intent(pay(), { payer: wallet });
    const [a, b] = await Promise.all([intent.build(), intent.build()]);
    expect(b.txHash).toBe(a.txHash);
    expect(intent.attempts).toHaveLength(1);
    const asked: string[] = [];
    const counting = {
      signTx: async (tx: string) => {
        asked.push(tx);
        return wallet.signTx(tx, true);
      },
    };
    await intent.send({ signers: counting, waitFor: "included" });
    expect(asked).toEqual([a.tx]);
    expect(intent.txHash).toBe(a.txHash);
    expect(intent.status).toBe("final");

    // A build and a send from draft at once
    const other = builder.intent(pay(), { payer: wallet });
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
    const intent = builder.intent(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: api },
    );
    const built = await intent.build();
    expect(asked).toHaveLength(1);
    expect(built.collateral!.inputs.map((u) => u.input)).toEqual([
      reserve.input,
    ]);
    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
  });

  it("is MISSING_PAYER without a payer, and after a snapshot served an attempt", async () => {
    const { emulator, builder, wallet, address } = await setup();
    const none = builder.intent(pay());
    const error = (await caught(none.build())) as TxBuildError;
    expectCode(error, "MISSING_PAYER");
    expect(error.message).toContain("snapshot");
    expect(none.status).toBe("draft");

    const snapshot = () => ({
      changeAddress: address,
      utxos: emulator.utxos({ address }),
    });
    const intent = builder.intent(pay(), { payer: snapshot() });
    await intent.build();
    await caught(intent.send({ submitter: refusing(), signers: wallet }));
    expect(intent.status).toBe("rejected");
    advance(emulator, 1);
    expectCode(await caught(intent.build()), "MISSING_PAYER");
    await intent.build({ payer: snapshot() });
    expect(intent.attempts).toHaveLength(2);
  });

  it("checks the payer when it builds, not when the intent is made", async () => {
    const { builder } = await setup();
    const empty = builder.intent(pay(), { payer: null as never });
    expect(empty.status).toBe("draft");
    expectCode(await caught(empty.build()), "MISSING_PAYER");
    const odd = builder.intent(pay(), { payer: 42 as never });
    expectCode(await caught(odd.build()), "INVALID_OPTION");
    expect(odd.status).toBe("draft");
    const over = intentOver(builder, recordOf(odd), { payer: 42 as never });
    expectCode(await caught(over.build()), "INVALID_OPTION");
  });

  it("over a record without a payer: takes witnesses, resends, observes, and builds nothing new", async () => {
    const { emulator, builder, wallet } = await setup();
    const made = builder.intent(pay(), { payer: wallet });
    await made.build();
    const restored = intentOver(builder, recordOf(made));
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

    const lost = builder.intent(pay(), { payer: wallet });
    await lost.send({ submitter: submitterOf(async () => lost.txHash!) });
    emulator.advanceTo({ time: lost.attempts[0]!.until + 1_000 });
    const over = intentOver(builder, recordOf(lost));
    expectCode(await caught(over.send()), "EXPIRED");
    expectCode(await caught(over.build()), "MISSING_PAYER");
    expect(over.attempts).toHaveLength(1);
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
      const intent = builder.intent(parts, { payer: wallet });
      const error = (await caught(
        intent.send({ signers: signer }),
      )) as TxIntentError<"CANNOT_OBSERVE">;
      expectCode(error, "CANNOT_OBSERVE");
      expect(error.details.reason).toBe("unconfirmed");
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(10);
      expect(intent.status).toBe("draft");
      expect(asked).toBe(0);
    }

    // An older tip
    tipFails = false;
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.build();
    await caught(intent.send({ submitter: refusing() }));
    const tip = await provider.control.target.fetchLatestBlock();
    provider.control.hooks.fetchLatestBlock = async () => ({
      ...tip,
      slot: String(Number(tip.slot) - 5),
      height: tip.height! - 5,
    });
    const error = (await caught(
      intent.build(),
    )) as TxIntentError<"CANNOT_OBSERVE">;
    expectCode(error, "CANNOT_OBSERVE");
    expect(error.details.reason).toBe("unconfirmed");
    expect(intent.attempts).toHaveLength(1);
  });

  it("sets the deadline from the tip and ttlMs, and keeps an explicit until", async () => {
    const { emulator, builder, wallet } = await setup();
    const ttlMs = 120_000;
    const intent = builder.intent(pay(), { payer: wallet, ttlMs });
    const parts = recordOf(intent).parts;
    const built = await intent.build();
    expect(built.validity?.until).toBe(emulator.time + ttlMs);
    expect(intent.attempts[0]?.until).toBe(emulator.time + ttlMs);
    expect(recordOf(intent).parts).toBe(parts);
    expect(recordOf(intent).parts).toHaveLength(1);

    // A lower bound later than the tip: from + ttlMs
    const from = emulator.time + 30_000;
    const later = builder.intent([pay(), validity({ from, label: "start" })], {
      payer: wallet,
      ttlMs,
    });
    expect((await later.build()).validity).toMatchObject({
      from,
      until: from + ttlMs,
    });

    // An explicit until is kept
    const until = emulator.time + 50_000;
    const fixed = builder.intent([pay(), validity({ until })], {
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
    const far = builder.intent(spendLocked, {
      payer: wallet,
      ttlMs: 129_601_000,
    });
    const error = (await caught(far.build())) as TxIntentError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("pastHorizon");
    expect(far.status).toBe("draft");
    // At the horizon itself
    const near = builder.intent(spendLocked, {
      payer: wallet,
      ttlMs: 129_600_000,
    });
    await near.build();
    // A native script is not checked
    const native = builder.intent(
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
    const intent = builder.intent(pay(), { payer: wallet });
    for (let i = 0; i < 16; i++) {
      advance(emulator, 1);
      await intent.build();
      await caught(intent.send({ submitter: refusing() }));
    }
    expect(intent.attempts).toHaveLength(16);
    advance(emulator, 1);
    const error = (await caught(
      intent.build(),
    )) as TxIntentError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("tooManyAttempts");
    expect(intent.attempts).toHaveLength(16);
  }, 30_000);

  it("compares the payer with the record only when it builds a new attempt", async () => {
    const { emulator, builder, wallet, address } = await setup();
    const other = await walletOf(1);
    const otherAddress = (await other.getChangeAddress())!;
    emulator.fund(otherAddress, { lovelace: 50_000_000n });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: submitterOf(async () => intent.txHash!) });
    const sent = intent.built!;
    // While sent, a build with another payer returns the attempt, and send resends it
    expect(await intent.build({ payer: other })).toBe(sent);
    const resent = submitterOf(async () => intent.txHash!);
    await intent.send({ submitter: resent });
    expect(resent.calls).toEqual([intent.signedTx]);

    emulator.advanceTo({ time: intent.attempts[0]!.until + 1_000 });
    expectCode(await caught(intent.send()), "EXPIRED");
    const error = (await caught(
      intent.build(),
    )) as TxIntentError<"PAYER_MISMATCH">;
    expectCode(error, "PAYER_MISMATCH");
    expect(error.details).toEqual({ recorded: address, given: otherAddress });
    expect(intent.attempts).toHaveLength(1);

    // Another change address that holds the recorded anchor is accepted; the change goes to the
    // recorded address
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    const built = await intent.build({
      payer: {
        changeAddress: otherAddress,
        utxos: emulator.utxos({ address }),
      },
    });
    expect(intent.attempts).toHaveLength(2);
    expect(built.inputs.map((u) => u.input)).toContainEqual(anchor.input);
    expect(built.change.every((c) => c.output.address === address)).toBe(true);
  });

  it("is FEE_TOO_LOW for a new attempt its fee does not cover, and records nothing", async () => {
    const { emulator, builder, wallet, address } = await setup({
      funds: [10_000_000n, 10_000_000n],
    });
    const parts = pay(15_000_000n);
    const plain = await builder.build(parts, { payer: wallet });
    const fee = plain.fee + 2_000n;
    const intent = builder.intent(parts, { payer: wallet, fee });
    const first = await intent.build();
    expect(first.fee).toBe(fee);
    expect(first.inputs).toHaveLength(2);
    expect(first.warnings.map((w) => w.code)).toContain("FEE_ABOVE_MINIMUM");
    await intent.send({ submitter: submitterOf(async () => intent.txHash!) });
    emulator.advanceTo({ time: intent.attempts[0]!.until + 1_000 });
    expectCode(await caught(intent.send()), "EXPIRED");

    // The other UTxO is replaced with small ones: selection takes more of them
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    const others = emulator
      .utxos({ address })
      .filter((utxo) => utxo.input.txHash !== anchor.input.txHash);
    emulator.removeUtxos(others.map((utxo) => utxo.input));
    for (let i = 0; i < 8; i++)
      emulator.fund(address, { lovelace: 1_500_000n });
    const error = (await caught(intent.build())) as TxBuildError<"FEE_TOO_LOW">;
    expectCode(error, "FEE_TOO_LOW");
    expect(error.details.fee).toBe(fee);
    expect(error.details.minFee).toBeGreaterThan(fee);
    expect(intent.attempts).toHaveLength(1);
    expect(intent.status).toBe("expired");
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
    const key = (utxo: UTxO) =>
      `${utxo.input.txHash}#${utxo.input.outputIndex}`;
    provider.control.hooks.fetchAddressUTxOs = async (forward, a: string) =>
      ((await forward(a)) as UTxO[]).filter((utxo) => !hidden.has(key(utxo)));
    // A UTxO that is never selected, so that a read hiding the others still answers
    const kept = emulator.fund(address, { lovelace: 3_000_000n });
    const canSelect = (utxo: UTxO) => key(utxo) !== key(kept);
    const options = { payer: wallet, canSelect };

    // Both payer inputs hidden: no anchor can be confirmed
    const both = builder.intent(pay(110_000_000n), options);
    for (const utxo of emulator.utxos({ address }))
      if (key(utxo) !== key(kept)) hidden.add(key(utxo));
    const error = (await caught(
      both.build(),
    )) as TxIntentError<"CANNOT_OBSERVE">;
    expectCode(error, "CANNOT_OBSERVE");
    expect(error.details.reason).toBe("unconfirmed");
    expect(error.retryAfterMs).toBe(10);
    expect(both.status).toBe("draft");
    hidden.clear();
    await both.build();
    expect(both.status).toBe("built");

    // The first in the ledger's order hidden: the second is the anchor
    const intent = builder.intent(pay(110_000_000n), options);
    const probe = await builder.build(pay(110_000_000n), options);
    const [firstInput, secondInput] = probe.inputs;
    hidden.add(key(firstInput!));
    const built = await intent.build();
    expect(built.inputs).toEqual(probe.inputs);
    expect(recordOf(intent).anchor.anchors.map((a) => a.utxo.input)).toEqual([
      secondInput!.input,
    ]);
    hidden.clear();
    await caught(intent.send({ submitter: refusing() }));
    advance(emulator, 1);

    // A read that answers [] or throws is unknown: the first candidate is the anchor
    for (const answer of [
      async () => [],
      async () => {
        throw new Error("down");
      },
    ]) {
      provider.control.hooks.fetchAddressUTxOs = answer;
      const plain = builder.intent(pay(110_000_000n), options);
      await plain.build();
      expect(recordOf(plain).anchor.anchors.map((a) => a.utxo.input)).toEqual([
        firstInput!.input,
      ]);
    }

    // The replacement spends the recorded anchor: the other input is gone, and a larger UTxO
    // would pay alone
    delete provider.control.hooks.fetchAddressUTxOs;
    emulator.removeUtxos([firstInput!.input]);
    emulator.fund(address, { lovelace: 300_000_000n });
    const next = await intent.build({
      payer: { changeAddress: address, utxos: emulator.utxos({ address }) },
    });
    expect(intent.attempts).toHaveLength(2);
    const spent = next.inputs.map((u) => u.input);
    expect(spent).toContainEqual(secondInput!.input);
    expect(spent).not.toContainEqual(firstInput!.input);
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
    const intent = builder.intent(pay(), { payer: wallet });
    const built = await intent.build();
    let before = reads();
    expect(await intent.build()).toBe(built);
    expect(reads()).toBe(before + 1);
    expect(provider.control.count("fetchLatestBlock")).toBeGreaterThan(0);
    tipFails = true;
    expect(await intent.build()).toBe(built);
    tipFails = false;

    await intent.sign();
    expect(intent.status).toBe("signed");
    before = reads();
    expect(await intent.build()).toBe(built);
    expect(reads()).toBe(before + 1);

    await intent.send({ submitter: submitterOf(async () => intent.txHash!) });
    before = reads();
    expect(await intent.build()).toBe(built);
    expect(reads()).toBe(before);

    await intent.send({ waitFor: "included" });
    expect(intent.status).toBe("final");
    before = reads();
    expect(await intent.build()).toBe(built);
    expect(reads()).toBe(before);

    // In included, on a builder with a depth: the landed attempt, without a request
    const deep = await setup({
      builder: { intentDefaults: { ...FAST, confirmations: 3 } },
    });
    const landing = deep.builder.intent(pay(), { payer: deep.wallet });
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
    const late = builder.intent(pay(), { payer: wallet });
    const old = await late.build();
    emulator.advanceTo({ time: late.attempts[0]!.until });
    const fresh = await late.build();
    expect(fresh.txHash).not.toBe(old.txHash);
    expect(late.attempts).toHaveLength(2);
  });

  it("builds no attempt in place of the first of an intent with sendAllTo", async () => {
    const { emulator, builder, wallet } = await setup();
    const intent = builder.intent([], {
      payer: wallet,
      sendAllTo: (await (await walletOf(1)).getChangeAddress())!,
    });
    const first = await intent.build();
    expect(first.inputs).toHaveLength(2);
    await intent.sign();
    await caught(intent.send({ submitter: refusing() }));
    advance(emulator, 1);
    const error = (await caught(
      intent.build(),
    )) as TxIntentError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("status");
    expect(intent.attempts).toHaveLength(1);
  });

  it("is INVALID_STATE (status) when the parts give the same body again", async () => {
    const { emulator, builder, wallet, address, funded } = await setup();
    const until = emulator.time + 300_000;
    const snapshot = () => ({
      changeAddress: address,
      utxos: emulator.utxos({ address }),
    });
    const intent = builder.intent([pay(110_000_000n), validity({ until })], {
      payer: snapshot(),
    });
    const first = await intent.build();
    await intent.sign({ signers: wallet });
    await caught(intent.send({ submitter: refusing() }));
    expect(intent.status).toBe("rejected");

    const again = snapshot();
    const error = (await caught(
      intent.build({ payer: again }),
    )) as TxIntentError<"INVALID_STATE">;
    expectCode(error, "INVALID_STATE");
    expect(error.details.reason).toBe("status");
    expect(error.message).toContain(first.txHash);
    expect(intent.status).toBe("rejected");
    expect(intent.attempts).toHaveLength(1);
    // The snapshot was not used up
    expectCode(await caught(intent.build()), "INVALID_STATE");

    // Another UTxO in place of the one spent next to the anchor: a new body on the same anchor
    const anchor = recordOf(intent).anchor.anchors[0]!.utxo;
    const other = funded.find(
      (utxo) => utxo.input.txHash !== anchor.input.txHash,
    )!;
    emulator.removeUtxos([other.input]);
    emulator.fund(address, { lovelace: 30_000_000n });
    const second = await intent.build({ payer: snapshot() });
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.inputs.map((u) => u.input)).toContainEqual(anchor.input);
    expect(intent.attempts).toHaveLength(2);
  });
});
