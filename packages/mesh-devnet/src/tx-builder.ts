/**
 * Mesh integration helpers for the devnet.
 *
 * The custom DevnetTxBuilder that used to live here has been removed —
 * MeshSDK's `MeshTxBuilder` already does CBOR encoding, fee estimation,
 * input selection and witness assembly correctly. We just hand it a
 * `DevnetProvider` and a `MeshWallet` configured for our genesis keys.
 *
 *   import { DevnetProvider }     from './provider';
 *   import { meshFromGenesisSeed } from './tx-builder';
 *
 *   const provider = new DevnetProvider();
 *   const params   = await provider.fetchProtocolParameters();
 *
 *   const { wallet, builder } = await meshFromGenesisSeed(provider, params, seedHex);
 *
 *   // The devnet genesis funds the *enterprise* address (no stake key).
 *   // MeshWallet defaults to the base address when one is available, so
 *   // pass 'enterprise' explicitly when fetching UTxOs / change address.
 *   const utxos     = await wallet.getUtxos('enterprise');
 *   const change    = await wallet.getChangeAddress('enterprise');
 *
 *   const unsigned  = await builder
 *     .txOut(recipient, [{ unit: 'lovelace', quantity: '5000000' }])
 *     .changeAddress(change)
 *     .selectUtxosFrom(utxos)
 *     .complete();
 *   const signed    = await wallet.signTx(unsigned);
 *   const txHash    = await provider.submitTx(signed);
 */

import { MeshTxBuilder, MeshWallet } from '@meshsdk/core';
import type { Protocol }             from '@meshsdk/common';

import { NETWORK_ID } from './config.js';
import type { DevnetProvider } from './provider.js';

/**
 * Build a `MeshWallet` + a `MeshTxBuilder` from a 32-byte ed25519 seed
 * (such as a genesis wallet's `privateKeyHex`).
 *
 * The seed is wrapped as the CIP-5 `cardano-cli payment.skey` envelope
 * (`5820<seed>`) which is what `MeshWallet({ key: { type: 'cli' } })`
 * consumes natively.
 */
export async function meshFromGenesisSeed(
  provider: DevnetProvider,
  params:   Protocol,
  seedHex:  string,
): Promise<{ wallet: MeshWallet; builder: MeshTxBuilder }> {
  if (!/^[0-9a-fA-F]{64}$/.test(seedHex)) {
    throw new Error(`meshFromGenesisSeed: seedHex must be 32 bytes hex, got ${seedHex.length} chars`);
  }

  const wallet = new MeshWallet({
    networkId: NETWORK_ID === 1 ? 1 : 0,
    fetcher:   provider,
    submitter: provider,
    key: {
      type:    'cli',
      payment: '5820' + seedHex,
    },
  });
  await wallet.init();

  const builder = new MeshTxBuilder({
    fetcher:   provider,
    submitter: provider,
    params,
    verbose:   false,
  });

  return { wallet, builder };
}
