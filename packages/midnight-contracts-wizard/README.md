# @meshsdk/midnight-contracts-wizard

A CLI tool to create new Midnight contracts projects with selected smart contracts.

## Installation

```bash
npm install -g @meshsdk/midnight-contracts-wizard
```

## Usage

```bash
npx @meshsdk/midnight-contracts-wizard
```

Or if installed globally:

```bash
midnight-contracts-wizard
```

## Features

- **Interactive CLI** - Select which contracts to include
- **Multiple Contract Types** - Tokenization, Staking, Identity, Oracle, Lending & Borrowing
- **Complete Setup** - Generates package.json, tsconfig, and build scripts
- **Ready to Use** - All necessary files for compilation and build
- **Self-Contained** - All contract templates included, no external dependencies

## Available Contracts

### Tokenization Contract

Complete project tokenization system with ZK privacy investment (7 ZK circuits)

### Staking Contract

Privacy-focused staking system with rewards and lock periods (8 ZK circuits)

### Identity Contracts

Complete identity management system with cryptographic libraries (1 ZK circuit)

### Oracle Contract

Decentralized oracle system with privacy-preserving data feeds (7 ZK circuits)

### Lending & Borrowing Contract

Privacy-preserving decentralized lending protocol (7 ZK circuits)

## Generated Project Structure

```
my-project/
├── src/
│   ├── [selected-contracts]/
│   │   └── *.compact
│   └── managed/          # Compiled contracts
├── dist/                 # Distribution
├── package.json
├── tsconfig.json
├── tsconfig.build.json
└── README.md
```

---

<div align="center">
  <p>Powered by <a href="https://meshjs.dev/">MeshJS Team</a></p>
  <p>Built with ❤️ on Midnight Network</p>
</div>
