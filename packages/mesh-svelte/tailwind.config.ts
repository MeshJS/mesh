import type { Config } from "tailwindcss";

import sharedConfig from "@meshsdk/configs/tailwind/tailwind.config";

const config: Pick<Config, "prefix" | "presets" | "content"> = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  prefix: "mesh-",
  presets: [sharedConfig],
};

export default config;
