import type { UTxO } from "@meshsdk/common";

import type { TxIntentStatus } from "../../../src/tx-builder";
import type { OutRef } from "../../../src/tx-builder/parts/types";
import {
  Advanced,
  advanceIntent,
  AnchorKind,
  AttemptRecord,
  IntentRecord,
  landedAttempt,
  MAX_ATTEMPTS,
  ParentSighting,
  Sighting,
  TxIntentEvent,
} from "../../../src/tx-builder/intent/core";
import {
  builtTx,
  deepFreeze,
  draft,
  hash,
  keyHash,
  Random,
  seeded,
  utxo,
} from "./intent-util";

// Random sequences of events. A failing run names its seed; `INTENT_SEED=<seed>` in the
// environment repeats that seed alone, in each of the tests.

/**
 * Runs of the model chain. A slip that needs a deep fork at the right moment shows up only in a
 * few thousand runs; `INTENT_MODEL_SEEDS` searches further.
 */
const MODEL_SEEDS = Number(process.env.INTENT_MODEL_SEEDS ?? 3000);
const ONLY_SEED = process.env.INTENT_SEED;
/** Seeds 1 to `count`, or the one seed `INTENT_SEED` names */
const seeds = (count: number) =>
  ONLY_SEED !== undefined
    ? [Number(ONLY_SEED)]
    : Array.from({ length: count }, (_, i) => i + 1);

const K = [keyHash(1), keyHash(2), keyHash(9)];
const PAYERS = [0xf0, 0xf1, 0xf2].map((n) => utxo(hash(n), 0));
const PARTS = utxo(hash(0xe0), 0);
const PARENT_INTENT = "parent";

const refKey = (ref: OutRef) => `${ref.txHash}#${ref.outputIndex}`;
const DEAD = new Set<string>(["expired", "failed", "orphaned"]);
const isDead = (attempt: AttemptRecord) => DEAD.has(attempt.status);
const UNLANDED = new Set<string>(["built", "signed", "sent", "rejected"]);

class Violation extends Error {}
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Violation(message);
};

/** Runs `run` for every seed and fails with the seed and the message of the first violation */
const forEverySeed = (list: readonly number[], run: (seed: number) => void) => {
  for (const seed of list) {
    try {
      run(seed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`seed ${seed}: ${message}`);
    }
  }
};

const subset = <T>(r: Random, items: readonly T[], p = 0.5) =>
  items.filter(() => r.chance(p));

/** The status the rules give a record's attempts, worked out apart from the state machine */
const expectedStatus = (
  attempts: readonly AttemptRecord[],
  abandoned: boolean,
): TxIntentStatus => {
  if (abandoned) return "abandoned";
  if (attempts.some((a) => a.status === "final")) return "final";
  if (attempts.some((a) => a.status === "included")) return "included";
  return attempts.at(-1)?.status ?? "draft";
};

const generalAnchors = (json: IntentRecord, attempt: AttemptRecord) => {
  const kinds = new Map(
    json.anchor.anchors.map((e) => [refKey(e.utxo.input), e.kind]),
  );
  return attempt.anchors
    .map(refKey)
    .filter(
      (key) => kinds.get(key) !== undefined && kinds.get(key) !== "parent",
    );
};

/** The general anchor of the latest attempt that has one, as a UTxO and its kind */
const recordedGeneral = (
  json: IntentRecord,
): { utxo: UTxO; kind: AnchorKind } | undefined => {
  for (const attempt of [...json.attempts].reverse()) {
    const [key] = generalAnchors(json, attempt);
    if (key !== undefined) {
      const entry = json.anchor.anchors.find(
        (e) => refKey(e.utxo.input) === key,
      )!;
      return { utxo: entry.utxo, kind: entry.kind };
    }
  }
  return undefined;
};

/**
 * What the tests check after every step, whatever the event: the bookkeeping the test keeps about
 * the record, and the record's own properties.
 */
class Watch {
  /** The inputs of each attempt, as its build event gave them */
  inputs = new Map<string, Set<string>>();
  /** For each attempt, the earlier attempts that were expired, failed or orphaned when it was added */
  deadAtAdd = new Map<string, Set<string>>();
  abandoned = false;

  step(before: IntentRecord, event: TxIntentEvent, result: Advanced) {
    const status = before.status;
    if (status === "final" || status === "abandoned") {
      check(
        !result.ok && result.reason === "terminal",
        `a ${event.type} on a ${status} intent was not refused as terminal`,
      );
      return;
    }
    if (!result.ok) return;
    const after = result.json;
    if (after === before) return;
    check(after.rev === before.rev + 1, "the revision did not grow by one");

    // The decision to close stops the intent: no new attempt, signature or delivery.
    if (before.closing) {
      check(after.closing === true, "the closing mark was removed");
      check(
        after.attempts.length === before.attempts.length,
        "an attempt was added after the closing mark",
      );
      before.attempts.forEach((attempt, i) => {
        const now = after.attempts[i]!;
        check(now.sends === attempt.sends, "a delivery after the closing mark");
        check(
          now.witnesses.length === attempt.witnesses.length,
          "a witness after the closing mark",
        );
      });
    }
    if (!before.closing && after.closing)
      check(
        event.type === "closing" && status !== "included",
        `the closing mark appeared by a ${event.type} in ${status}`,
      );

    // A new attempt only where one is allowed.
    if (after.attempts.length !== before.attempts.length) {
      check(event.type === "build", `an attempt was added by a ${event.type}`);
      check(
        after.attempts.length === before.attempts.length + 1,
        "more than one attempt was added",
      );
      const current = before.attempts.at(-1);
      const tip = event.type === "build" ? event.tipTimeMs : undefined;
      check(
        status === "draft" ||
          status === "rejected" ||
          status === "expired" ||
          status === "orphaned" ||
          ((status === "built" || status === "signed") &&
            tip !== undefined &&
            current !== undefined &&
            tip >= current.until),
        `a new attempt was added in ${status}`,
      );
      if (event.type === "build") {
        const added = after.attempts.at(-1)!;
        this.inputs.set(
          added.txHash,
          new Set(event.built.inputs.map((u) => refKey(u.input))),
        );
        this.deadAtAdd.set(
          added.txHash,
          new Set(before.attempts.filter(isDead).map((a) => a.txHash)),
        );
      }
    }

    // Terminal statuses come from their own events only.
    if (after.status === "abandoned") {
      check(
        (event.type === "closing" && status === "draft") ||
          event.type === "closed",
        `abandoned by a ${event.type} in ${status}`,
      );
      this.abandoned = true;
    }
    if (after.status === "final")
      check(event.type === "observation", `final by a ${event.type}`);
    check(
      after.status === expectedStatus(after.attempts, this.abandoned),
      `status ${after.status}, while the attempts give ${expectedStatus(after.attempts, this.abandoned)}`,
    );

    // An attempt expires only from an observation past its deadline and the margin: on a
    // not-found answer, or with no answer and one of its own anchors in place.
    before.attempts.forEach((was, i) => {
      const now = after.attempts[i]!;
      if (now.status !== "expired" || was.status === "expired") return;
      const observation = event.type === "observation" ? event : undefined;
      const tip = observation?.tip;
      const sighting = observation?.attempts?.find(
        (each) => each.txHash === now.txHash,
      );
      const inPlace = new Set((observation?.anchorsInPlace ?? []).map(refKey));
      check(
        UNLANDED.has(was.status) &&
          tip !== undefined &&
          tip.timeMs >= now.until + before.deadlines.expiryMarginMs &&
          (sighting?.found === false ||
            (sighting === undefined &&
              now.anchors.some((ref) => inPlace.has(refKey(ref))))),
        `${now.txHash.slice(-4)} expired from ${was.status} by a ${event.type} without its grounds`,
      );
    });

    this.record(after);
  }

  /** The properties of the record itself */
  record(json: IntentRecord) {
    const { attempts } = json;
    check(attempts.length <= MAX_ATTEMPTS, "more than 16 attempts");
    // Every later attempt spends the anchors of each earlier one that could still land.
    attempts.forEach((later, k) => {
      const inputs = this.inputs.get(later.txHash)!;
      for (const earlier of attempts.slice(0, k))
        if (!this.deadAtAdd.get(later.txHash)!.has(earlier.txHash))
          for (const ref of earlier.anchors)
            check(
              inputs.has(refKey(ref)),
              `${later.txHash.slice(-4)} does not spend the anchor of the live ${earlier.txHash.slice(-4)}`,
            );
    });
    const first = attempts[0];
    if (first === undefined) return;
    const ids = (a: AttemptRecord) =>
      JSON.stringify((a.parents ?? []).map((p) => p.intentId ?? null));
    for (const attempt of attempts)
      check(ids(attempt) === ids(first), "attempts on other parent intents");
    if ((first.parents ?? []).length > 0) {
      let general: string | undefined;
      for (const attempt of attempts) {
        const [own] = generalAnchors(json, attempt);
        if (general !== undefined)
          check(own === general, "a child's general anchor changed");
        general ??= own;
      }
    }
  }
}

describe("intent state machine: arbitrary sequences of events", () => {
  const PARENT_ATTEMPTS = [0x100, 0x101, 0x102].map(hash);

  const randomEvent = (
    r: Random,
    json: IntentRecord,
    child: boolean,
    fresh: () => string,
  ): TxIntentEvent => {
    const known = json.attempts.map((a) => a.txHash);
    const someHash = () =>
      known.length > 0 && r.chance(0.9) ? r.pick(known) : hash(0xdead);
    const current = () =>
      known.length > 0 && r.chance(0.85) ? known.at(-1)! : someHash();
    const roll = r.next();

    if (roll < 0.25) {
      const parent = r.pick(PARENT_ATTEMPTS);
      const until = r.int(40) * 50_000;
      let parents: { txHash: string; until: number; intentId?: string }[];
      const variant = r.next();
      if (child && variant < 0.85)
        parents = [{ txHash: parent, until, intentId: PARENT_INTENT }];
      else if (variant < 0.9)
        parents = [{ txHash: parent, until, intentId: "other" }];
      else if (variant < 0.94) parents = [{ txHash: parent, until }];
      else if (variant < 0.97)
        parents = [
          { txHash: parent, until, intentId: PARENT_INTENT },
          { txHash: hash(0x200), until, intentId: "second" },
        ];
      else parents = [];
      const parentOut = {
        utxo: utxo(r.chance(0.9) ? parent : r.pick(PARENT_ATTEMPTS), 0),
        kind: "parent" as const,
      };
      const recorded = recordedGeneral(json);
      const general =
        recorded !== undefined && r.chance(0.6)
          ? recorded
          : r.chance(0.8)
            ? { utxo: r.pick(PAYERS), kind: "payer" as const }
            : { utxo: PARTS, kind: "parts" as const };
      const shape = r.next();
      const anchors =
        shape < 0.03
          ? []
          : shape < 0.06
            ? [general, { utxo: r.pick(PAYERS), kind: "parts" as const }]
            : shape < 0.09
              ? [parentOut, { utxo: utxo(parent, 1), kind: "parent" as const }]
              : child && shape < 0.4
                ? [parentOut]
                : child && shape < 0.7
                  ? [parentOut, general]
                  : [general];
      const inputs = new Map(
        anchors.map((a) => [refKey(a.utxo.input), a.utxo]),
      );
      if (r.chance(0.7))
        for (const attempt of json.attempts)
          for (const ref of attempt.anchors)
            inputs.set(refKey(ref), utxo(ref.txHash, ref.outputIndex));
      if (r.chance(0.1)) inputs.delete(r.pick([...inputs.keys(), "none"]));
      const txHash = r.chance(0.1) ? someHash() : fresh();
      return {
        type: "build",
        built: builtTx({
          txHash,
          inputs: [...inputs.values()],
          keys: subset(r, K.slice(0, 2)),
          until: r.chance(0.04) ? undefined : r.int(40) * 50_000,
          plutus: r.chance(0.5),
        }),
        anchors,
        ...(parents.length > 0 && { parents }),
        ...(r.chance(0.6) && { tipTimeMs: r.int(40) * 50_000 }),
      };
    }
    if (roll < 0.4)
      return {
        type: "signature",
        txHash: current(),
        witnesses: subset(r, K).map((key) => ({ keyHash: key, witness: key })),
      };
    if (roll < 0.52) return { type: "delivery", txHash: current() };
    if (roll < 0.64)
      return {
        type: "answer",
        txHash: someHash(),
        refused: r.chance(0.6),
        ...(r.chance(0.6) && { parentsInBlock: r.chance(0.5) }),
        ...(r.chance(0.2) && { reportedHash: hash(0xbeef) }),
      };
    if (roll < 0.92) {
      const slot = r.int(2000);
      const sightings: Sighting[] = [];
      for (const txHash of [...known, hash(0xdead)])
        if (r.chance(0.6))
          sightings.push(
            r.chance(0.5)
              ? {
                  txHash,
                  found: true,
                  slot: r.int(slot + 1),
                  ...(r.chance(0.8) && { blockHeight: r.int(slot + 1) }),
                  ...(r.chance(0.7) && { valid: r.chance(0.8) }),
                }
              : { txHash, found: false },
          );
      const parents: ParentSighting[] = subset(r, PARENT_ATTEMPTS).map(
        (txHash) =>
          r.chance(0.5)
            ? {
                txHash,
                found: true,
                ...(r.chance(0.7) && { valid: r.chance(0.7) }),
              }
            : { txHash, found: false },
      );
      const anchors = json.anchor.anchors.map((e) => e.utxo.input);
      return {
        type: "observation",
        ...(r.chance(0.85) && {
          tip: {
            slot,
            timeMs: slot * 1000,
            ...(r.chance(0.8) && { height: slot - r.int(3) }),
          },
        }),
        attempts: sightings,
        ...(r.chance(0.7) && { parents }),
        ...(r.chance(0.6) && { anchorsInPlace: subset(r, anchors) }),
      };
    }
    if (roll < 0.96) return { type: "closing" };
    return { type: "closed" };
  };

  it("keeps every rule of the record on arbitrary events", () => {
    forEverySeed(seeds(500), (seed) => {
      const r = seeded(seed);
      const child = r.chance(0.5);
      let n = 0;
      const fresh = () => hash(0x1000 + seed * 1000 + n++);
      let json = deepFreeze(
        draft({ expiryMarginMs: r.int(5) * 25_000, confirmations: r.int(4) }),
      );
      const watch = new Watch();
      for (let step = 0; step < 80; step++) {
        const event = deepFreeze(randomEvent(r, json, child, fresh));
        let result: Advanced;
        try {
          result = advanceIntent(json, event);
        } catch (error) {
          throw new Error(`step ${step}: ${event.type} threw: ${error}`);
        }
        try {
          watch.step(json, event, result);
        } catch (error) {
          if (!(error instanceof Violation)) throw error;
          throw new Error(`step ${step}, ${event.type}: ${error.message}`);
        }
        if (result.ok) json = deepFreeze(result.json);
      }
    });
  });
});

/** A transaction of the model: what it spends, how many outputs it makes, and its fixed fate */
type Body = {
  readonly id: string;
  readonly inputs: readonly string[];
  readonly outputs: number;
  readonly until: number;
  /** The answer of the second phase of the ledger, fixed when the body is handed out */
  readonly valid: boolean;
  readonly plutus: boolean;
};

/**
 * A chain with a block in every slot, so that a block's height is its slot. Blocks hold bodies;
 * which outputs are unspent is worked out from them. Rollbacks stay where the deadlines of the
 * intent assume the chain settled: never a block at or below the top height less the depth, nor
 * one at or before the top time less the margin.
 */
class Ledger {
  readonly bodies = new Map<string, Body>();
  /** The bodies in the chain, in block order */
  chain: { id: string; slot: number; valid: boolean }[] = [];
  tip = 10;

  constructor(
    readonly genesis: readonly string[],
    readonly confirmations: number,
    readonly marginMs: number,
    /** How likely a parent attempt is to go into a block at `slot`, made at the tip or on a branch */
    readonly parentRate: (body: Body, slot: number, branch: boolean) => number,
  ) {}

  handOut(body: Body) {
    this.bodies.set(body.id, body);
  }

  unspent() {
    const set = new Set(this.genesis);
    for (const entry of this.chain) {
      if (!entry.valid) continue;
      const body = this.bodies.get(entry.id)!;
      for (const input of body.inputs) set.delete(input);
      for (let i = 0; i < body.outputs; i++) set.add(`${body.id}#${i}`);
    }
    return set;
  }

  entry(id: string) {
    return this.chain.find((e) => e.id === id);
  }

  /** Whether the body may go into a block at `slot`, at the end of the chain */
  allows(body: Body, slot: number, unspent = this.unspent()) {
    return (
      this.entry(body.id) === undefined &&
      slot * 1000 < body.until &&
      body.inputs.every((input) => unspent.has(input))
    );
  }

  /** Fills the blocks of these slots, in order, with bodies that try their luck */
  fill(r: Random, slots: readonly number[], branch: boolean) {
    for (const slot of slots) {
      const unspent = this.unspent();
      for (const body of this.bodies.values()) {
        const p =
          body.outputs === 2
            ? this.parentRate(body, slot, branch)
            : branch
              ? 0.35
              : 0.05;
        if (r.chance(p) && this.allows(body, slot, unspent)) {
          this.chain.push({ id: body.id, slot, valid: body.valid });
          if (body.valid) {
            for (const input of body.inputs) unspent.delete(input);
            for (let i = 0; i < body.outputs; i++)
              unspent.add(`${body.id}#${i}`);
          }
        }
      }
    }
  }

  forward(r: Random) {
    const from = this.tip + 1;
    this.tip += 1 + r.int(4);
    const slots = Array.from(
      { length: this.tip - from + 1 },
      (_, i) => from + i,
    );
    this.fill(r, slots, false);
  }

  rollBack(r: Random) {
    const keep = Math.max(
      this.tip - this.confirmations,
      Math.floor(this.tip - this.marginMs / 1000),
    );
    if (keep >= this.tip) return;
    const from = keep + r.int(this.tip - keep);
    this.chain = this.chain.filter((e) => e.slot <= from);
    const slots = Array.from(
      { length: this.tip - from },
      (_, i) => from + 1 + i,
    );
    // The other branch is filled eagerly: what the ledger allows there may well be in it.
    this.fill(r, slots, true);
  }

  tipOf() {
    return { slot: this.tip, timeMs: this.tip * 1000, height: this.tip };
  }
}

describe("intent state machine: one landing on a model chain", () => {
  it("never lets two attempts land, and closes or finishes only on what the chain shows", () => {
    forEverySeed(seeds(MODEL_SEEDS), (seed) => {
      const r = seeded(seed);
      const child = r.chance(0.5);
      // In some runs the driver rarely gets an answer about its own attempts, so that one may
      // land unseen and pass its deadline and the margin. Drawn apart from the rest of the run.
      const sightRate = seeded(seed + 0x9e37_79b9).chance(0.3) ? 0.15 : 0.8;
      const confirmations = r.chance(0.2) ? 0 : 1 + r.int(8);
      const marginMs = (r.chance(0.2) ? 0 : 1 + r.int(10)) * 1000;
      const parentInput = `${hash(0xd0)}#0`;
      const ledger = new Ledger(
        [
          ...PAYERS.map((u) => refKey(u.input)),
          refKey(PARTS.input),
          parentInput,
        ],
        confirmations,
        marginMs,
        // In half of the runs a parent attempt lands, if at all, in the last slots before its
        // deadline, so that it is still out when the child looks for it.
        r.chance(0.5)
          ? (body, slot) => (slot * 1000 >= body.until - 3000 ? 0.4 : 0.002)
          : (_body, _slot, branch) => (branch ? 0.35 : 0.03),
      );
      // The parent attempts: plain bodies that all spend one input, so at most one lands; one
      // or three of them.
      const parentAttempts: Body[] = child
        ? [0x100, 0x101, 0x102].slice(0, r.pick([1, 3])).map((n) => ({
            id: hash(n),
            inputs: [parentInput],
            outputs: 2,
            until: (20 + r.int(80)) * 1000,
            valid: r.chance(0.8),
            plutus: true,
          }))
        : [];
      for (const body of parentAttempts) ledger.handOut(body);

      let json = deepFreeze(
        draft({ ttlMs: 30_000, expiryMarginMs: marginMs, confirmations }),
      );
      const attemptBodies = new Map<string, Body>();
      /** Deliveries waiting for their answer */
      let pending: string[] = [];
      let n = 0;
      let others = 0;

      const buildEvent = (): TxIntentEvent => {
        const tipTime = ledger.tip * 1000;
        const parent = child ? r.pick(parentAttempts) : undefined;
        const parents =
          parent !== undefined
            ? [
                {
                  txHash: parent.id,
                  until: parent.until,
                  intentId: PARENT_INTENT,
                },
              ]
            : undefined;
        const recorded = recordedGeneral(json);
        const general =
          recorded !== undefined && r.chance(0.7)
            ? recorded
            : r.chance(0.8)
              ? { utxo: r.pick(PAYERS), kind: "payer" as const }
              : { utxo: PARTS, kind: "parts" as const };
        const parentOut =
          parent !== undefined
            ? { utxo: utxo(parent.id, 0), kind: "parent" as const }
            : undefined;
        const shape = r.next();
        const anchors =
          parentOut === undefined
            ? [general]
            : shape < 0.4
              ? [parentOut]
              : shape < 0.7
                ? [parentOut, general]
                : [general];
        const inputs = new Map(
          anchors.map((a) => [refKey(a.utxo.input), a.utxo]),
        );
        if (r.chance(0.8))
          for (const attempt of json.attempts)
            if (!isDead(attempt))
              for (const ref of attempt.anchors)
                inputs.set(refKey(ref), utxo(ref.txHash, ref.outputIndex));
        const plutus = r.chance(0.4);
        const txHash = hash(0x10_000 + n++);
        const until = tipTime + (1 + r.int(30)) * 1000;
        attemptBodies.set(txHash, {
          id: txHash,
          inputs: [...inputs.keys()],
          outputs: 1,
          until,
          valid: plutus ? r.chance(0.75) : true,
          plutus,
        });
        return {
          type: "build",
          built: builtTx({
            txHash,
            inputs: [...inputs.values()],
            keys: subset(r, K.slice(0, 2)),
            until,
            plutus,
          }),
          anchors,
          ...(parents !== undefined && { parents }),
          ...(r.chance(0.7) && { tipTimeMs: tipTime }),
        };
      };

      const observation = (): TxIntentEvent => {
        const tip = ledger.tipOf();
        const attempts: Sighting[] = [];
        for (const attempt of json.attempts) {
          if (!r.chance(sightRate)) continue;
          const entry = ledger.entry(attempt.txHash);
          const body = attemptBodies.get(attempt.txHash)!;
          attempts.push(
            entry === undefined
              ? { txHash: attempt.txHash, found: false }
              : {
                  txHash: attempt.txHash,
                  found: true,
                  slot: entry.slot,
                  ...(r.chance(0.9) && { blockHeight: entry.slot }),
                  ...(!(body.plutus && r.chance(0.3)) && {
                    valid: entry.valid,
                  }),
                },
          );
        }
        const named = new Set(
          json.attempts.flatMap((a) => (a.parents ?? []).map((p) => p.txHash)),
        );
        const parents: ParentSighting[] = [];
        for (const txHash of named) {
          if (!r.chance(0.7)) continue;
          const entry = ledger.entry(txHash);
          parents.push(
            entry === undefined
              ? { txHash, found: false }
              : {
                  txHash,
                  found: true,
                  ...(r.chance(0.7) && { valid: entry.valid }),
                },
          );
        }
        const unspent = ledger.unspent();
        const inPlace = json.anchor.anchors
          .map((e) => e.utxo.input)
          .filter((ref) => unspent.has(refKey(ref)) && r.chance(0.8));
        return {
          type: "observation",
          ...(r.chance(0.85) && {
            tip: r.chance(0.85) ? tip : { slot: tip.slot, timeMs: tip.timeMs },
          }),
          attempts,
          ...(r.chance(0.8) && { parents }),
          ...(r.chance(0.6) && { anchorsInPlace: inPlace }),
        };
      };

      const answer = (): TxIntentEvent | undefined => {
        if (pending.length === 0) return undefined;
        const txHash = r.pick(pending);
        pending = pending.filter((h) => h !== txHash);
        const body = attemptBodies.get(txHash)!;
        const attempt = json.attempts.find((a) => a.txHash === txHash)!;
        const now = ledger.allows(body, ledger.tip + 1);
        return {
          type: "answer",
          txHash,
          refused: !now || r.chance(0.25),
          parentsInBlock: (attempt.parents ?? []).every(
            (p) => ledger.entry(p.txHash) !== undefined,
          ),
        };
      };

      const driverEvent = (): TxIntentEvent | undefined => {
        const current = json.attempts.at(-1)?.txHash ?? hash(0xdead);
        const roll = r.next();
        if (roll < 0.2) return buildEvent();
        if (roll < 0.35)
          return {
            type: "signature",
            txHash: current,
            witnesses: subset(r, K, 0.6).map((key) => ({
              keyHash: key,
              witness: key,
            })),
          };
        if (roll < 0.47) return { type: "delivery", txHash: current };
        if (roll < 0.6) return answer();
        if (roll < 0.94) return observation();
        if (roll < 0.95) return { type: "closing" };
        return { type: "closed" };
      };

      const watch = new Watch();
      const verify = (step: number) => {
        const landedInChain = json.attempts.filter(
          (a) => ledger.entry(a.txHash)?.valid === true,
        );
        const where = `step ${step}, tip ${ledger.tip}, record ${json.status}`;
        check(
          landedInChain.length <= 1,
          `${where}: two attempts landed: ${landedInChain.map((a) => a.txHash.slice(-4))}`,
        );
        for (const attempt of json.attempts)
          if (isDead(attempt))
            check(
              ledger.entry(attempt.txHash)?.valid !== true,
              `${where}: the ${attempt.status} attempt ${attempt.txHash.slice(-4)} landed`,
            );
        if (json.status === "final") {
          const landed = landedAttempt(json);
          check(
            landed !== undefined && ledger.entry(landed.txHash)?.valid === true,
            `${where}: the final attempt is not in the chain`,
          );
        }
        if (json.status === "abandoned")
          check(
            landedInChain.length === 0,
            `${where}: an attempt of the abandoned intent landed`,
          );
      };

      for (let step = 0; step < 160; step++) {
        const roll = r.next();
        if (roll < 0.22) ledger.forward(r);
        else if (roll < 0.36) ledger.rollBack(r);
        else if (roll < 0.39) {
          // Someone else spends an anchor that is still unspent.
          const unspent = ledger.unspent();
          const candidates = [
            ...PAYERS.map((u) => refKey(u.input)),
            refKey(PARTS.input),
            ...parentAttempts.map((p) => `${p.id}#0`),
          ].filter((key) => unspent.has(key));
          if (candidates.length > 0) {
            const body: Body = {
              id: hash(0x90_000 + others++),
              inputs: [r.pick(candidates)],
              outputs: 1,
              until: Number.MAX_SAFE_INTEGER,
              valid: true,
              plutus: false,
            };
            ledger.handOut(body);
            ledger.tip += 1;
            if (ledger.allows(body, ledger.tip))
              ledger.chain.push({ id: body.id, slot: ledger.tip, valid: true });
          }
        } else {
          const event = driverEvent();
          if (event !== undefined) {
            deepFreeze(event);
            let result: Advanced;
            try {
              result = advanceIntent(json, event);
            } catch (error) {
              throw new Error(`step ${step}: ${event.type} threw: ${error}`);
            }
            try {
              watch.step(json, event, result);
            } catch (error) {
              if (!(error instanceof Violation)) throw error;
              throw new Error(`step ${step}, ${event.type}: ${error.message}`);
            }
            if (result.ok) {
              if (
                event.type === "build" &&
                result.json.attempts.length > json.attempts.length
              )
                ledger.handOut(attemptBodies.get(event.built.txHash)!);
              if (event.type === "delivery" && result.json !== json)
                pending.push(event.txHash);
              json = deepFreeze(result.json);
            }
          }
        }
        verify(step);
      }
    });
  });
});
