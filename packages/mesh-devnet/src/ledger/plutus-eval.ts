/**
 * Plutus script evaluator.
 *
 * Wraps @harmoniclabs/plutus-machine (CEK machine) to:
 *   1. Decode a CBOR-wrapped flat-encoded UPLC script
 *   2. Apply datum / redeemer / context arguments
 *   3. Evaluate with a bounded ExBudget
 *   4. Return ok/fail + actual ExUnits spent
 *
 * Cost models: the Machine defaults to V4 costs (upward-compatible with V3/V2/V1)
 * which is what Conway-era nodes use.  We pass the actual protocol-param budgets
 * for enforcement; on the devnet we set them from ProtocolParams.maxTxExMem/Steps.
 */

import { Machine, ExBudget } from '@harmoniclabs/plutus-machine';
import { CEKError }           from '@harmoniclabs/plutus-machine';
import { UPLCDecoder }        from '@harmoniclabs/uplc';
import { Application, UPLCConst } from '@harmoniclabs/uplc';
import {
  defaultV1Costs,
  defaultV2Costs,
  defaultV3Costs,
} from '@harmoniclabs/cardano-costmodels-ts';
import type { Data }      from '@harmoniclabs/plutus-data';
import type { UPLCTerm }  from '@harmoniclabs/uplc';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ScriptExecArgs {
  /** Datum PlutusData — required for spending V1/V2 scripts only. */
  datum?:   Data;
  redeemer: Data;
  context:  Data;
}

export interface ScriptExecResult {
  ok:          boolean;
  budgetSpent: ExUnits;
  logs:        string[];
  error?:      string;
}

export interface ExUnits {
  cpu: bigint;
  mem: bigint;
}

// ── Core evaluator ────────────────────────────────────────────────────────────

/**
 * Decode, apply arguments, and evaluate a Plutus script.
 *
 * @param scriptBytes  Raw CBOR-wrapped flat-encoded script (Script.bytes from cardano-ledger-ts)
 * @param version      Plutus language version (1, 2, or 3)
 * @param args         Arguments to apply: datum? → redeemer → context
 * @param maxBudget    Max CPU steps / memory units allowed (from protocol params)
 */
export function evalPlutusScript(
  scriptBytes: Uint8Array,
  version:     1 | 2 | 3,
  args:        ScriptExecArgs,
  maxBudget:   ExUnits,
): ScriptExecResult {
  // ── 1. Decode the UPLC program ─────────────────────────────────────────────
  let program: ReturnType<typeof UPLCDecoder.parse>;
  try {
    program = UPLCDecoder.parse(scriptBytes, 'cbor');
  } catch (e) {
    return fail(zeroUnits, [], `script decode error: ${(e as Error).message}`);
  }

  // ── 2. Build the application term ─────────────────────────────────────────
  //  V1/V2 spend: script datum redeemer context
  //  V1/V2 mint:  script redeemer context
  //  V3 (CIP-0069): script context  (redeemer is embedded in ScriptContext)
  let term: UPLCTerm = program.body;
  if (version < 3) {
    if (args.datum !== undefined) {
      term = new Application(term, UPLCConst.data(args.datum));
    }
    term = new Application(term, UPLCConst.data(args.redeemer));
  }
  term = new Application(term, UPLCConst.data(args.context));

  // ── 3. Evaluate with a bounded budget ─────────────────────────────────────
  const costModel = version >= 3 ? defaultV3Costs
                  : version >= 2 ? defaultV2Costs
                  :                defaultV1Costs;

  const budget  = new ExBudget({ cpu: maxBudget.cpu, mem: maxBudget.mem });
  const machine = new Machine(costModel, budget);

  let result: ReturnType<typeof machine.eval>;
  try {
    result = machine.eval(term as any);
  } catch (e) {
    return fail(zeroUnits, [], `machine evaluation threw: ${(e as Error).message}`);
  }

  const spent: ExUnits = {
    cpu: result.budgetSpent.cpu,
    mem: result.budgetSpent.mem,
  };

  if (result.result instanceof CEKError) {
    return fail(spent, result.logs, result.result.msg ?? 'script evaluation failed');
  }

  // The Machine tracks budget but does not hard-stop on overflow.
  // Enforce the limit explicitly after evaluation.
  if (spent.cpu > maxBudget.cpu) {
    return fail(spent, result.logs,
      `ExBudget exceeded: cpu ${spent.cpu} > max ${maxBudget.cpu}`);
  }
  if (spent.mem > maxBudget.mem) {
    return fail(spent, result.logs,
      `ExBudget exceeded: mem ${spent.mem} > max ${maxBudget.mem}`);
  }

  return { ok: true, budgetSpent: spent, logs: result.logs };
}

/**
 * Evaluate with an unlimited budget (useful for fee-estimation / IEvaluator).
 * Returns the actual ExUnits consumed.
 */
export function estimatePlutusExUnits(
  scriptBytes: Uint8Array,
  version:     1 | 2 | 3,
  args:        ScriptExecArgs,
): ScriptExecResult {
  return evalPlutusScript(scriptBytes, version, args, unlimitedBudget);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const unlimitedBudget: ExUnits = {
  cpu: BigInt('9223372036854775807'), // i64::MAX
  mem: BigInt('9223372036854775807'),
};

const zeroUnits: ExUnits = { cpu: 0n, mem: 0n };

function fail(budgetSpent: ExUnits, logs: string[], error: string): ScriptExecResult {
  return { ok: false, budgetSpent, logs, error };
}
