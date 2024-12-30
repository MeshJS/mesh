import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    noExternal: ['@fabianbormann/cardano-peer-connect'],
    skipNodeModulesBundle: true,
});
