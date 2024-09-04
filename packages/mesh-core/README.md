<div align="center">

  <a href="https://meshjs.dev">
    <img src="https://meshjs.dev/logo-mesh/mesh.png" width="200" alt=""/>
  </a>

  <h1 style="border-bottom: none"><a href='https://meshjs.dev/'>Mesh</a> TypeScript SDK</h1>

  [![Licence](https://img.shields.io/github/license/meshjs/mesh)](https://github.com/meshjs/mesh/blob/master/LICENSE)
  [![Build](https://github.com/meshjs/mesh/actions/workflows/build.yml/badge.svg)](https://github.com/meshjs/mesh/actions/workflows/build.yml)
  [![Package](https://github.com/meshjs/mesh/actions/workflows/publish.yml/badge.svg)](https://github.com/meshjs/mesh/actions/workflows/publish.yml)

  [![Twitter/X](https://img.shields.io/badge/Follow%20us-@MeshJS-blue?logo=x&style=for-the-badge)](https://x.com/meshsdk)
  [![NPM](https://img.shields.io/npm/v/%40meshsdk%2Fcore?style=for-the-badge)](https://www.npmjs.com/package/@meshsdk/core)

  <strong>All-in-one web3 SDK for Cardano apps</strong>

</div>

<hr />

Mesh is an open-source library designed to make building dApps accessible. Whether you're a beginner developer, startup, web3 market leader, or a large enterprise, Mesh makes web3 development easy with reliable, scalable, and well-engineered APIs & developer tools.

Explore the features on [Mesh Playground](https://meshjs.dev/).

## What's inside?

This repo includes the following packages/apps:

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

![Alt](https://repobeats.axiom.co/api/embed/a55b792080ada8db32fb84c10addc7b4afab7679.svg "Repobeats analytics image")
