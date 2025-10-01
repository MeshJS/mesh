# Copilot Instructions for Mesh SDK

## Project Overview

Mesh is an all-in-one TypeScript SDK for building UTXO-based blockchain applications, specifically targeting the Cardano ecosystem. The project follows a monorepo structure using Turborepo, with distinct packages providing specialized functionality.

## Architecture

The architecture is modular with clear dependency boundaries:

```
@meshsdk/core (exports all functionality)
├── @meshsdk/core-csl (integrates with cardano-serialization-lib)
├── @meshsdk/core-cst (integrates with cardano-js-sdk)
├── @meshsdk/provider (blockchain data providers)
├── @meshsdk/react (React component library)
├── @meshsdk/transaction (transaction building & submission)
└── @meshsdk/wallet (wallet management)
```

Other key packages include:
- `@meshsdk/common`: Shared types, interfaces, and utilities
- `@meshsdk/contract`: Smart contract implementations

## Development Workflow

### Setup and Build

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build all packages:
   ```bash
   npm run build
   ```

3. Development mode:
   ```bash
   npm run dev
   ```

### Package Management

- Individual packages are in `packages/`
- Applications (playground, docs) are in `apps/`
- Build scripts follow `build:mesh`, `build:docs`, `build:apps` pattern
- Package versions are bumped using `sh:version` script

## Project Conventions

### TypeScript

- **Type Inference**: Prefer letting TypeScript infer types rather than explicit annotations
- **Type Assertions**: Use `satisfies` operator over `:` annotation when enforcing type constraints
- **Empty Data Types**: Always provide type annotations when instantiating empty collections
- **Discriminated Unions**: Use `as const` to properly narrow union types

Example:
```typescript
// Good pattern using discriminated unions
const updatedTransactionMeta = {
  ...transactionMeta,
  status: TransactionStatus.rejected as const,
} satisfies TransactionMeta;
```

### Code Structure

- Provider classes implement standard interfaces like `IFetcher`, `IListener`, `ISubmitter`
- Smart contracts follow a consistent pattern with separate modules for validation and transaction building
- Wallet implementations offer consistent APIs across different wallet connectors

## Testing

- Tests are written using Jest
- Test files use `.test.ts` suffix
- Most packages include a `jest.config.ts` file with package-specific configuration

## Pull Request Workflow

- Create small, focused PRs addressing a single concern
- Include clear descriptions explaining the purpose and context of changes
- Add self-review comments on complex code areas to guide reviewers
- Don't rebase PRs once reviews have started to preserve conversation context

## Integration Points

- `@meshsdk/provider` offers implementations for various Cardano APIs (Blockfrost, Maestro, etc.)
- `@meshsdk/wallet` integrates with browser wallets like Nami, Eternl, Flint
- Smart contracts connect to both on-chain validators and off-chain transaction building

## Key Files

- `packages/mesh-core/src/index.ts`: Main export file for SDK
- `packages/mesh-provider/src/blockfrost.ts`: Example provider implementation
- `packages/mesh-transaction/src/transaction/tx-builder.ts`: Core transaction building logic
- `packages/mesh-contract/src/hello-world`: Simple contract example demonstrating full pattern

## Library Design Decisions

- Multiple serialization library support through adapter packages (`core-csl`, `core-cst`)
- Provider abstraction allowing swappable blockchain data sources
- TypeScript-first approach with comprehensive type safety
