import type { TxPart } from "./types";

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

/**
 * Raised by a part builder for an argument it rejects. Thrown at the call that built the part,
 * so the failure points at the offending line rather than surfacing when the transaction is
 * assembled.
 */
export class TxPartError extends Error {
  readonly code: TxPartErrorCode;
  /** Kind of the part being built */
  readonly part: TxPart["kind"];
  /** Label given to the part, if any */
  readonly label?: string;

  constructor(
    code: TxPartErrorCode,
    part: TxPart["kind"],
    message: string,
    label?: string,
  ) {
    super(`${part}${label === undefined ? "" : ` "${label}"`}: ${message}`);
    this.name = "TxPartError";
    this.code = code;
    this.part = part;
    if (label !== undefined) this.label = label;
  }
}
