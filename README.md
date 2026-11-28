<div align="center">

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://meshjs.dev/logo-mesh/white/logo-mesh-white-512x512.png" width="200">
    <source media="(prefers-color-scheme: light)" srcset="https://meshjs.dev/logo-mesh/black/logo-mesh-black-512x512.png" width="200">
    <img alt="Mesh SDK logo" src="https://meshjs.dev/logo-mesh/mesh.png" width="200">
  </picture>

  <h1 style="border-bottom: none"><a href="https://meshjs.dev/">Mesh</a>: the TypeScript SDK for Cardano</h1>

[![License](https://img.shields.io/github/license/meshjs/mesh)](https://github.com/MeshJS/mesh/blob/main/LICENSE.md)
[![Build](https://github.com/meshjs/mesh/actions/workflows/build.yml/badge.svg)](https://github.com/meshjs/mesh/actions/workflows/build.yml)
[![Publish](https://github.com/meshjs/mesh/actions/workflows/publish.yml/badge.svg)](https://github.com/meshjs/mesh/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/%40meshsdk%2Fcore)](https://www.npmjs.com/package/@meshsdk/core)
[![npm downloads](https://img.shields.io/npm/dm/%40meshsdk%2Fcore)](https://www.npmjs.com/package/@meshsdk/core)

[![Discord](https://img.shields.io/badge/Discord-join%20the%20community-5865F2?logo=discord&logoColor=white&style=for-the-badge)](https://discord.gg/dH48jH3BKa)
[![Twitter/X](https://img.shields.io/badge/Follow-@meshsdk-blue?logo=x&style=for-the-badge)](https://x.com/meshsdk)

<strong>Build Cardano dApps in TypeScript: transactions, wallets, smart contracts and blockchain data in one open-source SDK.</strong>

[Website & live demos](https://meshjs.dev/) · [API docs](https://docs.meshjs.dev/) · [Guides](https://meshjs.dev/guides) · [Examples](https://github.com/MeshJS/examples) · [Discord](https://discord.gg/dH48jH3BKa)

</div>

<hr />

Mesh is an open-source TypeScript and JavaScript SDK for building applications on the Cardano blockchain. It handles the hard parts of Cardano development, such as coin selection, fee calculation, CBOR serialization and script evaluation, so you can focus on your app.

With Mesh you can:

- **Build transactions** with `TxBuilder`: describe a transaction as a list of parts (outputs, mints, script spends, certificates, votes and proposals), and the builder selects inputs, adds change, evaluates scripts and sets the fee.
- **Sign and submit** with a browser wallet, a `MeshWallet`, a private key or your own signing service, or send several transactions in order as a plan, which a store keeps across restarts.
- **Connect wallets** in the browser through CIP-30 (such as Eternl) with `BrowserWallet`, or sign server-side from a mnemonic or private key with `MeshWallet`.
- **Use ready-made smart contracts** for escrow, marketplaces, vesting, swaps and more, each with on-chain code and off-chain TypeScript.
- **Query and submit** through Blockfrost, Koios, Maestro, Ogmios, Yaci and other blockchain providers.
- **Test offline** against a local ledger with `TxEmulator`: simulate and submit transactions, see why the ledger would refuse one, and move its clock.

Mesh runs in Node.js, the browser, Next.js and other modern frameworks.

## Quick start

Create a new Cardano dApp from a template with the Mesh CLI:

```bash
npx meshjs your-app-name
```

Or add Mesh to an existing project:

```bash
npm install @meshsdk/core
```

### Example: send ADA from a browser wallet

```ts
import {
  BlockfrostProvider,
  BrowserWallet,
  output,
  TxBuilder,
} from "@meshsdk/core";

const provider = new BlockfrostProvider("<BLOCKFROST_PROJECT_ID>");
const wallet = await BrowserWallet.enable("eternl");

const builder = new TxBuilder({ network: "preprod", provider });

// Picks the wallet's UTxOs, adds change and sets the fee
const built = await builder.build(
  output({ address: "addr_test1...", value: { lovelace: 5_000_000n } }),
  { payer: wallet },
);
await built.sign(); // the wallet signs
await built.submit(); // through the provider
console.log(built.txHash);
```

A transaction is a list of parts, such as `output(...)`, `mint.native(...)`, `spend.plutus(...)` or `certificate.stakeDelegation(...)`, each checked when it is made. `builder.plan(...)` builds several transactions at once and sends them in order, without building any of them again. The [Transaction Builder docs](https://meshjs.dev/apis/txbuilder) walk through payments, minting, scripts, staking and governance, and the [package README](https://github.com/MeshJS/mesh/blob/main/packages/mesh-transaction/README.md) covers every part, option and error.

### Code that uses `MeshTxBuilder`

`MeshTxBuilder` is deprecated and still works: it now builds on `TxBuilder` and keeps its chain of calls. Where it used to return a transaction the ledger refuses, such as one with an output below the minimum ADA, it now throws. [Migrating to TxBuilder](https://meshjs.dev/apis/txbuilder/migration) maps each old call to its part, and [The old MeshTxBuilder](https://github.com/MeshJS/mesh/blob/main/packages/mesh-transaction/README.md#the-old-meshtxbuilder) lists what changed.

## Packages

This monorepo publishes the core Mesh packages to npm under the `@meshsdk` scope. Most apps only need `@meshsdk/core`, which re-exports transactions, wallets, providers and common utilities.

| Package | Description | Docs |
| ------- | ----------- | ---- |
| [@meshsdk/core](https://github.com/MeshJS/mesh/tree/main/packages/mesh-core) | The main entry point. Re-exports transactions, wallets, providers and common utilities. | [Playground](https://meshjs.dev/) |
| [@meshsdk/transaction](https://github.com/MeshJS/mesh/tree/main/packages/mesh-transaction) | `TxBuilder` for building, signing and submitting transactions from parts, and plans of several transactions; the deprecated `MeshTxBuilder` | [Docs](https://meshjs.dev/apis/txbuilder) · [API](https://docs.meshjs.dev/transactions) |
| [@meshsdk/wallet](https://github.com/MeshJS/mesh/tree/main/packages/mesh-wallet) | The 1.9 wallets: `BrowserWallet` for CIP-30 browser wallets and `MeshWallet` for signing from a mnemonic or private key | [Docs](https://meshjs.dev/apis/wallets) |
| [@meshsdk/contract](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract) | Open-source smart contracts with off-chain transaction code | [Docs](https://docs.meshjs.dev/contracts) · [Playground](https://meshjs.dev/smart-contracts) |
| [@meshsdk/common](https://github.com/MeshJS/mesh/tree/main/packages/mesh-common) | Shared constants, types and interfaces used across the SDK | [Docs](https://docs.meshjs.dev/common) |
| [@meshsdk/core-cst](https://github.com/MeshJS/mesh/tree/main/packages/mesh-core-cst) | Serialization and utilities built on cardano-js-sdk and Harmonic Labs libraries, and the local script evaluator `OfflineEvaluatorScalus` | [Docs](https://docs.meshjs.dev/core-cst) |
| [@meshsdk/tx-emulator](https://github.com/MeshJS/mesh/tree/main/packages/mesh-tx-emulator) | A local ledger for tests that simulates and submits transactions, alone or in chains, and moves time; a provider for `TxBuilder` | [Docs](https://meshjs.dev/apis/txbuilder/testing) |
| [@meshsdk/scalus-emulator](https://github.com/MeshJS/mesh/tree/main/packages/mesh-scalus-emulator) | Local Cardano ledger emulator built on Scalus, for testing transactions offline | |
| [@meshsdk/x402](https://github.com/MeshJS/mesh/tree/main/packages/mesh-x402) | x402 payments with the Cardano `exact` scheme: client, resource server and facilitator | [Docs](https://meshjs.dev/apis/x402) |

### Packages in other repositories

These `@meshsdk` packages are developed in their own repositories:

| Package | Description | Repository |
| ------- | ----------- | ---------- |
| @meshsdk/wallet 2.0 (beta) | Browser (CIP-30) and headless wallets for managing keys, signing and submitting | [MeshJS/wallet](https://github.com/MeshJS/wallet) |
| @meshsdk/provider | Blockchain data providers (Blockfrost, Koios, Maestro, Ogmios and more) | [MeshJS/providers](https://github.com/MeshJS/providers) |
| @meshsdk/react | React components and hooks for Cardano wallet connection | [MeshJS/react](https://github.com/MeshJS/react) |
| @meshsdk/hydra | Hydra Head protocol client for layer-2 scaling | [MeshJS/hydra](https://github.com/MeshJS/hydra) |
| @meshsdk/midnight-setup | Development setup for Midnight Network dApps | [MeshJS/midnight-setup](https://github.com/MeshJS/midnight-setup) |
| @meshsdk/midnight-contracts-wizard | CLI wizard for new Midnight contract projects | [MeshJS/midnight-contracts-wizard](https://github.com/MeshJS/midnight-contracts-wizard) |

### Architecture

```mermaid
graph TD
  core["@meshsdk/core"]
  common["@meshsdk/common"]
  core_cst["@meshsdk/core-cst"]
  provider["@meshsdk/provider"]
  transaction["@meshsdk/transaction"]
  wallet["@meshsdk/wallet"]
  contract["@meshsdk/contract"]
  tx_emulator["@meshsdk/tx-emulator"]
  emulator["@meshsdk/scalus-emulator"]
  x402["@meshsdk/x402"]
  cardano_sdk["@cardano-sdk/*"]
  harmoniclabs["@harmoniclabs/*"]

  contract --> core
  core --> provider
  core --> transaction
  core --> wallet
  core --> core_cst
  wallet --> transaction
  x402 --> wallet
  x402 --> transaction
  transaction --> core_cst
  tx_emulator --> emulator
  emulator --> core_cst

  subgraph serializers
    core_cst --> cardano_sdk
    core_cst --> harmoniclabs
  end

  core_cst --> common

  click core_cst "https://docs.meshjs.dev/core-cst" _parent
  click provider "https://github.com/MeshJS/providers" _parent
  click transaction "https://meshjs.dev/apis/txbuilder" _parent
  click wallet "https://meshjs.dev/apis/wallets" _parent
  click contract "https://docs.meshjs.dev/contracts" _parent
  click tx_emulator "https://meshjs.dev/apis/txbuilder/testing" _parent
  click x402 "https://meshjs.dev/apis/x402" _parent
```

## Cardano smart contracts library

`@meshsdk/contract` includes open-source Cardano smart contracts, each with on-chain Aiken code, off-chain TypeScript, documentation and a live demo.

| Contract | What it does | Links |
| -------- | ------------ | ----- |
| Content Ownership | A registry where users create content that is recorded on-chain | [Demo](https://meshjs.dev/smart-contracts/content-ownership) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/content-ownership) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshContentOwnershipContract) |
| Escrow | Holds assets between two parties until both agree to complete the exchange | [Demo](https://meshjs.dev/smart-contracts/escrow) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/escrow) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshEscrowContract) |
| Giftcard | Locks assets behind a newly minted gift card token; redeeming burns the token and releases the assets | [Demo](https://meshjs.dev/smart-contracts/giftcard) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/giftcard) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshGiftcardContract) |
| Hello World | A simple lock-and-unlock contract to learn end-to-end validation and transaction building | [Demo](https://meshjs.dev/smart-contracts/hello-world) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/hello-world) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshHelloWorldContract) |
| Marketplace | An NFT marketplace where anyone can list, buy and sell native assets | [Demo](https://meshjs.dev/smart-contracts/marketplace) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/marketplace) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshMarketplaceContract) |
| NFT Minting Machine | Mints NFTs with an index that increments by one for each new token | [Demo](https://meshjs.dev/smart-contracts/plutus-nft) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/plutus-nft) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshPlutusNFTContract) |
| Payment Splitter | Splits incoming payments among a group of addresses | [Demo](https://meshjs.dev/smart-contracts/payment-splitter) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/payment-splitter) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshPaymentSplitterContract) |
| Swap | Exchanges assets between two parties | [Demo](https://meshjs.dev/smart-contracts/swap) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/swap) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshSwapContract) |
| Vesting | Locks tokens until a set time, after which the beneficiary can withdraw them | [Demo](https://meshjs.dev/smart-contracts/vesting) · [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/vesting) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshVestingContract) |
| Asteria _(work in progress)_ | A bot challenge where ships race across a 2D grid to showcase the eUTxO model | [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/asteria) |
| Royalties _(work in progress)_ | CIP-102 royalties for NFTs | [Source](https://github.com/MeshJS/mesh/tree/main/packages/mesh-contract/src/royalties) · [Docs](https://docs.meshjs.dev/contracts/classes/MeshRoyaltiesContract) |

## Developing Mesh

Mesh is a Turborepo monorepo using npm workspaces. You need Node.js 18 or later.

```bash
git clone https://github.com/MeshJS/mesh.git
cd mesh
npm install
npm run build
```

| Command | What it does |
| ------- | ------------ |
| `npm run build` | Build all packages |
| `npm run dev` | Build packages in watch mode |
| `npm test` | Run the test suites |
| `npm run lint` | Lint all packages |
| `npm run format` | Check formatting with Prettier (`format:fix` to apply) |

## Contributing

Contributions of all kinds are welcome: bug fixes, new features, documentation, tests, and help triaging issues and pull requests.

- Read the [contributing guide](https://github.com/MeshJS/mesh/blob/main/CONTRIBUTING.md) and [Code of Conduct](https://github.com/MeshJS/mesh/blob/main/CODE_OF_CONDUCT.md).
- See the [developer docs](https://github.com/MeshJS/mesh/tree/main/docs) for coding and pull request guidelines, and [docs/design](https://github.com/MeshJS/mesh/tree/main/docs/design) for the design of the transaction builder.
- Report bugs and request features in [GitHub issues](https://github.com/MeshJS/mesh/issues), or ask questions on [Discord](https://discord.gg/dH48jH3BKa).

Using an AI coding assistant? [MeshJS/skills](https://github.com/MeshJS/skills) gives Claude Code, Cursor, Codex and other tools deep knowledge of the Mesh SDK.

## License

Mesh is released under the [Apache 2.0 License](https://github.com/MeshJS/mesh/blob/main/LICENSE.md).

![Repobeats analytics](https://repobeats.axiom.co/api/embed/a55b792080ada8db32fb84c10addc7b4afab7679.svg "Repobeats analytics image")
