import base from "./jest.config";

export default {
  ...base,
  testPathIgnorePatterns: [],
  testMatch: ["**/offline-evaluator-scalus.test.ts"],
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  transform: { "^.+\\.[jt]s?$": ["ts-jest", { useESM: true }] },
};
