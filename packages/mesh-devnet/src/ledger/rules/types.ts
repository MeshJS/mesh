import type { LedgerState } from '../state.js';
import type { ProtocolParams } from '../../config.js';

export type ValidationOk     = { ok: true };
export type ValidationError  = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationError;

/** Shared read-only context threaded through every rule function. */
export interface RuleContext {
  readonly state:     LedgerState;
  readonly params:    ProtocolParams;
  /** Unix ms at devnet slot 0 — used to convert slots → POSIX time for Plutus. */
  readonly genesisMs: number;
}

export const ok  = (): ValidationOk               => ({ ok: true });
export const err = (msg: string): ValidationError => ({ ok: false, error: msg });
