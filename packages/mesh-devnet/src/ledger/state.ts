import { EventEmitter } from 'events';
import { bech32 }       from 'bech32';
import type { UTxO, Transaction, Block, TxInput } from '../types.js';

function inputKey(i: TxInput): string {
  return `${i.txHash}#${i.outputIndex}`;
}

/**
 * In-memory Cardano ledger state.
 *
 * Manages:
 *  - UTxO set  (Map for O(1) lookups + secondary address index for fast scans)
 *  - Transaction history
 *  - Block chain
 *  - Current slot
 *
 * Emits events so that the HTTP server / WebSocket layer can push updates:
 *   'block'    (block: Block)       — new block sealed
 *   'tx'       (tx: Transaction)    — transaction applied to UTxO set
 *   'utxo:add' (utxo: UTxO)        — UTxO added (genesis, faucet, tx output)
 *   'utxo:del' (key: string)       — UTxO consumed (tx input spent)
 */
export class LedgerState extends EventEmitter {
  private utxoMap     = new Map<string, UTxO>();
  private txMap       = new Map<string, Transaction>();
  private blockList:    Block[] = [];
  private slot          = 0;

  // Secondary index: normalised address hex → Set of input keys
  // Kept in sync with utxoMap so utxosByAddress is O(m) not O(n).
  private addrIndex   = new Map<string, Set<string>>();

  // ── UTxO ─────────────────────────────────────────────────────────────────

  addUTxO(utxo: UTxO): void {
    const key     = inputKey(utxo.input);
    this.utxoMap.set(key, utxo);

    // Update address index (both hex and normalised bech32)
    for (const addr of addressVariants(utxo)) {
      if (!this.addrIndex.has(addr)) this.addrIndex.set(addr, new Set());
      this.addrIndex.get(addr)!.add(key);
    }

    this.emit('utxo:add', utxo);
  }

  getUTxO(input: TxInput): UTxO | undefined {
    return this.utxoMap.get(inputKey(input));
  }

  hasUTxO(input: TxInput): boolean {
    return this.utxoMap.has(inputKey(input));
  }

  allUTxOs(): UTxO[] {
    return [...this.utxoMap.values()];
  }

  /** Fast address lookup via the secondary index. */
  utxosByAddress(address: string): UTxO[] {
    const needle = normaliseAddress(address);
    const keys   = this.addrIndex.get(needle);
    if (!keys) return [];
    const result: UTxO[] = [];
    for (const k of keys) {
      const u = this.utxoMap.get(k);
      if (u) result.push(u);
    }
    return result;
  }

  // ── Transaction application ───────────────────────────────────────────────

  applyTx(tx: Transaction): void {
    // Consume inputs
    for (const inp of tx.body.inputs) {
      const key = inputKey(inp);
      const utxo = this.utxoMap.get(key);
      if (utxo) {
        for (const addr of addressVariants(utxo)) {
          this.addrIndex.get(addr)?.delete(key);
        }
      }
      this.utxoMap.delete(key);
      this.emit('utxo:del', key);
    }

    // Produce outputs
    for (let i = 0; i < tx.body.outputs.length; i++) {
      this.addUTxO({ input: { txHash: tx.hash, outputIndex: i }, output: tx.body.outputs[i]! });
    }

    this.txMap.set(tx.hash, tx);
    this.emit('tx', tx);
  }

  // ── Block chain ───────────────────────────────────────────────────────────

  addBlock(block: Block): void {
    this.blockList.push(block);
    this.slot = block.slot;
    this.emit('block', block);
  }

  latestBlock(): Block | undefined {
    return this.blockList.at(-1);
  }

  getBlock(id: string | number): Block | undefined {
    if (typeof id === 'number') return this.blockList[id];
    return this.blockList.find(b => b.hash === id);
  }

  allBlocks(): Block[] {
    return this.blockList;
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  getTx(hash: string): Transaction | undefined {
    return this.txMap.get(hash);
  }

  // ── Slot ──────────────────────────────────────────────────────────────────

  currentSlot(): Slot {
    return this.slot;
  }

  setSlot(s: Slot): void {
    this.slot = s;
  }
}

type Slot = number;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise an address to lowercase hex for index keys. */
function normaliseAddress(addr: string): string {
  if (!addr) return '';
  if (/^[0-9a-fA-F]+$/.test(addr)) return addr.toLowerCase();
  try {
    const { words } = bech32.decode(addr, 1000);
    return Buffer.from(bech32.fromWords(words)).toString('hex');
  } catch {
    return addr.toLowerCase();
  }
}

/** Return both the raw addressHex and the bech32 address for a UTxO so we
 *  can find it by either form. */
function addressVariants(utxo: UTxO): string[] {
  const variants = new Set<string>();
  variants.add(normaliseAddress(utxo.output.addressHex));
  variants.add(normaliseAddress(utxo.output.address));
  return [...variants].filter(Boolean);
}
