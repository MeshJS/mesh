import type { PlanRecord } from "../../../src/tx-builder/plan/core";
import type { TxPlanJSON } from "../../../src/tx-builder/plan/types";
import { TxPlanError } from "../../../src/tx-builder";
import { emptyPlan } from "../../../src/tx-builder/plan/core";
import { encodePlan, readPlan } from "../../../src/tx-builder/plan/json";
import { readTransaction, withWitnesses } from "../../../src/tx-builder/sign";
import {
  accept,
  acceptAll,
  hash,
  realSteps,
  signedBy,
  UNTIL,
} from "./state-util";

/** An address an entry of before.open pays */
const PAYS = "addr_test1vz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerspjrlsz";

// The record of a plan as data: written, read back strictly, and refused whole when it
// holds what this library does not read or what the state machine could not have written.

type Fixture = Awaited<ReturnType<typeof realSteps>>;
let fixture: Fixture;
beforeAll(async () => {
  fixture = await realSteps();
});

const firstRecord = () =>
  accept(
    emptyPlan({
      id: "order-7",
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 2 },
      options: { changeAddress: fixture.first.address, extraKeyWitnesses: 1 },
    }),
    { type: "steps", steps: fixture.steps },
  );

/** A record that has seen every kind of event */
const busyRecord = (): PlanRecord => {
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
    { type: "stop" },
  );
};

/** The JSON text of the record, read back */
const throughText = (json: TxPlanJSON) =>
  readPlan(JSON.parse(JSON.stringify(json)));

describe("the record of a plan", () => {
  it("is written with each step's transaction as the JSON of a BuiltTx", () => {
    const json = encodePlan(busyRecord());
    expect(Object.keys(json)).toEqual([
      "kind",
      "version",
      "id",
      "rev",
      "status",
      "stopped",
      "network",
      "deadlines",
      "steps",
      "options",
    ]);
    expect(json).toMatchObject({
      kind: "TxPlan",
      version: 2,
      id: "order-7",
      status: "stopping",
      stopped: true,
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
      const json = encodePlan(record);
      const read = throughText(json);
      expect(encodePlan(read)).toEqual(json);
      expect(read.steps.map((s) => s.witnesses)).toEqual(
        record.steps.map((s) => s.witnesses),
      );
      expect(read.steps[1]!.given).toEqual(record.steps[1]!.given);
    }
  });

  it("keeps the transactions of after a step stands on", () => {
    const json = JSON.parse(JSON.stringify(encodePlan(firstRecord())));
    const source = fixture.steps[0]!.built.inputs[0]!.txHash;
    json.steps[0].after = [source];
    const read = readPlan(json);
    expect(read.steps[0]!.after).toEqual([source]);
    expect(encodePlan(read).steps[0]!.after).toEqual([source]);
  });

  it("keeps that the plan came to stopped by its steps, through JSON text", () => {
    const one = accept(
      emptyPlan({
        id: "order-8",
        network: "preprod",
        deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 2 },
        options: {},
      }),
      { type: "steps", steps: fixture.steps.slice(0, 1) },
    );
    const stopped = accept(one, {
      type: "observation",
      tip: { slot: 1_000, timeMs: UNTIL, height: 50, clockMs: UNTIL },
      sightings: [
        { txHash: one.steps[0]!.txHash, found: false },
        { txHash: hash(0xd001), found: true, slot: 1, blockHeight: 1 },
      ],
    });
    expect(stopped).toMatchObject({ status: "stopped", halted: true });
    const json = encodePlan(stopped);
    expect(json.halted).toBe(true);
    expect(encodePlan(throughText(json))).toEqual(json);
    const without = JSON.parse(JSON.stringify(json));
    delete without.halted;
    expect(() => readPlan(without)).toThrow(/halted is missing/);
    // The name of the plan made in its place, with the mark
    const replaced = encodePlan(
      accept(stopped, { type: "stop", replacedBy: "order-8:2" }),
    );
    expect(Object.keys(replaced)).toEqual([
      "kind",
      "version",
      "id",
      "rev",
      "status",
      "stopped",
      "halted",
      "replacedBy",
      "network",
      "deadlines",
      "steps",
      "options",
    ]);
    expect(encodePlan(throughText(replaced))).toEqual(replaced);
  });

  it("writes before and reads it back", () => {
    const before = {
      final: ["a", "pay"],
      open: [
        {
          step: "b",
          txHash: hash(0xe1),
          spends: [`${hash(0xe0)}#1`, `${hash(0xe3)}#0`],
          outputs: 2,
          pays: [PAYS],
          until: UNTIL,
        },
        {
          step: "c",
          txHash: hash(0xe2),
          spends: [`${hash(0xe1)}#1`],
          outputs: 2,
          pays: [PAYS],
        },
      ],
    };
    const made = accept(
      emptyPlan({
        id: "order-7:2",
        network: "preprod",
        deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 2 },
        options: {},
        replaces: "order-7",
        before,
      }),
      { type: "steps", steps: fixture.steps },
    );
    const json = encodePlan(made);
    expect(Object.keys(json)).toEqual([
      "kind",
      "version",
      "id",
      "rev",
      "status",
      "replaces",
      "before",
      "network",
      "deadlines",
      "steps",
      "options",
    ]);
    expect(json.before).toEqual(before);
    expect(Object.keys(json.before!.open[0]!)).toEqual([
      "step",
      "txHash",
      "spends",
      "outputs",
      "until",
      "pays",
    ]);
    const read = throughText(json);
    expect(read.before).toEqual(before);
    expect(encodePlan(read)).toEqual(json);
    // An entry found in a block, with the mark
    const seen = accept(made, {
      type: "observation",
      sightings: [{ txHash: hash(0xe2), found: true, slot: 77, block: "b9" }],
    });
    const seenJson = encodePlan(seen);
    expect(seenJson.stopped).toBe(true);
    expect(seenJson.before!.open[1]).toEqual({
      ...before.open[1],
      seen: { slot: 77, block: "b9" },
    });
    expect(encodePlan(throughText(seenJson))).toEqual(seenJson);
    // A plan made in place of one without an id keeps before alone
    const loose = JSON.parse(JSON.stringify(json));
    delete loose.replaces;
    expect(throughText(loose).before).toEqual(before);

    const refused = (
      from: TxPlanJSON,
      change: (j: Record<string, any>) => void,
    ) => {
      const copy = JSON.parse(JSON.stringify(from));
      change(copy);
      const error = (() => {
        try {
          readPlan(copy);
        } catch (thrown) {
          return thrown;
        }
        throw new Error("the record was read");
      })();
      expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
      expect((error as TxPlanError<"INVALID_STATE">).details.reason).toBe(
        "recordVersion",
      );
      return (error as Error).message;
    };
    expect(refused(json, (j) => delete j.before.final)).toMatch(
      /before\.final is missing/,
    );
    expect(refused(json, (j) => delete j.before.open)).toMatch(
      /before\.open is missing/,
    );
    expect(refused(json, (j) => (j.before.extra = []))).toMatch(/extra/);
    expect(refused(json, (j) => (j.before.final = ["a", "a"]))).toMatch(
      /before\.final\[1\]/,
    );
    expect(refused(json, (j) => (j.before.final = [""]))).toMatch(/empty/);
    expect(refused(json, (j) => (j.before.open[0].step = ""))).toMatch(/empty/);
    expect(
      refused(json, (j) => (j.before.open[1].txHash = j.before.open[0].txHash)),
    ).toMatch(/before\.open\[1\]\.txHash: the transaction .* is there before/);
    expect(
      refused(json, (j) => (j.before.open[0].txHash = j.steps[2].txHash)),
    ).toMatch(/is a step of the plan/);
    expect(refused(json, (j) => (j.before.open[0].txHash = ""))).toMatch(
      /txHash/,
    );
    expect(
      refused(
        json,
        (j) => (j.before.open[0].txHash = hash(0xe1).toUpperCase()),
      ),
    ).toMatch(/lower case/);
    expect(refused(json, (j) => (j.before.open[0].spends = []))).toMatch(
      /spends is empty/,
    );
    // An entry holds how many regular outputs its transaction makes: a record written before
    // entries held one is not read
    expect(refused(json, (j) => delete j.before.open[0].outputs)).toMatch(
      /outputs is missing/,
    );
    expect(refused(json, (j) => (j.before.open[0].outputs = -1))).toMatch(
      /outputs/,
    );
    expect(refused(json, (j) => (j.before.open[0].plutus = false))).toMatch(
      /plutus/,
    );
    // The addresses an entry pays: there exactly when it makes outputs, each once, at most 16;
    // a record written before entries held them is not read
    expect(refused(json, (j) => delete j.before.open[0].pays)).toMatch(/pays/);
    expect(refused(json, (j) => (j.before.open[0].pays = []))).toMatch(/pays/);
    expect(
      refused(json, (j) => (j.before.open[0].pays = [PAYS, PAYS])),
    ).toMatch(/pays\[1\]/);
    expect(
      refused(
        json,
        (j) =>
          (j.before.open[0].pays = Array.from(
            { length: 17 },
            (_, i) => `a${i}`,
          )),
      ),
    ).toMatch(/pays/);
    expect(
      refused(json, (j) => (j.before.open[0].seenBefore = { slot: 3 })),
    ).toMatch(/until and seenBefore/);
    // Whether it runs a Plutus script, and the block a plan before found it in, read back
    const more = JSON.parse(JSON.stringify(json));
    more.before.open[1].plutus = true;
    more.before.open[1].seenBefore = { slot: 3, block: "b1" };
    expect(encodePlan(throughText(more))).toEqual(more);
    // How many addresses an entry could not keep past the 16 of pays: read back beside 16, and
    // refused beside fewer, at 0, or with more addresses than outputs
    const sixteen = Array.from({ length: 16 }, (_, i) => `${PAYS}${i}`);
    const full = (j: Record<string, any>) => {
      j.before.open[0].pays = sixteen;
      j.before.open[0].outputs = 18;
      j.before.open[0].paysMore = 2;
    };
    const cut = JSON.parse(JSON.stringify(json));
    full(cut);
    expect(throughText(cut).before!.open[0]!.paysMore).toBe(2);
    expect(encodePlan(throughText(cut))).toEqual(cut);
    expect(
      refused(json, (j) => {
        full(j);
        j.before.open[0].paysMore = 0;
      }),
    ).toMatch(/paysMore is 0/);
    expect(
      refused(json, (j) => {
        full(j);
        j.before.open[0].paysMore = 1.5;
      }),
    ).toMatch(/paysMore/);
    expect(
      refused(json, (j) => {
        full(j);
        j.before.open[0].pays = [PAYS];
      }),
    ).toMatch(/paysMore is there only beside 16 addresses/);
    expect(
      refused(json, (j) => {
        full(j);
        j.before.open[0].paysMore = 3;
      }),
    ).toMatch(/more addresses than outputs/);
    expect(
      refused(json, (j) => {
        full(j);
        j.before.open[0].outputs = 0;
        delete j.before.open[0].pays;
      }),
    ).toMatch(/paysMore is there only beside 16 addresses/);
    expect(
      refused(json, (j) => (j.before.open[0].spends = [hash(0xe0)])),
    ).toMatch(/not an out ref/);
    expect(
      refused(json, (j) => j.before.open[0].spends.push(`${hash(0xe0)}#1`)),
    ).toMatch(/is there before/);
    expect(refused(json, (j) => (j.before.open[0].until = "soon"))).toMatch(
      /until/,
    );
    expect(refused(json, (j) => (j.before.open[0].note = 1))).toMatch(/note/);
    expect(refused(json, (j) => (j.before.open[0].seen = { slot: 1 }))).toMatch(
      /stopped is missing on a plan that found a transaction/,
    );
    expect(
      refused(seenJson, (j) => {
        delete j.stopped;
        j.status = "pending";
      }),
    ).toMatch(/stopped is missing on a plan that found a transaction/);
    expect(refused(json, (j) => delete j.before)).toMatch(
      /before is missing on a plan made in place of another/,
    );
  });

  it("writes the mark of an added step and reads it back", () => {
    const added = accept(firstRecord(), {
      type: "steps",
      steps: [fixture.extra],
    });
    const json = encodePlan(added);
    const e = json.steps[4]!;
    expect(Object.keys(e).slice(0, 3)).toEqual(["name", "added", "status"]);
    expect(e.added).toBe(true);
    expect(json.steps.slice(0, 4).map((step) => "added" in step)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    const read = throughText(json);
    expect(read.steps[4]!.added).toBe(true);
    expect(encodePlan(read)).toEqual(json);
    // The kind comes before the mark
    const consolidation = encodePlan(
      accept(firstRecord(), {
        type: "steps",
        steps: [{ ...fixture.extra, kind: "consolidation", given: undefined }],
      }),
    ).steps[4]!;
    expect(Object.keys(consolidation).slice(0, 3)).toEqual([
      "name",
      "kind",
      "added",
    ]);

    const refused = (change: (j: Record<string, any>) => void) => {
      const copy = JSON.parse(JSON.stringify(json));
      change(copy);
      const error = (() => {
        try {
          readPlan(copy);
        } catch (thrown) {
          return thrown;
        }
        throw new Error("the record was read");
      })();
      expect(TxPlanError.is(error, "INVALID_STATE")).toBe(true);
      expect((error as TxPlanError<"INVALID_STATE">).details.reason).toBe(
        "recordVersion",
      );
      return (error as Error).message;
    };
    expect(refused((j) => (j.steps[4].added = "yes"))).toMatch(
      /steps\[4\]\.added is "yes", not true/,
    );
    expect(refused((j) => (j.steps[4].added = false))).toMatch(/added/);
    expect(refused((j) => (j.steps[0].added = true))).toMatch(
      /steps\[0\]\.added is on a step of the first record/,
    );
    expect(
      refused((j) => {
        j.steps[3].added = true;
        delete j.steps[4].added;
      }),
    ).toMatch(/steps\[4\]\.added is missing on a step after an added step/);
  });

  it("keeps the set tags of a prebuilt step's witnesses through JSON text, and writes a step the plan built as before", () => {
    const record = firstRecord();
    const c = record.steps.find((step) => step.name === "c")!;
    const tagsOf = (tx: string) => readTransaction(tx).taggedSets;
    const bodyTagged = tagsOf(c.built.tx);
    for (const vkey of [false, true]) {
      const tags = { vkey, bootstrap: bodyTagged };
      const json = accept(
        emptyPlan({
          id: "order-8",
          network: "preprod",
          deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 2 },
          options: {},
        }),
        {
          type: "steps",
          steps: [
            {
              name: "c",
              kind: "prebuilt",
              built: c.built,
              standsOn: [],
              witnesses: [signedBy(fixture.second, c.txHash)],
              tags,
            },
          ],
        },
      );
      expect(json.steps[0]).toMatchObject({ status: "signed", tags });
      const written = encodePlan(json);
      expect(written.steps[0]!.kind).toBe("prebuilt");
      // The vkey entry with the set tag exactly when it came with it
      const entry = written.steps[0]!.tx.witnesses!.slice(4);
      expect(entry.startsWith("d90102")).toBe(vkey);
      const read = throughText(written);
      expect(read.steps[0]!.tags).toEqual(tags);
      expect(read).toEqual(json);
      expect(encodePlan(read)).toEqual(written);
    }
    // A step the plan built: its witnesses without the set tag, and no tags kept
    const signed = accept(record, {
      type: "signature",
      step: "a",
      witnesses: [
        signedBy(
          fixture.first,
          record.steps.find((step) => step.name === "a")!.txHash,
        ),
      ],
    });
    const a = encodePlan(signed).steps[0]!;
    expect(a.tx.witnesses!.slice(4).startsWith("d90102")).toBe(false);
    expect(throughText(encodePlan(signed)).steps[0]!.tags).toBeUndefined();
  });

  it("is read only with the id it has, when an id is asked for", () => {
    const json = encodePlan(firstRecord());
    expect(readPlan(json, "order-7").id).toBe("order-7");
    expect(() => readPlan(json, "order-8")).toThrow(/order-8/);
  });

  describe("is refused whole, as INVALID_STATE (recordVersion)", () => {
    const busy = () =>
      JSON.parse(JSON.stringify(encodePlan(busyRecord()))) as Record<
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
      ["another version", (j) => (j.version = 3), /version 3/],
      [
        "version 1, the record of a plan of one payment in attempts",
        (j) => {
          j.version = 1;
          j.status = "draft";
          j.attempts = [];
          j.anchor = { anchors: [] };
          j.parts = [];
          delete j.steps;
        },
        /the version 1: a record of a plan of one payment built anew in attempts, a format this library does not read; it reads version 2/,
      ],
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
      [
        "a transaction of after the step does not spend from",
        (j) => (j.steps[0].after = ["ee".repeat(32)]),
        /after/,
      ],
      [
        "a step of the plan among the transactions of after",
        (j) => (j.steps[1].after = [j.steps[0].txHash]),
        /after/,
      ],
      ["an empty list of after", (j) => (j.steps[0].after = []), /after/],
      [
        "an expirySource of a step whose inputs come from the chain",
        (j) => (j.steps[0].expirySource = "ee".repeat(32)),
        /expirySource, and an input of it comes from no transaction of after/,
      ],
      [
        "an expirySource that is not a transaction hash",
        (j) => (j.steps[0].expirySource = "x"),
        /expirySource that is not a transaction hash/,
      ],
      ["no step", (j) => (j.steps = []), /steps/],
      ["a plan status it does not know", (j) => (j.status = "open"), /status/],
      [
        "a plan status its steps do not give",
        (j) => (j.status = "pending"),
        /status/,
      ],
      [
        "replacedBy without the mark",
        (j) => {
          j.replacedBy = "order-7:2";
          delete j.stopped;
        },
        /stopped is missing|status/,
      ],
      ["stopped that is not true", (j) => (j.stopped = false), /stopped/],
      ["halted that is not true", (j) => (j.halted = false), /halted/],
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
          j.steps[2].tx.witnesses = encodePlan(
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
          c.tx.witnesses = encodePlan(
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
        "seen on a step that was never found",
        (j) => (j.steps[2].seen = { slot: 1 }),
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
        "orphaned on no step",
        (j) => {
          j.steps[2].status = "orphaned";
          j.status = "stopping";
        },
        /orphaned/,
      ],
      [
        "orphaned on a step that is not dead",
        (j) => (j.steps[1].status = "orphaned"),
        /orphaned, and it stands on no step that will not land/,
      ],
      [
        "a delivery mark that does not fit",
        (j) => delete j.steps[0].tx.delivered,
        /delivered/,
      ],
      [
        "a step with neither kind nor given",
        (j) => delete j.steps[0].given,
        /steps\[0\] has neither kind nor given/,
      ],
      [
        "a consolidation step whose outputs are at two addresses",
        (j) => {
          j.steps[0].kind = "consolidation";
          delete j.steps[0].given;
        },
        /steps\[0\]: a consolidation step whose outputs are not all at one address/,
      ],
      [
        "a consolidation step that pays no payer of the plan",
        (j) => {
          j.options.changeAddress = fixture.second.address;
          j.steps[1].given.options.changeAddress = fixture.second.address;
        },
        /steps\[2\]: a consolidation step that pays an address that is not the change address of a payer of the plan/,
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
      expect(() => readPlan(json)).not.toThrow();
      change(json);
      let error: unknown;
      try {
        readPlan(json);
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
