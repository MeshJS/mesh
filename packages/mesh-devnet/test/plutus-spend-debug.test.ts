/**
 * Targeted debug: decode the spend handler branch and trace the failure.
 *
 * The script dispatches:
 *   - scriptInfo.constr == 1 (SpendingScript) → spend handler (C1 = TRUE branch)
 *   - else → mint/error (C2 = FALSE branch)
 *
 * We already know mint works. This traces why spend fails.
 */
import { describe, it } from 'vitest';
import { UPLCDecoder, Application, UPLCConst } from '@harmoniclabs/uplc';
import { DataConstr, DataB, DataI, DataList } from '@harmoniclabs/plutus-data';
import { Machine } from '@harmoniclabs/plutus-machine';
import { defaultV3Costs } from '@harmoniclabs/cardano-costmodels-ts';
import { ExBudget } from '@harmoniclabs/plutus-machine';

// ── Script and fixtures ───────────────────────────────────────────────────────

const SCRIPT_BYTES = Buffer.from(
  '59015201010029800aba2aba1aab9faab9eaab9dab9a488888966002664464653001300637540032259800980298041baa002899192cc004c03800a0071640306eb8c030004c024dd50014590074c024012601200491112cc004cdc3a4004009132332233006004159800980518069baa0018acc004cdc79bae3010300e375400891011248656c6c6f5370656e6452656465656d657200899199119801001000912cc00400629422b30013371e6eb8c04c00400e2946266004004602800280790121bac301130123012301230123012301230123012300f375400c6eb8c040c038dd5180818071baa0018a504031164030601c002601c601e00260166ea80162b3001300700489919802001099b8f375c601c60186ea800922011148656c6c6f4d696e7452656465656d657200375c601a60166ea80162c80490090c020c024004c020008c00cdd50039b874800229344d95900101',
  'hex',
);

const OWNER_PKH       = 'dd'.repeat(28);
const SCRIPT_HASH     = '837ff340bc109fd82aa73724d0f8234cf84a7da1cfa84f0378b74f89';
const SCRIPT_ADDR_HEX = '70' + SCRIPT_HASH;
const KEY_ADDR_HEX    = '60' + 'aa'.repeat(28);
const GENESIS_MS      = 1_700_000_000_000;
const SLOT_DURATION   = 1_000;

import { estimatePlutusExUnits } from '../src/ledger/plutus-eval.js';
import { buildV3ScriptContext, datumToHex } from '../src/ledger/script-context.js';
import { valueToMeshAssets } from '../src/types.js';
import { toHex } from '../src/crypto.js';
import { dataToCbor } from '@harmoniclabs/plutus-data';

function makeRedeemer(msg: string): DataConstr {
  return new DataConstr(0, [new DataB(Buffer.from(msg))]);
}
function makeDatum(ownerPkh: string): DataConstr {
  return new DataConstr(0, [new DataB(Buffer.from(ownerPkh, 'hex'))]);
}
function dataToHex(d: DataConstr): string {
  return toHex(dataToCbor(d));
}
function makeUTxO(txHash: string, index: number, addrHex: string, lovelace: bigint, extra: any = {}) {
  return {
    input: { txHash, outputIndex: index },
    output: {
      address: '',
      amount: valueToMeshAssets({ lovelace }),
      addressHex: addrHex,
      value: { lovelace },
      ...extra,
    },
  };
}

// ── Helper: build spend context ────────────────────────────────────────────────

function buildSpendCtx(datum: DataConstr, redeemer: DataConstr, requiredSigners: string[]): DataConstr {
  const scriptUTxO = makeUTxO('a'.repeat(64), 0, SCRIPT_ADDR_HEX, 5_000_000n, {
    plutusData: datumToHex(datum),
  });
  const tx: any = {
    hash: 'e'.repeat(64),
    body: {
      inputs: [scriptUTxO.input], referenceInputs: [], outputs: [{
        address: '', amount: valueToMeshAssets({ lovelace: 4_800_000n }),
        addressHex: KEY_ADDR_HEX, value: { lovelace: 4_800_000n },
      }],
      fee: 200_000n, collateralInputs: [{ txHash: 'c'.repeat(64), outputIndex: 0 }],
      requiredSigners,
    },
    witnesses: {
      vkeyWitnesses: [], datums: {},
      redeemers: [{ tag: 'spend', index: 0, dataHex: dataToHex(redeemer), exUnits: { cpu: 0n, mem: 0n } }],
      scripts: { [SCRIPT_HASH]: { version: 3, bytesHex: '' } },
    },
    isValid: true, slot: 1000,
  };
  return buildV3ScriptContext(
    tx, [scriptUTxO], [],
    { tag: 'spend', input: scriptUTxO.input, inputIndex: 0 },
    redeemer, datum, GENESIS_MS, SLOT_DURATION,
  ) as DataConstr;
}

// ── UPLC term printer ─────────────────────────────────────────────────────────

function termToStr(node: any, depth = 0, max = 20): string {
  if (node == null) return 'null';
  if (depth > max) return '...';
  const tag = node.tag;
  if (tag === 0) return `Var(${node.deBruijn})`;
  if (tag === 1) return `Delay(${termToStr(node.delayedTerm, depth + 1, max)})`;
  if (tag === 2) return `Lam(${termToStr(node.body, depth + 1, max)})`;
  if (tag === 3) return `(${termToStr(node.func, depth + 1, max)} ${termToStr(node.arg, depth + 1, max)})`;
  if (tag === 4) {
    const v = node.value;
    if (typeof v === 'bigint') return `${v}`;
    if (v instanceof Uint8Array) return `BS(${Buffer.from(v).toString('hex').slice(0, 12)})`;
    return `Const`;
  }
  if (tag === 5) return `!(${termToStr(node.forced, depth + 1, max)})`;
  if (tag === 6) return `ERR`;
  if (tag === 7) {
    const b: Record<number, string> = {
      7: 'eqI', 8: 'ltI', 9: 'lteI', 15: 'eqBS', 26: 'iTE',
      29: 'fstP', 30: 'sndP', 31: 'chList', 33: 'hd', 34: 'tl',
      42: 'uCons', 43: 'uMap', 44: 'uList', 45: 'uID', 46: 'uBD',
      38: 'listData', 37: 'constrData', 39: 'mapData', 40: 'iData', 41: 'bData',
    };
    return `${b[node.builtinTag] ?? `B${node.builtinTag}`}`;
  }
  if (tag === 8) {
    if (depth > max - 3) return `Constr(${node.index},[...])`;
    return `Constr(${node.index},[${node.terms?.map((t: any) => termToStr(t, depth + 1, max)).join(',')}])`;
  }
  if (tag === 9) {
    if (depth > max - 3) return `Case(...)`;
    const branches = node.continuations?.map((b: any, i: number) => `B${i}=${termToStr(b, depth + 1, max)}`).join(',');
    return `Case(${termToStr(node.constrTerm, depth + 1, max)},{${branches}})`;
  }
  return `?(${tag})`;
}

// ── Navigation helpers ────────────────────────────────────────────────────────

/** Navigate to the inner if-then-else dispatch (same as plutus-debug.test.ts) */
function findInnerCase(program: any) {
  const outerCase = program.body.body;
  const b0 = outerCase.continuations[0];
  let curr = b0;
  while (curr?.constructor?.name === 'Lambda') curr = curr.body;
  const firstForce = curr;
  const firstCase  = firstForce?.forced;
  const G0         = firstCase?.constrTerm?.terms?.[0];
  const lam1 = G0?.func?.func;
  const lam2 = lam1?.body;
  const body = lam2?.body;
  const lam3 = body?.func;
  const body2= lam3?.body;
  const lam4 = body2?.func;
  const deepCase = lam4?.body;
  const b0deep = deepCase?.continuations?.[0];
  let curr2 = b0deep;
  while (curr2?.constructor?.name === 'Lambda') curr2 = curr2.body;
  const innerForce = curr2;
  const innerCase  = innerForce?.forced;
  return { deepCase, innerCase };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('spend handler deep decode', () => {

  it('print C1 spend handler (TRUE branch) structure', () => {
    const program = UPLCDecoder.parse(SCRIPT_BYTES, 'cbor');
    const { innerCase } = findInnerCase(program);

    // C1 = innerCase.constrTerm.terms[1] = Delay(spend_handler)
    const C1 = innerCase?.constrTerm?.terms?.[1];
    console.log('\n=== C1 (spend handler, TRUE branch) ===');
    console.log(termToStr(C1, 0, 25));
  });

  it('print G0 arg2 (eqInt0 param) — what is passed as eqInt0', () => {
    const program = UPLCDecoder.parse(SCRIPT_BYTES, 'cbor');
    const outerCase = program.body.body;
    const b0 = outerCase.continuations[0];
    let curr = b0;
    while (curr?.constructor?.name === 'Lambda') curr = curr.body;
    const firstCase = curr?.forced;
    const G0 = firstCase?.constrTerm?.terms?.[0];
    // G0 = App(App(lam1, arg1), arg2)
    const arg1 = G0?.func?.arg;  // first applied arg = ctx_fields
    const arg2 = G0?.arg;        // second applied arg = eqInt0

    console.log('\n=== G0.arg1 (ctx_fields) ===');
    console.log(termToStr(arg1, 0, 12));
    console.log('\n=== G0.arg2 (eqInt0) ===');
    console.log(termToStr(arg2, 0, 12));
  });

  it('evaluate full spend context and print error', () => {
    const datum     = makeDatum(OWNER_PKH);
    const redeemer  = makeRedeemer('HelloSpendRedeemer');
    const ctx       = buildSpendCtx(datum, redeemer, [OWNER_PKH]);

    const result = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    console.log('\n=== Spend evaluation ===');
    console.log('ok:', result.ok);
    console.log('error:', result.error);
    console.log('logs:', result.logs);
    console.log('budget:', result.budgetSpent);
  });

  it('test with maybeDatum = Nothing in ScriptInfo', () => {
    // If spend fails even with Nothing datum, it means datum extraction is NOT the issue
    const datum    = makeDatum(OWNER_PKH);
    const redeemer = makeRedeemer('HelloSpendRedeemer');
    // Build context with no datum passed
    const scriptUTxO = makeUTxO('a'.repeat(64), 0, SCRIPT_ADDR_HEX, 5_000_000n, {
      plutusData: datumToHex(datum),
    });
    const tx: any = {
      hash: 'e'.repeat(64),
      body: {
        inputs: [scriptUTxO.input], referenceInputs: [], outputs: [],
        fee: 200_000n, collateralInputs: [], requiredSigners: [OWNER_PKH],
      },
      witnesses: { vkeyWitnesses: [], datums: {}, redeemers: [], scripts: {} },
      isValid: true, slot: 1000,
    };
    const ctxNoDatum = buildV3ScriptContext(
      tx, [scriptUTxO], [],
      { tag: 'spend', input: scriptUTxO.input, inputIndex: 0 },
      redeemer, undefined, GENESIS_MS, SLOT_DURATION,
    ) as DataConstr;

    const result = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctxNoDatum });
    console.log('\n=== Spend with Nothing datum ===');
    console.log('ok:', result.ok, '| error:', result.error);
    // Aiken: when datum=None, owner_must_sign = False → expected failure
    // This SHOULD be ok: false
  });

  it('manually eval: does the script reach the signer check?', () => {
    // If the signer check is the issue, then even with owner in signatories but
    // owner NOT matching datum, it should fail. We already know that works.
    // So let's check if maybeDatum decoding itself fails with our Just(datum).

    // Let's eval with Just(datum) where datum is a VALID Constr(0, [DataB])
    const datum    = makeDatum(OWNER_PKH);
    const redeemer = makeRedeemer('HelloSpendRedeemer');

    // ScriptInfo with datum = Just(Constr(0,[DataB(pkh)]))
    const justDatum = new DataConstr(1, [datum]);
    console.log('\n=== Just(datum) structure ===');
    console.log('justDatum.constr:', justDatum.constr);
    console.log('justDatum.fields[0]:', (justDatum.fields[0] as DataConstr).constr, 'fields:', (justDatum.fields[0] as DataConstr).fields.length);

    const ctx = buildSpendCtx(datum, redeemer, [OWNER_PKH]);
    const scriptInfo = ctx.fields[2] as DataConstr;
    console.log('\n=== ScriptInfo ===');
    console.log('constr (should be 1 = SpendingScript):', scriptInfo.constr);
    console.log('fields[1] = maybeDatum:');
    const maybeDatum = scriptInfo.fields[1] as DataConstr;
    console.log('  maybeDatum.constr (should be 1 = Just):', maybeDatum.constr);
    const innerDatum = maybeDatum.fields[0] as DataConstr;
    console.log('  innerDatum.constr (should be 0):', innerDatum.constr);
    console.log('  innerDatum.fields[0] type:', (innerDatum.fields[0] as DataB).constructor?.name);
    console.log('  innerDatum.fields[0] bytes:', Buffer.from((innerDatum.fields[0] as DataB).bytes).toString('hex').slice(0, 16) + '...');

    const txInfo = ctx.fields[0] as DataConstr;
    const signers = txInfo.fields[8] as DataList;
    console.log('\n=== TxInfo signatories ===');
    console.log('signers list length:', signers.list.length);
    if (signers.list.length > 0) {
      const signer0 = signers.list[0] as DataB;
      console.log('signer[0] bytes:', Buffer.from(signer0.bytes).toString('hex').slice(0, 16) + '...');
    }
  });
});
