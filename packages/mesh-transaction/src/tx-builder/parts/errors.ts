import type { TxPart } from "./types";
import { brandClass, TxError } from "../errors";

export type TxPartErrorCode =
  /** An output reference that cannot exist: bad hash or index */
  | "INVALID_OUT_REF"
  /** An address that does not parse */
  | "INVALID_ADDRESS"
  /** Malformed lovelace or asset quantities, units or policies */
  | "INVALID_VALUE"
  /** A script that does not parse, or a reference output holding no (suitable) script */
  | "INVALID_SCRIPT"
  /** Plutus data that does not parse, or a malformed hash */
  | "INVALID_DATA"
  /** A witness that cannot authorise the output it is given for */
  | "WITNESS_MISMATCH"
  /** A datum choice that does not fit the output being spent */
  | "DATUM_MISMATCH";

/** Every part error code, once: the compiler checks the list against `TxPartErrorCode` */
export const TX_PART_ERROR_CODES = Object.keys({
  INVALID_OUT_REF: true,
  INVALID_ADDRESS: true,
  INVALID_VALUE: true,
  INVALID_SCRIPT: true,
  INVALID_DATA: true,
  WITNESS_MISMATCH: true,
  DATUM_MISMATCH: true,
} satisfies Record<TxPartErrorCode, true>) as TxPartErrorCode[];

/**
 * Raised by a part builder for an argument it rejects. Thrown at the call that built the part,
 * so the failure points at the offending line rather than surfacing when the transaction is
 * assembled. Carries no details, and is never retryable.
 *
 * It has no check of its own: `TxPartError.is` is `TxError.is`, which answers for the whole
 * tree. A part error is told by its code, e.g. `TxError.is(error, "INVALID_DATA")`.
 */
export class TxPartError extends TxError {
  readonly code: TxPartErrorCode;
  /** Kind of the part being built */
  declare readonly part: TxPart["kind"];

  /**
   * @param cause The error the argument was rejected for, when one was caught
   */
  constructor(
    code: TxPartErrorCode,
    part: TxPart["kind"],
    message: string,
    label?: string,
    cause?: unknown,
  ) {
    super(`${part}${label === undefined ? "" : ` "${label}"`}: ${message}`, {
      part,
      label,
      cause,
      retryable: false,
    });
    this.name = "TxPartError";
    this.code = code;
  }
}
brandClass(TxPartError, "part");
