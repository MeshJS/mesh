/**
 * Plutus ScriptContext builder.
 *
 * Constructs the PlutusData value that the ledger passes to a Plutus script
 * as its final argument.  Two versions are supported:
 *
 *   V2  (Babbage/Conway):
 *     ScriptContext = Constr 0 [ TxInfo, ScriptPurpose ]
 *     called as:  script datum redeemer context   (spend)
 *                 script redeemer context          (mint)
 *
 *   V3  (Conway-native):
 *     ScriptContext = Constr 0 [ TxInfo, Redeemer, ScriptInfo ]
 *     called as:  script redeemer context          (both spend and mint)
 *     (datum for spending is embedded in ScriptInfo.SpendingScript)
 *
 * All Data encoding follows the `makeIsDataIndexed` convention from
 * `plutus-ledger-api`:  single-constructor newtypes are Constr 0 [field],
 * sum types use their constructor index.
 *
 * Formal references:
 *   - plutus-ledger-api V2: PlutusLedgerApi.V2.Contexts
 *   - plutus-ledger-api V3: PlutusLedgerApi.V3.Contexts
 *   - cardano-ledger: eras/babbage/impl/.../TxInfo.hs
 *   - cardano-ledger: eras/conway/impl/.../TxInfo.hs
 */

import {
  DataConstr,
  DataI,
  DataB,
  DataList,
  DataMap,
  dataFromCbor,
  hashData,
  dataToCbor,
} from '@harmoniclabs/plutus-data';
import type { Data } from '@harmoniclabs/plutus-data';
import type { KV }  from '@harmoniclabs/plutus-data';

/** Shorthand for DataMap key-value pair (replaces deprecated DataPair). */
function kv(fst: Data, snd: Data): KV<Data, Data> { return { fst, snd }; }

import type {
  TxInput,
  TxOutput,
  UTxO,
  Value,
  MultiAsset,
  TxRedeemerInfo,
  Transaction,
} from '../types.js';
import { fromHex, toHex } from '../crypto.js';

// ── Re-export for consumers ───────────────────────────────────────────────────

export { Data };

// ── Script purpose tags ───────────────────────────────────────────────────────

export type ScriptPurposeTag =
  | { tag: 'spend'; input: TxInput; inputIndex: number }
  | { tag: 'mint';  policyId: string; mintIndex: number };

// ── Public entry points ────────────────────────────────────────────────────────

/**
 * Build a V2 ScriptContext.
 * For spending: pass `spendingDatum` from the UTxO being spent.
 * The datum is returned for the caller to pass as the first script arg.
 */
export function buildV2ScriptContext(
  tx:            Transaction,
  inputUTxOs:    UTxO[],
  refInputUTxOs: UTxO[],
  purpose:       ScriptPurposeTag,
  genesisMs:     number,  // unix ms at slot 0
  slotLengthMs:  number,
): Data {
  const txInfo     = buildV2TxInfo(tx, inputUTxOs, refInputUTxOs, genesisMs, slotLengthMs);
  const scriptPurp = dataScriptPurposeV2(purpose, tx);
  return new DataConstr(0, [txInfo, scriptPurp]);
}

/**
 * Build a V3 ScriptContext.
 *
 * @param spendingDatum  Resolved datum for spending scripts.
 *                       Embedded as `Just datum` in `SpendingScript TxOutRef (Maybe Datum)`.
 *                       Pass `undefined` for minting and other non-spending purposes.
 */
export function buildV3ScriptContext(
  tx:            Transaction,
  inputUTxOs:    UTxO[],
  refInputUTxOs: UTxO[],
  purpose:       ScriptPurposeTag,
  redeemerData:  Data,
  spendingDatum: Data | undefined,
  genesisMs:     number,
  slotLengthMs:  number,
): Data {
  const txInfo     = buildV3TxInfo(tx, inputUTxOs, refInputUTxOs, genesisMs, slotLengthMs);
  const scriptInfo = dataScriptInfoV3(purpose, spendingDatum);
  return new DataConstr(0, [txInfo, redeemerData, scriptInfo]);
}

/**
 * Decode a datum from the witness set or from an inline datum.
 * Returns null if the datum cannot be resolved.
 */
export function resolveDatum(
  output: TxOutput,
  witnessDatums: Record<string, string>,
): Data | null {
  if (output.plutusData) {
    try { return dataFromCbor(fromHex(output.plutusData)); } catch { return null; }
  }
  if (output.dataHash) {
    const cborHex = witnessDatums[output.dataHash];
    if (cborHex) {
      try { return dataFromCbor(fromHex(cborHex)); } catch { return null; }
    }
  }
  return null;
}

/**
 * Compute the datum hash of a Data value (blake2b-256 of CBOR encoding).
 */
export function computeDatumHash(d: Data): string {
  return toHex(hashData(d));
}

/**
 * Serialize a Data value to CBOR hex.
 */
export function datumToHex(d: Data): string {
  return toHex(dataToCbor(d));
}

// ── V2 TxInfo ─────────────────────────────────────────────────────────────────

function buildV2TxInfo(
  tx:            Transaction,
  inputUTxOs:    UTxO[],
  refInputUTxOs: UTxO[],
  genesisMs:     number,
  slotLengthMs:  number,
): DataConstr {
  const body = tx.body;

  const inputs    = new DataList(inputUTxOs.map(dataTxInInfo));
  const refInputs = new DataList(refInputUTxOs.map(dataTxInInfo));
  const outputs   = new DataList(body.outputs.map(dataTxOutV2));
  const fee       = dataValueLovelace(body.fee);   // V2: Value (map with "" key)
  const mint      = dataMultiAssetValue(body.mint ?? {}); // V2: Value (no lovelace key)
  const dcert     = new DataList([]);
  const wdrl      = new DataMap<Data, Data>([]);
  const validRange = dataPosixTimeRange(
    body.validityStart, body.ttl, genesisMs, slotLengthMs,
  );
  const signers   = new DataList((body.requiredSigners ?? []).map(kh => new DataB(fromHex(kh))));
  const redeemers = dataRedeemersMapV2(tx);
  const datums    = dataDatumMap(tx.witnesses.datums);
  const txId      = new DataB(fromHex(tx.hash)); // TxId (LedgerBytes → bytes)

  return new DataConstr(0, [
    inputs, refInputs, outputs,
    fee, mint, dcert, wdrl, validRange,
    signers, redeemers, datums, txId,
  ]);
}

// ── V3 TxInfo ─────────────────────────────────────────────────────────────────

function buildV3TxInfo(
  tx:            Transaction,
  inputUTxOs:    UTxO[],
  refInputUTxOs: UTxO[],
  genesisMs:     number,
  slotLengthMs:  number,
): DataConstr {
  const body = tx.body;

  const inputs    = new DataList(inputUTxOs.map(dataTxInInfo));
  const refInputs = new DataList(refInputUTxOs.map(dataTxInInfo));
  const outputs   = new DataList(body.outputs.map(dataTxOutV2)); // V3 uses same TxOut shape
  const fee       = new DataI(body.fee);                // V3: bare Lovelace (Integer)
  const mint      = dataMultiAssetValue(body.mint ?? {}); // V3: MintValue (no lovelace)
  const txCerts   = new DataList([]);
  const wdrl      = new DataMap<Data, Data>([]);
  const validRange = dataPosixTimeRange(
    body.validityStart, body.ttl, genesisMs, slotLengthMs,
  );
  const signers   = new DataList((body.requiredSigners ?? []).map(kh => new DataB(fromHex(kh))));
  const redeemers = dataRedeemersMapV3(tx);
  const datums    = dataDatumMap(tx.witnesses.datums);
  const txId      = new DataB(fromHex(tx.hash)); // TxId → bytes (V3.Tx)
  const votes     = new DataMap<Data, Data>([]);       // governance — not supported yet
  const proposals = new DataList([]);
  const treasury  = new DataConstr(0, []); // Nothing
  const donation  = new DataConstr(0, []); // Nothing

  return new DataConstr(0, [
    inputs, refInputs, outputs,
    fee, mint, txCerts, wdrl, validRange,
    signers, redeemers, datums, txId,
    votes, proposals, treasury, donation,
  ]);
}

// ── TxInInfo ──────────────────────────────────────────────────────────────────

function dataTxInInfo(utxo: UTxO): DataConstr {
  return new DataConstr(0, [dataTxOutRef(utxo.input), dataTxOutV2(utxo.output)]);
}

function dataTxOutRef(input: TxInput): DataConstr {
  return new DataConstr(0, [
    new DataB(fromHex(input.txHash)), // TxId
    new DataI(input.outputIndex),
  ]);
}

// ── TxOut (V2/V3 share the same shape) ────────────────────────────────────────

function dataTxOutV2(output: TxOutput): DataConstr {
  const address    = dataAddress(output.addressHex);
  const value      = dataValueV2(output.value);
  const datum      = dataOutputDatum(output);
  const refScript  = dataRefScript(output);
  return new DataConstr(0, [address, value, datum, refScript]);
}

// ── Address ───────────────────────────────────────────────────────────────────

/**
 * Encode a raw Shelley address (hex) as Plutus Address data.
 *
 * Header byte layout (bits 7-4 = type, bits 3-0 = network):
 *   0  base key+key        bytes 1-28 = payment pkh, 29-56 = stake pkh
 *   1  base script+key     bytes 1-28 = script hash, 29-56 = stake pkh
 *   2  base key+script     bytes 1-28 = payment pkh, 29-56 = script hash
 *   3  base script+script  bytes 1-28 = script hash, 29-56 = script hash
 *   4  pointer key         bytes 1-28 = pkh, pointer encoded after
 *   5  pointer script      bytes 1-28 = script hash
 *   6  enterprise key      bytes 1-28 = pkh
 *   7  enterprise script   bytes 1-28 = script hash
 *   8  Byron               different format
 */
export function dataAddress(addressHex: string): DataConstr {
  const bytes       = fromHex(addressHex);
  const header      = bytes[0] ?? 0;
  const typeNibble  = (header >> 4) & 0xf;
  const addrBytes   = bytes.slice(1, 29);

  // Credential / hashes are newtypes over BuiltinByteString → raw DataB (see Plutus Tx.ToData)
  const paymentCred: DataConstr =
    isKeyPayment(typeNibble)
      ? new DataConstr(0, [new DataB(addrBytes)])   // PubKeyCredential PubKeyHash
      : new DataConstr(1, [new DataB(addrBytes)]); // ScriptCredential ScriptHash

  const stakingCred = dataStakingCred(typeNibble, bytes);

  return new DataConstr(0, [paymentCred, stakingCred]);
}

function isKeyPayment(typeNibble: number): boolean {
  return typeNibble === 0 || typeNibble === 2 || typeNibble === 4 || typeNibble === 6;
}

function dataStakingCred(typeNibble: number, bytes: Uint8Array): DataConstr {
  const stakeBytes = bytes.slice(29, 57);

  switch (typeNibble) {
    case 0: // base key+key
    case 1: // base script+key
      // Just (StakingHash (PubKeyCredential stakePkh)); StakingHash = constr 0
      return new DataConstr(1, [
        new DataConstr(0, [new DataConstr(0, [new DataB(stakeBytes)])]),
      ]);

    case 2: // base key+script
    case 3: // base script+script
      return new DataConstr(1, [
        new DataConstr(0, [new DataConstr(1, [new DataB(stakeBytes)])]),
      ]);

    default:
      return new DataConstr(0, []); // Nothing
  }
}

// ── Value encodings ───────────────────────────────────────────────────────────

/**
 * V2 fee: full Value map with ADA entry.
 * CurrencySymbol("") → TokenName("") → lovelace
 */
function dataValueLovelace(lovelace: bigint): DataMap<Data, Data> {
  const emptyBs = new Uint8Array(0);
  return new DataMap<Data, Data>([
    kv(
      new DataB(emptyBs), // CurrencySymbol ""
      new DataMap<Data, Data>([kv(new DataB(emptyBs), new DataI(lovelace))]), // TokenName ""
    ),
  ]);
}

/**
 * Full Value map including ADA + multi-asset (used for TxOut values in V2 and V3).
 */
function dataValueV2(value: Value): DataMap<Data, Data> {
  const pairs: KV<Data, Data>[] = [];

  // ADA comes first (empty policy id)
  const emptyBs = new Uint8Array(0);
  if (value.lovelace > 0n) {
    pairs.push(kv(
      new DataB(emptyBs),
      new DataMap<Data, Data>([kv(new DataB(emptyBs), new DataI(value.lovelace))]),
    ));
  }

  // Multi-asset policies (sorted ascending by policy id for determinism)
  if (value.assets) {
    const pids = Object.keys(value.assets).sort();
    for (const pid of pids) {
      const assets     = value.assets[pid];
      const assetPairs = Object.keys(assets).sort().map(name =>
        kv(
          new DataB(name ? fromHex(name) : emptyBs),
          new DataI(assets[name] ?? 0n),
        ),
      );
      pairs.push(kv(
        new DataB(fromHex(pid)),
        new DataMap<Data, Data>(assetPairs),
      ));
    }
  }

  return new DataMap<Data, Data>(pairs);
}

/**
 * Multi-asset-only Value (no ADA entry) — used for txInfoMint in V2 and V3,
 * and for V3 MintValue.
 */
function dataMultiAssetValue(mint: MultiAsset): DataMap<Data, Data> {
  const emptyBs = new Uint8Array(0);
  const pairs: KV<Data, Data>[] = Object.keys(mint).sort().map(pid => {
    const assets     = mint[pid];
    const assetPairs = Object.keys(assets).sort().map(name =>
      kv(
        new DataB(name ? fromHex(name) : emptyBs),
        new DataI(assets[name] ?? 0n),
      ),
    );
    return kv(new DataB(fromHex(pid)), new DataMap<Data, Data>(assetPairs));
  });
  return new DataMap<Data, Data>(pairs);
}

// ── OutputDatum ───────────────────────────────────────────────────────────────

function dataOutputDatum(output: TxOutput): DataConstr {
  if (output.plutusData) {
    try {
      const d = dataFromCbor(fromHex(output.plutusData));
      return new DataConstr(2, [d]); // OutputDatum (inline)
    } catch { /* fall through to NoOutputDatum */ }
  }
  if (output.dataHash) {
    return new DataConstr(1, [new DataB(fromHex(output.dataHash))]); // OutputDatumHash (DatumHash = bytes)
  }
  return new DataConstr(0, []); // NoOutputDatum
}

// ── Reference script ──────────────────────────────────────────────────────────

function dataRefScript(output: TxOutput): DataConstr {
  if (output.scriptHash) {
    return new DataConstr(1, [new DataB(fromHex(output.scriptHash))]); // Just ScriptHash
  }
  return new DataConstr(0, []); // Nothing
}

// ── POSIXTimeRange ────────────────────────────────────────────────────────────

/**
 * Build Interval<POSIXTime> from optional slot bounds.
 *
 *   always          → Interval (LowerBound NegInf True) (UpperBound PosInf True)
 *   validityStart s → lower bound = Finite(slotToPosix(s)), closed
 *   ttl s           → upper bound = Finite(slotToPosix(s)), open
 */
export function dataPosixTimeRange(
  validityStart: number | undefined,
  ttl:           number | undefined,
  genesisMs:     number,
  slotLengthMs:  number,
): DataConstr {
  function slotToMs(slot: number): bigint {
    return BigInt(genesisMs) + BigInt(slot) * BigInt(slotLengthMs);
  }

  const lower: DataConstr = validityStart !== undefined
    ? new DataConstr(0, [new DataConstr(1, [new DataI(slotToMs(validityStart))]), boolData(true)])
    : new DataConstr(0, [new DataConstr(0, []), boolData(true)]); // NegInf, closed

  const upper: DataConstr = ttl !== undefined
    ? new DataConstr(0, [new DataConstr(1, [new DataI(slotToMs(ttl))]), boolData(false)])
    : new DataConstr(0, [new DataConstr(2, []), boolData(true)]); // PosInf, closed

  return new DataConstr(0, [lower, upper]);
}

function boolData(b: boolean): DataConstr {
  return b ? new DataConstr(1, []) : new DataConstr(0, []);
}

// ── Redeemer maps ─────────────────────────────────────────────────────────────

/**
 * txInfoRedeemers for V2:
 * Map<V2.ScriptPurpose, Redeemer>
 * Keys:
 *   Spending → Constr 1 [TxOutRef]
 *   Minting  → Constr 0 [CurrencySymbol]
 */
/** Ledger AssocMap encoding uses keys sorted by their CBOR (lexicographic) order. */
function sortMapPairsByKeyCbor(pairs: KV<Data, Data>[]): KV<Data, Data>[] {
  return [...pairs].sort((a, b) =>
    Buffer.compare(Buffer.from(dataToCbor(a.fst)), Buffer.from(dataToCbor(b.fst))),
  );
}

function dataRedeemersMapV2(tx: Transaction): DataMap<Data, Data> {
  const sortedInputs = [...tx.body.inputs].sort(cmpTxInput);
  const sortedMints  = Object.keys(tx.body.mint ?? {}).sort();

  const pairs: KV<Data, Data>[] = tx.witnesses.redeemers.map(r => {
    const key = scriptPurposeKeyV2(r, sortedInputs, sortedMints);
    const val = decodeRedeemerData(r.dataHex);
    return kv(key, val);
  });

  return new DataMap<Data, Data>(sortMapPairsByKeyCbor(pairs));
}

/**
 * txInfoRedeemers for V3:
 * Map<V3.ScriptPurpose, Redeemer>  (same key encoding as V2 for Spend/Mint)
 */
function dataRedeemersMapV3(tx: Transaction): DataMap<Data, Data> {
  return dataRedeemersMapV2(tx); // Spend/Mint keys are identical between V2 and V3
}

function scriptPurposeKeyV2(
  r:             TxRedeemerInfo,
  sortedInputs:  TxInput[],
  sortedMints:   string[],
): Data {
  switch (r.tag) {
    case 'spend': {
      const inp = sortedInputs[r.index];
      if (!inp) return new DataConstr(1, [new DataConstr(0, [new DataB(new Uint8Array(32)), new DataI(0)])]);
      return new DataConstr(1, [dataTxOutRef(inp)]);
    }
    case 'mint': {
      const pid = sortedMints[r.index] ?? '';
      return new DataConstr(0, [new DataB(fromHex(pid))]);
    }
    default:
      return new DataConstr(2, [new DataConstr(0, [])]); // placeholder for unsupported tags
  }
}

function decodeRedeemerData(cborHex: string): Data {
  try { return dataFromCbor(fromHex(cborHex)); } catch { return new DataConstr(0, []); }
}

// ── Datum map ─────────────────────────────────────────────────────────────────

/**
 * Map<DatumHash, Datum>
 * Key: DatumHash encodes as raw bytes (see Plutus newtype ToData).
 * Value: the raw Datum data
 */
function dataDatumMap(datums: Record<string, string>): DataMap<Data, Data> {
  const pairs: KV<Data, Data>[] = Object.entries(datums).map(([hashHex, cborHex]) => {
    const key = new DataB(fromHex(hashHex)); // DatumHash → bytes
    const val = decodeRedeemerData(cborHex);
    return kv(key, val);
  });
  return new DataMap<Data, Data>(sortMapPairsByKeyCbor(pairs));
}

// ── Script purpose encodings ──────────────────────────────────────────────────

function dataScriptPurposeV2(purpose: ScriptPurposeTag, tx: Transaction): Data {
  if (purpose.tag === 'spend') {
    return new DataConstr(1, [dataTxOutRef(purpose.input)]); // Spending TxOutRef
  }
  return new DataConstr(0, [new DataB(fromHex(purpose.policyId))]); // Minting CurrencySymbol (bytes)
}

/**
 * V3 ScriptInfo encoding:
 *   MintingScript  CurrencySymbol              → Constr 0 [bytes]
 *   SpendingScript TxOutRef (Maybe Datum)       → Constr 1 [TxOutRef, Maybe Datum]
 *
 * Reference: plutus-ledger-api V3: PlutusLedgerApi.V3.Contexts (ScriptInfo)
 */
function dataScriptInfoV3(purpose: ScriptPurposeTag, spendingDatum: Data | undefined): Data {
  if (purpose.tag === 'spend') {
    const datumField = spendingDatum !== undefined
      ? new DataConstr(1, [spendingDatum])  // Just datum
      : new DataConstr(0, []);              // Nothing
    return new DataConstr(1, [dataTxOutRef(purpose.input), datumField]);
  }
  return new DataConstr(0, [new DataB(fromHex(purpose.policyId))]); // MintingScript CurrencySymbol
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cmpTxInput(a: TxInput, b: TxInput): number {
  if (a.txHash < b.txHash) return -1;
  if (a.txHash > b.txHash) return  1;
  return a.outputIndex - b.outputIndex;
}
