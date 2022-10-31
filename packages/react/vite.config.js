import { resolve } from 'path';
import { defineConfig } from 'vite';
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
        '@martifylabs/mesh',
        'react', 'react-dom',
      ],
      output: {
        globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
        },
    },
      plugins: [
        typescript(),
      ]
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
