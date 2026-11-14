import type { StepPlanRecord } from "../../../src/tx-builder/plan/step-core";
import { TxPlanError } from "../../../src/tx-builder";
import { emptyStepPlan } from "../../../src/tx-builder/plan/step-core";
import {
  encodeStepPlan,
  readStepPlan,
  StepPlanJSON,
} from "../../../src/tx-builder/plan/step-json";
import { readTransaction, withWitnesses } from "../../../src/tx-builder/sign";
import { accept, acceptAll, realSteps, signedBy } from "./step-util";

// The record of a plan of steps as data: written, read back strictly, and refused whole when it
// holds what this library does not read or what the state machine could not have written.

type Fixture = Awaited<ReturnType<typeof realSteps>>;
let fixture: Fixture;
beforeAll(async () => {
  fixture = await realSteps();
});

const firstRecord = () =>
  accept(
    emptyStepPlan({
      id: "order-7",
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 2 },
      options: { changeAddress: fixture.first.address, extraKeyWitnesses: 1 },
    }),
    { type: "steps", steps: fixture.steps },
  );

/** A record that has seen every kind of event */
const busyRecord = (): StepPlanRecord => {
  const json = firstRecord();
  const tx = (name: string) => json.steps.find((s) => s.name === name)!.txHash;
  return acceptAll(
    json,
    {
      type: "signature",
      step: "a",
      witnesses: [signedBy(fixture.first, tx("a"))],
    },
    { type: "delivery", step: "a" },
    { type: "answer", step: "a", refused: false },
    {
      type: "signature",
      step: "b",
      witnesses: [signedBy(fixture.first, tx("b"))],
    },
    { type: "delivery", step: "b" },
    { type: "answer", step: "b", refused: true, found: true },
    {
      type: "signature",
      step: "c",
      witnesses: [signedBy(fixture.second, tx("c"))],
    },
    {
      type: "observation",
      tip: { slot: 1_000, timeMs: 0, height: 50 },
      sightings: [
        {
          txHash: tx("a"),
          found: true,
          slot: 900,
          block: "b1",
          blockHeight: 49,
          valid: true,
        },
      ],
    },
    { type: "stop", replacedBy: "order-7:2" },
  );
};

/** The JSON text of the record, read back */
const throughText = (json: StepPlanJSON) =>
  readStepPlan(JSON.parse(JSON.stringify(json)));

describe("the record of a plan of steps", () => {
  it("is written with each step's transaction as the JSON of a BuiltTx", () => {
    const json = encodeStepPlan(busyRecord());
    expect(Object.keys(json)).toEqual([
      "kind",
      "version",
      "id",
      "rev",
      "status",
      "stopped",
      "replacedBy",
      "network",
      "deadlines",
      "steps",
      "options",
    ]);
    expect(json).toMatchObject({
      kind: "TxPlan",
      version: 1,
      id: "order-7",
      status: "stopping",
      stopped: true,
      replacedBy: "order-7:2",
    });
    const [a, b, c, d] = json.steps;
    expect(a).toMatchObject({
      name: "a",
      status: "included",
      seen: { slot: 900, block: "b1" },
      sends: 1,
      refused: 0,
      tx: { kind: "BuiltTx", version: 1, delivered: true },
    });
    expect(a!.standsOn).toBeUndefined();
    expect(typeof a!.tx.witnesses).toBe("string");
    expect(b).toMatchObject({ standsOn: ["a"], sends: 1, refused: 1 });
    expect(b!.given).toEqual({
      parts: [
        {
          kind: "spend",
          link: { step: "a", change: true },
          witness: { type: "key" },
        },
        expect.objectContaining({ kind: "output" }),
      ],
      options: { fee: "400000", changeAddress: fixture.first.address },
    });
    expect(c).toMatchObject({ kind: "consolidation", status: "signed" });
    expect(c!.given).toBeUndefined();
    expect(c!.tx.delivered).toBeUndefined();
    expect(d).toMatchObject({ standsOn: ["b", "c"], status: "built" });
    expect(d!.tx.witnesses).toBeUndefined();
  });

  it("is read back to the same record, through JSON text, whatever events it has seen", () => {
    for (const record of [firstRecord(), busyRecord()]) {
      const json = encodeStepPlan(record);
      const read = throughText(json);
      expect(encodeStepPlan(read)).toEqual(json);
      expect(read.steps.map((s) => s.witnesses)).toEqual(
        record.steps.map((s) => s.witnesses),
      );
      expect(read.steps[1]!.given).toEqual(record.steps[1]!.given);
    }
  });

  it("is read only with the id it has, when an id is asked for", () => {
    const json = encodeStepPlan(firstRecord());
    expect(readStepPlan(json, "order-7").id).toBe("order-7");
    expect(() => readStepPlan(json, "order-8")).toThrow(/order-8/);
  });

  describe("is refused whole, as INVALID_STATE (recordVersion)", () => {
    const busy = () =>
      JSON.parse(JSON.stringify(encodeStepPlan(busyRecord()))) as Record<
        string,
        any
      >;
    const witnessOfOther = () => {
      // A witness of step a's key over the body of step d
      const d = busy().steps[3].txHash as string;
      return signedBy(fixture.first, d);
    };
    const cases: [string, (json: Record<string, any>) => void, RegExp][] = [
      ["another kind", (j) => (j.kind = "BuiltTx"), /kind/],
      ["another version", (j) => (j.version = 2), /version/],
      ["a member it does not know", (j) => (j.extra = 1), /extra/],
      [
        "the record of attempts",
        (j) => {
          j.attempts = [];
          j.anchor = {};
        },
        /attempts/,
      ],
      ["rev 0", (j) => (j.rev = 0), /rev/],
      ["no step", (j) => (j.steps = []), /steps/],
      ["a plan status it does not know", (j) => (j.status = "open"), /status/],
      [
        "a plan status its steps do not give",
        (j) => (j.status = "pending"),
        /status/,
      ],
      [
        "replacedBy without the mark",
        (j) => delete j.stopped,
        /stopped is missing|status/,
      ],
      ["stopped that is not true", (j) => (j.stopped = false), /stopped/],
      ["an empty id", (j) => (j.id = ""), /id/],
      [
        "an option of a step on the plan",
        (j) => (j.options.sendAllTo = "x"),
        /sendAllTo/,
      ],
      ["a step member", (j) => (j.steps[0].note = "x"), /note/],
      ["a step status", (j) => (j.steps[0].status = "landed"), /step status/],
      ["a step kind", (j) => (j.steps[0].kind = "payment"), /step kind/],
      ["a name twice", (j) => (j.steps[1].name = "a"), /a step "a" before it/],
      ["an empty name", (j) => (j.steps[0].name = ""), /empty/],
      [
        "a txHash that is not its transaction's",
        (j) => (j.steps[2].txHash = j.steps[3].txHash),
        /txHash/,
      ],
      [
        "the transaction of another step",
        (j) => {
          j.steps[2].tx.built = j.steps[3].tx.built;
        },
        /txHash/,
      ],
      [
        "bytes that are not of the hash",
        (j) => (j.steps[2].tx.built.tx = j.steps[3].tx.built.tx),
        /not the transaction of the step's txHash/,
      ],
      [
        "a signed transaction among the bytes",
        (j) => {
          const built = j.steps[3].tx.built;
          built.tx = withWitnesses(readTransaction(built.tx), [
            signedBy(fixture.first, built.txHash),
          ]);
        },
        /holds a vkey or bootstrap witness/,
      ],
      [
        "a witness of another body",
        (j) => {
          j.steps[2].tx.witnesses = encodeStepPlan(
            accept(firstRecord(), {
              type: "signature",
              step: "a",
              witnesses: [witnessOfOther()],
            }),
          ).steps[0]!.tx.witnesses;
        },
        /does not verify/,
      ],
      [
        "a witness of a key the step does not need, where its key is missing",
        (j) => {
          const c = j.steps[2];
          c.tx.witnesses = encodeStepPlan(
            accept(firstRecord(), {
              type: "signature",
              step: "c",
              witnesses: [signedBy(fixture.first, c.txHash)],
            }),
          ).steps[2]!.tx.witnesses;
        },
        /status is signed, and 1 key\(s\) have not signed it/,
      ],
      [
        "witnesses that are not a witness set",
        (j) => (j.steps[0].tx.witnesses = "00"),
        /witness set/,
      ],
      [
        "a transaction member it does not know",
        (j) => (j.steps[0].tx.extra = 1),
        /extra/,
      ],
      [
        "extraKeyWitnesses of 0",
        (j) => (j.steps[0].tx.extraKeyWitnesses = 0),
        /extraKeyWitnesses/,
      ],
      [
        "standsOn that misses a step it spends from",
        (j) => delete j.steps[1].standsOn,
        /standsOn/,
      ],
      [
        "standsOn that names a step it does not spend from",
        (j) => (j.steps[2].standsOn = ["a"]),
        /standsOn/,
      ],
      ["standsOn that is empty", (j) => (j.steps[0].standsOn = []), /standsOn/],
      [
        "seen missing on an included step",
        (j) => delete j.steps[0].seen,
        /seen/,
      ],
      [
        "seen on a step that is not in a block",
        (j) => (j.steps[1].seen = { slot: 1 }),
        /seen/,
      ],
      [
        "more refusals than deliveries",
        (j) => (j.steps[1].refused = 2),
        /refused/,
      ],
      [
        "rejected while a delivery may have gone through",
        (j) => {
          j.steps[1].status = "rejected";
          j.steps[1].sends = 2;
        },
        /rejected/,
      ],
      [
        "signed with a key missing",
        (j) => (j.steps[3].status = "signed"),
        /signed/,
      ],
      ["built with every key", (j) => (j.steps[2].status = "built"), /built/],
      [
        "signed with deliveries",
        (j) => {
          j.steps[2].sends = 1;
          j.steps[2].tx.delivered = true;
        },
        /deliveries/,
      ],
      [
        "orphaned on no dead step",
        (j) => {
          j.steps[1].status = "orphaned";
          j.status = "stopping";
        },
        /orphaned/,
      ],
      [
        "a delivery mark that does not fit",
        (j) => delete j.steps[0].tx.delivered,
        /delivered/,
      ],
      [
        "given on a consolidation step",
        (j) => (j.steps[2].given = { parts: [] }),
        /consolidation/,
      ],
      [
        "a given part it does not know",
        (j) => (j.steps[1].given.parts[0].kind = "teleport"),
        /teleport|kind/,
      ],
      [
        "a given option it does not know",
        (j) => (j.steps[1].given.options.payer = "x"),
        /payer/,
      ],
      [
        "a malformed link",
        (j) => (j.steps[1].given.parts[0].link = { step: "a" }),
        /link/,
      ],
    ];

    it.each(cases)("%s", (_, change, message) => {
      const json = busy();
      expect(() => readStepPlan(json)).not.toThrow();
      change(json);
      let error: unknown;
      try {
        readStepPlan(json);
      } catch (thrown) {
        error = thrown;
      }
      expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
      expect((error as TxPlanError).details).toEqual({
        reason: "recordVersion",
      });
      expect((error as Error).message).toMatch(message);
      expect((error as TxPlanError).planId).toBe(
        json.id === "" ? undefined : "order-7",
      );
    });
  });
});
