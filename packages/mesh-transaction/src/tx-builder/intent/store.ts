import type { StoredTxIntentJSON, TxIntentStore } from "./types";

// A store of intent records for tests, and the check of an application's store.

/**
 * A store that keeps records in memory, per store object: for tests and examples. Two builders
 * given the same store object act as two instances of an application on one store.
 *
 * `save` writes only over the revision the caller read (0: a new id only), and of two saves over
 * one revision exactly one is written. Records are stored and returned as copies made by a JSON
 * round trip, so no caller changes a stored record through a reference. A malformed call throws
 * an `Error` and stores nothing: a `json.rev` other than `expectedRev + 1`, an `expectedRev` that
 * is not a whole number of 0 or more, a `json.id` that is not a non-empty text, and a record that
 * is not JSON data (a `bigint` in it). Records are lost with the process.
 */
export const memoryIntentStore = (): TxIntentStore => {
  const records = new Map<string, { rev: number; text: string }>();
  return {
    async load(id: string) {
      const stored = records.get(id);
      return stored === undefined
        ? undefined
        : (JSON.parse(stored.text) as StoredTxIntentJSON);
    },
    // No await before the write: the comparison and the write are one step
    async save(json: StoredTxIntentJSON, expectedRev: number) {
      if (!Number.isSafeInteger(expectedRev) || expectedRev < 0)
        throw new Error(
          `memoryIntentStore: expectedRev ${String(expectedRev)} is not a whole number of 0 or more`,
        );
      if (typeof json !== "object" || json === null)
        throw new Error("memoryIntentStore: the record is not an object");
      if (typeof json.id !== "string" || json.id === "")
        throw new Error(
          "memoryIntentStore: the record has no id: a stored record has a non-empty text id",
        );
      if (json.rev !== expectedRev + 1)
        throw new Error(
          `memoryIntentStore: the record's rev ${String(json.rev)} is not expectedRev + 1 (${expectedRev + 1})`,
        );
      const text = JSON.stringify(json);
      if ((records.get(json.id)?.rev ?? 0) !== expectedRev) return false;
      records.set(json.id, { rev: json.rev, text });
      return true;
    },
  };
};

/* ---------------------------------------------------------------------------------------------
 * The check of a store
 * ------------------------------------------------------------------------------------------- */

/** Texts outside ASCII, of one to four bytes in UTF-8 */
const WORDS = [
  "Zahlung für Bestellung",
  "paiement reçu — merci",
  "東京の注文",
  "заказ оплачен",
  "✓ 🚀 €",
];

/**
 * A readable record of a closed intent: `abandoned`, no attempts, its bulk in one metadata part
 * with nested lists and maps, long decimal integers and texts outside ASCII
 */
const recordOf = (
  id: string,
  rev: number,
  note: string,
  bulk: number,
): StoredTxIntentJSON => {
  const lines = Array.from({ length: bulk }, (_, i) => ({
    type: "STRING",
    value: `${i} ${WORDS[i % WORDS.length]} ${note}`,
  }));
  return {
    kind: "TxIntent",
    version: 1,
    id,
    rev,
    status: "abandoned",
    closing: true,
    network: "preprod",
    deadlines: { ttlMs: 600_000, expiryMarginMs: 600_000, confirmations: 30 },
    attempts: [],
    anchor: { anchors: [] },
    parts: [
      {
        kind: "metadata",
        // A long free text, which ends with a character outside ASCII
        label: `${WORDS.join(" · ").repeat(Math.ceil(bulk / 4))} ${note} ✓`,
        metadataLabel: "674",
        value: {
          type: "MAP",
          value: [
            [
              { type: "STRING", value: "msg" },
              { type: "LIST", value: lines },
            ],
            [
              { type: "STRING", value: "max" },
              { type: "INT", value: "18446744073709551615" },
            ],
            [
              { type: "STRING", value: "min" },
              { type: "INT", value: "-18446744073709551615" },
            ],
            [
              { type: "STRING", value: "bytes" },
              {
                type: "LIST",
                value: [
                  {
                    type: "BYTES",
                    value: Array.from({ length: 64 }, (_, i) => i * 4),
                  },
                  {
                    type: "LIST",
                    value: [{ type: "INT", value: String(rev) }],
                  },
                ],
              },
            ],
          ],
        },
      },
    ],
    options: {},
  };
};

const show = (value: unknown) =>
  value === undefined
    ? "undefined"
    : typeof value === "string"
      ? JSON.stringify(value)
      : typeof value === "object" && value !== null
        ? Array.isArray(value)
          ? "a list"
          : "an object"
        : String(value);

/** Where two JSON values first differ, or undefined when they are equal */
const difference = (
  found: unknown,
  saved: unknown,
  path: string,
): string | undefined => {
  if (typeof saved !== "object" || saved === null)
    return Object.is(found, saved)
      ? undefined
      : `${path} is ${show(found)}, saved as ${show(saved)}`;
  if (typeof found !== "object" || found === null)
    return `${path} is ${show(found)}, saved as ${show(saved)}`;
  if (Array.isArray(saved) !== Array.isArray(found))
    return `${path} is ${show(found)}, saved as ${show(saved)}`;
  const savedKeys = Object.keys(saved);
  const foundKeys = Object.keys(found);
  for (const key of foundKeys)
    if (!savedKeys.includes(key)) return `${path}.${key} was not saved`;
  for (const key of savedKeys) {
    if (!foundKeys.includes(key)) return `${path}.${key} is missing`;
    const inner = difference(
      (found as Record<string, unknown>)[key],
      (saved as Record<string, unknown>)[key],
      Array.isArray(saved) ? `${path}[${key}]` : `${path}.${key}`,
    );
    if (inner !== undefined) return inner;
  }
  return undefined;
};

/** A plain `Error` naming the check that failed, with what the store threw as its `cause` */
const failed = (check: string, problem: string, cause?: unknown) =>
  new Error(
    `checkIntentStore: ${check}: ${problem}`,
    ...(cause === undefined ? [] : [{ cause }]),
  );

const suffix = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Checks that a store keeps what intents rely on, and rejects with an `Error` at the first check
 * that fails; its message starts with `checkIntentStore:` and names the check, and a value the
 * store threw is its `cause`. The checks:
 * - a crash between a write and a send: a write that answered `true` is what `load` returns,
 *   member by member (records of tens of KB, nested lists and objects, long decimal texts, text
 *   outside ASCII); an id never written loads as `undefined`; a write under one id leaves the
 *   record of another unchanged;
 * - two writers: of two first writes of one new id started together, and of two writes over one
 *   stored revision, exactly one answers `true`, and `load` returns that one;
 * - a lost acknowledgement: a write repeated after it passed, a first write for an id that
 *   exists, and a write over a revision ahead of the stored one answer `false` and change
 *   nothing;
 * - every `save` resolves to exactly `true` or `false`; a store that throws where it must
 *   answer `false` fails.
 *
 * It calls `load` and `save` only, under fresh ids that start with `checkIntentStore:`, and
 * leaves its records in the store, since a store has no delete: a few records of closed
 * (`abandoned`) intents without attempts, which no reconciliation takes up. It is meant for tests
 * and for setting a store up, not for every start. It cannot show that records survive a
 * restart, nor that the store keeps its guarantees between processes.
 */
export const checkIntentStore = async (store: TxIntentStore): Promise<void> => {
  const run = suffix();
  const idOf = (name: string) => `checkIntentStore:${run}:${name}`;

  const load = async (check: string, id: string) => {
    try {
      return await store.load(id);
    } catch (error) {
      throw failed(check, `load(${show(id)}) threw`, error);
    }
  };
  const save = async (
    check: string,
    json: StoredTxIntentJSON,
    expectedRev: number,
  ) => {
    let answer: unknown;
    try {
      answer = await store.save(json, expectedRev);
    } catch (error) {
      throw failed(
        check,
        `save of revision ${json.rev} over ${expectedRev} threw; a store answers false where it does not write`,
        error,
      );
    }
    if (answer !== true && answer !== false)
      throw failed(
        "save answers true or false",
        `save resolved to ${show(answer)}`,
      );
    return answer;
  };
  const expectStored = async (
    check: string,
    id: string,
    saved: StoredTxIntentJSON,
  ) => {
    const found = await load(check, id);
    if (found === undefined)
      throw failed(check, `load(${show(id)}) found no record`);
    const diff = difference(found, saved, "record");
    if (diff !== undefined)
      throw failed(
        check,
        `load(${show(id)}) does not return the record of the last write that answered true: ${diff}`,
      );
  };

  // A crash between the write and the send: what was acknowledged is what a reader finds
  const crash = "what a write acknowledged is what load returns";
  const a = idOf("a");
  const a1 = recordOf(a, 1, "first", 160);
  const a2 = recordOf(a, 2, "second", 160);
  const never = await load(crash, a);
  if (never !== undefined)
    throw failed(
      crash,
      `load of an id never written returned ${show(never)}, not undefined`,
    );
  if (!(await save(crash, a1, 0)))
    throw failed(crash, "the first write of a new id answered false");
  await expectStored(crash, a, a1);
  if (!(await save(crash, a2, 1)))
    throw failed(crash, "a write over the stored revision answered false");
  await expectStored(crash, a, a2);

  // A lost acknowledgement: a write repeated, or over a revision that is not stored, is refused
  const lost = "a repeated write or one over another revision answers false";
  if (await save(lost, a1, 0))
    throw failed(lost, "a first write for an id that exists answered true");
  if (await save(lost, a2, 1))
    throw failed(
      lost,
      "a write repeated over a revision it already replaced answered true",
    );
  if (await save(lost, recordOf(a, 4, "ahead", 4), 3))
    throw failed(
      lost,
      "a write over a revision ahead of the stored one answered true",
    );
  await expectStored(lost, a, a2);

  // Records of different ids are kept apart
  const apart = "the record of one id is not changed by writes under another";
  const b = idOf("b");
  const b1 = recordOf(b, 1, "other", 4);
  if (!(await save(apart, b1, 0)))
    throw failed(apart, "the first write of a new id answered false");
  await expectStored(apart, a, a2);
  await expectStored(apart, b, b1);

  // Two writers: exactly one of two writes over one revision passes
  const writers = "of two writes over one revision exactly one answers true";
  const c = idOf("c");
  const race = async (
    left: StoredTxIntentJSON,
    right: StoredTxIntentJSON,
    expectedRev: number,
    what: string,
  ) => {
    const answers = await Promise.all([
      save(writers, left, expectedRev),
      save(writers, right, expectedRev),
    ]);
    const passed = answers.filter(Boolean).length;
    if (passed !== 1)
      throw failed(
        writers,
        `${what} started together: ${passed} answered true`,
      );
    await expectStored(writers, c, answers[0] ? left : right);
  };
  await race(
    recordOf(c, 1, "left", 4),
    recordOf(c, 1, "right", 4),
    0,
    "two first writes of one new id",
  );
  await race(
    recordOf(c, 2, "left again", 4),
    recordOf(c, 2, "right again", 4),
    1,
    "two writes over one stored revision",
  );
};
