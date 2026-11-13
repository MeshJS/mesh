import type { TxIntentStatus } from "../../../src/tx-builder";
import {
  advanceIntent,
  IntentRecord,
  Refusal,
  TxIntentEvent,
} from "../../../src/tx-builder/intent/core";
import {
  A1,
  A2,
  closedEvent,
  closingMark,
  CONFIRMATIONS,
  deliver,
  foundAt,
  K1,
  K2,
  KX,
  MARGIN,
  notFoundAt,
  PARENT_OUT,
  reach,
  refused,
  secondBuild,
  STATUSES,
  UNTIL,
} from "./intent-states";
import { attemptOf, witness } from "./intent-util";

/**
 * What an event does: the status after it (`=`: the status before it); `same` when the very
 * record comes back; `new` when a new attempt is added; or the reason of a refusal.
 */
type Cell =
  { status: TxIntentStatus | "new" | "="; same?: true } | { refused: Refusal };

const to = (status: TxIntentStatus | "new"): Cell => ({ status });
const same = (status: TxIntentStatus | "="): Cell => ({ status, same: true });
const no = (reason: Refusal): Cell => ({ refused: reason });

const expectCell = (json: IntentRecord, event: TxIntentEvent, cell: Cell) => {
  const result = advanceIntent(json, event);
  if ("refused" in cell) {
    expect(result).toMatchObject({ ok: false, reason: cell.refused });
    return;
  }
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  if (cell.same) {
    expect(result.json).toBe(json);
  } else {
    expect(result.json).not.toBe(json);
    expect(result.json.rev).toBe(json.rev + 1);
  }
  if (cell.status === "new") {
    expect(result.json.attempts).toHaveLength(json.attempts.length + 1);
    expect(result.json.attempts.at(-1)!.txHash).toBe(A2);
    expect(result.json.status).toBe("built");
  } else {
    expect(result.json.status).toBe(cell.status);
  }
  // The decision to close is never taken back.
  if (json.closing) expect(result.json.closing).toBe(true);
  return result.json;
};

const columnsA = {
  "build, no tip": secondBuild(),
  "build, tip before the deadline": secondBuild(UNTIL - 1),
  "build, tip at the deadline": secondBuild(UNTIL),
  "signature, keys still missing": {
    type: "signature",
    txHash: A1,
    witnesses: [witness(K1)],
  },
  "signature, keys complete": {
    type: "signature",
    txHash: A1,
    witnesses: [witness(K1), witness(K2), witness(KX)],
  },
  delivery: deliver,
  "answer: accepted": { type: "answer", txHash: A1, refused: false },
  "answer: refused": refused,
} satisfies Record<string, TxIntentEvent>;
type ColumnA = keyof typeof columnsA;

const terminalA = Object.fromEntries(
  Object.keys(columnsA).map((column) => [column, no("terminal")]),
) as Record<ColumnA, Cell>;

// A signed, sent or rejected attempt holds both keys already, so a signature of K1 alone adds
// nothing, and one with a further key adds that witness.
const tableA: Record<TxIntentStatus, Record<ColumnA, Cell>> = {
  draft: {
    "build, no tip": to("built"),
    "build, tip before the deadline": to("built"),
    "build, tip at the deadline": to("built"),
    "signature, keys still missing": no("staleAttempt"),
    "signature, keys complete": no("staleAttempt"),
    delivery: no("staleAttempt"),
    "answer: accepted": no("staleAttempt"),
    "answer: refused": no("staleAttempt"),
  },
  built: {
    "build, no tip": no("status"),
    "build, tip before the deadline": no("status"),
    "build, tip at the deadline": to("new"),
    "signature, keys still missing": to("built"),
    "signature, keys complete": to("signed"),
    delivery: no("status"),
    "answer: accepted": no("status"),
    "answer: refused": no("status"),
  },
  signed: {
    "build, no tip": no("status"),
    "build, tip before the deadline": no("status"),
    "build, tip at the deadline": to("new"),
    "signature, keys still missing": same("signed"),
    "signature, keys complete": to("signed"),
    delivery: to("sent"),
    "answer: accepted": no("status"),
    "answer: refused": no("status"),
  },
  sent: {
    "build, no tip": no("status"),
    "build, tip before the deadline": no("status"),
    "build, tip at the deadline": no("status"),
    "signature, keys still missing": same("sent"),
    "signature, keys complete": to("sent"),
    delivery: no("status"),
    "answer: accepted": same("sent"),
    "answer: refused": to("rejected"),
  },
  rejected: {
    "build, no tip": to("new"),
    "build, tip before the deadline": to("new"),
    "build, tip at the deadline": to("new"),
    "signature, keys still missing": same("rejected"),
    "signature, keys complete": to("signed"),
    delivery: no("status"),
    "answer: accepted": no("status"),
    "answer: refused": no("status"),
  },
  included: {
    "build, no tip": no("status"),
    "build, tip before the deadline": no("status"),
    "build, tip at the deadline": no("status"),
    "signature, keys still missing": no("status"),
    "signature, keys complete": no("status"),
    delivery: no("status"),
    "answer: accepted": same("included"),
    "answer: refused": to("included"),
  },
  expired: {
    "build, no tip": to("new"),
    "build, tip before the deadline": to("new"),
    "build, tip at the deadline": to("new"),
    "signature, keys still missing": no("status"),
    "signature, keys complete": no("status"),
    delivery: no("status"),
    "answer: accepted": same("expired"),
    "answer: refused": to("expired"),
  },
  failed: {
    "build, no tip": no("status"),
    "build, tip before the deadline": no("status"),
    "build, tip at the deadline": no("status"),
    "signature, keys still missing": no("status"),
    "signature, keys complete": no("status"),
    delivery: no("status"),
    "answer: accepted": same("failed"),
    "answer: refused": to("failed"),
  },
  orphaned: {
    "build, no tip": to("new"),
    "build, tip before the deadline": to("new"),
    "build, tip at the deadline": to("new"),
    "signature, keys still missing": no("status"),
    "signature, keys complete": no("status"),
    delivery: no("status"),
    "answer: accepted": same("orphaned"),
    "answer: refused": to("orphaned"),
  },
  final: terminalA,
  abandoned: terminalA,
};

const ANSWERS: readonly ColumnA[] = ["answer: accepted", "answer: refused"];

describe("intent state machine: status x build, signature, delivery and answer", () => {
  for (const status of STATUSES)
    for (const column of Object.keys(columnsA) as ColumnA[])
      it(`${status} + ${column}`, () => {
        const json = reach(status);
        const after = expectCell(
          json,
          columnsA[column],
          tableA[status][column],
        );
        if (
          after !== undefined &&
          column === "answer: refused" &&
          status !== "sent"
        )
          // Accepted without a change of status: the refusal is counted.
          expect(attemptOf(after, A1).refused).toBe(1);
      });

  it("records the witnesses of a signature that leaves keys missing", () => {
    const after = advanceIntent(
      reach("built"),
      columnsA["signature, keys still missing"],
    );
    expect(after.ok && attemptOf(after.json, A1).witnesses).toEqual([
      witness(K1),
    ]);
  });

  it("an answer is refused once every recorded delivery has its answer", () => {
    const json = reach("included");
    const once = advanceIntent(json, refused);
    expect(once.ok).toBe(true);
    if (once.ok)
      expect(advanceIntent(once.json, refused)).toMatchObject({
        ok: false,
        reason: "status",
      });
  });
});

/** The columns of the observation table, for A1 */
const columnsB = {
  "found, valid, below the depth": foundAt(CONFIRMATIONS - 1),
  "found, valid, at the depth": foundAt(CONFIRMATIONS),
  "found, invalid": foundAt(1, false),
  "found, validity unknown": foundAt(1, null),
  "not found, no tip": notFoundAt(),
  "not found, tip before the deadline and margin": notFoundAt(
    UNTIL + MARGIN - 1,
  ),
  "not found, tip at the deadline and margin": notFoundAt(UNTIL + MARGIN),
  "no sighting, anchor in place, tip at the deadline and margin": {
    type: "observation",
    tip: { slot: (UNTIL + MARGIN) / 1000, timeMs: UNTIL + MARGIN },
    anchorsInPlace: [PARENT_OUT.input],
  },
} satisfies Record<string, TxIntentEvent>;
type ColumnB = keyof typeof columnsB;

const unlanded: Record<ColumnB, Cell> = {
  "found, valid, below the depth": to("included"),
  "found, valid, at the depth": to("final"),
  "found, invalid": to("failed"),
  "found, validity unknown": same("="),
  "not found, no tip": same("="),
  "not found, tip before the deadline and margin": same("="),
  "not found, tip at the deadline and margin": to("expired"),
  "no sighting, anchor in place, tip at the deadline and margin": to("expired"),
};

/** `=` in a table: the status before the event */
const resolve = (cell: Cell, status: TxIntentStatus): Cell =>
  "status" in cell && cell.status === "=" ? { ...cell, status } : cell;

const dead: Record<ColumnB, Cell> = {
  "found, valid, below the depth": to("included"),
  "found, valid, at the depth": to("final"),
  "found, invalid": to("failed"),
  "found, validity unknown": same("="),
  "not found, no tip": same("="),
  "not found, tip before the deadline and margin": same("="),
  "not found, tip at the deadline and margin": same("="),
  "no sighting, anchor in place, tip at the deadline and margin": same("="),
};

const tableB: Partial<Record<TxIntentStatus, Record<ColumnB, Cell>>> = {
  built: unlanded,
  signed: unlanded,
  sent: unlanded,
  rejected: unlanded,
  included: {
    // Found again in the block it was found in: nothing new.
    "found, valid, below the depth": same("included"),
    "found, valid, at the depth": to("final"),
    "found, invalid": same("included"),
    "found, validity unknown": same("included"),
    "not found, no tip": to("sent"),
    "not found, tip before the deadline and margin": to("sent"),
    "not found, tip at the deadline and margin": to("sent"),
    "no sighting, anchor in place, tip at the deadline and margin":
      same("included"),
  },
  expired: dead,
  orphaned: dead,
  failed: Object.fromEntries(
    Object.keys(columnsB).map((column) => [column, same("failed")]),
  ) as Record<ColumnB, Cell>,
};

describe("intent state machine: attempt status x observation", () => {
  for (const [status, row] of Object.entries(tableB) as [
    TxIntentStatus,
    Record<ColumnB, Cell>,
  ][])
    for (const column of Object.keys(columnsB) as ColumnB[])
      it(`${status} + ${column}`, () => {
        const json = reach(status);
        const cell = resolve(row[column], status);
        const after = expectCell(json, columnsB[column], cell);
        if (after !== undefined && "status" in cell)
          expect(attemptOf(after, A1).status).toBe(cell.status);
      });

  it("an included attempt found once more in the same block is the same record", () => {
    // reach("included") found it in slot 900; below the depth it is found there again.
    const json = reach("included");
    const result = advanceIntent(json, foundAt(1));
    expect(result.ok && result.json).toBe(json);
  });

  it("an observation of a draft returns the same record", () => {
    const json = reach("draft");
    for (const event of Object.values(columnsB)) {
      const result = advanceIntent(json, event);
      expect(result.ok && result.json).toBe(json);
    }
  });

  it("an observation of a final or abandoned intent is refused as terminal", () => {
    for (const status of ["final", "abandoned"] as const)
      for (const event of Object.values(columnsB))
        expect(advanceIntent(reach(status), event)).toMatchObject({
          ok: false,
          reason: "terminal",
        });
  });

  it("sets seen to the block of the find and removes it when the attempt is lost", () => {
    const included = reach("included");
    expect(attemptOf(included, A1).seen).toEqual({ slot: 900 });
    const lost = advanceIntent(included, notFoundAt());
    expect(lost.ok && attemptOf(lost.json, A1).seen).toBeUndefined();
  });
});

type ColumnC = "closing mark" | "closed, marked" | "closed, no mark";
const tableC: Record<TxIntentStatus, Record<ColumnC, Cell | undefined>> = {
  draft: {
    "closing mark": to("abandoned"),
    "closed, marked": undefined,
    "closed, no mark": no("status"),
  },
  built: {
    "closing mark": to("built"),
    "closed, marked": no("status"),
    "closed, no mark": no("status"),
  },
  signed: {
    "closing mark": to("signed"),
    "closed, marked": no("status"),
    "closed, no mark": no("status"),
  },
  sent: {
    "closing mark": to("sent"),
    "closed, marked": no("status"),
    "closed, no mark": no("status"),
  },
  rejected: {
    "closing mark": to("rejected"),
    "closed, marked": no("status"),
    "closed, no mark": no("status"),
  },
  included: {
    "closing mark": no("status"),
    "closed, marked": no("status"),
    "closed, no mark": no("status"),
  },
  expired: {
    "closing mark": to("expired"),
    "closed, marked": to("abandoned"),
    "closed, no mark": no("status"),
  },
  failed: {
    "closing mark": to("failed"),
    "closed, marked": to("abandoned"),
    "closed, no mark": no("status"),
  },
  orphaned: {
    "closing mark": to("orphaned"),
    "closed, marked": to("abandoned"),
    "closed, no mark": no("status"),
  },
  final: {
    "closing mark": no("terminal"),
    "closed, marked": no("terminal"),
    "closed, no mark": no("terminal"),
  },
  abandoned: {
    "closing mark": no("terminal"),
    "closed, marked": no("terminal"),
    "closed, no mark": no("terminal"),
  },
};

describe("intent state machine: status x closing mark and closed", () => {
  for (const status of STATUSES) {
    const row = tableC[status];
    it(`${status} + closing mark`, () => {
      const after = expectCell(
        reach(status),
        closingMark,
        row["closing mark"]!,
      );
      if (after !== undefined) expect(after.closing).toBe(true);
    });
    it(`${status} + closed, no mark`, () => {
      // An abandoned intent always has the mark; the cell is about the refusal.
      expectCell(reach(status), closedEvent, row["closed, no mark"]!);
    });
    const marked = row["closed, marked"];
    if (marked !== undefined)
      it(`${status} + closed, marked`, () => {
        const json =
          status === "final" || status === "abandoned"
            ? reach(status)
            : reach(status, true);
        if (status !== "final") expect(json.closing).toBe(true);
        expectCell(json, closedEvent, marked);
      });
  }

  it("a closing mark in included is refused with the mark set too", () => {
    expect(advanceIntent(reach("included", true), closingMark)).toMatchObject({
      ok: false,
      reason: "status",
    });
  });
});

describe("intent state machine: the same statuses with the decision to close recorded", () => {
  const MARKED: readonly TxIntentStatus[] = [
    "built",
    "signed",
    "sent",
    "rejected",
    "included",
    "expired",
    "failed",
    "orphaned",
  ];
  const STOPPED: readonly ColumnA[] = [
    "build, no tip",
    "build, tip before the deadline",
    "build, tip at the deadline",
    "signature, keys still missing",
    "signature, keys complete",
    "delivery",
  ];
  for (const status of MARKED) {
    for (const column of STOPPED)
      it(`${status}, marked + ${column}: closing`, () => {
        expectCell(reach(status, true), columnsA[column], no("closing"));
      });
    for (const column of ANSWERS)
      it(`${status}, marked + ${column}`, () => {
        expectCell(
          reach(status, true),
          columnsA[column],
          tableA[status][column],
        );
      });
    const row = tableB[status];
    if (row !== undefined)
      for (const column of Object.keys(columnsB) as ColumnB[])
        it(`${status}, marked + ${column}`, () => {
          expectCell(
            reach(status, true),
            columnsB[column],
            resolve(row[column], status),
          );
        });
  }
});
