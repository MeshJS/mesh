import type { Config } from "jest";

import base from "./jest.config";

const jestConfig: Config = {
  ...base,
  testMatch: ["**/packages/**/*.integration.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
};

export default jestConfig;
