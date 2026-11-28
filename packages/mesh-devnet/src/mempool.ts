import type { Transaction } from './types.js';

export interface MempoolEntry {
  tx:       Transaction;
  rawCbor:  Uint8Array;
  addedAt:  number; // Date.now()
}

/**
 * In-memory transaction mempool.
 *
 * All transactions here have already passed ledger validation.
 * The block producer drains them each slot.
 */
export class Mempool {
  private entries = new Map<string, MempoolEntry>();

  add(tx: Transaction, rawCbor: Uint8Array): void {
    this.entries.set(tx.hash, { tx, rawCbor, addedAt: Date.now() });
  }

  has(hash: string): boolean {
    return this.entries.has(hash);
  }

  get(hash: string): MempoolEntry | undefined {
    return this.entries.get(hash);
  }

  /** Remove and return all pending entries (called by block producer). */
  drain(): MempoolEntry[] {
    const all = [...this.entries.values()];
    this.entries.clear();
    return all;
  }

  peek(): MempoolEntry[] {
    return [...this.entries.values()];
  }

  remove(hash: string): void {
    this.entries.delete(hash);
  }

  size(): number {
    return this.entries.size;
  }
}
