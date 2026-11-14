import type { BuiltTxData } from "../builder";
import type { OutRef, Utxo } from "../parts/types";
import type {
  TxAttempt,
  TxAttemptStatus,
  TxPlanJSON,
  TxPlanStatus,
} from "./types";

// The state machine of a plan: a pure function from a record and an event to the next record.
// It makes no request and reads no clock; every time it compares comes in the event or the
// record. The class that drives a plan makes the requests and turns what it learns into
// events. Nothing here is exported from the package.

/** The most attempts a plan may hold */
export const MAX_ATTEMPTS = 16;

/**
 * Where an anchor comes from. `payer`: an input the selection took from the payer; `parts`: an
 * input a `spend` part names; `parent`: an output of a parent attempt.
 */
export type AnchorKind = "payer" | "parts" | "parent";

/**
 * `TxPlanJSON.anchor` as the library writes it: every anchor the plan used, in the order of
 * first use, each with the attempts built on it. Entries are never removed.
 */
export type AnchorRecord = {
  readonly anchors: readonly {
    readonly utxo: Utxo;
    readonly kind: AnchorKind;
    /** The `txHash` of each attempt built on this anchor */
    readonly attempts: readonly string[];
  }[];
};

/** One witness, already checked against the attempt's body; the value is opaque here */
export type Witness = { readonly keyHash: string; readonly witness: string };

/** An attempt as the record holds it: `TxAttempt` and the library's fields */
export type AttemptRecord = TxAttempt & {
  /**
   * The built transaction. Every attempt holds its own while the plan is not terminal; a final
   * plan keeps it on the landed attempt only, an abandoned one on the current attempt only
   */
  readonly built?: BuiltTxData;
  /** The anchors it spends: one, or a parent attempt's output and the general anchor */
  readonly anchors: readonly OutRef[];
  /** The parent attempts (`txHash`) whose outputs it spends; absent when none */
  readonly dependsOn?: readonly string[];
  /** The key hashes that must sign: `BuiltTxData.signers.keyHashes` */
  readonly keys: readonly string[];
  /** The witnesses collected, at most one per key hash, never replaced */
  readonly witnesses: readonly Witness[];
  /** How many of the recorded deliveries (`sends`) the submitter refused */
  readonly refused: number;
  /** It runs a Plutus script, so a find without a validity answer says nothing */
  readonly plutus?: true;
};

/**
 * The record as the state machine reads and writes it, in memory: the parts as `TxPart`s and the
 * transactions as `BuiltTxData`s, with their `bigint`s. `encodePlan` gives its `TxPlanJSON`
 */
export type PlanRecord = Omit<TxPlanJSON, "attempts" | "anchor"> & {
  readonly attempts: readonly AttemptRecord[];
  readonly anchor: AnchorRecord;
};

/** The provider's tip: its slot, the POSIX ms that slot starts at, and its height when known */
export type Tip = {
  readonly slot: number;
  readonly timeMs: number;
  readonly height?: number;
};

/**
 * What a fresh search said about one attempt of this plan. `valid` absent: the search did not
 * say whether the transaction's scripts passed. An attempt with no sighting is unknown.
 */
export type Sighting =
  | {
      readonly txHash: string;
      readonly found: true;
      readonly slot: number;
      readonly block?: string;
      readonly blockHeight?: number;
      readonly valid?: boolean;
    }
  | { readonly txHash: string; readonly found: false };

/** What this plan's own search said about a parent attempt; `valid` absent: not known */
export type ParentSighting =
  | { readonly txHash: string; readonly found: true; readonly valid?: boolean }
  | { readonly txHash: string; readonly found: false };

/** A fact the state machine applies to a record */
export type TxPlanEvent =
  /**
   * A new attempt was built, spending the anchors named. `tipTimeMs`: the time of the tip the
   * build was made at, when it was read
   */
  | {
      readonly type: "build";
      readonly built: BuiltTxData;
      readonly anchors: readonly {
        readonly utxo: Utxo;
        readonly kind: AnchorKind;
      }[];
      readonly parents?: NonNullable<TxAttempt["parents"]>;
      readonly tipTimeMs?: number;
    }
  /** Witnesses that were checked against the body of this attempt */
  | {
      readonly type: "signature";
      readonly txHash: string;
      readonly witnesses: readonly Witness[];
    }
  /** The attempt is about to be delivered; applied and written before the bytes leave */
  | { readonly type: "delivery"; readonly txHash: string }
  /** The submitter's answer to a recorded delivery of this attempt */
  | {
      readonly type: "answer";
      readonly txHash: string;
      readonly refused: boolean;
      /** Accepted, with another hash than `txHash`; already normalised */
      readonly reportedHash?: string;
      /**
       * Refused: a fresh search found every parent attempt this attempt names in a block, whatever
       * their validity. Absent: not found
       */
      readonly parentsInBlock?: boolean;
    }
  /** What one observation of the chain showed. What is absent is unknown */
  | {
      readonly type: "observation";
      readonly tip?: Tip;
      readonly attempts?: readonly Sighting[];
      readonly parents?: readonly ParentSighting[];
      /** Anchors a fresh read of their address showed unspent */
      readonly anchorsInPlace?: readonly OutRef[];
    }
  /** The decision to close the plan */
  | { readonly type: "closing" }
  /** The closing check passed: no attempt will land */
  | { readonly type: "closed" };

/** Why an event is refused */
export type Refusal =
  /** The plan is final or abandoned */
  | "terminal"
  /** A build, signature or delivery on a plan that is being closed */
  | "closing"
  /** The event is not allowed in the plan's status */
  | "status"
  /** The plan already holds the most attempts it may */
  | "tooManyAttempts"
  /** The event names an attempt that is not the current one, or not one of the plan's */
  | "staleAttempt"
  /** The new attempt does not spend an anchor it must spend, or names one it may not take */
  | "anchor"
  /** The new attempt stands on other parent plans than the first one */
  | "parents"
  /** The built transaction cannot be a new attempt: no deadline, or a hash the plan has */
  | "attempt";

/** The answer of the state machine: the next record, or why the event was refused */
export type Advanced =
  /** Accepted; `json` is the very record given when nothing changed */
  | { readonly ok: true; readonly json: PlanRecord }
  /** Refused; the record stays as it was */
  | { readonly ok: false; readonly reason: Refusal; readonly message: string };

const DEAD: ReadonlySet<TxAttemptStatus> = new Set([
  "expired",
  "failed",
  "orphaned",
]);
const UNLANDED: ReadonlySet<TxAttemptStatus> = new Set([
  "built",
  "signed",
  "sent",
  "rejected",
]);

const isDead = (attempt: AttemptRecord) => DEAD.has(attempt.status);

const refKey = (ref: Readonly<OutRef>) => `${ref.txHash}#${ref.outputIndex}`;

/** The out ref of a UTxO, with exactly the members `txHash` and `outputIndex` */
const outRef = (utxo: Readonly<OutRef>): OutRef => ({
  txHash: utxo.txHash,
  outputIndex: utxo.outputIndex,
});

const refuse = (reason: Refusal, message: string): Advanced => ({
  ok: false,
  reason,
  message,
});

/** A record with no attempt yet: status `draft`, revision 0, no anchor */
export const draftPlan = (
  init: Pick<TxPlanJSON, "id" | "network" | "deadlines" | "parts" | "options">,
): PlanRecord => ({
  kind: "TxPlan",
  version: 1,
  ...(init.id !== undefined && { id: init.id }),
  rev: 0,
  status: "draft",
  network: init.network,
  deadlines: init.deadlines,
  attempts: [],
  anchor: { anchors: [] },
  parts: init.parts,
  options: init.options,
});

/** The attempt built last */
export const currentAttempt = (json: PlanRecord): AttemptRecord | undefined =>
  json.attempts[json.attempts.length - 1];

/** The attempt that landed: the final one, else the first included one */
export const landedAttempt = (json: PlanRecord): AttemptRecord | undefined =>
  json.attempts.find((attempt) => attempt.status === "final") ??
  json.attempts.find((attempt) => attempt.status === "included");

const statusOf = (
  attempts: readonly AttemptRecord[],
  abandoned: boolean,
): TxPlanStatus => {
  if (abandoned) return "abandoned";
  if (attempts.some((attempt) => attempt.status === "final")) return "final";
  if (attempts.some((attempt) => attempt.status === "included"))
    return "included";
  return attempts[attempts.length - 1]?.status ?? "draft";
};

/**
 * The status of a plan: `abandoned` once closed; `final` or `included` when one of its
 * attempts is; else the status of its current attempt; `draft` before the first one.
 */
export const planStatus = (json: PlanRecord): TxPlanStatus =>
  statusOf(json.attempts, json.status === "abandoned");

/**
 * The attempts that landed or still may: all but the expired, failed and orphaned ones; in a
 * final plan the landed attempt alone, in an abandoned one none.
 */
export const liveAttempts = (json: PlanRecord): readonly AttemptRecord[] => {
  const status = planStatus(json);
  if (status === "abandoned") return [];
  if (status === "final") {
    const landed = landedAttempt(json);
    return landed === undefined ? [] : [landed];
  }
  return json.attempts.filter((attempt) => !isDead(attempt));
};

/**
 * The time after which none of the live attempts can land any more: the latest deadline plus the
 * plan's margin among them; undefined when no attempt is live. Whether it has passed is for the
 * tip's time to say.
 */
export const safeAfter = (json: PlanRecord): number | undefined => {
  const live = liveAttempts(json);
  if (live.length === 0) return undefined;
  return (
    Math.max(...live.map((attempt) => attempt.until)) +
    json.deadlines.expiryMarginMs
  );
};

/** The record with these attempts, its status worked out again and its revision one higher */
const next = (
  json: PlanRecord,
  changes: Partial<Pick<PlanRecord, "attempts" | "anchor" | "closing">>,
  abandoned = false,
): PlanRecord => {
  const attempts = changes.attempts ?? json.attempts;
  return {
    ...json,
    ...changes,
    rev: json.rev + 1,
    status: statusOf(attempts, abandoned || json.status === "abandoned"),
  };
};

const withoutBuilt = (attempt: AttemptRecord): AttemptRecord => {
  if (attempt.built === undefined) return attempt;
  const { built: _built, ...rest } = attempt;
  return rest;
};

const replaceAt = (
  attempts: readonly AttemptRecord[],
  index: number,
  attempt: AttemptRecord,
): AttemptRecord[] => attempts.map((each, i) => (i === index ? attempt : each));

const keysComplete = (keys: readonly string[], witnesses: readonly Witness[]) =>
  keys.every((key) => witnesses.some((w) => w.keyHash === key));

/**
 * Applies one event to a plan's record. The answer is the next record, with `status` worked
 * out again and `rev` one higher when anything changed, or the very record given when nothing
 * did; or a refusal, which changes nothing. The record and the event are never modified.
 */
export const advancePlan = (json: PlanRecord, event: TxPlanEvent): Advanced => {
  const status = planStatus(json);
  if (status === "final" || status === "abandoned")
    return refuse(
      "terminal",
      `the plan is ${status}: a terminal plan takes no event`,
    );
  if (
    json.closing === true &&
    (event.type === "build" ||
      event.type === "signature" ||
      event.type === "delivery")
  )
    return refuse(
      "closing",
      `the plan is being closed: it takes no ${event.type} any more`,
    );
  switch (event.type) {
    case "build":
      return build(json, status, event);
    case "signature":
      return signature(json, status, event);
    case "delivery":
      return delivery(json, status, event);
    case "answer":
      return answer(json, event);
    case "observation":
      return observe(json, event);
    case "closing":
      return closingMark(json, status);
    case "closed":
      return closed(json);
  }
};

type EventOf<T extends TxPlanEvent["type"]> = Extract<TxPlanEvent, { type: T }>;

/** The index of the current attempt when `txHash` names it, else a refusal */
const current = (
  json: PlanRecord,
  txHash: string,
  type: string,
): number | Advanced => {
  const index = json.attempts.length - 1;
  if (index < 0 || json.attempts[index]!.txHash !== txHash)
    return refuse(
      "staleAttempt",
      `a ${type} must name the plan's current attempt, and ${txHash} is not it`,
    );
  return index;
};

const build = (
  json: PlanRecord,
  status: TxPlanStatus,
  event: EventOf<"build">,
): Advanced => {
  const { built } = event;
  const last = currentAttempt(json);
  const pastDeadline =
    last !== undefined &&
    event.tipTimeMs !== undefined &&
    event.tipTimeMs >= last.until;
  const allowed =
    status === "draft" ||
    status === "rejected" ||
    status === "expired" ||
    status === "orphaned" ||
    ((status === "built" || status === "signed") && pastDeadline);
  if (!allowed)
    return refuse(
      "status",
      `a new attempt is not allowed in status ${status}: only before the first attempt, after a refusal, an expiry or an orphaning, or once an unsent attempt is past its deadline`,
    );
  if (json.attempts.length >= MAX_ATTEMPTS)
    return refuse(
      "tooManyAttempts",
      `the plan already holds ${MAX_ATTEMPTS} attempts`,
    );

  const until = built.validity?.until;
  if (typeof until !== "number" || !Number.isFinite(until))
    return refuse(
      "attempt",
      "the built transaction has no deadline: every attempt needs one",
    );
  if (json.attempts.some((attempt) => attempt.txHash === built.txHash))
    return refuse("attempt", `the plan already has an attempt ${built.txHash}`);

  // The parent plans are those of the first attempt, position by position.
  const parents = event.parents ?? [];
  const first = json.attempts[0];
  if (first !== undefined) {
    const recorded = first.parents ?? [];
    if (
      recorded.length !== parents.length ||
      recorded.some((parent, i) => parent.planId !== parents[i]!.planId)
    )
      return refuse(
        "parents",
        "the new attempt stands on other parent plans than the plan's first attempt",
      );
  }

  const anchorRefusal = checkAnchors(json, event, parents.length > 0);
  if (anchorRefusal !== undefined) return anchorRefusal;

  const parentHashes = new Set(parents.map((parent) => parent.txHash));
  const dependsOn = [
    ...new Set(
      built.inputs
        .map((input) => input.txHash)
        .filter((txHash) => parentHashes.has(txHash)),
    ),
  ];
  const keys = [...built.signers.keyHashes];
  const attempt: AttemptRecord = {
    txHash: built.txHash,
    status: keys.length === 0 ? "signed" : "built",
    until,
    sends: 0,
    ...(parents.length > 0 && {
      parents: parents.map((parent) => ({ ...parent })),
    }),
    built,
    anchors: event.anchors.map((anchor) => outRef(anchor.utxo)),
    ...(dependsOn.length > 0 && { dependsOn }),
    keys,
    witnesses: [],
    refused: 0,
    ...(built.redeemers.length > 0 && { plutus: true as const }),
  };

  const entries = [...json.anchor.anchors];
  for (const anchor of event.anchors) {
    const key = refKey(outRef(anchor.utxo));
    const at = entries.findIndex((entry) => refKey(outRef(entry.utxo)) === key);
    if (at < 0)
      entries.push({
        utxo: anchor.utxo,
        kind: anchor.kind,
        attempts: [built.txHash],
      });
    else
      entries[at] = {
        ...entries[at]!,
        attempts: [...entries[at]!.attempts, built.txHash],
      };
  }
  return {
    ok: true,
    json: next(json, {
      attempts: [...json.attempts, attempt],
      anchor: { anchors: entries },
    }),
  };
};

/** The anchor rules of a build event; undefined when they hold */
const checkAnchors = (
  json: PlanRecord,
  event: EventOf<"build">,
  hasParentsInEvent: boolean,
): Advanced | undefined => {
  const { built, anchors } = event;
  const first = json.attempts[0];
  const hasParents =
    first !== undefined ? (first.parents ?? []).length > 0 : hasParentsInEvent;
  const general = anchors.filter((anchor) => anchor.kind !== "parent");
  const parent = anchors.filter((anchor) => anchor.kind === "parent");
  if (anchors.length === 0)
    return refuse(
      "anchor",
      "every attempt spends an anchor, and none is named",
    );
  if (general.length > 1 || parent.length > 1)
    return refuse(
      "anchor",
      "an attempt spends at most one general anchor and at most one parent output as anchors",
    );
  if (!hasParents && (anchors.length !== 1 || general.length !== 1))
    return refuse(
      "anchor",
      "a plan without parents anchors each attempt on one input of the payer or the parts",
    );

  const inputs = new Set(built.inputs.map((input) => refKey(outRef(input))));
  for (const anchor of anchors)
    if (!inputs.has(refKey(outRef(anchor.utxo))))
      return refuse(
        "anchor",
        `the anchor ${refKey(outRef(anchor.utxo))} is not an input of the attempt`,
      );
  const parentHashes = new Set((event.parents ?? []).map((p) => p.txHash));
  for (const anchor of parent)
    if (!parentHashes.has(anchor.utxo.txHash))
      return refuse(
        "anchor",
        `the anchor ${refKey(outRef(anchor.utxo))} is not an output of a parent attempt of the new attempt`,
      );

  // While an earlier attempt may still land, every new attempt spends its anchors too.
  for (const attempt of json.attempts) {
    if (isDead(attempt)) continue;
    for (const ref of attempt.anchors)
      if (!inputs.has(refKey(ref)))
        return refuse(
          "anchor",
          `the attempt ${attempt.txHash} may still land, and the new attempt does not spend its anchor ${refKey(ref)}`,
        );
  }

  // Once an attempt has a general anchor, every later one spends it. Only the payer's anchor of
  // a plan without parents gives way, and only once no earlier attempt can land.
  const kinds = new Map(
    json.anchor.anchors.map((entry) => [
      refKey(outRef(entry.utxo)),
      entry.kind,
    ]),
  );
  let recorded: { key: string; kind: AnchorKind } | undefined;
  for (const attempt of json.attempts)
    for (const ref of attempt.anchors) {
      const kind = kinds.get(refKey(ref));
      if (kind !== undefined && kind !== "parent")
        recorded = { key: refKey(ref), kind };
    }
  if (recorded !== undefined) {
    const named = general[0];
    const same =
      named !== undefined && refKey(outRef(named.utxo)) === recorded.key;
    const mayChange =
      !hasParents && recorded.kind === "payer" && json.attempts.every(isDead);
    if (!same && !mayChange)
      return refuse(
        "anchor",
        `the new attempt must spend the plan's anchor ${recorded.key}`,
      );
  }
  return undefined;
};

const signature = (
  json: PlanRecord,
  status: TxPlanStatus,
  event: EventOf<"signature">,
): Advanced => {
  const index = current(json, event.txHash, "signature");
  if (typeof index !== "number") return index;
  if (
    status !== "built" &&
    status !== "signed" &&
    status !== "sent" &&
    status !== "rejected"
  )
    return refuse(
      "status",
      `an attempt takes signatures only before it is in a block, and the plan is ${status}`,
    );
  const attempt = json.attempts[index]!;
  const witnesses = [...attempt.witnesses];
  for (const witness of event.witnesses)
    if (!witnesses.some((held) => held.keyHash === witness.keyHash))
      witnesses.push({ keyHash: witness.keyHash, witness: witness.witness });
  if (witnesses.length === attempt.witnesses.length) return { ok: true, json };
  const signed =
    (attempt.status === "built" || attempt.status === "rejected") &&
    keysComplete(attempt.keys, witnesses);
  const updated: AttemptRecord = {
    ...attempt,
    witnesses,
    ...(signed && { status: "signed" as const }),
  };
  return {
    ok: true,
    json: next(json, { attempts: replaceAt(json.attempts, index, updated) }),
  };
};

const delivery = (
  json: PlanRecord,
  status: TxPlanStatus,
  event: EventOf<"delivery">,
): Advanced => {
  const index = current(json, event.txHash, "delivery");
  if (typeof index !== "number") return index;
  if (status !== "signed")
    return refuse(
      "status",
      `only a fully signed attempt is delivered, and the plan is ${status}`,
    );
  const attempt = json.attempts[index]!;
  const updated: AttemptRecord = {
    ...attempt,
    status: "sent",
    sends: attempt.sends + 1,
  };
  return {
    ok: true,
    json: next(json, { attempts: replaceAt(json.attempts, index, updated) }),
  };
};

const answer = (json: PlanRecord, event: EventOf<"answer">): Advanced => {
  const index = json.attempts.findIndex(
    (attempt) => attempt.txHash === event.txHash,
  );
  if (index < 0)
    return refuse(
      "staleAttempt",
      `the plan has no attempt ${event.txHash} to answer for`,
    );
  const attempt = json.attempts[index]!;
  if (attempt.refused >= attempt.sends)
    return refuse(
      "status",
      `the attempt ${attempt.txHash} has no recorded delivery left to answer`,
    );
  let updated: AttemptRecord;
  if (event.refused) {
    const refused = attempt.refused + 1;
    // A refusal proves nothing while an earlier delivery was not refused, nor for a child whose
    // parent attempts are not all in a block yet.
    const rejected =
      attempt.status === "sent" &&
      refused === attempt.sends &&
      ((attempt.parents ?? []).length === 0 || event.parentsInBlock === true);
    updated = {
      ...attempt,
      refused,
      ...(rejected && { status: "rejected" as const }),
    };
  } else {
    if (event.reportedHash === undefined || attempt.reportedHash !== undefined)
      return { ok: true, json };
    updated = { ...attempt, reportedHash: event.reportedHash };
  }
  return {
    ok: true,
    json: next(json, { attempts: replaceAt(json.attempts, index, updated) }),
  };
};

/** The depth of a found block over the tip, when both heights are sound; else undefined */
const depthOf = (
  tip: Tip | undefined,
  sighting: Extract<Sighting, { found: true }>,
): number | undefined => {
  if (tip === undefined) return undefined;
  const { height } = tip;
  const { blockHeight } = sighting;
  if (
    height === undefined ||
    blockHeight === undefined ||
    !Number.isInteger(height) ||
    !Number.isInteger(blockHeight) ||
    height < 0 ||
    blockHeight < 0
  )
    return undefined;
  const depth = height - blockHeight;
  // A slot holds at most one block, so a depth above the slot difference means the heights lie.
  if (depth < 0 || depth > tip.slot - sighting.slot) return undefined;
  return depth;
};

const seenOf = (sighting: Extract<Sighting, { found: true }>) => ({
  slot: sighting.slot,
  ...(sighting.block !== undefined && { block: sighting.block }),
});

const withSeen = (
  attempt: AttemptRecord,
  status: TxAttemptStatus,
  sighting: Extract<Sighting, { found: true }>,
): AttemptRecord => ({ ...attempt, status, seen: seenOf(sighting) });

/** What the attempt's own sighting, the tip and the anchors in place make of it */
const byOwnFacts = (
  json: PlanRecord,
  attempt: AttemptRecord,
  event: EventOf<"observation">,
  inPlace: ReadonlySet<string>,
): AttemptRecord => {
  if (attempt.status === "failed" || attempt.status === "final") return attempt;
  const { tip } = event;
  const sighting = event.attempts?.find(
    (each) => each.txHash === attempt.txHash,
  );
  const pastMargin =
    tip !== undefined &&
    tip.timeMs >= attempt.until + json.deadlines.expiryMarginMs;

  if (sighting?.found === true) {
    const valid = sighting.valid ?? (attempt.plutus ? undefined : true);
    if (valid === undefined) return attempt;
    if (valid === false) {
      // An included attempt found invalid contradicts the earlier find: not a fact either way.
      if (attempt.status === "included") return attempt;
      return withSeen(attempt, "failed", sighting);
    }
    const depth = depthOf(tip, sighting);
    const final = depth !== undefined && depth >= json.deadlines.confirmations;
    const updated = withSeen(attempt, final ? "final" : "included", sighting);
    const unchanged =
      updated.status === attempt.status &&
      attempt.seen?.slot === updated.seen?.slot &&
      attempt.seen?.block === updated.seen?.block;
    return unchanged ? attempt : updated;
  }

  if (sighting?.found === false) {
    if (attempt.status === "included") {
      const { seen: _seen, ...rest } = attempt;
      return { ...rest, status: "sent" };
    }
    if (UNLANDED.has(attempt.status) && pastMargin)
      return { ...attempt, status: "expired" };
    return attempt;
  }

  if (
    UNLANDED.has(attempt.status) &&
    pastMargin &&
    attempt.anchors.some((ref) => inPlace.has(refKey(ref)))
  )
    return { ...attempt, status: "expired" };
  return attempt;
};

/** What this plan's search of the parent attempts makes of an attempt that spends their outputs */
const byParents = (
  json: PlanRecord,
  attempt: AttemptRecord,
  event: EventOf<"observation">,
): AttemptRecord => {
  const dependsOn = attempt.dependsOn ?? [];
  if (dependsOn.length === 0) return attempt;
  const sightingOf = (txHash: string) =>
    event.parents?.find((each) => each.txHash === txHash);

  if (UNLANDED.has(attempt.status)) {
    const { tip } = event;
    const dead = dependsOn.some((txHash) => {
      const sighting = sightingOf(txHash);
      if (sighting === undefined) return false;
      if (sighting.found) return sighting.valid === false;
      const until = attempt.parents?.find((p) => p.txHash === txHash)?.until;
      return (
        tip !== undefined &&
        until !== undefined &&
        tip.timeMs >= until + json.deadlines.expiryMarginMs
      );
    });
    return dead ? { ...attempt, status: "orphaned" } : attempt;
  }

  if (attempt.status === "orphaned") {
    // Live again once no parent attempt is dead by this search: each one is found valid, or not
    // found while the tip is still before its deadline and the margin. One of them at least is
    // found valid: a parent attempt found with is_valid = false and then rolled back is not
    // found, yet its bytes can only land invalid again
    const { tip } = event;
    const alive =
      dependsOn.every((txHash) => {
        const sighting = sightingOf(txHash);
        if (sighting === undefined) return false;
        if (sighting.found) return sighting.valid === true;
        const until = attempt.parents?.find((p) => p.txHash === txHash)?.until;
        return (
          tip !== undefined &&
          until !== undefined &&
          tip.timeMs < until + json.deadlines.expiryMarginMs
        );
      }) &&
      dependsOn.some((txHash) => {
        const sighting = sightingOf(txHash);
        return sighting?.found === true && sighting.valid === true;
      });
    if (!alive) return attempt;
    const status: TxAttemptStatus =
      attempt.sends > 0
        ? "sent"
        : keysComplete(attempt.keys, attempt.witnesses)
          ? "signed"
          : "built";
    return { ...attempt, status };
  }
  return attempt;
};

const observe = (json: PlanRecord, event: EventOf<"observation">): Advanced => {
  if (json.attempts.length === 0) return { ok: true, json };
  const inPlace = new Set((event.anchorsInPlace ?? []).map(refKey));
  // First each attempt's own facts; then, for an attempt they did not move, its parents.
  // One event moves an attempt by one rule at most.
  let attempts = json.attempts.map((attempt) => {
    const own = byOwnFacts(json, attempt, event, inPlace);
    return own.status !== attempt.status ? own : byParents(json, own, event);
  });

  // Once an attempt is final the others no longer change: the first final one is kept, every
  // other attempt stays as it was before this event.
  const finalAt = attempts.findIndex(
    (attempt, i) =>
      attempt.status === "final" && json.attempts[i]!.status !== "final",
  );
  if (finalAt >= 0)
    attempts = json.attempts.map((attempt, i) =>
      i === finalAt ? attempts[i]! : withoutBuilt(attempt),
    );

  if (attempts.every((attempt, i) => attempt === json.attempts[i]))
    return { ok: true, json };
  return { ok: true, json: next(json, { attempts }) };
};

const closingMark = (json: PlanRecord, status: TxPlanStatus): Advanced => {
  if (status === "included")
    return refuse(
      "status",
      "an attempt of the plan is in a block: the plan has paid and is not closed",
    );
  if (status === "draft")
    return {
      ok: true,
      json: next(json, { closing: true, attempts: [] }, true),
    };
  if (json.closing === true) return { ok: true, json };
  return { ok: true, json: next(json, { closing: true }) };
};

const closed = (json: PlanRecord): Advanced => {
  if (json.closing !== true)
    return refuse(
      "status",
      "only a plan with the decision to close recorded is closed",
    );
  if (json.attempts.length === 0 || !json.attempts.every(isDead))
    return refuse(
      "status",
      "an attempt of the plan may still land: it is closed only once every attempt is expired, failed or orphaned",
    );
  const last = json.attempts.length - 1;
  const attempts = json.attempts.map((attempt, i) =>
    i === last ? attempt : withoutBuilt(attempt),
  );
  return { ok: true, json: next(json, { attempts }, true) };
};
