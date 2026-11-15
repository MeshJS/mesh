import type {
  NewStep,
  PlanEvent,
  PlanRecord,
  PlanTip,
} from "../../../src/tx-builder/plan/core";
import {
  advancePlan,
  landedSteps,
  liveSteps,
  MAX_STEPS,
  missingKeys,
  planUntil,
  TIP_AHEAD_TOLERANCE_MS,
} from "../../../src/tx-builder/plan/core";
import {
  accept,
  acceptAll,
  DEADLINES,
  deepFreeze,
  emptyPlan,
  hash,
  keyHash,
  planOf,
  refusal,
  stepOf,
  stepTx,
  utxo,
  witnessOf,
} from "./state-util";

const K1 = keyHash(1);
const K2 = keyHash(2);
const UNTIL = 1_000_000;
const SOURCE = hash(0xf0);

/** A step of the chain `a` ← `b` ← `c`, each spending an output of the one before */
const chainStep = (
  name: string,
  index: number,
  spec: { keys?: string[]; until?: number | null; plutus?: boolean } = {},
): NewStep => {
  const before = index === 0 ? undefined : hash(0xa0 + index - 1);
  return {
    name,
    built: stepTx({
      txHash: hash(0xa0 + index),
      inputs: [before === undefined ? utxo(SOURCE) : utxo(before, 1)],
      keys: spec.keys,
      ...(spec.until !== null && { until: spec.until ?? UNTIL }),
      plutus: spec.plutus,
    }),
    standsOn: before === undefined ? [] : [String.fromCharCode(96 + index)],
  };
};

const chain = (count = 3, deadlines: Partial<PlanRecord["deadlines"]> = {}) =>
  planOf(
    Array.from({ length: count }, (_, i) =>
      chainStep(String.fromCharCode(97 + i), i),
    ),
    deadlines,
  );

const txOf = (json: PlanRecord, name: string) => stepOf(json, name).txHash;

/** The tip at slot 1000 with this time, read when the local clock showed `clockMs` */
const tipAt = (timeMs: number, height?: number, clockMs = timeMs) => ({
  slot: 1_000,
  timeMs,
  ...(height !== undefined && { height }),
  clockMs,
});
const PAST = UNTIL + DEADLINES.expiryMarginMs;

const deliver = (step: string): PlanEvent => ({ type: "delivery", step });
const refused = (
  step: string,
  facts: { found?: boolean; standingInBlock?: boolean } = {
    found: false,
    standingInBlock: true,
  },
): PlanEvent => ({ type: "answer", step, refused: true, ...facts });
const found = (txHash: string, more: object = {}) => ({
  txHash,
  found: true as const,
  slot: 500,
  ...more,
});
const missing = (txHash: string) => ({ txHash, found: false as const });
const look = (sightings: object[], tip?: PlanTip): PlanEvent =>
  ({
    type: "observation",
    ...(tip !== undefined && { tip }),
    sightings,
  }) as PlanEvent;

describe("a refusal of the ledger", () => {
  const sent = () => accept(chain(1), deliver("a"));

  it("makes the step rejected when every delivery was refused, a search after it does not find the step, and what it stands on is in a block", () => {
    const json = accept(sent(), refused("a"));
    expect(stepOf(json, "a")).toMatchObject({
      status: "rejected",
      sends: 1,
      refused: 1,
    });
  });

  it("is counted and changes no status while an earlier delivery may have gone through", () => {
    // The first delivery's answer was lost
    const json = acceptAll(sent(), deliver("a"), refused("a"));
    expect(stepOf(json, "a")).toMatchObject({
      status: "sent",
      sends: 2,
      refused: 1,
    });
  });

  it("changes no status when the search after it found the step, or did not answer", () => {
    for (const facts of [
      { found: true, standingInBlock: true },
      { standingInBlock: true },
    ])
      expect(stepOf(accept(sent(), refused("a", facts)), "a").status).toBe(
        "sent",
      );
  });

  it("changes no status while what the step stands on is not known to be in a block", () => {
    for (const facts of [
      { found: false, standingInBlock: false },
      { found: false },
    ])
      expect(stepOf(accept(sent(), refused("a", facts)), "a").status).toBe(
        "sent",
      );
  });

  it("leaves a rejected step that may land: the plan stays pending and the same bytes go again", () => {
    const json = accept(sent(), refused("a"));
    expect(json.status).toBe("pending");
    expect(liveSteps(json).map((step) => step.name)).toEqual(["a"]);
    expect(stepOf(accept(json, deliver("a")), "a")).toMatchObject({
      status: "sent",
      sends: 2,
      refused: 1,
    });
  });

  it("is refused when no recorded delivery is left to answer", () => {
    expect(refusal(chain(1), refused("a"))).toBe("status");
    expect(refusal(accept(sent(), refused("a")), refused("a"))).toBe("status");
    expect(
      refusal(chain(1), { type: "answer", step: "a", refused: false }),
    ).toBe("status");
  });

  it("an accepted answer changes nothing", () => {
    const json = sent();
    const result = advancePlan(json, {
      type: "answer",
      step: "a",
      refused: false,
    });
    expect(result).toEqual({ ok: true, json });
    expect(result.ok && result.json).toBe(json);
  });
});

describe("a look at the chain", () => {
  it("makes a step final only by the heights of its block and the tip", () => {
    const json = accept(chain(1), deliver("a"));
    const a = txOf(json, "a");
    const at = (blockHeight: number | undefined, height: number | undefined) =>
      stepOf(
        accept(
          json,
          look(
            [found(a, blockHeight === undefined ? {} : { blockHeight })],
            tipAt(0, height),
          ),
        ),
        "a",
      ).status;
    expect(at(97, 100)).toBe("final");
    expect(at(98, 100)).toBe("included");
    expect(at(undefined, 100)).toBe("included");
    expect(at(97, undefined)).toBe("included");
    // A depth above the slots between the block and the tip is a lie of the heights
    expect(
      stepOf(
        accept(
          json,
          look([found(a, { blockHeight: 0, slot: 999 })], tipAt(0, 100)),
        ),
        "a",
      ).status,
    ).toBe("included");
    expect(
      stepOf(
        accept(
          accept(chain(1, { confirmations: 0 }), deliver("a")),
          look([found(a)], tipAt(0)),
        ),
        "a",
      ).status,
    ).toBe("included");
  });

  it("takes a find without validity as a fact only for a step that runs no script", () => {
    const plain = accept(chain(1), deliver("a"));
    expect(
      stepOf(accept(plain, look([found(txOf(plain, "a"))])), "a").status,
    ).toBe("included");
    const plutus = accept(
      planOf([{ ...chainStep("a", 0, { plutus: true }) }]),
      deliver("a"),
    );
    expect(accept(plutus, look([found(txOf(plutus, "a"))]))).toBe(plutus);
    expect(
      stepOf(
        accept(plutus, look([found(txOf(plutus, "a"), { valid: false })])),
        "a",
      ).status,
    ).toBe("failed");
  });

  it("takes an included step that is not found back to sent, and never a final one", () => {
    const json = accept(chain(1), deliver("a"));
    const a = txOf(json, "a");
    const included = accept(
      json,
      look([found(a, { block: "blk" })], tipAt(0, 100)),
    );
    expect(stepOf(included, "a").seen).toEqual({ slot: 500, block: "blk" });
    const back = accept(included, look([missing(a)]));
    expect(stepOf(back, "a").status).toBe("sent");
    // The block it was found in is kept: it was found in a block once
    expect(stepOf(back, "a").seen).toEqual({ slot: 500, block: "blk" });
    const final = accept(
      json,
      look([found(a, { blockHeight: 1 })], tipAt(0, 100)),
    );
    expect(final.status).toBe("final");
    expect(accept(final, look([missing(a)]))).toBe(final);
  });

  describe("expiry", () => {
    const json = () => accept(chain(1), deliver("a"));
    const expired = (event: PlanEvent) =>
      stepOf(accept(json(), event), "a").status === "expired";
    const a = () => txOf(json(), "a");

    it("needs the tip past the end of validity and the margin, the step not found, and the transaction of an input found by the same look", () => {
      expect(expired(look([missing(a()), found(SOURCE)], tipAt(PAST)))).toBe(
        true,
      );
      expect(
        expired(look([missing(a()), found(SOURCE)], tipAt(PAST - 1))),
      ).toBe(false);
      expect(expired(look([missing(a())], tipAt(PAST)))).toBe(false);
      expect(expired(look([missing(a()), missing(SOURCE)], tipAt(PAST)))).toBe(
        false,
      );
      expect(expired(look([found(SOURCE)], tipAt(PAST)))).toBe(false);
      expect(expired(look([missing(a()), found(SOURCE)]))).toBe(false);
    });

    it("never comes to a step without an end of validity", () => {
      const open = accept(
        planOf([chainStep("a", 0, { until: null })]),
        deliver("a"),
      );
      expect(planUntil(open)).toBeUndefined();
      const after = accept(
        open,
        look([missing(txOf(open, "a")), found(SOURCE)], tipAt(1e15)),
      );
      expect(after).toBe(open);
    });

    it("needs the local clock past the end of validity and the margin too, and a tip not ahead of it by more than the tolerance", () => {
      const sightings = [missing(a()), found(SOURCE)];
      const at = (timeMs: number, clockMs?: number) =>
        expired(
          look(sightings, {
            slot: 1_000,
            timeMs,
            ...(clockMs !== undefined && { clockMs }),
          }),
        );
      expect(at(PAST, PAST)).toBe(true);
      // The clock behind the end and the margin
      expect(at(PAST, PAST - 1)).toBe(false);
      // No clock
      expect(at(PAST)).toBe(false);
      // A tip ahead of the clock: within the tolerance, and beyond it
      expect(at(PAST + TIP_AHEAD_TOLERANCE_MS, PAST)).toBe(true);
      expect(at(PAST + TIP_AHEAD_TOLERANCE_MS + 1, PAST)).toBe(false);
      // The clock far ahead of the tip changes nothing
      expect(at(PAST, PAST + 1e9)).toBe(true);
      expect(at(PAST - 1, PAST + 1e9)).toBe(false);
    });

    it("comes to a step that was never signed", () => {
      const built = planOf([chainStep("a", 0, { keys: [K1] })]);
      expect(
        stepOf(
          accept(
            built,
            look([missing(txOf(built, "a")), found(SOURCE)], tipAt(PAST)),
          ),
          "a",
        ).status,
      ).toBe("expired");
    });
  });

  describe("orphaned", () => {
    it("comes in the same look to every step that stands on a dead step, down the chain", () => {
      const json = acceptAll(chain(3), deliver("a"));
      const after = accept(
        json,
        look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
      );
      expect(after.steps.map((step) => step.status)).toEqual([
        "expired",
        "orphaned",
        "orphaned",
      ]);
      expect(after.status).toBe("stopped");
    });

    it("never comes to a step that stands on no dead step", () => {
      const json = planOf([
        chainStep("a", 0),
        {
          name: "x",
          built: stepTx({ txHash: hash(0xbb), inputs: [utxo(hash(0xf9))] }),
          standsOn: [],
        },
      ]);
      const after = accept(
        json,
        look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
      );
      expect(stepOf(after, "x").status).toBe("signed");
      expect(after.status).toBe("stopping");
    });

    it("comes from a failed step, also to a step that only reads its output or puts it up as collateral", () => {
      const a = hash(0xa0);
      const json = planOf([
        chainStep("a", 0),
        {
          name: "reads",
          built: stepTx({
            txHash: hash(0xc1),
            inputs: [utxo(hash(0xf8))],
            referenceInputs: [utxo(a, 0)],
          }),
          standsOn: ["a"],
        },
        {
          name: "collateral",
          built: stepTx({
            txHash: hash(0xc2),
            inputs: [utxo(hash(0xf7))],
            collateral: [utxo(a, 1)],
          }),
          standsOn: ["a"],
        },
      ]);
      const after = accept(
        accept(json, deliver("a")),
        look([found(a, { valid: false })]),
      );
      expect(after.steps.map((step) => step.status)).toEqual([
        "failed",
        "orphaned",
        "orphaned",
      ]);
    });

    it("leaves a step that is in a block as it is", () => {
      const json = acceptAll(chain(2), deliver("a"));
      const b = txOf(json, "b");
      // The chain cannot show this; the record keeps what it was shown of the step itself
      const after = accept(
        json,
        look([missing(txOf(json, "a")), found(SOURCE), found(b)], tipAt(PAST)),
      );
      expect(stepOf(after, "b").status).toBe("included");
    });
  });
});

describe("a step called dead", () => {
  const expiredPlan = () => {
    const json = acceptAll(chain(2), deliver("a"));
    return accept(
      json,
      look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
    );
  };

  it("is included, then final, when a look finds it in a block: what the chain shows wins", () => {
    const json = expiredPlan();
    expect(json.steps.map((step) => step.status)).toEqual([
      "expired",
      "orphaned",
    ]);
    expect(json.status).toBe("stopped");
    const a = txOf(json, "a");
    const included = accept(
      json,
      look([found(a, { blockHeight: 99 })], tipAt(PAST, 100)),
    );
    expect(stepOf(included, "a")).toMatchObject({
      status: "included",
      seen: { slot: 500 },
    });
    // b stands on no dead step any more: it is what its own record says, signed and never sent.
    // The plan came to stopped once: it does not go on
    expect(stepOf(included, "b").status).toBe("signed");
    expect(included).toMatchObject({ status: "stopping", halted: true });
    const final = accept(
      included,
      look([found(a, { blockHeight: 90 })], tipAt(PAST, 100)),
    );
    expect(stepOf(final, "a").status).toBe("final");
    expect(final.status).toBe("stopping");
    const b = accept(
      final,
      look([found(txOf(json, "b"), { blockHeight: 90 })], tipAt(PAST, 100)),
    );
    expect(b.status).toBe("final");
  });

  it("changes by nothing else: a look that does not find it, finds it invalid, or finds it without its validity", () => {
    const json = expiredPlan();
    const a = txOf(json, "a");
    for (const event of [
      look([missing(a), found(SOURCE)], tipAt(PAST)),
      look([found(a, { valid: false })], tipAt(PAST)),
      deliver("a"),
      refused("a"),
      { type: "answer", step: "a", refused: false } as PlanEvent,
    ]) {
      const result = advancePlan(json, event);
      if (result.ok) expect(stepOf(result.json, "a").status).toBe("expired");
    }
    const plutus = acceptAll(
      planOf([chainStep("a", 0, { plutus: true })]),
      deliver("a"),
    );
    const dead = accept(
      plutus,
      look([missing(txOf(plutus, "a")), found(SOURCE)], tipAt(PAST)),
    );
    expect(accept(dead, look([found(txOf(plutus, "a"))]))).toBe(dead);
  });

  it("leaves a failed step as it is, whatever a later look says", () => {
    const json = acceptAll(
      planOf([chainStep("a", 0, { plutus: true })]),
      deliver("a"),
    );
    const a = txOf(json, "a");
    const failed = accept(json, look([found(a, { valid: false })]));
    expect(stepOf(failed, "a").status).toBe("failed");
    expect(accept(failed, look([found(a, { valid: true })]))).toBe(failed);
    expect(accept(failed, look([missing(a)], tipAt(PAST)))).toBe(failed);
  });
});

describe("an orphaned step", () => {
  /** The chain a, b, c with a and b sent; a is called expired, so b and c are orphaned */
  const orphans = () => {
    const json = acceptAll(chain(3), deliver("a"), deliver("b"));
    return accept(
      json,
      look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
    );
  };
  const aFound = (json: PlanRecord) =>
    found(txOf(json, "a"), { blockHeight: 99 });

  it("is orphaned only while a step it stands on will not land; then it is what its own record says", () => {
    const json = orphans();
    expect(json.steps.map((step) => step.status)).toEqual([
      "expired",
      "orphaned",
      "orphaned",
    ]);
    expect(json).toMatchObject({ status: "stopped", halted: true });
    expect(json.stopped).toBeUndefined();
    // a is found in a block after all: b was sent, c never was
    const back = accept(json, look([aFound(json)], tipAt(PAST, 100)));
    expect(back.steps.map((step) => step.status)).toEqual([
      "included",
      "sent",
      "signed",
    ]);
    expect(back).toMatchObject({ status: "stopping", halted: true });
  });

  it("comes back in the look that finds the step below, and that look's facts about it apply", () => {
    const json = orphans();
    const b = txOf(json, "b");
    // Not found, past its own end of validity and the margin, a found by the same look
    const expired = accept(
      json,
      look([aFound(json), missing(b)], tipAt(PAST, 100)),
    );
    expect(expired.steps.map((step) => step.status)).toEqual([
      "included",
      "expired",
      "orphaned",
    ]);
    // Found in a block
    const landed = accept(
      json,
      look([aFound(json), found(b, { blockHeight: 99 })], tipAt(PAST, 100)),
    );
    expect(landed.steps.map((step) => step.status)).toEqual([
      "included",
      "included",
      "signed",
    ]);
    // Found invalid
    const failed = accept(
      json,
      look([aFound(json), found(b, { valid: false })], tipAt(PAST, 100)),
    );
    expect(stepOf(failed, "b").status).toBe("failed");
  });

  it("is orphaned again when the step below is called dead again", () => {
    const back = accept(orphans(), look([aFound(orphans())], tipAt(PAST, 100)));
    // a is not found, past its end of validity and the margin, its source found by the same look
    const dead = accept(
      back,
      look([missing(txOf(back, "a")), found(SOURCE)], tipAt(PAST, 100)),
    );
    expect(dead.steps.map((step) => step.status)).toEqual([
      "expired",
      "orphaned",
      "orphaned",
    ]);
    expect(dead).toMatchObject({ status: "stopped", halted: true });
  });

  it("goes again on a plan that came to stopped once only when it was sent, as the same bytes; a step never sent does not go", () => {
    const json = orphans();
    const back = accept(json, look([aFound(json)], tipAt(PAST, 100)));
    expect(stepOf(accept(back, deliver("b")), "b")).toMatchObject({
      status: "sent",
      sends: 2,
    });
    expect(refusal(back, deliver("c"))).toBe("status");
    // Every step final: the plan is final, and the record keeps that it came to stopped
    const final = accept(
      back,
      look(
        ["a", "b", "c"].map((name) =>
          found(txOf(back, name), { blockHeight: 1 }),
        ),
        tipAt(PAST, 100),
      ),
    );
    expect(final).toMatchObject({ status: "final", halted: true });
  });

  it("stays orphaned below a failed step, which no later look changes", () => {
    const json = acceptAll(
      planOf([chainStep("a", 0, { plutus: true }), chainStep("b", 1)]),
      deliver("a"),
    );
    const a = txOf(json, "a");
    const failed = accept(json, look([found(a, { valid: false })]));
    expect(failed.steps.map((step) => step.status)).toEqual([
      "failed",
      "orphaned",
    ]);
    expect(failed).toMatchObject({ status: "stopped", halted: true });
    expect(accept(failed, look([found(a, { valid: true })]))).toBe(failed);
  });

  it("is not marked as a stopped plan: a plan stopped by its steps records only that it came to stopped", () => {
    const json = orphans();
    expect(json.halted).toBe(true);
    // stop() marks it as well; neither is removed
    const marked = accept(
      accept(json, look([aFound(json)], tipAt(PAST, 100))),
      { type: "stop" },
    );
    expect(marked).toMatchObject({ stopped: true, halted: true });
  });
});

describe("a delivery", () => {
  it("is refused for a step a key has not signed", () => {
    const json = planOf([chainStep("a", 0, { keys: [K1] })]);
    expect(refusal(json, deliver("a"))).toBe("status");
    // A step another party sent, rolled back: sent, with the key still missing
    const a = txOf(json, "a");
    const sent = acceptAll(
      json,
      look([found(a)], tipAt(0, 100)),
      look([missing(a)], tipAt(0, 100)),
    );
    expect(stepOf(sent, "a")).toMatchObject({ status: "sent", sends: 0 });
    expect(missingKeys(stepOf(sent, "a"))).toEqual([K1]);
    expect(refusal(sent, deliver("a"))).toBe("status");
  });

  it("on a plan that is stopping and not marked, takes only a step sent before: the same bytes again", () => {
    const json = planOf([
      chainStep("a", 0),
      {
        name: "x",
        built: stepTx({ txHash: hash(0xbb), inputs: [utxo(hash(0xf9))] }),
        standsOn: [],
      },
      {
        name: "y",
        built: stepTx({ txHash: hash(0xcc), inputs: [utxo(hash(0xf6))] }),
        standsOn: [],
      },
    ]);
    const stopping = accept(
      accept(json, deliver("x")),
      look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
    );
    expect(stopping.status).toBe("stopping");
    expect(stepOf(accept(stopping, deliver("x")), "x")).toMatchObject({
      status: "sent",
      sends: 2,
    });
    // y was never sent: it does not go for the first time
    expect(refusal(stopping, deliver("y"))).toBe("status");
    // A marked plan sends nothing
    expect(refusal(accept(stopping, { type: "stop" }), deliver("x"))).toBe(
      "stopped",
    );
  });
});

describe("the plan's status", () => {
  it("is final when every step is, also when the plan is marked", () => {
    const json = chain(2, { confirmations: 0 });
    const seen = look(
      [
        found(txOf(json, "a"), { blockHeight: 10 }),
        found(txOf(json, "b"), { blockHeight: 10 }),
      ],
      tipAt(0, 10),
    );
    expect(accept(json, seen).status).toBe("final");
    expect(acceptAll(json, { type: "stop" }, seen).status).toBe("final");
  });

  it("is stopping when marked while a step may land, and stopped once every step is final or dead", () => {
    const json = acceptAll(chain(1), deliver("a"), { type: "stop" });
    expect(json.status).toBe("stopping");
    expect(
      accept(json, look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)))
        .status,
    ).toBe("stopped");
  });

  it("is stopping, not stopped, while a step is included next to a dead one: it can be rolled back", () => {
    const json = planOf([
      chainStep("a", 0),
      {
        name: "x",
        built: stepTx({ txHash: hash(0xbb), inputs: [utxo(hash(0xf9))] }),
        standsOn: [],
      },
    ]);
    const after = accept(
      json,
      look(
        [missing(txOf(json, "a")), found(SOURCE), found(hash(0xbb))],
        tipAt(PAST, 100),
      ),
    );
    expect(after.steps.map((step) => step.status)).toEqual([
      "expired",
      "included",
    ]);
    expect(after.status).toBe("stopping");
    expect(landedSteps(after).map((step) => step.name)).toEqual(["x"]);
    expect(liveSteps(after)).toEqual([]);
  });

  it("refuses a delivery while it is stopping, and every event that would change a terminal plan", () => {
    const json = planOf([
      chainStep("a", 0),
      {
        name: "x",
        built: stepTx({ txHash: hash(0xbb), inputs: [utxo(hash(0xf9))] }),
        standsOn: [],
      },
    ]);
    const stopping = accept(
      json,
      look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
    );
    expect(stopping.status).toBe("stopping");
    // x was never sent: it does not go for the first time
    expect(refusal(stopping, deliver("x"))).toBe("status");

    const stopped = acceptAll(chain(1), {
      type: "observation",
      tip: tipAt(PAST),
      sightings: [missing(hash(0xa0)), found(SOURCE)],
    });
    expect(stopped.status).toBe("stopped");
    expect(refusal(stopped, deliver("a"))).toBe("terminal");
    expect(
      refusal(stopped, { type: "signature", step: "a", witnesses: [] }),
    ).toBe("terminal");
    expect(refusal(stopped, refused("a"))).toBe("terminal");
    expect(
      refusal(stopped, { type: "steps", steps: [chainStep("b", 1)] }),
    ).toBe("terminal");
    expect(accept(stopped, { type: "stop" })).toBe(stopped);
    // A look still changes it: the step called dead is found in a block, and the plan's status
    // follows its steps
    const afterFind = accept(stopped, look([found(hash(0xa0))], tipAt(PAST)));
    expect(stepOf(afterFind, "a").status).toBe("included");
    expect(afterFind).toMatchObject({ status: "stopping", halted: true });
  });
});

describe("the mark", () => {
  it("makes the plan sign and send nothing more, and is never removed", () => {
    const json = accept(planOf([chainStep("a", 0, { keys: [K1] })]), {
      type: "stop",
    });
    expect(json.stopped).toBe(true);
    expect(
      refusal(json, {
        type: "signature",
        step: "a",
        witnesses: [witnessOf(K1)],
      }),
    ).toBe("stopped");
    expect(refusal(json, deliver("a"))).toBe("stopped");
    expect(accept(json, { type: "stop" })).toBe(json);
  });

  it("names no plan made in its place while a step of it may still land", () => {
    // Pending, with a signed step
    expect(refusal(chain(1), { type: "stop", replacedBy: "next" })).toBe(
      "status",
    );
    // Marked and stopping: the sent step may land
    const marked = acceptAll(chain(1), deliver("a"), { type: "stop" });
    expect(marked.status).toBe("stopping");
    expect(refusal(marked, { type: "stop", replacedBy: "next" })).toBe(
      "status",
    );
    // Stopping by a dead step, unmarked, with a step of another chain sent
    const stopping = accept(
      accept(
        planOf([
          chainStep("a", 0),
          {
            name: "x",
            built: stepTx({ txHash: hash(0xbb), inputs: [utxo(hash(0xf9))] }),
            standsOn: [],
          },
        ]),
        deliver("x"),
      ),
      look([missing(hash(0xa0)), found(SOURCE)], tipAt(PAST)),
    );
    expect(stopping.status).toBe("stopping");
    expect(refusal(stopping, { type: "stop", replacedBy: "next" })).toBe(
      "status",
    );
    // Once every step is final or dead, it takes the name
    const stopped = accept(
      marked,
      look([missing(txOf(marked, "a")), found(SOURCE)], tipAt(PAST)),
    );
    expect(accept(stopped, { type: "stop", replacedBy: "next" })).toMatchObject(
      {
        replacedBy: "next",
        rev: stopped.rev + 1,
      },
    );
  });
});

describe("the name of the plan made in place of a terminal one", () => {
  it("is recorded once on a stopped plan, with the mark; another name is refused", () => {
    const stopped = accept(
      accept(chain(1), deliver("a")),
      look([missing(hash(0xa0)), found(SOURCE)], tipAt(PAST)),
    );
    expect(stopped.status).toBe("stopped");
    expect(stopped.stopped).toBeUndefined();
    const replaced = accept(stopped, { type: "stop", replacedBy: "next" });
    expect(replaced).toMatchObject({
      status: "stopped",
      stopped: true,
      replacedBy: "next",
      rev: stopped.rev + 1,
    });
    expect(replaced.steps).toBe(stopped.steps);
    expect(accept(replaced, { type: "stop", replacedBy: "next" })).toBe(
      replaced,
    );
    expect(refusal(replaced, { type: "stop", replacedBy: "other" })).toBe(
      "status",
    );
  });

  it("is recorded once on a final plan, which stays final", () => {
    const json = chain(1, { confirmations: 0 });
    const final = accept(
      json,
      look([found(txOf(json, "a"), { blockHeight: 10 })], tipAt(0, 10)),
    );
    expect(final.status).toBe("final");
    expect(accept(final, { type: "stop" })).toBe(final);
    const replaced = accept(final, { type: "stop", replacedBy: "next" });
    expect(replaced).toMatchObject({
      status: "final",
      stopped: true,
      replacedBy: "next",
    });
    expect(refusal(replaced, { type: "stop", replacedBy: "other" })).toBe(
      "status",
    );
  });
});

describe("signatures", () => {
  it("change nothing on a step once a delivery of it is recorded: every send is the same bytes", () => {
    const json = acceptAll(
      planOf([{ ...chainStep("a", 0, { keys: [K1] }) }]),
      { type: "signature", step: "a", witnesses: [witnessOf(K1)] },
      deliver("a"),
    );
    expect(
      accept(json, {
        type: "signature",
        step: "a",
        witnesses: [witnessOf(K2)],
      }),
    ).toBe(json);
  });

  const two = () => planOf([chainStep("a", 0, { keys: [K1, K2] })]);

  it("keep one witness of each kind per key, vkey witnesses first, and sign the step once every key has a vkey witness", () => {
    let json = accept(two(), {
      type: "signature",
      step: "a",
      witnesses: [witnessOf(K2, "bootstrap")],
    });
    expect(stepOf(json, "a").status).toBe("built");
    json = accept(json, {
      type: "signature",
      step: "a",
      witnesses: [witnessOf(K2), witnessOf(K1)],
    });
    const a = stepOf(json, "a");
    expect(a.status).toBe("signed");
    // A bootstrap witness signs for no key hash, so the vkey witness of the same key is kept
    expect(a.witnesses.map((w) => [w.keyHash, w.kind])).toEqual([
      [K2, "vkey"],
      [K1, "vkey"],
      [K2, "bootstrap"],
    ]);
  });

  it("count for the key their own public key hashes to, never for the key they are named with", () => {
    const json = accept(two(), {
      type: "signature",
      step: "a",
      witnesses: [
        { ...witnessOf(keyHash(7)), keyHash: K1 },
        { ...witnessOf(K2), kind: "bootstrap" },
      ],
    });
    const a = stepOf(json, "a");
    expect(a.status).toBe("built");
    expect(missingKeys(a)).toEqual([K1, K2]);
    expect(a.witnesses.map((w) => w.keyHash)).toEqual([keyHash(7), K2]);
  });

  it("keep no witness whose public key cannot be read: it counts for no key", () => {
    const json = two();
    for (const vkey of ["zz", "", undefined, 7])
      expect(
        accept(json, {
          type: "signature",
          step: "a",
          witnesses: [{ ...witnessOf(K1), vkey } as never],
        }),
      ).toBe(json);
  });

  it("keep a witness of a key the body does not ask for, which signs nothing", () => {
    const json = accept(two(), {
      type: "signature",
      step: "a",
      witnesses: [witnessOf(keyHash(7))],
    });
    expect(stepOf(json, "a")).toMatchObject({ status: "built" });
    expect(stepOf(json, "a").witnesses).toHaveLength(1);
  });

  it("name a step of the plan", () => {
    expect(
      refusal(two(), { type: "signature", step: "z", witnesses: [] }),
    ).toBe("step");
    expect(refusal(two(), deliver("z"))).toBe("step");
    expect(refusal(two(), refused("z"))).toBe("step");
  });
});

describe("appending steps", () => {
  it("makes the first record from the empty plan: revision 1, each step built or signed", () => {
    const json = planOf([chainStep("a", 0, { keys: [K1] }), chainStep("b", 1)]);
    expect(json.rev).toBe(1);
    expect(json.status).toBe("pending");
    expect(json.steps.map((step) => [step.name, step.status])).toEqual([
      ["a", "built"],
      ["b", "signed"],
    ]);
    expect(planUntil(json)).toBe(UNTIL);
  });

  it("keeps the transactions of after a step stands on", () => {
    const json = planOf([
      {
        name: "a",
        built: stepTx({ txHash: hash(0xa0), inputs: [utxo(hash(0xee))] }),
        standsOn: [],
        after: [hash(0xee)],
      },
    ]);
    expect(stepOf(json, "a").after).toEqual([hash(0xee)]);
  });

  it("takes witnesses a step holds already", () => {
    const json = planOf([
      { ...chainStep("a", 0, { keys: [K1] }), witnesses: [witnessOf(K1)] },
    ]);
    expect(stepOf(json, "a").status).toBe("signed");
  });

  it("leaves every step the plan has as it is", () => {
    const first = acceptAll(chain(2), deliver("a"));
    const json = accept(first, { type: "steps", steps: [chainStep("c", 2)] });
    expect(
      json.steps.slice(0, 2).every((step, i) => step === first.steps[i]),
    ).toBe(true);
    expect(json.steps.map((step) => step.name)).toEqual(["a", "b", "c"]);
    expect(json.rev).toBe(first.rev + 1);
  });

  it("marks a step appended to a plan that has steps, and no step of the first record", () => {
    const first = planOf([chainStep("a", 0), chainStep("b", 1)]);
    expect(first.steps.map((step) => step.added)).toEqual([
      undefined,
      undefined,
    ]);
    const json = accept(first, { type: "steps", steps: [chainStep("c", 2)] });
    expect(stepOf(json, "c").added).toBe(true);
    expect(json.steps[0]).toBe(first.steps[0]);
    expect(json.steps[1]).toBe(first.steps[1]);
    expect("added" in json.steps[0]! || "added" in json.steps[1]!).toBe(false);
    // The mark is the state machine's: a step given with it, or without, gets it by its place
    const marked = accept(json, {
      type: "steps",
      steps: [{ ...chainStep("d", 3), added: true } as NewStep],
    });
    expect(stepOf(marked, "d").added).toBe(true);
    const unmarked = planOf([{ ...chainStep("a", 0), added: true } as NewStep]);
    expect(unmarked.steps[0]!.added).toBeUndefined();
  });

  it("changes nothing when the same steps are given again, and refuses a part of them", () => {
    const steps = [chainStep("a", 0), chainStep("b", 1)];
    const json = planOf(steps);
    expect(accept(json, { type: "steps", steps })).toBe(json);
    expect(
      refusal(json, { type: "steps", steps: [steps[1]!, chainStep("c", 2)] }),
    ).toBe("steps");
  });

  it("refuses steps that would give the plan more than the steps a plan may have", () => {
    const named = (i: number): NewStep => ({
      ...chainStep(`s${i}`, i),
      standsOn: i === 0 ? [] : [`s${i - 1}`],
    });
    const steps = Array.from({ length: MAX_STEPS }, (_, i) => named(i));
    const full = planOf(steps);
    expect(full.steps).toHaveLength(MAX_STEPS);
    const one = named(MAX_STEPS);
    expect(refusal(full, { type: "steps", steps: [one] })).toBe("steps");
    const json = planOf(steps.slice(0, MAX_STEPS - 1));
    expect(
      refusal(json, { type: "steps", steps: [steps[MAX_STEPS - 1]!, one] }),
    ).toBe("steps");
    expect(
      accept(json, { type: "steps", steps: [steps[MAX_STEPS - 1]!] }).steps,
    ).toHaveLength(MAX_STEPS);
    expect(
      refusal(emptyPlan(), { type: "steps", steps: [...steps, one] }),
    ).toBe("steps");
  });

  it("refuses names and transactions the plan has, and a step that stands on what it does not spend from", () => {
    const json = chain(1);
    const b = chainStep("b", 1);
    const refusals = [
      [],
      [{ ...b, name: "" }],
      [{ ...b, name: "a" }],
      [{ ...b, built: stepTx({ txHash: hash(0xa0) }) }],
      [{ ...b, standsOn: [] }],
      [{ ...b, standsOn: ["a", "a"] }],
      [{ ...b, standsOn: ["a", "zz"] }],
      [
        {
          ...b,
          built: stepTx({ txHash: hash(0xa1), inputs: [utxo(hash(0xf5))] }),
        },
      ],
      [{ ...b, kind: "consolidation" as const, given: { parts: [] } }],
      // A transaction of after it does not spend from, a step of the plan as one, none listed
      [{ ...b, after: [hash(0xee)] }],
      [{ ...b, after: [hash(0xa0)] }],
      [{ ...b, after: [] }],
      // A step cannot stand on a step after it
      [{ ...b, standsOn: ["c"] }, chainStep("c", 2)],
    ];
    for (const steps of refusals)
      expect(refusal(json, { type: "steps", steps })).toBe("steps");
  });

  it("is refused on a plan that is marked, stopping or terminal", () => {
    const c = { type: "steps" as const, steps: [chainStep("c", 2)] };
    expect(refusal(accept(chain(2), { type: "stop" }), c)).toBe("stopped");
    const json = planOf([
      chainStep("a", 0),
      {
        name: "x",
        built: stepTx({ txHash: hash(0xbb), inputs: [utxo(hash(0xf9))] }),
        standsOn: [],
      },
    ]);
    const stopping = accept(
      json,
      look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
    );
    expect(
      refusal(stopping, {
        type: "steps",
        steps: [
          {
            name: "y",
            built: stepTx({ txHash: hash(0xcc), inputs: [utxo(hash(0xf6))] }),
            standsOn: [],
          },
        ],
      }),
    ).toBe("status");
  });
});

it("never modifies the record or the event it is given", () => {
  const json = deepFreeze(chain(3));
  const events = (
    [
      { type: "steps", steps: [chainStep("d", 3)] },
      deliver("a"),
      refused("a"),
      look([missing(txOf(json, "a")), found(SOURCE)], tipAt(PAST)),
      { type: "stop", replacedBy: "next" },
      { type: "signature", step: "b", witnesses: [witnessOf(K1)] },
    ] as PlanEvent[]
  ).map(deepFreeze);
  let current = json;
  for (const event of events) {
    const result = advancePlan(current, event);
    if (result.ok) current = deepFreeze(result.json);
  }
  expect(current.rev).toBeGreaterThan(json.rev);
  expect(emptyPlan().rev).toBe(0);
});
