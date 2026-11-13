import type { UTxO } from "@meshsdk/common";
import { mConStr0 } from "@meshsdk/core";

import type { TxIntent, TxIntentError } from "../../../src/tx-builder";
import {
  collateral,
  output,
  outputOf,
  spend,
  TxError,
  validity,
} from "../../../src/tx-builder";
import { recordOf } from "../../../src/tx-builder/intent/intent";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  caught,
  forwarding,
  pay,
  reasonOf,
  setup,
  submitterOf,
  swallowing,
  walletOf,
} from "./intent-emulator-util";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const key = (utxo: Pick<UTxO, "input">) =>
  `${utxo.input.txHash}#${utxo.input.outputIndex}`;

/** The anchors of an intent's record, as the kinds and out refs they are */
const anchorsOf = (intent: TxIntent) =>
  recordOf(intent).anchor.anchors.map((entry) => ({
    kind: entry.kind,
    ref: key(entry.utxo),
  }));

describe("Intent chains on TxEmulator", () => {
  it("stands a child on its parent's attempt: it spends the parent's change, its anchor", async () => {
    const { builder, wallet, address } = await setup();
    const parent = builder.intent(pay(), { id: "parent", payer: wallet });
    await parent.send();
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    const built = await child.build();
    const change = parent.built!.change.find(
      (c) => c.output.address === address,
    )!;
    // The payer has UTxOs enough of its own, and the child still spends the parent's change
    expect(built.inputs.map(key)).toContain(key(change));
    expect(anchorsOf(child)).toEqual([{ kind: "parent", ref: key(change) }]);
    expect(child.attempts[0]!.parents).toEqual([
      {
        txHash: parent.txHash,
        until: parent.attempts[0]!.until,
        intentId: "parent",
      },
    ]);
    await child.send({ waitFor: "included" });
    expect(child.status).toBe("final");
  });

  it("builds on a parent attempt not in a block: the probe passes, the deadline is the parent's, a refusal is unknown", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    expect(child.status).toBe("built");
    expect(child.attempts[0]!.until).toBe(parent.attempts[0]!.until);
    // The node does not know the parent's output yet: its refusal says nothing
    const error = (await caught(
      child.send({ submitter: forwarding(emulator) }),
    )) as TxIntentError<"SUBMIT_FAILED">;
    expectCode(error, "SUBMIT_FAILED");
    expect(child.status).toBe("sent");
    // Once the parent is in a block, the child lands
    await emulator.submitTx(parent.signedTx!);
    await child.send({ waitFor: "included" });
    expect(child.status).toBe("final");
  });

  it("is orphaned when its parent's attempt dies, by its own margin and search, and keeps its own until", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.intent([pay(3_000_000n), validity({ until })], {
      payer: wallet,
      after: parent,
      expiryMarginMs: 5_000,
    });
    const built = await child.build();
    expect(built.validity?.until).toBe(until);
    expect(child.attempts[0]!.until).toBe(until);
    await child.send({ submitter: swallowing() });
    // The parent's deadline counts with the child's margin, not the parent's
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("sent");
    emulator.advanceTo({ time: parent.attempts[0]!.until + 5_000 });
    const error = (await caught(child.send())) as TxIntentError<"ORPHANED">;
    expectCode(error, "ORPHANED");
    expect(error.details.otherLive).toEqual([]);
    expect(child.status).toBe("orphaned");
    expect(child.live).toEqual([]);

    // A parent without a live attempt: nothing to stand on
    await parent.refresh();
    expect(parent.status).toBe("expired");
    expectCode(await caught(child.build()), "ORPHANED");
    expect(child.attempts).toHaveLength(1);
  });

  it("waits for the parent's next attempt after a refusal of the parent", async () => {
    const { builder, wallet } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    expectCode(
      await caught(
        parent.send({
          submitter: submitterOf(async () => {
            throw { kind: "rejected" };
          }),
        }),
      ),
      "REJECTED",
    );
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    const error = (await caught(child.build())) as TxIntentError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expect(error.details.txHashes).toEqual([parent.txHash]);
    expect(child.status).toBe("draft");
  });

  it("keeps a general anchor when the parent pays nothing to its change address, and is never orphaned", async () => {
    const { emulator, builder, wallet } = await setup();
    const other = await walletOf(1);
    const otherAddress = (await other.getChangeAddress())!;
    emulator.fund(otherAddress, { lovelace: 50_000_000n });
    // The parent pays the child's payer an output, which is not change
    const parent = builder.intent(pay(5_000_000n, otherAddress), {
      payer: wallet,
    });
    await parent.send({ submitter: swallowing() });
    const child = builder.intent(pay(3_000_000n), {
      payer: other,
      after: parent,
    });
    const first = await child.build();
    const anchors = anchorsOf(child);
    expect(anchors).toEqual([{ kind: "payer", ref: anchors[0]!.ref }]);
    const paid = parent.built!.outputs.find(
      (o) => o.output.address === otherAddress,
    )!;
    expect(paid.change).toBeUndefined();
    expect(first.inputs.map(key)).not.toContain(key(paid));
    // Its deadline is still the parent attempt's, which is not in a block
    expect(child.attempts[0]!.until).toBe(parent.attempts[0]!.until);
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await child.refresh();
    // Its own deadline, which is the parent attempt's: expired, not orphaned (the test below
    // shows it outlives the parent attempt with a deadline of its own)
    expect(child.status).toBe("expired");

    // The parent's next attempt; the child's next one spends the same anchor
    await parent.refresh();
    advance(emulator, 1);
    await parent.build();
    const second = await child.build();
    expect(second.txHash).not.toBe(first.txHash);
    expect(second.inputs.map(key)).toContain(anchors[0]!.ref);
    expect(anchorsOf(child)).toEqual(anchors);
    expect(child.attempts[1]!.parents![0]!.txHash).toBe(parent.txHash);
  });

  it("outlives the parent attempt on a general anchor: it depends on no parent attempt", async () => {
    const { emulator, builder, wallet } = await setup();
    const other = await walletOf(1);
    const otherAddress = (await other.getChangeAddress())!;
    emulator.fund(otherAddress, { lovelace: 50_000_000n });
    const parent = builder.intent(pay(5_000_000n, otherAddress), {
      payer: wallet,
    });
    await parent.send({ submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.intent([pay(3_000_000n), validity({ until })], {
      payer: other,
      after: parent,
    });
    await child.build();
    expect(anchorsOf(child).map((a) => a.kind)).toEqual(["payer"]);
    expect(recordOf(child).attempts[0]!.dependsOn).toBeUndefined();
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await parent.refresh();
    expect(parent.status).toBe("expired");
    await child.refresh();
    expect(child.status).toBe("sent");
    expect(child.live).toHaveLength(1);
  });

  it("takes a general anchor when its filter refuses the parent's change", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const parentTx = parent.txHash!;
    const until = emulator.time + 3_600_000;
    const child = builder.intent([pay(3_000_000n), validity({ until })], {
      payer: wallet,
      after: parent,
      canSelect: (utxo) => utxo.input.txHash !== parentTx,
    });
    const built = await child.build();
    expect(built.inputs.some((u) => u.input.txHash === parentTx)).toBe(false);
    expect(anchorsOf(child).map((a) => a.kind)).toEqual(["payer"]);
    await child.sign();
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("sent");
  });

  it("keeps a child's anchor while its earlier attempt may land, and changes it after the double check", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
      expiryMarginMs: 2_000,
    });
    await child.build();
    await child.sign();
    const firstAnchor = anchorsOf(child)[0]!;

    // The parent's attempt dies, and the parent gets a new one
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await parent.refresh();
    expect(parent.status).toBe("expired");
    await parent.build();
    // The child's attempt may still land, on the parent's earlier attempt
    const error = (await caught(child.build())) as TxIntentError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expect(error.details.txHashes).toEqual([child.attempts[0]!.txHash]);
    expect(child.attempts).toHaveLength(1);

    // Past its margin it is dead; the new anchor comes after two searches with a pause
    emulator.advanceTo({ time: parent.attempts[0]!.until + 2_000 });
    const started = performance.now();
    const second = await child.build();
    expect(performance.now() - started).toBeGreaterThanOrEqual(1_900);
    const change = parent.built!.change[0]!;
    expect(second.inputs.map(key)).toContain(key(change));
    expect(anchorsOf(child)).toEqual([
      firstAnchor,
      { kind: "parent", ref: key(change) },
    ]);
    expect(child.attempts[1]!.parents![0]!.txHash).toBe(parent.txHash);
  });

  it("is INPUTS_SPENT for a part naming an output of a parent attempt it no longer stands on", async () => {
    const { emulator, builder, wallet, address, provider } = await setup();
    const parent = builder.intent(
      [
        pay(),
        output({ label: "seed", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: wallet },
    );
    await parent.send({ submitter: swallowing() });
    const seed = outputOf(parent.built!, "seed");
    const child = builder.intent(
      [spend.pubKey({ utxo: seed }), pay(3_000_000n)],
      { payer: wallet, after: parent },
    );
    await child.build();
    // The output its parts name is its anchor
    expect(anchorsOf(child)).toEqual([{ kind: "parent", ref: key(seed) }]);
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await parent.refresh();
    await parent.build();
    // Also when the read of the addresses gives no answer: the output is of a dead attempt
    provider.control.hooks.fetchAddressUTxOs = async () => [];
    const error = (await caught(
      child.build(),
    )) as TxIntentError<"INPUTS_SPENT">;
    expectCode(error, "INPUTS_SPENT");
    expect(error.details.inputs).toEqual([seed.input]);
    expect(child.attempts).toHaveLength(1);
  });

  it("makes an orphaned attempt live again when its parent's attempt is found, and the closing asks again", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    let hidden: string | undefined;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === hidden) throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.build();
    hidden = parent.txHash;
    // It lands, and the provider does not show it
    await parent.send({ submitter: forwarding(emulator) });
    const until = emulator.time + 3_600_000;
    const child = builder.intent([pay(3_000_000n), validity({ until })], {
      payer: wallet,
      after: parent,
    });
    await child.build();
    await child.sign();
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("orphaned");

    hidden = undefined;
    const error = (await caught(
      child.abandon(),
    )) as TxIntentError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expect(error.details.txHashes).toEqual([child.txHash]);
    expect(error.details.safeAfter).toBe(until);
    expect(child.status).toBe("sent");
    expect(child.closing).toBe(true);
  });

  it("finds the witness of a child's anchor up the chain in the first poll, and without it answers at once", async () => {
    // The search of the transaction that created the parent attempt's anchor, in each poll
    {
      const { emulator, builder, wallet, provider } = await setup();
      const parent = builder.intent(pay(), { payer: wallet });
      await parent.send({ submitter: swallowing() });
      const witness = recordOf(parent).anchor.anchors[0]!.utxo.input.txHash;
      const child = builder.intent(pay(3_000_000n), {
        payer: wallet,
        after: parent,
      });
      await child.build();
      await child.sign();
      await child.send({ submitter: swallowing() });
      emulator.advanceTo({ time: parent.attempts[0]!.until });
      const searched: string[] = [];
      provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
        searched.push(hash);
        return forward(hash);
      };
      await child.abandon();
      expect(child.status).toBe("abandoned");
      expect(searched.filter((hash) => hash === witness)).toHaveLength(2);
    }
    // Hidden: CANNOT_OBSERVE at once, without the pause, with the mark recorded
    {
      const { emulator, builder, wallet, provider } = await setup();
      const parent = builder.intent(pay(), { payer: wallet });
      await parent.send({ submitter: swallowing() });
      const witness = recordOf(parent).anchor.anchors[0]!.utxo.input.txHash;
      const child = builder.intent(pay(3_000_000n), {
        payer: wallet,
        after: parent,
        expiryMarginMs: 3_000,
      });
      await child.build();
      await child.sign();
      await child.send({ submitter: swallowing() });
      emulator.advanceTo({ time: parent.attempts[0]!.until + 3_000 });
      provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
        if (hash === witness) throw { kind: "notFound", status: 404 };
        return forward(hash);
      };
      const started = performance.now();
      const error = (await caught(
        child.abandon(),
      )) as TxIntentError<"CANNOT_OBSERVE">;
      expect(performance.now() - started).toBeLessThan(2_000);
      expectCode(error, "CANNOT_OBSERVE");
      expect(error.details.reason).toBe("unconfirmed");
      expect(child.closing).toBe(true);
      expect(child.status).toBe("expired");
    }
  });
});

describe("Intent chains with several parents, failed parents and pinned selection", () => {
  it("closes a child on two parents once one parent attempt is dead, though the other landed", async () => {
    const { emulator, builder, wallet, address, funded, provider } =
      await setup();
    const snapshot = (utxo: UTxO) => ({
      changeAddress: address,
      utxos: [utxo],
    });
    const first = builder.intent(
      [
        pay(),
        output({ label: "a", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: snapshot(funded[0]!) },
    );
    await first.send({ signers: wallet, submitter: forwarding(emulator) });
    const second = builder.intent(
      [pay(), output({ label: "b", address, value: { lovelace: 5_000_000n } })],
      { payer: snapshot(funded[1]!) },
    );
    await second.send({ signers: wallet, submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.intent(
      [
        spend.pubKey({ utxo: outputOf(first.built!, "a") }),
        spend.pubKey({ utxo: outputOf(second.built!, "b") }),
        pay(3_000_000n),
        validity({ until }),
      ],
      { payer: wallet, after: [first, second] },
    );
    await child.build();
    await child.send({ submitter: swallowing() });
    expect([...recordOf(child).attempts[0]!.dependsOn!].sort()).toEqual(
      [first.txHash!, second.txHash!].sort(),
    );
    // The first parent attempt is in a block; the second one dies
    emulator.advanceTo({ time: second.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("orphaned");
    // The landed parent attempt alone proves nothing: without an answer about the other one,
    // the closing waits
    const secondTx = second.txHash!;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === secondTx) throw new Error("no answer");
      return forward(hash);
    };
    const unknown = await caught(child.abandon());
    expectCode(unknown, "CANNOT_OBSERVE");
    expect(reasonOf(unknown)).toBe("unconfirmed");
    expect(child.status).toBe("orphaned");
    provider.control.hooks.fetchTxInfo = undefined;
    await child.abandon();
    expect(child.status).toBe("abandoned");
  });

  it("orphans a child at once when its parent's attempt is found with is_valid = false, and closes it", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const parent = builder.intent(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await parent.send({ waitFor: "included" });
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    expect(recordOf(child).attempts[0]!.dependsOn).toEqual([parent.txHash]);
    await child.send({ submitter: swallowing() });
    const parentTx = parent.txHash!;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      const info = await forward(hash);
      return hash === parentTx ? { ...info, validContract: false } : info;
    };
    // Long before any deadline
    expect(emulator.time).toBeLessThan(child.attempts[0]!.until);
    await child.refresh();
    expect(child.status).toBe("orphaned");
    await child.abandon();
    expect(child.status).toBe("abandoned");
  });

  it("takes its anchor from the first parent, in recorded order, whose attempt has an output it can spend", async () => {
    const { builder, wallet, address, funded } = await setup();
    const snapshot = (utxo: UTxO) => ({
      changeAddress: address,
      utxos: [utxo],
    });
    const first = builder.intent(pay(), { payer: snapshot(funded[0]!) });
    await first.send({ signers: wallet, submitter: swallowing() });
    const second = builder.intent(pay(), { payer: snapshot(funded[1]!) });
    await second.send({ signers: wallet, submitter: swallowing() });
    const firstTx = first.txHash!;
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: [first, second],
      canSelect: (utxo) => utxo.input.txHash !== firstTx,
    });
    const built = await child.build();
    const change = second.built!.change.find(
      (c) => c.output.address === address,
    )!;
    expect(built.inputs.map(key)).toContain(key(change));
    expect(anchorsOf(child)).toEqual([{ kind: "parent", ref: key(change) }]);
    expect(child.attempts[0]!.parents!.map((p) => p.txHash)).toEqual([
      first.txHash,
      second.txHash,
    ]);
  });

  it("adds no parent change that its parts put up as collateral", async () => {
    const { builder, wallet, address } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const change = parent.built!.change.find(
      (c) => c.output.address === address,
    )!;
    const child = builder.intent(
      [pay(3_000_000n), collateral({ utxo: change })],
      {
        payer: wallet,
        after: parent,
      },
    );
    const built = await child.build();
    expect(built.inputs.map(key)).not.toContain(key(change));
    expect(anchorsOf(child).map((a) => a.kind)).toEqual(["payer"]);
  });

  it("replaces an orphaned attempt with advance() on the parent's new attempt, only with a signer", async () => {
    const { emulator, builder, wallet, address } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.intent([pay(3_000_000n), validity({ until })], {
      payer: address,
      after: parent,
    });
    await child.build();
    await child.sign({ signers: wallet });
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("orphaned");
    // The parent's new attempt lands
    await parent.refresh();
    expect(parent.status).toBe("expired");
    await parent.advance({ waitFor: "included" });
    expect(parent.status).toBe("final");

    // No signer in the call, and the payer is an address: nothing built
    const error = (await caught(child.advance())) as TxIntentError<"ORPHANED">;
    expectCode(error, "ORPHANED");
    expect(error.details.otherLive).toEqual([]);
    expect(child.attempts).toHaveLength(1);

    await child.advance({ signers: wallet, waitFor: "included" });
    expect(child.attempts).toHaveLength(2);
    expect(child.attempts[1]!.parents![0]!.txHash).toBe(parent.txHash);
    expect(child.attempts[1]!.parents![0]!.txHash).not.toBe(
      child.attempts[0]!.parents![0]!.txHash,
    );
    expect(child.status).toBe("final");
  });

  it("is CANNOT_OBSERVE (unconfirmed) when the check before a child's new anchor gets no answer", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    await child.send({ submitter: swallowing() });
    const childTx = child.txHash!;
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await parent.refresh();
    await child.refresh();
    expect(child.status).toBe("expired");
    await parent.build();
    // The second poll of the check gets no answer about the child's earlier attempt
    let searches = 0;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === childTx && ++searches >= 3) throw new Error("no answer");
      return forward(hash);
    };
    const anchors = anchorsOf(child);
    const error = await caught(child.build());
    expectCode(error, "CANNOT_OBSERVE");
    expect(reasonOf(error)).toBe("unconfirmed");
    expect(error.retryable).toBe(true);
    expect(searches).toBe(3);
    expect(child.attempts).toHaveLength(1);
    expect(anchorsOf(child)).toEqual(anchors);
  });

  it("replaces a child's attempt with sendAllTo that stands on its parent's change alone", async () => {
    const { emulator, builder, wallet, address } = await setup({
      funds: [100_000_000n],
    });
    const to = (await (await walletOf(1)).getChangeAddress())!;
    const parent = builder.intent(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.intent(pay(3_000_000n), {
      payer: wallet,
      after: parent,
      sendAllTo: to,
    });
    const first = await child.build();
    const firstChange = parent.built!.change[0]!;
    expect(first.inputs.map(key)).toEqual([key(firstChange)]);
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await parent.refresh();
    await child.refresh();
    expect(child.status).toBe("expired");
    await parent.build();

    const second = await child.build();
    const change = parent.built!.change.find(
      (c) => c.output.address === address,
    )!;
    expect(second.inputs.map(key)).toEqual([key(change)]);
    expect(second.outputs.some((o) => o.output.address === to)).toBe(true);
    expect(child.attempts).toHaveLength(2);
  });
});

describe("builder.build with after: an intent", () => {
  it("spends the output of the intent's current attempt", async () => {
    const { builder, wallet } = await setup({ funds: [100_000_000n] });
    const intent = builder.intent(pay(), { payer: wallet });
    await intent.send({ submitter: swallowing() });
    const built = await builder.build(pay(3_000_000n), {
      payer: wallet,
      after: intent,
    });
    expect(built.inputs.map((u) => u.input.txHash)).toEqual([intent.txHash]);
    const listed = await builder.build(pay(3_000_000n), {
      payer: wallet,
      after: [intent],
    });
    expect(listed.inputs.map((u) => u.input.txHash)).toEqual([intent.txHash]);
  });
});
