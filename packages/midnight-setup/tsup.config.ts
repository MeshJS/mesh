import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  cjsInterop: true,
  external: [
    "@midnight-ntwrk/compact-runtime",
    "@midnight-ntwrk/midnight-js-contracts",
    "@midnight-ntwrk/midnight-js-types",
    "@midnight-ntwrk/dapp-connector-api",
    "@midnight-ntwrk/midnight-js-fetch-zk-config-provider",
    "@midnight-ntwrk/midnight-js-http-client-proof-provider",
    "@midnight-ntwrk/midnight-js-indexer-public-data-provider",
    "@midnight-ntwrk/midnight-js-level-private-state-provider",
    "@midnight-ntwrk/midnight-js-network-id",
    "pino",
    "rxjs"
  ],
});
