import type { TxPart, Unresolved } from "./parts/types";

export type TxBuildErrorCode =
  /** A part still leaves something to be filled in; `details` lists the gaps */
  | "UNRESOLVED"
  /** Two parts claim what a transaction holds only once: an input, a policy, a voter, ... */
  | "DUPLICATE_PART"
  /** Collateral inputs that cannot cover the total collateral */
  | "INVALID_COLLATERAL"
  /** Something has to be looked up, and no fetcher is given */
  | "MISSING_FETCHER"
  /** An output referenced by the transaction does not exist, or could not be fetched */
  | "UTXO_NOT_FOUND"
  /** A protocol parameter the transaction needs is not known */
  | "MISSING_PARAMETER"
  /** Execution units have to be worked out, and no evaluator is given */
  | "MISSING_EVALUATOR"
  /** The evaluator failed, or did not price every redeemer */
  | "EVALUATION_FAILED"
  /** A script needs more execution units than its redeemer states */
  | "EXUNITS_TOO_LOW"
  /** The transaction's scripts need more execution units than a transaction may use */
  | "EXUNITS_EXCEEDED"
  /** Execution units did not settle within the allowed evaluation rounds */
  | "EVALUATION_NOT_CONVERGED"
  /** The available UTxOs cannot pay for the transaction */
  | "INSUFFICIENT_FUNDS"
  /** No collateral, or not enough, can be put up for the transaction's scripts */
  | "INSUFFICIENT_COLLATERAL"
  /** An output holds less lovelace than the ledger requires */
  | "OUTPUT_BELOW_MIN_COIN"
  /** An output's value is larger than the ledger allows */
  | "VALUE_TOO_LARGE"
  /** The transaction is larger than the ledger allows */
  | "TX_TOO_LARGE"
  /** The fee given is below the transaction's minimum fee */
  | "FEE_TOO_LOW"
  /** Balancing did not settle on a fee within the allowed rounds */
  | "FEE_NOT_CONVERGED"
  /** The serializer cannot serialize a `TransactionPrototype` */
  | "UNSUPPORTED_SERIALIZER";

/** A part's gaps, as listed in an `UNRESOLVED` error */
export type PartGaps = {
  kind: TxPart["kind"];
  label?: string;
  gaps: Unresolved[];
};

/**
 * Raised when parts cannot be put together into a transaction, or the transaction cannot be
 * completed: resolved, balanced or evaluated. Unlike `TxPartError`, which points at a single
 * part builder call, this concerns the parts as a whole.
 */
export class TxBuildError extends Error {
  readonly code: TxBuildErrorCode;
  /** Kind of the part the error is about, if it is about one */
  readonly part?: TxPart["kind"];
  /** Label of that part, if any */
  readonly label?: string;
  /** Structured context: the gaps, the conflicting item, ... */
  readonly details?: unknown;

  constructor(
    code: TxBuildErrorCode,
    message: string,
    context: {
      part?: TxPart["kind"];
      label?: string;
      details?: unknown;
    } = {},
  ) {
    const { part, label, details } = context;
    const prefix =
      part === undefined
        ? ""
        : `${part}${label === undefined ? "" : ` "${label}"`}: `;
    super(`${prefix}${message}`);
    this.name = "TxBuildError";
    this.code = code;
    if (part !== undefined) this.part = part;
    if (label !== undefined) this.label = label;
    if (details !== undefined) this.details = details;
  }
}
