/**
 * Lifecycle of a claimed settlement:
 * - `submitting`: claimed, broadcast in flight (a concurrent `/settle` for it is a duplicate);
 * - `submitted`: broadcast accepted (or its outcome is unknown) - a `/settle` retry resumes observing it;
 * - `settled`: success already reported - another `/settle` is a duplicate;
 * - `expired`: validity window closed without the ledger recording it (terminal failure).
 */
export type SettlementState =
  "submitting" | "submitted" | "settled" | "expired";

export type SettlementRecord = {
  txHash: string;
  state: SettlementState;
  broadcastAt: number;
  /** The tx's TTL slot - the claim is retained at least until it has passed (plus a grace period). */
  ttlSlot?: number;
  /** Masumi only: the `termsDigest` this transaction claimed. */
  termsDigest?: string;
};

/**
 * Tracks which payloads this facilitator has claimed, so a retried `/settle` call (per the
 * spec's `settlement_pending` retry flow) never rebroadcasts and a concurrent duplicate never
 * runs the protected operation twice. Keyed by the canonical transaction id - NOT the signed
 * CBOR, whose encoding/witnesses can change without changing the ledger transaction.
 *
 * `claim` MUST be atomic (insert-if-absent) so two concurrent calls cannot both pass; a
 * multi-instance facilitator must back this with shared, durable storage.
 */
export type SettlementStore = {
  has(txHash: string): Promise<boolean> | boolean;
  get(
    txHash: string,
  ): Promise<SettlementRecord | undefined> | SettlementRecord | undefined;
  /** Atomic insert-if-absent. Returns `true` when this call took the claim. */
  claim(record: SettlementRecord): Promise<boolean> | boolean;
  /** Overwrites an existing claim (state transitions). */
  put(txHash: string, record: SettlementRecord): Promise<void> | void;
  /** Releases a claim - only after it is established that no submission occurred (or a definitive ledger rejection). */
  release(txHash: string): Promise<void> | void;
  /**
   * Masumi logical replay: binds a `termsDigest` to the FIRST transaction id that claims it,
   * atomically, and returns the bound transaction id (which may be a different one).
   */
  bindTermsDigest(
    termsDigest: string,
    txHash: string,
  ): Promise<string> | string;
};

/** In-memory default store. Not durable - a facilitator restart forgets what it claimed. */
export class InMemorySettlementStore implements SettlementStore {
  private readonly records = new Map<string, SettlementRecord>();
  private readonly termsDigests = new Map<string, string>();

  has(txHash: string): boolean {
    return this.records.has(txHash);
  }

  get(txHash: string): SettlementRecord | undefined {
    return this.records.get(txHash);
  }

  claim(record: SettlementRecord): boolean {
    if (this.records.has(record.txHash)) return false;
    this.records.set(record.txHash, record);
    return true;
  }

  put(txHash: string, record: SettlementRecord): void {
    this.records.set(txHash, record);
  }

  release(txHash: string): void {
    this.records.delete(txHash);
  }

  bindTermsDigest(termsDigest: string, txHash: string): string {
    const bound = this.termsDigests.get(termsDigest);
    if (bound !== undefined) return bound;
    this.termsDigests.set(termsDigest, txHash);
    return txHash;
  }
}
