import type { Config } from "jest";

const jestConfig: Config = {
  clearMocks: true,
  maxWorkers: 1,
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/packages/**/*.test.ts"],
  moduleNameMapper: {},
  setupFiles: ["dotenv/config"],
};

export default jestConfig;
