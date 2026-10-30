/**
 * Devnet ledger-facing types anchored on @meshsdk/common so tooling matches Mesh.
 *
 * - `MeshTxBuilderBody` is the canonical **builder-phase** TX body (`meshTxBuilderBody`).
 * - After CBOR decode we keep a **narrow validated body** (`TransactionBody`)
 *   with bigint fee + internal value split; inputs/outputs use Mesh `TxInput` /
 *   ledger-extended `TxOutput`.
 */

import type {
  Asset,
  MeshTxBuilderBody,
  TxInput as MeshTxInput,
  TxOutput as MeshTxOutput,
  UTxO as MeshUtxoShape,
} from '@meshsdk/common';

// ── Re-exports aligned with Mesh SDK ──────────────────────────────────────────

/** Mesh TxBuilder canonical body (`MeshTxBuilder.meshTxBuilderBody`). */
export type MeshTransactionBody = MeshTxBuilderBody;
export type { MeshTxBuilderBody };

/** Conway / Cardano TxIn reference `{ txHash, outputIndex }` — IFetcher UT xo shape */
export type TxInput = MeshTxInput;

/** Mesh output row plus fields required by ledger validators & Plutus encoding. */
export type TxOutput = MeshTxOutput & {
  /** Raw Shelley address bytes, lowercase hex (29–57 B) — not in Mesh TxOutput */
  addressHex: string;
  /** Bigint-valued ADA + mints for preservation / min-Ada logic */
  value: Value;
  /** Language of an on-chain reference script (ledger bookkeeping; Mesh only exposes `scriptHash`). */
  scriptRefVersion?: 1 | 2 | 3 | 'native';
};

export type UTxO = Omit<MeshUtxoShape, 'input' | 'output'> & {
  input:  TxInput;
  output: TxOutput;
};

// ── Ledger-only (bigint math, PolicyId maps) ─────────────────────────────────

export type TxHash   = string;
export type Slot     = number;
export type Lovelace = bigint;

/** Hex policy id prefix in unit strings — 56 hex chars (= 28-byte script hash). */
export type PolicyId = string;

/** Hex-encoded asset name bytes (suffix of Mesh `Asset.unit`). */
export type AssetName = string;

// policyId → assetName(hex) → quantity
export type MultiAsset = Record<PolicyId, Record<AssetName, Lovelace>>;

export interface Value {
  lovelace: Lovelace;
  assets?: MultiAsset;
}

/** Map `ledger Value` ↔ Mesh `Asset[]` for populating TxOutput.amount */
export function valueToMeshAssets(value: Value): Asset[] {
  const out: Asset[] = [{ unit: 'lovelace', quantity: value.lovelace.toString() }];
  if (!value.assets) return out;
  for (const pid of Object.keys(value.assets).sort()) {
    const xs = value.assets[pid];
    if (!xs) continue;
    for (const name of Object.keys(xs).sort()) {
      const q = xs[name];
      if (q !== undefined && q !== 0n) {
        out.push({ unit: pid + name, quantity: q.toString() });
      }
    }
  }
  return out;
}

/** Validated body after Conway CBOR decode — not interchangeable with MeshTxBuilderBody. */
export interface TransactionBody {
  inputs:           TxInput[];
  referenceInputs:  TxInput[];
  outputs:          TxOutput[];
  fee:              Lovelace;
  ttl?:             Slot;
  validityStart?:   Slot;
  mint?:            MultiAsset;
  networkId?:       number;
  /** Required payment key hashes — hex ; Mesh uses `requiredSignatures` same semantics */
  requiredSigners?: string[];
  auxDataHash?:     string;
  collateralInputs?: TxInput[];
}

export interface VKeyWitness {
  vkey:      string;
  signature: string;
}

export interface TxRedeemerInfo {
  tag:       'spend' | 'mint' | 'cert' | 'withdraw' | 'vote' | 'propose';
  index:     number;
  dataHex:   string;
  exUnits:   { cpu: bigint; mem: bigint };
}

export interface TxScriptInfo {
  version:  1 | 2 | 3 | 'native';
  bytesHex: string;
}

export interface TxWitnesses {
  vkeyWitnesses: VKeyWitness[];
  datums:        Record<string, string>;
  redeemers:     TxRedeemerInfo[];
  scripts:       Record<string, TxScriptInfo>;
}

export interface Transaction {
  hash:      TxHash;
  body:      TransactionBody;
  witnesses: TxWitnesses;
  isValid:   boolean;
  slot:      Slot;
}

export interface Block {
  hash:         string;
  height:       number;
  slot:         Slot;
  epoch:        number;
  epochSlot:    number;
  time:         number;
  txCount:      number;
  txHashes:     TxHash[];
  previousHash: string;
  bodyHash:     string;
  feesCollected: Lovelace;
}

export interface GenesisWallet {
  index:           number;
  privateKeyHex:   string;
  privateKeyCliHex: string;
  publicKeyHex:    string;
  paymentKeyHash:  string;
  addressBech32:   string;
  addressHex:      string;
  initialLovelace: Lovelace;
}
