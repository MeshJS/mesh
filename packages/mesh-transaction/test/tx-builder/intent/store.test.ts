import type {
  StoredTxIntentJSON,
  TxIntentStore,
} from "../../../src/tx-builder";
import {
  checkIntentStore,
  memoryIntentStore,
  TxError,
} from "../../../src/tx-builder";
import { readIntent } from "../../../src/tx-builder/intent/json";

/** A stored record of a closed intent, with a note that tells two records apart */
const record = (
  id: string,
  rev: number,
  note = "note",
): StoredTxIntentJSON => ({
  kind: "TxIntent",
  version: 1,
  id,
  rev,
  status: "abandoned",
  closing: true,
  network: "preprod",
  deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 0 },
  attempts: [],
  anchor: { anchors: [] },
  parts: [{ kind: "donation", amount: "1000000", label: note }],
  options: {},
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const rejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the promise to reject");
};

describe("memoryIntentStore", () => {
  it("writes over the stored revision only, one of two concurrent writes, and keeps copies", async () => {
    const store = memoryIntentStore();
    expect(await store.load("pay-1")).toBeUndefined();
    const r1 = record("pay-1", 1);
    expect(await store.save(r1, 0)).toBe(true);
    expect(await store.save(r1, 0)).toBe(false);
    const r2 = record("pay-1", 2);
    expect(await store.save(r2, 1)).toBe(true);
    expect(await store.load("pay-1")).toEqual(r2);
    expect(await store.save(record("pay-1", 2, "again"), 1)).toBe(false);

    const left = record("pay-1", 3, "left");
    const right = record("pay-1", 3, "right");
    const answers = await Promise.all([
      store.save(left, 2),
      store.save(right, 2),
    ]);
    expect(answers.filter(Boolean)).toHaveLength(1);
    expect(await store.load("pay-1")).toEqual(answers[0] ? left : right);

    // A record returned and changed by the caller, or a record saved and changed after, changes
    // nothing stored
    const loaded = (await store.load("pay-1")) as {
      parts: { label: string }[];
    };
    loaded.parts[0]!.label = "changed";
    (left.parts[0] as { label: string }).label = "changed";
    (right.parts[0] as { label: string }).label = "changed";
    expect(await store.load("pay-1")).toEqual(
      record("pay-1", 3, answers[0] ? "left" : "right"),
    );
    // Records of other ids are apart
    expect(await store.load("pay-2")).toBeUndefined();
  });

  it("throws on a malformed call and stores nothing", async () => {
    const store = memoryIntentStore();
    // Each call breaks one rule only, and the message names that rule
    const malformed: [unknown, number, RegExp][] = [
      [record("pay-1", 2), 0, /rev 2 is not expectedRev \+ 1/],
      [record("pay-1", 1), 1, /rev 1 is not expectedRev \+ 1/],
      [record("pay-1", 0), -1, /expectedRev -1 is not a whole number/],
      [
        { ...record("pay-1", 1), rev: 1.5 },
        0.5,
        /expectedRev 0\.5 is not a whole number/,
      ],
      [record("", 1), 0, /has no id/],
      [{ ...record("pay-1", 1), id: undefined }, 0, /has no id/],
      [{ ...record("pay-1", 1), options: { fee: 200_000n } }, 0, /BigInt/],
    ];
    for (const [json, expectedRev, message] of malformed) {
      const error = await rejection(
        store.save(json as StoredTxIntentJSON, expectedRev),
      );
      expect(error).toBeInstanceOf(Error);
      expect(TxError.is(error)).toBe(false);
      expect((error as Error).message).toMatch(message);
    }
    expect(await store.load("pay-1")).toBeUndefined();
    expect(await store.load("")).toBeUndefined();
    // The store still works
    expect(await store.save(record("pay-1", 1), 0)).toBe(true);
  });
});

/** A store over a map that misbehaves as told; every call is recorded */
const faulty = (
  fault: {
    /** Answers instead of the store, when it gives an answer */
    save?: (
      json: StoredTxIntentJSON,
      expectedRev: number,
      stored: Map<string, string>,
    ) => Promise<unknown> | undefined;
    load?: (id: string, stored: Map<string, string>) => unknown;
    key?: (id: string) => string;
  } = {},
) => {
  const stored = new Map<string, string>();
  const calls: { method: string; id: string }[] = [];
  const key = fault.key ?? ((id: string) => id);
  const revOf = (id: string) => {
    const text = stored.get(key(id));
    return text === undefined ? 0 : (JSON.parse(text) as { rev: number }).rev;
  };
  const store = {
    calls,
    stored,
    async load(id: string) {
      calls.push({ method: "load", id });
      if (fault.load) {
        const answer = fault.load(id, stored);
        if (answer !== "default") return answer;
      }
      const text = stored.get(key(id));
      return text === undefined ? undefined : JSON.parse(text);
    },
    async save(json: StoredTxIntentJSON, expectedRev: number) {
      calls.push({ method: "save", id: json.id });
      const answer = fault.save?.(json, expectedRev, stored);
      if (answer !== undefined) return answer;
      if (revOf(json.id) !== expectedRev) return false;
      stored.set(key(json.id), JSON.stringify(json));
      return true;
    },
  };
  return store as typeof store & TxIntentStore;
};

describe("checkIntentStore", () => {
  it("passes memoryIntentStore, calls load and save only, and leaves readable closed records", async () => {
    const inner = memoryIntentStore();
    const calls: { method: string; id: string }[] = [];
    const saved = new Map<string, StoredTxIntentJSON>();
    const recording = new Proxy(inner, {
      get(target, name) {
        const value = (target as unknown as Record<PropertyKey, unknown>)[name];
        if (typeof value !== "function") return value;
        return async (...args: unknown[]) => {
          const id =
            name === "load"
              ? (args[0] as string)
              : (args[0] as StoredTxIntentJSON).id;
          calls.push({ method: String(name), id });
          const answer = await (value as (...a: unknown[]) => unknown).apply(
            target,
            args,
          );
          if (name === "save" && answer === true)
            saved.set(id, args[0] as StoredTxIntentJSON);
          return answer;
        };
      },
    });

    await expect(checkIntentStore(recording)).resolves.toBeUndefined();
    expect(new Set(calls.map((call) => call.method))).toEqual(
      new Set(["load", "save"]),
    );
    const ids = new Set(calls.map((call) => call.id));
    for (const id of ids) expect(id.startsWith("checkIntentStore:")).toBe(true);

    // Every record left reads as a closed intent without attempts; one is over 10 KB
    let largest = 0;
    for (const id of new Set(saved.keys())) {
      const json = await inner.load(id);
      const read = readIntent(json, id);
      expect(read.status).toBe("abandoned");
      expect(read.attempts).toEqual([]);
      largest = Math.max(largest, Buffer.byteLength(JSON.stringify(json)));
    }
    expect(saved.size).toBeGreaterThanOrEqual(2);
    expect(largest).toBeGreaterThan(10_000);

    // Another run uses other ids
    const before = calls.length;
    await checkIntentStore(recording);
    const second = new Set(calls.slice(before).map((call) => call.id));
    for (const id of second) expect(ids.has(id)).toBe(false);
  });

  const fails = async (store: TxIntentStore, check: RegExp) => {
    const error = await rejection(checkIntentStore(store));
    expect(error).toBeInstanceOf(Error);
    expect(TxError.is(error)).toBe(false);
    expect(error.message.startsWith("checkIntentStore: ")).toBe(true);
    expect(error.message).toMatch(check);
    return error;
  };

  it("rejects a store without compare-and-set", async () => {
    // Every write answers true and is written
    await fails(
      faulty({
        save: async (json, _, stored) => {
          stored.set(json.id, JSON.stringify(json));
          return true;
        },
      }),
      /repeated write .*answers false: a first write for an id that exists answered true/,
    );
    // A write repeated with the same record answers true again
    await fails(
      faulty({
        save: (json, _, stored) =>
          stored.get(json.id) === JSON.stringify(json)
            ? Promise.resolve(true)
            : undefined,
      }),
      /a write repeated over a revision it already replaced answered true/,
    );
    // A write over a revision ahead of the stored one is written
    await fails(
      faulty({
        save: (json, expectedRev, stored) => {
          const text = stored.get(json.id);
          const rev = text === undefined ? 0 : JSON.parse(text).rev;
          if (expectedRev <= rev) return undefined;
          stored.set(json.id, JSON.stringify(json));
          return Promise.resolve(true);
        },
      }),
      /a write over a revision ahead of the stored one answered true/,
    );
  });

  it("rejects a store whose two writers both pass", async () => {
    // A first write is an insert without a condition: it reads, then writes
    const insert = faulty({
      save: (json, expectedRev, stored) => {
        if (expectedRev !== 0) return undefined;
        const exists = stored.has(json.id);
        return tick().then(() => {
          if (exists) return false;
          stored.set(json.id, JSON.stringify(json));
          return true;
        });
      },
    });
    await fails(insert, /two first writes of one new id started together: 2/);
    // A write over a revision reads the revision, then writes
    const update = faulty({
      save: (json, expectedRev, stored) => {
        if (expectedRev === 0) return undefined;
        const text = stored.get(json.id);
        const rev = text === undefined ? 0 : JSON.parse(text).rev;
        return tick().then(() => {
          if (rev !== expectedRev) return false;
          stored.set(json.id, JSON.stringify(json));
          return true;
        });
      },
    });
    await fails(
      update,
      /two writes over one stored revision started together: 2 answered true/,
    );
  });

  it("rejects a store that does not return what it acknowledged", async () => {
    const changed = (change: (json: any) => void) =>
      faulty({
        load: (id, stored) => {
          const text = stored.get(id);
          if (text === undefined) return undefined;
          const json = JSON.parse(text);
          change(json);
          return json;
        },
      });
    // A nested member dropped
    await fails(
      changed((json) => delete json.parts[0].value.value[1][1].value),
      /does not return the record .*record\.parts\[0\]\.value\.value\[1\]\[1\]\.value is missing/,
    );
    // The end of a long text cut
    await fails(
      changed(
        (json) => (json.parts[0].label = json.parts[0].label.slice(0, 255)),
      ),
      /record\.parts\[0\]\.label is/,
    );
    // A character outside ASCII changed
    await fails(
      changed((json) => {
        json.parts[0].value.value[0][1].value[2].value =
          json.parts[0].value.value[0][1].value[2].value.replace("東", "?");
      }),
      /record\.parts\[0\]\.value\.value\[0\]\[1\]\.value\[2\]\.value is/,
    );
    // A member of its own added
    await fails(
      changed((json) => (json.storedAt = 1)),
      /record\.storedAt was not saved/,
    );
    // The first write is all it ever returns
    await fails(
      faulty({
        save: (json, expectedRev, stored) => {
          if (expectedRev === 0 || !stored.has(json.id)) return undefined;
          return Promise.resolve(
            JSON.parse(stored.get(json.id)!).rev === expectedRev,
          );
        },
      }),
      /does not return the record of the last write that answered true: record\.rev is 1, saved as 2/,
    );
    // null for an id never written
    await fails(
      faulty({
        load: (id, stored) => (stored.has(id) ? "default" : null),
      }),
      /load of an id never written returned null, not undefined/,
    );
    // One record for every id
    await fails(
      faulty({ key: () => "the record" }),
      /the record of one id is not changed by writes under another: the first write of a new id answered false/,
    );
  });

  it("rejects a store whose answers are not true or false, or that throws for an id that exists", async () => {
    for (const answer of [undefined, 1]) {
      const store = faulty({ save: () => undefined });
      store.save = async () => answer as unknown as boolean;
      await fails(
        store,
        /save answers true or false: save resolved to (undefined|1)/,
      );
    }
    const duplicate = new Error("duplicate key");
    const error = await fails(
      faulty({
        save: (json, expectedRev, stored) =>
          expectedRev === 0 && stored.has(json.id)
            ? Promise.reject(duplicate)
            : undefined,
      }),
      /save of revision 1 over 0 threw; a store answers false where it does not write/,
    );
    expect(error.cause).toBe(duplicate);
  });
});
