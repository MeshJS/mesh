#!/usr/bin/env tsx

// Quick test script for Hydra Provider - TypeScript version
import { HydraProvider, HydraInstance } from '../dist/index.js';
import { BlockfrostProvider, conStr2, MeshTxBuilder, MeshWallet, stringToHex } from '@meshsdk/core';

console.log('🚀 Quick Hydra Provider Test (TypeScript)');

const SEED_PHRASE: string[] = [
  "vibrant", "north", "decade", "mean", "ensure", "turn", "universe", "cause", "neutral", "mad", "can", "next",
  "mutual", "tongue", "main", "bind", "lizard", "crumble", "order", "pole", "assault", "guilt", "physical", "cup"
];

const provider = new HydraProvider({
  httpUrl: "http://localhost:4002"
});

const blockchainProvider = new BlockfrostProvider('preprodYAw21nxr9EdeZNSLDDLOJVg98DOrya75');

const hydraInstance = new HydraInstance({
  provider: provider,
  fetcher: provider,
  submitter: provider,
});

const wallet = new MeshWallet({
  networkId: 0,
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
  key: {
    type: "mnemonic",
    words: SEED_PHRASE,
  },
});

await provider.connect();
const utxos = await wallet.getUtxos();
const changeAddress = await wallet.getChangeAddress();
const collateral = (await wallet.getCollateral())[0]!;

  const txBuilder = new MeshTxBuilder({
    submitter: blockchainProvider,
    fetcher: blockchainProvider,
    verbose: true,
  });


  const unsignedTx = await txBuilder
    .txIn("faa3c5d0774fd7af2c6478b152de9195c2ae4f66c6462b213889094b7e97aed1", 0)
    .txOut("addr_test1qr6784s76cawztg7t7en4f79wfrf474zdyhkr5k07sv7uzdg6ske4tqzye89y4g46ht4wh7gruqpcldl942r0ned3flsgl7q4t",[{
      unit: 'lovelace',
      quantity: "500000000"
    }])
    .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
    .selectUtxosFrom(utxos)
    .setNetwork("preprod")
    .changeAddress(changeAddress)
    .complete();

  const tx = await hydraInstance.decommit({
    type: "Tx ConwayEra",
    cborHex: unsignedTx,
    description: "decommit",
  });
  console.log('tx is ',tx)
  const hash = await wallet.submitTx(tx)
  console.log("tx", hash);


await provider.disconnect(5 * 60 * 1000);

