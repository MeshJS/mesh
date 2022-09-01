import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript';
import eslint from 'vite-plugin-eslint';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
    },
    minify: 'esbuild',
    target: ['esnext'],
    rollupOptions: {
      external: [
        '@emurgo/cardano-message-signing-browser',
        '@emurgo/cardano-message-signing-nodejs',
        '@emurgo/cardano-serialization-lib-browser',
        '@emurgo/cardano-serialization-lib-nodejs',
      ],
      plugins: [
        typescript(),
      ]
    },
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
