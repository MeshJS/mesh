import type {
  StepPlanEvent,
  StepPlanRecord,
  TxStepStatus,
} from "../../../src/tx-builder/plan/step-core";
import { advanceStepPlan } from "../../../src/tx-builder/plan/step-core";
import {
  acceptAll,
  DEADLINES,
  deepFreeze,
  hash,
  keyHash,
  planOf,
  stepOf,
  stepTx,
  utxo,
  witnessOf,
} from "./step-util";

// Every event against a step in every status. The step is `b` of a plan of three: `a`, which
// `b` stands on, is final (expired for an orphaned `b`); `c` stands on nothing and stays signed,
// so that the plan is not terminal when `b` will not land.

const K = keyHash(1);
const UNTIL = 1_000_000;
const A = hash(0xa);
const B = hash(0xb);
const C = hash(0xc);

const base = () =>
  planOf([
    {
      name: "a",
      built: stepTx({ txHash: A, inputs: [utxo(hash(0xf0))], until: UNTIL }),
      standsOn: [],
    },
    {
      name: "b",
      built: stepTx({
        txHash: B,
        inputs: [utxo(A, 1)],
        keys: [K],
        until: UNTIL,
      }),
      standsOn: ["a"],
    },
    {
      name: "c",
      built: stepTx({ txHash: C, inputs: [utxo(hash(0xf1))] }),
      standsOn: [],
    },
  ]);

/**
 * The tip at slot 1000, whose time is past `UNTIL` and the margin when `past`, read when the
 * local clock showed the same time
 */
const tip = (past: boolean) => {
  const timeMs = past ? UNTIL + DEADLINES.expiryMarginMs : UNTIL - 1;
  return { slot: 1_000, timeMs, height: 100, clockMs: timeMs };
};

const aFinal = {
  txHash: A,
  found: true as const,
  slot: 10,
  blockHeight: 1,
  valid: true,
};
const see = (
  sighting:
    { found: true; blockHeight: number; valid: boolean } | { found: false },
  past = false,
): StepPlanEvent => ({
  type: "observation",
  tip: tip(past),
  sightings: [
    aFinal,
    sighting.found
      ? { txHash: B, slot: 500, block: "blk", ...sighting }
      : { txHash: B, found: false },
  ],
});

const sign: StepPlanEvent = {
  type: "signature",
  step: "b",
  witnesses: [witnessOf(K)],
};
const deliver: StepPlanEvent = { type: "delivery", step: "b" };
const refusedCounted: StepPlanEvent = {
  type: "answer",
  step: "b",
  refused: true,
  found: false,
  standingInBlock: true,
};
const accepted: StepPlanEvent = { type: "answer", step: "b", refused: false };

/** The plan with `b` in the status */
const withB = (status: TxStepStatus): StepPlanRecord => {
  const start = base();
  const aSeen: StepPlanEvent = {
    type: "observation",
    tip: tip(false),
    sightings: [aFinal],
  };
  switch (status) {
    case "built":
      return acceptAll(start, aSeen);
    case "signed":
      return acceptAll(start, aSeen, sign);
    case "sent":
      return acceptAll(start, aSeen, sign, deliver);
    case "rejected":
      return acceptAll(start, aSeen, sign, deliver, refusedCounted);
    case "included":
      return acceptAll(
        start,
        aSeen,
        sign,
        deliver,
        see({ found: true, blockHeight: 99, valid: true }),
      );
    case "final":
      return acceptAll(
        start,
        aSeen,
        sign,
        deliver,
        see({ found: true, blockHeight: 90, valid: true }),
      );
    case "expired":
      return acceptAll(
        start,
        aSeen,
        sign,
        deliver,
        see({ found: false }, true),
      );
    case "failed":
      return acceptAll(
        start,
        aSeen,
        sign,
        deliver,
        see({ found: true, blockHeight: 99, valid: false }),
      );
    case "orphaned":
      // `a` expires: its input's transaction is found, `a` is not, past its end and the margin
      return acceptAll(start, sign, deliver, {
        type: "observation",
        tip: tip(true),
        sightings: [
          { txHash: hash(0xf0), found: true, slot: 1, valid: true },
          { txHash: A, found: false },
        ],
      });
  }
};

const EVENTS: Record<string, StepPlanEvent> = {
  sign,
  deliver,
  refusedCounted,
  accepted,
  deep: see({ found: true, blockHeight: 90, valid: true }),
  shallow: see({ found: true, blockHeight: 99, valid: true }),
  invalid: see({ found: true, blockHeight: 99, valid: false }),
  pastMargin: see({ found: false }, true),
  beforeMargin: see({ found: false }, false),
};

/**
 * What each event makes of `b`: its status after an accepted event that changed the record,
 * `=` for an accepted event that changed nothing, `!reason` for a refusal. A step with a
 * recorded delivery takes a signature and changes nothing. A step called dead becomes included
 * or final when a look finds it in a block; for an orphaned `b` every look finds the expired `a`
 * final, which changes the record and leaves `b` orphaned
 */
// prettier-ignore
const TABLE: Record<TxStepStatus, Record<keyof typeof EVENTS, string>> = {
  built: { sign: "signed", deliver: "!status", refusedCounted: "!status", accepted: "!status", deep: "final", shallow: "included", invalid: "failed", pastMargin: "expired", beforeMargin: "=" },
  signed: { sign: "=", deliver: "sent", refusedCounted: "!status", accepted: "!status", deep: "final", shallow: "included", invalid: "failed", pastMargin: "expired", beforeMargin: "=" },
  sent: { sign: "=", deliver: "sent", refusedCounted: "rejected", accepted: "=", deep: "final", shallow: "included", invalid: "failed", pastMargin: "expired", beforeMargin: "=" },
  rejected: { sign: "=", deliver: "sent", refusedCounted: "!status", accepted: "!status", deep: "final", shallow: "included", invalid: "failed", pastMargin: "expired", beforeMargin: "=" },
  included: { sign: "=", deliver: "!status", refusedCounted: "included", accepted: "=", deep: "final", shallow: "=", invalid: "=", pastMargin: "expired", beforeMargin: "sent" },
  final: { sign: "=", deliver: "!status", refusedCounted: "=", accepted: "=", deep: "=", shallow: "=", invalid: "=", pastMargin: "=", beforeMargin: "=" },
  expired: { sign: "=", deliver: "!status", refusedCounted: "=", accepted: "=", deep: "final", shallow: "included", invalid: "=", pastMargin: "=", beforeMargin: "=" },
  failed: { sign: "=", deliver: "!status", refusedCounted: "=", accepted: "=", deep: "=", shallow: "=", invalid: "=", pastMargin: "=", beforeMargin: "=" },
  orphaned: { sign: "=", deliver: "!status", refusedCounted: "=", accepted: "=", deep: "final", shallow: "included", invalid: "orphaned", pastMargin: "orphaned", beforeMargin: "orphaned" },
};

const outcome = (json: StepPlanRecord, event: StepPlanEvent) => {
  const result = advanceStepPlan(json, event);
  if (!result.ok) return `!${result.reason}`;
  if (result.json === json) return "=";
  return stepOf(result.json, "b").status;
};

describe("the state machine of a plan of steps: every event in every status", () => {
  for (const [status, row] of Object.entries(TABLE) as [
    TxStepStatus,
    Record<string, string>,
  ][])
    describe(`a step that is ${status}`, () => {
      const json = deepFreeze(withB(status));

      it("is in that status before the event", () => {
        expect(stepOf(json, "b").status).toBe(status);
      });

      for (const [name, expected] of Object.entries(row))
        it(`${name} gives ${expected}`, () => {
          expect(outcome(json, EVENTS[name]!)).toBe(expected);
        });

      it("stop marks the plan and leaves the step as it is", () => {
        const result = advanceStepPlan(json, { type: "stop" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.json.stopped).toBe(true);
        expect(stepOf(result.json, "b")).toBe(stepOf(json, "b"));
      });
    });

  it("gives the plan the status its steps and its mark give", () => {
    const plan = (status: TxStepStatus) => withB(status).status;
    expect(plan("built")).toBe("pending");
    expect(plan("rejected")).toBe("pending");
    expect(plan("final")).toBe("pending");
    // `c` may still land
    expect(plan("expired")).toBe("stopping");
    expect(plan("failed")).toBe("stopping");
    expect(plan("orphaned")).toBe("stopping");
  });
});
