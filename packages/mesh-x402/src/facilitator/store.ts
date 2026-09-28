export type SettlementRecord = {
  txHash: string;
  broadcastAt: number;
};

/**
 * Tracks which payloads this facilitator has already broadcast, so a retried `/settle` call
 * (per the spec's `settlement_pending` retry flow) never rebroadcasts. Keyed by tx hash, not
 * `nonce`, since a nonce identifies an input, not a transaction.
 */
export type SettlementStore = {
  has(txHash: string): Promise<boolean> | boolean;
  get(txHash: string): Promise<SettlementRecord | undefined> | SettlementRecord | undefined;
  put(txHash: string, record: SettlementRecord): Promise<void> | void;
};

/** In-memory default store. Not durable - a facilitator restart forgets what it broadcast. */
export class InMemorySettlementStore implements SettlementStore {
  private readonly records = new Map<string, SettlementRecord>();

  has(txHash: string): boolean {
    return this.records.has(txHash);
  }

  get(txHash: string): SettlementRecord | undefined {
    return this.records.get(txHash);
  }

  put(txHash: string, record: SettlementRecord): void {
    this.records.set(txHash, record);
  }
}
