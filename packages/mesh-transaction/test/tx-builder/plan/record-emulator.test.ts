import type { IFetcher } from "@meshsdk/common";
import {
  customNetwork,
  DEFAULT_PROTOCOL_PARAMETERS,
  mConStr0,
} from "@meshsdk/core";

import type { TxPlanJSON } from "../../../src/tx-builder";
import type { PlanRecord } from "../../../src/tx-builder/plan/core";
import {
  spend,
  TxBuilder,
  TxBuildError,
  TxError,
} from "../../../src/tx-builder";
import { encodePlan, readPlan } from "../../../src/tx-builder/plan/json";
import { planOver, recordOf } from "../../../src/tx-builder/plan/plan";
import { alwaysSucceedCbor, baseAddress } from "../../test-util";
import { forwarding, pay, recipient, setup } from "./plan-emulator-util";
import { reach, STATUSES } from "./plan-states";

const plutus = { code: alwaysSucceedCbor, version: "V3" as const };

/** A provider that reads a tip and answers nothing else */
const tipOnly = {
  fetchLatestBlock: async () => ({ slot: "1", height: 1 }),
} as unknown as IFetcher;

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
  const bodies = json.attempts.map(
    (attempt) => (attempt as { built?: unknown }).built,
  );
  const withoutBodies = {
    ...json,
    attempts: json.attempts.map(({ ...attempt }) => {
      delete (attempt as { built?: unknown }).built;
      return attempt;
    }),
  };
  const names = memberNames(withoutBodies);
  for (const name of NEVER) expect(names.has(name)).toBe(false);
  // A recorded body is the transaction: its `signers` are the keys it needs, nothing else live
  const inBodies = memberNames(bodies);
  for (const name of NEVER.filter((name) => name !== "signers"))
    expect(inBodies.has(name)).toBe(false);
};

describe("TxPlan.toJSON", () => {
  it("writes the plan in every status and with the closing mark, as plain JSON data", async () => {
    const builder = new TxBuilder({ network: "preprod", provider: tipOnly });
    // The records of the state machine's tests, their transactions completed from a real one
    const real = await new TxBuilder({
      network: "preprod",
      params: DEFAULT_PROTOCOL_PARAMETERS,
    }).build(pay(), {
      payer: {
        changeAddress: baseAddress(1),
        utxos: [
          {
            input: { txHash: "e".repeat(64), outputIndex: 0 },
            output: {
              address: baseAddress(1),
              amount: [{ unit: "lovelace", quantity: "20000000" }],
            },
          },
        ],
      },
    });
    const complete = (record: PlanRecord): PlanRecord => ({
      ...record,
      attempts: record.attempts.map((attempt) =>
        attempt.built === undefined
          ? attempt
          : {
              ...attempt,
              built: {
                ...real,
                ...attempt.built,
                redeemers: attempt.built.redeemers.map(
                  ({ part: _part, ...redeemer }) => redeemer,
                ),
              },
            },
      ),
    });
    for (const status of STATUSES)
      for (const marked of status === "final" ||
      status === "abandoned" ||
      status === "draft"
        ? [false]
        : [false, true]) {
        const record = complete(reach(status, marked));
        const plan = planOver(builder, record);
        const json = plan.toJSON();
        expect(json).toStrictEqual(encodePlan(record));
        expect(json.status).toBe(status);
        expect(json.closing).toBe(
          marked || status === "abandoned" ? true : undefined,
        );
        expect(JSON.stringify(plan)).toBe(JSON.stringify(json));
        expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json);
        expect(readPlan(json)).toEqual(record);
        // A new object each time, which the caller may change
        expect(plan.toJSON()).not.toBe(json);
      }
  });

  it("has no id when the plan was given none, and makes no request", () => {
    const calls: string[] = [];
    const provider = new Proxy(tipOnly as object, {
      get(target, name) {
        calls.push(String(name));
        return (target as Record<PropertyKey, unknown>)[name];
      },
    }) as IFetcher;
    const builder = new TxBuilder({ network: "preprod", provider });
    const before = calls.length;
    const json = builder.plan(pay()).toJSON();
    expect(json).not.toHaveProperty("id");
    expect(json).toMatchObject({
      kind: "TxPlan",
      version: 1,
      rev: 0,
      status: "draft",
    });
    expect(builder.plan(pay(), { id: "pay-1" }).toJSON().id).toBe("pay-1");
    // Reading the provider's members when the plan is made is all: toJSON reads none
    const plan = builder.plan(pay());
    const made = calls.length;
    plan.toJSON();
    expect(calls.length).toBe(made);
    expect(made).toBeGreaterThan(before);
  });

  it("is NOT_SERIALIZABLE for a redeemer function, with the part and its label", () => {
    const builder = new TxBuilder({ network: "preprod", provider: tipOnly });
    const plan = builder.plan(
      spend.plutus({
        utxo: { txHash: "a".repeat(64), outputIndex: 0 },
        script: plutus,
        redeemer: { data: (tx) => mConStr0([tx.self]) },
        label: "unlock",
      }),
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

  it("writes the network by name for a public one and as its configuration for another", () => {
    const network = customNetwork({
      name: "devnet",
      systemStart: 1_700_000_000_000,
      slotLengthMs: 1000,
      epochLength: 500,
    });
    const json = new TxBuilder({ network, provider: tipOnly })
      .plan(pay())
      .toJSON();
    expect(json.network).toEqual(network);
    expect(readPlan(json).network).toEqual(network);
    expect(
      new TxBuilder({ network: "preprod", provider: tipOnly })
        .plan(pay())
        .toJSON().network,
    ).toBe("preprod");
  });
});

describe("The record of a plan on TxEmulator", () => {
  it("holds the data options and the payer's change address, and nothing live", async () => {
    const { builder, emulator, wallet, address } = await setup();
    const trace = () => {};
    // Every live object a plan and its calls take is given, so that each could leak; the
    // builder's plan defaults give `pollMs` and `resendMs`
    const selections: number[] = [];
    const plan = builder.plan(pay(), {
      id: "pay-1",
      payer: wallet,
      fee: 400_000n,
      canSelect: () => true,
      coinSelection: (_need, candidates, { round }) => {
        selections.push(round);
        return candidates;
      },
      trace,
    });
    expect(plan.toJSON().options).toEqual({ fee: "400000" });
    await plan.build();
    expect(selections.length).toBeGreaterThan(0);
    let json = plan.toJSON();
    expect(json.options).toEqual({ fee: "400000", changeAddress: address });
    expect(address.startsWith("addr_test1")).toBe(true);
    expectNothingLive(json);
    await plan.sign({
      signers: wallet,
      signal: new AbortController().signal,
    });
    json = plan.toJSON();
    expect(json.status).toBe("signed");
    expectNothingLive(json);
    const submitter = forwarding(emulator);
    await plan.send({
      signers: wallet,
      submitter,
      signal: new AbortController().signal,
      waitFor: "sent",
      timeoutMs: 60_000,
      pollMs: 10,
    });
    expect(submitter.calls).toHaveLength(1);
    json = plan.toJSON();
    expect(json.status).toBe("sent");
    expect(json.options).toEqual({ fee: "400000", changeAddress: address });
    expectNothingLive(json);
    // The record reads back as the object holds it
    expect(readPlan(json, "pay-1")).toEqual(recordOf(plan));
    expect(json.network).toBe("preprod");
  });

  it("holds sendAllTo, and no change address for a plan closed from draft", async () => {
    const { builder, wallet, address } = await setup({ funds: [30_000_000n] });
    const all = builder.plan([], {
      id: "all",
      payer: wallet,
      sendAllTo: recipient,
    });
    await all.build();
    expect(all.toJSON().options).toEqual({
      sendAllTo: recipient,
      changeAddress: address,
    });
    expect(readPlan(all.toJSON())).toEqual(recordOf(all));

    const closed = builder.plan(pay(), {
      id: "closed",
      payer: wallet,
      fee: 300_000n,
    });
    await closed.abandon();
    const json = closed.toJSON();
    expect(json).toMatchObject({
      status: "abandoned",
      closing: true,
      rev: 1,
      attempts: [],
    });
    expect(json.options).toEqual({ fee: "300000" });
    expect(readPlan(json)).toEqual(recordOf(closed));
  });

  it("names the parent plan of every parent attempt", async () => {
    const { builder, wallet } = await setup();
    const parent = builder.plan(pay(), { id: "parent", payer: wallet });
    await parent.send();
    const child = builder.plan(pay(3_000_000n), {
      id: "child",
      payer: wallet,
      after: parent,
    });
    await child.send({ waitFor: "included" });
    const json = child.toJSON();
    expect(json.attempts.length).toBeGreaterThan(0);
    for (const attempt of json.attempts) {
      expect(attempt.parents).toHaveLength(1);
      for (const each of attempt.parents!) expect(each.planId).toBe("parent");
    }
    expect(readPlan(json, "child")).toEqual(recordOf(child));
    expect(readPlan(parent.toJSON(), "parent")).toEqual(recordOf(parent));
  });
});
