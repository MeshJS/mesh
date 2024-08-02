![Mesh Logo](https://meshjs.dev/logo-mesh/mesh.png)

Mesh is an open-source library designed to make building dApps accessible. Whether you're a beginner developer, startup, web3 market leader, or a large enterprise, Mesh makes web3 development easy with reliable, scalable, and well-engineered APIs & developer tools.

Explore the features on [Mesh Playground](https://meshjs.dev/).

## What's inside?

This Turborepo includes the following packages/apps:

### Packages

- `@meshsdk/common`: Contains constants, types and interfaces used across the SDK and different serialization libraries
- `@meshsdk/contracts`: A collection of smart contracts and its transactions - [meshjs.dev/smart-contracts](https://meshjs.dev/smart-contracts)
- `@meshsdk/core`: Exports all the functionalities including wallets, transactions, and providers
- `@meshsdk/core-csl`: Types and utilities functions between Mesh and [cardano-serialization-lib](https://github.com/Emurgo/cardano-serialization-lib)
- `@meshsdk/core-cst`: Types and utilities functions between Mesh and [cardano-js-sdk](https://github.com/input-output-hk/cardano-js-sdk)
- `@meshsdk/provider`: Blockchain data providers - [meshjs.dev/providers](https://meshjs.dev/providers)
- `@meshsdk/react`: React component library - [meshjs.dev/react](https://meshjs.dev/react)
- `@meshsdk/transaction`: Transactions - [meshjs.dev/apis/transaction](https://meshjs.dev/apis/transaction)
- `@meshsdk/wallet`: Wallets - [meshjs.dev/apis/wallets](https://meshjs.dev/apis/wallets)

### Apps

- `apps/docs`: Mesh technical docs - [docs.meshjs.dev](https://docs.meshjs.dev/)
- `apps/playground`: Mesh homepage - [meshjs.dev](https://meshjs.dev/)

## Getting Started

### Usage

To use Mesh in your project, run the following command to install the core package:

```
npm install @meshsdk/core
```

### Install

To install all dependencies, run the following command:

```
npm install
```

### Build

To build all apps and packages, run the following command:

```
npm run build
```

### Develop

To develop all apps and packages, run the following command:

```
npm run dev
```
