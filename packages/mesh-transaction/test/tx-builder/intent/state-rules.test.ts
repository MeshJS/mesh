import type { UTxO } from "@meshsdk/common";

import {
  advanceIntent,
  AnchorKind,
  AttemptRecord,
  currentAttempt,
  IntentRecord,
  landedAttempt,
  liveAttempts,
  MAX_ATTEMPTS,
  safeAfter,
  Sighting,
  TxIntentEvent,
} from "../../../src/tx-builder/intent/core";
import { reach, tipAt } from "./intent-states";
import {
  accept,
  acceptAll,
  attemptOf,
  buildEvent,
  builtTx,
  deepFreeze,
  draft,
  hash,
  keyHash,
  refusal,
  utxo,
  witness,
} from "./intent-util";

// An intent without parents, anchored on an input of the payer, unless a test says otherwise.

const ANCHOR = utxo(hash(0xf0), 0);
const OTHER = utxo(hash(0xf1), 0);
const UNTIL = 1_000_000;
const MARGIN = 100_000;
const K1 = keyHash(1);
const K2 = keyHash(2);
const KX = keyHash(9);
const A = (n: number) => hash(0xa0 + n);

const start = (deadlines: Partial<IntentRecord["deadlines"]> = {}) =>
  draft({ expiryMarginMs: MARGIN, confirmations: 3, ...deadlines });

const build = (
  txHash: string,
  spec: {
    anchor?: UTxO;
    kind?: AnchorKind;
    keys?: readonly string[];
    until?: number;
    tipTimeMs?: number;
    plutus?: boolean;
  } = {},
) =>
  buildEvent({
    txHash,
    anchors: [{ utxo: spec.anchor ?? ANCHOR, kind: spec.kind ?? "payer" }],
    keys: spec.keys ?? [K1],
    until: spec.until ?? UNTIL,
    ...(spec.tipTimeMs !== undefined && { tipTimeMs: spec.tipTimeMs }),
    plutus: spec.plutus,
  });

const sign = (txHash: string, ...keys: string[]): TxIntentEvent => ({
  type: "signature",
  txHash,
  witnesses: keys.map(witness),
});
const deliver = (txHash: string): TxIntentEvent => ({
  type: "delivery",
  txHash,
});
const refuse = (txHash: string, parentsInBlock?: boolean): TxIntentEvent => ({
  type: "answer",
  txHash,
  refused: true,
  ...(parentsInBlock !== undefined && { parentsInBlock }),
});
const accepted = (txHash: string, reportedHash?: string): TxIntentEvent => ({
  type: "answer",
  txHash,
  refused: false,
  ...(reportedHash !== undefined && { reportedHash }),
});

const found = (
  txHash: string,
  spec: { slot?: number; height?: number; valid?: boolean | null } = {},
): Sighting => ({
  txHash,
  found: true,
  slot: spec.slot ?? 900,
  blockHeight: spec.height ?? spec.slot ?? 900,
  ...(spec.valid !== null && { valid: spec.valid ?? true }),
});
const missing = (txHash: string): Sighting => ({ txHash, found: false });

const observe = (
  spec: Omit<Extract<TxIntentEvent, { type: "observation" }>, "type">,
): TxIntentEvent => ({ type: "observation", ...spec });

/** A tip at `timeMs` with no height */
const timeTip = (timeMs: number) => ({
  slot: Math.floor(timeMs / 1000),
  timeMs,
});

/** An attempt of A(n), signed and delivered */
const sentIntent = (
  json = start(),
  n = 1,
  spec: Parameters<typeof build>[1] = {},
) => acceptAll(json, build(A(n), spec), sign(A(n), K1), deliver(A(n)));

const statusOf = (json: IntentRecord, txHash: string) =>
  attemptOf(json, txHash).status;

const pastMargin = (until = UNTIL) => timeTip(until + MARGIN);

describe("intent state machine: the status of an intent", () => {
  it("is the status of the current attempt, unless one is in a block", () => {
    // A1 is refused, A2 is built on the same anchor and expires.
    let json = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2), { until: 1_200_000 }),
      sign(A(2), K1),
      deliver(A(2)),
      observe({ tip: pastMargin(1_200_000), attempts: [missing(A(2))] }),
    );
    expect(statusOf(json, A(1))).toBe("rejected");
    expect(json.status).toBe("expired");
    expect(liveAttempts(json).map((a) => a.txHash)).toEqual([A(1)]);

    json = accept(
      json,
      observe({ tip: tipAt(1300), attempts: [found(A(1), { slot: 1299 })] }),
    );
    expect(json.status).toBe("included");
    expect(landedAttempt(json)?.txHash).toBe(A(1));

    json = accept(json, observe({ attempts: [missing(A(1))] }));
    expect(json.status).toBe("expired");
    expect(landedAttempt(json)).toBeUndefined();
  });

  it("two attempts found at once below the depth are both included, the first one landed", () => {
    const json = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2)),
      sign(A(2), K1),
      deliver(A(2)),
      observe({
        tip: tipAt(901),
        attempts: [found(A(1)), found(A(2), { slot: 900 })],
      }),
    );
    expect(statusOf(json, A(1))).toBe("included");
    expect(statusOf(json, A(2))).toBe("included");
    expect(json.status).toBe("included");
    expect(landedAttempt(json)?.txHash).toBe(A(1));
  });
});

describe("intent state machine: order of the checks and the attempt an event names", () => {
  it("a build on an abandoned intent with the mark is terminal, not closing", () => {
    expect(refusal(reach("abandoned"), build(A(5)))).toBe("terminal");
  });

  it("a signature for a replaced attempt on an intent being closed is closing", () => {
    const json = acceptAll(sentIntent(), refuse(A(1)), build(A(2)), {
      type: "closing",
    });
    expect(refusal(json, sign(A(1), KX))).toBe("closing");
  });

  it("a delivery naming a replaced attempt is stale", () => {
    const json = acceptAll(
      start(),
      build(A(1), { keys: [] }),
      build(A(2), { keys: [], tipTimeMs: UNTIL }),
    );
    expect(refusal(json, deliver(A(1)))).toBe("staleAttempt");
    expect(refusal(json, sign(A(1), K1))).toBe("staleAttempt");
    expect(refusal(json, deliver(A(9)))).toBe("staleAttempt");
  });

  it("an answer to an unanswered delivery of a replaced attempt is applied", () => {
    const json = acceptAll(
      sentIntent(),
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
      build(A(2)),
    );
    expect(statusOf(json, A(1))).toBe("expired");
    const after = accept(json, refuse(A(1)));
    expect(attemptOf(after, A(1))).toMatchObject({
      status: "expired",
      refused: 1,
    });
    expect(refusal(json, refuse(A(9)))).toBe("staleAttempt");
  });

  it("a sighting of a hash the intent does not hold changes nothing", () => {
    const json = sentIntent();
    const result = advanceIntent(
      json,
      observe({
        tip: tipAt(2000),
        attempts: [found(A(9)), missing(A(8))],
      }),
    );
    expect(result.ok && result.json).toBe(json);
  });
});

describe("intent state machine: build", () => {
  it("a first build gives built when a key is needed, signed when none is", () => {
    const built = accept(start(), build(A(1)));
    expect(built.status).toBe("built");
    expect(built.rev).toBe(1);
    expect(currentAttempt(built)).toMatchObject({
      txHash: A(1),
      status: "built",
      until: UNTIL,
      sends: 0,
      keys: [K1],
      witnesses: [],
      anchors: [ANCHOR.input],
    });
    const signed = accept(start(), build(A(1), { keys: [] }));
    expect(signed.status).toBe("signed");
    expect(currentAttempt(signed)?.sends).toBe(0);
  });

  it("refuses a built transaction without a deadline, or with a hash the intent has", () => {
    const noDeadline = buildEvent({
      txHash: A(1),
      anchors: [{ utxo: ANCHOR, kind: "payer" }],
      until: undefined,
    });
    expect(refusal(start(), noDeadline)).toBe("attempt");
    const expired = acceptAll(
      sentIntent(),
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
    );
    expect(refusal(expired, build(A(1)))).toBe("attempt");
  });

  it(`holds ${MAX_ATTEMPTS} attempts and refuses one more`, () => {
    let json = start();
    for (let i = 1; i <= MAX_ATTEMPTS; i++)
      json = accept(json, build(A(i), { tipTimeMs: UNTIL }));
    expect(json.attempts).toHaveLength(MAX_ATTEMPTS);
    expect(
      refusal(json, build(A(MAX_ATTEMPTS + 1), { tipTimeMs: UNTIL })),
    ).toBe("tooManyAttempts");
  });

  it("builds over an unsent attempt only once the tip reached its deadline", () => {
    const json = accept(start(), build(A(1)));
    expect(refusal(json, build(A(2), { tipTimeMs: UNTIL - 1 }))).toBe("status");
    expect(refusal(json, build(A(2)))).toBe("status");
    const after = accept(json, build(A(2), { tipTimeMs: UNTIL }));
    expect(statusOf(after, A(1))).toBe("built");
    expect(liveAttempts(after).map((a) => a.txHash)).toEqual([A(1), A(2)]);
  });
});

describe("intent state machine: signatures", () => {
  it("records witnesses once per key and moves to signed when every key has one", () => {
    let json = accept(start(), build(A(1), { keys: [K1, K2] }));
    json = accept(json, {
      type: "signature",
      txHash: A(1),
      witnesses: [witness(K1), { keyHash: K1, witness: "other" }],
    });
    expect(json.status).toBe("built");
    expect(attemptOf(json, A(1)).witnesses).toEqual([witness(K1)]);

    const again = advanceIntent(json, {
      type: "signature",
      txHash: A(1),
      witnesses: [{ keyHash: K1, witness: "other" }],
    });
    expect(again.ok && again.json).toBe(json);

    json = accept(json, sign(A(1), K2));
    expect(json.status).toBe("signed");
    expect(attemptOf(json, A(1)).witnesses).toEqual([witness(K1), witness(K2)]);

    const replaced = accept(
      accept(start(), build(A(1), { keys: [K1, K2] })),
      build(A(2), { tipTimeMs: UNTIL, keys: [K1, K2] }),
    );
    expect(refusal(replaced, sign(A(1), K1))).toBe("staleAttempt");
  });

  it("a rejected attempt with every key is signed again only by a witness it did not hold", () => {
    const rejected = accept(sentIntent(), refuse(A(1)));
    expect(rejected.status).toBe("rejected");
    const nothingNew = advanceIntent(rejected, sign(A(1), K1));
    expect(nothingNew.ok && nothingNew.json).toBe(rejected);
    expect(accept(rejected, sign(A(1), KX)).status).toBe("signed");
  });
});

describe("intent state machine: deliveries and answers", () => {
  it("counts deliveries and turns sent into rejected when every one was refused", () => {
    let json = accept(sentIntent(), refuse(A(1)));
    expect(attemptOf(json, A(1))).toMatchObject({
      status: "rejected",
      sends: 1,
    });
    json = acceptAll(json, sign(A(1), KX), deliver(A(1)));
    expect(attemptOf(json, A(1))).toMatchObject({ status: "sent", sends: 2 });
    const acceptedJson = advanceIntent(json, accepted(A(1)));
    expect(acceptedJson.ok && acceptedJson.json.status).toBe("sent");
    json = accept(json, refuse(A(1)));
    expect(attemptOf(json, A(1))).toMatchObject({
      status: "rejected",
      sends: 2,
      refused: 2,
    });
  });

  it("a refusal while an earlier delivery has no refusal leaves the attempt sent", () => {
    // Recorded deliveries come only from signed, after every earlier one was refused, so no
    // sequence of events gives this record: it is written by hand.
    const base = accept(start(), build(A(1), { keys: [] }));
    const attempt: AttemptRecord = { ...base.attempts[0]!, sends: 1 };
    const json: IntentRecord = deepFreeze({ ...base, attempts: [attempt] });
    const after = acceptAll(json, deliver(A(1)), refuse(A(1)));
    expect(attemptOf(after, A(1))).toMatchObject({
      status: "sent",
      sends: 2,
      refused: 1,
    });
  });

  const P = hash(0x100);
  const parentOut = utxo(P, 0);
  const childParents = [{ txHash: P, until: 800_000, intentId: "parent" }];
  const childSent = (anchors: { utxo: UTxO; kind: AnchorKind }[]) =>
    acceptAll(
      start(),
      buildEvent({
        txHash: A(1),
        anchors,
        keys: [],
        parents: childParents,
      }),
      deliver(A(1)),
    );

  it.each([
    ["spends a parent output", [{ utxo: parentOut, kind: "parent" as const }]],
    [
      "is on a general anchor alone",
      [{ utxo: ANCHOR, kind: "payer" as const }],
    ],
  ])(
    "a refused child attempt that %s is rejected only with every parent in a block",
    (_name, anchors) => {
      const json = childSent(anchors);
      for (const event of [refuse(A(1), false), refuse(A(1))]) {
        const after = accept(json, event);
        expect(attemptOf(after, A(1))).toMatchObject({
          status: "sent",
          refused: 1,
        });
      }
      expect(statusOf(accept(json, refuse(A(1), true)), A(1))).toBe("rejected");
    },
  );

  it("an attempt without parents is rejected whatever the answer says of parents", () => {
    expect(statusOf(accept(sentIntent(), refuse(A(1), false)), A(1))).toBe(
      "rejected",
    );
  });

  it("writes the first reported hash and never replaces it", () => {
    const first = accept(sentIntent(), accepted(A(1), hash(0xbeef)));
    expect(attemptOf(first, A(1)).reportedHash).toBe(hash(0xbeef));
    const second = advanceIntent(first, accepted(A(1), hash(0xcafe)));
    expect(second.ok && second.json).toBe(first);
  });
});

describe("intent state machine: expiry", () => {
  it("expires an attempt not found once the tip is at its deadline and the margin", () => {
    const json = sentIntent();
    const before = advanceIntent(
      json,
      observe({ tip: timeTip(UNTIL + MARGIN - 1), attempts: [missing(A(1))] }),
    );
    expect(before.ok && before.json).toBe(json);
    expect(
      accept(json, observe({ tip: pastMargin(), attempts: [missing(A(1))] }))
        .status,
    ).toBe("expired");
    const noTip = advanceIntent(json, observe({ attempts: [missing(A(1))] }));
    expect(noTip.ok && noTip.json).toBe(json);

    const noMargin = sentIntent(start({ expiryMarginMs: 0 }));
    const atUntil = observe({ tip: timeTip(UNTIL), attempts: [missing(A(1))] });
    expect(accept(noMargin, atUntil).status).toBe("expired");
    const beforeUntil = advanceIntent(
      noMargin,
      observe({ tip: timeTip(UNTIL - 1), attempts: [missing(A(1))] }),
    );
    expect(beforeUntil.ok && beforeUntil.json).toBe(noMargin);
  });

  it("expires on a not-found answer, or on its own anchor in place with no answer", () => {
    const json = sentIntent();
    expect(
      accept(
        json,
        observe({ tip: pastMargin(), anchorsInPlace: [ANCHOR.input] }),
      ).status,
    ).toBe("expired");
    const otherAnchor = advanceIntent(
      json,
      observe({ tip: pastMargin(), anchorsInPlace: [OTHER.input] }),
    );
    expect(otherAnchor.ok && otherAnchor.json).toBe(json);
    expect(
      accept(
        json,
        observe({
          tip: tipAt((UNTIL + MARGIN) / 1000),
          attempts: [found(A(1), { slot: 1099 })],
          anchorsInPlace: [ANCHOR.input],
        }),
      ).status,
    ).toBe("included");
  });

  it("an anchor in place speaks only for the attempts that spend it", () => {
    // A1 on ANCHOR expired; A2 on a new payer anchor, OTHER, is delivered.
    const A2_UNTIL = 2 * UNTIL;
    const moved = acceptAll(
      sentIntent(),
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
      build(A(2), { anchor: OTHER, until: A2_UNTIL }),
      sign(A(2), K1),
      deliver(A(2)),
    );
    expect(statusOf(moved, A(1))).toBe("expired");
    // A1's anchor is still in place, and A2 does not spend it: A2 may have landed.
    const earlierAnchor = advanceIntent(
      moved,
      observe({ tip: pastMargin(A2_UNTIL), anchorsInPlace: [ANCHOR.input] }),
    );
    expect(earlierAnchor.ok && earlierAnchor.json).toBe(moved);
    const ownAnchor = accept(
      moved,
      observe({ tip: pastMargin(A2_UNTIL), anchorsInPlace: [OTHER.input] }),
    );
    expect(statusOf(ownAnchor, A(2))).toBe("expired");
  });
});

describe("intent state machine: depth", () => {
  const at = (
    tip: { slot: number; timeMs: number; height?: number },
    sighting: Sighting,
    confirmations = 3,
  ) =>
    accept(
      sentIntent(start({ confirmations })),
      observe({ tip, attempts: [sighting] }),
    ).status;

  it("is final at the depth and included below it", () => {
    expect(at(tipAt(902), found(A(1)))).toBe("included");
    expect(at(tipAt(903), found(A(1)))).toBe("final");
    expect(at(tipAt(900), found(A(1)), 0)).toBe("final");
  });

  it("declares no final on heights that are missing or unsound", () => {
    const deep = { slot: 1000, timeMs: 1_000_000 };
    expect(at(deep, found(A(1)))).toBe("included");
    expect(
      at(
        { ...deep, height: 1000 },
        { txHash: A(1), found: true, slot: 900, valid: true },
      ),
    ).toBe("included");
    // Fractional heights whose difference would reach the depth within the slot difference.
    expect(at({ ...deep, height: 903.5 }, found(A(1)))).toBe("included");
    expect(at({ ...deep, height: -1 }, found(A(1), { height: -5 }))).toBe(
      "included",
    );
    expect(at({ ...deep, height: 1000 }, found(A(1), { height: 996.5 }))).toBe(
      "included",
    );
    // Ten blocks in five slots.
    expect(
      at(
        { slot: 905, timeMs: 905_000, height: 910 },
        found(A(1), { slot: 900, height: 900 }),
      ),
    ).toBe("included");
  });

  it("the margin does not move final and the depth does not move expiry", () => {
    for (const expiryMarginMs of [0, MARGIN, 10 * MARGIN]) {
      const json = sentIntent(start({ expiryMarginMs }));
      expect(
        accept(json, observe({ tip: tipAt(902), attempts: [found(A(1))] }))
          .status,
      ).toBe("included");
      expect(
        accept(json, observe({ tip: tipAt(903), attempts: [found(A(1))] }))
          .status,
      ).toBe("final");
    }
    for (const confirmations of [0, 3, 100]) {
      const json = sentIntent(start({ confirmations }));
      const lost = (timeMs: number) =>
        accept(
          json,
          observe({ tip: timeTip(timeMs), attempts: [missing(A(1))] }),
        ).status;
      expect(lost(UNTIL + MARGIN - 1)).toBe("sent");
      expect(lost(UNTIL + MARGIN)).toBe("expired");
    }
  });
});

describe("intent state machine: validity of a find", () => {
  it("reads a Plutus attempt found without an answer on validity as unknown", () => {
    const json = sentIntent(start(), 1, { plutus: true });
    const unknown = advanceIntent(
      json,
      observe({ tip: tipAt(901), attempts: [found(A(1), { valid: null })] }),
    );
    expect(unknown.ok && unknown.json).toBe(json);
    const failed = accept(
      json,
      observe({ tip: tipAt(901), attempts: [found(A(1), { valid: false })] }),
    );
    expect(failed.status).toBe("failed");
    expect(attemptOf(failed, A(1)).seen).toEqual({ slot: 900 });
    expect(
      accept(
        sentIntent(),
        observe({ tip: tipAt(901), attempts: [found(A(1), { valid: null })] }),
      ).status,
    ).toBe("included");
  });

  it("an expired or orphaned attempt found invalid is failed", () => {
    for (const status of ["expired", "orphaned"] as const) {
      const after = accept(
        reach(status),
        observe({
          tip: tipAt(1200),
          attempts: [
            {
              txHash: hash(0xa1),
              found: true,
              slot: 950,
              block: "b",
              valid: false,
            },
          ],
        }),
      );
      expect(after.status).toBe("failed");
      expect(attemptOf(after, hash(0xa1)).seen).toEqual({
        slot: 950,
        block: "b",
      });
    }
  });

  it("an included attempt found invalid stays included, at the depth too", () => {
    const json = accept(
      sentIntent(),
      observe({ tip: tipAt(901), attempts: [found(A(1))] }),
    );
    for (const tip of [tipAt(901), tipAt(910)]) {
      const after = advanceIntent(
        json,
        observe({ tip, attempts: [found(A(1), { valid: false })] }),
      );
      expect(after.ok && after.json).toBe(json);
    }
  });
});

describe("intent state machine: rollback and late finds", () => {
  it("an included attempt lost by a search is sent again, and included when found again", () => {
    let json = accept(
      sentIntent(),
      observe({ tip: tipAt(901), attempts: [found(A(1))] }),
    );
    json = accept(json, observe({ attempts: [missing(A(1))] }));
    expect(json.status).toBe("sent");
    expect(attemptOf(json, A(1)).seen).toBeUndefined();
    expect(landedAttempt(json)).toBeUndefined();
    json = accept(json, observe({ tip: tipAt(902), attempts: [found(A(1))] }));
    expect(json.status).toBe("included");
  });

  it("an expired or orphaned attempt found valid is included", () => {
    for (const status of ["expired", "orphaned"] as const) {
      const after = accept(
        reach(status),
        observe({
          tip: tipAt(1200),
          attempts: [
            { txHash: hash(0xa1), found: true, slot: 950, valid: true },
          ],
        }),
      );
      expect(after.status).toBe("included");
    }
  });

  it("one observation moves an attempt by one rule only", () => {
    // Past its deadline and margin and lost by the search: sent first, expired by the next one.
    let json = accept(
      sentIntent(),
      observe({ tip: tipAt(901), attempts: [found(A(1))] }),
    );
    json = accept(
      json,
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
    );
    expect(json.status).toBe("sent");
    json = accept(
      json,
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
    );
    expect(json.status).toBe("expired");

    // Orphaned and past its own deadline and margin: live again, not expired in the same event.
    const revived = accept(
      reach("orphaned"),
      observe({
        tip: pastMargin(),
        attempts: [missing(hash(0xa1))],
        parents: [{ txHash: hash(0x100), found: true, valid: true }],
      }),
    );
    expect(revived.status).toBe("sent");

    // A child's attempt lost by its search while its parent attempt is gone: sent first,
    // orphaned by the next observation.
    const parentAndChildLost = observe({
      tip: tipAt(950),
      attempts: [missing(hash(0xa1))],
      parents: [{ txHash: hash(0x100), found: false }],
    });
    const lost = accept(reach("included"), parentAndChildLost);
    expect(lost.status).toBe("sent");
    expect(accept(lost, parentAndChildLost).status).toBe("orphaned");
  });
});

describe("intent state machine: final", () => {
  it("takes no event once final, and leaves the other attempts as they were", () => {
    const json = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2)),
      sign(A(2), K1),
      deliver(A(2)),
    );
    const final = accept(
      json,
      observe({
        tip: tipAt(1300),
        attempts: [missing(A(1)), found(A(2), { slot: 1000 })],
        anchorsInPlace: [ANCHOR.input],
      }),
    );
    expect(final.status).toBe("final");
    expect(statusOf(final, A(1))).toBe("rejected");
    const events: TxIntentEvent[] = [
      build(A(3)),
      sign(A(2), KX),
      deliver(A(2)),
      accepted(A(2)),
      observe({ attempts: [missing(A(2))] }),
      { type: "closing" },
      { type: "closed" },
    ];
    for (const event of events) expect(refusal(final, event)).toBe("terminal");
  });

  it("keeps every attempt's transaction until the intent is terminal, then one", () => {
    const json = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2)),
      sign(A(2), K1),
      deliver(A(2)),
    );
    expect(json.attempts.every((a) => a.built !== undefined)).toBe(true);

    const final = accept(
      json,
      observe({ tip: tipAt(1300), attempts: [found(A(1), { slot: 1000 })] }),
    );
    expect(attemptOf(final, A(1)).built?.txHash).toBe(A(1));
    expect(attemptOf(final, A(2)).built).toBeUndefined();
    const { built: _a, ...keptA2 } = attemptOf(json, A(2));
    expect(attemptOf(final, A(2))).toEqual(keptA2);

    const abandoned = acceptAll(
      json,
      { type: "closing" },
      observe({ tip: pastMargin(), attempts: [missing(A(1)), missing(A(2))] }),
      { type: "closed" },
    );
    expect(abandoned.status).toBe("abandoned");
    expect(attemptOf(abandoned, A(1)).built).toBeUndefined();
    expect(attemptOf(abandoned, A(2)).built?.txHash).toBe(A(2));
    expect(attemptOf(abandoned, A(1))).toMatchObject({
      status: "expired",
      sends: 1,
      refused: 1,
      anchors: [ANCHOR.input],
    });
  });

  it("two attempts found at the depth at once: the first is final, the other as before", () => {
    const json = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2)),
      sign(A(2), K1),
      deliver(A(2)),
    );
    const final = accept(
      json,
      observe({
        tip: tipAt(1300),
        attempts: [found(A(1), { slot: 1000 }), found(A(2), { slot: 1001 })],
      }),
    );
    expect(statusOf(final, A(1))).toBe("final");
    expect(statusOf(final, A(2))).toBe("sent");
    expect(attemptOf(final, A(2)).seen).toBeUndefined();
  });
});

describe("intent state machine: closing", () => {
  it("keeps the mark through every later event; an attempt found after it is included, then final", () => {
    let json = accept(sentIntent(), { type: "closing" });
    expect(json.closing).toBe(true);
    json = accept(json, refuse(A(1)));
    expect(json.closing).toBe(true);
    json = accept(json, observe({ tip: tipAt(901), attempts: [found(A(1))] }));
    expect(json).toMatchObject({ status: "included", closing: true });
    json = accept(json, observe({ tip: tipAt(903), attempts: [found(A(1))] }));
    expect(json).toMatchObject({ status: "final", closing: true });
  });

  it("refuses the mark in included, with and without the mark; a second mark is the same record", () => {
    expect(refusal(reach("included"), { type: "closing" })).toBe("status");
    expect(refusal(reach("included", true), { type: "closing" })).toBe(
      "status",
    );
    for (const status of [
      "built",
      "signed",
      "sent",
      "rejected",
      "expired",
      "failed",
      "orphaned",
    ] as const) {
      const json = reach(status, true);
      const again = advanceIntent(json, { type: "closing" });
      expect(again.ok && again.json).toBe(json);
    }
  });

  it("closes only with the mark and no attempt that may land", () => {
    const dead = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2)),
      sign(A(2), K1),
      deliver(A(2)),
      observe({ tip: pastMargin(), attempts: [missing(A(2))] }),
    );
    expect(statusOf(dead, A(1))).toBe("rejected");
    expect(refusal(accept(dead, { type: "closing" }), { type: "closed" })).toBe(
      "status",
    );
    const allDead = accept(dead, {
      type: "observation",
      tip: pastMargin(),
      attempts: [missing(A(1))],
    });
    expect(refusal(allDead, { type: "closed" })).toBe("status");
    const closed = acceptAll(allDead, { type: "closing" }, { type: "closed" });
    expect(closed.status).toBe("abandoned");
    expect(closed.attempts.map((a) => a.status)).toEqual([
      "expired",
      "expired",
    ]);
  });

  it("a mark on a draft abandons it at once, as its first record", () => {
    const json = accept(start(), { type: "closing" });
    expect(json).toMatchObject({
      status: "abandoned",
      closing: true,
      attempts: [],
      rev: 1,
    });
    expect(refusal(json, build(A(1)))).toBe("terminal");
  });
});

describe("intent state machine: anchors", () => {
  it("records each anchor with the attempts built on it", () => {
    const first = accept(start(), build(A(1)));
    expect(first.anchor.anchors).toEqual([
      { utxo: ANCHOR, kind: "payer", attempts: [A(1)] },
    ]);
    const notInput = buildEvent({
      txHash: A(1),
      anchors: [{ utxo: ANCHOR, kind: "payer" }],
    });
    const withoutInput: TxIntentEvent = {
      ...notInput,
      built: builtTx({ txHash: A(1), inputs: [OTHER], until: UNTIL }),
    } as TxIntentEvent;
    expect(refusal(start(), withoutInput)).toBe("anchor");
  });

  it("keeps the anchor while an earlier attempt may land, and changes the payer's after", () => {
    const rejected = accept(sentIntent(), refuse(A(1)));
    expect(refusal(rejected, build(A(2), { anchor: OTHER }))).toBe("anchor");
    expect(accept(rejected, build(A(2))).anchor.anchors).toEqual([
      { utxo: ANCHOR, kind: "payer", attempts: [A(1), A(2)] },
    ]);
    const expired = accept(
      sentIntent(),
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
    );
    const moved = accept(expired, build(A(2), { anchor: OTHER }));
    expect(moved.anchor.anchors).toEqual([
      { utxo: ANCHOR, kind: "payer", attempts: [A(1)] },
      { utxo: OTHER, kind: "payer", attempts: [A(2)] },
    ]);
    expect(attemptOf(moved, A(2)).anchors).toEqual([OTHER.input]);

    const parts = accept(
      sentIntent(start(), 1, { kind: "parts" }),
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
    );
    expect(refusal(parts, build(A(2), { anchor: OTHER }))).toBe("anchor");
    expect(refusal(parts, build(A(2), { anchor: OTHER, kind: "parts" }))).toBe(
      "anchor",
    );
    expect(accept(parts, build(A(2), { kind: "parts" })).attempts).toHaveLength(
      2,
    );
  });

  const P = hash(0x100);
  const named = (
    anchors: { utxo: UTxO; kind: AnchorKind }[],
    parents?: { txHash: string; until: number; intentId?: string }[],
  ) => buildEvent({ txHash: A(1), anchors, parents });

  it("refuses anchors of the wrong shape", () => {
    const cases: [string, TxIntentEvent][] = [
      ["no anchor", named([])],
      [
        "a payer and a parts anchor",
        named([
          { utxo: ANCHOR, kind: "payer" },
          { utxo: OTHER, kind: "parts" },
        ]),
      ],
      [
        "two parent anchors",
        named(
          [
            { utxo: utxo(P, 0), kind: "parent" },
            { utxo: utxo(P, 1), kind: "parent" },
          ],
          [{ txHash: P, until: 1, intentId: "p" }],
        ),
      ],
      [
        "a parent anchor without parents",
        named([
          { utxo: utxo(P, 0), kind: "parent" },
          { utxo: ANCHOR, kind: "payer" },
        ]),
      ],
      [
        "a parent anchor of another transaction",
        named(
          [{ utxo: utxo(hash(0x101), 0), kind: "parent" }],
          [{ txHash: P, until: 1, intentId: "p" }],
        ),
      ],
    ];
    for (const [name, event] of cases)
      expect([name, refusal(start(), event)]).toEqual([name, "anchor"]);
  });
});

describe("intent state machine: parents and children", () => {
  const P1 = hash(0x100);
  const P2 = hash(0x200);
  const PARENT_UNTIL = 800_000;
  const childBuild = (
    txHash: string,
    parents: { txHash: string; until: number; intentId?: string }[],
    anchors: { utxo: UTxO; kind: AnchorKind }[],
    extra: UTxO[] = [],
    keys: string[] = [],
  ) => buildEvent({ txHash, anchors, parents, extra, keys });
  const onParent = (txHash: string, parent: string, id = "p") =>
    childBuild(
      txHash,
      [{ txHash: parent, until: PARENT_UNTIL, intentId: id }],
      [{ utxo: utxo(parent, 0), kind: "parent" }],
    );
  const parentGone = (parent = P1, timeMs = PARENT_UNTIL + MARGIN) =>
    observe({
      tip: timeTip(timeMs),
      parents: [{ txHash: parent, found: false }],
    });

  it("refuses an attempt on other parent intents", () => {
    const json = acceptAll(start(), onParent(A(1), P1), parentGone());
    expect(json.status).toBe("orphaned");
    const P1b = hash(0x101);
    const refusedCases: TxIntentEvent[] = [
      onParent(A(2), P1b, "q"),
      childBuild(
        A(2),
        [
          { txHash: P1b, until: PARENT_UNTIL, intentId: "p" },
          { txHash: P2, until: PARENT_UNTIL, intentId: "r" },
        ],
        [{ utxo: utxo(P1b, 0), kind: "parent" }],
      ),
      buildEvent({ txHash: A(2), anchors: [{ utxo: ANCHOR, kind: "payer" }] }),
      childBuild(
        A(2),
        [{ txHash: P1b, until: PARENT_UNTIL }],
        [{ utxo: utxo(P1b, 0), kind: "parent" }],
      ),
    ];
    for (const event of refusedCases)
      expect(refusal(json, event)).toBe("parents");
    expect(accept(json, onParent(A(2), P1b)).attempts).toHaveLength(2);

    const noParents = acceptAll(
      sentIntent(),
      observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
    );
    expect(refusal(noParents, onParent(A(2), P1))).toBe("parents");

    const noId = acceptAll(
      start(),
      childBuild(
        A(1),
        [{ txHash: P1, until: PARENT_UNTIL }],
        [{ utxo: utxo(P1, 0), kind: "parent" }],
      ),
      parentGone(),
    );
    expect(refusal(noId, onParent(A(2), P1b, "p"))).toBe("parents");
    expect(
      accept(
        noId,
        childBuild(
          A(2),
          [{ txHash: P1b, until: PARENT_UNTIL }],
          [{ utxo: utxo(P1b, 0), kind: "parent" }],
        ),
      ).attempts,
    ).toHaveLength(2);
  });

  it("orphans only an attempt that spends the parent attempt's output", () => {
    const onOutput = accept(start(), onParent(A(1), P1));
    const onGeneral = accept(
      start(),
      childBuild(
        A(1),
        [{ txHash: P1, until: PARENT_UNTIL, intentId: "p" }],
        [{ utxo: ANCHOR, kind: "payer" }],
      ),
    );
    const facts = parentGone();
    expect(accept(onOutput, facts).status).toBe("orphaned");
    const general = advanceIntent(onGeneral, facts);
    expect(general.ok && general.json).toBe(onGeneral);
    expect(
      accept(
        onGeneral,
        observe({ tip: pastMargin(), attempts: [missing(A(1))] }),
      ).status,
    ).toBe("expired");
  });

  it("orphans by the child's own margin and its own search", () => {
    const json = accept(start(), onParent(A(1), P1));
    const early = advanceIntent(
      json,
      parentGone(P1, PARENT_UNTIL + MARGIN - 1),
    );
    expect(early.ok && early.json).toBe(json);
    expect(accept(json, parentGone()).status).toBe("orphaned");
    const unsighted = advanceIntent(
      json,
      observe({ tip: timeTip(PARENT_UNTIL + 10 * MARGIN) }),
    );
    expect(unsighted.ok && unsighted.json).toBe(json);
    for (const tip of [undefined, timeTip(1000)])
      expect(
        accept(
          json,
          observe({
            ...(tip !== undefined && { tip }),
            parents: [{ txHash: P1, found: true, valid: false }],
          }),
        ).status,
      ).toBe("orphaned");
  });

  it("an orphaned attempt is live again when its parent attempt is found valid", () => {
    const parentBack = observe({
      parents: [{ txHash: P1, found: true, valid: true }],
    });
    const keyed = childBuild(
      A(1),
      [{ txHash: P1, until: PARENT_UNTIL, intentId: "p" }],
      [{ utxo: utxo(P1, 0), kind: "parent" }],
      [],
      [K1],
    );
    const sentChild = acceptAll(
      start(),
      keyed,
      sign(A(1), K1),
      deliver(A(1)),
      parentGone(),
    );
    expect(accept(sentChild, parentBack).status).toBe("sent");
    const signedChild = acceptAll(start(), keyed, sign(A(1), K1), parentGone());
    expect(accept(signedChild, parentBack).status).toBe("signed");
    const builtChild = acceptAll(start(), keyed, parentGone());
    expect(accept(builtChild, parentBack).status).toBe("built");

    const unknown = advanceIntent(
      sentChild,
      observe({ parents: [{ txHash: P1, found: true }] }),
    );
    expect(unknown.ok && unknown.json).toBe(sentChild);

    const twoParents = acceptAll(
      start(),
      childBuild(
        A(1),
        [
          { txHash: P1, until: PARENT_UNTIL, intentId: "p" },
          { txHash: P2, until: PARENT_UNTIL, intentId: "r" },
        ],
        [{ utxo: utxo(P1, 0), kind: "parent" }],
        [utxo(P2, 0)],
      ),
      parentGone(),
    );
    expect(attemptOf(twoParents, A(1)).dependsOn).toEqual([P1, P2]);
    expect(twoParents.status).toBe("orphaned");
    const half = advanceIntent(twoParents, parentBack);
    expect(half.ok && half.json).toBe(twoParents);
  });

  it("keeps a child's anchors: the parent output while it may land, the general anchor for good", () => {
    const P1b = hash(0x101);
    const json = accept(start(), onParent(A(1), P1));
    expect(
      refusal(json, {
        ...onParent(A(2), P1b),
        tipTimeMs: UNTIL,
      } as TxIntentEvent),
    ).toBe("anchor");
    const orphaned = accept(json, parentGone());
    expect(accept(orphaned, onParent(A(2), P1b)).attempts).toHaveLength(2);

    // A1 spends the parent output and a general anchor, and is orphaned.
    const general = acceptAll(
      start(),
      childBuild(
        A(1),
        [{ txHash: P1, until: PARENT_UNTIL, intentId: "p" }],
        [
          { utxo: utxo(P1, 0), kind: "parent" },
          { utxo: ANCHOR, kind: "payer" },
        ],
      ),
      parentGone(),
    );
    expect(general.status).toBe("orphaned");
    expect(refusal(general, onParent(A(2), P1b))).toBe("anchor");
    const withOther = childBuild(
      A(2),
      [{ txHash: P1b, until: PARENT_UNTIL, intentId: "p" }],
      [
        { utxo: utxo(P1b, 0), kind: "parent" },
        { utxo: OTHER, kind: "payer" },
      ],
    );
    expect(refusal(general, withOther)).toBe("anchor");
    const withSame = childBuild(
      A(2),
      [{ txHash: P1b, until: PARENT_UNTIL, intentId: "p" }],
      [
        { utxo: utxo(P1b, 0), kind: "parent" },
        { utxo: ANCHOR, kind: "payer" },
      ],
    );
    const both = accept(general, withSame);
    expect(both.attempts).toHaveLength(2);
    expect(both.anchor.anchors).toEqual([
      { utxo: utxo(P1, 0), kind: "parent", attempts: [A(1)] },
      { utxo: ANCHOR, kind: "payer", attempts: [A(1), A(2)] },
      { utxo: utxo(P1b, 0), kind: "parent", attempts: [A(2)] },
    ]);
  });
});

describe("intent state machine: purity and views", () => {
  it("never changes its arguments, answers alike for alike, and counts revisions by one", () => {
    const events: TxIntentEvent[] = [
      build(A(1), { keys: [K1, K2] }),
      sign(A(1), K1),
      sign(A(1), K2),
      deliver(A(1)),
      refuse(A(1)),
      build(A(2)),
      sign(A(2), K1),
      deliver(A(2)),
      accepted(A(2), hash(0xbeef)),
      observe({ tip: tipAt(901), attempts: [found(A(2))] }),
      observe({ tip: tipAt(905), attempts: [found(A(2))] }),
    ];
    let json = deepFreeze(start());
    for (const event of events) {
      const frozen = deepFreeze(structuredClone(event));
      const copy = structuredClone(json);
      const first = advanceIntent(json, frozen);
      const second = advanceIntent(copy, structuredClone(event));
      expect(second).toEqual(first);
      if (!first.ok) throw new Error(first.message);
      expect(first.json.rev).toBe(json.rev + 1);
      expect(json).toEqual(copy);
      json = deepFreeze(first.json);
    }
    expect(json.status).toBe("final");
  });

  it("lists live attempts and the time after which none of them can land", () => {
    const json = acceptAll(
      sentIntent(),
      refuse(A(1)),
      build(A(2), { until: 1_200_000 }),
    );
    expect(liveAttempts(json).map((a) => a.txHash)).toEqual([A(1), A(2)]);
    expect(safeAfter(json)).toBe(1_200_000 + MARGIN);

    const final = accept(
      json,
      observe({ tip: tipAt(1300), attempts: [found(A(1), { slot: 1000 })] }),
    );
    expect(liveAttempts(final).map((a) => a.txHash)).toEqual([A(1)]);
    expect(safeAfter(final)).toBe(UNTIL + MARGIN);

    const abandoned = reach("abandoned");
    expect(liveAttempts(abandoned)).toEqual([]);
    expect(safeAfter(abandoned)).toBeUndefined();
    expect(safeAfter(start())).toBeUndefined();
  });
});
