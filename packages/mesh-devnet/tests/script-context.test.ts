/**
 * ScriptContext PlutusData encoding tests.
 *
 * Tests the Data encoding helpers in src/ledger/script-context.ts against
 * the expected Plutus CDDL / constructor index structure.
 * All expectations are derived directly from plutus-ledger-api source:
 *   - makeIsDataIndexed conventions
 *   - PV2.TxInfo / PV3.TxInfo field ordering
 */

import { describe, it, expect }              from 'vitest';
import { DataConstr, DataI, DataB, DataMap, DataList } from '@harmoniclabs/plutus-data';
import type { Data }                         from '@harmoniclabs/plutus-data';

import {
  dataAddress,
  dataPosixTimeRange,
  buildV2ScriptContext,
  buildV3ScriptContext,
  resolveDatum,
  computeDatumHash,
  datumToHex,
} from '../src/ledger/script-context.js';
import type { UTxO, Transaction }     from '../src/types.js';
import { valueToMeshAssets }                  from '../src/types.js';
import { fromHex, toHex }                    from '../src/crypto.js';

// ── Address encoding ──────────────────────────────────────────────────────────

describe('dataAddress', () => {
  it('enterprise key address (type 6) → PubKeyCredential + Nothing staking', () => {
    // Type nibble 6, network 0, 28-byte all-aa payment key hash
    const addrHex = '60' + 'aa'.repeat(28);
    const d = dataAddress(addrHex);

    expect(d).toBeInstanceOf(DataConstr);
    expect(d.constr).toBe(0n);                   // Address constructor
    expect(d.fields).toHaveLength(2);

    const paymentCred = d.fields[0] as DataConstr;
    expect(paymentCred.constr).toBe(0n);          // PubKeyCredential
    expect(paymentCred.fields).toHaveLength(1);

    const pkh = paymentCred.fields[0] as DataB;   // PubKeyHash (newtype → bytes)
    expect(pkh.bytes).toEqual(fromHex('aa'.repeat(28)));

    const stakingCred = d.fields[1] as DataConstr;
    expect(stakingCred.constr).toBe(0n);           // Nothing
    expect(stakingCred.fields).toHaveLength(0);
  });

  it('enterprise script address (type 7) → ScriptCredential + Nothing staking', () => {
    const addrHex = '70' + 'bb'.repeat(28);
    const d = dataAddress(addrHex);

    const paymentCred = d.fields[0] as DataConstr;
    expect(paymentCred.constr).toBe(1n);           // ScriptCredential
    expect((paymentCred.fields[0] as DataB).bytes).toEqual(fromHex('bb'.repeat(28)));

    const stakingCred = d.fields[1] as DataConstr;
    expect(stakingCred.constr).toBe(0n);           // Nothing
  });

  it('base key+key address (type 0) → PubKeyCredential + Just (StakingHash (PubKeyCredential ...))', () => {
    const payBytes   = 'aa'.repeat(28);
    const stakeBytes = 'bb'.repeat(28);
    const addrHex    = '00' + payBytes + stakeBytes;
    const d          = dataAddress(addrHex);

    expect(d.constr).toBe(0n);

    const paymentCred  = d.fields[0] as DataConstr;
    const stakingMaybe = d.fields[1] as DataConstr;

    expect(paymentCred.constr).toBe(0n);    // PubKeyCredential
    expect(stakingMaybe.constr).toBe(1n);   // Just

    const stakingHash  = stakingMaybe.fields[0] as DataConstr;
    expect(stakingHash.constr).toBe(0n);    // StakingHash

    const innerCred = stakingHash.fields[0] as DataConstr;
    expect(innerCred.constr).toBe(0n);      // PubKeyCredential (for stake key)
  });

  it('base script+key address (type 1) → ScriptCredential + Just (StakingHash (PubKeyCredential ...))', () => {
    const scriptBytes = 'cc'.repeat(28);
    const stakeBytes  = 'dd'.repeat(28);
    const addrHex     = '10' + scriptBytes + stakeBytes;
    const d           = dataAddress(addrHex);

    const paymentCred = d.fields[0] as DataConstr;
    expect(paymentCred.constr).toBe(1n);    // ScriptCredential

    const stakingMaybe = d.fields[1] as DataConstr;
    expect(stakingMaybe.constr).toBe(1n);   // Just
  });
});

// ── POSIXTimeRange encoding ────────────────────────────────────────────────────

describe('dataPosixTimeRange', () => {
  const genesis   = 1_700_000_000_000; // arbitrary genesis ms
  const slotMs    = 1_000;

  it('always range: LowerBound(NegInf,True) UpperBound(PosInf,True)', () => {
    const d = dataPosixTimeRange(undefined, undefined, genesis, slotMs);
    expect(d).toBeInstanceOf(DataConstr);
    expect(d.constr).toBe(0n); // Interval

    const lb = d.fields[0] as DataConstr; // LowerBound
    expect(lb.constr).toBe(0n);
    const lbExt = lb.fields[0] as DataConstr;
    expect(lbExt.constr).toBe(0n); // NegInf
    const lbClosed = lb.fields[1] as DataConstr;
    expect(lbClosed.constr).toBe(1n); // True

    const ub = d.fields[1] as DataConstr; // UpperBound
    expect(ub.constr).toBe(0n);
    const ubExt = ub.fields[0] as DataConstr;
    expect(ubExt.constr).toBe(2n); // PosInf
  });

  it('TTL-only range: finite upper bound, open', () => {
    const d   = dataPosixTimeRange(undefined, 100, genesis, slotMs);
    const ub  = d.fields[1] as DataConstr;
    const ext = ub.fields[0] as DataConstr;
    expect(ext.constr).toBe(1n); // Finite
    const posix = ext.fields[0] as DataI;
    expect(posix.int).toBe(BigInt(genesis) + 100n * BigInt(slotMs));
    const closed = ub.fields[1] as DataConstr;
    expect(closed.constr).toBe(0n); // False (open)
  });

  it('validityStart-only range: finite lower bound, closed', () => {
    const d   = dataPosixTimeRange(50, undefined, genesis, slotMs);
    const lb  = d.fields[0] as DataConstr;
    const ext = lb.fields[0] as DataConstr;
    expect(ext.constr).toBe(1n); // Finite
    const closed = lb.fields[1] as DataConstr;
    expect(closed.constr).toBe(1n); // True (closed)
  });

  it('full range: both bounds finite', () => {
    const d  = dataPosixTimeRange(50, 100, genesis, slotMs);
    const lb = d.fields[0] as DataConstr;
    const ub = d.fields[1] as DataConstr;
    expect((lb.fields[0] as DataConstr).constr).toBe(1n); // Finite lower
    expect((ub.fields[0] as DataConstr).constr).toBe(1n); // Finite upper
  });
});

// ── Datum helpers ─────────────────────────────────────────────────────────────

describe('computeDatumHash / resolveDatum', () => {
  it('computeDatumHash returns 64-char hex', () => {
    const d    = new DataI(42n);
    const hash = computeDatumHash(d);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('round-trips datum to hex and back via resolveDatum (inline)', () => {
    const original = new DataI(12345n);
    const cborHex  = datumToHex(original);

    const output = {
      address: '',
      amount: valueToMeshAssets({ lovelace: 1_000_000n }),
      addressHex: '60' + 'aa'.repeat(28),
      value: { lovelace: 1_000_000n },
      plutusData: cborHex,
    };

    const resolved = resolveDatum(output, {});
    expect(resolved).not.toBeNull();
    expect(resolved).toBeInstanceOf(DataI);
    expect((resolved as DataI).int).toBe(12345n);
  });

  it('resolveDatum finds datum via hash lookup in witness set', () => {
    const original = new DataConstr(0, [new DataI(99n)]);
    const cborHex  = datumToHex(original);
    const hashHex  = computeDatumHash(original);

    const output = {
      address: '',
      amount: valueToMeshAssets({ lovelace: 1_000_000n }),
      addressHex: '70' + 'aa'.repeat(28),
      value: { lovelace: 1_000_000n },
      dataHash: hashHex,
    };

    const resolved = resolveDatum(output, { [hashHex]: cborHex });
    expect(resolved).not.toBeNull();
    expect(resolved).toBeInstanceOf(DataConstr);
  });

  it('resolveDatum returns null when datum is missing', () => {
    const output = {
      address: '',
      amount: valueToMeshAssets({ lovelace: 1_000_000n }),
      addressHex: '70' + 'aa'.repeat(28),
      value: { lovelace: 1_000_000n },
      dataHash: 'a'.repeat(64),
    };
    expect(resolveDatum(output, {})).toBeNull();
  });
});

// ── V2 ScriptContext structure ────────────────────────────────────────────────

describe('buildV2ScriptContext', () => {
  it('returns Constr 0 [TxInfo, ScriptPurpose] for spending', () => {
    const { tx, inputUTxOs } = makeMinimalSpendTx();

    const ctx = buildV2ScriptContext(
      tx, inputUTxOs, [],
      { tag: 'spend', input: inputUTxOs[0].input, inputIndex: 0 },
      1_700_000_000_000, 1_000,
    ) as DataConstr;

    expect(ctx.constr).toBe(0n);
    expect(ctx.fields).toHaveLength(2);

    const txInfo      = ctx.fields[0] as DataConstr;
    const scriptPurp  = ctx.fields[1] as DataConstr;

    // V2 TxInfo has 12 fields
    expect(txInfo.constr).toBe(0n);
    expect(txInfo.fields).toHaveLength(12);

    // ScriptPurpose.Spending = constr 1
    expect(scriptPurp.constr).toBe(1n);
  });

  it('returns Constr 0 [TxInfo, ScriptPurpose] for minting', () => {
    const { tx, inputUTxOs } = makeMinimalMintTx();

    const ctx = buildV2ScriptContext(
      tx, inputUTxOs, [],
      { tag: 'mint', policyId: 'cc'.repeat(28), mintIndex: 0 },
      1_700_000_000_000, 1_000,
    ) as DataConstr;

    const scriptPurp = ctx.fields[1] as DataConstr;
    // ScriptPurpose.Minting = constr 0
    expect(scriptPurp.constr).toBe(0n);
  });
});

// ── V3 ScriptContext structure ────────────────────────────────────────────────

describe('buildV3ScriptContext', () => {
  it('returns Constr 0 [TxInfo, Redeemer, ScriptInfo] for spending', () => {
    const { tx, inputUTxOs } = makeMinimalSpendTx();
    const redeemer = new DataI(0n);

    const ctx = buildV3ScriptContext(
      tx, inputUTxOs, [],
      { tag: 'spend', input: inputUTxOs[0].input, inputIndex: 0 },
      redeemer,
      undefined,          // spendingDatum (Nothing)
      1_700_000_000_000, 1_000,
    ) as DataConstr;

    expect(ctx.constr).toBe(0n);
    expect(ctx.fields).toHaveLength(3);

    const txInfo     = ctx.fields[0] as DataConstr;
    const redData    = ctx.fields[1];
    const scriptInfo = ctx.fields[2] as DataConstr;

    // V3 TxInfo has 16 fields (4 governance fields added)
    expect(txInfo.constr).toBe(0n);
    expect(txInfo.fields).toHaveLength(16);

    // Redeemer is passed through unchanged
    expect(redData).toBeInstanceOf(DataI);

    // ScriptInfo.SpendingScript = constr 1
    expect(scriptInfo.constr).toBe(1n);
  });

  it('V3 fee field is DataI (bare Lovelace), not a DataMap', () => {
    const { tx, inputUTxOs } = makeMinimalSpendTx();
    const redeemer = new DataI(0n);

    const ctx = buildV3ScriptContext(
      tx, inputUTxOs, [],
      { tag: 'spend', input: inputUTxOs[0].input, inputIndex: 0 },
      redeemer,
      undefined,          // spendingDatum (Nothing)
      1_700_000_000_000, 1_000,
    ) as DataConstr;

    const txInfo = ctx.fields[0] as DataConstr;
    // index 3 = fee
    const feeField = txInfo.fields[3];
    expect(feeField).toBeInstanceOf(DataI);
    expect((feeField as DataI).int).toBe(tx.body.fee);
  });

  it('V2 fee field is DataMap (Value with lovelace key)', () => {
    const { tx, inputUTxOs } = makeMinimalSpendTx();

    const ctx = buildV2ScriptContext(
      tx, inputUTxOs, [],
      { tag: 'spend', input: inputUTxOs[0].input, inputIndex: 0 },
      1_700_000_000_000, 1_000,
    ) as DataConstr;

    const txInfo   = ctx.fields[0] as DataConstr;
    const feeField = txInfo.fields[3];
    expect(feeField).toBeInstanceOf(DataMap);
  });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMinimalSpendTx(): { tx: Transaction; inputUTxOs: UTxO[] } {
  const input = { txHash: 'a'.repeat(64), outputIndex: 0 };
  const inputUTxOs: UTxO[] = [{
    input,
    output: {
      address:    'addr_test1...',
      amount:     valueToMeshAssets({ lovelace: 5_000_000n }),
      addressHex: '70' + 'bb'.repeat(28),
      value:      { lovelace: 5_000_000n },
    },
  }];

  const tx: Transaction = {
    hash: 'd'.repeat(64),
    body: {
      inputs:          [input],
      referenceInputs: [],
      outputs: [{
        address:    'addr_test1...',
        amount:     valueToMeshAssets({ lovelace: 4_800_000n }),
        addressHex: '60' + 'aa'.repeat(28),
        value:      { lovelace: 4_800_000n },
      }],
      fee:     200_000n,
    },
    witnesses: {
      vkeyWitnesses: [],
      datums:        {},
      redeemers:     [],
      scripts:       {},
    },
    isValid: true,
    slot:    1000,
  };

  return { tx, inputUTxOs };
}

function makeMinimalMintTx(): { tx: Transaction; inputUTxOs: UTxO[] } {
  const { tx, inputUTxOs } = makeMinimalSpendTx();
  const tokenNameHex = Buffer.from('myToken').toString('hex');
  tx.body.mint = { ['cc'.repeat(28)]: { [tokenNameHex]: 100n } };
  return { tx, inputUTxOs };
}
