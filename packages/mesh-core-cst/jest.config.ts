import type { Config } from "jest";

const jestConfig: Config = {
  clearMocks: true,
  testPathIgnorePatterns: ["/offline-evaluator-scalus.test.ts$"],
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
