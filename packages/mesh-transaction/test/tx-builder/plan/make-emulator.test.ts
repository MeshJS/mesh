import { mConStr0, UTxO } from "@meshsdk/core";
import { TxEmulator } from "@meshsdk/tx-emulator";
import { MeshWallet } from "@meshsdk/wallet";

import type {
  BuiltTxData,
  PlanSteps,
  StepParts,
  Utxo,
} from "../../../src/tx-builder";
import type { MadePlan } from "../../../src/tx-builder/plan/make";
import type { Validator } from "./plan-emulator-util";
import {
  output,
  spend,
  TxBuilder,
  TxBuildError,
  TxPartError,
  validity,
} from "../../../src/tx-builder";
import { encodePlan, readPlan } from "../../../src/tx-builder/plan/json";
import { makePlan } from "../../../src/tx-builder/plan/make";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import { mapPairs, topItems } from "../cbor-util";
import { caught, VALIDATORS, walletOf } from "./plan-emulator-util";

// A plan built on the emulator: every body at once, threaded through the payer's
// UTxOs, links filled in from the earlier steps' transactions, one deadline. The tests sign and
// submit the transactions by hand, in order, and see each land.

const alice = baseAddress(3);
const bob = baseAddress(4);
const carol = baseAddress(5);
const script = { code: alwaysSucceedCbor, version: "V3" as const };
const ADA = 1_000_000n;
const TTL = 600_000;

const pay = (address: string, lovelace: bigint, label?: string) =>
  output({
    address,
    value: { lovelace },
    ...(label !== undefined && { label }),
  });

const outRefs = (utxos: readonly (Utxo | UTxO)[]) =>
  utxos.map((u) => {
    const { txHash, outputIndex } = "input" in u ? u.input : u;
    return `${txHash}#${outputIndex}`;
  });

/** An emulator of preprod with a builder on it and a wallet funded with these UTxOs */
const setup = async (validator: Validator, funds: bigint[] = [1000n * ADA]) => {
  const emulator = await TxEmulator.create({
    validator,
    network: "preprod",
    slot: 100_000_000,
  });
  const builder = new TxBuilder({
    network: "preprod",
    provider: emulator,
    evaluator: emulator,
    planDefaults: { ttlMs: TTL },
  });
  const wallet = await walletOf();
  const address = (await wallet.getChangeAddress())!;
  for (const lovelace of funds) emulator.fund(address, { lovelace });
  return { emulator, builder, wallet, address };
};

/** Signs each step with its wallet and submits it, in order; the hashes the emulator answers */
const land = async (
  emulator: TxEmulator,
  plan: MadePlan,
  walletOf: (name: string) => MeshWallet,
) => {
  const answers: string[] = [];
  for (const step of plan.steps)
    answers.push(
      await emulator.submitTx(await walletOf(step.name).signTx(step.built.tx)),
    );
  expect(answers).toEqual(plan.steps.map((step) => step.built.txHash));
};

const stepOf = (plan: MadePlan, name: string): BuiltTxData =>
  plan.steps.find((step) => step.name === name)!.built;

describe.each(["scalus", "cquisitor"] as const)(
  "a plan built on TxEmulator (%s)",
  (validator) => {
    it("builds every step before anything is sent, each spending the change of the step before it: one UTxO of 1000 ada through three steps", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const [funded] = emulator.utxos({ address });
      const plan = await makePlan(
        builder,
        {
          a: pay(alice, 10n * ADA),
          b: pay(bob, 7n * ADA),
          c: pay(carol, 3n * ADA),
        },
        { payer: wallet },
      );
      // Built, nothing sent: the wallet still holds its one UTxO, and no step is on chain
      expect(outRefs(emulator.utxos({ address }))).toEqual(outRefs([funded!]));
      expect(plan.steps.map((step) => step.name)).toEqual(["a", "b", "c"]);
      expect(plan.record.steps.map((step) => step.status)).toEqual([
        "built",
        "built",
        "built",
      ]);
      const [a, b, c] = plan.steps.map((step) => step.built);
      expect(outRefs(a!.inputs)).toEqual(outRefs([funded!]));
      expect(outRefs(b!.inputs)).toEqual(outRefs(a!.change));
      expect(outRefs(c!.inputs)).toEqual(outRefs(b!.change));
      expect(plan.steps.map((step) => step.standsOn)).toEqual([
        [],
        ["a"],
        ["b"],
      ]);
      await land(emulator, plan, () => wallet);
      expect(emulator.utxos({ address: carol })[0]!.output.amount).toEqual([
        { unit: "lovelace", quantity: String(3n * ADA) },
      ]);
    });

    it("spends the change of the step before it of the same payer when selection would take another UTxO", async () => {
      const { emulator, builder, wallet } = await setup(validator, [
        1000n * ADA,
        10n * ADA,
      ]);
      const plan = await makePlan(
        builder,
        { a: pay(alice, 995n * ADA), b: pay(bob, 2n * ADA) },
        { payer: wallet },
      );
      const [a, b] = plan.steps.map((step) => step.built);
      expect(outRefs(b!.inputs)).toEqual(
        expect.arrayContaining(outRefs(a!.change)),
      );
      expect(plan.steps[1]!.standsOn).toEqual(["a"]);
      await land(emulator, plan, () => wallet);
    });

    it("fills a link by label and by position from the earlier step's own transaction", async () => {
      const { emulator, builder, wallet, address } = await setup(validator);
      const plan = await makePlan(
        builder,
        {
          a: [pay(address, 20n * ADA, "keep"), pay(address, 30n * ADA)],
          b: [
            spend.pubKey({ utxo: { step: "a", output: "keep" } }),
            spend.pubKey({ utxo: { step: "a", output: 1 } }),
            pay(alice, 45n * ADA),
          ],
        },
        { payer: wallet },
      );
      const a = stepOf(plan, "a");
      const b = stepOf(plan, "b");
      expect(a.outputs[0]!.label).toBe("keep");
      expect(outRefs(b.inputs)).toEqual(
        expect.arrayContaining(outRefs([a.outputs[0]!, a.outputs[1]!])),
      );
      // The given parts keep their links; the built parts hold the filled inputs
      expect(plan.steps[1]!.given!.parts[0]).toMatchObject({
        link: { step: "a", output: "keep" },
      });
      expect(
        b.parts.filter(
          (part) =>
            part.kind === "spend" &&
            part.input.transaction_id === a.txHash &&
            part.input.index === 0,
        ),
      ).toHaveLength(1);
      await land(emulator, plan, () => wallet);
    });

    it("spends every change output a link to all the change names, and none when there is no change", async () => {
      const { emulator, builder, wallet } = await setup(validator);
      const plan = await makePlan(
        builder,
        {
          a: pay(alice, 10n * ADA),
          b: [
            spend.pubKey({ utxo: { step: "a", change: true } }),
            pay(bob, 5n * ADA),
          ],
          c: { parts: pay(carol, 2n * ADA), sendAllTo: carol },
          d: [
            spend.pubKey({ utxo: { step: "c", change: true } }),
            spend.pubKey({ utxo: { step: "c", output: 1 } }),
            pay(alice, 1n * ADA),
          ],
        },
        { payer: wallet },
      );
      const a = stepOf(plan, "a");
      const b = stepOf(plan, "b");
      const c = stepOf(plan, "c");
      const d = stepOf(plan, "d");
      expect(a.change.length).toBeGreaterThan(0);
      expect(outRefs(b.inputs)).toEqual(outRefs(a.change));
      expect(b.parts.filter((part) => part.kind === "spend").length).toBe(
        a.change.length,
      );
      // c sends everything to carol: it leaves no change, and the link to all of it is no part
      expect(c.change).toEqual([]);
      expect(outRefs(d.inputs)).toEqual(outRefs([c.outputs[1]!]));
      expect(d.parts.filter((part) => part.kind === "spend")).toHaveLength(1);
      expect(plan.steps[3]!.standsOn).toEqual(["c"]);
      expect(plan.steps[3]!.given!.parts).toHaveLength(3);
    });

    it("builds a Plutus step that spends an output an earlier step makes, evaluated before that step is on chain", async () => {
      const { emulator, builder, wallet } = await setup(validator);
      const vault = builder.scriptAddress(script);
      const plan = await makePlan(
        builder,
        {
          lock: output({
            address: vault,
            value: { lovelace: 10n * ADA },
            datum: { type: "inline", data: mConStr0([]) },
            label: "vault",
          }),
          unlock: [
            spend.plutus({
              utxo: { step: "lock", output: "vault" },
              script,
              redeemer: { data: mConStr0([]) },
            }),
            pay(bob, 4n * ADA),
          ],
        },
        { payer: wallet },
      );
      const lock = stepOf(plan, "lock");
      const unlock = stepOf(plan, "unlock");
      expect(emulator.utxos({ address: vault })).toHaveLength(0);
      expect(unlock.redeemers[0]!.exUnits.mem).toBeGreaterThan(0n);
      // It spends an output of lock already, so lock's change is not added: it is the collateral
      expect(outRefs(unlock.inputs)).toEqual(outRefs([lock.outputs[0]!]));
      expect(outRefs(unlock.collateral!.inputs)).toEqual(outRefs(lock.change));
      expect(plan.steps[1]!.standsOn).toEqual(["lock"]);
      await land(emulator, plan, () => wallet);
      expect(emulator.utxos({ address: vault })).toHaveLength(0);
    });

    it("takes { data } for a linked output that holds its datum inline as a check: the same data spends the inline datum, carried in no witness set, and other data is DATUM_MISMATCH", async () => {
      const { emulator, builder, wallet } = await setup(validator);
      const vault = builder.scriptAddress(script);
      const steps = (data: ReturnType<typeof mConStr0>) => ({
        lock: output({
          address: vault,
          value: { lovelace: 10n * ADA },
          datum: { type: "inline", data: mConStr0([]) },
          label: "vault",
        }),
        unlock: [
          spend.plutus({
            utxo: { step: "lock", output: "vault" },
            script,
            redeemer: { data: mConStr0([]) },
            datum: { data },
          }),
          pay(bob, 4n * ADA),
        ],
      });
      const mismatch = await caught(
        makePlan(builder, steps(mConStr0([1])), { payer: wallet }),
      );
      expect(mismatch.code).toBe("DATUM_MISMATCH");
      expect(mismatch.message).toMatch(/holds its datum inline/);
      const plan = await makePlan(builder, steps(mConStr0([])), {
        payer: wallet,
      });
      const unlock = stepOf(plan, "unlock");
      expect(
        mapPairs(topItems(unlock.tx)[1]!).filter(([key]) => key === "04"),
      ).toEqual([]);
      await land(emulator, plan, () => wallet);
      expect(emulator.utxos({ address: vault })).toHaveLength(0);
    });

    it("threads two payers apart: a step stands on the step before it of its own payer", async () => {
      const { emulator, builder, wallet } = await setup(validator);
      const other = await walletOf(1);
      const otherAddress = (await other.getChangeAddress())!;
      emulator.fund(otherAddress, { lovelace: 100n * ADA });
      const plan = await makePlan(
        builder,
        {
          a: pay(alice, 10n * ADA),
          b: { parts: pay(bob, 5n * ADA), payer: other },
          c: pay(carol, 3n * ADA),
        },
        { payer: wallet },
      );
      expect(plan.steps.map((step) => step.standsOn)).toEqual([[], [], ["a"]]);
      const b = stepOf(plan, "b");
      expect(b.change.every((o) => o.address === otherAddress)).toBe(true);
      expect(plan.steps[1]!.given!.options).toEqual({
        changeAddress: otherAddress,
      });
      await land(emulator, plan, (name) => (name === "b" ? other : wallet));
    });
  },
);

describe.each(VALIDATORS)("a plan (%s)", (v) => {
  it("gives every step it builds the plan's deadline, and keeps an end its parts give", async () => {
    const { emulator, builder, wallet } = await setup(v);
    const tipTime = builder.timeAt(emulator.slot);
    const own = tipTime + 60_000;
    const plan = await makePlan(
      builder,
      {
        a: pay(alice, 10n * ADA),
        b: pay(bob, 5n * ADA),
        c: [pay(carol, 3n * ADA), validity({ until: own })],
        d: [pay(alice, 1n * ADA), validity({ from: tipTime + 120_000 })],
      },
      { payer: wallet },
    );
    const deadline = builder.timeAt(builder.slotAt(tipTime + TTL));
    expect(plan.tip.timeMs).toBe(tipTime);
    const until = plan.steps.map((step) => step.built.validity?.until);
    expect(until[0]).toBe(deadline);
    expect(until[1]).toBe(deadline);
    expect(until[2]).toBe(builder.timeAt(builder.slotAt(own)));
    expect(until[3]).toBe(
      builder.timeAt(builder.slotAt(tipTime + 120_000 + TTL)),
    );
    expect(plan.until).toBe(until[3]);
    // The plan's own ttlMs replaces the builder's
    const short = await makePlan(builder, pay(alice, 1n * ADA), {
      payer: wallet,
      ttlMs: 30_000,
    });
    expect(short.steps[0]!.built.validity?.until).toBe(
      builder.timeAt(builder.slotAt(tipTime + 30_000)),
    );
  });

  it("is the step main for one list of parts, with the parts the builder holds first, and gives its first record", async () => {
    const { builder, wallet } = await setup(v);
    const plan = await makePlan(
      builder.add(pay(bob, 2n * ADA, "fee")),
      pay(alice, 10n * ADA),
      { payer: wallet, id: "order-1", fee: 400_000n },
    );
    expect(plan.steps.map((step) => step.name)).toEqual(["main"]);
    const main = plan.steps[0]!;
    expect(main.built.fee).toBe(400_000n);
    expect(main.built.outputs.map((o) => o.label)).toEqual(
      expect.arrayContaining(["fee"]),
    );
    expect(main.given!.options).toEqual({ fee: 400_000n });
    expect(plan.record).toMatchObject({
      id: "order-1",
      rev: 1,
      status: "pending",
      network: "preprod",
      deadlines: { ttlMs: TTL },
    });
    const json = encodePlan(plan.record);
    expect(encodePlan(readPlan(JSON.parse(JSON.stringify(json))))).toEqual(
      json,
    );
  });

  it("puts the step's name at the start of an error of building it", async () => {
    const { builder, wallet } = await setup(v);
    const error = await caught(
      makePlan(
        builder,
        { a: pay(alice, 10n * ADA), b: pay(bob, 5000n * ADA) },
        { payer: wallet },
      ),
    );
    expect(TxBuildError.is(error, "INSUFFICIENT_FUNDS")).toBe(true);
    expect(error.message).toMatch(/^step "b": /);
  });

  describe("refuses", () => {
    const refused = async (
      steps: StepParts | PlanSteps,
      options: Record<string, unknown> = {},
      builderOf?: (builder: TxBuilder) => TxBuilder,
    ) => {
      const { builder, wallet } = await setup(v);
      return caught(
        makePlan(builderOf ? builderOf(builder) : builder, steps, {
          payer: wallet,
          ...options,
        }),
      );
    };
    const invalidSteps = (error: unknown, message: RegExp) => {
      expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
      expect((error as TxBuildError).details).toMatchObject({
        option: "steps",
      });
      expect((error as Error).message).toMatch(message);
    };

    it("a link to a step that is not before it, to itself, or to no step", async () => {
      invalidSteps(
        await refused({
          a: [
            spend.pubKey({ utxo: { step: "b", output: 0 } }),
            pay(alice, 1n * ADA),
          ],
          b: pay(bob, 1n * ADA),
        }),
        /^step "a": .*names step "b", which is not before step "a"/,
      );
      invalidSteps(
        await refused({
          a: [spend.pubKey({ utxo: { step: "a", change: true } })],
        }),
        /which is not before step "a"/,
      );
      invalidSteps(
        await refused({
          a: pay(alice, 1n * ADA),
          b: [spend.pubKey({ utxo: { step: "x", output: 0 } })],
        }),
        /names step "x", which the plan does not have/,
      );
    });

    it("a label no output of the step has, and a label several outputs share", async () => {
      const unknown = await refused({
        a: pay(alice, 1n * ADA, "one"),
        b: [spend.pubKey({ utxo: { step: "a", output: "two" } })],
      });
      expect(TxBuildError.is(unknown, "UNKNOWN_LABEL")).toBe(true);
      expect(unknown.details).toEqual({ label: "two", labels: ["one"] });
      expect(unknown.message).toMatch(/^step "b": /);
      invalidSteps(
        await refused({
          a: [pay(alice, 1n * ADA, "twice"), pay(bob, 1n * ADA, "twice")],
          b: [spend.pubKey({ utxo: { step: "a", output: "twice" } })],
        }),
        /2 of its outputs have/,
      );
    });

    it("a position past the outputs of the step", async () => {
      invalidSteps(
        await refused({
          a: pay(alice, 1n * ADA),
          b: [spend.pubKey({ utxo: { step: "a", output: 9 } })],
        }),
        /output 9 of step "a", whose transaction has 2 output/,
      );
    });

    it("a filled link the part cannot take: a key spend of a script output, a datum the output does not hold", async () => {
      const { builder } = await setup(v);
      const vault = builder.scriptAddress(script);
      const lock = output({
        address: vault,
        value: { lovelace: 10n * ADA },
        datum: { type: "inline", data: mConStr0([]) },
        label: "vault",
      });
      const byKey = await refused({
        lock,
        b: [spend.pubKey({ utxo: { step: "lock", output: "vault" } })],
      });
      expect(byKey).toBeInstanceOf(TxPartError);
      expect(byKey.code).toBe("WITNESS_MISMATCH");
      expect(byKey.message).toMatch(/^step "b": /);
      const datum = await refused({
        lock,
        b: [
          spend.plutus({
            utxo: { step: "lock", output: "vault" },
            script,
            redeemer: { data: mConStr0([]) },
            datum: "none",
          }),
        ],
      });
      expect(datum.code).toBe("DATUM_MISMATCH");
    });

    it("names that are empty, whole numbers or reserved, and a plan of no step or too many", async () => {
      invalidSteps(await refused({ "": pay(alice, 1n * ADA) }), /non-empty/);
      invalidSteps(
        await refused({ "12": pay(alice, 1n * ADA) }),
        /whole number/,
      );
      invalidSteps(
        await refused({ "consolidate-1": pay(alice, 1n * ADA) }),
        /consolidate-/,
      );
      invalidSteps(await refused({}), /a step at least/);
      const many = Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => [`s${i}`, pay(alice, 1n * ADA)]),
      );
      invalidSteps(await refused(many), /at most 32/);
    });

    it("a step of no known form: the data or the JSON of a built transaction, an object without parts or with a member it does not know", async () => {
      const { builder, wallet } = await setup(v);
      const built = await builder.build(pay(alice, 1n * ADA), {
        payer: wallet,
      });
      invalidSteps(await refused({ a: { ...built } as never }), /built before/);
      invalidSteps(
        await refused({ a: built.toJSON() as never }),
        /built before/,
      );
      invalidSteps(
        await refused({ a: { payer: wallet } as never }),
        /neither parts/,
      );
      invalidSteps(
        await refused({ a: { parts: [], ttlMs: 1 } as never }),
        /"ttlMs"/,
      );
      invalidSteps(await refused(built as never), /expected one list/);
    });

    it("sendAllTo or fee among the options of named steps, and named steps on a builder that holds parts", async () => {
      invalidSteps(
        await refused({ a: pay(alice, 1n * ADA) }, { sendAllTo: alice }),
        /sendAllTo describes one transaction/,
      );
      invalidSteps(
        await refused({ a: pay(alice, 1n * ADA) }, { fee: 1n }),
        /fee describes one transaction/,
      );
      invalidSteps(
        await refused({ a: pay(alice, 1n * ADA) }, {}, (b) =>
          b.add(pay(bob, 1n * ADA)),
        ),
        /holds 1 part/,
      );
    });
  });
});
