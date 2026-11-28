import type { Budget, RedeemerTagType } from "../types";

const BRAND = Symbol.for("@meshsdk/common/ScriptEvaluationError");

/** One failed script, as an evaluator reports it */
export type ScriptFailure = {
  /** With `index`, the redeemer of the failed script */
  tag: RedeemerTagType;
  index: number;
  /** Why the script failed */
  message: string;
  /** What the script logged */
  logs: string[];
  /** What the script used, when the evaluator reports it */
  budget?: Budget;
};

/**
 * How an `IEvaluator` rejects when scripts fail, so that a builder can name the failing part.
 * Still an Error with the evaluator's message.
 */
export class ScriptEvaluationError extends Error {
  readonly name: "ScriptEvaluationError" = "ScriptEvaluationError";
  /** One entry per failed script */
  readonly failures: ScriptFailure[];
  /** The error the evaluator met, when there is one */
  declare readonly cause?: unknown;

  /**
   * @param message The evaluator's message
   * @param failures One entry per failed script
   */
  constructor(
    message: string,
    failures: ScriptFailure[],
    options?: { cause?: unknown },
  ) {
    super(message);
    this.failures = failures;
    if (options?.cause !== undefined) this.cause = options.cause;
  }

  /**
   * Whether a value is a `ScriptEvaluationError`, also one made by another copy of this
   * package, or an instance of a subclass
   */
  static is(error: unknown): error is ScriptEvaluationError {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as Record<symbol, unknown>)[BRAND] === true
    );
  }
}

Object.defineProperty(ScriptEvaluationError.prototype, BRAND, { value: true });
