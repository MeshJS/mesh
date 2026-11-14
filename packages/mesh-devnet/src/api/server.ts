/**
 * DevNet HTTP server.
 *
 * NOT a Blockfrost clone — this is our own clean protocol shape.
 * `DevnetProvider` (provider.ts) is the TypeScript SDK that translates
 * MeshSDK's `IFetcher` / `ISubmitter` calls into requests against this
 * server.
 *
 * Routes:
 *   POST /tx/submit                     submit raw CBOR (or {cbor:"<hex>"} JSON)
 *   GET  /utxos/:address    ?asset=…    UTxOs at an address, optionally filtered
 *   GET  /utxo/:txHash/:idx             single UTxO (mesh fetchUTxOs(hash, idx))
 *   GET  /tx/:hash                      transaction info (with resolved inputs)
 *   GET  /tx/:hash/utxos                inputs/outputs of a tx
 *   GET  /address/:addr/txs             transactions touching an address
 *   GET  /block/latest                  latest block
 *   GET  /block/:id                     block by hash or by height
 *   GET  /block/:id/txs                 tx hashes in a block
 *   GET  /params                        protocol parameters (Mesh-shaped)
 *   GET  /tip                           chain tip + network identity
 *   GET  /mempool                       pending mempool entries
 *   GET  /wallets                       genesis pre-funded wallets
 *   POST /topup/:address/:lovelace      faucet (devnet-only)
 *   GET  /health                        liveness probe
 */

//instead of express use axios

import http                             from 'http';
import { WebSocketServer, WebSocket }   from 'ws';
import express, { Request, Response }   from 'express';
import { bech32 }                       from 'bech32';
import type { LedgerState }             from '../ledger/state.js';
import type { Mempool }                 from '../mempool.js';
import type { TransactionValidator }    from '../ledger/validator.js';
import type { ProtocolParams }          from '../config.js';
import type { GenesisWallet, UTxO, Value, Block, Transaction } from '../types.js';
import { valueToMeshAssets }            from '../types.js';
import { NETWORK_MAGIC, NETWORK_ID }    from '../config.js';
import { blake2b256, toHex }            from '../crypto.js';
import { DevnetEvaluator }              from '../ledger/evaluator.js';

export interface ServerOptions {
  state:     LedgerState;
  mempool:   Mempool;
  validator: TransactionValidator;
  params:    ProtocolParams;
  wallets:   GenesisWallet[];
  port:      number;
}

export function startServer(opts: ServerOptions): http.Server {
  const { state, mempool, validator, params, wallets, port } = opts;
  const evaluator = new DevnetEvaluator(state, params);
  const app       = express();

  app.use(express.raw({ type: ['application/cbor', 'application/octet-stream'], limit: '2mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.text({ type: 'text/plain', limit: '2mb' }));

  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
  });
  app.options('/*path', (_req, res) => res.sendStatus(200));

  // ── Health ──────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({
    ok: true,
    networkMagic: NETWORK_MAGIC,
    networkId:    NETWORK_ID,
    era:          `${params.protocolMajorVersion}.${params.protocolMinorVersion}`,
  }));

  // ── Chain tip ───────────────────────────────────────────────────────────
  app.get('/tip', (_req, res) => {
    const b = state.latestBlock();
    res.json({
      slot:        state.currentSlot(),
      blockHeight: b?.height    ?? 0,
      blockHash:   b?.hash      ?? null,
      epoch:       b ? Math.floor(b.slot / params.epochLength) : 0,
      epochSlot:   b?.epochSlot ?? 0,
      networkMagic: NETWORK_MAGIC,
      networkId:   NETWORK_ID,
    });
  });

  // ── Protocol parameters ─────────────────────────────────────────────────
  app.get('/params', (_req, res) => res.json(serializeParams(params)));

  // ── UTxOs by address ────────────────────────────────────────────────────
  app.get('/utxos/:address', (req, res) => {
    const { address } = req.params;
    const { asset }   = req.query as Record<string, string>;
    let utxos = state.utxosByAddress(address);
    if (asset && asset !== 'lovelace') {
      utxos = utxos.filter(u =>
        u.output.value.assets &&
        Object.entries(u.output.value.assets).some(([pid, am]) =>
          Object.keys(am).some(name => pid + name === asset)));
    }
    res.json(utxos.map(serializeUTxO));
  });

  // ── Single UTxO (Mesh fetchUTxOs(hash, idx)) ────────────────────────────
  app.get('/utxo/:txHash/:idx', (req, res) => {
    const idx = Number(req.params.idx);
    const u   = state.getUTxO({ txHash: req.params.txHash, outputIndex: idx });
    if (!u) return void res.status(404).json({ error: 'UTxO not found' });
    res.json(serializeUTxO(u));
  });

  // ── Transactions ────────────────────────────────────────────────────────
  app.get('/tx/:hash', (req, res) => {
    const tx = state.getTx(req.params.hash);
    if (!tx) return void res.status(404).json({ error: 'Transaction not found' });
    const blk = state.allBlocks().find(b => b.txHashes.includes(tx.hash));
    res.json(serializeTx(tx, blk, state));
  });

  app.get('/tx/:hash/utxos', (req, res) => {
    const tx = state.getTx(req.params.hash);
    if (!tx) return void res.status(404).json({ error: 'Transaction not found' });
    res.json({
      hash:    tx.hash,
      inputs:  tx.body.inputs.map(i => ({ txHash: i.txHash, outputIndex: i.outputIndex })),
      outputs: tx.body.outputs.map((o, idx) => ({
        outputIndex: idx,
        address:     o.address,
        amount:      serializeValue(o.value),
        dataHash:    o.dataHash   ?? null,
        plutusData:  o.plutusData ?? null,
        scriptRef:   o.scriptRef  ?? null,
      })),
    });
  });

  // ── Address tx history ─────────────────────────────────────────────────
  app.get('/address/:addr/txs', (req, res) => {
    const addr = req.params.addr;
    const txs: ReturnType<typeof serializeTx>[] = [];
    for (const blk of state.allBlocks()) {
      for (const h of blk.txHashes) {
        const tx = state.getTx(h);
        if (!tx) continue;
        const touchesAddress =
          tx.body.outputs.some(o => o.address === addr || o.addressHex === addr) ||
          tx.body.inputs.some(i => {
            const u = state.getUTxO(i);
            return !!u && (u.output.address === addr || u.output.addressHex === addr);
          });
        if (touchesAddress) txs.push(serializeTx(tx, blk, state));
      }
    }
    res.json(txs);
  });

  // ── Blocks ──────────────────────────────────────────────────────────────
  app.get('/block/latest', (_req, res) => {
    const b = state.latestBlock();
    if (!b) return void res.status(404).json({ error: 'No blocks yet' });
    res.json(serializeBlock(b));
  });

  app.get('/block/:id', (req, res) => {
    const id = req.params.id;
    const b  = /^\d+$/.test(id) ? state.getBlock(Number(id)) : state.getBlock(id);
    if (!b) return void res.status(404).json({ error: 'Block not found' });
    res.json(serializeBlock(b));
  });

  app.get('/block/:id/txs', (req, res) => {
    const id = req.params.id;
    const b  = /^\d+$/.test(id) ? state.getBlock(Number(id)) : state.getBlock(id);
    if (!b) return void res.status(404).json({ error: 'Block not found' });
    res.json(b.txHashes);
  });

  // ── Submit ──────────────────────────────────────────────────────────────
  app.post('/tx/submit', (req: Request, res: Response) => {
    try {
      let rawCbor: Uint8Array;

      if (Buffer.isBuffer(req.body)) {
        rawCbor = new Uint8Array(req.body);
      } else if (typeof req.body === 'string') {
        rawCbor = new Uint8Array(Buffer.from(req.body.trim(), 'hex'));
      } else if (req.body?.cbor) {
        rawCbor = new Uint8Array(Buffer.from(req.body.cbor, 'hex'));
      } else {
        return void res.status(400).json({ error: 'Send raw CBOR bytes or {cbor:"<hex>"}' });
      }

      if (rawCbor.length === 0) {
        return void res.status(400).json({ error: 'Empty transaction body cbor not passed' });
      }

      const result = validator.parseAndValidate(rawCbor);
      if (!result.ok) return void res.status(400).json({ error: result.error });

      const { tx } = result;
      if (mempool.has(tx.hash) || state.getTx(tx.hash)) {
        return void res.status(200).json({ txHash: tx.hash }); // idempotent
      }

      mempool.add(tx, rawCbor);
      res.status(200).json({ txHash: tx.hash });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── Mempool ─────────────────────────────────────────────────────────────
  app.get('/mempool', (_req, res) => {
    res.json({
      size: mempool.size(),
      txs:  mempool.peek().map(e => ({ txHash: e.tx.hash, addedAt: e.addedAt })),
    });
  });

  // ── Genesis wallets ─────────────────────────────────────────────────────
  app.get('/wallets', (_req, res) => {
    res.json(wallets.map(w => ({
      index:          w.index,
      address:        w.addressBech32,
      paymentKeyHash: w.paymentKeyHash,
      privateKey:     w.privateKeyHex,
      privateKeyCli:  w.privateKeyCliHex, // 5820… — drop straight into MeshWallet
      publicKey:      w.publicKeyHex,
      lovelace:       w.initialLovelace.toString(),
    })));
  });

  // ── Faucet (topup) ──────────────────────────────────────────────────────
  app.post('/topup/:address/:lovelace', (req, res) => {
    const { address, lovelace } = req.params;
    try {
      const amount = BigInt(lovelace);
      if (amount <= 0n) return void res.status(400).json({ error: 'lovelace must be > 0' });

      // Resolve the bech32 → raw address bytes so the resulting UTxO is
      // spendable: the validator extracts the payment key hash from those
      // bytes, and downstream witness checks need it to be correct.
      let addressHex = '';
      try {
        const { words } = bech32.decode(address, 1000);
        addressHex = Buffer.from(bech32.fromWords(words)).toString('hex');
      } catch {
        return void res.status(400).json({ error: `Invalid bech32 address: ${address}` });
      }

      // Faucet UTxO id is deterministic per (address, lovelace, slot) so
      // repeated calls at the same slot are idempotent at the API layer.
      const seed   = `faucet:${address}:${lovelace}:${state.currentSlot()}`;
      const txHash = toHex(blake2b256(Buffer.from(seed)));

      state.addUTxO({
        input:  { txHash, outputIndex: 0 },
        output: {
          address,
          amount:     valueToMeshAssets({ lovelace: amount }),
          addressHex,
          value:      { lovelace: amount },
        },
      });

      res.json({ txHash, address, lovelace });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ── Evaluate (IEvaluator.evaluateTx) ───────────────────────────────────
  app.post('/evaluate', async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const cbor: string | undefined =
        typeof body === 'string' ? body.trim() :
        Buffer.isBuffer(body)    ? Buffer.from(body).toString('hex') :
        body?.cbor;

      if (!cbor) return void res.status(400).json({ error: 'Send {cbor:"<hex>"} or raw CBOR' });

      const additionalUTxOs: UTxO[] = Array.isArray(body?.additionalUTxOs)
        ? (body.additionalUTxOs as UTxO[])
        : [];

      const estimates = await evaluator.evaluateTx(cbor, additionalUTxOs);
      res.json(estimates);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ── HTTP + WebSocket ────────────────────────────────────────────────────
  const server = http.createServer(app);
  const wss    = new WebSocketServer({ server, path: '/ws' });

  const broadcast = (type: string, payload: unknown) => {
    const msg = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  };

  // Forward ledger events to WebSocket clients
  state.on('block', (block: Block) => broadcast('block', serializeBlock(block)));
  state.on('tx',    (tx: Transaction) => broadcast('tx', { hash: tx.hash, slot: tx.slot }));

  server.listen(port);
  return server;
}

// ── Serialization ─────────────────────────────────────────────────────────────

function serializeParams(p: ProtocolParams) {
  // Numeric fields stay numeric — Mesh's `Protocol` type expects numbers
  // for coinsPerUtxoSize, keyDeposit, poolDeposit, maxValSize, etc.
  return {
    epoch:                      0,
    coinsPerUtxoSize:           p.coinsPerUTxOByte,
    priceMem:                   p.priceMem,
    priceStep:                  p.priceStep,
    minFeeA:                    p.minFeeA,
    minFeeB:                    p.minFeeB,
    keyDeposit:                 Number(p.keyDeposit),
    maxTxSize:                  p.maxTxSize,
    maxValSize:                 p.maxValSize,
    poolDeposit:                Number(p.poolDeposit),
    maxCollateralInputs:        p.maxCollateralInputs,
    decentralisation:           0,
    maxBlockSize:               p.maxBlockSize,
    collateralPercent:          p.collateralPercent,
    maxBlockHeaderSize:         p.maxBlockHeaderSize,
    minPoolCost:                '340000000',
    maxTxExMem:                 p.maxTxExMem.toString(),
    maxTxExSteps:               p.maxTxExSteps.toString(),
    maxBlockExMem:              '80000000',
    maxBlockExSteps:            '40000000000',
    minFeeRefScriptCostPerByte: p.minFeeRefScriptCostPerByte,
    networkMagic:               NETWORK_MAGIC,
    networkId:                  NETWORK_ID,
    protocolVersion:            { major: p.protocolMajorVersion, minor: p.protocolMinorVersion },
  };
}

function serializeUTxO(u: UTxO) {
  return {
    input:  { txHash: u.input.txHash, outputIndex: u.input.outputIndex },
    output: {
      address:    u.output.address,
      amount:     serializeValue(u.output.value),
      dataHash:   u.output.dataHash   ?? null,
      plutusData: u.output.plutusData ?? null,
      scriptRef:  u.output.scriptRef  ?? null,
    },
  };
}

function serializeValue(v: Value): Array<{ unit: string; quantity: string }> {
  const out = [{ unit: 'lovelace', quantity: v.lovelace.toString() }];
  if (v.assets) {
    for (const [pid, assets] of Object.entries(v.assets)) {
      for (const [name, qty] of Object.entries(assets)) {
        out.push({ unit: pid + name, quantity: qty.toString() });
      }
    }
  }
  return out;
}

function serializeBlock(b: Block) {
  return {
    hash:          b.hash,
    height:        b.height,
    slot:          b.slot,
    epoch:         b.epoch,
    epochSlot:     b.epochSlot,
    time:          b.time,
    txCount:       b.txCount,
    txHashes:      b.txHashes,
    previousHash:  b.previousHash,
    bodyHash:      b.bodyHash,
    feesCollected: b.feesCollected.toString(),
    slotLeader:    'devnet',
    networkMagic:  NETWORK_MAGIC,
  };
}

function serializeTx(tx: Transaction, blk: Block | undefined, state: LedgerState) {
  // Resolve inputs to {txHash, outputIndex, address, amount} so Mesh's
  // TransactionInfo.inputs (UTxO[]) round-trips losslessly.
  const inputs = tx.body.inputs.map(i => {
    const u = state.getUTxO(i) ?? state.getTx(i.txHash)?.body.outputs[i.outputIndex];
    if (u && 'output' in (u as any)) {
      const utxo = u as UTxO;
      return {
        txHash:      i.txHash,
        outputIndex: i.outputIndex,
        output: {
          address: utxo.output.address,
          amount:  serializeValue(utxo.output.value),
        },
      };
    }
    return { txHash: i.txHash, outputIndex: i.outputIndex };
  });

  return {
    hash:          tx.hash,
    block:         blk?.hash   ?? null,
    blockHeight:   blk?.height ?? null,
    blockTime:     blk?.time   ?? null,
    slot:          tx.slot,
    fees:          tx.body.fee.toString(),
    fee:           tx.body.fee.toString(), // alias for older callers
    deposit:       '0',
    size:          0,
    invalidAfter:  tx.body.ttl           ?? null,
    invalidBefore: tx.body.validityStart ?? null,
    validityStart: tx.body.validityStart ?? null,
    ttl:           tx.body.ttl           ?? null,
    inputs,
    outputs: tx.body.outputs.map((o, i) => ({
      index:      i,
      address:    o.address,
      amount:     serializeValue(o.value),
      dataHash:   o.dataHash   ?? null,
      plutusData: o.plutusData ?? null,
    })),
  };
}
