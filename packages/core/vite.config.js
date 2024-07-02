import { resolve } from 'path';
import { defineConfig } from 'vite';
import typescript from '@rollup/plugin-typescript';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      external: [
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
});
