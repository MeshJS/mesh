# 💸 Aiken Payment Splitter

A simple payment splitter validator written in Aiken and its off-chain counterpart. The Aiken code is located in the onchain directory, while the off-chain code is in the offchain directory.

[Demo](https://meshjs.dev/smart-contracts/payment-splitter)

There are 2 actions (or endpoints) available to interact with this smart contract:

- Send Lovelace to Payment Splitter
- Trigger Payout

To initialize the payment splitter, we need to initialize a provider, MeshTxBuilder and MeshPaymentSplitterContract.

```typescript
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { MeshPaymentSplitterContract } from '@meshsdk/contracts';
import { useWallet } from '@meshsdk/react';

const { connected, wallet } = useWallet();

const blockchainProvider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: blockchainProvider,
  submitter: blockchainProvider,
});

const contract = new MeshPaymentSplitterContract(
  {
    mesh: meshTxBuilder,
    fetcher: blockchainProvider,
    wallet: wallet,
    networkId: 0,
  },
  [
    'addr_test1vpg334d6skwu6xxq0r4lqrnsjd5293n8s3d80em60kf6guc7afx8k',
    'addr_test1vp4l2kk0encl7t7972ngepgm0044fu8695prkgh5vjj5l6sxu0l3p',
    'addr_test1vqqnfs2vt42nq4htq460wd6gjxaj05jg9vzg76ur6ws4sngs55pwr',
    'addr_test1vqv2qhqddxmf87pzky2nkd9wm4y5599mhp62mu4atuss5dgdja5pw',
  ]);
```

## ⛓ On-chain

The validator checks two simple rules:

1. The list of (unique) payment credentials must match the provided list of "known payees." This list can be provided as a parameter to the validator.
2. The sum of the outputs (by payment credentials) must be equally split. (Excluding change outputs)

### 🔌 Prerequirements

- [Aiken](https://aiken-lang.org/installation-instructions#from-aikup-linux--macos-only)

### 🪄 Test and build

```bash
cd onchain
aiken test
aiken build
```

## 📄 Off-chain

### 🔌 Prerequirements

- Node >= 16
- Yarn

### 💳 Prepare a list of wallets

```bash
cd offchain
yarn install
node use-payment-splitter.js prepare 5
```

### 💎 Top up the wallets

Copy the address from the output of the previous command and send some test Ada on the preprod network to this address.
If you don't have test Ada at all, you can get some from the [Cardano Testnets Faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/).

### 🤳🏼 Send 10 tAda to the payment splitter

Anyone can lock funds in the payment splitter by sending an amount to the contract address.

```bash
node use-payment-splitter.js lock 10000000
```

Example transaction: https://preprod.cexplorer.io/tx/0008dd3ead94b0ca922ad45162762d73b5200efc5565a24532f1517fdf060dee

### 🤑 Trigger a payout

This command will generate a transaction that calculates the total available Lovelace value within the contract UTXOs and distributes the funds among the payees.

```bash
node use-payment-splitter.js unlock
```

Example transaction: https://preprod.cexplorer.io/tx/53be51e0f1268d41caae2944a760387fd762e76058aceddee73ca507d9e9a9c7