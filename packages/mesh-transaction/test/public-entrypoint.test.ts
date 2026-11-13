import type {
  Assets,
  OutputDatum,
  OutputScript,
  PlanDeadlines,
  PlanOptions,
  RedeemerContext,
  ResumeOptions,
  SendOptions,
  SignOptions,
  StoredTxPlanJSON,
  TxAttempt,
  TxAttemptStatus,
  TxPlanJSON,
  TxPlanStatus,
  TxPlanStore,
  Utxo,
  UtxoInput,
  WaitOptions,
  WaitTarget,
} from "../src";
import * as publicApi from "../src";

describe("public entrypoint", () => {
  it.each([
    "spend",
    "referenceInput",
    "collateral",
    "collateralReturn",
    "output",
    "unresolved",
    "TxPartError",
    "assembleTxPrototype",
    "TxError",
    "TxBuildError",
    "TxPlanError",
    "TxBuilder",
    "canSubmit",
    "outputOf",
    "utxosAfter",
    "signWitnesses",
    "addWitnesses",
    "signedKeyHashes",
    "requiredSigners",
    "guard",
    "message",
    "minFee",
    "minCoin",
    "TxPlan",
    "memoryPlanStore",
    "checkPlanStore",
    "toUtxo",
    "toMeshUtxo",
  ])("exports %s", (name) => {
    expect(publicApi).toHaveProperty(name);
  });

  it("no longer exports requiredSigner: guard.pubKey takes its place", () => {
    expect(publicApi).not.toHaveProperty("requiredSigner");
  });

  it("exports the UTxO types and converters, and not the reader behind them", () => {
    const value: Assets = { lovelace: 2_000_000n };
    const datum: OutputDatum = { type: "hash", hash: "ab".repeat(32) };
    const script: OutputScript = { type: "unknown", scriptRef: "8204aa" };
    const utxo: Utxo = {
      txHash: "cd".repeat(32),
      outputIndex: 0,
      address:
        "addr_test1vz46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2cw5nyuy",
      value,
      datum,
      script,
    };
    const given: UtxoInput = publicApi.toMeshUtxo(utxo);
    expect(publicApi.toUtxo(given)).toEqual(utxo);
    expect(Object.prototype.hasOwnProperty.call(publicApi, "toUtxo")).toBe(
      true,
    );
    for (const name of [
      "readUtxo",
      "readOutRef",
      "UtxoError",
      "describeScriptRef",
      "scriptRefOf",
      "scriptSize",
      "outRefOf",
      "utxoKey",
      "plainUtxo",
      "valueOf",
      "toAssets",
    ])
      // Own members only: every object has a valueOf
      expect(Object.prototype.hasOwnProperty.call(publicApi, name)).toBe(false);
  });

  it("exports the type RedeemerContext", () => {
    const lookups: (keyof RedeemerContext)[] = [
      "self",
      "inputs",
      "input",
      "referenceInput",
      "output",
    ];
    expect(lookups).toHaveLength(5);
  });

  it("exports the plan record types, and not the plan state machine", () => {
    const status: TxAttemptStatus = "sent";
    const attempt: TxAttempt = {
      txHash: "ab".repeat(32),
      status,
      until: 1_700_000_000_000,
      sends: 1,
      parents: [{ txHash: "cd".repeat(32), until: 1_700_000_000_000 }],
    };
    const planStatus: TxPlanStatus = "draft";
    const json: TxPlanJSON = {
      kind: "TxPlan",
      version: 1,
      rev: 0,
      status: planStatus,
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 120_000, confirmations: 3 },
      attempts: [attempt],
      anchor: undefined,
      parts: [],
      options: {},
    };
    expect(json.attempts[0]?.status).toBe("sent");
    expect(publicApi).not.toHaveProperty("advancePlan");
  });

  it("exports the deadline and wait types, and not the chain observer", () => {
    const deadlines: PlanDeadlines = {
      ttlMs: 600_000,
      expiryMarginMs: 0,
      confirmations: 0,
    };
    const waitFor: WaitTarget = "included";
    const wait: WaitOptions = { waitFor, timeoutMs: 1_000, pollMs: 10 };
    expect({ ...deadlines, ...wait }).toHaveProperty("waitFor", "included");
    for (const name of [
      "ChainObserver",
      "chainObserver",
      "errorFact",
      "isRefusal",
      "keepsAddressCache",
      "searchThenTip",
      "checkPlanDefaults",
      "effectiveDeadlines",
      "effectiveWait",
      "horizonSlot",
    ])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the plan class and its option types, and not its internal functions", () => {
    const options: PlanOptions = { id: "pay-1", ttlMs: 60_000 };
    const send: SendOptions = { waitFor: "included", signers: [] };
    const sign: SignOptions = { signers: [] };
    expect({ ...options, ...send, ...sign }).toHaveProperty("id", "pay-1");
    expect(typeof publicApi.TxPlan).toBe("function");
    for (const name of [
      "createPlan",
      "planOver",
      "recordOf",
      "PlanLiveObjects",
    ])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the store types and functions, and not the record encoding", async () => {
    const store: TxPlanStore = publicApi.memoryPlanStore();
    const json: StoredTxPlanJSON = {
      kind: "TxPlan",
      version: 1,
      id: "pay-1",
      rev: 1,
      status: "abandoned",
      closing: true,
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 0 },
      attempts: [],
      anchor: { anchors: [] },
      parts: [],
      options: {},
    };
    expect(await store.save(json, 0)).toBe(true);
    expect(await store.load("pay-1")).toEqual(json);
    const resume: ResumeOptions = { canSelect: () => true };
    expect(typeof resume.canSelect).toBe("function");
    expect(typeof publicApi.TxBuilder.prototype.resume).toBe("function");
    for (const name of ["resumePlan", "loadRecord", "readFirst"])
      expect(publicApi).not.toHaveProperty(name);
    await expect(publicApi.checkPlanStore(store)).resolves.toBeUndefined();
    for (const name of [
      "encodeParts",
      "decodeParts",
      "encodePlan",
      "readPlan",
      "readPlanWith",
      "PLAN_RECORD_VERSION",
      "migrations",
      "UnreadContent",
      "NOT_UNPAID",
    ])
      expect(publicApi).not.toHaveProperty(name);
  });
});

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Checked by the compiler only: the exact status values */
export const statusCases = () => {
  const attemptStatuses: Equal<
    TxAttemptStatus,
    | "built"
    | "signed"
    | "sent"
    | "rejected"
    | "included"
    | "expired"
    | "failed"
    | "orphaned"
    | "final"
  > = true;
  const planStatuses: Equal<
    TxPlanStatus,
    TxAttemptStatus | "draft" | "abandoned"
  > = true;
  const waitTargets: Equal<WaitTarget, "sent" | "included" | "final"> = true;
  void attemptStatuses;
  void planStatuses;
  void waitTargets;
};
