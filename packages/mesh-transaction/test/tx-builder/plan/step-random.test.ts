import type {
  NewStep,
  StepPlanEvent,
  StepPlanRecord,
  StepPlanStatus,
  StepRecord,
  TxSighting,
} from "../../../src/tx-builder/plan/step-core";
import { sameJson } from "../../../src/tx-builder/plan/json";
import {
  advanceStepPlan,
  missingKeys,
} from "../../../src/tx-builder/plan/step-core";
import {
  encodeStepPlan,
  readStepPlan,
} from "../../../src/tx-builder/plan/step-json";
import {
  deepFreeze,
  emptyPlan,
  realSteps,
  seeded,
  signedBy,
  UNTIL,
} from "./step-util";

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

/** The status the rules give a plan, worked out apart from the state machine */
const expectedStatus = (json: StepPlanRecord): StepPlanStatus => {
  const { steps } = json;
  if (steps.length > 0 && steps.every((s) => s.status === "final"))
    return "final";
  if (json.stopped !== true && !steps.some(isDead)) return "pending";
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
  json: StepPlanRecord,
  clock: { timeMs: number; height: number; slot: number },
): StepPlanEvent => {
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
      const hashes = [
        ...steps.map((s) => s.txHash),
        ...steps.flatMap((s) => s.built.inputs.map((input) => input.txHash)),
      ];
      const sightings: TxSighting[] = [];
      for (const txHash of new Set(hashes)) {
        const roll = r.int(10);
        if (roll < 5) continue;
        if (roll === 5) sightings.push({ txHash, found: false });
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

/** Every status a plan or a step was in, and how many events changed a record */
const reached = new Set<string>();
let changes = 0;

const run = (seed: number) => {
  const r = seeded(seed);
  const count = 1 + r.int(4);
  let json = deepFreeze(
    advanceStepPlan(
      emptyPlan({ expiryMarginMs: r.pick([0, 500]), confirmations: 2 }),
      { type: "steps", steps: fixture.steps.slice(0, count) },
    ),
  );
  if (!json.ok) throw new Error(json.message);
  let record = json.json;
  const clock = { timeMs: UNTIL - 3_000, height: 10, slot: 100 };
  for (let i = 0; i < EVENTS; i++) {
    if (record.status === "final") break;
    const event = deepFreeze(randomEvent(r, record, clock));
    const result = advanceStepPlan(record, event);
    if (!result.ok) continue;
    const before = record;
    const after = result.json;
    const at = `event ${i} (${event.type})`;
    if (after === before) continue;
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
      after.steps.length >= before.steps.length,
      `${at}: a step was removed`,
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
      // A step called dead changes only to included or final, by a look that found it valid
      if (isDead(step) && now !== step) {
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
      if (now.status === "orphaned" && step.status !== "orphaned")
        check(
          now.standsOn.some((name) =>
            after.steps.some((s) => s.name === name && isDead(s)),
          ),
          `${at}: ${step.name} became orphaned and stands on no dead step`,
        );
    });
    if (SETTLED.has(event.type)) {
      const again = advanceStepPlan(after, event);
      check(
        again.ok && again.json === after,
        `${at}: applying the same event twice changed the record again`,
      );
    }
    const encoded = encodeStepPlan(after);
    const read = readStepPlan(JSON.parse(JSON.stringify(encoded)));
    check(
      sameJson(encodeStepPlan(read), encoded),
      `${at}: the record does not come back from its JSON`,
    );
    record = deepFreeze(after);
    changes++;
    reached.add(after.status);
    for (const step of after.steps) reached.add(step.status);
  }
  return record;
};

describe("a plan of steps under random events", () => {
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
