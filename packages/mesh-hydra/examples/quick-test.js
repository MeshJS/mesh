import { HydraProvider } from '../dist/index.js';
import { HydraInstance } from '../dist/index.js';
import { BlockfrostProvider, MeshTxBuilder, MeshWallet } from '@meshsdk/core';

// Quick test script for Hydra Provider
console.log('🚀 Quick Hydra Provider Test');

// Create provider
const SEED_PHRASE = [
  "vibrant", "north", "decade", "mean", "ensure", "turn", "universe", "cause", "neutral", "mad", "can", "next",
  "mutual", "tongue", "main", "bind", "lizard", "crumble", "order", "pole", "assault", "guilt", "physical", "cup"
];

const provider = new HydraProvider({
  httpUrl: "http://localhost:4001"
});
const blockfrostProvider = new BlockfrostProvider('preprodYAw21nxr9EdeZNSLDDLOJVg98DOrya75');
const hydraInstance = new HydraInstance({
  provider: provider,
  fetcher: blockfrostProvider,
  submitter: blockfrostProvider,
});
const wallet = new MeshWallet({
  networkId: 0,
  fetcher: blockfrostProvider,
  submitter: blockfrostProvider,
  key: {
    type: "mnemonic",
    words: SEED_PHRASE
  },
});



await provider.connect();
//await provider.contest();
await provider.fanout();

const txHash = "3a77722b142b8c6528ca6a8a2c7e615acd455ceb6540a723e5e1573ac3da3965";
const outputIndex = 2;

await provider.disconnect(5 * 60 * 1000);
console.log('✅ Disconnected! Status:', provider._status);



//quickTest();
