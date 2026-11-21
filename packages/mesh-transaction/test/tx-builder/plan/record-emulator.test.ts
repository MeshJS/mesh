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

describe("TxPlan.toJSON", () => {
  it("writes the plan in every status, with the stop mark, as plain JSON data", async () => {
    // A chain behind the local clock: a step past its end of validity is past it by both
    const { emulator, builder, wallet } = await setup({ slot: 100_000_000 });
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
    const { builder, provider, wallet } = await setup();
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
    const { builder, emulator, wallet } = await setup();
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
    const { builder, provider, wallet } = await setup();
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

describe("The record of a plan on TxEmulator", () => {
  it("holds the data options and the payer's change address, and nothing live", async () => {
    const { builder, emulator, wallet, address, funded } = await setup();
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
    const { builder, wallet, address } = await setup({ funds: [30_000_000n] });
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

  it("records every entry of knownUtxos as given, in any form the builder takes, and reads them back", async () => {
    const { builder, wallet, funded } = await setup();
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
    // An object whose members a UTxO is read from hold what is no data cannot be recorded
    const error = await caught(
      builder.plan(pay(), {
        payer: wallet,
        knownUtxos: [funded[0]!, { ...known[1]!, value: new Map() }] as never,
      }),
    );
    expect(TxBuildError.is(error, "INVALID_OPTION")).toBe(true);
    expect((error as TxBuildError).message).toBe(
      "invalid knownUtxos: entry 1 is not a UTxO: a member it is read from is a Map, which a plan's record cannot hold",
    );
  });
});

describe("The knownUtxos of a plan", () => {
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

  it("plans at once beside 235 heavy entries no step names, a step of parts or a step given built; records every entry as given, unread, and runs from its record", async () => {
    const { builder, emulator, wallet, address, funded } = await setup({
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
    const { builder, wallet, funded } = await setup();
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
    const { builder, wallet } = await setup();
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

  it("reads one copy of an entry, made when the plan is made: a step at the start, a step plan.add builds later on the object and resumed, and replan read it alike, in milliseconds", async () => {
    const { builder, wallet } = await setup();
    const own = (i: number, members: object) =>
      ({ ...toUtxo(offChain(i)), ...members }) as Utxo;
    const mesh = (i: number, members: object) =>
      ({
        ...offChain(i),
        output: { ...offChain(i).output, ...members },
      }) as UTxO;
    /** An object whose members are those of a prototype, itself of no prototype */
    const inherited = (members: object, ownMembers: object = {}) =>
      Object.assign(
        Object.create(Object.assign(Object.create(null), members)),
        ownMembers,
      ) as object;
    const native = `8201818200581c${"12".repeat(28)}`;
    const hash = "a1".repeat(32);
    class InlineDatum {
      readonly type = "inline";
      readonly data = { type: "CBOR", content: "d8799f182aff" };
    }
    // Lawful entries that build takes: of each, the plan reads what build reads
    const lawful: Record<string, UTxO | Utxo> = {
      "a script of unknown form, its hash left undefined": own(20, {
        script: {
          type: "unknown",
          scriptRef: "8203450102030405",
          hash: undefined,
        },
      }),
      "a Plutus script, its hash left undefined": own(21, {
        script: { ...plutus, type: "plutus", hash: undefined },
      }),
      "a datum, an object of a class": own(22, { datum: new InlineDatum() }),
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
    class Listed extends Array<unknown> {
      override map<U>(): U[] {
        return this as unknown as U[];
      }
    }
    const hidden = { lovelace: 3_000_034n };
    Object.defineProperty(hidden, unit, { value: 5n, enumerable: false });
    const forms: Record<string, UTxO | Utxo> = {
      ...lawful,
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
      "a native script, a wrong hash on its prototype": own(26, {
        script: inherited(
          { hash: "ff".repeat(28) },
          { type: "native", cbor: native },
        ),
      }),
      "Mesh plutusData, a list whose own map gives itself": mesh(27, {
        plutusData: ownMap,
      }),
      "Mesh plutusData, a list of a class whose map gives itself": mesh(28, {
        plutusData: Listed.from([1]),
      }),
      "a token that throws when read": own(29, { value: throwing }),
      "a datum's content, a typed array of 64 MB": own(30, {
        datum: {
          type: "inline",
          data: { type: "CBOR", content: new Uint8Array(64 * 2 ** 20) },
        },
      }),
      "a token not enumerable": own(31, { value: hidden }),
      "a token named by a symbol": own(32, {
        value: { lovelace: 3_000_032n, [Symbol(unit)]: 5n },
      }),
      "a Mesh quantity as a bigint": mesh(33, {
        amount: [{ unit: "lovelace", quantity: 3_000_033n }],
      }),
      "the lovelace of a Utxo as decimal text": own(34, {
        value: { lovelace: "3000034" },
      }),
    };
    // The answer of each, read of the copy: its own members alone, of a list its items by index
    const expected: Record<string, string> = {
      "a datum whose members are a prototype's":
        "a datum of the type undefined",
      "a datum whose members a Proxy's get gives":
        "a datum of the type undefined",
      "a native script whose members are a prototype's":
        "a script of the type undefined",
      "a native script, a wrong hash on its prototype": "built",
      "Mesh plutusData, a list whose own map gives itself":
        "its plutusData is not hex",
      "Mesh plutusData, a list of a class whose map gives itself":
        "its plutusData is not hex",
      "a token that throws when read":
        "a member it is read from throws when read",
      "a datum's content, a typed array of 64 MB":
        "a member it is read from is a Uint8Array",
      "a token not enumerable": "a member it is read from is not enumerable",
      "a token named by a symbol":
        "a member it is read from is named by a symbol",
      "a Mesh quantity as a bigint": "invalid quantity",
      "the lovelace of a Utxo as decimal text": "no lovelace as a bigint",
    };
    for (const [form, entry] of Object.entries(forms)) {
      const knownUtxos = [offChain(6), entry];
      const atStart = await answerOf(() =>
        builder.plan({ s: reading(entry) }, { payer: wallet, knownUtxos }),
      );
      expect([form, atStart.answer]).toEqual([
        form,
        expect.stringContaining(expected[form] ?? "built"),
      ]);
      const answers = [atStart];
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
              await object.add({ s: reading(entry) });
              return object;
            }),
          );
      }
      // A plan made in place of another, given the entry
      const base = await builder.plan(
        { first: pay() },
        { id: `base ${form}`, payer: wallet, knownUtxos: [offChain(6)] },
      );
      await base.stop();
      answers.push(
        await answerOf(() =>
          base.replan({
            id: `again ${form}`,
            steps: { s: reading(entry) },
            payer: wallet,
            knownUtxos,
          }),
        ),
      );
      expect(answers.map(({ answer }) => [form, answer])).toEqual(
        answers.map(() => [form, atStart.answer]),
      );
      expect([form, atStart.answer.startsWith("raw")]).toEqual([form, false]);
      for (const { ms } of [...answers, unnamed])
        expect([form, ms < AT_ONCE_MS]).toEqual([form, true]);
      if (form in lawful)
        expect([form, atStart.answer]).toEqual([
          form,
          (
            await answerOf(async () => ({
              steps: [
                await builder.build(reading(entry), {
                  payer: wallet,
                  knownUtxos,
                }),
              ],
            }))
          ).answer,
        ]);
    }
  });

  it("refuses an entry with a member nested deeply, holding itself or held at two places of it when the plan is made, in milliseconds, named or not", async () => {
    const { builder, wallet } = await setup();
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
    // A list of 8 places that all hold the level below, 12 levels: 96 references, 8^12 places
    let shared: unknown = { type: "CBOR", content: "00" };
    for (let i = 0; i < 12; i++) shared = Array(8).fill(shared);
    const asset = { unit: "lovelace", quantity: "1500008" };
    const forms: Record<string, [UTxO | Utxo, string]> = {
      "a Mesh amount holding one asset twice": [
        {
          ...offChain(17),
          output: { ...offChain(17).output, amount: [asset, asset] },
        },
        "held at two places of it",
      ],
      "a Utxo datum holding one list at 8^12 places": [
        {
          ...toUtxo(offChain(16)),
          datum: { type: "inline", data: shared } as never,
        },
        "held at two places of it",
      ],
      "Mesh plutusData, lists 100 000 deep": [
        {
          ...offChain(12),
          output: { ...offChain(12).output, plutusData: lists(100_000) },
        } as never,
        "nested more than 16 levels deep",
      ],
      "a Utxo datum, objects 100 000 deep": [
        { ...toUtxo(offChain(13)), datum: objects(100_000) as never },
        "nested more than 16 levels deep",
      ],
      "a Utxo datum holding itself": [
        { ...toUtxo(offChain(14)), datum: cyclic as never },
        "holds itself",
      ],
      "a Mesh amount holding itself": [
        {
          ...offChain(15),
          output: { ...offChain(15).output, amount: loop as never },
        },
        "holds itself",
      ],
    };
    for (const [form, [entry, why]] of Object.entries(forms)) {
      const knownUtxos = [offChain(6), entry];
      const started = performance.now();
      const unnamed = await refusal(() =>
        builder.plan({ first: pay() }, { payer: wallet, knownUtxos }),
      );
      expect(performance.now() - started).toBeLessThan(AT_ONCE_MS);
      expect([form, TxBuildError.is(unnamed, "INVALID_OPTION")]).toEqual([
        form,
        true,
      ]);
      expect(unnamed.message).toContain(
        "invalid knownUtxos: entry 1 is not a UTxO",
      );
      expect(unnamed.message).toContain(why);
      const atStart = await refusal(() =>
        builder.plan({ first: reading(entry) }, { payer: wallet, knownUtxos }),
      );
      expect(TxBuildError.is(atStart, "INVALID_OPTION")).toBe(true);
      expect(atStart.message).toContain(
        "invalid knownUtxos: entry 1 is not a UTxO",
      );
    }
  });
});
