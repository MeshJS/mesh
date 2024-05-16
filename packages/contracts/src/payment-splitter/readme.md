# 💸 Aiken Payment Splitter

A simple payment splitter validator written in Aiken and its off-chain counterpart. The Aiken code is located in the onchain directory, while the off-chain code is in the offchain directory.

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