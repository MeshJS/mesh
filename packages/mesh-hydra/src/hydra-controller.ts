import { ActorRefFrom, createActor, StateValue } from "xstate";
import { machine } from "./state-management/hydra-machine";
import { Emitter } from "./utils/emitter";

type ConnectOptions = {
  baseURL: string;
  address?: string;
  snapshot?: boolean;
  history?: boolean;
};

type HydraStateName = "*"
  | "Disconnected"
  | "Connecting"
  | "Connected.Idle"
  | "Connected.Initializing.ReadyToCommit"
  | "Connected.Open"
  | "Connected.Closed"
  | "Connected.Final"

type Snapshot = ReturnType<ActorRefFrom<typeof machine>['getSnapshot']>;

type Events = {
  '*': (snapshot: Snapshot) => void; } & {
  [K in HydraStateName]: (snapshot: Snapshot) => void;
};

export class HydraController {
  private actor = createActor(machine);
  private emitter = new Emitter<Events>();
  private _currentSnapshot?: Snapshot;

  constructor() {
    this.actor.subscribe({
      next: (snapshot) => this.handleState(snapshot),
      error: (err) => console.error("Hydra error:", err),
    });
    this.actor.start();
  }

  /** Connect to the Hydra head */
  connect(options: ConnectOptions) {
    this.actor.send({ type: "Connect", ...options });
  }

  /** Protocol commands */
  init() { this.actor.send({ type: "Init" }); }
  commit(data: unknown = {}) { this.actor.send({ type: "Commit", data }); }
  newTx(tx: unknown) { this.actor.send({ type: "NewTx", tx }); }
  recover(txHash: unknown) { this.actor.send({ type: "Recover", txHash }); }
  decommit(tx: unknown) { this.actor.send({ type: "Decommit", tx }); }
  close() { this.actor.send({ type: "Close" }); }
  contest() { this.actor.send({ type: "Contest" }); }
  fanout() { this.actor.send({ type: "Fanout" }); }

  private handleState(snapshot: Snapshot) {
    if (JSON.stringify(snapshot.value) === JSON.stringify(this._currentSnapshot?.value)) return;
    this._currentSnapshot = snapshot;
    this.emitter.emit("*", snapshot);
    this.emitter.emit(_flattenState(snapshot.value), snapshot);
  }

  on(state: HydraStateName, fn: (s: Snapshot) => void) {
    return this.emitter.on(state, fn);
  }

  once(state: HydraStateName, fn: (s: Snapshot) => void) {
    return this.emitter.once(state, fn);
  }

  off(state: HydraStateName, fn: (s: Snapshot) => void) {
    return this.emitter.off(state, fn);
  }

  waitFor(state: HydraStateName, timeout?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMatch = () => {
        clearTimeout(timer);
        this.off(state, onMatch);
        resolve();
      };

      const timer = timeout
        ? setTimeout(() => {
            this.off(state, onMatch);
            reject(new Error(`Timeout waiting for state "${state}"`));
          }, timeout)
        : undefined;

      this.once(state, onMatch);
    });
  }

  stop() {
    this.actor.stop();
    this.emitter.clear();
    this._currentSnapshot = undefined;
  }

  get state() {
    return this._currentSnapshot?.value;
  }

  get context() {
    return this._currentSnapshot?.context;
  }
}

function _flattenState(value: StateValue): HydraStateName {
  if (typeof value === "string") return value as HydraStateName;
  return Object.entries(value)
    .map(([k, v]) => v ? `${k}.${_flattenState(v)}` : k)
    .join(".") as HydraStateName;
}
