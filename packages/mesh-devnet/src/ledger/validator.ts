/**
 * TransactionValidator — Conway/Babbage ledger rule orchestrator.
 *
 * Dispatches to the modular rule sets in src/ledger/rules/:
 *   validateLEDGER  (N1-N2)   network identity
 *   validateUTXO   (U1,U3-U10) UTxO set + value rules
 *   validateUTXOW  (W1-W3)    witnesses + UTXOS script execution (S1-S6)
 *
 * U2 (inputs ⊆ dom(utxo)) is enforced here because input resolution is
 * shared by subsequent rules.
 *
 * References:
 *   cardano-ledger conway/impl: Cardano.Ledger.Conway.Rules.Ledger
 *   pallas pallas-primitives/src/conway/model.rs (Tx CDDL)
 *   @harmoniclabs/cardano-ledger-ts (CBOR parsing)
 */

import {
  Tx as LedgerTx,
  Address,
  Value as LedgerValue,
  Script,
  ScriptType,
} from '@harmoniclabs/cardano-ledger-ts';
import { Cbor, CborBytes }         from '@harmoniclabs/cbor';
import { resolveScriptHash }       from '@meshsdk/core';
import cbor                        from 'cbor';
import { dataToCbor, hashData, dataFromCbor } from '@harmoniclabs/plutus-data';
import type { Data }               from '@harmoniclabs/plutus-data';

import { toHex, fromHex }          from '../crypto.js';
import type {
  Transaction, TxInput, TxOutput, UTxO, VKeyWitness,
  Value, MultiAsset, TxWitnesses, TxRedeemerInfo, TxScriptInfo,
} from '../types.js';
import { valueToMeshAssets }       from '../types.js';
import type { LedgerState }        from './state.js';
import type { ProtocolParams }     from '../config.js';
import { computeMinAda, computeMinFee } from './value.js';

import { validateUTXO }            from './rules/utxo.js';
import { validateUTXOW }           from './rules/utxow.js';
import { validateLEDGER }          from './rules/ledger.js';
import type { RuleContext }        from './rules/types.js';

// ── Public API ────────────────────────────────────────────────────────────────

export type ValidationOk     = { ok: true };
export type ValidationError  = { ok: false; error: string };
export type ValidationResult = ValidationOk | ValidationError;

/**
 * Unix ms at devnet slot 0.  Set once at startup so that slot → POSIX time
 * conversions are consistent between the validator and block producer.
 */
let GENESIS_TIME_MS = 0;
export function setGenesisTime(ms: number): void { GENESIS_TIME_MS = ms; }
export function getGenesisTime(): number { return GENESIS_TIME_MS; }

export class TransactionValidator {
  constructor(
    private readonly state:  LedgerState,
    private readonly params: ProtocolParams,
  ) {}

  /**
   * Full parse + validate pipeline.
   * Returns the internal Transaction on success so the caller can add it to the mempool.
   */
  parseAndValidate(
    rawCbor: Uint8Array,
  ): { ok: true; tx: Transaction } | { ok: false; error: string } {
    const normalisedCbor = normaliseTxCbor(rawCbor);

    let ledgerTx: LedgerTx;
    try {
      ledgerTx = LedgerTx.fromCbor(toHex(normalisedCbor));
    } catch (e) {
      return { ok: false, error: `CBOR parse error: ${(e as Error).message}` };
    }

    let tx: Transaction;
    try {
      tx = ledgerTxToInternal(ledgerTx, this.state.currentSlot());
    } catch (e) {
      return { ok: false, error: `Transaction structure error: ${(e as Error).message}` };
    }

    const result = this.validate(tx, rawCbor);
    if (!result.ok) return result;
    return { ok: true, tx };
  }

  /** Validate a pre-parsed Transaction (used by tests and evaluator). */
  validate(tx: Transaction, rawCbor: Uint8Array): ValidationResult {
    const ctx: RuleContext = {
      state:     this.state,
      params:    this.params,
      genesisMs: GENESIS_TIME_MS,
    };

    // U2 — resolve all inputs (regular + reference) from UTxO set
    const inputUTxOs: UTxO[] = [];
    for (const inp of tx.body.inputs) {
      const utxo = this.state.getUTxO(inp);
      if (!utxo) {
        return { ok: false, error: `U2: input ${inp.txHash}#${inp.outputIndex} not found in UTxO set` };
      }
      inputUTxOs.push(utxo);
    }
    for (const inp of tx.body.referenceInputs) {
      if (!this.state.hasUTxO(inp)) {
        return {
          ok: false,
          error: `U2: reference input ${inp.txHash}#${inp.outputIndex} not found in UTxO set`,
        };
      }
    }

    // LEDGER — network identity (N1-N2)
    {
      const r = validateLEDGER(ctx, tx);
      if (!r.ok) return r;
    }

    // UTXO — value + size + fee rules (U1, U3-U10)
    {
      const r = validateUTXO(ctx, tx, inputUTxOs, rawCbor.length);
      if (!r.ok) return r;
    }

    // UTXOW — witnesses + script execution (W1-W3, S1-S6)
    {
      const r = validateUTXOW(ctx, tx, inputUTxOs);
      if (!r.ok) return r;
    }

    return { ok: true };
  }

  // ── Convenience: protocol calculations ────────────────────────────────────

  minFee(txSizeBytes: number): bigint {
    return computeMinFee(this.params.minFeeA, this.params.minFeeB, txSizeBytes);
  }

  minAda(output: TxOutput): bigint {
    return computeMinAda(this.params.coinsPerUTxOByte, output);
  }
}

// ── CBOR → internal conversion ────────────────────────────────────────────────
// Exported so the evaluator can reuse the same parsing pipeline.

/** Convert a cardano-ledger-ts Tx into our internal Transaction shape. */
export function ledgerTxToInternal(ledgerTx: LedgerTx, slot: number): Transaction {
  const body = ledgerTx.body;
  const txHash = ledgerTx.hash.toString();

  const inputs: TxInput[] = body.inputs.map(u => ({
    txHash:      u.utxoRef.id.toString(),
    outputIndex: u.utxoRef.index,
  }));

  const refInputs: TxInput[] = (body.refInputs ?? []).map(u => ({
    txHash:      u.utxoRef.id.toString(),
    outputIndex: u.utxoRef.index,
  }));

  const outputs: TxOutput[] = body.outputs.map(o => convertOutput(o));
  const fee   = body.fee ?? 0n;
  const mint  = body.mint ? convertValue(body.mint).assets : undefined;

  // Witnesses
  const vkeyWitnesses: VKeyWitness[] = (ledgerTx.witnesses.vkeyWitnesses ?? []).map(w => ({
    vkey:      w.vkey.toString(),
    signature: w.signature.toString(),
  }));

  const datums: Record<string, string> = {};
  for (const d of (ledgerTx.witnesses.datums ?? [])) {
    try {
      const cborBytes = dataToCbor(d as Data);
      const hashBytes = hashData(d as Data);
      datums[toHex(hashBytes)] = toHex(cborBytes);
    } catch { /* skip undecodable datums */ }
  }

  const scripts: Record<string, TxScriptInfo> = {};
  const collectScript = (s: Script, version: TxScriptInfo['version']) => {
    try {
      const inner    = Uint8Array.from(s.bytes);
      const bytesHex = toHex(inner);
      const info: TxScriptInfo = { version, bytesHex };

      scripts[s.hash.toString()] = info;

      // MeshJS-built txs hash minting policy ids with a single CBOR.Bytes wrap.
      // Index both so S4 can find the script regardless of which convention was used.
      if (typeof version === 'number') {
        scripts[meshPlutusPolicyHash(version as 1 | 2 | 3, inner)] = info;
      }
    } catch { /* skip */ }
  };
  for (const s of (ledgerTx.witnesses.nativeScripts ?? []))  collectScript(s, 'native');
  for (const s of (ledgerTx.witnesses.plutusV1Scripts ?? [])) collectScript(s, 1);
  for (const s of (ledgerTx.witnesses.plutusV2Scripts ?? [])) collectScript(s, 2);
  for (const s of (ledgerTx.witnesses.plutusV3Scripts ?? [])) collectScript(s, 3);

  const redeemers: TxRedeemerInfo[] = (ledgerTx.witnesses.redeemers ?? []).map(r => ({
    tag:     redeemerTagToString(r.tag),
    index:   r.index,
    dataHex: toHex(dataToCbor(r.data as Data)),
    exUnits: { cpu: r.execUnits.cpu, mem: r.execUnits.mem },
  }));

  const witnesses: TxWitnesses = { vkeyWitnesses, datums, redeemers, scripts };

  const requiredSigners = ((body as any).requiredSigners ?? []) as Array<{ toString(): string }>;
  const collInputs: TxInput[] = ((body as any).collateralInputs ?? []).map((u: any) => ({
    txHash:      u.utxoRef.id.toString(),
    outputIndex: u.utxoRef.index,
  }));

  return {
    hash: txHash,
    body: {
      inputs,
      referenceInputs: refInputs,
      outputs,
      fee,
      ttl:              body.ttl !== undefined   ? Number(body.ttl) : undefined,
      validityStart:    body.validityIntervalStart !== undefined
                          ? Number(body.validityIntervalStart) : undefined,
      mint,
      networkId:        body.network !== undefined ? (body.network === 'mainnet' ? 1 : 0) : undefined,
      requiredSigners:  requiredSigners.length ? requiredSigners.map(h => h.toString()) : undefined,
      auxDataHash:      (body as any).auxDataHash?.toString(),
      collateralInputs: collInputs.length ? collInputs : undefined,
    },
    witnesses,
    isValid: ledgerTx.isScriptValid,
    slot,
  };
}

function convertOutput(o: {
  address:   Address;
  value:     LedgerValue;
  datum?:    unknown;
  refScript?: Script | undefined;
}): TxOutput {
  const addrBytes   = Uint8Array.from(o.address.toBytes());
  const addressHex  = toHex(addrBytes);
  const addressMesh = o.address.toString();
  const value       = convertValue(o.value);

  let dataHash:   string | undefined;
  let plutusData: string | undefined;

  const rawDatum = o.datum;
  if (rawDatum != null) {
    const isHash32 =
      typeof rawDatum === 'object' &&
      rawDatum !== null &&
      'bytes' in (rawDatum as object) &&
      (rawDatum as any).bytes instanceof Uint8Array &&
      (rawDatum as any).bytes.length === 32;

    if (isHash32) {
      dataHash = toHex((rawDatum as any).bytes as Uint8Array);
    } else {
      try {
        const cborBytes = dataToCbor(rawDatum as Data);
        plutusData = toHex(cborBytes);
      } catch { /* skip */ }
    }
  }

  let scriptRef:        string | undefined;
  let scriptHash:       string | undefined;
  let scriptRefVersion: TxOutput['scriptRefVersion'];

  const refScript = o.refScript ?? (o as any).referenceScript;
  if (refScript instanceof Script) {
    try {
      scriptRef        = toHex(refScript.bytes);
      scriptHash       = refScript.hash.toString();
      scriptRefVersion = scriptTypeToVersion(refScript.type);
    } catch { /* skip */ }
  }

  return {
    address:    addressMesh,
    amount:     valueToMeshAssets(value),
    addressHex,
    value,
    dataHash,
    plutusData,
    scriptRef,
    scriptHash,
    scriptRefVersion,
  };
}

export function convertValue(v: LedgerValue): Value {
  const units   = v.toUnits();
  const assets: MultiAsset = {};
  let lovelace  = 0n;
  let hasAssets = false;

  for (const { unit, quantity } of units) {
    const qty = BigInt(quantity);
    if (unit === 'lovelace' || unit === '') { lovelace += qty; continue; }
    const pid  = unit.slice(0, 56);
    const name = unit.slice(56);
    if (!assets[pid]) assets[pid] = {};
    assets[pid]![name] = (assets[pid]![name] ?? 0n) + qty;
    hasAssets = true;
  }

  return { lovelace, assets: hasAssets ? assets : undefined };
}

/**
 * Minting policy id as derived by MeshJS / cardano-serialization-lib:
 * blake2b-224( CBOR.Bytes(innerScriptBytes) )  ← single wrap
 *
 * HarmonicLabs Script.hash uses a different wrapping scheme.
 * We index both so S4 can resolve the script regardless of builder.
 */
export function meshPlutusPolicyHash(
  version:          1 | 2 | 3,
  innerScriptBytes: Uint8Array,
): string {
  const singleWrapHex = toHex(Cbor.encode(new CborBytes(Uint8Array.from(innerScriptBytes))));
  const verLabel      = version === 1 ? 'V1' : version === 2 ? 'V2' : 'V3';
  return resolveScriptHash(singleWrapHex, verLabel);
}

/**
 * Pre-process raw transaction CBOR to work around a parser limitation in
 * @harmoniclabs/cardano-ledger-ts: the library mis-parses Tag(259, {}) in the
 * auxiliary-data field (position 3 of the outer array).  We replace it with
 * `null` so parsing succeeds.
 *
 * The body bytes (and therefore the body hash / tx id / signatures) are
 * NEVER modified — this only affects the auxiliary-data slot.
 */
export function normaliseTxCbor(raw: Uint8Array): Uint8Array {
  let outer: unknown;
  try { outer = cbor.decode(Buffer.from(raw)); }
  catch { return raw; }
  if (!Array.isArray(outer) || outer.length < 3) return raw;

  const auxField = outer[3];
  if (auxField === null || auxField === undefined) return raw;

  const isCborTag =
    typeof auxField === 'object' &&
    auxField !== null &&
    'tag'   in (auxField as Record<string, unknown>) &&
    'value' in (auxField as Record<string, unknown>);
  if (!isCborTag) return raw;

  try {
    return new Uint8Array(cbor.encode([outer[0], outer[1], outer[2], null]));
  } catch { return raw; }
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function redeemerTagToString(tag: number): TxRedeemerInfo['tag'] {
  switch (tag) {
    case 0: return 'spend';
    case 1: return 'mint';
    case 2: return 'cert';
    case 3: return 'withdraw';
    case 4: return 'vote';
    case 5: return 'propose';
    default: return 'spend';
  }
}

function scriptTypeToVersion(type: ScriptType): NonNullable<TxOutput['scriptRefVersion']> {
  switch (type) {
    case ScriptType.PlutusV1: return 1;
    case ScriptType.PlutusV2: return 2;
    case ScriptType.PlutusV3: return 3;
    default: return 'native';
  }
}
