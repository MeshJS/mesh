import * as publicApi from "../src";

describe("public entrypoint", () => {
  it.each([
    "spend",
    "referenceInput",
    "collateral",
    "collateralReturn",
    "output",
    "unresolved",
    "TxPartError",
    "assembleTxPrototype",
    "TxError",
    "TxBuildError",
    "TxIntentError",
    "TxBuilder",
  ])("exports %s", (name) => {
    expect(publicApi).toHaveProperty(name);
  });
});
