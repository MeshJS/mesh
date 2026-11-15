import { output, spend, TxBuildError } from "../../../src/tx-builder";
import { caught, FAST, forwarding } from "./plan-emulator-util";
import { ADA, alice, bob, carol, payTo, stepSetup } from "./run-util";

// What plan.add says when it refuses steps: the forms it takes, and what is true of a payer that
// does not list the change of the step before, in a block, for a wallet and for a snapshot.

/** The steps `plan.add` takes */
const ADDED =
  "an object of named steps, each parts, { parts, ...options }, a BuiltTx or a transaction in CBOR hex";

const names = (plan: { steps: readonly { name: string }[] }) =>
  plan.steps.map((step) => step.name);

describe("plan.add refusing steps", () => {
  it("names the forms add takes in every refusal of steps", async () => {
    const { builder, wallet, address } = await stepSetup("scalus");
    const plan = await builder.plan(
      {
        a: [
          output({ address, value: { lovelace: 5n * ADA }, label: "twice" }),
          output({ address, value: { lovelace: 6n * ADA }, label: "twice" }),
        ],
      },
      { payer: wallet },
    );
    const pay = payTo(bob, 1n * ADA);
    for (const steps of [
      // Of their forms and names
      { "": pay },
      { "1": pay },
      { "consolidate-1": pay },
      { b: 5 },
      { b: { parts: pay, note: 1 } },
      // Of their links
      { b: [spend.pubKey({ utxo: { step: "x", change: true } }), pay] },
      { b: [spend.pubKey({ utxo: { step: "a", output: 9 } }), pay] },
      { b: [spend.pubKey({ utxo: { step: "a", output: "twice" } }), pay] },
    ]) {
      const error = await caught(plan.add(steps as never));
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect(error.details.option).toBe("steps");
      expect(error.details.allowed).toBe(ADDED);
    }
    expect(names(plan)).toEqual(["a"]);
  });

  it("tells a wallet that the same call later tells, and a snapshot that a new snapshot is the way", async () => {
    const { emulator, builder, wallet, address } = await stepSetup("scalus", {
      builder: { planDefaults: { ...FAST, confirmations: 3 } },
      funds: [1000n * ADA, 300n * ADA],
    });
    const plan = await builder.plan(
      { a: payTo(alice, 5n * ADA) },
      { payer: wallet },
    );
    await plan.run({ submitter: forwarding(emulator) });
    expect(plan.step("a").status).toBe("included");
    const change = plan.step("a").change[0]!;
    // A snapshot taken before a landed: it lists the UTxO a spent, not its change
    const utxos = (await emulator.fetchAddressUTxOs(address)).filter(
      (u) => u.input.txHash !== change.txHash,
    );
    const snapshot = await caught(
      plan.add({
        c: {
          parts: payTo(carol, 2n * ADA),
          payer: { changeAddress: address, utxos },
        },
      }),
    );
    expect(TxBuildError.is(snapshot, "INVALID_OPTION")).toBe(true);
    expect(snapshot.details.allowed).toBe(ADDED);
    expect(snapshot.message).toMatch(
      /the change of step "a" is not in the payer's read/,
    );
    expect(snapshot.message).toMatch(/the snapshot was taken before the block/);
    expect(snapshot.message).toMatch(/a snapshot taken after that block/);
    expect(snapshot.message).not.toMatch(/same call again later/);

    // The wallet spends the change of a outside the plan: its read is up to date
    const outside = await builder.build(
      [spend.pubKey({ utxo: change }), payTo(bob, 1n * ADA)],
      { payer: wallet },
    );
    await emulator.submitTx(await wallet.signTx(outside.tx));
    const read = await caught(plan.add({ c: payTo(carol, 2n * ADA) }));
    expect(TxBuildError.is(read, "INVALID_OPTION")).toBe(true);
    expect(read.details.allowed).toBe(ADDED);
    expect(read.message).toMatch(/the read is behind the block/);
    expect(read.message).toMatch(/The same call again later tells/);
    expect(read.message).not.toMatch(/snapshot/);
    expect(names(plan)).toEqual(["a"]);
  });
});
