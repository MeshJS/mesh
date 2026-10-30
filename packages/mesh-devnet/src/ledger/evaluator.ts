/**
 * DevnetEvaluator — implements MeshSDK's IEvaluator interface.
 *
 * `evaluateTx(txHex, additionalUTxOs?)` parses the transaction, resolves all
 * inputs from the UTxO set (supplemented by any caller-provided UTxOs), then
 * runs the CEK machine with an *unbounded* budget for each script redeemer and
 * returns the actual ExUnits consumed.
 *
 * This lets MeshTxBuilder call `.evaluateTx()` to get accurate script execution
 * costs before fee calculation, which is identical to how Blockfrost / Maestro
 * expose the `/utils/txs/evaluate` endpoint.
 *
 * Reference:
 *   MeshSDK @meshsdk/common: IEvaluator
 *   cardano-ledger alonzo/impl: Cardano.Ledger.Alonzo.TxInfo (redeemer ordering)
 */

import type { UTxO } from '../types.js';
import type { LedgerState } from './state.js';
import type { ProtocolParams } from '../config.js';
import {
  normaliseTxCbor,
  ledgerTxToInternal,
  getGenesisTime,
} from './validator.js';
import { toHex, fromHex } from '../crypto.js';
import {
  buildV2ScriptContext,
  buildV3ScriptContext,
  resolveDatum,
} from './script-context.js';
import { estimatePlutusExUnits } from './plutus-eval.js';
import { dataFromCbor } from '@harmoniclabs/plutus-data';
import type { Data } from '@harmoniclabs/plutus-data';
import type { TxInput, TxScriptInfo, Transaction } from '../types.js';
import { Tx as LedgerTx } from '@harmoniclabs/cardano-ledger-ts';

// ── Public types ──────────────────────────────────────────────────────────────

export type RedeemerTagType = 'SPEND' | 'MINT' | 'CERT' | 'REWARD' | 'VOTE' | 'PROPOSE';

/** Shape of each entry returned by `evaluateTx`. */
export interface ExUnitEstimate {
  /** For SPEND: the input being spent; for MINT: the policy id as txHash. */
  input:  { txHash: string; txIndex: number };
  /** Mesh-compatible redeemer tag. */
  tag:    RedeemerTagType;
  index:  number;
  budget: { mem: number; steps: number };
}

// ── DevnetEvaluator ───────────────────────────────────────────────────────────

export class DevnetEvaluator {
  constructor(
    private readonly state:  LedgerState,
    private readonly params: ProtocolParams,
  ) {}

  /**
   * Evaluate a CBOR-hex transaction and return the estimated ExUnits for each
   * redeemer.
   *
   * @param txHex           Signed or unsigned CBOR hex string
   * @param additionalUTxOs Extra UTxOs not in the ledger state (e.g. unconfirmed outputs)
   */
  async evaluateTx(
    txHex:           string,
    additionalUTxOs: UTxO[] = [],
  ): Promise<ExUnitEstimate[]> {
    const rawCbor = fromHex(txHex);
    const normalisedCbor = normaliseTxCbor(rawCbor);

    let ledgerTx: LedgerTx;
    try {
      ledgerTx = LedgerTx.fromCbor(toHex(normalisedCbor));
    } catch (e) {
      throw new Error(`evaluateTx: CBOR parse error: ${(e as Error).message}`);
    }

    const tx = ledgerTxToInternal(ledgerTx, this.state.currentSlot());

    // Build a combined UTxO lookup: ledger state + caller-provided extras
    const extraMap = new Map<string, UTxO>();
    for (const u of additionalUTxOs) {
      extraMap.set(`${u.input.txHash}#${u.input.outputIndex}`, u);
    }

    const resolveInput = (inp: TxInput): UTxO | undefined =>
      this.state.getUTxO(inp) ?? extraMap.get(`${inp.txHash}#${inp.outputIndex}`);

    // Resolve all regular inputs
    const allInputUTxOs: UTxO[] = [];
    for (const inp of tx.body.inputs) {
      const u = resolveInput(inp);
      if (!u) throw new Error(`evaluateTx: input ${inp.txHash}#${inp.outputIndex} not found`);
      allInputUTxOs.push(u);
    }

    // Resolve reference inputs (for reference scripts)
    const refInputUTxOs: UTxO[] = [];
    for (const inp of tx.body.referenceInputs) {
      const u = resolveInput(inp);
      if (u) refInputUTxOs.push(u);
    }

    // Build script map from witness set + reference inputs
    const scriptMap = buildScriptMap(tx.witnesses.scripts, refInputUTxOs);

    const genesisMs    = getGenesisTime();
    const slotLengthMs = this.params.slotLengthMs;
    const sortedInputs = [...tx.body.inputs].sort(cmpTxInput);

    const estimates: ExUnitEstimate[] = [];

    for (const redeemer of tx.witnesses.redeemers) {
      const tag    = redeemer.tag;
      const index  = redeemer.index;

      if (tag === 'spend') {
        const inp = sortedInputs[index];
        if (!inp) continue;

        const utxo = resolveInput(inp);
        if (!utxo) continue;

        const sh = scriptHashFromAddressHex(utxo.output.addressHex);
        if (!sh) continue;

        const scriptInfo = scriptMap.get(sh);
        if (!scriptInfo || scriptInfo.version === 'native') continue;

        let datum: Data | undefined;
        if (scriptInfo.version === 1 || scriptInfo.version === 2) {
          datum = resolveDatum(utxo.output, tx.witnesses.datums) ?? undefined;
        }

        let redeemerData: Data;
        try { redeemerData = dataFromCbor(fromHex(redeemer.dataHex)); }
        catch { continue; }

        const purpose  = { tag: 'spend' as const, input: inp, inputIndex: index };
        const context  = scriptInfo.version === 3
          ? buildV3ScriptContext(tx, allInputUTxOs, refInputUTxOs, purpose, redeemerData, datum, genesisMs, slotLengthMs)
          : buildV2ScriptContext(tx, allInputUTxOs, refInputUTxOs, purpose, genesisMs, slotLengthMs);

        const exec = estimatePlutusExUnits(
          fromHex(scriptInfo.bytesHex),
          scriptInfo.version as 1 | 2 | 3,
          { datum, redeemer: redeemerData, context },
        );

        estimates.push({
          input:  { txHash: inp.txHash, txIndex: inp.outputIndex },
          tag: 'SPEND',
          index,
          budget: {
            mem:   Number(exec.budgetSpent.mem),
            steps: Number(exec.budgetSpent.cpu),
          },
        });
        continue;
      }

      if (tag === 'mint') {
        const sortedPolicies = Object.keys(tx.body.mint ?? {}).sort();
        const policyId       = sortedPolicies[index];
        if (!policyId) continue;

        const scriptInfo = scriptMap.get(policyId);
        if (!scriptInfo || scriptInfo.version === 'native') continue;

        let redeemerData: Data;
        try { redeemerData = dataFromCbor(fromHex(redeemer.dataHex)); }
        catch { continue; }

        const purpose = { tag: 'mint' as const, policyId, mintIndex: index };
        const context = scriptInfo.version === 3
          ? buildV3ScriptContext(tx, allInputUTxOs, refInputUTxOs, purpose, redeemerData, undefined, genesisMs, slotLengthMs)
          : buildV2ScriptContext(tx, allInputUTxOs, refInputUTxOs, purpose, genesisMs, slotLengthMs);

        const exec = estimatePlutusExUnits(
          fromHex(scriptInfo.bytesHex),
          scriptInfo.version as 1 | 2 | 3,
          { redeemer: redeemerData, context },
        );

        estimates.push({
          input:  { txHash: policyId, txIndex: 0 },
          tag: 'MINT',
          index,
          budget: {
            mem:   Number(exec.budgetSpent.mem),
            steps: Number(exec.budgetSpent.cpu),
          },
        });
        continue;
      }
    }

    return estimates;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildScriptMap(
  witScripts:    Record<string, TxScriptInfo>,
  refInputUTxOs: UTxO[],
): Map<string, TxScriptInfo> {
  const map = new Map<string, TxScriptInfo>(Object.entries(witScripts));
  for (const { output } of refInputUTxOs) {
    if (output.scriptHash && output.scriptRef && !map.has(output.scriptHash)) {
      map.set(output.scriptHash, {
        version:  output.scriptRefVersion ?? 2,
        bytesHex: output.scriptRef,
      });
    }
  }
  return map;
}

function scriptHashFromAddressHex(addressHex: string): string | null {
  try {
    const bytes      = Buffer.from(addressHex, 'hex');
    const typeNibble = (bytes[0]! >> 4) & 0xf;
    if (typeNibble === 1 || typeNibble === 3 || typeNibble === 5 || typeNibble === 7) {
      return bytes.slice(1, 29).toString('hex');
    }
    return null;
  } catch { return null; }
}

function cmpTxInput(a: TxInput, b: TxInput): number {
  if (a.txHash < b.txHash) return -1;
  if (a.txHash > b.txHash) return  1;
  return a.outputIndex - b.outputIndex;
}
