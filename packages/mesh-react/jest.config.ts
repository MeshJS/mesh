import type { Config } from "jest";

// TODO: import from @meshsdk/configs
const jestConfig: Config = {
  clearMocks: true,
  maxWorkers: 1,
  testEnvironment: "node",
  testMatch: ["**/packages/**/*.test.ts"],
  setupFiles: ["dotenv/config"],
  preset: "ts-jest",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.[jt]s?$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!@meshsdk/.*)"],
  passWithNoTests: true,
};

export default jestConfig;
