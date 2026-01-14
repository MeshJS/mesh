# Migrate MaestroMultiChainProvider from mesh-provider to bitcoin package

## Requirements
- Move `MaestroMultiChainProvider` from `packages/mesh-provider/src/multi-chain/` to `packages/bitcoin/src/multi-chain/`
- Add dependencies to bitcoin package: `@meshsdk/provider`, `@meshsdk/common`, `axios`
- Update imports in migrated file: use package imports for Cardano (`@meshsdk/provider`), local imports for Bitcoin (`../providers`, `../types`)
- Export `MaestroMultiChainProvider` and `MaestroConfig` from main `@meshsdk/bitcoin` entry point
- Delete `packages/mesh-provider/src/multi-chain/` directory
- Remove multi-chain export from `packages/mesh-provider/src/index.ts`
- Update all codebase imports of `MaestroMultiChainProvider` from `@meshsdk/provider` to `@meshsdk/bitcoin`

## Verification
```bash
cd /Users/jingles/Documents/GitHub/mesh && npm install && npm run build
```

## Success Criteria
- `npm run build` passes from monorepo root (no import errors in mesh-react)
- `MaestroMultiChainProvider` exports from `@meshsdk/bitcoin`
- No `@meshsdk/bitcoin` dependency in `packages/mesh-provider/package.json`
- No `multi-chain` directory in `packages/mesh-provider/src/`
- No imports of `MaestroMultiChainProvider` from `@meshsdk/provider` remain in codebase

## Ralph Command
```
/ralph-loop "Read /Users/jingles/Documents/GitHub/mesh/.claude/plans/refactor-bitcoin.md and implement requirements" --max-iterations 25 --completion-promise "npm run build passes from monorepo root"
```
