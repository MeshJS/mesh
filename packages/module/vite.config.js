import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript';
import topLevelAwait from 'vite-plugin-top-level-await';
import eslint from 'vite-plugin-eslint';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
    },
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      external: [
        '@emurgo/cardano-serialization-lib-browser',
        '@emurgo/cardano-serialization-lib-nodejs',
      ],
      plugins: [
        typescript({
          target: 'esnext',
          declaration: true,
          rootDir: resolve(__dirname, './src'),
          declarationDir: resolve(__dirname, './dist'),
          exclude: resolve(__dirname, './node_modules/**'),
          allowSyntheticDefaultImports: true,
        })
      ]
    },
  },
  resolve: {
    alias: {
      '@mesh': resolve(__dirname, './src'),
    },
  },
  plugins: [
    eslint(), topLevelAwait(), wasm(),
  ],
});
