import type {
  RedeemerContext,
  TxAttempt,
  TxAttemptStatus,
  TxIntentJSON,
  TxIntentStatus,
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
    "TxIntentError",
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
  ])("exports %s", (name) => {
    expect(publicApi).toHaveProperty(name);
  });

  it("no longer exports requiredSigner: guard.pubKey takes its place", () => {
    expect(publicApi).not.toHaveProperty("requiredSigner");
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

  it("exports the intent record types, and not the intent state machine", () => {
    const status: TxAttemptStatus = "sent";
    const attempt: TxAttempt = {
      txHash: "ab".repeat(32),
      status,
      until: 1_700_000_000_000,
      sends: 1,
      parents: [{ txHash: "cd".repeat(32), until: 1_700_000_000_000 }],
    };
    const intentStatus: TxIntentStatus = "draft";
    const json: TxIntentJSON = {
      kind: "TxIntent",
      version: 1,
      rev: 0,
      status: intentStatus,
      network: "preprod",
      deadlines: { ttlMs: 600_000, expiryMarginMs: 120_000, confirmations: 3 },
      attempts: [attempt],
      anchor: undefined,
      parts: [],
      options: {},
    };
    expect(json.attempts[0]?.status).toBe("sent");
    expect(publicApi).not.toHaveProperty("advanceIntent");
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
  const intentStatuses: Equal<
    TxIntentStatus,
    TxAttemptStatus | "draft" | "abandoned"
  > = true;
  void attemptStatuses;
  void intentStatuses;
};
