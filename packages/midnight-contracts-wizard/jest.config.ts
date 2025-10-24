import type { Config } from "jest";

const config: Config = {
  displayName: "midnight-contracts-wizard",
  preset: "../../jest.preset.js",
  transform: {
    "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
  },
  moduleFileExtensions: ["ts", "js", "html"],
  coverageDirectory: "../../coverage/packages/midnight-contracts-wizard",
};

export default config;
