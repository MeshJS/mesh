/**
 * UTXOS rule set — Plutus + native script execution:
 *
 *   S1  collateral inputs exist and cover ≥ collateralPercent% of fee
 *   S2  all collateral inputs are key-locked (not script-locked)
 *   S3  for each script-locked spending input:
 *         resolve script (witness set | reference input) + datum + redeemer → CEK eval
 *   S4  for each minting policy:
 *         resolve script + redeemer → CEK eval
 *   S5  native scripts: full sig/all/any/atLeast/after/before evaluation
 *   S6  cumulative ExUnits ≤ maxTxExMem / maxTxExSteps
 *
 * References:
 *   cardano-ledger alonzo/impl:  Cardano.Ledger.Alonzo.Rules.Utxos
 *   cardano-ledger conway/impl:  Cardano.Ledger.Conway.Rules.Utxos
 *   plutus-ledger-api V2/V3 ScriptContext encoding
 */

import { ok, err } from './types.js';
import type { ValidationResult, RuleContext } from './types.js';
import type { Transaction, UTxO, TxInput, TxScriptInfo } from '../../types.js';
import { paymentKeyHashOfAddress } from '../address.js';
import {
  buildV2ScriptContext,
  buildV3ScriptContext,
  resolveDatum,
} from '../script-context.js';
import { evalPlutusScript } from '../plutus-eval.js';
import { validateNativeScript } from '../native-script.js';
import { dataFromCbor } from '@harmoniclabs/plutus-data';
import type { Data } from '@harmoniclabs/plutus-data';
import { Script, ScriptType } from '@harmoniclabs/cardano-ledger-ts';
import { fromHex } from '../../crypto.js';

export interface ScriptInput {
  utxo:       UTxO;
  scriptHash: string;
  addrType:   number;
}

export function validateUTXOS(
  ctx:          RuleContext,
  tx:           Transaction,
  scriptInputs: ScriptInput[],
  allInputs:    UTxO[],
): ValidationResult {
  const { params, genesisMs } = ctx;

  // Resolve reference input UTxOs (carry reference scripts into the script map)
  const refInputUTxOs: UTxO[] = [];
  for (const inp of tx.body.referenceInputs) {
    const utxo = ctx.state.getUTxO(inp);
    if (utxo) refInputUTxOs.push(utxo);
  }

  // Script lookup: scriptHash → TxScriptInfo
  // Priority: witness set over reference inputs (both should agree when both present)
  const scriptMap = buildScriptMap(tx.witnesses.scripts, refInputUTxOs);

  // S1 + S2 — collateral
  {
    const col = validateCollateral(ctx, tx);
    if (!col.ok) return col;
  }

  // Sorted spending input refs match redeemer indices
  const sortedInputRefs = [...tx.body.inputs].sort(cmpTxInput);

  let totalCpu = 0n;
  let totalMem = 0n;

  // S3 — spending scripts
  for (const { utxo, scriptHash } of scriptInputs) {
    const scriptInfo = scriptMap.get(scriptHash);
    if (!scriptInfo) {
      return err(
        `S3: no script found for script hash ${scriptHash}` +
        ` (input ${utxo.input.txHash}#${utxo.input.outputIndex})`,
      );
    }

    // S5 — native script path (no ExUnits)
    if (scriptInfo.version === 'native') {
      const ns = Script.fromCbor(scriptInfo.bytesHex, ScriptType.NativeScript);
      const r  = validateNativeScript(ns as any, tx);
      if (!r.ok) return err(`S3: native script failed for ${scriptHash}: ${r.error}`);
      continue;
    }

    // Plutus path — match redeemer by sorted input index
    const inputIdx = sortedInputRefs.findIndex(
      i => i.txHash === utxo.input.txHash && i.outputIndex === utxo.input.outputIndex,
    );
    const redeemer = tx.witnesses.redeemers.find(r => r.tag === 'spend' && r.index === inputIdx);
    if (!redeemer) {
      return err(
        `S3: no redeemer for spending input ${utxo.input.txHash}#${utxo.input.outputIndex}` +
        ` (sorted index ${inputIdx})`,
      );
    }

    // Datum required for V1/V2 spending
    let datum: Data | undefined;
    if (scriptInfo.version === 1 || scriptInfo.version === 2) {
      const d = resolveDatum(utxo.output, tx.witnesses.datums);
      if (!d) {
        return err(
          `S3: datum not found for spending input ${utxo.input.txHash}#${utxo.input.outputIndex}`,
        );
      }
      datum = d;
    }

    let redeemerData: Data;
    try { redeemerData = dataFromCbor(fromHex(redeemer.dataHex)); }
    catch (e) {
      return err(`S3: invalid redeemer CBOR for ${scriptHash}: ${(e as Error).message}`);
    }

    const purpose = { tag: 'spend' as const, input: utxo.input, inputIndex: inputIdx };

    const context = scriptInfo.version === 3
      ? buildV3ScriptContext(
          tx,
          allInputs.map(u => u),
          refInputUTxOs,
          purpose,
          redeemerData,
          datum,   // V3: embed resolved datum in SpendingScript
          genesisMs,
          params.slotLengthMs,
        )
      : buildV2ScriptContext(
          tx,
          allInputs.map(u => u),
          refInputUTxOs,
          purpose,
          genesisMs,
          params.slotLengthMs,
        );

    const exec = evalPlutusScript(
      fromHex(scriptInfo.bytesHex),
      scriptInfo.version as 1 | 2 | 3,
      { datum, redeemer: redeemerData, context },
      { cpu: params.maxTxExSteps, mem: params.maxTxExMem },
    );

    if (!exec.ok) {
      return err(
        `S3: script ${scriptHash} failed: ${exec.error}` +
        (exec.logs.length ? ` | trace: ${exec.logs.join(', ')}` : ''),
      );
    }

    totalCpu += exec.budgetSpent.cpu;
    totalMem += exec.budgetSpent.mem;
  }

  // S4 — minting scripts
  if (tx.body.mint) {
    const sortedPolicies = Object.keys(tx.body.mint).sort();
    for (let mintIdx = 0; mintIdx < sortedPolicies.length; mintIdx++) {
      const policyId   = sortedPolicies[mintIdx]!;
      const scriptInfo = scriptMap.get(policyId);
      if (!scriptInfo) {
        return err(`S4: no script found for minting policy ${policyId}`);
      }

      // S5 — native minting policy
      if (scriptInfo.version === 'native') {
        const ns = Script.fromCbor(scriptInfo.bytesHex, ScriptType.NativeScript);
        const r  = validateNativeScript(ns as any, tx);
        if (!r.ok) return err(`S4: native script failed for policy ${policyId}: ${r.error}`);
        continue;
      }

      const redeemer = tx.witnesses.redeemers.find(r => r.tag === 'mint' && r.index === mintIdx);
      if (!redeemer) {
        return err(`S4: no redeemer for minting policy ${policyId} (index ${mintIdx})`);
      }

      let redeemerData: Data;
      try { redeemerData = dataFromCbor(fromHex(redeemer.dataHex)); }
      catch (e) {
        return err(`S4: invalid redeemer CBOR for policy ${policyId}: ${(e as Error).message}`);
      }

      const purpose = { tag: 'mint' as const, policyId, mintIndex: mintIdx };

      const context = scriptInfo.version === 3
        ? buildV3ScriptContext(
            tx,
            allInputs.map(u => u),
            refInputUTxOs,
            purpose,
            redeemerData,
            undefined,  // no spending datum for minting
            genesisMs,
            params.slotLengthMs,
          )
        : buildV2ScriptContext(
            tx,
            allInputs.map(u => u),
            refInputUTxOs,
            purpose,
            genesisMs,
            params.slotLengthMs,
          );

      const exec = evalPlutusScript(
        fromHex(scriptInfo.bytesHex),
        scriptInfo.version as 1 | 2 | 3,
        { redeemer: redeemerData, context },
        { cpu: params.maxTxExSteps, mem: params.maxTxExMem },
      );

      if (!exec.ok) {
        return err(
          `S4: minting script ${policyId} failed: ${exec.error}` +
          (exec.logs.length ? ` | trace: ${exec.logs.join(', ')}` : ''),
        );
      }

      totalCpu += exec.budgetSpent.cpu;
      totalMem += exec.budgetSpent.mem;
    }
  }

  // S6 — total ExUnits within protocol budget
  if (totalCpu > params.maxTxExSteps) {
    return err(`S6: total CPU steps ${totalCpu} > maxTxExSteps ${params.maxTxExSteps}`);
  }
  if (totalMem > params.maxTxExMem) {
    return err(`S6: total memory units ${totalMem} > maxTxExMem ${params.maxTxExMem}`);
  }

  return ok();
}

// ── Collateral ────────────────────────────────────────────────────────────────

function validateCollateral(ctx: RuleContext, tx: Transaction): ValidationResult {
  const collInputs = tx.body.collateralInputs;
  if (!collInputs || collInputs.length === 0) {
    return err('S1: script transaction must include collateral inputs');
  }
  if (collInputs.length > ctx.params.maxCollateralInputs) {
    return err(`S1: ${collInputs.length} collateral inputs > max ${ctx.params.maxCollateralInputs}`);
  }

  let collLovelace = 0n;
  for (const inp of collInputs) {
    const utxo = ctx.state.getUTxO(inp);
    if (!utxo) {
      return err(`S1: collateral input ${inp.txHash}#${inp.outputIndex} not found in UTxO set`);
    }
    if (paymentKeyHashOfAddress(utxo.output.addressHex) === null) {
      return err(
        `S2: collateral input ${inp.txHash}#${inp.outputIndex} is script-locked — not allowed`,
      );
    }
    collLovelace += utxo.output.value.lovelace;
  }

  const minCollateral = (tx.body.fee * BigInt(ctx.params.collateralPercent) + 99n) / 100n;
  if (collLovelace < minCollateral) {
    return err(
      `S1: collateral ${collLovelace} lovelace < required ${minCollateral}` +
      ` (${ctx.params.collateralPercent}% of fee ${tx.body.fee})`,
    );
  }

  return ok();
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

function cmpTxInput(a: TxInput, b: TxInput): number {
  if (a.txHash < b.txHash) return -1;
  if (a.txHash > b.txHash) return  1;
  return a.outputIndex - b.outputIndex;
}
