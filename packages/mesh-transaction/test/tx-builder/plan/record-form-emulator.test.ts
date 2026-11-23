import type { NativeScript } from "@meshsdk/core";
import { deserializeAddress, mConStr0 } from "@meshsdk/core";
import { resolvePlutusScriptAddress } from "@meshsdk/core-cst";

import type {
  BuiltTxData,
  ResumeOptions,
  TxBuilder,
  TxPlan,
  TxPlanJSON,
  TxStep,
} from "../../../src/tx-builder";
import type { Validator } from "./plan-emulator-util";
import {
  certificate,
  mint,
  output,
  referenceInput,
  spend,
  TxPlanError,
  withdrawal,
} from "../../../src/tx-builder";
import { encodeBuilt, readPlan } from "../../../src/tx-builder/plan/json";
import { alwaysSucceedCbor, alwaysSucceedHash } from "../../test-util";
import { coins, fragmented, pay } from "./consolidate-util";
import { builderOf, VALIDATORS, walletOf, wrap } from "./plan-emulator-util";
import { ADA, alice, bob, carol, dave, payTo, stepSetup } from "./run-util";
import { watchStore } from "./store-util";

// A plan's record writes a step's transaction without what its bytes and recorded UTxOs give
// again: no prototype the bytes give, no UTxO a part repeats from the transaction's own lists.
// The reader works them out again and checks them against the bytes: a plan read from its
// record shows the same steps, writes the same record and goes on as one never written.

const LONG = 180_000;
const script = { code: alwaysSucceedCbor, version: "V3" as const };
const vault = resolvePlutusScriptAddress(script, 0);
const policy = alwaysSucceedHash;
const redeemer = { data: mConStr0([]) };

/** The members of the data of a build, as `BuiltTxData` declares them */
const BUILT_KEYS = [
  "tx",
  "txHash",
  "prototype",
  "fee",
  "exUnits",
  "redeemers",
  "inputs",
  "selectedInputs",
  "referenceInputs",
  "outputs",
  "change",
  "collateral",
  "signers",
  "validity",
  "network",
  "warnings",
  "parts",
] as const;

/** The data of a step's build, without the members of its place in the plan */
const builtOf = (step: TxStep): BuiltTxData =>
  Object.fromEntries(
    BUILT_KEYS.filter((key) => step[key] !== undefined).map((key) => [
      key,
      step[key],
    ]),
  ) as unknown as BuiltTxData;

/** The plan's record as JSON text gives it */
const recordOf = (plan: TxPlan): TxPlanJSON => JSON.parse(JSON.stringify(plan));

/**
 * The record as it was written before: each step's transaction as the whole JSON of a
 * `BuiltTx`, with its prototype and every UTxO in its parts
 */
const wholeForm = (plan: TxPlan): TxPlanJSON => {
  const json = recordOf(plan) as any;
  plan.steps.forEach((step, i) => {
    json.steps[i].tx.built = JSON.parse(
      JSON.stringify(encodeBuilt(builtOf(step))),
    );
  });
  return json;
};

/** The size of a text in UTF-8 bytes */
const bytesOf = (value: unknown) =>
  Buffer.byteLength(JSON.stringify(value), "utf8");

/** Every step of the plan read from its record is the step of the plan, member by member */
const expectSameSteps = (read: TxPlan, plan: TxPlan) => {
  expect(read.steps.map((step) => step.name)).toEqual(
    plan.steps.map((step) => step.name),
  );
  plan.steps.forEach((step, i) => {
    const again = read.steps[i]!;
    expect(again.parts).toEqual(step.parts);
    expect(again.prototype).toEqual(step.prototype);
    expect(again.redeemers).toEqual(step.redeemers);
    expect(again.selectedInputs).toEqual(step.selectedInputs);
    expect(again).toEqual(step);
  });
};

/** The plan read from its record through JSON text, checked against it, and its record */
const throughRecord = async (
  builder: TxBuilder,
  plan: TxPlan,
  options?: ResumeOptions,
) => {
  const json = recordOf(plan);
  const read = await builder.resume(JSON.parse(JSON.stringify(json)), options);
  expectSameSteps(read, plan);
  expect(read.toJSON()).toEqual(json);
  expect(read.status).toBe(plan.status);
  return { read, json };
};

/** The error of reading a record, which must be INVALID_STATE (recordVersion) */
const notRead = (json: unknown): TxPlanError => {
  let error: unknown;
  try {
    readPlan(json);
  } catch (caughtError) {
    error = caughtError;
  }
  expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
  expect((error as TxPlanError).details).toEqual({ reason: "recordVersion" });
  return error as TxPlanError;
};

/**
 * An emulator with the wallet funded, a UTxO to read at alice's, and a partner wallet with a
 * builder of its own, funded twice, whose two payments to the wallet are steps given built
 */
const setup = async (v: Validator) => {
  const ctx = await stepSetup(v, {
    funds: [1000n * ADA, 300n * ADA],
  });
  const read = ctx.emulator.fund(alice, { lovelace: 5n * ADA });
  const partner = await walletOf(1);
  const partnerAddress = (await partner.getChangeAddress())!;
  ctx.emulator.fund(partnerAddress, { lovelace: 40n * ADA });
  ctx.emulator.fund(partnerAddress, { lovelace: 40n * ADA });
  const partnerBuilder = builderOf(wrap(ctx.emulator), {
    evaluator: ctx.emulator,
  });
  const other = await walletOf(2);
  const otherAddress = (await other.getChangeAddress())!;
  ctx.emulator.fund(otherAddress, { lovelace: 50n * ADA });
  return {
    ...ctx,
    read,
    partner,
    partnerAddress,
    partnerBuilder,
    other,
    otherAddress,
  };
};

type Ctx = Awaited<ReturnType<typeof setup>>;

/** The partner's payment to the wallet from one of its UTxOs, signed by the partner */
const partnerPays = async (ctx: Ctx, index: number, lovelace: bigint) => {
  const utxo = ctx.emulator
    .utxos({ address: ctx.partnerAddress })
    .sort((a, b) => (a.input.txHash < b.input.txHash ? -1 : 1))[index]!;
  const built = await ctx.partnerBuilder.build(
    [
      spend.pubKey({ utxo }),
      output({ address: ctx.address, value: { lovelace } }),
    ],
    { payer: { changeAddress: ctx.partnerAddress, utxos: [] } },
  );
  await built.sign({ signers: ctx.partner });
  return built;
};

/**
 * A plan of every kind of step: a payment with a mint, a lock and a Plutus spend linked to it
 * with a datum, a redeemer, a reference input and collateral, a step of its own payer, a
 * withdrawal with a certificate, and two steps given built, as an object and as CBOR
 */
const everyKind = async (ctx: Ctx) => {
  const fromObject = await partnerPays(ctx, 0, 6n * ADA);
  const fromCbor = (await partnerPays(ctx, 1, 7n * ADA)).signedTx!;
  const stake = deserializeAddress(ctx.address).stakeCredentialHash;
  const rewardAddress = (await ctx.wallet.getRewardAddresses())[0]!;
  expect(stake).not.toBe("");
  return ctx.builder.plan(
    {
      minted: [
        mint.plutus({ script, redeemer, assets: { "01": 5n } }),
        output({
          address: carol,
          value: { lovelace: 2n * ADA, [`${policy}01`]: 5n },
        }),
      ],
      lock: output({
        address: vault,
        value: { lovelace: 10n * ADA },
        datum: { type: "inline", data: mConStr0([42n]) },
        label: "vault",
      }),
      unlock: [
        spend.plutus({
          utxo: { step: "lock", output: "vault" },
          script,
          redeemer: { data: mConStr0([7n]) },
        }),
        referenceInput({ utxo: ctx.read }),
        payTo(bob, 4n * ADA, "paid"),
      ],
      own: { parts: payTo(alice, 3n * ADA), payer: ctx.other },
      staked: [
        certificate.stakeRegistration({ stake: rewardAddress }),
        withdrawal.pubKey({ rewardAddress, amount: 0n }),
        payTo(bob, 1n * ADA),
      ],
      object: fromObject,
      cbor: fromCbor,
    },
    { payer: ctx.wallet },
  );
};

describe.each(VALIDATORS)("the record of a step's transaction (%s)", (v) => {
  it(
    "holds no prototype its bytes give and no UTxO a part repeats; read back, every step is the same, and so is its record",
    async () => {
      const ctx = await setup(v);
      const plan = await everyKind(ctx);
      expect(plan.steps.map((step) => [step.name, step.kind])).toEqual([
        ["minted", undefined],
        ["lock", undefined],
        ["unlock", undefined],
        ["own", undefined],
        ["staked", undefined],
        ["object", "prebuilt"],
        ["cbor", "prebuilt"],
      ]);
      const unlock = plan.step("unlock");
      expect(unlock.collateral!.inputs.length).toBeGreaterThan(0);
      expect(unlock.referenceInputs).toHaveLength(1);
      expect(unlock.redeemers[0]!.part).toBeDefined();
      expect(plan.step("minted").redeemers[0]!.part!.kind).toBe("mint");

      const json = recordOf(plan) as any;
      const built = (name: string) =>
        json.steps.find((step: any) => step.name === name).tx.built;
      // The prototype of a step the bytes give whole is not written
      for (const name of ["own", "staked", "object", "cbor"])
        expect(built(name)).not.toHaveProperty("prototype");
      // Plutus data given as a value is not what the bytes give: only those members are written
      expect(built("lock").prototype).toEqual({
        body: { outputs: expect.any(Array) },
      });
      expect(Object.keys(built("unlock").prototype)).toEqual(["witness_set"]);
      expect(Object.keys(built("unlock").prototype.witness_set)).toEqual([
        "redeemers",
      ]);
      expect(Object.keys(built("minted").prototype.witness_set)).toEqual([
        "redeemers",
      ]);
      // A part's UTxO is the place of the transaction's own entry, and so is a selected input
      // and a redeemer's part
      const spent = built("unlock").parts.filter(
        (part: any) => part.kind === "spend",
      );
      expect(spent.length).toBeGreaterThan(0);
      for (const part of spent) {
        expect(typeof part.input).toBe("number");
        expect(part).not.toHaveProperty("utxo");
      }
      expect(
        built("unlock").parts.find(
          (part: any) => part.kind === "referenceInput",
        ),
      ).toMatchObject({ input: 0 });
      expect(
        built("unlock").parts.find((part: any) => part.kind === "collateral"),
      ).toMatchObject({ input: 0 });
      expect(typeof built("unlock").redeemers[0].part).toBe("number");
      expect(
        built("minted").selectedInputs.every(
          (entry: unknown) => typeof entry === "number",
        ),
      ).toBe(true);
      expect(built("minted").change).toEqual([
        built("minted").outputs.findIndex((each: any) => each.change),
      ]);
      for (const step of json.steps)
        expect(JSON.stringify(step.tx.built)).not.toContain('"utxo"');

      const payer = { payer: ctx.wallet };
      const { read } = await throughRecord(ctx.builder, plan, payer);
      // What is shown is the record's own data, frozen as before
      expect(Object.isFrozen(read.step("unlock").prototype)).toBe(true);
      expect(Object.isFrozen(read.step("unlock").parts)).toBe(true);

      // A step added to the plan read back, and the plan read again
      await read.add({ added: payTo(carol, 2n * ADA) });
      expect(read.step("added").status).toBe("built");
      await throughRecord(ctx.builder, read, payer);

      // Signed: read back with the witnesses it holds
      await read.sign({ signers: [ctx.wallet, ctx.other] });
      expect(read.steps.every((step) => step.status === "signed")).toBe(true);
      await throughRecord(ctx.builder, read, payer);
    },
    LONG,
  );

  it(
    "gives the same rest after a stop, and a plan read back is taken in after as the plan itself",
    async () => {
      const ctx = await setup(v);
      const plan = await everyKind(ctx);
      const { read: again } = await throughRecord(ctx.builder, plan);
      const after = await ctx.builder.plan(payTo(dave, 2n * ADA), {
        payer: ctx.wallet,
        after: plan,
      });
      const afterRead = await ctx.builder.plan(payTo(dave, 2n * ADA), {
        payer: ctx.wallet,
        after: again,
      });
      expect(afterRead.toJSON().steps[0]!.after).toEqual(
        after.toJSON().steps[0]!.after,
      );
      expect(afterRead.step("main").inputs).toEqual(after.step("main").inputs);

      await plan.stop();
      const rest = plan.rest;
      expect(Object.keys(rest)).toEqual([
        "minted",
        "lock",
        "unlock",
        "own",
        "staked",
        "object",
        "cbor",
      ]);
      const { read } = await throughRecord(ctx.builder, plan);
      expect(read.rest).toEqual(rest);
    },
    LONG,
  );

  it(
    "reads a record written whole, with prototypes and every UTxO, and writes it in the smaller form",
    async () => {
      const ctx = await setup(v);
      const plan = await everyKind(ctx);
      const whole = wholeForm(plan) as any;
      expect(whole.steps[0].tx.built.prototype.body.inputs.length).toBe(
        plan.steps[0]!.inputs.length,
      );
      expect(whole.steps[2].tx.built.parts[0].utxo).toBeDefined();
      const read = await ctx.builder.resume(whole);
      expectSameSteps(read, plan);
      expect(read.toJSON()).toEqual(recordOf(plan));
      expect(bytesOf(read.toJSON())).toBeLessThan(bytesOf(whole));
    },
    LONG,
  );

  it(
    "refuses a record whose inputs are not those of the bytes, bytes that are no transaction, and a place that names no entry",
    async () => {
      const ctx = await setup(v);
      const plan = await everyKind(ctx);
      const base = recordOf(plan) as any;
      const unlock = base.steps.findIndex(
        (step: any) => step.name === "unlock",
      );
      expect(base.steps[0].tx.built.inputs.length).toBeGreaterThan(0);
      expect(readPlan(base).steps).toHaveLength(7);
      const changed = (change: (json: any) => void) => {
        const json = JSON.parse(JSON.stringify(base));
        change(json);
        return json;
      };
      const at = (i: number) => `steps\\[${i}\\]\\.tx\\.built`;
      const cases: [(json: any) => void, RegExp][] = [
        // The UTxO of another out ref in place of an input
        [
          (json) =>
            (json.steps[0].tx.built.inputs[0] = {
              ...json.steps[0].tx.built.inputs[0],
              outputIndex: 9,
            }),
          new RegExp(
            `${at(0)}\\.inputs are not the inputs of the transaction, in its order`,
          ),
        ],
        // An input more, and an input fewer
        [
          (json) =>
            json.steps[0].tx.built.inputs.push(
              json.steps[unlock].tx.built.collateral.inputs[0],
            ),
          new RegExp(`${at(0)}\\.inputs are not the inputs of the transaction`),
        ],
        [
          (json) => {
            json.steps[unlock].tx.built.inputs = [];
            json.steps[unlock].tx.built.parts = json.steps[
              unlock
            ].tx.built.parts.filter((part: any) => part.kind !== "spend");
            json.steps[unlock].tx.built.redeemers = [];
            json.steps[unlock].tx.built.selectedInputs = [];
          },
          new RegExp(
            `${at(unlock)}\\.inputs are not the inputs of the transaction`,
          ),
        ],
        [
          (json) => {
            const built = json.steps[unlock].tx.built;
            built.collateral.inputs = [built.referenceInputs[0]];
          },
          new RegExp(
            `${at(unlock)}\\.collateral\\.inputs are not the collateral inputs of the transaction`,
          ),
        ],
        [
          (json) => {
            const built = json.steps[unlock].tx.built;
            built.referenceInputs = [built.collateral.inputs[0]];
          },
          new RegExp(
            `${at(unlock)}\\.referenceInputs are not reference inputs of the transaction`,
          ),
        ],
        // Bytes that are no transaction
        [
          (json) => (json.steps[0].tx.built.tx = "00"),
          new RegExp(
            `${at(0)}\\.tx is not a transaction in CBOR hex this library reads`,
          ),
        ],
        // Places
        [
          (json) => (json.steps[unlock].tx.built.parts[0].input = 9),
          new RegExp(
            `${at(unlock)}\\.parts\\[0\\]\\.input is 9, and inputs holds 1 entries`,
          ),
        ],
        [
          (json) => (json.steps[unlock].tx.built.parts[0].input = -1),
          new RegExp(
            `${at(unlock)}\\.parts\\[0\\]\\.input is -1, not a place in inputs`,
          ),
        ],
        [
          (json) =>
            (json.steps[unlock].tx.built.parts[0].utxo =
              json.steps[unlock].tx.built.inputs[0]),
          new RegExp(
            `${at(unlock)}\\.parts\\[0\\] holds a utxo beside the place of its input`,
          ),
        ],
        [
          (json) => (json.steps[0].tx.built.selectedInputs[0] = 99),
          new RegExp(
            `${at(0)}\\.selectedInputs\\[0\\] is 99, and inputs holds`,
          ),
        ],
        [
          (json) => (json.steps[unlock].tx.built.redeemers[0].part = 99),
          new RegExp(
            `${at(unlock)}\\.redeemers\\[0\\]\\.part is 99, not a place in parts`,
          ),
        ],
        // What a record writes of a prototype
        [
          (json) =>
            (json.steps[unlock].tx.built.prototype = { witness_set: {} }),
          new RegExp(
            `${at(unlock)}\\.prototype\\.witness_set is empty: it is written only when it differs`,
          ),
        ],
        [
          (json) => (json.steps[unlock].tx.built.prototype = {}),
          new RegExp(
            `${at(unlock)}\\.prototype is empty: it is written only when it differs`,
          ),
        ],
        [
          (json) =>
            (json.steps[unlock].tx.built.prototype = {
              witnesses: { redeemers: [] },
            }),
          new RegExp(
            `${at(unlock)}\\.prototype\\.witnesses, a member this library does not know`,
          ),
        ],
      ];
      for (const [change, message] of cases)
        expect(notRead(changed(change)).message).toMatch(message);
      // A record written whole whose inputs are not those of its bytes is refused as well
      const whole = wholeForm(plan) as any;
      whole.steps[0].tx.built.inputs[0].outputIndex = 9;
      expect(notRead(whole).message).toMatch(
        new RegExp(`${at(0)}\\.inputs are not the inputs of the transaction`),
      );
    },
    LONG,
  );
});

describe.each(VALIDATORS)("the size of a plan's record (%s)", (v) => {
  it(
    "is a small part of the whole form: a plain step, and consolidation steps of several hundred inputs",
    async () => {
      const ctx = await setup(v);
      const plain = await ctx.builder.plan(payTo(bob, 5n * ADA), {
        payer: ctx.wallet,
      });
      const step = (json: TxPlanJSON) => bytesOf(json.steps[0]);
      const plainNow = step(recordOf(plain));
      const plainBefore = step(wholeForm(plain));
      console.log(
        `a plain step of ${plain.steps[0]!.inputs.length} input(s): ${plainBefore} bytes written whole, ${plainNow} now`,
      );
      expect(plainNow).toBeLessThan(plainBefore * 0.7);
      // What is left of a plain step: its bytes, its UTxO, its outputs and the parts it was
      // built from, which the bytes do not give
      expect(plainNow).toBeLessThan(2800);

      // Four consolidation steps of about 450 inputs each
      const { builder, wallet } = await fragmented(v, coins(2250, 2n * ADA));
      const made = Date.now();
      const plan = await builder.plan(pay({ lovelace: 4400n * ADA }), {
        payer: wallet,
        consolidate: { maxSteps: 4 },
      });
      console.log(`a plan of 2250 UTxOs made in ${Date.now() - made} ms`);
      const extra = plan.steps.filter((each) => each.kind === "consolidation");
      expect(extra).toHaveLength(4);
      const inputs = extra.reduce((sum, each) => sum + each.inputs.length, 0);
      expect(inputs).toBeGreaterThan(1700);

      let started = Date.now();
      const json = recordOf(plan);
      const writeMs = Date.now() - started;
      const whole = wholeForm(plan);
      const sizeOf = (record: TxPlanJSON) =>
        record.steps
          .filter((each) => each.kind === "consolidation")
          .reduce((sum, each) => sum + bytesOf(each), 0);
      const now = sizeOf(json) / inputs;
      const before = sizeOf(whole) / inputs;
      console.log(
        `4 consolidation steps of ${extra.map((each) => each.inputs.length).join(", ")} inputs: ${sizeOf(whole)} bytes written whole (${before.toFixed(0)} an input), ${sizeOf(json)} now (${now.toFixed(0)} an input); the record ${bytesOf(whole)} bytes whole, ${bytesOf(json)} now`,
      );
      // An input costs its UTxO, its out ref in the bytes, and its spend part
      expect(now).toBeLessThan(400);
      expect(before).toBeGreaterThan(2 * 400);

      started = Date.now();
      const read = await builder.resume(JSON.parse(JSON.stringify(json)));
      const resumeMs = Date.now() - started;
      started = Date.now();
      const again = read.toJSON();
      const againMs = Date.now() - started;
      started = Date.now();
      read.steps.forEach((each) => each.prototype.body.inputs.length);
      const shownMs = Date.now() - started;
      console.log(
        `toJSON of the plan made: ${writeMs} ms; resume: ${resumeMs} ms; toJSON of the plan read: ${againMs} ms; its steps shown: ${shownMs} ms`,
      );
      expect(again).toEqual(json);
      expectSameSteps(read, plan);
    },
    LONG,
  );
});

describe.each(VALIDATORS)(
  "a plan read from a store in the middle of a run (%s)",
  (v) => {
    it(
      "shows the same steps, and run() finishes it",
      async () => {
        const store = watchStore();
        const { emulator, builder, builderFor, wallet } = await fragmented(
          v,
          coins(300, 2n * ADA),
          { maxTxSize: 4096 },
        );
        const stored = builderFor({ store });
        const plan = await stored.plan(pay({ lovelace: 500n * ADA }), {
          payer: wallet,
          id: "middle",
        });
        expect(
          plan.steps.filter((step) => step.kind === "consolidation").length,
        ).toBeGreaterThanOrEqual(2);
        await plan.sign();
        // The first step lands; the process stops
        await emulator.submitTx(plan.step("consolidate-1").signedTx!);

        const resumed = await builderFor({ store }).resume("middle", {
          payer: wallet,
        });
        expectSameSteps(resumed, plan);
        expect(resumed.toJSON()).toEqual(
          JSON.parse(JSON.stringify(await store.inner.load("middle"))),
        );
        await resumed.run();
        expect(resumed.status).toBe("final");
        // The plan read by a builder without the store goes on from the stored record alike
        const done = await builder.resume(
          JSON.parse(JSON.stringify(resumed.toJSON())),
        );
        expectSameSteps(done, resumed);
      },
      LONG,
    );
  },
);
