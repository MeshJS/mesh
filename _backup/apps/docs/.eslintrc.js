/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@meshsdk/configs/eslint/next.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
};
