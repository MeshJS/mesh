import { MeshTxBuilder, MeshWallet } from '@meshsdk/core';
import { DevnetProvider }            from '@meshsdk/devnet/provider';

// 3. Plug DevnetProvider in wherever you'd plug BlockfrostProvider.
const provider = new DevnetProvider('http://localhost:4000');

// 4. Pull protocol params + the pre-funded genesis wallets straight from the
//    devnet — no manual JSON files, no faucet sign-up.
const params  = await provider.fetchProtocolParameters();
const wallets = await provider.getWallets();

// 5. Build a MeshWallet from the genesis cli-key envelope (5820<seed>).
//    The genesis funds the *enterprise* address (no stake key), so we pass
//    'enterprise' explicitly when fetching UTxOs and the change address.
const wallet = new MeshWallet({
  networkId: 0,                      // 0 = testnet → addr_test1…
  fetcher:   provider,               // IFetcher
  submitter: provider,               // ISubmitter
  key: { type: 'cli', payment: wallets[1].privateKeyCli },
});
await wallet.init();

const utxos  = await wallet.getUtxos('enterprise');
const change = await wallet.getChangeAddress('enterprise');
console.log('utxos', utxos);

// 6. Build with MeshTxBuilder. Identical to mainnet — Mesh handles fee
//    estimation, input selection, witness assembly, and CBOR encoding.
const builder  = new MeshTxBuilder({ fetcher: provider, submitter: provider, params });
const unsigned = await builder
  .txOut(wallets[1].address, [{ unit: 'lovelace', quantity: '66000000' }])
  .changeAddress(change)
  .selectUtxosFrom(utxos)
  .complete();                       // CBOR-hex string

// 7. Sign & submit.
const signed = await wallet.signTx(unsigned);
const txHash = await provider.submitTx(signed);

// 8. Wait for inclusion (default slot length = 1 s).
await new Promise<void>((resolve, reject) => {
  provider.onTxConfirmed(txHash, () => resolve(), 30);
  setTimeout(() => reject(new Error('not confirmed')), 30_000);
});

console.log('done →', txHash);