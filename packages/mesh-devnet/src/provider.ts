/**
 * DevnetProvider — implements MeshSDK's IFetcher + ISubmitter + IListener
 * against a running mesh-devnet HTTP server.
 *
 * It is a drop-in replacement for `BlockfrostProvider` / `MaestroProvider`:
 * pass an instance to `MeshTxBuilder({ fetcher, submitter })`,
 * `new MeshWallet({ fetcher, submitter })`, etc.
 *
 *   import { MeshTxBuilder, MeshWallet } from '@meshsdk/core';
 *   import { DevnetProvider }            from '@meshsdk/devnet/provider';
 *
 *   const provider = new DevnetProvider('http://localhost:3000');
 *   const params   = await provider.fetchProtocolParameters();
 *
 *   const wallet = new MeshWallet({
 *     networkId: 0,
 *     fetcher:   provider,
 *     submitter: provider,
 *     key: { type: 'cli', payment: '5820' + privateKeyHex },
 *   });
 *   await wallet.init();
 *
 *   const builder = new MeshTxBuilder({ fetcher: provider, submitter: provider, params });
 *   const tx      = await builder
 *     .txOut(recipient, [{ unit: 'lovelace', quantity: '5000000' }])
 *     .changeAddress(await wallet.getChangeAddress())
 *     .selectUtxosFrom(await wallet.getUtxos())
 *     .complete();
 *   const signed  = await wallet.signTx(tx);
 *   const txHash  = await provider.submitTx(signed);
 *
 * No Blockfrost. No external service. The devnet IS the chain.
 */

import type {
  IFetcher,
  IFetcherOptions,
  IListener,
  ISubmitter,
  UTxO,
  Protocol,
  BlockInfo,
  TransactionInfo,
  AccountInfo,
  AssetMetadata,
  Asset,
  GovernanceProposalInfo,
} from '@meshsdk/common';

type RedeemerTagType = 'CERT' | 'MINT' | 'REWARD' | 'SPEND' | 'VOTE' | 'PROPOSE';
type Budget = { mem: number; steps: number };
type Action = { data: unknown; index: number; budget: Budget; tag: RedeemerTagType };

export class DevnetProvider implements IFetcher, ISubmitter, IListener {
  private readonly base: string;

  /**
   * @param baseUrl  URL of the running mesh-devnet process.
   *                 Default: http://localhost:4000
   */
  constructor(baseUrl = 'http://localhost:4000') {
    this.base = baseUrl.replace(/\/$/, '');
  }

  // ── ISubmitter ────────────────────────────────────────────────────────────

  /**
   * Submit a CBOR-hex encoded transaction to the devnet.
   * Returns the transaction hash on success.
   */
  async submitTx(txHex: string): Promise<string> {
    const res = await fetch(`${this.base}/tx/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/cbor' },
      body:    Buffer.from(txHex, 'hex'),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`DevnetProvider submitTx failed: ${(body as any).error ?? res.statusText}`);
    }
    const data = (await res.json()) as { txHash: string };
    return data.txHash;
  }

  // ── IFetcher ──────────────────────────────────────────────────────────────

  async fetchAddressUTxOs(address: string, asset?: string): Promise<UTxO[]> {
    const url = asset
      ? `${this.base}/utxos/${encodeURIComponent(address)}?asset=${asset}`
      : `${this.base}/utxos/${encodeURIComponent(address)}`;
    const data = await this.getJson<any[]>(url);
    return data.map(toMeshUTxO);
  }

  async fetchAddressTxs(
    address: string,
    _options?: IFetcherOptions,
  ): Promise<TransactionInfo[]> {
    const data = await this.getJson<any[]>(`${this.base}/address/${encodeURIComponent(address)}/txs`);
    return data.map(toMeshTxInfo);
  }

  async fetchProtocolParameters(_epoch?: number): Promise<Protocol> {
    const data = await this.getJson<any>(`${this.base}/params`);
    return toMeshProtocol(data);
  }

  async fetchBlockInfo(hash: string): Promise<BlockInfo> {
    const data = await this.getJson<any>(`${this.base}/block/${hash}`);
    return toMeshBlockInfo(data);
  }

  async fetchTxInfo(hash: string): Promise<TransactionInfo> {
    const data = await this.getJson<any>(`${this.base}/tx/${hash}`);
    return toMeshTxInfo(data);
  }

  /**
   * Resolve UTxOs by transaction hash (and optional output index).
   * MeshTxBuilder calls this to fill in inputs the caller only supplies as
   * `{ txHash, index }` so it can compute fees and witnesses.
   */
  async fetchUTxOs(hash: string, index?: number): Promise<UTxO[]> {
    const data = await this.getJson<any>(`${this.base}/tx/${hash}/utxos`);
    const utxos: UTxO[] = (data.outputs ?? []).map((o: any) => ({
      input: { txHash: hash, outputIndex: o.outputIndex },
      output: {
        address:    o.address,
        amount:     o.amount as Asset[],
        dataHash:   o.dataHash   ?? undefined,
        plutusData: o.plutusData ?? undefined,
        scriptRef:  o.scriptRef  ?? undefined,
      },
    }));
    return index === undefined ? utxos : utxos.filter(u => u.input.outputIndex === index);
  }

  async fetchAccountInfo(_address: string): Promise<AccountInfo> {
    // Stake delegation is not implemented on the devnet — return an empty,
    // but type-correct, account view.
    return { active: false, balance: '0', rewards: '0', withdrawals: '0' };
  }

  async fetchAssetAddresses(_asset: string): Promise<{ address: string; quantity: string }[]> {
    return [];
  }

  async fetchAssetMetadata(_asset: string): Promise<AssetMetadata> {
    return { name: '', image: '' } as AssetMetadata;
  }

  async fetchCollectionAssets(
    _policyId: string,
    _cursor?: number | string,
  ): Promise<{ assets: Asset[]; next: string | number | null }> {
    return { assets: [], next: null };
  }

  async fetchGovernanceProposal(
    _txHash: string,
    _certIndex: number,
  ): Promise<GovernanceProposalInfo> {
    throw new Error('Governance is not implemented on the devnet');
  }

  async fetchHandleAddress(_handle: string): Promise<string> {
    throw new Error('ADA Handle lookup not available on devnet');
  }

  /** Generic GET — the catch-all on IFetcher. */
  async get(url: string): Promise<any> {
    const target = url.startsWith('http') ? url : `${this.base}${url.startsWith('/') ? '' : '/'}${url}`;
    return this.getJson(target);
  }

  // ── IEvaluator ────────────────────────────────────────────────────────────

  /**
   * Evaluate a transaction and return estimated ExUnits for each script redeemer.
   * Proxies to the devnet's /evaluate endpoint, which runs the CEK machine with
   * an unbounded budget and returns actual costs.
   */
  async evaluateTx(
    tx:               string,
    additionalUtxos:  UTxO[]   = [],
    _additionalTxs:   string[] = [],
  ): Promise<Omit<Action, 'data'>[]> {
    const res = await fetch(`${this.base}/evaluate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ cbor: tx, additionalUTxOs: additionalUtxos }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`DevnetProvider evaluateTx: ${(body as any).error ?? res.statusText}`);
    }
    const data = (await res.json()) as Array<{
      tag:    string;
      index:  number;
      budget: { mem: number; steps: number };
    }>;
    return data.map(d => ({
      tag:    d.tag as any,
      index:  d.index,
      budget: { mem: d.budget.mem, steps: d.budget.steps },
    }));
  }

  // ── IListener ─────────────────────────────────────────────────────────────

  /**
   * Confirm a transaction — polls /tx/:hash until it appears in a block.
   * Matches MeshSDK's BlockfrostProvider semantics (interval = 5 s, but the
   * devnet ticks once per slot, default 1 s, so we poll faster).
   */
  onTxConfirmed(txHash: string, callback: () => void, limit = 100): void {
    let attempts = 0;
    const intervalMs = 1_000;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`${this.base}/tx/${txHash}`);
        if (res.ok) {
          const data = await res.json() as { block?: string | null };
          if (data.block) {
            clearInterval(poll);
            callback();
            return;
          }
        }
      } catch { /* network blip — keep polling */ }
      if (attempts >= limit) {
        clearInterval(poll);
        throw new Error(`Transaction ${txHash} not confirmed after ${limit} polls`);
      }
    }, intervalMs);
  }

  // ── DevNet-specific helpers ───────────────────────────────────────────────

  /**
   * List the pre-funded genesis wallets.
   * Each entry includes the Mesh-importable cli-key envelope (`5820…`).
   */
  async getWallets(): Promise<Array<{
    index:           number;
    address:         string;
    paymentKeyHash:  string;
    privateKey:      string;
    privateKeyCli:   string;
    publicKey:       string;
    lovelace:        string;
  }>> {
    return this.getJson(`${this.base}/wallets`);
  }

  /** Faucet: top up any address with lovelace (devnet only). */
  async topup(address: string, lovelace: bigint | number): Promise<string> {
    const res = await fetch(`${this.base}/topup/${encodeURIComponent(address)}/${lovelace}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Topup failed: ${(data as any).error}`);
    return (data as any).txHash as string;
  }

  /** Raw chain tip info. */
  async getTip(): Promise<{
    slot: number; blockHeight: number; blockHash: string | null;
    epoch: number; networkMagic: number; networkId: number;
  }> {
    return this.getJson(`${this.base}/tip`);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async getJson<T = unknown>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`DevnetProvider GET ${url}: ${(body as any).error ?? res.statusText}`);
    }
    return res.json() as Promise<T>;
  }
}

// ── Type converters (devnet wire format → MeshSDK shape) ─────────────────────

function toMeshUTxO(raw: any): UTxO {
  return {
    input: {
      txHash:      raw.input.txHash,
      outputIndex: raw.input.outputIndex,
    },
    output: {
      address:    raw.output.address,
      amount:     raw.output.amount as Asset[],
      dataHash:   raw.output.dataHash   ?? undefined,
      plutusData: raw.output.plutusData ?? undefined,
      scriptRef:  raw.output.scriptRef  ?? undefined,
      scriptHash: raw.output.scriptHash ?? undefined,
    },
  };
}

function toMeshProtocol(raw: any): Protocol {
  // Protocol fields that Mesh requires as `number` (not string):
  //   coinsPerUtxoSize, keyDeposit, poolDeposit, maxValSize, maxBlockSize,
  //   maxTxSize, maxBlockHeaderSize, decentralisation, collateralPercent,
  //   maxCollateralInputs, minFeeRefScriptCostPerByte, priceMem, priceStep.
  return {
    epoch:                      Number(raw.epoch                 ?? 0),
    coinsPerUtxoSize:           Number(raw.coinsPerUtxoSize      ?? 4310),
    priceMem:                   Number(raw.priceMem              ?? 0.0577),
    priceStep:                  Number(raw.priceStep             ?? 0.0000721),
    minFeeA:                    Number(raw.minFeeA               ?? 44),
    minFeeB:                    Number(raw.minFeeB               ?? 155381),
    keyDeposit:                 Number(raw.keyDeposit            ?? 2000000),
    maxTxSize:                  Number(raw.maxTxSize             ?? 16384),
    maxValSize:                 Number(raw.maxValSize            ?? 5000),
    poolDeposit:                Number(raw.poolDeposit           ?? 500000000),
    maxCollateralInputs:        Number(raw.maxCollateralInputs   ?? 3),
    decentralisation:           Number(raw.decentralisation      ?? 0),
    maxBlockSize:               Number(raw.maxBlockSize          ?? 65536),
    collateralPercent:          Number(raw.collateralPercent     ?? 150),
    maxBlockHeaderSize:         Number(raw.maxBlockHeaderSize    ?? 1100),
    minPoolCost:                String(raw.minPoolCost           ?? '340000000'),
    maxTxExMem:                 String(raw.maxTxExMem            ?? '14000000'),
    maxTxExSteps:               String(raw.maxTxExSteps          ?? '10000000000'),
    maxBlockExMem:              String(raw.maxBlockExMem         ?? '80000000'),
    maxBlockExSteps:            String(raw.maxBlockExSteps       ?? '40000000000'),
    minFeeRefScriptCostPerByte: Number(raw.minFeeRefScriptCostPerByte ?? 15),
  };
}

function toMeshBlockInfo(raw: any): BlockInfo {
  return {
    confirmations:          0,
    epoch:                  Number(raw.epoch     ?? 0),
    epochSlot:              String(raw.epochSlot ?? 0),
    fees:                   String(raw.feesCollected ?? '0'),
    hash:                   raw.hash,
    nextBlock:              raw.nextBlock      ?? '',
    operationalCertificate: '',
    output:                 String(raw.output  ?? '0'),
    previousBlock:          raw.previousHash   ?? '',
    size:                   Number(raw.size    ?? 0),
    slot:                   String(raw.slot),
    slotLeader:             raw.slotLeader     ?? 'devnet',
    time:                   Number(raw.time    ?? 0),
    txCount:                Number(raw.txCount ?? 0),
    VRFKey:                 '',
  };
}

function toMeshTxInfo(raw: any): TransactionInfo {
  // Mesh's TransactionInfo includes inputs/outputs as full UTxO[]; the devnet
  // /tx/:hash endpoint returns rich objects, so we convert them here.
  const inputs: UTxO[] = (raw.inputs ?? []).map((i: any) => ({
    input:  { txHash: i.txHash ?? i.input?.txHash, outputIndex: i.outputIndex ?? i.input?.outputIndex ?? i.index ?? 0 },
    output: i.output ?? { address: '', amount: [] as Asset[] },
  }));
  const outputs: UTxO[] = (raw.outputs ?? []).map((o: any, i: number) => ({
    input:  { txHash: raw.hash, outputIndex: o.index ?? i },
    output: {
      address:    o.address,
      amount:     o.amount as Asset[],
      dataHash:   o.dataHash   ?? undefined,
      plutusData: o.plutusData ?? undefined,
      scriptRef:  o.scriptRef  ?? undefined,
    },
  }));
  return {
    block:         raw.block        ?? '',
    blockHeight:   Number(raw.blockHeight ?? 0),
    blockTime:     Number(raw.blockTime   ?? 0),
    deposit:       String(raw.deposit ?? '0'),
    fees:          String(raw.fees    ?? raw.fee ?? '0'),
    hash:          raw.hash,
    index:         Number(raw.index   ?? 0),
    invalidAfter:  String(raw.ttl           ?? raw.invalidAfter  ?? ''),
    invalidBefore: String(raw.validityStart ?? raw.invalidBefore ?? ''),
    slot:          String(raw.slot),
    size:          Number(raw.size ?? 0),
    inputs,
    outputs,
  };
}
