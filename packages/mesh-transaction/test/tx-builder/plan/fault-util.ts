import type { ISubmitter } from "@meshsdk/common";
import type { TxEmulator } from "@meshsdk/tx-emulator";
import type { MeshWallet } from "@meshsdk/wallet";

import type {
  StoredTxPlanJSON,
  TxBuilder,
  TxPlan,
  TxPlanStore,
} from "../../../src/tx-builder";
import type { Hooks } from "./plan-emulator-util";
import { memoryPlanStore, TxError } from "../../../src/tx-builder";
import {
  builderOf,
  emulatorOf,
  hashOf,
  walletOf,
  wrap,
} from "./plan-emulator-util";

// Helpers of the fault-injection journeys: processes that each have one fault at one call of the
// store, a provider or the submitter, a world they share (a chain, a store, the bytes delivered),
// and the checks made against the store around every step.

/** What a store call does under its fault */
export type StoreFault =
  /** It throws before it reaches the store */
  | "throwBefore"
  /** It reaches the store, then throws: the answer is lost */
  | "lostAck"
  /** A save answers false without writing; a load throws */
  | "false"
  /** It never returns and never reaches the store: the process dies there */
  | "hangBefore"
  /** It reaches the store, then never returns: the process dies there */
  | "hangAfter"
  /** It waits before the store until the process is woken: a process that pauses */
  | "park"
  /** A save answers true without writing: a broken store, which the checks must catch */
  | "liar";

/**
 * One fault of a process: at its `k`-th store call, or at its `k`-th provider or submitter call.
 * An I/O fault hangs the call for good (the process dies there); with `after` the call goes
 * through first (the submitter got the bytes), with `park` it waits until the process is woken.
 */
export type Fault =
  | { readonly where: "store"; readonly k: number; readonly kind: StoreFault }
  | {
      readonly where: "io";
      readonly k: number;
      readonly after?: true;
      readonly park?: true;
    };

/** A promise that never settles: a call of a process that died */
const HANG = new Promise<never>(() => undefined);

/** One process: its fault, its calls counted, whether it died or waits */
export class Process {
  storeCalls = 0;
  ioCalls = 0;
  fired = false;
  crashed = false;
  parked = false;
  readonly log: string[] = [];
  #wake!: () => void;
  readonly #woken = new Promise<void>((resolve) => (this.#wake = resolve));
  constructor(readonly fault?: Fault) {}

  /** Wakes a paused process: its call goes on */
  wake() {
    this.parked = false;
    this.#wake();
  }

  /** Waits for `wake()` from the fault's call */
  async pause() {
    this.parked = true;
    await this.#woken;
  }

  /** The store fault of this call, when this is its call */
  storeFault(): StoreFault | undefined {
    const n = ++this.storeCalls;
    if (this.fault?.where !== "store" || this.fault.k !== n) return undefined;
    this.fired = true;
    return this.fault.kind;
  }
}

/** A store over `inner` that plays the process's fault at its call */
const faultyStore = (inner: TxPlanStore, proc: Process): TxPlanStore => ({
  async load(id) {
    if (proc.crashed) return HANG;
    const fault = proc.storeFault();
    proc.log.push(
      `store#${proc.storeCalls} load${fault ? ` -> ${fault}` : ""}`,
    );
    switch (fault) {
      case "throwBefore":
      case "false":
      case "liar":
        throw new Error("the load failed");
      case "lostAck":
        await inner.load(id);
        throw new Error("the load's answer was lost");
      case "hangBefore":
        proc.crashed = true;
        return HANG;
      case "hangAfter":
        await inner.load(id);
        proc.crashed = true;
        return HANG;
      case "park":
        await proc.pause();
    }
    return inner.load(id);
  },
  async save(json: StoredTxPlanJSON, expectedRev: number) {
    if (proc.crashed) return HANG;
    const fault = proc.storeFault();
    proc.log.push(
      `store#${proc.storeCalls} save rev ${json.rev} ${json.status}${fault ? ` -> ${fault}` : ""}`,
    );
    switch (fault) {
      case "throwBefore":
        throw new Error("the save failed before the store");
      case "lostAck":
        await inner.save(json, expectedRev);
        throw new Error("the save passed, its answer was lost");
      case "false":
        return false;
      case "hangBefore":
        proc.crashed = true;
        return HANG;
      case "hangAfter":
        await inner.save(json, expectedRev);
        proc.crashed = true;
        return HANG;
      case "liar":
        return true;
      case "park":
        await proc.pause();
    }
    return inner.save(json, expectedRev);
  },
});

/** Runs a provider or submitter call of the process, playing its I/O fault */
const ioCall = async <T>(
  proc: Process,
  name: string,
  go: () => Promise<T>,
): Promise<T> => {
  if (proc.crashed) return HANG;
  const n = ++proc.ioCalls;
  const fault = proc.fault;
  if (fault?.where !== "io" || fault.k !== n) return go();
  proc.fired = true;
  if (fault.park) {
    proc.log.push(`io#${n} ${name} -> paused`);
    await proc.pause();
    return go();
  }
  proc.log.push(
    `io#${n} ${name} -> ${fault.after ? "through, then " : ""}hang`,
  );
  // The answer is lost with the process
  if (fault.after) await go().catch(() => undefined);
  proc.crashed = true;
  return HANG;
};

const PROVIDER_METHODS = [
  "fetchAddressUTxOs",
  "fetchUTxOs",
  "fetchTxInfo",
  "fetchBlockInfo",
  "fetchLatestBlock",
  "fetchProtocolParameters",
  "fetchAccountInfo",
  "evaluateTx",
  "fetchAddressTxs",
  "fetchCollateralUTxOs",
  "get",
];

/** What the submitters of the world do with the bytes */
export type SubmitMode = "forward" | "hold" | "refuse";

/** The world every process shares: the chain, the store, the bytes delivered, the findings */
export class World {
  readonly inner = memoryPlanStore();
  readonly violations: string[] = [];
  /** Every byte string handed to a submitter, by hash */
  readonly delivered = new Map<string, Set<string>>();
  /** Bytes another node holds, for a later flush */
  readonly held: string[] = [];
  submitMode: SubmitMode = "forward";
  /** The payer's key and the second key, each checking that the bodies it signs are recorded */
  readonly wallet: MeshWallet;
  readonly other: MeshWallet;
  readonly #reader: TxBuilder;
  /** What the checks saw last, of the store's record and of each object */
  readonly #seen = new Map<
    string | TxPlan,
    { status: string; closing: boolean }
  >();

  private constructor(
    readonly emulator: TxEmulator,
    wallet: MeshWallet,
    other: MeshWallet,
    readonly address: string,
    readonly otherAddress: string,
    readonly ids: readonly string[],
  ) {
    this.#reader = builderOf(wrap(emulator), { store: this.inner });
    this.wallet = this.#checkedSigner(wallet, "the payer");
    this.other = this.#checkedSigner(other, "the second key");
  }

  /** A world of the plans `ids`, with a funded payer and a second key holder */
  static async create(
    ids: readonly string[],
    funds: bigint[] = [100_000_000n, 20_000_000n],
  ) {
    const emulator = await emulatorOf();
    const wallet = await walletOf(0);
    const other = await walletOf(1);
    const address = (await wallet.getChangeAddress())!;
    const otherAddress = (await other.getChangeAddress())!;
    for (const lovelace of funds) emulator.fund(address, { lovelace });
    return new World(emulator, wallet, other, address, otherAddress, ids);
  }

  /** A wallet whose signTx first checks that the store holds the body as an attempt */
  #checkedSigner(wallet: MeshWallet, name: string): MeshWallet {
    return new Proxy(wallet, {
      get: (target, key, receiver) => {
        if (key === "signTx")
          return async (tx: string, partial?: boolean) => {
            const txHash = await hashOf(tx);
            let known = false;
            for (const id of this.ids)
              if (
                (await this.inner.load(id))?.attempts.some(
                  (a) => a.txHash === txHash,
                )
              )
                known = true;
            if (!known)
              this.violation(
                `${name} was handed ${txHash.slice(0, 8)}, which no stored record holds`,
              );
            return target.signTx(tx, partial);
          };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  /**
   * Checks what a source shows against what it showed at the last check: a terminal status
   * stays, and the closing mark is never taken back
   */
  #keeps(key: string | TxPlan, name: string, status: string, closing: boolean) {
    const last = this.#seen.get(key);
    if (
      last !== undefined &&
      TERMINAL.has(last.status) &&
      status !== last.status
    )
      this.violation(`${name} was ${last.status}, now ${status}`);
    if (last?.closing && !closing)
      this.violation(`${name} took the closing mark back`);
    this.#seen.set(key, { status, closing });
  }

  violation(text: string) {
    this.violations.push(text);
  }

  /** The stored record, and the signed bytes of its current attempt as an object over it sees them */
  async #storedSigned(id: string) {
    const json = await this.inner.load(id);
    if (json === undefined) return {};
    return { json, signedTx: (await this.#reader.resume(id)).signedTx };
  }

  /**
   * A submitter of the process. Before the bytes leave it checks that the store recorded their
   * delivery, on the current attempt, with these very bytes.
   */
  submitter(proc: Process, ids: readonly string[]): ISubmitter {
    return {
      submitTx: (tx: string) =>
        ioCall(proc, "submitTx", async () => {
          const txHash = await hashOf(tx);
          const short = txHash.slice(0, 8);
          let known = false;
          for (const id of ids) {
            const { json, signedTx } = await this.#storedSigned(id);
            const attempt = json?.attempts.find((a) => a.txHash === txHash);
            if (!json || !attempt) continue;
            known = true;
            if (
              attempt.sends < 1 ||
              ["built", "signed"].includes(attempt.status)
            )
              this.violation(
                `${short} (${id}) was submitted before its delivery was recorded: stored ${attempt.status}, sends ${attempt.sends}`,
              );
            if (json.attempts.at(-1)!.txHash !== txHash)
              this.violation(
                `${short} (${id}) was submitted, not the stored current attempt`,
              );
            else if (signedTx !== tx)
              this.violation(
                `${short} (${id}) was submitted with bytes other than the stored ones`,
              );
          }
          if (!known)
            this.violation(`${short} was submitted, and no record holds it`);
          this.delivered.set(
            txHash,
            (this.delivered.get(txHash) ?? new Set()).add(tx),
          );
          switch (this.submitMode) {
            case "forward":
              return this.emulator.submitTx(tx);
            case "hold":
              this.held.push(tx);
              return txHash;
            case "refuse":
              throw { kind: "rejected" };
          }
        }),
    };
  }

  /** A provider of the process: it forwards to the chain and plays the process's I/O fault */
  #provider(proc: Process) {
    const hooks: Hooks = {};
    for (const name of PROVIDER_METHODS)
      hooks[name] = (forward, ...args) =>
        ioCall(proc, name, async () => forward(...args));
    // Every delivery goes through the checked submitter
    hooks.submitTx = () => {
      this.violation("the provider was asked to submit");
      return HANG;
    };
    return wrap(this.emulator, hooks);
  }

  /** The builder of a process: its store, provider and submitter play its fault */
  builder(proc: Process, ids: readonly string[]) {
    return builderOf(this.#provider(proc), {
      store: faultyStore(this.inner, proc),
      submitter: this.submitter(proc, ids),
    });
  }

  /** Lands the held bytes now; the ledger refuses some */
  async flush() {
    for (const tx of this.held.splice(0))
      await this.emulator.submitTx(tx).catch(() => undefined);
  }

  /** The delivered transactions the chain holds */
  async landed() {
    const landed: string[] = [];
    for (const txHash of this.delivered.keys())
      await this.emulator.fetchTxInfo(txHash).then(
        () => landed.push(txHash),
        () => undefined,
      );
    return landed;
  }

  /**
   * Checks an object against the store after a step: it shows no revision ahead of the store,
   * the same record at the store's revision, and only a body the store holds.
   */
  async checkObject(plan: TxPlan, id: string, where: string) {
    const json = JSON.parse(JSON.stringify(plan.toJSON())) as unknown;
    const stored = await this.inner.load(id);
    if (stored !== undefined)
      this.#keeps(
        id,
        `${where}: the stored ${id}`,
        stored.status,
        stored.closing === true,
      );
    this.#keeps(plan, `${where}: the object`, plan.status, plan.closing);
    const rev = (json as { rev: number }).rev;
    const storedRev = stored?.rev ?? 0;
    if (rev > storedRev)
      this.violation(
        `${where}: the object is at rev ${rev}, ahead of the store at ${storedRev}`,
      );
    else if (stored !== undefined && rev === storedRev) {
      const differs = difference(json, stored, "record");
      if (differs)
        this.violation(
          `${where}: the object and the store differ at rev ${rev}: ${differs}`,
        );
    }
    const built = plan.built;
    if (built && !stored?.attempts.some((a) => a.txHash === built.txHash))
      this.violation(
        `${where}: the object shows a body ${built.txHash.slice(0, 8)} the store does not hold`,
      );
  }

  /** Checks a body build() handed out: the store holds it */
  async checkBody(id: string, txHash: string, where: string) {
    const stored = await this.inner.load(id);
    if (!stored?.attempts.some((a) => a.txHash === txHash))
      this.violation(
        `${where}: build() handed out ${txHash.slice(0, 8)}, which the store does not hold`,
      );
  }
}

const TERMINAL = new Set(["final", "abandoned"]);

/** Where two plain values first differ, if they do */
const difference = (
  x: unknown,
  y: unknown,
  path: string,
): string | undefined => {
  if (
    typeof x !== "object" ||
    x === null ||
    typeof y !== "object" ||
    y === null
  )
    return Object.is(x, y)
      ? undefined
      : `${path}: ${JSON.stringify(x)?.slice(0, 80)} / ${JSON.stringify(y)?.slice(0, 80)}`;
  const a = x as Record<string, unknown>;
  const b = y as Record<string, unknown>;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = difference(a[key], b[key], `${path}.${key}`);
    if (found) return found;
  }
  return undefined;
};

/** The code of a thrown value, for the logs */
export const codeOf = (error: unknown) =>
  TxError.is(error)
    ? error.code
    : `not a TxError: ${String((error as Error)?.message ?? error).slice(0, 80)}`;

/** How a step ended: with a value or an error, or not yet, its process dead or paused */
export type StepEnd =
  | { readonly value: unknown; readonly hung?: undefined }
  | { readonly error: unknown; readonly hung?: undefined }
  | {
      readonly hung: true;
      readonly pending: Promise<{ value?: unknown; error?: unknown }>;
    };

/** Runs a step until it settles, or until its process dies or pauses in it */
export const runStep = async (
  proc: Process,
  step: () => Promise<unknown>,
  timeoutMs = 20_000,
): Promise<StepEnd> => {
  let settled = false;
  const pending = step().then(
    (value) => {
      settled = true;
      return { value };
    },
    (error: unknown) => {
      settled = true;
      return { error };
    },
  );
  const started = Date.now();
  for (;;) {
    const end = await Promise.race([pending, sleep(5)]);
    if (end !== undefined) return end as StepEnd;
    if ((proc.crashed || proc.parked) && !settled) {
      // What was already under way settles first; then the object is dropped
      await sleep(30);
      if (!settled) return { hung: true, pending };
    }
    if (Date.now() - started > timeoutMs)
      return { error: new Error("the step neither ended nor crashed") };
  }
};

export const sleep = (ms: number) =>
  new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms));
