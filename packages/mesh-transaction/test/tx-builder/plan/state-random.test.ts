import type {
  NewStep,
  PlanEvent,
  PlanRecord,
  StepRecord,
  TxSighting,
} from "../../../src/tx-builder/plan/core";
import type { TxPlanStatus } from "../../../src/tx-builder/plan/types";
import { advancePlan, missingKeys } from "../../../src/tx-builder/plan/core";
import {
  encodePlan,
  readPlan,
  sameJson,
} from "../../../src/tx-builder/plan/json";
import {
  deepFreeze,
  emptyPlan,
  hash,
  realSteps,
  seeded,
  signedBy,
  UNTIL,
} from "./state-util";

// Random sequences of events on plans of real transactions. A failing run names its seed;
// `STEP_SEED=<seed>` in the environment repeats that seed alone.

const SEEDS = Number(process.env.STEP_SEEDS ?? 300);
const EVENTS = 60;
const ONLY_SEED = process.env.STEP_SEED;
const seeds =
  ONLY_SEED !== undefined
    ? [Number(ONLY_SEED)]
    : Array.from({ length: SEEDS }, (_, i) => i + 1);

type Random = ReturnType<typeof seeded>;

const DEAD = new Set(["expired", "failed", "orphaned"]);
const isDead = (step: StepRecord) => DEAD.has(step.status);
const UNLANDED = new Set(["built", "signed", "sent", "rejected"]);

/** Whether a step stands on a step of the record that will not land */
const deadBelow = (json: PlanRecord, step: StepRecord) =>
  step.standsOn.some((name) =>
    json.steps.some((s) => s.name === name && isDead(s)),
  );

/** The status the rules give a plan, worked out apart from the state machine */
const expectedStatus = (json: PlanRecord): TxPlanStatus => {
  const { steps } = json;
  if (steps.length > 0 && steps.every((s) => s.status === "final"))
    return "final";
  if (json.stopped !== true && json.halted !== true && !steps.some(isDead))
    return "pending";
  return steps.every((s) => s.status === "final" || isDead(s))
    ? "stopped"
    : "stopping";
};

class Violation extends Error {}
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Violation(message);
};

/** Events whose second application changes nothing more */
const SETTLED = new Set(["signature", "observation", "stop", "steps"]);

type Fixture = Awaited<ReturnType<typeof realSteps>>;
let fixture: Fixture;
beforeAll(async () => {
  fixture = await realSteps();
});

/** A random event about the plan's steps and the transactions their inputs come from */
const randomEvent = (
  r: Random,
  json: PlanRecord,
  clock: { timeMs: number; height: number; slot: number; late: boolean },
): PlanEvent => {
  const steps = json.steps;
  const step = r.pick(steps);
  const all = [...fixture.steps, fixture.extra];
  const roll = r.int(20);
  switch (true) {
    case roll < 4: {
      // A signature of the step's own key, or of the other payer's key, over its body
      const key = r.chance(0.8)
        ? fixture.keys[step.name]!
        : r.pick([fixture.first, fixture.second]);
      return {
        type: "signature",
        step: step.name,
        witnesses: [signedBy(key, step.txHash)],
      };
    }
    case roll < 7:
      return { type: "delivery", step: step.name };
    case roll < 10:
      return r.chance(0.3)
        ? { type: "answer", step: step.name, refused: false }
        : {
            type: "answer",
            step: step.name,
            refused: true,
            ...(r.chance(0.8) && { found: r.chance(0.2) }),
            ...(r.chance(0.8) && { standingInBlock: r.chance(0.7) }),
          };
    case roll < 17: {
      // The clock moves on, mostly forward, around the end of validity
      clock.timeMs += r.int(4) * 300 - 200;
      clock.height += r.int(3);
      clock.slot += 1 + r.int(5);
      const entries = (json.before?.open ?? []).map((entry) => entry.txHash);
      const hashes = [
        ...steps.map((s) => s.txHash),
        ...steps.flatMap((s) => s.built.inputs.map((input) => input.txHash)),
        ...entries,
      ];
      const sightings: TxSighting[] = [];
      for (const txHash of new Set(hashes)) {
        const roll = r.int(10);
        if (roll < 5) continue;
        // In a run that starts late the search misses steps at first, so that steps die, and
        // finds them later, so that they may come back
        const missed =
          clock.late &&
          clock.slot < 120 &&
          steps.some((s) => s.txHash === txHash) &&
          r.chance(0.8);
        if (roll === 5 || missed) sightings.push({ txHash, found: false });
        // A find a search could not place in a block
        else if (entries.includes(txHash) && r.chance(0.2))
          sightings.push({ txHash, found: true } as unknown as TxSighting);
        else
          sightings.push({
            txHash,
            found: true,
            slot: clock.slot - r.int(5),
            blockHeight: clock.height - r.int(4),
            ...(roll !== 6 && { valid: r.chance(0.95) }),
          });
      }
      return {
        type: "observation",
        ...(r.chance(0.9) && {
          tip: {
            slot: clock.slot,
            timeMs: clock.timeMs,
            ...(r.chance(0.9) && { height: clock.height }),
            // The local clock: mostly with the tip, sometimes behind it, far behind, or absent
            ...(r.chance(0.9) && {
              clockMs: clock.timeMs - r.pick([0, 0, 0, 400, 200_000]),
            }),
          },
        }),
        sightings,
      };
    }
    case roll < 18:
      return r.chance(0.5)
        ? { type: "stop" }
        : { type: "stop", replacedBy: r.pick(["next", "other"]) };
    default: {
      // The step left to append, or steps the plan has
      const extra: NewStep[] = [fixture.extra];
      return {
        type: "steps",
        steps: r.chance(0.5) ? extra : [r.pick(all.slice(0, 4))],
      };
    }
  }
};

/**
 * Every status a plan or a step was in, how many events changed a record, and how often an
 * orphaned step came back
 */
const reached = new Set<string>();
let changes = 0;
let returns = 0;
let appends = 0;
/** Plans named as replaced while not stopped, entries found, and events refused after either */
let namedOpen = 0;
let entriesSeen = 0;
let refusedClosed = 0;
let finals = 0;

/** Entries of the plans before a plan made in place of another */
const ENTRIES = [
  {
    step: "a",
    txHash: hash(0xe001),
    spends: [`${hash(0xe000)}#0`],
    until: UNTIL,
  },
  { step: "b", txHash: hash(0xe002), spends: [`${hash(0xe001)}#1`] },
];

/** Whether a record takes no delivery, signature or step: replaced, or an entry found */
const closed = (json: PlanRecord) =>
  json.replacedBy !== undefined ||
  (json.before?.open.some((entry) => entry.seen !== undefined) ?? false);

const run = (seed: number) => {
  // The seed spread over the 32 bits, so that the first draws of small seeds differ
  const r = seeded(Math.imul(seed, 0x9e3779b1) >>> 0);
  const count = 1 + r.int(4);
  // Some runs of several steps start past the end of validity, so that steps die early and may
  // come back
  const late = count > 1 && r.chance(0.4);
  const empty = emptyPlan({
    expiryMarginMs: r.pick([0, 500]),
    confirmations: 2,
  });
  // Half the plans are made in place of another, and watch its open transactions
  const replacing = r.chance(0.5);
  let json = deepFreeze(
    advancePlan(
      replacing
        ? {
            ...empty,
            replaces: "plan-0",
            before: { final: ["pay"], open: ENTRIES },
          }
        : empty,
      { type: "steps", steps: fixture.steps.slice(0, count) },
    ),
  );
  if (!json.ok) throw new Error(json.message);
  let record = json.json;
  const clock = {
    timeMs: late ? UNTIL + 1_000 : UNTIL - 3_000,
    height: 10,
    slot: 100,
    late,
  };
  for (let i = 0; i < EVENTS; i++) {
    if (record.status === "final") break;
    const event = deepFreeze(randomEvent(r, record, clock));
    const result = advancePlan(record, event);
    const at = `event ${i} (${event.type})`;
    // A record that was replaced, or found an entry, takes no delivery, signature or step
    if (
      closed(record) &&
      (event.type === "delivery" ||
        event.type === "signature" ||
        event.type === "steps")
    ) {
      check(
        !result.ok || result.json === record,
        `${at}: a plan replaced or stopped by a find of an entry took it`,
      );
      if (!result.ok) refusedClosed++;
    }
    if (!result.ok) continue;
    const before = record;
    const after = result.json;
    if (after === before) continue;
    // One name, once, never on a final plan, and only with the mark
    if (before.replacedBy !== undefined)
      check(
        after.replacedBy === before.replacedBy,
        `${at}: the name of the plan made in its place changed`,
      );
    else if (after.replacedBy !== undefined) {
      check(
        event.type === "stop" && before.status !== "final",
        `${at}: a plan was named replaced by a ${event.type} event, or while final`,
      );
      if (before.status !== "stopped") namedOpen++;
    }
    check(
      after.replacedBy === undefined || after.stopped === true,
      `${at}: a plan was named replaced without the mark`,
    );
    // Of the plans before, only the seen of an entry changes: set once, by a find in a block
    check(
      after.replaces === before.replaces,
      `${at}: the plan it was made in place of changed`,
    );
    check(
      (after.before === undefined) === (before.before === undefined) &&
        sameJson(after.before?.final, before.before?.final) &&
        after.before?.open.length === before.before?.open.length,
      `${at}: the plans before changed`,
    );
    before.before?.open.forEach((entry, k) => {
      const now = after.before!.open[k]!;
      const { seen: _was, ...kept } = entry;
      const { seen, ...still } = now;
      check(sameJson(kept, still), `${at}: entry ${k} changed`);
      if (entry.seen !== undefined)
        check(now === entry, `${at}: entry ${k} changed after it was seen`);
      else if (seen !== undefined) {
        entriesSeen++;
        const sighting =
          event.type === "observation"
            ? event.sightings?.find((each) => each.txHash === entry.txHash)
            : undefined;
        check(
          sighting?.found === true &&
            typeof sighting.slot === "number" &&
            sighting.valid !== false &&
            seen.slot === sighting.slot &&
            after.stopped === true,
          `${at}: entry ${k} was seen without a find in a block, or without the mark`,
        );
      }
    });
    check(
      after.rev === before.rev + 1,
      `${at}: the revision is not one higher`,
    );
    check(
      after.status === expectedStatus(after),
      `${at}: the plan is ${after.status}, and its steps and mark give ${expectedStatus(after)}`,
    );
    check(
      before.stopped !== true || after.stopped === true,
      `${at}: the mark was removed`,
    );
    check(
      before.halted !== true || after.halted === true,
      `${at}: the record that the plan came to stopped was removed`,
    );
    // A plan that comes to stopped by its steps records it at that moment
    check(
      after.status !== "stopped" ||
        after.stopped === true ||
        after.halted === true,
      `${at}: the plan came to stopped by its steps and did not record it`,
    );
    // A step is orphaned exactly while a step below it will not land
    for (const step of after.steps) {
      if (step.status === "orphaned")
        check(
          deadBelow(after, step),
          `${at}: ${step.name} is orphaned and stands on no dead step`,
        );
      if (UNLANDED.has(step.status))
        check(
          !deadBelow(after, step),
          `${at}: ${step.name} is ${step.status} and stands on a dead step`,
        );
    }
    check(
      after.steps.length >= before.steps.length,
      `${at}: a step was removed`,
    );
    // The steps the plan was made with come first, unmarked; every step appended after is marked
    if (after.steps.length > before.steps.length) appends++;
    after.steps.forEach((step, k) => {
      const appended = k >= before.steps.length;
      if (appended)
        check(
          step.added === true,
          `${at}: the added step ${step.name} is not marked`,
        );
      if (k > 0 && after.steps[k - 1]!.added === true)
        check(
          step.added === true,
          `${at}: ${step.name} has no mark and follows an added step`,
        );
    });
    check(
      after.steps[0]!.added === undefined,
      `${at}: the first step is marked as added`,
    );
    before.steps.forEach((step, k) => {
      const now = after.steps[k]!;
      check(now.name === step.name, `${at}: step ${k} changed its name`);
      check(
        now.built === step.built,
        `${at}: step ${step.name} changed its transaction`,
      );
      if (step.status === "final")
        check(now === step, `${at}: the final step ${step.name} changed`);
      // An orphaned step whose steps below are no longer dead is what its own record and the
      // look make of it: sent once a delivery of it is recorded or it was found
      const cameBack =
        step.status === "orphaned" &&
        now !== step &&
        event.type === "observation" &&
        !deadBelow(after, now);
      if (cameBack) returns++;
      if (cameBack && UNLANDED.has(now.status))
        check(
          now.status ===
            (step.sends > 0 || step.seen !== undefined
              ? "sent"
              : missingKeys(step).length === 0
                ? "signed"
                : "built"),
          `${at}: the orphaned step ${step.name} came back as ${now.status}`,
        );
      // Any other step called dead changes only to included or final, by a look that found it
      // valid
      if (isDead(step) && now !== step && !cameBack) {
        const sighting =
          event.type === "observation"
            ? event.sightings?.find((s) => s.txHash === step.txHash)
            : undefined;
        check(
          (now.status === "included" || now.status === "final") &&
            sighting?.found === true &&
            sighting.valid !== false,
          `${at}: the dead step ${step.name} became ${now.status} without being found in a block`,
        );
      }
      // The witnesses of a delivered step never change: every send is the same bytes
      if (step.sends > 0)
        check(
          now.witnesses === step.witnesses,
          `${at}: the witnesses of the delivered step ${step.name} changed`,
        );
      // A delivery only of a step that lacks no key
      if (now.sends > step.sends)
        check(
          missingKeys(now).length === 0,
          `${at}: ${step.name} was delivered with a key missing`,
        );
      // A plan that came to stopped once sends no step for the first time
      if (now.sends > step.sends && before.halted === true)
        check(
          step.status !== "signed",
          `${at}: ${step.name} was sent for the first time after the plan came to stopped`,
        );
      if (now.status === "orphaned" && step.status !== "orphaned")
        check(
          now.standsOn.some((name) =>
            after.steps.some((s) => s.name === name && isDead(s)),
          ),
          `${at}: ${step.name} became orphaned and stands on no dead step`,
        );
    });
    if (SETTLED.has(event.type)) {
      const again = advancePlan(after, event);
      check(
        again.ok && again.json === after,
        `${at}: applying the same event twice changed the record again`,
      );
    }
    const encoded = encodePlan(after);
    const read = readPlan(JSON.parse(JSON.stringify(encoded)));
    check(
      sameJson(encodePlan(read), encoded),
      `${at}: the record does not come back from its JSON`,
    );
    record = deepFreeze(after);
    changes++;
    reached.add(after.status);
    for (const step of after.steps) reached.add(step.status);
  }
  // Nothing is made in place of a final plan
  if (record.status === "final") {
    finals++;
    const named = advancePlan(record, { type: "stop", replacedBy: "late" });
    check(!named.ok, "a final plan took the name of a plan made in its place");
  }
  return record;
};

describe("a plan under random events", () => {
  it("keeps its invariants, and its record comes back from its JSON after every event", () => {
    for (const seed of seeds) {
      try {
        run(seed);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`seed ${seed}: ${message}`);
      }
    }
    // The runs reach every status of a step and of a plan
    if (ONLY_SEED === undefined) {
      expect(changes).toBeGreaterThan(SEEDS * 5);
      expect(returns).toBeGreaterThan(0);
      expect(appends).toBeGreaterThan(0);
      expect(namedOpen).toBeGreaterThan(0);
      expect(entriesSeen).toBeGreaterThan(0);
      expect(refusedClosed).toBeGreaterThan(0);
      expect(finals).toBeGreaterThan(0);
      for (const status of [
        "built",
        "signed",
        "sent",
        "rejected",
        "included",
        "final",
        "expired",
        "failed",
        "orphaned",
        "pending",
        "stopping",
        "stopped",
      ])
        expect([...reached]).toContain(status);
    }
  });
});
