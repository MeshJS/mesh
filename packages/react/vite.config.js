import { resolve } from 'path';
import { defineConfig } from 'vite';
import babel from '@rollup/plugin-babel';
import typescript from '@rollup/plugin-typescript';
import react from '@vitejs/plugin-react';

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      external: [
        '@meshsdk/core',
        'react', 'react-dom',
      ],
      output: {
        globals: {
          react: 'React',
        },
      },
      plugins: [
        babel({
          babelHelpers: 'bundled',
          extensions: ['.ts', '.tsx'],
        }),
        typescript({
          outputToFilesystem: false,
        }),
      ],
    },
    target: ['esnext'],
  },
  resolve: {
    alias: {
      '@mesh': resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
  ],
});
