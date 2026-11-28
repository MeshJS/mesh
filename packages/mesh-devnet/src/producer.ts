import type { Block, Transaction } from './types.js';
import type { LedgerState } from './ledger/state.js';
import type { Mempool } from './mempool.js';
import type { ProtocolParams } from './config.js';
import { blake2b256, fromHex, toHex } from './crypto.js';

/**
 * Simulated block producer.
 *
 * Ticks every `slotLengthMs` milliseconds.
 * On each tick:
 *   1. Advance the current slot
 *   2. Drain the mempool — apply every validated tx to the UTxO set
 *   3. If there were transactions, seal a block and emit onBlock()
 *
 * No real Ouroboros consensus — the devnet is a single-operator chain.
 *
 * Block hash construction matches Cardano's content model:
 *   blockBodyHash = blake2b-256( concat(txBodyHash for tx in block) )
 *   blockHash     = blake2b-256( prevHash ‖ slot ‖ height ‖ blockBodyHash )
 *
 * Real Cardano serialises a CBOR header and hashes that; we compute over a
 * canonical concatenation. The hash is still 32 bytes of blake2b-256 so any
 * downstream wallet/explorer that just wants "a 64-char hex hash" works.
 */
export class BlockProducer {
  private timer:     NodeJS.Timeout | null = null;
  private startTime: number                = 0;

  constructor(
    private readonly state:   LedgerState,
    private readonly mempool: Mempool,
    private readonly params:  ProtocolParams,
    private readonly onBlock?: (block: Block) => void,
  ) {}

  /**
   * @param slotZeroMs  Same value passed to `setGenesisTime` — wall time at which
   *                    slot 0 is defined (POSIX = slotZeroMs + slot * slotLengthMs).
   */
  start(slotZeroMs: number = Date.now()): void {
    this.startTime = slotZeroMs;
    this.timer     = setInterval(() => this.tick(), this.params.slotLengthMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const elapsedMs  = Date.now() - this.startTime;
    const slot       = Math.floor(elapsedMs / this.params.slotLengthMs);
    this.state.setSlot(slot);

    const pending = this.mempool.drain();
    if (pending.length === 0) return; // no txs — skip block (empty slots are normal)

    const prevBlock   = this.state.latestBlock();
    const height      = (prevBlock?.height ?? -1) + 1;
    const epoch       = Math.floor(slot / this.params.epochLength);
    const epochSlot   = slot % this.params.epochLength;
    const previousHash = prevBlock?.hash ?? '0'.repeat(64);

    const txHashes: string[] = [];
    let   feesCollected = 0n;

    for (const { tx } of pending) {
      const txWithSlot: Transaction = { ...tx, slot };
      this.state.applyTx(txWithSlot);
      txHashes.push(tx.hash);
      feesCollected += tx.body.fee;
    }

    // bodyHash = blake2b-256( concat(blake2b-256(txBody) for tx in block) )
    const concatenated = Buffer.concat(txHashes.map(h => fromHex(h)));
    const bodyHash     = toHex(blake2b256(concatenated));

    // blockHash = blake2b-256( prevHash ‖ slot(8) ‖ height(8) ‖ bodyHash )
    const buf = Buffer.alloc(32 + 8 + 8 + 32);
    fromHex(previousHash).slice(0, 32).forEach((b, i) => { buf[i] = b; });
    buf.writeBigUInt64BE(BigInt(slot),   32);
    buf.writeBigUInt64BE(BigInt(height), 40);
    fromHex(bodyHash).slice(0, 32).forEach((b, i) => { buf[48 + i] = b; });
    const blockHash = toHex(blake2b256(buf));

    const block: Block = {
      hash:        blockHash,
      height,
      slot,
      epoch,
      epochSlot,
      time:        Math.floor(Date.now() / 1000),
      txCount:     txHashes.length,
      txHashes,
      previousHash,
      bodyHash,
      feesCollected,
    };

    this.state.addBlock(block);
    this.onBlock?.(block);
  }
}
