#!/usr/bin/env node
/**
 * Mesh DevNet — CLI entry point.
 *
 * mesh-devnet start [options]
 *   -p, --port <n>            HTTP API port           (default 3000)
 *   --slot-length <ms>        Slot length in ms       (default 1000)
 *   --epoch-length <slots>    Slots per epoch         (default 100)
 *
 * mesh-devnet wallets       List pre-funded genesis wallets
 * mesh-devnet tip           Show chain tip
 * mesh-devnet utxos <addr>  Show UTxOs at address
 * mesh-devnet topup <addr> <ada>  Fund any address (faucet)
 * mesh-devnet selftest      Build & submit a real MeshTxBuilder tx
 *                           against a running devnet (smoke test)
 */

import { Command }               from 'commander';
import chalk                     from 'chalk';
import { PROTOCOL_PARAMS, NETWORK_MAGIC, NETWORK_ID, ProtocolParams } from './config.js';
import { LedgerState }           from './ledger/state.js';
import { TransactionValidator, setGenesisTime } from './ledger/validator.js';
import { Mempool }               from './mempool.js';
import { BlockProducer }         from './producer.js';
import { buildGenesisWallets, applyGenesis } from './genesis.js';
import { startServer }           from './api/server.js';
import { DevnetProvider }        from './provider.js';
import { meshFromGenesisSeed }   from './tx-builder.js';
import type { Block, GenesisWallet } from './types.js';

const program = new Command();

program
  .name('mesh-devnet')
  .description('Mesh Cardano devnet | network magic ' + NETWORK_MAGIC)
  .version('1.0.0');

// ── start ────────────────────────────────────────────────────────────────────

program
  .command('start', { isDefault: true })
  .description('Start the devnet node + HTTP API')
  .option('-p, --port <number>',         'HTTP API port',            '4000')
  .option('--slot-length <ms>',           'Slot length in ms',        '1000')
  .option('--epoch-length <slots>',       'Slots per epoch',          '100')
  .option('--min-fee-a <n>',              'minFeeA lovelace/byte',    '44')
  .option('--min-fee-b <n>',              'minFeeB constant',         '155381')
  .option('--coins-per-utxo-byte <n>',   'coinsPerUTxOByte',         '4310')
  .action((opts) => {
    const params: ProtocolParams = {
      ...PROTOCOL_PARAMS,
      slotLengthMs:      Number(opts.slotLength),
      epochLength:       Number(opts.epochLength),
      minFeeA:           Number(opts.minFeeA),
      minFeeB:           Number(opts.minFeeB),
      coinsPerUTxOByte:  Number(opts.coinsPerUtxoByte),
    };

    const port     = Number(opts.port);
    const state    = new LedgerState();
    const mempool  = new Mempool();

    // One clock origin for slot numbering and Plutus POSIXTimeRange — must match Mesh TTL.
    const chainStartMs = Date.now();
    setGenesisTime(chainStartMs);

    const validator = new TransactionValidator(state, params);

    const wallets = buildGenesisWallets();
    applyGenesis(state, wallets);

    const producer = new BlockProducer(state, mempool, params, (block: Block) => {
      console.log(
        chalk.cyan(`  ▶ block ${String(block.height).padStart(5)}`) +
        `  slot=${String(block.slot).padStart(6)}` +
        `  txs=${block.txCount}` +
        `  fees=${block.feesCollected.toString().padStart(8)}` +
        `  ${block.hash.slice(0, 16)}…`,
      );
    });

    producer.start(chainStartMs);
    startServer({ state, mempool, validator, params, wallets, port });
    printBanner(params, wallets, port);

    process.on('SIGINT', () => {
      producer.stop();
      console.log(chalk.yellow('\nDevnet stopped.'));
      process.exit(0);
    });
  });

// ── wallets ──────────────────────────────────────────────────────────────────

program
  .command('wallets')
  .description('List genesis pre-funded wallets from a running devnet')
  .option('-p, --port <number>', 'Devnet port', '3000')
  .action(async (opts) => {
    const res  = await fetch(`http://localhost:${opts.port}/wallets`);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    for (const w of list) {
      console.log(chalk.green(`\nWallet #${w['index']}`));
      console.log(`  address       : ${w['address']}`);
      console.log(`  lovelace      : ${w['lovelace']}`);
      console.log(`  ada           : ${Number(w['lovelace']) / 1_000_000}`);
      console.log(`  privateKey    : ${w['privateKey']}`);
      console.log(`  privateKeyCli : ${w['privateKeyCli']}  ${chalk.dim('# pass to MeshWallet({ key: { type: "cli", payment: <here> } })')}`);
      console.log(`  publicKey     : ${w['publicKey']}`);
    }
  });

// ── tip ──────────────────────────────────────────────────────────────────────

program
  .command('tip')
  .description('Show the chain tip of a running devnet')
  .option('-p, --port <number>', 'Devnet port', '3000')
  .action(async (opts) => {
    const data = await (await fetch(`http://localhost:${opts.port}/tip`)).json();
    console.log(JSON.stringify(data, null, 2));
  });

// ── utxos ─────────────────────────────────────────────────────────────────────

program
  .command('utxos <address>')
  .description('Show UTxOs at an address')
  .option('-p, --port <number>', 'Devnet port', '3000')
  .action(async (address: string, opts) => {
    const data = await (await fetch(`http://localhost:${opts.port}/utxos/${address}`)).json();
    console.log(JSON.stringify(data, null, 2));
  });

// ── topup ─────────────────────────────────────────────────────────────────────

program
  .command('topup <address> <ada>')
  .description('Faucet: send ADA to any address (devnet only)')
  .option('-p, --port <number>', 'Devnet port', '3000')
  .action(async (address: string, ada: string, opts) => {
    const lovelace = Math.floor(Number(ada) * 1_000_000);
    const res  = await fetch(`http://localhost:${opts.port}/topup/${address}/${lovelace}`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (res.ok) console.log(chalk.green(`Topped up ${ada} ADA → ${address}`), '\ntxHash:', (data as any).txHash);
    else console.error(chalk.red('Error:'), (data as any).error);
  });

// ── selftest ──────────────────────────────────────────────────────────────────
// Builds a real Cardano CBOR transaction with @meshsdk/core's MeshTxBuilder,
// signs it with a genesis wallet via MeshWallet, and submits through the
// DevnetProvider — exercising the full IFetcher + ISubmitter integration path.

program
  .command('selftest')
  .description('Build, sign and submit a real tx through MeshTxBuilder + DevnetProvider')
  .option('-p, --port <number>', 'Devnet port',                   '3000')
  .option('--from <index>',      'Genesis wallet index (sender)', '0')
  .option('--to <index>',        'Genesis wallet index (receiver)','1')
  .option('--ada <n>',           'Amount in ADA',                 '5')
  .action(async (opts) => {
    const provider = new DevnetProvider(`http://localhost:${opts.port}`);
    const params   = await provider.fetchProtocolParameters();
    const wallets  = await provider.getWallets();

    const sender   = wallets[Number(opts.from)];
    const receiver = wallets[Number(opts.to)];
    if (!sender)   throw new Error(`No genesis wallet at index ${opts.from}`);
    if (!receiver) throw new Error(`No genesis wallet at index ${opts.to}`);

    const lovelace = (BigInt(Math.floor(Number(opts.ada) * 1_000_000))).toString();

    const { wallet, builder } = await meshFromGenesisSeed(
      provider, params, sender.privateKey,
    );

    // The genesis funds the enterprise address (payment-only, no stake key).
    // MeshWallet defaults to the base address when one is available, so we
    // explicitly request 'enterprise' for both inputs and change.
    const utxos      = await wallet.getUtxos('enterprise');
    const change     = await wallet.getChangeAddress('enterprise');

    const unsigned   = await builder
      .txOut(receiver.address, [{ unit: 'lovelace', quantity: lovelace }])
      .changeAddress(change)
      .selectUtxosFrom(utxos)
      .complete();

    const signed     = await wallet.signTx(unsigned);
    const txHash     = await provider.submitTx(signed);

    console.log(chalk.green('\nselftest OK'));
    console.log(`  from   : ${sender.address}`);
    console.log(`  to     : ${receiver.address}`);
    console.log(`  amount : ${opts.ada} ADA`);
    console.log(`  txHash : ${txHash}`);

    // Wait for the block to land then re-check balances
    await new Promise<void>((resolve, reject) => {
      provider.onTxConfirmed(txHash, () => resolve(), 30);
      setTimeout(() => reject(new Error('selftest: tx not confirmed within 30s')), 30_000);
    });

    const recvUTxOs = await provider.fetchAddressUTxOs(receiver.address);
    const total     = recvUTxOs.reduce((s, u) => s + BigInt(u.output.amount.find(a => a.unit === 'lovelace')?.quantity ?? '0'), 0n);
    console.log(`  receiver balance after: ${total} lovelace (${Number(total) / 1_000_000} ADA)`);
  });

program.parse();

// ── Banner ────────────────────────────────────────────────────────────────────

function printBanner(params: ProtocolParams, wallets: GenesisWallet[], port: number): void {
  const line = '─'.repeat(50);
  console.log(chalk.bold.green(`\n${line}`));
  console.log(chalk.bold.green('  Mesh DevNet'));
  console.log(chalk.bold.green(line));

  console.log(chalk.bold('\nNetwork'));
  console.log(`  Network Magic : ${chalk.yellow(String(NETWORK_MAGIC))}`);
  console.log(`  Network ID    : ${NETWORK_ID}  (${NETWORK_ID === 0 ? 'addr_test1…' : 'addr1…'} addresses)`);
  console.log(`  Era           : ${params.protocolMajorVersion}.${params.protocolMinorVersion} (Conway)`);

  console.log(chalk.bold('\nProtocol Parameters'));
  console.log(`  Slot length   : ${params.slotLengthMs} ms`);
  console.log(`  Epoch length  : ${params.epochLength} slots`);
  console.log(`  minFeeA       : ${params.minFeeA}`);
  console.log(`  minFeeB       : ${params.minFeeB}`);
  console.log(`  coinsPerUTxO  : ${params.coinsPerUTxOByte}`);

  console.log(chalk.bold('\nPre-funded Wallets  ') + chalk.dim('(test keys — never use on mainnet)'));
  for (const w of wallets) {
    console.log(chalk.yellow(`  [${w.index}] ${w.addressBech32}`));
    console.log(`       ${Number(w.initialLovelace) / 1_000_000} ADA   cli-key: ${w.privateKeyCliHex.slice(0, 20)}…`);
  }

  console.log(chalk.bold('\nProvider Setup'));
  console.log(`  API URL       : ${chalk.underline(`http://localhost:${port}`)}`);
  console.log(chalk.dim(`
  // In your app:
  import { MeshTxBuilder, MeshWallet } from '@meshsdk/core';
  import { DevnetProvider }            from '@meshsdk/devnet/provider';

  const provider = new DevnetProvider('http://localhost:${port}');
  const params   = await provider.fetchProtocolParameters();

  const wallet = new MeshWallet({
    networkId: ${NETWORK_ID},
    fetcher:   provider,
    submitter: provider,
    key: { type: 'cli', payment: '<paste privateKeyCli>' },
  });
  await wallet.init();

  const builder = new MeshTxBuilder({ fetcher: provider, submitter: provider, params });
`));

  console.log(chalk.bold('Smoke test: ') + chalk.dim('mesh-devnet selftest --from 0 --to 1 --ada 5'));
  console.log(chalk.bold('Ready — waiting for transactions…\n'));
}
