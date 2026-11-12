import {
  PartGaps,
  TxBuildError,
  TxBuildErrorCode,
  TxError,
  TxErrorCode,
  TxIntentError,
  TxIntentErrorCode,
  TxPart,
  TxPartError,
  TxPartErrorCode,
} from "../../src/tx-builder";
import {
  TX_BUILD_ERROR_CODES,
  TX_INTENT_ERROR_CODES,
} from "../../src/tx-builder/errors";
import { TX_PART_ERROR_CODES } from "../../src/tx-builder/parts/errors";

const partError = (code: TxPartErrorCode, cause?: unknown) =>
  new TxPartError(code, "output", "bad", "pay", cause);
// Details as the code would carry them do not matter to the checks
const buildError = (code: TxBuildErrorCode) =>
  new TxBuildError(code, "bad", {} as never);
const intentError = (code: TxIntentErrorCode, details?: unknown) =>
  new TxIntentError(code, "bad", { details } as never);

type Made = { error: TxError; cls: Function; name: string };
const make = (code: TxErrorCode): Made => {
  if ((TX_PART_ERROR_CODES as string[]).includes(code))
    return {
      error: partError(code as TxPartErrorCode),
      cls: TxPartError,
      name: "TxPartError",
    };
  if ((TX_BUILD_ERROR_CODES as string[]).includes(code))
    return {
      error: buildError(code as TxBuildErrorCode),
      cls: TxBuildError,
      name: "TxBuildError",
    };
  return {
    error: intentError(code as TxIntentErrorCode),
    cls: TxIntentError,
    name: "TxIntentError",
  };
};

const ALL: TxErrorCode[] = [
  ...TX_PART_ERROR_CODES,
  ...TX_BUILD_ERROR_CODES,
  ...TX_INTENT_ERROR_CODES,
];
/** A code of another class than the one `code` belongs to */
const otherClassCode = (code: TxErrorCode): TxErrorCode =>
  (TX_BUILD_ERROR_CODES as string[]).includes(code)
    ? "REJECTED"
    : "FEE_TOO_LOW";

describe("the error tree", () => {
  it.each(ALL)("%s: its class, its name, and every check", (code) => {
    const { error, cls, name } = make(code);
    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TxError);
    expect(error).toBeInstanceOf(cls);
    expect(TxError.is(error)).toBe(true);
    expect(TxError.is(error, code)).toBe(true);
    expect(TxError.is(error, otherClassCode(code))).toBe(false);
    expect(TxBuildError.is(error)).toBe(cls === TxBuildError);
    expect(TxIntentError.is(error)).toBe(cls === TxIntentError);
    expect(TxPartError.is(error)).toBe(true);
  });

  it("gives a part error no check of its own", () => {
    expect(TxPartError.is).toBe(TxError.is);
  });

  it("holds every code in one class only", () => {
    const lists = [
      TX_PART_ERROR_CODES,
      TX_BUILD_ERROR_CODES,
      TX_INTENT_ERROR_CODES,
    ];
    expect(lists.map((list) => list.length)).toEqual([7, 30, 24]);
    for (const list of lists) expect(new Set(list).size).toBe(list.length);
    expect(new Set(ALL).size).toBe(7 + 30 + 24);
  });

  it("holds for nothing outside the tree, and never throws", () => {
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error("no");
        },
      },
    );
    for (const value of [
      undefined,
      null,
      "x",
      new Error("x"),
      { code: "INSUFFICIENT_FUNDS" },
      Object.assign(new Error("x"), { code: "REJECTED" }),
      throwing,
    ]) {
      expect(TxError.is(value)).toBe(false);
      expect(TxError.is(value, "INSUFFICIENT_FUNDS", "REJECTED")).toBe(false);
      expect(TxBuildError.is(value)).toBe(false);
      expect(TxIntentError.is(value)).toBe(false);
    }
  });

  it("checks several codes at once, of any classes", () => {
    for (const code of ["REJECTED", "EXPIRED"] as const)
      expect(TxError.is(intentError(code), "REJECTED", "EXPIRED")).toBe(true);
    expect(TxError.is(intentError("ORPHANED"), "REJECTED", "EXPIRED")).toBe(
      false,
    );
    expect(
      TxError.is(buildError("FEE_TOO_LOW"), "FEE_TOO_LOW", "REJECTED"),
    ).toBe(true);
    expect(TxError.is(intentError("REJECTED"), "FEE_TOO_LOW", "REJECTED")).toBe(
      true,
    );
    expect(
      TxIntentError.is(intentError("EXPIRED"), "REJECTED", "EXPIRED"),
    ).toBe(true);
    expect(TxBuildError.is(buildError("FEE_TOO_LOW"), "FEE_TOO_LOW")).toBe(
      true,
    );
    expect(TxBuildError.is(buildError("FEE_TOO_LOW"), "TX_TOO_LARGE")).toBe(
      false,
    );
  });

  it("holds across two copies of the package", () => {
    let copy: typeof import("../../src/tx-builder/errors") | undefined;
    jest.isolateModules(() => {
      copy = require("../../src/tx-builder/errors");
    });
    expect(copy!.TxBuildError).not.toBe(TxBuildError);
    const other = new copy!.TxBuildError("FEE_TOO_LOW", "bad", {
      details: { fee: 1n, minFee: 2n },
    });
    expect(other instanceof TxBuildError).toBe(false);
    expect(TxError.is(other)).toBe(true);
    expect(TxError.is(other, "FEE_TOO_LOW")).toBe(true);
    expect(TxBuildError.is(other, "FEE_TOO_LOW")).toBe(true);
    expect(TxIntentError.is(other)).toBe(false);
  });

  it("carries the part, label, cause and details, and is not retryable", () => {
    const cause = new Error("parser");
    const part = partError("INVALID_DATA", cause);
    expect(part.cause).toBe(cause);
    expect(part.message).toBe('output "pay": bad');
    expect(partError("INVALID_DATA").cause).toBeUndefined();

    const details = { fee: 1n, minFee: 2n };
    const build = new TxBuildError("FEE_TOO_LOW", "bad", {
      part: "output",
      label: "pay",
      details,
      cause,
    });
    expect(build.message).toBe('output "pay": bad');
    expect(build.details).toBe(details);
    expect(build.cause).toBe(cause);
    expect(build).toMatchObject({ part: "output", label: "pay" });
    expect(new TxBuildError("ABORTED", "bad").message).toBe("bad");

    for (const error of [
      ...TX_PART_ERROR_CODES.map((code) => partError(code)),
      ...TX_BUILD_ERROR_CODES.map(buildError),
    ]) {
      expect(error.retryable).toBe(false);
      expect(error.retryAfterMs).toBeUndefined();
    }
    for (const code of ALL) expect("step" in make(code).error).toBe(false);
  });

  it("decides whether an intent error is retryable by its code", () => {
    const retryable = [
      "SUBMIT_FAILED",
      "CONFIRM_TIMEOUT",
      "NOT_YET_VALID",
      "STILL_LIVE",
    ];
    for (const code of TX_INTENT_ERROR_CODES) {
      const error = new TxIntentError(code, "bad", {
        retryAfterMs: 500,
        intentId: "intent-1",
        txHash: "ab".repeat(32),
      } as never);
      const expected = retryable.includes(code);
      expect(error.retryable).toBe(expected);
      expect(error.retryAfterMs).toBe(expected ? 500 : undefined);
      expect(error.intentId).toBe("intent-1");
      expect(error.txHash).toBe("ab".repeat(32));
    }
    const observe = (
      reason: TxIntentError<"CANNOT_OBSERVE">["details"]["reason"],
    ) =>
      new TxIntentError("CANNOT_OBSERVE", "bad", {
        details: { reason },
        retryAfterMs: 1000,
      });
    expect(observe("unconfirmed")).toMatchObject({
      retryable: true,
      retryAfterMs: 1000,
    });
    for (const reason of [
      "noTip",
      "noValidity",
      "noDepth",
      "noSearch",
      "addressCache",
    ] as const) {
      expect(observe(reason).retryable).toBe(false);
      expect(observe(reason).retryAfterMs).toBeUndefined();
    }
    expect(observe("noTip").message).toBe("bad");
  });
});

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Checked by the compiler only: how the checks narrow */
export const typeCases = (e: unknown) => {
  if (TxError.is(e, "ORPHANED", "EXPIRED")) {
    const narrowed: Equal<typeof e.details.otherLive, string[]> = true;
    void narrowed;
  }
  if (TxError.is(e, "REJECTED")) {
    const narrowed: Equal<typeof e.details.otherLive, string[]> = true;
    void narrowed;
  }
  if (TxError.is(e, "INSUFFICIENT_FUNDS")) {
    const narrowed: Equal<typeof e.details.missing, bigint> = true;
    void narrowed;
  }
  if (TxError.is(e, "UNRESOLVED")) {
    const narrowed: Equal<typeof e.details, PartGaps[]> = true;
    void narrowed;
  }
  if (TxError.is(e, "MISSING_EVALUATOR")) {
    const narrowed: Equal<typeof e.details, undefined> = true;
    void narrowed;
  }
  if (TxError.is(e, "INVALID_DATA")) {
    const narrowed: Equal<typeof e.part, TxPart["kind"]> = true;
    void narrowed;
  }
  if (TxBuildError.is(e, "FEE_TOO_LOW")) {
    const narrowed: Equal<typeof e.details.minFee, bigint> = true;
    void narrowed;
  }
  if (TxError.is(e)) {
    const code: TxErrorCode = e.code;
    void code;
  }
  // @ts-expect-error not a code
  TxError.is(e, "NOPE");
  // @ts-expect-error a code of another class
  TxIntentError.is(e, "INVALID_DATA");
  // @ts-expect-error details of another code
  new TxBuildError("FEE_TOO_LOW", "m", { details: { unit: "lovelace" } });
  // @ts-expect-error details its code has
  new TxBuildError("FEE_TOO_LOW", "m");
};
