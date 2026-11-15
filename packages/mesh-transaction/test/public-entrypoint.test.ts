import type {
  Assets,
  BuiltTxJSON,
  Linked,
  LinkedPart,
  OutputDatum,
  OutputScript,
  PlanDeadlines,
  PlanOptions,
  PlanStep,
  PlanSteps,
  RedeemerContext,
  ResumeOptions,
  RunOptions,
  SignOptions,
  SignTxOptions,
  SpendPart,
  StepChange,
  StepOptions,
  StepOutput,
  StepPartEntry,
  StepParts,
  StoredTxPlanJSON,
  SubmitFailureReason,
  TxInclusion,
  TxPlan,
  TxPlanJSON,
  TxPlanStatus,
  TxPlanStore,
  TxStep,
  TxStepJSON,
  TxStepStatus,
  Utxo,
  UtxoInput,
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
    "keySigner",
    "BuiltTx",
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

  it("does not export requiredSigner: guard.pubKey takes its place", () => {
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

  it("exports the types of a link to an earlier step, and not the functions that read one", () => {
    const vault: StepOutput = { step: "lock", output: "vault" };
    const change: StepChange = { step: "lock", change: true };
    const linked: Linked<SpendPart> = publicApi.spend.pubKey({ utxo: change });
    const parts: LinkedPart[] = [
      linked,
      publicApi.referenceInput({ utxo: vault }),
    ];
    expect(publicApi.unresolved(parts[1]!)).toEqual([
      { type: "link", link: vault },
    ]);
    for (const name of [
      "isStepLink",
      "toStepLink",
      "isLinkedPart",
      "incomplete",
      "unresolvedError",
    ])
      expect(publicApi).not.toHaveProperty(name);
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
    const status: TxStepStatus = "sent";
    const step: TxStepJSON = {
      name: "main",
      status,
      txHash: "ab".repeat(32),
      sends: 1,
      refused: 0,
      tx: {
        kind: "BuiltTx",
        version: 1,
        txHash: "ab".repeat(32),
        built: {},
        delivered: true,
      },
    };
    const planStatus: TxPlanStatus = "pending";
    const json: TxPlanJSON = {
      kind: "TxPlan",
      version: 2,
      rev: 2,
      status: planStatus,
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 120_000, confirmations: 3 },
      steps: [step],
      options: {},
    };
    expect(json.steps[0]?.status).toBe("sent");
    for (const name of [
      "advancePlan",
      "emptyPlan",
      "planStatus",
      "planUntil",
      "landedSteps",
      "liveSteps",
      "missingKeys",
    ])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the type of the reason of SUBMIT_FAILED, and not the function that reads it", () => {
    // The exact type is checked by the compiler in submitFailureCases
    const reasons: SubmitFailureReason[] = [
      "unavailable",
      "rateLimited",
      "unauthorized",
      "refused",
      "unknown",
    ];
    expect(reasons).toHaveLength(5);
    for (const name of ["submitFailure", "submitFailureText", "numericCodeOf"])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the deadline and wait types, and not the chain observer", () => {
    const deadlines: PlanDeadlines = {
      ttlMs: 600_000,
      expiryMarginMs: 0,
      confirmations: 0,
    };
    const waitFor: WaitTarget = "included";
    const run: RunOptions = { waitFor, timeoutMs: 1_000, pollMs: 10 };
    expect({ ...deadlines, ...run }).toHaveProperty("waitFor", "included");
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

  it("exports the plan class, its step and option types, and not its internal functions", () => {
    const options: PlanOptions = { id: "pay-1", ttlMs: 60_000 };
    const run: RunOptions = { waitFor: "included", signers: [] };
    const sign: SignOptions = { signers: [] };
    expect({ ...options, ...run, ...sign }).toHaveProperty("id", "pay-1");
    const pay = publicApi.output({
      address:
        "addr_test1vz46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2cw5nyuy",
      value: { lovelace: 2_000_000n },
    });
    const entry: StepPartEntry = [pay, false];
    const parts: StepParts = [entry];
    const own: StepOptions = { fee: 200_000n };
    const one: PlanStep = { parts, ...own };
    const steps: PlanSteps = {
      lock: pay,
      unlock: [
        publicApi.spend.pubKey({ utxo: { step: "lock", change: true } }),
      ],
      refund: one,
    };
    expect(Object.keys(steps)).toEqual(["lock", "unlock", "refund"]);
    expect(typeof publicApi.TxPlan).toBe("function");
    for (const method of [
      "sign",
      "addWitnesses",
      "run",
      "refresh",
      "stop",
      "step",
      "toJSON",
    ])
      expect(
        typeof (
          publicApi.TxPlan.prototype as unknown as Record<string, unknown>
        )[method],
      ).toBe("function");
    for (const name of [
      "createPlan",
      "resumePlan",
      "planFor",
      "makePlan",
      "orderOf",
      "recordOf",
      "standingSteps",
      "LiveObjects",
      "MAIN_STEP",
      "MAX_STEPS",
    ])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the class of a built transaction, its sign options and its inclusion, and not its factory", () => {
    const sign: SignTxOptions = { signers: [], partial: false };
    expect(sign.partial).toBe(false);
    // Every member is optional: without signers the payer of the build signs
    const none: SignTxOptions = {};
    expect(none).toEqual({});
    const found: TxInclusion = { txHash: "00".repeat(32), slot: 1 };
    expect(found.slot).toBe(1);
    expect(typeof publicApi.BuiltTx).toBe("function");
    for (const method of ["sign", "addWitnesses", "submit", "awaitInclusion"])
      expect(
        typeof (
          publicApi.BuiltTx.prototype as unknown as Record<string, unknown>
        )[method],
      ).toBe("function");
    for (const name of ["makeBuiltTx", "NO_REBUILD", "isWallet"])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the JSON type of a built transaction and restore, and not their encoding", () => {
    const json: BuiltTxJSON = {
      kind: "BuiltTx",
      version: 1,
      txHash: "00".repeat(32),
      built: {},
      delivered: true,
    };
    expect(json.kind).toBe("BuiltTx");
    expect(typeof publicApi.BuiltTx.prototype.toJSON).toBe("function");
    expect(typeof publicApi.TxBuilder.prototype.restore).toBe("function");
    for (const name of [
      "restoreBuiltTx",
      "encodeBuilt",
      "decodeBuilt",
      "unquoted",
    ])
      expect(publicApi).not.toHaveProperty(name);
  });

  it("exports the store types and functions, and not the record encoding", async () => {
    const store: TxPlanStore = publicApi.memoryPlanStore();
    const json: StoredTxPlanJSON = {
      kind: "TxPlan",
      version: 2,
      id: "pay-1",
      rev: 1,
      status: "stopped",
      stopped: true,
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 0, confirmations: 0 },
      steps: [],
      options: {},
    };
    expect(await store.save(json, 0)).toBe(true);
    expect(await store.load("pay-1")).toEqual(json);
    const resume: ResumeOptions = { trace: () => undefined };
    expect(typeof resume.trace).toBe("function");
    expect(typeof publicApi.TxBuilder.prototype.resume).toBe("function");
    for (const name of ["resumePlan", "loadRecord", "readFirst"])
      expect(publicApi).not.toHaveProperty(name);
    await expect(publicApi.checkPlanStore(store)).resolves.toBeUndefined();
    for (const name of [
      "encodeParts",
      "decodeParts",
      "encodePlan",
      "readPlan",
      "encodeGiven",
      "PLAN_RECORD_VERSION",
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
  const stepStatuses: Equal<
    TxStepStatus,
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
    "pending" | "stopping" | "stopped" | "final"
  > = true;
  const waitTargets: Equal<WaitTarget, "sent" | "included" | "final"> = true;
  void stepStatuses;
  void planStatuses;
  void waitTargets;
};

/** Checked by the compiler only: the plan as the builder makes it and as it shows its steps */
export const planCases = async (builder: publicApi.TxBuilder) => {
  const plan: TxPlan = await builder.plan([], { payer: "addr_test1" });
  const again: Promise<TxPlan> = builder.resume(plan.toJSON());
  const byId: Promise<TxPlan> = builder.resume("pay-1", { payer: "addr" });
  const step: TxStep = plan.step("main");
  const steps: readonly TxStep[] = plan.steps;
  const name: string = step.name;
  const fee: bigint = plan.fee;
  // @ts-expect-error a plan is made by builder.plan only
  new publicApi.TxPlan();
  // @ts-expect-error a step of a plan is data, not a BuiltTx
  void step.sign;
  // @ts-expect-error builder.plan returns a promise of the plan
  builder.plan([], {}).run();
  void again;
  void byId;
  void steps;
  void name;
  void fee;
};

/** Checked by the compiler only: the exact reasons of SUBMIT_FAILED, and its details as narrowed */
export const submitFailureCases = (error: unknown) => {
  const reasons: Equal<
    SubmitFailureReason,
    "unavailable" | "rateLimited" | "unauthorized" | "refused" | "unknown"
  > = true;
  void reasons;
  if (publicApi.TxError.is(error, "SUBMIT_FAILED")) {
    const reason: Equal<typeof error.details.reason, SubmitFailureReason> =
      true;
    const status: Equal<typeof error.details.status, number | undefined> = true;
    const walletCode: Equal<
      typeof error.details.walletCode,
      number | undefined
    > = true;
    void reason;
    void status;
    void walletCode;
  }
};
