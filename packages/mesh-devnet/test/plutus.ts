/**
 * Plutus mint (V3) against local mesh-devnet — Mesh + DevnetProvider.
 *
 * Common error: **Not enough … UTxOs** when building:
 *   1. Devnet not running (`npm run dev`) → no UTXOs fetched.
 *   2. **Min-ADA**: an output carrying lovelace *and* a minted asset needs
 *      more ADA than bare lovelace-only (coinsPerUTxOByte × serialized size).
 *      1_400_000 lovelace is often too low once the NFT is attached — bump
 *      the output (e.g. 5–10 ADA) until the tx passes.
 */

import {
  MeshTxBuilder,
  MeshWallet,
  byteString,
  conStr0,
  resolveScriptHash,
  stringToHex,
} from '@meshsdk/core';
import type { UTxO as MeshUtxo } from '@meshsdk/common';

import { DevnetProvider } from '@meshsdk/devnet/provider';

const DEVNET_URL = process.env.DEVNET_URL ?? 'http://localhost:4000';
const provider = new DevnetProvider(DEVNET_URL);

async function assertDevnetHealthy(): Promise<void> {
  const r = await fetch(`${DEVNET_URL}/health`);
  if (!r.ok) {
    throw new Error(
      `Devnet not reachable at ${DEVNET_URL} (${r.status}). Run: npm run dev`,
    );
  }
}

await assertDevnetHealthy();

const protocolParams = await provider.fetchProtocolParameters();
const wallets = await provider.getWallets();

/** CBOR hex of deployed Plutus V3 mint script (blueprint bytecode). */
const scriptCbor =
  '59015201010029800aba2aba1aab9faab9eaab9dab9a488888966002664464653001300637540032259800980298041baa002899192cc004c03800a0071640306eb8c030004c024dd50014590074c024012601200491112cc004cdc3a4004009132332233006004159800980518069baa0018acc004cdc79bae3010300e375400891011248656c6c6f5370656e6452656465656d657200899199119801001000912cc00400629422b30013371e6eb8c04c00400e2946266004004602800280790121bac301130123012301230123012301230123012300f375400c6eb8c040c038dd5180818071baa0018a504031164030601c002601c601e00260166ea80162b3001300700489919802001099b8f375c601c60186ea800922011148656c6c6f4d696e7452656465656d657200375c601a60166ea80162c80490090c020c024004c020008c00cdd50039b874800229344d95900101';

const policyId = resolveScriptHash(scriptCbor, 'V3');

const wallet = new MeshWallet({
  networkId:   0,
  fetcher:     provider,
  submitter:   provider,
  key: { type: 'cli', payment: wallets[1].privateKeyCli },
});

await wallet.init();

// Token name hex (must match on-chain naming)
const tokenNameHex = stringToHex('HelloMinter');
const redeemer = conStr0([byteString(stringToHex('HelloMintRedeemer'))]);
const mintUnit = `${policyId}${tokenNameHex}`;

const tx = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
  params: protocolParams,
});

const utxos = await wallet.getUtxos('enterprise');
console.log('utxos',utxos)
const change = await wallet.getChangeAddress('enterprise');

const adaLovelace = (u: MeshUtxo): bigint =>
  BigInt(u.output.amount.find(a => a.unit === 'lovelace')?.quantity ?? '0');

let totalAda = 0n;
for (const u of utxos) totalAda += adaLovelace(u);

console.log('Wallet UTXO count:', utxos.length);
console.log('Total lovelace (enterprise):', totalAda.toString());
if (utxos.length === 0) {
  throw new Error(
    'No UTxOs — start the devnet (npm run dev) or top up:\n  ' +
    `curl -X POST ${DEVNET_URL}/topup/${encodeURIComponent(wallets[1].address)}/10000000000`,
  );
}

/** Lovelace for output carrying ADA + minted asset (must satisfy min‑UTxO w/ bundled Value). */
const OUTPUT_LOVELACE = '12000000'; // 12 ADA — generous for Conway min‑ADA + NFT
const collateral = (await wallet.getCollateral('enterprise'))[0];
if (!collateral) {
  throw new Error('No collateral found');
}
const unsignedTx = await tx
  .mintPlutusScriptV3()
  .mint('100', policyId, tokenNameHex)
  .mintingScript(scriptCbor)
  .mintRedeemerValue(redeemer, 'JSON')
  .txOut(wallets[1].address, [
    { unit: 'lovelace', quantity: OUTPUT_LOVELACE },
    { unit: mintUnit, quantity: '100' },
  ])
  /* Mesh coin selection expects change address before consuming UTxOs (see src/test.ts). */
  .changeAddress(change)
  .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
  .selectUtxosFrom(utxos)
  .complete();

const signedTx = await wallet.signTx(unsignedTx);
const txHash = await provider.submitTx(signedTx);

console.log('txHash', txHash);
