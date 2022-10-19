import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript';
import eslint from 'vite-plugin-eslint';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      external: [
        '@emurgo/cardano-message-signing-nodejs',
        '@emurgo/cardano-serialization-lib-nodejs',
        'axios', 'bip39', 'nanoid', 'zod',
      ],
      plugins: [
        typescript(),
      ]
    },
    target: ['esnext', 'node16'],
  },
  resolve: {
    alias: {
      '@mesh': resolve(__dirname, './src'),
    },
  },
  plugins: [
    eslint(), wasm(),
  ],
});
