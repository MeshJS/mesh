/**
 * Aiken V3 hello_world script integration tests.
 *
 * Tests the full PlutusData/ScriptContext pipeline against the real Aiken-compiled
 * V3 script from plutus.json — no running devnet required.
 *
 * Script: lesson203_1.hello_world (spend + mint, same compiled bytes)
 * Hash:   837ff340bc109fd82aa73724d0f8234cf84a7da1cfa84f0378b74f89
 *
 * Spend logic (from Aiken source):
 *   redeemer.msg == "HelloSpendRedeemer"
 *   AND datum.owner ∈ ctx.transaction.extra_signatories
 *
 * Mint logic:
 *   redeemer.msg == "HelloMintRedeemer"
 */

import { describe, it, expect }        from 'vitest';
import { DataConstr, DataB, dataToCbor } from '@harmoniclabs/plutus-data';
import { estimatePlutusExUnits }          from '../src/ledger/plutus-eval.js';
import {
  buildV3ScriptContext,
  datumToHex,
  computeDatumHash,
} from '../src/ledger/script-context.js';
import type { Transaction, UTxO, Value } from '../src/types.js';
import { valueToMeshAssets }              from '../src/types.js';
import { toHex }                          from '../src/crypto.js';

// ── Script constants ───────────────────────────────────────────────────────────

const SCRIPT_CBOR =
  '59015201010029800aba2aba1aab9faab9eaab9dab9a488888966002664464653001300637540032259800980298041baa002899192cc004c03800a0071640306eb8c030004c024dd50014590074c024012601200491112cc004cdc3a4004009132332233006004159800980518069baa0018acc004cdc79bae3010300e375400891011248656c6c6f5370656e6452656465656d657200899199119801001000912cc00400629422b30013371e6eb8c04c00400e2946266004004602800280790121bac301130123012301230123012301230123012300f375400c6eb8c040c038dd5180818071baa0018a504031164030601c002601c601e00260166ea80162b3001300700489919802001099b8f375c601c60186ea800922011148656c6c6f4d696e7452656465656d657200375c601a60166ea80162c80490090c020c024004c020008c00cdd50039b874800229344d95900101';

const SCRIPT_HASH  = '837ff340bc109fd82aa73724d0f8234cf84a7da1cfa84f0378b74f89';
const SCRIPT_BYTES = Buffer.from(SCRIPT_CBOR, 'hex');

// Address fixtures
const SCRIPT_ADDR_HEX = '70' + SCRIPT_HASH;      // enterprise script, testnet
const KEY_ADDR_HEX    = '60' + 'aa'.repeat(28);  // enterprise key (collateral / output)
const OWNER_PKH       = 'dd'.repeat(28);          // 28-byte owner key hash in datum

// Time config (slot→POSIX — matters for validity range, not correctness checks)
const GENESIS_MS    = 1_700_000_000_000;
const SLOT_DURATION = 1_000;

// ── Data builders ─────────────────────────────────────────────────────────────

/** hello_world Redeemer  =  Constr(0, [msg: ByteArray]) */
function makeRedeemer(msg: string): DataConstr {
  return new DataConstr(0, [new DataB(Buffer.from(msg))]);
}

/** hello_world Datum  =  Constr(0, [owner: VerificationKeyHash]) */
function makeDatum(ownerPkh: string): DataConstr {
  return new DataConstr(0, [new DataB(Buffer.from(ownerPkh, 'hex'))]);
}

function dataToHex(d: DataConstr): string {
  return toHex(dataToCbor(d));
}

// ── UTxO / Transaction builders ───────────────────────────────────────────────

function makeUTxO(
  txHash: string,
  index: number,
  addrHex: string,
  lovelace: bigint,
  extra: Partial<UTxO['output']> = {},
): UTxO {
  const value: Value = { lovelace };
  return {
    input: { txHash, outputIndex: index },
    output: {
      address: '',
      amount:  valueToMeshAssets(value),
      addressHex: addrHex,
      value,
      ...extra,
    },
  };
}

function makeScriptUTxO(datum: DataConstr): UTxO {
  return makeUTxO('a'.repeat(64), 0, SCRIPT_ADDR_HEX, 5_000_000n, {
    plutusData: datumToHex(datum),
  });
}

// ── ScriptContext builders ────────────────────────────────────────────────────

/**
 * Build a V3 ScriptContext for a minting purpose.
 * The mint redeemer is embedded in the witness redeemer list so that
 * dataRedeemersMapV3 can populate txInfoRedeemers correctly.
 */
function buildMintCtx(
  redeemer: DataConstr,
  inputUTxOs: UTxO[],
): DataConstr {
  const tokenNameHex = Buffer.from('HelloMinter').toString('hex');
  const tx: Transaction = {
    hash: 'e'.repeat(64),
    body: {
      inputs:          inputUTxOs.map(u => u.input),
      referenceInputs: [],
      outputs: [{
        address:    '',
        amount:     valueToMeshAssets({ lovelace: 2_000_000n }),
        addressHex: KEY_ADDR_HEX,
        value:      { lovelace: 2_000_000n },
      }],
      fee:              200_000n,
      mint:             { [SCRIPT_HASH]: { [tokenNameHex]: 1n } },
      collateralInputs: [{ txHash: 'c'.repeat(64), outputIndex: 0 }],
      requiredSigners:  [],
    },
    witnesses: {
      vkeyWitnesses: [],
      datums: {},
      redeemers: [{
        tag:     'mint',
        index:   0,
        dataHex: dataToHex(redeemer),
        exUnits: { cpu: 0n, mem: 0n },
      }],
      scripts: { [SCRIPT_HASH]: { version: 3, bytesHex: SCRIPT_CBOR } },
    },
    isValid: true,
    slot:    1000,
  };

  return buildV3ScriptContext(
    tx, inputUTxOs, [],
    { tag: 'mint', policyId: SCRIPT_HASH, mintIndex: 0 },
    redeemer,
    undefined,
    GENESIS_MS,
    SLOT_DURATION,
  ) as DataConstr;
}

/**
 * Build a V3 ScriptContext for a spending purpose.
 * `datum` is embedded in ScriptInfo.SpendingScript (Just datum).
 * `requiredSigners` populates txInfoSignatories so the owner check passes.
 */
function buildSpendCtx(
  datum: DataConstr,
  redeemer: DataConstr,
  scriptUTxO: UTxO,
  requiredSigners: string[],
): DataConstr {
  const tx: Transaction = {
    hash: 'e'.repeat(64),
    body: {
      inputs:          [scriptUTxO.input],
      referenceInputs: [],
      outputs: [{
        address:    '',
        amount:     valueToMeshAssets({ lovelace: 4_800_000n }),
        addressHex: KEY_ADDR_HEX,
        value:      { lovelace: 4_800_000n },
      }],
      fee:              200_000n,
      collateralInputs: [{ txHash: 'c'.repeat(64), outputIndex: 0 }],
      requiredSigners,
    },
    witnesses: {
      vkeyWitnesses: [],
      datums: {},
      redeemers: [{
        tag:     'spend',
        index:   0,
        dataHex: dataToHex(redeemer),
        exUnits: { cpu: 0n, mem: 0n },
      }],
      scripts: { [SCRIPT_HASH]: { version: 3, bytesHex: SCRIPT_CBOR } },
    },
    isValid: true,
    slot:    1000,
  };

  return buildV3ScriptContext(
    tx, [scriptUTxO], [],
    { tag: 'spend', input: scriptUTxO.input, inputIndex: 0 },
    redeemer,
    datum,     // V3: embed datum in ScriptInfo.SpendingScript
    GENESIS_MS,
    SLOT_DURATION,
  ) as DataConstr;
}

const COLLATERAL_UTXO = makeUTxO('c'.repeat(64), 0, KEY_ADDR_HEX, 2_000_000n);
const INPUT_UTXO      = makeUTxO('f'.repeat(64), 0, KEY_ADDR_HEX, 5_000_000n);

// ── Mint tests ────────────────────────────────────────────────────────────────

describe('hello_world — mint (V3)', () => {
  it('correct redeemer "HelloMintRedeemer" → ok: true', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('wrong redeemer "WrongMessage" → ok: false', () => {
    const redeemer = makeRedeemer('WrongMessage');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('empty string redeemer → ok: false', () => {
    const redeemer = makeRedeemer('');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('spend message used for mint → ok: false', () => {
    const redeemer = makeRedeemer('HelloSpendRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('successful mint returns positive ExUnits', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(true);
    expect(result.budgetSpent.cpu).toBeGreaterThan(0n);
    expect(result.budgetSpent.mem).toBeGreaterThan(0n);
  });
});

// ── Spend tests ───────────────────────────────────────────────────────────────

describe('hello_world — spend (V3)', () => {
  const datum      = makeDatum(OWNER_PKH);
  const scriptUTxO = makeScriptUTxO(datum);

  it('correct msg + owner signed → ok: true', () => {
    const redeemer = makeRedeemer('HelloSpendRedeemer');
    const ctx      = buildSpendCtx(datum, redeemer, scriptUTxO, [OWNER_PKH]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('wrong msg, owner signed → ok: false', () => {
    const redeemer = makeRedeemer('WrongMessage');
    const ctx      = buildSpendCtx(datum, redeemer, scriptUTxO, [OWNER_PKH]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('correct msg, owner NOT in signatories → ok: false', () => {
    const redeemer = makeRedeemer('HelloSpendRedeemer');
    const ctx      = buildSpendCtx(datum, redeemer, scriptUTxO, []); // empty signatories
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('correct msg, different signer (not owner) → ok: false', () => {
    const redeemer    = makeRedeemer('HelloSpendRedeemer');
    const wrongSigner = 'ee'.repeat(28);
    const ctx         = buildSpendCtx(datum, redeemer, scriptUTxO, [wrongSigner]);
    const result      = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('mint message used for spend → ok: false', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildSpendCtx(datum, redeemer, scriptUTxO, [OWNER_PKH]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(false);
  });

  it('successful spend returns positive ExUnits', () => {
    const redeemer = makeRedeemer('HelloSpendRedeemer');
    const ctx      = buildSpendCtx(datum, redeemer, scriptUTxO, [OWNER_PKH]);
    const result   = estimatePlutusExUnits(SCRIPT_BYTES, 3, { redeemer, context: ctx });
    expect(result.ok).toBe(true);
    expect(result.budgetSpent.cpu).toBeGreaterThan(0n);
    expect(result.budgetSpent.mem).toBeGreaterThan(0n);
  });
});

// ── V3 ScriptContext structure checks ─────────────────────────────────────────

describe('V3 ScriptContext structural correctness', () => {
  it('top-level is Constr 0 [TxInfo, Redeemer, ScriptInfo]', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    expect(ctx.constr).toBe(0n);
    expect(ctx.fields).toHaveLength(3);
  });

  it('V3 TxInfo has 16 fields (4 governance fields over V2)', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const txInfo   = ctx.fields[0] as DataConstr;
    expect(txInfo.fields).toHaveLength(16);
  });

  it('mint ScriptInfo is MintingScript (constr 0)', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const info     = ctx.fields[2] as DataConstr;
    expect(info.constr).toBe(0n);
  });

  it('spend ScriptInfo is SpendingScript (constr 1)', () => {
    const datum      = makeDatum(OWNER_PKH);
    const redeemer   = makeRedeemer('HelloSpendRedeemer');
    const scriptUTxO = makeScriptUTxO(datum);
    const ctx        = buildSpendCtx(datum, redeemer, scriptUTxO, [OWNER_PKH]);
    const info       = ctx.fields[2] as DataConstr;
    expect(info.constr).toBe(1n); // SpendingScript
  });

  it('spend ScriptInfo embeds datum as Just (constr 1)', () => {
    const datum      = makeDatum(OWNER_PKH);
    const redeemer   = makeRedeemer('HelloSpendRedeemer');
    const scriptUTxO = makeScriptUTxO(datum);
    const ctx        = buildSpendCtx(datum, redeemer, scriptUTxO, [OWNER_PKH]);
    const info       = ctx.fields[2] as DataConstr; // SpendingScript
    const maybeD     = info.fields[1] as DataConstr; // Maybe Datum
    expect(maybeD.constr).toBe(1n); // Just
  });

  it('spend ScriptInfo with no datum: Nothing (constr 0)', () => {
    const datum      = makeDatum(OWNER_PKH);
    const redeemer   = makeRedeemer('HelloSpendRedeemer');
    const scriptUTxO = makeScriptUTxO(datum);
    const tx: Transaction = {
      hash: 'e'.repeat(64),
      body: {
        inputs: [scriptUTxO.input], referenceInputs: [], outputs: [],
        fee: 200_000n, collateralInputs: [], requiredSigners: [],
      },
      witnesses: { vkeyWitnesses: [], datums: {}, redeemers: [], scripts: {} },
      isValid: true, slot: 1000,
    };
    const ctx  = buildV3ScriptContext(
      tx, [scriptUTxO], [],
      { tag: 'spend', input: scriptUTxO.input, inputIndex: 0 },
      redeemer,
      undefined,  // no datum
      GENESIS_MS, SLOT_DURATION,
    ) as DataConstr;
    const info   = ctx.fields[2] as DataConstr;
    const maybeD = info.fields[1] as DataConstr;
    expect(maybeD.constr).toBe(0n); // Nothing
  });

  it('redeemer passed through unchanged at ctx.fields[1]', () => {
    const redeemer = makeRedeemer('HelloMintRedeemer');
    const ctx      = buildMintCtx(redeemer, [INPUT_UTXO]);
    const passedR  = ctx.fields[1] as DataConstr;
    expect(passedR.constr).toBe(0n);
    const msgField = passedR.fields[0] as DataB;
    expect(Buffer.from(msgField.bytes).toString()).toBe('HelloMintRedeemer');
  });
});

// ── Datum helpers ─────────────────────────────────────────────────────────────

describe('datum encoding helpers', () => {
  it('makeDatum encodes as Constr(0, [DataB(ownerPkh)])', () => {
    const datum = makeDatum(OWNER_PKH);
    expect(datum.constr).toBe(0n);
    expect(datum.fields).toHaveLength(1);
    expect(Buffer.from((datum.fields[0] as DataB).bytes).toString('hex')).toBe(OWNER_PKH);
  });

  it('computeDatumHash returns 64-char hex string', () => {
    const hash = computeDatumHash(makeDatum(OWNER_PKH));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same datum always hashes to the same value', () => {
    const d    = makeDatum(OWNER_PKH);
    const h1   = computeDatumHash(d);
    const h2   = computeDatumHash(d);
    expect(h1).toBe(h2);
  });

  it('different datums hash differently', () => {
    const h1 = computeDatumHash(makeDatum('aa'.repeat(28)));
    const h2 = computeDatumHash(makeDatum('bb'.repeat(28)));
    expect(h1).not.toBe(h2);
  });

  it('datumToHex produces valid non-empty hex', () => {
    const hex = datumToHex(makeDatum(OWNER_PKH));
    expect(hex).toMatch(/^[0-9a-f]+$/);
    expect(hex.length).toBeGreaterThan(0);
  });
});
