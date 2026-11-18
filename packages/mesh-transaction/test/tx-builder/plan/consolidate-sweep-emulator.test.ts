import type { TxPlan, Utxo } from "../../../src/tx-builder";
import { referenceInput, spend, TxPlanError } from "../../../src/tx-builder";
import {
  consolidationsOf,
  fragmented,
  keyOf,
  parkedOf,
  pay,
  sumOf,
  unitAt,
  wanted,
  withWanted,
} from "./consolidate-util";
import { builderOf, caught, walletOf } from "./plan-emulator-util";
import { ADA, alice, bob, paidTo, payTo } from "./run-util";

// A step with sendAllTo after consolidation steps of its payer: it takes every output they
// parked, so that the payer is left with nothing, whether the consolidation steps are in the
// same call, in a block, or final.

const LONG = 300_000;

/** The parked outputs of the plan, each once, as out refs */
const parkedKeys = (plan: TxPlan) => parkedOf(plan).map(keyOf);

/** The inputs of a step as out refs, each once */
const inputKeys = (plan: TxPlan, name: string) =>
  plan.step(name).inputs.map(keyOf);

describe("a sweep after consolidation steps", () => {
  it(
    "takes every output the plan parked: the payer is left with nothing",
    async () => {
      for (const parts of [[pay({ lovelace: 1n * ADA }, alice)], []]) {
        const { emulator, builder, wallet, address } = await fragmented(
          withWanted(250),
          { maxTxSize: 4096 },
        );
        const plan = await builder.plan(
          {
            first: pay({ lovelace: 400n * ADA }),
            sweep: { parts, sendAllTo: alice },
          },
          { payer: wallet, consolidate: { maxSteps: 8 } },
        );
        expect(consolidationsOf(plan).length).toBeGreaterThan(0);
        const parked = parkedKeys(plan);
        expect(parked.length).toBeGreaterThan(0);
        // The served step leaves them, the sweep takes them all
        const first = inputKeys(plan, "first");
        for (const each of parked) expect(first).not.toContain(each);
        expect(inputKeys(plan, "sweep")).toEqual(
          expect.arrayContaining(parked),
        );

        await plan.run();
        expect(plan.status).toBe("final");
        expect(emulator.utxos({ address })).toEqual([]);
        expect(unitAt(emulator, alice, wanted)).toBe(250n);
      }
    },
    LONG,
  );

  it(
    "an added sweep takes the parked outputs of a final consolidation step from the payer's read",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096 },
      );
      // A step of a second payer, left unsigned, keeps the plan going once the others are final
      const other = await walletOf(1);
      emulator.fund((await other.getChangeAddress())!, { lovelace: 50n * ADA });
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 400n * ADA }),
          x: { parts: pay({ lovelace: 2n * ADA }, bob), payer: other },
        },
        { payer: wallet },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      const error = await caught(plan.run());
      expect(TxPlanError.is(error, "MISSING_SIGNATURES")).toBe(true);
      for (const step of plan.steps)
        expect(step.status).toBe(step.name === "x" ? "built" : "final");

      await plan.add({ sweep: { parts: [], sendAllTo: alice } });
      const sweep = inputKeys(plan, "sweep");
      expect(sweep).toEqual(expect.arrayContaining(parked));
      expect(new Set(sweep).size).toBe(sweep.length);
      await plan.run({ signers: [wallet, other] });
      expect(plan.status).toBe("final");
      expect(emulator.utxos({ address })).toEqual([]);
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
      expect(paidTo(emulator, bob)).toEqual([2n * ADA]);
    },
    LONG,
  );

  it(
    "an added sweep takes the parked outputs of a consolidation step in a block and not final, each once",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096, confirmations: 3 },
      );
      const plan = await builder.plan(
        { first: pay({ lovelace: 400n * ADA }) },
        { payer: wallet },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      await plan.run();
      for (const step of plan.steps) expect(step.status).toBe("included");

      // The payer's read lists the parked outputs, and so does the copy of the step the build
      // is given: the sweep spends each once
      await plan.add({ sweep: { parts: [], sendAllTo: alice } });
      const sweep = inputKeys(plan, "sweep");
      expect(sweep).toEqual(expect.arrayContaining(parked));
      expect(new Set(sweep).size).toBe(sweep.length);
      await plan.run();
      expect(plan.step("sweep").status).toBe("included");
      expect(emulator.utxos({ address })).toEqual([]);
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
    },
    LONG,
  );

  it(
    "takes the parked outputs under a canSelect that allows only what the wallet held, and nothing else it refuses",
    async () => {
      const { emulator, provider, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096 },
      );
      const known = new Set(
        (await provider.fetchAddressUTxOs(address)).map((u) => keyOf(u.input)),
      );
      // A UTxO the filter refuses: no step takes it
      const refused = emulator.fund(address, { lovelace: 7n * ADA });
      const canSelect = (utxo: Utxo) => known.has(keyOf(utxo));
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 400n * ADA }),
          sweep: {
            parts: [spend.pubKey({ utxo: { step: "first", change: true } })],
            sendAllTo: alice,
          },
        },
        { payer: wallet, canSelect, consolidate: { maxSteps: 8 } },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      expect(inputKeys(plan, "sweep")).toEqual(expect.arrayContaining(parked));
      for (const step of plan.steps)
        expect(step.inputs.map(keyOf)).not.toContain(keyOf(refused.input));
      await plan.run();
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
      expect(emulator.utxos({ address }).map((u) => keyOf(u.input))).toEqual([
        keyOf(refused.input),
      ]);
    },
    LONG,
  );

  it(
    "an added sweep after final consolidation steps takes their parked outputs only where its canSelect allows them",
    async () => {
      for (const allowParked of [false, true]) {
        const { emulator, provider, builder, wallet, address } =
          await fragmented(withWanted(250), { maxTxSize: 4096 });
        const known = new Set(
          (await provider.fetchAddressUTxOs(address)).map((u) =>
            keyOf(u.input),
          ),
        );
        const other = await walletOf(1);
        emulator.fund((await other.getChangeAddress())!, {
          lovelace: 50n * ADA,
        });
        const plan = await builder.plan(
          {
            first: pay({ lovelace: 400n * ADA }),
            // A step of another payer, left unsigned: the plan stops at it
            x: {
              parts: pay({ lovelace: 2n * ADA }, bob),
              payer: other,
              canSelect: () => true,
            },
          },
          {
            payer: wallet,
            canSelect: (utxo: Utxo) => known.has(keyOf(utxo)),
          },
        );
        const parked = parkedKeys(plan);
        expect(parked.length).toBeGreaterThan(0);
        await caught(plan.run());
        for (const step of consolidationsOf(plan))
          expect(step.status).toBe("final");
        expect(plan.step("first").status).toBe("final");
        // Final, the parked outputs are the payer's UTxOs like any other: canSelect is asked
        const canSelect = (utxo: Utxo) =>
          known.has(keyOf(utxo)) ||
          (allowParked && parked.includes(keyOf(utxo)));
        await plan.add({
          sweep: {
            parts: [spend.pubKey({ utxo: { step: "first", change: true } })],
            sendAllTo: alice,
            canSelect,
          },
        });
        const sweepIn = inputKeys(plan, "sweep");
        for (const each of parked)
          expect(sweepIn.includes(each)).toBe(allowParked);
        await plan.run({ signers: [wallet, other] });
        expect(plan.status).toBe("final");
        const parkedHeld = sumOf(parkedOf(plan), wanted);
        if (allowParked) {
          expect(unitAt(emulator, alice, wanted)).toBe(250n);
          expect(unitAt(emulator, address, wanted)).toBe(0n);
        } else {
          expect(unitAt(emulator, address, wanted)).toBe(parkedHeld);
          expect(unitAt(emulator, alice, wanted)).toBe(250n - parkedHeld);
        }
      }
    },
    LONG,
  );

  it(
    "a sweep never takes what a step given built reads, under a canSelect that allows it",
    async () => {
      const { emulator, provider, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096 },
      );
      // A UTxO of the payer that another party's transaction reads
      const small = emulator.fund(address, { lovelace: 5n * ADA });
      const known = new Set(
        (await provider.fetchAddressUTxOs(address)).map((u) => keyOf(u.input)),
      );
      expect(known.has(keyOf(small.input))).toBe(true);
      const partner = await walletOf(1);
      const partnerAddress = (await partner.getChangeAddress())!;
      emulator.fund(partnerAddress, { lovelace: 50n * ADA });
      const reads = await builderOf(provider).build(
        [referenceInput({ utxo: small.input }), payTo(bob, 2n * ADA)],
        { payer: partner },
      );
      await reads.sign();
      const plan = await builder.plan(
        {
          first: pay({ lovelace: 400n * ADA }),
          swap: reads.partialTx,
          sweep: {
            parts: [spend.pubKey({ utxo: { step: "first", change: true } })],
            sendAllTo: alice,
          },
        },
        {
          payer: wallet,
          canSelect: (utxo: Utxo) => known.has(keyOf(utxo)),
          consolidate: { maxSteps: 8 },
        },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      expect(inputKeys(plan, "sweep")).toEqual(expect.arrayContaining(parked));
      for (const step of plan.steps)
        if (step.name !== "swap")
          expect(step.inputs.map(keyOf)).not.toContain(keyOf(small.input));
      await plan.run();
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
      expect(emulator.utxos({ address }).map((u) => keyOf(u.input))).toEqual([
        keyOf(small.input),
      ]);
    },
    LONG,
  );

  it(
    "the sweep of each payer takes the outputs its own consolidation steps parked, never another payer's",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096 },
      );
      const other = await walletOf(1);
      const otherAddress = (await other.getChangeAddress())!;
      const otherUnit = `${"c7".repeat(28)}02`;
      for (let i = 0; i < 250; i += 1)
        emulator.fund(otherAddress, { lovelace: 2n * ADA, [otherUnit]: 1n });
      const plan = await builder.plan(
        {
          b1: { parts: pay({ lovelace: 400n * ADA }), payer: other },
          a1: pay({ lovelace: 400n * ADA }),
          aSweep: {
            parts: [spend.pubKey({ utxo: { step: "a1", change: true } })],
            sendAllTo: alice,
          },
          bSweep: {
            parts: [spend.pubKey({ utxo: { step: "b1", change: true } })],
            sendAllTo: bob,
            payer: other,
          },
        },
        { payer: wallet, consolidate: { maxSteps: 8 } },
      );
      const parkedAt = (at: string) =>
        consolidationsOf(plan)
          .filter((step) => step.outputs[0]!.address === at)
          .flatMap((step) =>
            step.outputs.filter((each) => each.change !== true).map(keyOf),
          );
      const parkedA = parkedAt(address);
      const parkedB = parkedAt(otherAddress);
      expect(parkedA.length).toBeGreaterThan(0);
      expect(parkedB.length).toBeGreaterThan(0);
      const aIn = inputKeys(plan, "aSweep");
      const bIn = inputKeys(plan, "bSweep");
      expect(aIn).toEqual(expect.arrayContaining(parkedA));
      expect(bIn).toEqual(expect.arrayContaining(parkedB));
      expect(aIn.filter((each) => parkedB.includes(each))).toEqual([]);
      expect(bIn.filter((each) => parkedA.includes(each))).toEqual([]);
      await plan.run({ signers: [wallet, other] });
      expect(plan.status).toBe("final");
      expect(unitAt(emulator, alice, wanted)).toBe(250n);
      expect(unitAt(emulator, bob, otherUnit)).toBe(250n);
      expect(emulator.utxos({ address })).toEqual([]);
      expect(emulator.utxos({ address: otherAddress })).toEqual([]);
    },
    LONG,
  );

  it(
    "a sweep asks canSelect about outputs another payer's consolidation steps parked, though its payer's UTxOs hold them",
    async () => {
      const { emulator, builder, wallet, address } = await fragmented(
        withWanted(250),
        { maxTxSize: 4096, confirmations: 3 },
      );
      const plan = await builder.plan(
        { first: pay({ lovelace: 400n * ADA }) },
        { payer: wallet },
      );
      const parked = parkedKeys(plan);
      expect(parked.length).toBeGreaterThan(0);
      await plan.run();
      for (const step of plan.steps) expect(step.status).toBe("included");
      // A payer with a change address of its own whose UTxOs also hold those at the first
      // payer's address, the parked outputs among them
      const other = await walletOf(1);
      const otherAddress = (await other.getChangeAddress())!;
      for (let i = 0; i < 3; i += 1)
        emulator.fund(otherAddress, { lovelace: 20n * ADA });
      const own = emulator.utxos({ address: otherAddress });
      const held = emulator.utxos({ address });
      expect(held.map((u) => keyOf(u.input))).toEqual(
        expect.arrayContaining(parked),
      );
      const allowed = new Set(own.map((u) => keyOf(u.input)));
      await plan.add({
        sweep: {
          parts: [],
          sendAllTo: alice,
          payer: { changeAddress: otherAddress, utxos: [...own, ...held] },
          canSelect: (utxo: Utxo) => allowed.has(keyOf(utxo)),
        },
      });
      const sweep = inputKeys(plan, "sweep");
      expect(sweep.sort()).toEqual([...allowed].sort());
    },
    LONG,
  );
});
