import type { TxPart, Unresolved } from "./parts/types";

export type TxBuildErrorCode =
  /** A part still leaves something to be filled in; `details` lists the gaps */
  | "UNRESOLVED"
  /** Two parts claim what a transaction holds only once: an input, a policy, a voter, ... */
  | "DUPLICATE_PART"
  /** Collateral inputs that cannot cover the total collateral */
  | "INVALID_COLLATERAL";

/** A part's gaps, as listed in an `UNRESOLVED` error */
export type PartGaps = {
  kind: TxPart["kind"];
  label?: string;
  gaps: Unresolved[];
};

/**
 * Raised when parts cannot be put together into a transaction. Unlike `TxPartError`, which
 * points at a single part builder call, this concerns the parts as a whole.
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
