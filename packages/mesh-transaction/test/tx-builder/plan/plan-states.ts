import type { TxPlanStatus } from "../../../src/tx-builder";
import type {
  PlanRecord,
  Tip,
  TxPlanEvent,
} from "../../../src/tx-builder/plan/core";
import {
  accept,
  acceptAll,
  buildEvent,
  deepFreeze,
  draft,
  hash,
  keyHash,
  utxo,
  witness,
} from "./plan-util";

// One child plan, taken through every status by the events that lead there. Its attempt `A1`
// spends the output of a parent attempt `P1`, needs two keys and runs a Plutus script.

export const P1 = hash(0x100);
export const P1_UNTIL = 800_000;
export const PARENT_OUT = utxo(P1, 0);
export const PARENT_PLAN = "parent-1";
export const A1 = hash(0xa1);
export const A2 = hash(0xa2);
export const UNTIL = 1_000_000;
export const MARGIN = 100_000;
export const CONFIRMATIONS = 3;
export const K1 = keyHash(1);
export const K2 = keyHash(2);
/** A key no part needs, as a bootstrap witness would be */
export const KX = keyHash(9);

/** A tip whose slot starts at `slot` seconds, at the height of the slot */
export const tipAt = (
  slot: number,
  height: number | undefined = slot,
): Tip => ({
  slot,
  timeMs: slot * 1000,
  ...(height !== undefined && { height }),
});

export const parents = [
  { txHash: P1, until: P1_UNTIL, planId: PARENT_PLAN },
] as const;

export const firstBuild = buildEvent({
  txHash: A1,
  anchors: [{ utxo: PARENT_OUT, kind: "parent" }],
  keys: [K1, K2],
  plutus: true,
  parents: [...parents],
});

/** A second attempt on the same parent output, built with the tip at `tipTimeMs` */
export const secondBuild = (tipTimeMs?: number) =>
  buildEvent({
    txHash: A2,
    anchors: [{ utxo: PARENT_OUT, kind: "parent" }],
    keys: [K1, K2],
    plutus: true,
    parents: [...parents],
    ...(tipTimeMs !== undefined && { tipTimeMs }),
  });

export const signAll: TxPlanEvent = {
  type: "signature",
  txHash: A1,
  witnesses: [witness(K1), witness(K2)],
};
export const deliver: TxPlanEvent = { type: "delivery", txHash: A1 };
export const refused: TxPlanEvent = {
  type: "answer",
  txHash: A1,
  refused: true,
  parentsInBlock: true,
};

/** A1 found in slot 900, with the tip `depth` blocks above it; `valid` null: not said */
export const foundAt = (
  depth: number,
  valid: boolean | null = true,
): TxPlanEvent => ({
  type: "observation",
  tip: tipAt(900 + depth),
  attempts: [
    {
      txHash: A1,
      found: true,
      slot: 900,
      blockHeight: 900,
      ...(valid !== null && { valid }),
    },
  ],
});

export const notFoundAt = (timeMs?: number): TxPlanEvent => ({
  type: "observation",
  ...(timeMs !== undefined && {
    tip: { slot: Math.floor(timeMs / 1000), timeMs },
  }),
  attempts: [{ txHash: A1, found: false }],
});

/** The parent attempt is not found, and the tip is at the end of its deadline and the margin */
export const parentGone: TxPlanEvent = {
  type: "observation",
  tip: tipAt((P1_UNTIL + MARGIN) / 1000),
  parents: [{ txHash: P1, found: false }],
};

export const closingMark: TxPlanEvent = { type: "closing" };
export const closedEvent: TxPlanEvent = { type: "closed" };

export const STATUSES: readonly TxPlanStatus[] = [
  "draft",
  "built",
  "signed",
  "sent",
  "rejected",
  "included",
  "expired",
  "failed",
  "orphaned",
  "final",
  "abandoned",
];

/**
 * The child plan in `status`, reached by events; with `marked`, the decision to close is
 * recorded too (an included plan gets it before its attempt is found). Frozen, so that an event
 * that modified it would throw.
 */
export const reach = (status: TxPlanStatus, marked = false): PlanRecord => {
  const start = draft({
    expiryMarginMs: MARGIN,
    confirmations: CONFIRMATIONS,
  });
  const sent = () => acceptAll(start, firstBuild, signAll, deliver);
  const mark = (json: PlanRecord) =>
    marked ? accept(json, closingMark) : json;
  let json: PlanRecord;
  switch (status) {
    case "draft":
      json = start;
      break;
    case "built":
      json = mark(accept(start, firstBuild));
      break;
    case "signed":
      json = mark(acceptAll(start, firstBuild, signAll));
      break;
    case "sent":
      json = mark(sent());
      break;
    case "rejected":
      json = mark(accept(sent(), refused));
      break;
    case "included":
      json = accept(mark(sent()), foundAt(1));
      break;
    case "expired":
      json = mark(accept(sent(), notFoundAt(UNTIL + MARGIN)));
      break;
    case "failed":
      json = mark(accept(sent(), foundAt(1, false)));
      break;
    case "orphaned":
      json = mark(accept(sent(), parentGone));
      break;
    case "final":
      json = accept(sent(), foundAt(CONFIRMATIONS));
      break;
    case "abandoned":
      json = acceptAll(
        sent(),
        notFoundAt(UNTIL + MARGIN),
        closingMark,
        closedEvent,
      );
      break;
    default:
      throw new Error(`no way to ${status}`);
  }
  if (json.status !== status)
    throw new Error(`reached ${json.status} instead of ${status}`);
  return deepFreeze(json);
};
