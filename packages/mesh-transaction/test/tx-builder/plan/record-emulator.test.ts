import type { UTxO } from "@meshsdk/core";
import { customNetwork, mConStr0 } from "@meshsdk/core";
import { toTxUnspentOutput } from "@meshsdk/core-cst";

import type { TxPlan, TxPlanJSON, Utxo } from "../../../src/tx-builder";
import {
  referenceInput,
  spend,
  toUtxo,
  TxBuildError,
  TxError,
  validity,
} from "../../../src/tx-builder";
import { readPlan } from "../../../src/tx-builder/plan/json";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
  caught,
  forwarding,
  pay,
  recipient,
  setup,
  swallowing,
  VALIDATORS,
} from "./plan-emulator-util";

// The record of a plan as `toJSON()` gives it, on the emulator: plain JSON data in every status
// of a plan, its id, its network, and the options it holds, without anything live.

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

/** Names that must never stand anywhere in a record */
const NEVER = [
  "canSelect",
  "coinSelection",
  "trace",
  "signers",
  "submitter",
  "signal",
  "waitFor",
  "timeoutMs",
  "pollMs",
  "resendMs",
  "payer",
  "wallet",
  "snapshot",
  "utxos",
];

/** Every member name of a JSON value, at any depth */
const memberNames = (value: unknown, names = new Set<string>()) => {
  if (Array.isArray(value)) value.forEach((item) => memberNames(item, names));
  else if (typeof value === "object" && value !== null)
    for (const [key, member] of Object.entries(value)) {
      names.add(key);
      memberNames(member, names);
    }
  return names;
};

const expectNothingLive = (json: TxPlanJSON) => {
  const bodies = json.steps.map((step) => step.tx);
  const withoutBodies = {
    ...json,
    steps: json.steps.map(({ tx: _tx, ...step }) => step),
  };
  const names = memberNames(withoutBodies);
  for (const name of NEVER) expect(names.has(name)).toBe(false);
  // A recorded body is the transaction: its `signers` are the keys it needs, nothing else live
  const inBodies = memberNames(bodies);
  for (const name of NEVER.filter((name) => name !== "signers"))
    expect(inBodies.has(name)).toBe(false);
};

/**
 * Whether a record read from JSON is the record the object holds, member for member; the
 * in-memory member `version` is not compared, the JSON's own version is checked apart
 */
const expectReadBack = (json: TxPlanJSON, plan: TxPlan, id?: string) => {
  const { version: _read, ...read } = readPlan(json, id);
  const { version: _held, ...held } = recordOf(plan);
  expect(read).toEqual(held);
  expect(json.version).toBe(2);
};

/** The checks of a record as plain data that reads back to what the object holds */
const expectPlainRecord = (plan: TxPlan) => {
  const json = plan.toJSON();
  expect(json.status).toBe(plan.status);
  expect(JSON.stringify(plan)).toBe(JSON.stringify(json));
  expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json);
  expectReadBack(json, plan);
  // A new object each time, which the caller may change
  expect(plan.toJSON()).not.toBe(json);
  expect(plan.toJSON()).toStrictEqual(json);
  return json;
};

describe.each(VALIDATORS)("TxPlan.toJSON (%s)", (v) => {
  it("writes the plan in every status, with the stop mark, as plain JSON data", async () => {
    // A chain behind the local clock: a step past its end of validity is past it by both
    const { emulator, builder, wallet } = await setup(v, { slot: 100_000_000 });
    const seen: Record<string, TxPlanJSON> = {};
    const steps = () => ({ a: pay(), b: pay(3_000_000n) });

    const pending = await builder.plan(steps(), { payer: wallet });
    seen.pending = expectPlainRecord(pending);
    await pending.sign();
    expect(expectPlainRecord(pending).steps.map((s) => s.status)).toEqual([
      "signed",
      "signed",
    ]);

    // Sent, then stopped while a may land
    const stopping = await builder.plan(steps(), {
      payer: wallet,
      ttlMs: 60_000,
    });
    await stopping.run({ waitFor: "sent", submitter: swallowing() });
    await stopping.stop();
    expect(stopping.status).toBe("stopping");
    seen.stopping = expectPlainRecord(stopping);
    expect(seen.stopping.stopped).toBe(true);

    advance(emulator, 120);
    await stopping.refresh();
    expect(stopping.status).toBe("stopped");
    seen.stopped = expectPlainRecord(stopping);
    expect(seen.stopped.steps.map((s) => s.status)).toEqual([
      "expired",
      "orphaned",
    ]);

    const final = await builder.plan(steps(), { payer: wallet });
    await final.run({ submitter: forwarding(emulator) });
    expect(final.status).toBe("final");
    seen.final = expectPlainRecord(final);
    expect(Object.keys(seen)).toEqual([
      "pending",
      "stopping",
      "stopped",
      "final",
    ]);
  });

  it("has no id when the plan was given none, and makes no request", async () => {
    const { builder, provider, wallet } = await setup(v);
    const plan = await builder.plan(pay(), { payer: wallet });
    const requests = () =>
      Object.values(provider.control.calls).reduce((a, b) => a + b, 0);
    const before = requests();
    const json = plan.toJSON();
    expect(json).not.toHaveProperty("id");
    expect(json).toMatchObject({
      kind: "TxPlan",
      version: 2,
      rev: 1,
      status: "pending",
    });
    expect(requests()).toBe(before);
    const named = await builder.plan(pay(), { payer: wallet, id: "pay-1" });
    expect(named.toJSON().id).toBe("pay-1");
  });

  it("is NOT_SERIALIZABLE for a redeemer function, with the part and its label", async () => {
    const { builder, emulator, wallet } = await setup(v);
    const locked = emulator.fund(builder.scriptAddress(plutus), {
      lovelace: 10_000_000n,
    });
    const plan = await builder.plan(
      spend.plutus({
        utxo: locked,
        script: plutus,
        redeemer: { data: (tx) => mConStr0([tx.self]) },
        label: "unlock",
      }),
      { payer: wallet },
    );
    let error: unknown;
    try {
      plan.toJSON();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(TxBuildError);
    expect(TxError.is(error, "NOT_SERIALIZABLE")).toBe(true);
    expect(error).toMatchObject({ part: "spend", label: "unlock" });
    expect(() => JSON.stringify(plan)).toThrow(TxBuildError);
  });

  it("writes the network by name for a public one and as its configuration for another", async () => {
    const { builder, provider, wallet } = await setup(v);
    const json = (await builder.plan(pay(), { payer: wallet })).toJSON();
    expect(json.network).toBe("preprod");

    const network = customNetwork({
      name: "devnet",
      systemStart: 1_700_000_000_000,
      slotLengthMs: 1000,
      epochLength: 500,
    });
    // A provider that states no network of its own
    const unstated = new Proxy(provider, {
      get: (target, name) =>
        name === "network" || name === "networkId"
          ? undefined
          : Reflect.get(target, name),
    });
    const devnet = builderOf(unstated, {
      network,
      params: await provider.fetchProtocolParameters(),
    });
    const own = (await devnet.plan(pay(), { payer: wallet })).toJSON();
    expect(own.network).toEqual(network);
    expect(readPlan(own).network).toEqual(network);
  });
});

describe.each(VALIDATORS)("The record of a plan on TxEmulator (%s)", (v) => {
  it("holds the data options and the payer's change address, and nothing live", async () => {
    const { builder, emulator, wallet, address, funded } = await setup(v);
    const known = funded.map((utxo) => toUtxo(utxo));
    const trace = () => {};
    // Every live object a plan and its calls take is given, so that each could leak; the
    // builder's plan defaults give `pollMs` and `resendMs`
    const selections: number[] = [];
    const plan = await builder.plan(pay(), {
      id: "pay-1",
      payer: wallet,
      fee: 400_000n,
      extraKeyWitnesses: 1,
      knownUtxos: known,
      canSelect: () => true,
      coinSelection: (_need, candidates, { round }) => {
        selections.push(round);
        return candidates;
      },
      trace,
    });
    expect(selections.length).toBeGreaterThan(0);
    let json = plan.toJSON();
    expect(json.options).toMatchObject({
      changeAddress: address,
      extraKeyWitnesses: 1,
    });
    expect(readPlan(json).options.knownUtxos).toEqual(known);
    // The fee describes the one transaction: it is the step's own
    expect(json.steps[0]!.given!.options).toEqual({ fee: "400000" });
    expect(json.steps[0]!.tx.built).toMatchObject({ fee: "400000" });
    expect(address.startsWith("addr_test1")).toBe(true);
    expectNothingLive(json);
    await plan.sign({
      signers: wallet,
      signal: new AbortController().signal,
    });
    json = plan.toJSON();
    expect(json.steps[0]!.status).toBe("signed");
    expectNothingLive(json);
    const submitter = forwarding(emulator);
    await plan.run({
      signers: wallet,
      submitter,
      signal: new AbortController().signal,
      waitFor: "sent",
      timeoutMs: 60_000,
      pollMs: 10,
    });
    expect(submitter.calls).toHaveLength(1);
    const options = json.options;
    json = plan.toJSON();
    expect(json.steps[0]!.status).toBe("sent");
    expect(json.options).toEqual(options);
    expectNothingLive(json);
    // The record reads back as the object holds it
    expectReadBack(json, plan, "pay-1");
    expect(json.network).toBe("preprod");
  });

  it("holds sendAllTo with the step it describes", async () => {
    const { builder, wallet, address } = await setup(v, {
      funds: [30_000_000n],
    });
    const all = await builder.plan([], {
      id: "all",
      payer: wallet,
      sendAllTo: recipient,
    });
    const json = all.toJSON();
    expect(json.options).toEqual({ changeAddress: address });
    expect(json.steps[0]!.given!.options).toEqual({ sendAllTo: recipient });
    expect(json.steps[0]!.tx.built).toMatchObject({
      outputs: [expect.objectContaining({ address: recipient })],
    });
    expectReadBack(json, all);
  });

  it("records every entry of knownUtxos, in any form the builder takes, as the reader copies it, and reads them back", async () => {
    const { builder, wallet, funded } = await setup(v);
    const known = funded.map((utxo) => toUtxo(utxo));
    const texts = funded.map((utxo) =>
      toTxUnspentOutput(utxo).toCbor().toString(),
    );
    for (const form of [funded, known, texts, [texts[0]!, funded[1]!]]) {
      const plan = await builder.plan(pay(), {
        payer: wallet,
        knownUtxos: form,
      });
      // The payment selects one of the two: the other is an entry of the record all the same
      expect(plan.steps[0]!.inputs).toHaveLength(1);
      expect(readPlan(expectPlainRecord(plan)).options.knownUtxos).toEqual(
        form,
      );
    }
    // Of an object, the members a UTxO is read from: another is no data of the record
    const marked = await builder.plan(pay(), {
      payer: wallet,
      knownUtxos: [
        { ...funded[0]!, seen: new Map() },
        { ...known[1]!, label: "change", seen: new Map() },
      ] as never,
    });
    expect(readPlan(expectPlainRecord(marked)).options.knownUtxos).toEqual([
      funded[0],
      known[1],
    ]);
    // An object the first stage of the reader refuses is refused when the plan is made, as build
    // refuses it
    const error = await caught(
      builder.plan(pay(), {
        payer: wallet,
        knownUtxos: [funded[0]!, { ...known[1]!, value: new Map() }] as never,
      }),
    );
    expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxBuildError).message).toBe(
      `invalid knownUtxos: entry 1 is not a UTxO: the UTxO ${known[1]!.txHash}#${known[1]!.outputIndex}: its value is not a plain object of quantities by unit`,
    );
  });
});

describe.each(VALIDATORS)("The knownUtxos of a plan (%s)", (v) => {
  // 235 UTxOs of out refs no step names, each holding a native script of 15 643 bytes: an all of
  // 20, each nested 250 deep. Reading them whole took seconds; one of them is not a UTxO past
  // its out ref, and is never read
  const nested = (leaf: number) =>
    "820181".repeat(250) + `8200581c${leaf.toString(16).padStart(56, "0")}`;
  const unnamed = Array.from({ length: 235 }, (_, i): UTxO => ({
    input: {
      txHash: `dd${(i + 1).toString(16).padStart(62, "0")}`,
      outputIndex: 0,
    },
    output: {
      address: i === 0 ? "not an address" : recipient,
      amount: [{ unit: "lovelace", quantity: "50000000" }],
      scriptRef: `8200820194${nested(i * 16 + 1)}${nested(1).repeat(19)}`,
    },
  }));
  /**
   * A read of seconds fails this, a loaded machine's milliseconds do not: reading the entries
   * passed over takes 6 s
   */
  const AT_ONCE_MS = 3_000;

  it("plans at once beside 235 heavy entries no step names, a step of parts or a step given built; records the copy of every entry, no script read, and runs from its record", async () => {
    const { builder, emulator, wallet, address, funded } = await setup(v, {
      funds: [100_000_000n, 20_000_000n, 30_000_000n],
    });
    const [, named, other] = funded as [UTxO, UTxO, UTxO];
    const given = await builder.build([pay(3_000_000n)], {
      payer: { changeAddress: address, utxos: [other] },
    });
    const steps = {
      "a step of parts": {
        a: [
          spend.pubKey({
            utxo: {
              txHash: named.input.txHash,
              outputIndex: named.input.outputIndex,
            },
          }),
          pay(),
        ],
      },
      "a step given built": { given },
    };
    for (const [what, planned] of Object.entries(steps)) {
      const started = performance.now();
      const plan = await builder.plan(planned, {
        payer: wallet,
        knownUtxos: [named, ...unnamed],
      });
      expect([what, performance.now() - started < AT_ONCE_MS]).toEqual([
        what,
        true,
      ]);
      const json = plan.toJSON();
      // The record is of the size of what was given
      const given = JSON.stringify([named, ...unnamed]).length;
      expect(JSON.stringify(json).length).toBeGreaterThan(given);
      expect(JSON.stringify(json).length).toBeLessThan(given + 100_000);
      expect(readPlan(json).options.knownUtxos).toEqual([named, ...unnamed]);
      const resuming = performance.now();
      const resumed = await builder.resume(JSON.parse(JSON.stringify(json)), {
        payer: wallet,
      });
      expect([what, performance.now() - resuming < AT_ONCE_MS]).toEqual([
        what,
        true,
      ]);
      await resumed.run({
        signers: wallet,
        waitFor: "sent",
        timeoutMs: 60_000,
      });
      expect(resumed.toJSON().steps.map((step) => step.status)).toEqual([
        "sent",
      ]);
    }
    const paid = await emulator.fetchAddressUTxOs(recipient);
    expect(paid.map((utxo) => utxo.output.amount[0]!.quantity).sort()).toEqual([
      "3000000",
      "5000000",
    ]);
  });

  /** An output the provider does not know, at the out ref `${i}`-th of this test */
  const offChain = (i: number, lovelace = 3_000_000 + i): UTxO => ({
    input: {
      txHash: `ee${i.toString(16).padStart(62, "0")}`,
      outputIndex: i % 3,
    },
    output: {
      address: recipient,
      amount: [{ unit: "lovelace", quantity: String(lovelace) }],
    },
  });
  /** A step that reads the output an entry of knownUtxos gives, the entry not read */
  const reading = (entry: UTxO | Utxo | string) => {
    const { txHash, outputIndex } =
      typeof entry === "string"
        ? toUtxo(entry)
        : "input" in entry
          ? entry.input
          : entry;
    return [referenceInput({ utxo: { txHash, outputIndex } }), pay(2_000_000n)];
  };

  it("finds the entries given at the start in a step plan.add builds later, on the object and resumed from its record", async () => {
    const { builder, wallet, funded } = await setup(v);
    const [, named] = funded as [UTxO, UTxO];
    // Entries no step of the plan names, of outputs the provider does not know, in each form
    const forms: Record<string, UTxO | Utxo | string> = {
      "a Mesh UTxO": offChain(1),
      "a Utxo": toUtxo(offChain(2)),
      "its CBOR": toTxUnspentOutput(offChain(3)).toCbor().toString(),
    };
    const plan = await builder.plan(
      {
        first: [
          spend.pubKey({
            utxo: {
              txHash: named.input.txHash,
              outputIndex: named.input.outputIndex,
            },
          }),
          pay(),
        ],
      },
      { payer: wallet, knownUtxos: [named, ...Object.values(forms)] },
    );
    const json = JSON.stringify(plan.toJSON());
    const resumed = await builder.resume(JSON.parse(json), { payer: wallet });
    for (const [where, object] of [
      ["the object", plan],
      ["the plan resumed", resumed],
    ] as const)
      for (const [form, entry] of Object.entries(forms)) {
        await object.add({ [form]: reading(entry) });
        expect([where, form, object.steps.at(-1)!.referenceInputs]).toEqual([
          where,
          form,
          [toUtxo(entry)],
        ]);
      }
    expect(resumed.toJSON().options.knownUtxos).toEqual(
      plan.toJSON().options.knownUtxos,
    );
  });

  it("reads an entry when a step names it: one not a UTxO past its out ref, or given twice with other contents, is refused then", async () => {
    const { builder, wallet } = await setup(v);
    const twice = offChain(4);
    const unread = {
      ...offChain(5),
      output: { ...offChain(5).output, address: "not an address" },
    };
    const plan = await builder.plan(
      { first: pay() },
      {
        payer: wallet,
        knownUtxos: [twice, offChain(4, 9_000_000), unread, offChain(6)],
      },
    );
    for (const object of [
      plan,
      await builder.resume(JSON.parse(JSON.stringify(plan.toJSON())), {
        payer: wallet,
      }),
    ]) {
      const refusedOf = async (entry: UTxO) => {
        try {
          await object.add({ later: reading(entry) });
        } catch (error) {
          return error as TxBuildError<"INVALID_OPTION">;
        }
        throw new Error("the step was built");
      };
      const twiceRefused = await refusedOf(twice);
      expect(TxBuildError.is(twiceRefused, "INVALID_OPTION")).toBe(true);
      expect(twiceRefused.message).toContain(
        `two entries name the output ${toUtxo(twice).txHash}#${twice.input.outputIndex} and differ`,
      );
      const unreadRefused = await refusedOf(unread);
      expect(TxBuildError.is(unreadRefused, "INVALID_OPTION")).toBe(true);
      expect(unreadRefused.message).toContain("invalid knownUtxos: entry 2");
      expect(object.steps).toHaveLength(1);
      // The other entries are read as any
      await object.add({ later: reading(offChain(6)) });
      expect(object.steps.at(-1)!.referenceInputs).toEqual([
        toUtxo(offChain(6)),
      ]);
    }
  });

  /** The error of a call, which must fail */
  const refusal = async (call: () => Promise<unknown>) => {
    try {
      await call();
    } catch (error) {
      return error as TxBuildError<"INVALID_OPTION">;
    }
    throw new Error("the call did not fail");
  };
  /** The token of the forms below: a policy and an asset name, in hex */
  const unit = `${"ab".repeat(28)}cafe`;

  /** What a call gives: the reference inputs of the last step it built, or its error */
  const answerOf = async (
    call: () => Promise<{ steps: readonly unknown[] }>,
  ) => {
    const started = performance.now();
    let answer: string;
    try {
      const { steps } = await call();
      const step = steps.at(-1) as { referenceInputs: unknown };
      answer = `built ${JSON.stringify(step.referenceInputs, (_, v: unknown) =>
        typeof v === "bigint" ? `${v}n` : v,
      )}`;
    } catch (error) {
      answer = TxError.is(error)
        ? `${error.code}: ${error.message}`
        : `raw ${(error as Error).constructor.name}: ${(error as Error).message}`;
    }
    return { answer, ms: performance.now() - started };
  };

  /** A Mesh UTxO of the out ref `${i}`-th, its output with these members */
  const mesh = (i: number, members: object = {}) =>
    ({
      ...offChain(i),
      output: { ...offChain(i).output, ...members },
    }) as UTxO;
  /** A Utxo of the out ref `${i}`-th, with these members */
  const own = (i: number, members: object = {}) =>
    ({ ...toUtxo(offChain(i)), ...members }) as Utxo;
  /** An object whose members are those of a prototype, itself of no prototype */
  const inherited = (members: object, ownMembers: object = {}) =>
    Object.assign(
      Object.create(Object.assign(Object.create(null), members)),
      ownMembers,
    ) as object;
  /** The answers of a plan to an entry: named at the start, unnamed and then by `plan.add` on
   * the object and resumed, by `replan` given it */
  const planAnswers = async (
    builder: Awaited<ReturnType<typeof setup>>["builder"],
    wallet: Awaited<ReturnType<typeof setup>>["wallet"],
    entry: unknown,
    form: string,
  ) => {
    const knownUtxos = [offChain(6), entry] as never;
    const answers = [
      await answerOf(() =>
        builder.plan(
          { s: reading(entry as Utxo) },
          { payer: wallet, knownUtxos },
        ),
      ),
    ];
    let made: TxPlan | undefined;
    const unnamed = await answerOf(async () => {
      made = await builder.plan(
        { first: pay() },
        { payer: wallet, knownUtxos },
      );
      return made;
    });
    if (made === undefined) answers.push(unnamed);
    else {
      const json = JSON.parse(JSON.stringify(made.toJSON()));
      const resumed = await builder.resume(json, { payer: wallet });
      for (const object of [made, resumed])
        answers.push(
          await answerOf(async () => {
            await object.add({ s: reading(entry as Utxo) });
            return object;
          }),
        );
    }
    const base = await builder.plan(
      { first: pay() },
      { id: `base ${form}`, payer: wallet, knownUtxos: [offChain(6)] },
    );
    await base.stop();
    answers.push(
      await answerOf(() =>
        base.replan({
          id: `again ${form}`,
          steps: { s: reading(entry as Utxo) },
          payer: wallet,
          knownUtxos,
        }),
      ),
    );
    return { answers, unnamed };
  };

  it("reads an entry as build reads it, the first stage of the reader when the plan is made: a form build takes plans with the bytes of build, one build refuses is refused alike, at the start, by plan.add on the object and resumed and by replan, in milliseconds", async () => {
    const { builder, wallet } = await setup(v, { slot: 100_000_000 });
    const hash = "a1".repeat(32);
    const native = `8201818200581c${"12".repeat(28)}`;
    const script = { ...plutus, type: "plutus" };
    class InlineDatum {
      readonly type = "inline";
      readonly data = { type: "CBOR", content: "d8799f182aff" };
    }
    class ScriptByGetter {
      readonly txHash = toUtxo(offChain(40)).txHash;
      readonly outputIndex = toUtxo(offChain(40)).outputIndex;
      readonly address = recipient;
      readonly value = { lovelace: 3_000_040n };
      get script() {
        return script;
      }
    }
    class AllByGetters {
      constructor(private readonly utxo: Utxo) {}
      get txHash() {
        return this.utxo.txHash;
      }
      get outputIndex() {
        return this.utxo.outputIndex;
      }
      get address() {
        return this.utxo.address;
      }
      get value() {
        return this.utxo.value;
      }
      get script() {
        return this.utxo.script;
      }
    }
    class Tagged {
      readonly txHash = toUtxo(offChain(42)).txHash;
      readonly outputIndex = toUtxo(offChain(42)).outputIndex;
      readonly address = recipient;
      readonly value = { lovelace: 3_000_042n };
      get [Symbol.toStringTag]() {
        return "KnownUtxo";
      }
    }
    class Quantities {
      readonly lovelace = 3_000_043n;
    }
    const asset = { unit: "lovelace", quantity: "3000044" };
    const token = { unit, quantity: "2" };
    const lawful: Record<string, unknown> = {
      "a Mesh amount holding one asset object twice": mesh(44, {
        amount: [asset, asset],
      }),
      "a Mesh amount holding one token object twice": mesh(45, {
        amount: [{ unit: "lovelace", quantity: "3000045" }, token, token],
      }),
      "an object of a class whose script is a getter of its prototype":
        new ScriptByGetter(),
      "an object of a class whose members all are getters of its prototype":
        new AllByGetters(own(41, { script })),
      "an object of a class with Symbol.toStringTag": new Tagged(),
      "a script of unknown form, its hash left undefined": own(20, {
        script: {
          type: "unknown",
          scriptRef: "8203450102030405",
          hash: undefined,
        },
      }),
      "a Plutus script, its hash left undefined": own(21, {
        script: { ...script, hash: undefined },
      }),
      "a datum, an object of a class": own(22, { datum: new InlineDatum() }),
      "a datum whose members are a prototype's": own(23, {
        datum: inherited({ type: "hash", hash }),
      }),
      "a datum whose members a Proxy's get gives": own(24, {
        datum: new Proxy(
          {},
          { get: (_, key) => ({ type: "hash", hash })[key as "type"] },
        ),
      }),
      "a native script whose members are a prototype's": own(25, {
        script: inherited({ type: "native", cbor: native }),
      }),
    };
    const throwing = { lovelace: 3_000_031n };
    Object.defineProperty(throwing, unit, {
      enumerable: true,
      get() {
        throw new TypeError("cannot be read");
      },
    });
    const ownMap: unknown[] = [1];
    // Its map gives a list of the list itself
    Object.defineProperty(ownMap, "map", {
      value: (f: (item: unknown, i: number) => unknown) => [f(ownMap, 0)],
    });
    const hidden = { lovelace: 3_000_034n };
    Object.defineProperty(hidden, unit, { value: 5n, enumerable: false });
    // Forms build refuses, with the reason of its refusal
    const refused: Record<string, [unknown, string]> = {
      "a value, an object of a class": [
        own(43, { value: new Quantities() }),
        "its value is not a plain object of quantities by unit",
      ],
      "a token whose quantity is undefined": [
        own(46, { value: { lovelace: 3_000_046n, [unit]: undefined } }),
        `invalid quantity undefined of ${unit}`,
      ],
      "a native script, a wrong hash on its prototype": [
        own(26, {
          script: inherited(
            { hash: "ff".repeat(28) },
            { type: "native", cbor: native },
          ),
        }),
        "is not the script's",
      ],
      "a token that throws when read": [
        own(29, { value: throwing }),
        "it throws when read",
      ],
      "a token not enumerable": [
        own(31, { value: hidden }),
        "not a plain object of quantities by unit",
      ],
      "a token named by a symbol": [
        own(32, { value: { lovelace: 3_000_032n, [Symbol(unit)]: 5n } }),
        "not a plain object of quantities by unit",
      ],
      "a Mesh quantity as a bigint": [
        mesh(33, { amount: [{ unit: "lovelace", quantity: 3_000_033n }] }),
        "expected decimal digits",
      ],
      "the lovelace of a Utxo as decimal text": [
        own(34, { value: { lovelace: "3000034" } }),
        "no lovelace as a bigint",
      ],
      // A member of its own named __proto__, as Object.fromEntries and JSON.parse make one, which
      // the JSON of a record would not write
      "a value with a member of its own named __proto__": [
        own(35, {
          value: {
            lovelace: 3_000_035n,
            ...Object.fromEntries([["__proto__", 5n]]),
          },
        }),
        "invalid unit text of 9 characters",
      ],
      "Mesh plutusData, a list whose own map gives itself": [
        mesh(27, { plutusData: ownMap }),
        "its plutusData is not hex",
      ],
    };
    for (const [form, entry] of [
      ...Object.entries(lawful),
      ...Object.entries(refused).map(
        ([form, [entry]]) => [form, entry] as const,
      ),
    ]) {
      const knownUtxos = [offChain(6), entry] as never;
      const built = await answerOf(async () => ({
        steps: [
          await builder.build(reading(entry as Utxo), {
            payer: wallet,
            knownUtxos,
          }),
        ],
      }));
      expect([form, built.answer]).toEqual([
        form,
        expect.stringContaining(refused[form]?.[1] ?? "built"),
      ]);
      const { answers, unnamed } = await planAnswers(
        builder,
        wallet,
        entry,
        form,
      );
      // A step names itself at the start of a refusal from the reading of its build
      expect(
        answers.map(({ answer }) => [form, answer.replace('step "s": ', "")]),
      ).toEqual(answers.map(() => [form, built.answer]));
      for (const { ms } of [...answers, unnamed])
        expect([form, ms < AT_ONCE_MS]).toEqual([form, true]);
      if (form in lawful) {
        // At the start, the transaction of build with the step's validity, byte for byte
        const plan = await builder.plan(
          { s: reading(entry as Utxo) },
          { payer: wallet, knownUtxos },
        );
        const step = plan.steps[0]!;
        const same = await builder.build(
          [
            ...reading(entry as Utxo),
            validity({ invalidHereafter: step.validity!.invalidHereafter! }),
          ],
          { payer: wallet, knownUtxos },
        );
        expect([form, step.tx]).toEqual([form, same.tx]);
        // A script a getter gives is read, and priced
        if (form.includes("getter"))
          expect([form, step.referenceInputs[0]!.script?.type]).toEqual([
            form,
            "plutus",
          ]);
      }
    }
  });

  /** An object of `breadth` getters, each giving a new such object at each read, `depth` deep */
  const fresh = (breadth: number, depth: number): object => {
    const out = {};
    for (let k = 0; k < breadth; k++)
      Object.defineProperty(out, `g${k}`, {
        enumerable: true,
        get: () => (depth <= 1 ? 0 : fresh(breadth, depth - 1)),
      });
    return out;
  };
  /** A Proxy listing `breadth` members, each read giving a new such Proxy, `depth` deep */
  const freshProxy = (breadth: number, depth: number): object =>
    new Proxy(
      {},
      {
        ownKeys: () => Array.from({ length: breadth }, (_, k) => `p${k}`),
        getOwnPropertyDescriptor: () => ({
          value: 0,
          enumerable: true,
          configurable: true,
          writable: true,
        }),
        get: (_, key) =>
          typeof key === "string" && depth > 1
            ? freshProxy(breadth, depth - 1)
            : 0,
      },
    );

  it("answers an entry nested deeply, holding itself, of getters or a Proxy that give a new object at each read, or of a typed array behind a Proxy as build answers it, in milliseconds, never a raw error", async () => {
    const { builder, wallet } = await setup(v);
    /** Lists nested `depth` deep, made without recursion */
    const lists = (depth: number) => {
      let value: unknown = [];
      for (let i = 0; i < depth; i++) value = [value];
      return value;
    };
    const objects = (depth: number) => {
      let value: unknown = { type: "CBOR", content: "00" };
      for (let i = 0; i < depth; i++) value = { type: "inline", data: value };
      return value;
    };
    const cyclic: Record<string, unknown> = { type: "inline" };
    cyclic.data = cyclic;
    const loop: unknown[] = [];
    loop.push(loop);
    // A list behind a Proxy whose length is 2^32 - 1, every item 0
    const longList = new Proxy([], {
      get: (target, key) =>
        key === "length"
          ? 2 ** 32 - 1
          : typeof key === "string" && /^[0-9]+$/.test(key)
            ? 0
            : Reflect.get(target, key),
    });
    const MB = 2 ** 20;
    /** A typed array whose prototype says it is an Object */
    const disguised = (bytes: number) => {
      const array = new Uint8Array(bytes);
      Object.setPrototypeOf(
        array,
        Object.create(Uint8Array.prototype, {
          [Symbol.toStringTag]: { value: "Object" },
        }),
      );
      return array;
    };
    const inline = (content: unknown) => ({
      datum: { type: "inline", data: { type: "CBOR", content } },
    });
    const forms: Record<string, [unknown, string]> = {
      "Mesh plutusData, lists 100 000 deep": [
        mesh(12, { plutusData: lists(100_000) }),
        "its plutusData is not hex",
      ],
      "a Utxo datum, objects 100 000 deep": [
        own(13, { datum: objects(100_000) }),
        "an inline datum is",
      ],
      "a Utxo datum holding itself": [
        own(14, { datum: cyclic }),
        "an inline datum is",
      ],
      "a Mesh amount holding itself": [
        mesh(15, { amount: loop }),
        "invalid quantity undefined",
      ],
      "a Utxo datum of getters that give a new object at each read, 8^12": [
        own(16, { datum: fresh(8, 12) }),
        "a datum of the type undefined",
      ],
      "Mesh plutusData of such getters, 8^12": [
        mesh(17, { plutusData: fresh(8, 12) }),
        "its plutusData is not hex",
      ],
      "a Utxo datum, a Proxy that gives a new Proxy at each read, 8^12": [
        own(18, { datum: freshProxy(8, 12) }),
        "a datum of the type a value of type object",
      ],
      "Mesh plutusData, a Proxy list whose length is 2^32 - 1": [
        mesh(19, { plutusData: longList }),
        "its plutusData is not hex",
      ],
      "a datum's content, a typed array of 16 MB behind a Proxy": [
        own(35, inline(new Proxy(new Uint8Array(16 * MB), {}))),
        "the datum is not hex",
      ],
      "Mesh plutusData, a Buffer of 16 MB behind a Proxy": [
        mesh(36, { plutusData: new Proxy(Buffer.alloc(16 * MB), {}) }),
        "its plutusData is not hex",
      ],
      "a datum's content, a typed array of 16 MB whose prototype says Object": [
        own(37, inline(disguised(16 * MB))),
        "the datum is not hex",
      ],
      "a Utxo value, a typed array of 16 MB behind a Proxy": [
        own(38, { value: new Proxy(new Uint8Array(16 * MB), {}) }),
        "its value is not a plain object of quantities by unit",
      ],
    };
    for (const [form, [entry, why]] of Object.entries(forms)) {
      const built = await answerOf(async () => ({
        steps: [
          await builder.build(reading(entry as Utxo), {
            payer: wallet,
            knownUtxos: [offChain(6), entry] as never,
          }),
        ],
      }));
      expect([form, built.answer]).toEqual([
        form,
        expect.stringContaining(`invalid knownUtxos: entry 1 is not a UTxO`),
      ]);
      expect([form, built.answer]).toEqual([
        form,
        expect.stringContaining(why),
      ]);
      const { answers, unnamed } = await planAnswers(
        builder,
        wallet,
        entry,
        form,
      );
      expect(answers.map(({ answer }) => [form, answer])).toEqual(
        answers.map(() => [form, built.answer]),
      );
      for (const { ms } of [built, ...answers, unnamed])
        expect([form, ms < AT_ONCE_MS]).toEqual([form, true]);
    }
  });

  it("reads each member of an entry once, when the plan is made or replan is given it, and never after: a step at the start, plan.add on the object and resumed, replan given no knownUtxos of its own; a value of a class not at all", async () => {
    const { builder, wallet } = await setup(v);
    const reads = new Map<string, number>();
    /** An object whose members are getters that count their reads under `name` */
    const counted = (name: string, members: Record<string, unknown>) => {
      const out = {};
      for (const [key, member] of Object.entries(members))
        Object.defineProperty(out, key, {
          enumerable: true,
          get: () => {
            reads.set(`${name}.${key}`, (reads.get(`${name}.${key}`) ?? 0) + 1);
            return member;
          },
        });
      return out;
    };
    // The members as plain data, and the entries whose getters count each read of them
    const ref = toUtxo(offChain(50));
    const value = { lovelace: 3_000_050n, [unit]: 2n };
    const data = { type: "CBOR", content: "d87980" };
    const script = { ...plutus, type: "plutus" };
    const plain = { ...ref, value, datum: { type: "inline", data }, script };
    const utxo = counted("utxo", {
      ...plain,
      value: counted("value", value),
      datum: counted("datum", { type: "inline", data: counted("data", data) }),
      script: counted("script", script),
    }) as Utxo;
    const asset = { unit: "lovelace", quantity: "3000051" };
    const output = {
      address: recipient,
      amount: [asset],
      plutusData: "d87980",
      scriptRef: "8203450102030405",
    };
    const meshUtxo = counted("mesh", {
      input: counted("input", { ...offChain(51).input }),
      output: counted("output", {
        ...output,
        amount: [counted("asset", asset)],
      }),
    }) as UTxO;
    const knownUtxos = [offChain(6), utxo, meshUtxo];
    // Each member read as many times
    const readTimes = (times: number) => {
      expect(reads.size).toBe(25);
      expect(Object.fromEntries(reads)).toEqual(
        Object.fromEntries(Array.from(reads.keys(), (key) => [key, times])),
      );
    };
    const plan = await builder.plan(
      { first: pay() },
      { id: "counted", payer: wallet, knownUtxos },
    );
    readTimes(1);
    const json = JSON.parse(JSON.stringify(plan.toJSON()));
    await plan.add({ s: reading(offChain(50)) });
    await plan.add({ t: reading(offChain(51)) });
    const resumed = await builder.resume(json, { payer: wallet });
    await resumed.add({ s: reading(offChain(50)) });
    await resumed.stop();
    const again = await resumed.replan({
      id: "counted again",
      steps: { t: reading(offChain(51)) },
      payer: wallet,
    });
    readTimes(1);
    const read = toUtxo(plain as Utxo);
    expect(read.script?.type).toBe("plutus");
    expect(plan.steps.at(-2)!.referenceInputs).toEqual([read]);
    expect(resumed.steps.at(-1)!.referenceInputs).toEqual([read]);
    expect(plan.steps.at(-1)!.referenceInputs).toEqual([
      toUtxo({ input: offChain(51).input, output }),
    ]);
    expect(again.steps.at(-1)!.referenceInputs).toEqual(
      plan.steps.at(-1)!.referenceInputs,
    );
    // Named at the start: one read when the plan is made, none when its step is built
    const both = () => [...reading(offChain(50)), ...reading(offChain(51))];
    await builder.plan({ s: both() }, { payer: wallet, knownUtxos });
    readTimes(2);
    // Given to replan: one read when the new plan is made, none by its steps
    const base = await builder.plan(
      { first: pay() },
      { id: "counted base", payer: wallet },
    );
    await base.stop();
    const replanned = await base.replan({
      id: "counted given",
      steps: { s: both() },
      payer: wallet,
      knownUtxos,
    });
    await replanned.add({ t: both() });
    readTimes(3);
    // A value of a class is refused before any of its members is read
    let valueReads = 0;
    class Quantities {
      constructor() {
        Object.defineProperty(this, "lovelace", {
          enumerable: true,
          get: () => {
            valueReads += 1;
            return 3_000_052n;
          },
        });
      }
    }
    const refused = [offChain(6), own(52, { value: new Quantities() })];
    for (const call of [
      () =>
        builder.build(reading(offChain(52)), {
          payer: wallet,
          knownUtxos: refused,
        }),
      () =>
        builder.plan({ first: pay() }, { payer: wallet, knownUtxos: refused }),
    ])
      expect((await caught(call())).message).toContain(
        "its value is not a plain object of quantities by unit",
      );
    expect(valueReads).toBe(0);
  });

  it("reads the list of knownUtxos once, each read inside the conversion of errors: an entry or a list that throws when read is INVALID_OPTION, its error the cause, in build and a plan alike", async () => {
    const { builder, wallet } = await setup(v);
    const error = new TypeError("cannot be read");
    const throwingEntry = new Proxy([offChain(6), offChain(7)], {
      get: (target, key) => {
        if (key === "1") throw error;
        return Reflect.get(target, key);
      },
    });
    const throwingLength = new Proxy([offChain(6)], {
      get: (target, key) => {
        if (key === "length") throw error;
        return Reflect.get(target, key);
      },
    });
    const { proxy: revoked, revoke } = Proxy.revocable([offChain(6)], {});
    revoke();
    // A descriptor that throws, which a read by index does not ask for
    const descriptorThrows = new Proxy([offChain(6), offChain(7)], {
      getOwnPropertyDescriptor: () => {
        throw new RangeError("no descriptor");
      },
    });
    const lists: Record<string, [unknown, string]> = {
      "an entry that throws when read": [
        throwingEntry,
        "INVALID_OPTION: invalid knownUtxos: entry 1 throws when read",
      ],
      "a length that throws when read": [
        throwingLength,
        "INVALID_OPTION: invalid knownUtxos: the list throws when read",
      ],
      "a Proxy revoked": [
        revoked,
        "INVALID_OPTION: invalid knownUtxos: the list throws when read",
      ],
      "a Proxy whose descriptor throws": [descriptorThrows, "built"],
    };
    for (const [form, [knownUtxos, answer]] of Object.entries(lists)) {
      const calls = {
        build: () =>
          builder.build(reading(offChain(7)), {
            payer: wallet,
            knownUtxos: knownUtxos as never,
          }),
        "a plan, named at the start": () =>
          builder.plan(
            { s: reading(offChain(7)) },
            { payer: wallet, knownUtxos: knownUtxos as never },
          ),
        "a plan, unnamed": () =>
          builder.plan(
            { first: pay() },
            { payer: wallet, knownUtxos: knownUtxos as never },
          ),
      };
      for (const [call, run] of Object.entries(calls)) {
        let caughtError: unknown;
        try {
          await run();
        } catch (thrown) {
          caughtError = thrown;
        }
        if (answer === "built") {
          expect([form, call, caughtError]).toEqual([form, call, undefined]);
          continue;
        }
        expect([
          form,
          call,
          TxBuildError.is(caughtError, "INVALID_OPTION"),
        ]).toEqual([form, call, true]);
        expect([
          form,
          call,
          `INVALID_OPTION: ${(caughtError as Error).message}`,
        ]).toEqual([form, call, answer]);
        if (knownUtxos !== revoked)
          expect((caughtError as Error).cause).toBe(error);
      }
    }
  });
});
