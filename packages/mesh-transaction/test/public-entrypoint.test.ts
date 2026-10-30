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
    "TxBuildError",
  ])("exports %s", (name) => {
    expect(publicApi).toHaveProperty(name);
  });
});
