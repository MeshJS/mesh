import type {
  StoredTxPlanJSON,
  TxBuilderOptions,
  TxPlanStore,
} from "../../../src/tx-builder";
import { memoryPlanStore } from "../../../src/tx-builder";
import { builderOf, FAST, setup, wrap } from "./plan-emulator-util";

// A store for the tests of plans with a store: it forwards to a `memoryPlanStore()`, records
// every call with its answer, and lets a test change what one call does; and the setups and
// gates the tests of two objects on one record share.

/** One call of a watched store, with what it answered */
export type StoreCall =
  | {
      readonly op: "load";
      readonly id: string;
      readonly answer?: StoredTxPlanJSON;
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

type Load = (id: string) => Promise<StoredTxPlanJSON | undefined>;
type Save = (json: StoredTxPlanJSON, expectedRev: number) => Promise<boolean>;

/** What a watched store does with a call: the hook gets the call to the inner store */
export type StoreHooks = {
  load?: (forward: Load, id: string) => Promise<StoredTxPlanJSON | undefined>;
  save?: (
    forward: Save,
    json: StoredTxPlanJSON,
    expectedRev: number,
  ) => Promise<boolean>;
};

export type WatchedStore = TxPlanStore & {
  readonly inner: TxPlanStore;
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
  inner: TxPlanStore = memoryPlanStore(),
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
export const stored = async (store: TxPlanStore, id: string) =>
  (await store.load(id))!;

/** The answers of the saves a store made, in order */
export const answers = (store: WatchedStore) =>
  store.saves().map((c) => c.op === "save" && c.answer);

/** An emulator, a wallet and a builder over a watched store */
export const storeSetup = async (
  options: {
    funds?: bigint[];
    planDefaults?: TxBuilderOptions["planDefaults"];
  } = {},
) => {
  const store = watchStore();
  const planDefaults = options.planDefaults ?? FAST;
  // A chain behind the local clock: a step past its end of validity is past it by both
  const ctx = await setup({
    builder: { store, planDefaults },
    slot: 100_000_000,
    ...(options.funds && { funds: options.funds }),
  });
  /**
   * Another instance: a new builder over the same records, through its own watched store and
   * provider, so that each instance's calls can be told apart and held up
   */
  const instance = () => {
    const own = watchStore(store.inner);
    const provider = wrap(ctx.emulator);
    return {
      store: own,
      provider,
      builder: builderOf(provider, { store: own, planDefaults }),
    };
  };
  return { ...ctx, store, instance };
};

/** A promise that a test opens; `reached` resolves once something waits at it */
export const gate = () => {
  let open!: () => void;
  let reached!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const arrived = new Promise<void>((resolve) => (reached = resolve));
  return {
    open,
    reached: arrived,
    pass: () => {
      reached();
      return opened;
    },
  };
};

/** Holds up the first save of a store that `when` picks until the gate opens */
export const holdSave = (
  store: WatchedStore,
  when: (json: StoredTxPlanJSON) => boolean,
) => {
  const held = gate();
  store.hooks.save = async (forward, json, rev) => {
    if (when(json)) {
      delete store.hooks.save;
      await held.pass();
    }
    return forward(json, rev);
  };
  return held;
};
