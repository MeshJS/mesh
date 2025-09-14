import { ActorRefFrom, createActor, StateValue, Subscription } from "xstate";
import {
  createHydraMachine,
  HydraMachineConfig,
  Transaction,
} from "./state-management/hydra-machine";
import { Emitter } from "./utils/emitter";
import { HTTPClient } from "./utils";

type ConnectOptions = {
  baseURL: string;
  address?: string;
  snapshot?: boolean;
  history?: boolean;
};

type HydraStateName =
  | "*"
  | "Disconnected"
  | "Connected"
  | "Connected.Handshake"
  | "Connected.NoHead"
  | "Connected.Initializing"
  | "Connected.Initializing.Waiting"
  | "Connected.Initializing.Depositing"
  | "Connected.Initializing.Depositing.ReadyToCommit"
  | "Connected.Initializing.Depositing.RequestDraft"
  | "Connected.Initializing.Depositing.AwaitSignature"
  | "Connected.Initializing.Depositing.SubmittingDeposit"
  | "Connected.Initializing.Depositing.AwaitingCommitConfirmation"
  | "Connected.Open"
  | "Connected.Open.Active"
  | "Connected.Open.Depositing"
  | "Connected.Open.Depositing.ReadyToCommit"
  | "Connected.Open.Depositing.RequestDraft"
  | "Connected.Open.Depositing.AwaitSignature"
  | "Connected.Open.Depositing.SubmittingDeposit"
  | "Connected.Open.Depositing.AwaitingCommitConfirmation"
  | "Connected.Closed"
  | "Connected.FanoutPossible"
  | "Connected.Final";

type Snapshot = ReturnType<
  ActorRefFrom<ReturnType<typeof createHydraMachine>>["getSnapshot"]
>;

type Events = {
  "*": (snapshot: Snapshot) => void;
} & {
  [K in HydraStateName]: (snapshot: Snapshot) => void;
};

export class HydraController {
  private actor: ActorRefFrom<ReturnType<typeof createHydraMachine>>;
  private emitter = new Emitter<Events>();
  private _currentSnapshot?: Snapshot;
  private httpClient?: HTTPClient;
  private subscription?: Subscription;

  constructor(config?: HydraMachineConfig) {
    this.actor = createActor(createHydraMachine(config));
    this.subscription = this.actor.subscribe({
      next: (snapshot) => this.handleState(snapshot),
      error: (err) => console.error("Hydra error:", err),
    });
    this.actor.start();
  }

  /** Connect to the Hydra head */
  connect(options: ConnectOptions) {
    this.actor.send({ type: "Connect", ...options });
    this.httpClient = new HTTPClient(options.baseURL);
  }

  /** Protocol commands */
  init() {
    this.validateStateForOperation("Init", [
      "Connected.NoHead",
      "Connected.Final",
    ]);
    this.actor.send({ type: "Init" });
  }

  commit(data: Record<string, unknown> = {}) {
    this.validateStateForOperation("Commit", [
      "Connected.Initializing.Waiting",
      "Connected.Initializing.Depositing.ReadyToCommit",
      "Connected.Open.Active",
    ]);
    this.actor.send({ type: "Commit", data });
  }

  newTx(tx: Transaction) {
    this.validateStateForOperation("NewTx", ["Connected.Open"]);
    this.actor.send({ type: "NewTx", tx });
  }

  recover(txHash: string) {
    this.validateStateForOperation("Recover", ["Connected.Open"]);
    this.actor.send({ type: "Recover", txHash });
  }

  decommit(tx: Transaction) {
    this.validateStateForOperation("Decommit", ["Connected.Open"]);
    this.actor.send({ type: "Decommit", tx });
  }

  close() {
    this.validateStateForOperation("Close", ["Connected.Open"]);
    this.actor.send({ type: "Close" });
  }

  contest() {
    this.validateStateForOperation("Contest", ["Connected.Closed"]);
    this.actor.send({ type: "Contest" });
  }

  fanout() {
    this.validateStateForOperation("Fanout", ["Connected.FanoutPossible"]);
    this.actor.send({ type: "Fanout" });
  }

  sideLoadSnapshot(snapshot: unknown) {
    this.validateStateForOperation("SideLoadSnapshot", ["Connected.Open"]);
    this.actor.send({ type: "SideLoadSnapshot", snapshot });
  }

  /** HTTP API methods */
  async getHeadState() {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.get("/head");
  }

  async getPendingDeposits() {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.get("/commits");
  }

  async recoverDeposit(txId: string) {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.delete(`/commits/${txId}`);
  }

  async getLastSeenSnapshot() {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.get("/snapshot/last-seen");
  }

  async getConfirmedUTxO() {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.get("/snapshot/utxo");
  }

  async getConfirmedSnapshot() {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.get("/snapshot");
  }

  async postSideLoadSnapshot(snapshot: unknown) {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.post("/snapshot", snapshot);
  }

  async postDecommit(tx: unknown) {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.post("/decommit", tx);
  }

  async getProtocolParameters() {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.get("/protocol-parameters");
  }

  async submitCardanoTransaction(tx: Transaction) {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.post("/cardano-transaction", tx);
  }

  async submitL2Transaction(tx: Transaction) {
    if (!this.httpClient) throw new Error("Not connected");
    return await this.httpClient.post("/transaction", tx);
  }

  private handleState(snapshot: Snapshot) {
    if (
      JSON.stringify(snapshot.value) ===
      JSON.stringify(this._currentSnapshot?.value)
    )
      return;
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
    this.subscription?.unsubscribe();
    this.actor.stop();
    this.emitter.clear();
    this._currentSnapshot = undefined;
    this.httpClient = undefined;
    this.subscription = undefined;
  }

  /**
   * Validates if the current state allows the specified operation
   */
  private validateStateForOperation(
    operation: string,
    allowedStates: string[],
  ) {
    const currentState = _flattenState(this.state || "");
    const isAllowed = allowedStates.some(
      (state) => currentState.includes(state) || currentState === state,
    );

    if (!isAllowed) {
      throw new Error(
        `Operation '${operation}' is not allowed in current state: ${currentState}. ` +
          `Allowed states: ${allowedStates.join(", ")}`,
      );
    }
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
    .map(([k, v]) => (v ? `${k}.${_flattenState(v)}` : k))
    .join(".") as HydraStateName;
}
