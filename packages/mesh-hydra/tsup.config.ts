import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  esbuildOptions(options) {
    options.define = {
      global: "globalThis",
      process: JSON.stringify({
        env: {
          NODE_ENV: "production",
        },
      }),
    };
    options.platform = "browser";
  },
});