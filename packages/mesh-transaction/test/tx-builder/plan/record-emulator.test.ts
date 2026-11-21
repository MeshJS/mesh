import type { UTxO } from "@meshsdk/core";
import { customNetwork, mConStr0 } from "@meshsdk/core";

import type { TxPlan, TxPlanJSON } from "../../../src/tx-builder";
import { spend, toUtxo, TxBuildError, TxError } from "../../../src/tx-builder";
import { readPlan } from "../../../src/tx-builder/plan/json";
import { recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor } from "../../test-util";
import {
  advance,
  builderOf,
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

  it("records knownUtxos given in any form the builder takes, those its steps name, and reads them back", async () => {
    const { builder, wallet, funded } = await setup();
    const known = funded.map((utxo) => toUtxo(utxo));
    for (const form of [funded, known]) {
      const plan = await builder.plan(pay(), {
        payer: wallet,
        knownUtxos: form,
      });
      const record = readPlan(plan.toJSON());
      // The payment selects one of the two: the other is no entry of the record
      const spent = record.steps[0]!.built.inputs;
      expect(spent).toHaveLength(1);
      expect(record.options.knownUtxos).toEqual(spent);
      expect(known).toContainEqual(spent[0]);
    }
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
  /** A read of seconds fails this; a loaded machine's milliseconds do not */
  const AT_ONCE_MS = 2_000;

  it("plans at once beside 235 heavy entries no step names, a step of parts or a step given built; records only the entries its steps name, small, and runs from its record", async () => {
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
      expect(JSON.stringify(json).length).toBeLessThan(100_000);
      expect(readPlan(json).options.knownUtxos).toEqual(
        "a" in planned ? [toUtxo(named)] : [],
      );
      const resumed = await builder.resume(JSON.parse(JSON.stringify(json)), {
        payer: wallet,
      });
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
});
