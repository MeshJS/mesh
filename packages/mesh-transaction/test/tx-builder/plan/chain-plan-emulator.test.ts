import type { UTxO } from "@meshsdk/common";
import { mConStr0, ProviderError } from "@meshsdk/core";

import type { TxPlan, TxPlanError } from "../../../src/tx-builder";
import {
  collateral,
  output,
  outputOf,
  spend,
  TxError,
  validity,
} from "../../../src/tx-builder";
import { planOver, recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  FAST,
  forwarding,
  pay,
  reasonOf,
  setup,
  submitterOf,
  swallowing,
  walletOf,
  wrap,
} from "./plan-emulator-util";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

const expectCode = (error: unknown, code: string) => {
  expect(TxError.is(error)).toBe(true);
  expect((error as TxError).code).toBe(code);
};

const key = (utxo: Pick<UTxO, "input">) =>
  `${utxo.input.txHash}#${utxo.input.outputIndex}`;

/** The anchors of a plan's record, as the kinds and out refs they are */
const anchorsOf = (plan: TxPlan) =>
  recordOf(plan).anchor.anchors.map((entry) => ({
    kind: entry.kind,
    ref: key(entry.utxo),
  }));

describe("Chains of plans on TxEmulator", () => {
  it("stands a child on its parent's attempt: it spends the parent's change, its anchor", async () => {
    const { builder, wallet, address } = await setup();
    const parent = builder.plan(pay(), { id: "parent", payer: wallet });
    await parent.send();
    const child = builder.plan(pay(3_000_000n), {
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
        planId: "parent",
      },
    ]);
    await child.send({ waitFor: "included" });
    expect(child.status).toBe("final");
  });

  it("builds on a parent attempt not in a block: the probe passes, the deadline is the parent's, a refusal is unknown", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    // Time passes before the child is built: its own deadline would be later than the parent's
    advance(emulator, 60);
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    expect(child.status).toBe("built");
    expect(child.attempts[0]!.until).toBe(parent.attempts[0]!.until);
    // The node does not know the parent's output yet: its refusal says nothing
    const error = (await caught(
      child.send({ submitter: forwarding(emulator) }),
    )) as TxPlanError<"SUBMIT_FAILED">;
    expectCode(error, "SUBMIT_FAILED");
    expect(child.status).toBe("sent");
    // Once the parent is in a block, the child lands
    await emulator.submitTx(parent.signedTx!);
    await child.send({ waitFor: "included" });
    expect(child.status).toBe("final");
  });

  it("is orphaned when its parent's attempt dies, by its own margin and search, and keeps its own until", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.plan([pay(3_000_000n), validity({ until })], {
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
    const error = (await caught(child.send())) as TxPlanError<"ORPHANED">;
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

  it("does not close a child another instance recorded orphaned while this tip is within the margin past the parent's deadline", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(
      [pay(3_000_000n), validity({ until: emulator.time + 3_600_000 })],
      { payer: wallet, after: parent, expiryMarginMs: 2_000 },
    );
    await child.send({ submitter: swallowing() });
    const parentUntil = parent.attempts[0]!.until;
    // This instance's tip: past the parent attempt's deadline, within the child's margin
    emulator.advanceTo({ time: parentUntil + 1_000 });
    const behind = await emulator.fetchLatestBlock();
    // The other instance's tip is past the margin: it records the child orphaned
    emulator.advanceTo({ time: parentUntil + 3_000 });
    await child.refresh();
    expect(child.status).toBe("orphaned");
    const late = planOver(
      builderOf(wrap(emulator, { fetchLatestBlock: async () => behind })),
      recordOf(child),
      { after: parent },
    );
    const error = await caught(late.abandon());
    expectCode(error, "CANNOT_OBSERVE");
    expect(reasonOf(error)).toBe("unconfirmed");
    expect(error.message).toMatch(/deadline and this plan's margin/);
    expect(late.status).toBe("orphaned");
  });

  it("waits for the parent's next attempt after a refusal of the parent", async () => {
    const { builder, wallet } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
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
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    const error = (await caught(child.build())) as TxPlanError<"STILL_LIVE">;
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
    const parent = builder.plan(pay(5_000_000n, otherAddress), {
      payer: wallet,
    });
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(pay(3_000_000n), {
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
    const parent = builder.plan(pay(5_000_000n, otherAddress), {
      payer: wallet,
    });
    await parent.send({ submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.plan([pay(3_000_000n), validity({ until })], {
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const parentTx = parent.txHash!;
    const until = emulator.time + 3_600_000;
    const child = builder.plan([pay(3_000_000n), validity({ until })], {
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(pay(3_000_000n), {
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
    const error = (await caught(child.build())) as TxPlanError<"STILL_LIVE">;
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
    const parent = builder.plan(
      [
        pay(),
        output({ label: "seed", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: wallet },
    );
    await parent.send({ submitter: swallowing() });
    const seed = outputOf(parent.built!, "seed");
    const child = builder.plan(
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
    const error = (await caught(child.build())) as TxPlanError<"INPUTS_SPENT">;
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.build();
    hidden = parent.txHash;
    // It lands, and the provider does not show it
    await parent.send({ submitter: forwarding(emulator) });
    const until = emulator.time + 3_600_000;
    const child = builder.plan([pay(3_000_000n), validity({ until })], {
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
    const error = (await caught(child.abandon())) as TxPlanError<"STILL_LIVE">;
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
      const parent = builder.plan(pay(), { payer: wallet });
      await parent.send({ submitter: swallowing() });
      const witness = recordOf(parent).anchor.anchors[0]!.utxo.input.txHash;
      const child = builder.plan(pay(3_000_000n), {
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
      const parent = builder.plan(pay(), { payer: wallet });
      await parent.send({ submitter: swallowing() });
      const witness = recordOf(parent).anchor.anchors[0]!.utxo.input.txHash;
      const child = builder.plan(pay(3_000_000n), {
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
      )) as TxPlanError<"CANNOT_OBSERVE">;
      expect(performance.now() - started).toBeLessThan(2_000);
      expectCode(error, "CANNOT_OBSERVE");
      expect(error.details.reason).toBe("unconfirmed");
      expect(child.closing).toBe(true);
      expect(child.status).toBe("expired");
    }
  });
});

describe("Chains of plans with several parents, failed parents and pinned selection", () => {
  it("closes a child on two parents once one parent attempt is dead, though the other landed", async () => {
    const { emulator, builder, wallet, address, funded, provider } =
      await setup();
    const snapshot = (utxo: UTxO) => ({
      changeAddress: address,
      utxos: [utxo],
    });
    const first = builder.plan(
      [
        pay(),
        output({ label: "a", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: snapshot(funded[0]!) },
    );
    await first.send({ signers: wallet, submitter: forwarding(emulator) });
    const second = builder.plan(
      [pay(), output({ label: "b", address, value: { lovelace: 5_000_000n } })],
      { payer: snapshot(funded[1]!) },
    );
    await second.send({ signers: wallet, submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.plan(
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

  it("makes a child on two parents live again once the parent that orphaned it is found, while the other may land", async () => {
    const { emulator, builder, wallet, address, funded, provider } =
      await setup();
    let hidden: string | undefined;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === hidden) throw { kind: "notFound", status: 404 };
      return forward(hash);
    };
    const snapshot = (utxo: UTxO) => ({
      changeAddress: address,
      utxos: [utxo],
    });
    // The first parent lands; the second, with a later deadline, is not passed on yet
    const first = builder.plan(
      [
        pay(),
        output({ label: "a", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: snapshot(funded[0]!) },
    );
    await first.send({ signers: wallet, submitter: forwarding(emulator) });
    advance(emulator, 200);
    const second = builder.plan(
      [pay(), output({ label: "b", address, value: { lovelace: 5_000_000n } })],
      { payer: snapshot(funded[1]!) },
    );
    await second.send({ signers: wallet, submitter: swallowing() });
    expect(second.attempts[0]!.until).toBeGreaterThan(first.attempts[0]!.until);
    const child = builder.plan(
      [
        spend.pubKey({ utxo: outputOf(first.built!, "a") }),
        spend.pubKey({ utxo: outputOf(second.built!, "b") }),
        pay(3_000_000n),
      ],
      { payer: wallet, after: [first, second] },
    );
    await child.build();
    await child.send({ submitter: swallowing() });
    const bytes = child.signedTx!;
    // The search does not show the first parent past its deadline: orphaned
    hidden = first.txHash;
    emulator.advanceTo({ time: first.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("orphaned");

    // Shown again, while the second parent is before its deadline: no parent attempt is dead
    hidden = undefined;
    const built = await child.build();
    expect(built.txHash).toBe(child.txHash);
    expect(child.status).toBe("sent");
    expect(child.live.map((attempt) => attempt.txHash)).toEqual([child.txHash]);
    expect(child.attempts).toHaveLength(1);
    const resent = swallowing();
    await child.send({ submitter: resent });
    expect(resent.calls).toEqual([bytes]);

    // The second parent lands, and so does the child
    await emulator.submitTx(second.signedTx!);
    await child.send({ waitFor: "included", submitter: forwarding(emulator) });
    expect(child.landed?.txHash).toBe(child.txHash);
  });

  it("takes the refusal of a child on two parents as unknown while one of them is not in a block", async () => {
    const { emulator, builder, wallet, address, funded } = await setup();
    const snapshot = (utxo: UTxO) => ({
      changeAddress: address,
      utxos: [utxo],
    });
    const first = builder.plan(
      [
        pay(),
        output({ label: "a", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: snapshot(funded[0]!) },
    );
    await first.send({ signers: wallet, submitter: forwarding(emulator) });
    const second = builder.plan(
      [pay(), output({ label: "b", address, value: { lovelace: 5_000_000n } })],
      { payer: snapshot(funded[1]!) },
    );
    await second.send({ signers: wallet, submitter: swallowing() });
    const child = builder.plan(
      [
        spend.pubKey({ utxo: outputOf(first.built!, "a") }),
        spend.pubKey({ utxo: outputOf(second.built!, "b") }),
        pay(3_000_000n),
      ],
      { payer: wallet, after: [first, second] },
    );
    await child.build();
    // The node does not know the second parent's output: its refusal says nothing
    const error = await caught(child.send({ submitter: forwarding(emulator) }));
    expectCode(error, "SUBMIT_FAILED");
    expect(child.status).toBe("sent");
    expect(child.attempts[0]!.status).toBe("sent");
    // Once both parents are in a block, the child lands
    await emulator.submitTx(second.signedTx!);
    await child.send({ waitFor: "included", submitter: forwarding(emulator) });
    expect(child.landed?.txHash).toBe(child.txHash);
  });

  it("is STILL_LIVE for a new attempt while an earlier one may land on a parent attempt that was replaced", async () => {
    const { emulator, builder, wallet, address, funded } = await setup();
    const snapshot = (utxo: UTxO) => ({
      changeAddress: address,
      utxos: [utxo],
    });
    const first = builder.plan(
      [
        pay(),
        output({ label: "a", address, value: { lovelace: 10_000_000n } }),
      ],
      { payer: snapshot(funded[0]!) },
    );
    await first.send({ signers: wallet, submitter: forwarding(emulator) });
    const second = builder.plan(pay(), { payer: snapshot(funded[1]!) });
    await second.build();
    await second.sign({ signers: wallet });
    // The child spends the first parent's output, its anchor, and the second parent's change
    const child = builder.plan(
      [spend.pubKey({ utxo: outputOf(first.built!, "a") }), pay(15_000_000n)],
      {
        payer: wallet,
        after: [first, second],
        expiryMarginMs: 5_000,
        canSelect: (utxo) => utxo.input.txHash === second.txHash,
      },
    );
    await child.build();
    await child.sign();
    const anchors = anchorsOf(child);
    expect(anchors).toEqual([
      { kind: "parent", ref: key(outputOf(first.built!, "a")) },
    ]);
    const earlier = child.attempts[0]!;
    expect([...recordOf(child).attempts[0]!.dependsOn!].sort()).toEqual(
      [first.txHash!, second.txHash!].sort(),
    );
    // The second parent's attempt is refused and replaced
    expectCode(
      await caught(
        second.send({
          submitter: submitterOf(async () => {
            throw { kind: "rejected" };
          }),
        }),
      ),
      "REJECTED",
    );
    advance(emulator, 1);
    await second.build({ payer: snapshot(funded[1]!) });
    // Past the child's deadline, within its margin: its signed attempt may still land
    emulator.advanceTo({ time: earlier.until });
    const error = (await caught(child.build())) as TxPlanError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expect(error.details.txHashes).toEqual([earlier.txHash]);
    expect(child.attempts).toHaveLength(1);
    expect(anchorsOf(child)).toEqual(anchors);
  });

  it("is STILL_LIVE for a new attempt on the parent's output while an earlier one on a general anchor may land", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ waitFor: "included" });
    const parentTx = parent.txHash!;
    // The first attempt does not take the parent's change: its anchor is a payer UTxO
    let skipParent = true;
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
      ttlMs: 60_000,
      expiryMarginMs: 5_000,
      canSelect: (utxo) => !skipParent || utxo.input.txHash !== parentTx,
    });
    await child.build();
    await child.sign();
    expect(anchorsOf(child).map((a) => a.kind)).toEqual(["payer"]);
    // Past its deadline, within its margin, the next attempt would stand on the parent's change
    skipParent = false;
    const earlier = child.attempts[0]!;
    emulator.advanceTo({ time: earlier.until });
    const error = (await caught(child.build())) as TxPlanError<"STILL_LIVE">;
    expectCode(error, "STILL_LIVE");
    expect(error.details.txHashes).toEqual([earlier.txHash]);
    expect(child.attempts).toHaveLength(1);
    expect(anchorsOf(child).map((a) => a.kind)).toEqual(["payer"]);
  });

  it("orphans a child at once when its parent's attempt is found with is_valid = false, and closes it", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const parent = builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await parent.send({ waitFor: "included" });
    const child = builder.plan(pay(3_000_000n), {
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
    const first = builder.plan(pay(), { payer: snapshot(funded[0]!) });
    await first.send({ signers: wallet, submitter: swallowing() });
    const second = builder.plan(pay(), { payer: snapshot(funded[1]!) });
    await second.send({ signers: wallet, submitter: swallowing() });
    const firstTx = first.txHash!;
    const child = builder.plan(pay(3_000_000n), {
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const change = parent.built!.change.find(
      (c) => c.output.address === address,
    )!;
    const child = builder.plan(
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const until = emulator.time + 3_600_000;
    const child = builder.plan([pay(3_000_000n), validity({ until })], {
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
    const error = (await caught(child.advance())) as TxPlanError<"ORPHANED">;
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(pay(3_000_000n), {
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
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(pay(3_000_000n), {
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

describe("A child on a parent attempt its parent's object has not observed", () => {
  it("is ORPHANED from build() and advance() on a parent attempt past its deadline, until the parent builds again", async () => {
    const { emulator, builder, wallet } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    await child.send({ submitter: swallowing() });
    emulator.advanceTo({ time: parent.attempts[0]!.until });
    await child.refresh();
    expect(child.status).toBe("expired");
    // The parent's object still shows its attempt sent
    expect(parent.status).toBe("sent");
    const record = recordOf(child);
    for (const call of [() => child.build(), () => child.advance()]) {
      const error = (await caught(call())) as TxPlanError<"ORPHANED">;
      expectCode(error, "ORPHANED");
      expect(error.details.otherLive).toEqual([]);
      expect(error.message).toMatch(/refresh\(\) the parent/);
    }
    expect(child.attempts).toHaveLength(1);
    expect(recordOf(child)).toBe(record);

    await parent.refresh();
    await parent.build();
    await parent.send();
    const built = await child.build();
    expect(child.attempts).toHaveLength(2);
    expect(child.attempts[1]!.parents![0]!.txHash).toBe(parent.txHash);
    expect(built.inputs.map((utxo) => utxo.input.txHash)).toContain(
      parent.txHash,
    );
  });

  it("is ORPHANED, not INVALID_STATE, from build() on a parent attempt its search finds with is_valid = false", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const parent = builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: mConStr0([]) },
      }),
      { payer: wallet },
    );
    await parent.send({ submitter: forwarding(emulator) });
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    await child.send({ submitter: swallowing() });
    const parentTx = parent.txHash!;
    provider.control.hooks.fetchTxInfo = async (forward, hash: string) => {
      const info = await forward(hash);
      return hash === parentTx ? { ...info, validContract: false } : info;
    };
    await child.refresh();
    expect(child.status).toBe("orphaned");
    expect(parent.status).toBe("sent");
    const error = (await caught(child.build())) as TxPlanError<"ORPHANED">;
    expectCode(error, "ORPHANED");
    expect(error.details.otherLive).toEqual([]);
    expect(child.attempts).toHaveLength(1);
  });

  it("builds nothing on a parent attempt a rollback took out of a block past its deadline", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const before = emulator.fork();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ waitFor: "included" });
    expect(parent.status).toBe("included");
    advance(emulator, 1);
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    await child.send({ submitter: swallowing() });
    // In a block, the parent attempt did not cap the child's deadline
    expect(child.attempts[0]!.until).toBeGreaterThan(parent.attempts[0]!.until);
    // A rollback of one block, and the tip passes the child's deadline
    provider.control.target = before;
    before.advanceTo({ time: child.attempts[0]!.until + 1_000 });
    await child.refresh();
    await parent.refresh();
    expect(child.status).toBe("expired");
    expect(parent.status).toBe("sent");
    const record = recordOf(child);
    const error = (await caught(child.build())) as TxPlanError<"ORPHANED">;
    expectCode(error, "ORPHANED");
    expect(child.attempts).toHaveLength(1);
    expect(recordOf(child)).toBe(record);
  });

  it("is STILL_LIVE within the margin past the parent attempt's deadline, and CANNOT_OBSERVE without an answer after it", async () => {
    const { emulator, builder, wallet, provider } = await setup();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ submitter: swallowing() });
    const until = parent.attempts[0]!.until;
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
      expiryMarginMs: 60_000,
    });
    emulator.advanceTo({ time: until });
    const early = (await caught(child.build())) as TxPlanError<"STILL_LIVE">;
    expectCode(early, "STILL_LIVE");
    expect(early.details.txHashes).toEqual([parent.txHash]);
    expect(early.details.safeAfter).toBe(until + 60_000);

    emulator.advanceTo({ time: until + 60_000 });
    const parentTx = parent.txHash!;
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === parentTx) throw new Error("no answer");
      return forward(hash);
    };
    const unknown = await caught(child.build());
    expectCode(unknown, "CANNOT_OBSERVE");
    expect(reasonOf(unknown)).toBe("unconfirmed");
    // A provider without a search tells nothing about the parent attempt either
    provider.control.hooks.fetchTxInfo = (forward, hash: string) => {
      if (hash === parentTx)
        throw new ProviderError("no search", { kind: "unsupported" });
      return forward(hash);
    };
    const unsupported = await caught(child.build());
    expectCode(unsupported, "CANNOT_OBSERVE");
    expect(reasonOf(unsupported)).toBe("unconfirmed");
    provider.control.hooks.fetchTxInfo = undefined;
    expectCode(await caught(child.build()), "ORPHANED");
    expect(child.status).toBe("draft");
  });

  it("caps a new attempt at the deadline of a parent attempt a rollback took out of a block", async () => {
    const { emulator, builder, wallet, provider } = await setup({
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
    });
    const before = emulator.fork();
    const parent = builder.plan(pay(), { payer: wallet });
    await parent.send({ waitFor: "included" });
    advance(emulator, 30);
    const child = builder.plan(pay(3_000_000n), {
      payer: wallet,
      after: parent,
    });
    await child.build();
    expect(child.attempts[0]!.until).toBeGreaterThan(parent.attempts[0]!.until);
    const refused = submitterOf(async () => {
      throw { kind: "rejected" };
    });
    expectCode(await caught(child.send({ submitter: refused })), "REJECTED");
    // A rollback while the parent attempt's deadline is still ahead
    provider.control.target = before;
    before.advanceTo({ slot: emulator.slot + 1 });
    await parent.refresh();
    expect(parent.status).toBe("sent");
    expect(before.time).toBeLessThan(parent.attempts[0]!.until);
    await child.build();
    expect(child.attempts).toHaveLength(2);
    expect(child.attempts[1]!.until).toBeLessThanOrEqual(
      parent.attempts[0]!.until,
    );
  });
});

describe("builder.build with after: a plan", () => {
  it("spends the output of the plan's current attempt", async () => {
    const { builder, wallet } = await setup({ funds: [100_000_000n] });
    const plan = builder.plan(pay(), { payer: wallet });
    await plan.send({ submitter: swallowing() });
    const built = await builder.build(pay(3_000_000n), {
      payer: wallet,
      after: plan,
    });
    expect(built.inputs.map((u) => u.input.txHash)).toEqual([plan.txHash]);
    const listed = await builder.build(pay(3_000_000n), {
      payer: wallet,
      after: [plan],
    });
    expect(listed.inputs.map((u) => u.input.txHash)).toEqual([plan.txHash]);
  });
});
