import type {
  StoredTxIntentJSON,
  TxIntentStore,
} from "../../../src/tx-builder";
import { memoryIntentStore } from "../../../src/tx-builder";

// A store for the tests of intents with a store: it forwards to a `memoryIntentStore()`, records
// every call with its answer, and lets a test change what one call does.

/** One call of a watched store, with what it answered */
export type StoreCall =
  | {
      readonly op: "load";
      readonly id: string;
      readonly answer?: StoredTxIntentJSON;
      readonly threw?: true;
    }
  | {
      readonly op: "save";
      readonly id: string;
      readonly expectedRev: number;
      readonly rev: number;
      readonly status: string;
      readonly answer?: boolean;
      readonly threw?: true;
    };

type Load = (id: string) => Promise<StoredTxIntentJSON | undefined>;
type Save = (json: StoredTxIntentJSON, expectedRev: number) => Promise<boolean>;

/** What a watched store does with a call: the hook gets the call to the inner store */
export type StoreHooks = {
  load?: (forward: Load, id: string) => Promise<StoredTxIntentJSON | undefined>;
  save?: (
    forward: Save,
    json: StoredTxIntentJSON,
    expectedRev: number,
  ) => Promise<boolean>;
};

export type WatchedStore = TxIntentStore & {
  readonly inner: TxIntentStore;
  hooks: StoreHooks;
  readonly calls: StoreCall[];
  /** The loads made, of one id or of all */
  loads(id?: string): number;
  /** The saves made, of one id or of all */
  saves(id?: string): StoreCall[];
  /** The saves that answered true, of one id or of all */
  written(id?: string): StoreCall[];
  /** Forgets the calls made so far */
  reset(): void;
};

/** A store that forwards to `inner`, recording each call, unless a hook says otherwise */
export const watchStore = (
  inner: TxIntentStore = memoryIntentStore(),
  hooks: StoreHooks = {},
): WatchedStore => {
  const calls: StoreCall[] = [];
  const store: WatchedStore = {
    inner,
    hooks,
    calls,
    async load(id) {
      const forward: Load = (i) => inner.load(i);
      try {
        const answer = await (store.hooks.load
          ? store.hooks.load(forward, id)
          : forward(id));
        calls.push({
          op: "load",
          id,
          ...(answer !== undefined && { answer }),
        });
        return answer;
      } catch (error) {
        calls.push({ op: "load", id, threw: true });
        throw error;
      }
    },
    async save(json, expectedRev) {
      const forward: Save = (j, rev) => inner.save(j, rev);
      const call = {
        op: "save" as const,
        id: json.id,
        expectedRev,
        rev: json.rev,
        status: json.status,
      };
      try {
        const answer = await (store.hooks.save
          ? store.hooks.save(forward, json, expectedRev)
          : forward(json, expectedRev));
        calls.push({ ...call, answer });
        return answer;
      } catch (error) {
        calls.push({ ...call, threw: true });
        throw error;
      }
    },
    loads: (id) =>
      calls.filter((c) => c.op === "load" && (id === undefined || c.id === id))
        .length,
    saves: (id) =>
      calls.filter((c) => c.op === "save" && (id === undefined || c.id === id)),
    written: (id) =>
      store.saves(id).filter((c) => c.op === "save" && c.answer === true),
    reset: () => {
      calls.length = 0;
    },
  };
  return store;
};

/** The record stored under an id, as plain data */
export const stored = async (store: TxIntentStore, id: string) =>
  (await store.load(id))!;
