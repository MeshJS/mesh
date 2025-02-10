import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  esbuild: {
    target: "es2022",
  },
  build: {
    target: "es2022",
  },
  optimizeDeps: {
    esbuildOptions: {
      target: "es2022",
    },
  },
  plugins: [
    sveltekit(),
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      globals: { Buffer: true, global: true },
      protocolImports: true,
    }),
  ],
});
