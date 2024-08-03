import { MeshValue } from "@meshsdk/common";

describe("MeshValue class", () => {
describe("get", () => {
  it("should return the quantity of an existing asset", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n, BTC: 10n };
    expect(value.get("ADA")).toEqual(BigInt(20));
    expect(value.get("BTC")).toEqual(BigInt(10));
  });

  it("should return 0 for a non-existing asset", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n };
    expect(value.get("BTC")).toEqual(BigInt(0));
  });

  it("should handle an empty value object", () => {
    const value = new MeshValue();
    expect(value.get("ADA")).toEqual(BigInt(0));
  });

  it("should return the correct quantity after adding assets", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n };
    value.addAsset({ unit: "BTC", quantity: "10" });
    expect(value.get("BTC")).toEqual(BigInt(10));
  });

  it("should return the correct quantity after subtracting assets", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n, BTC: 10n };
    value.negateAssets([{ unit: "BTC", quantity: "5" }]);
    expect(value.get("BTC")).toEqual(BigInt(5));
  });
});
describe("units", () => {
  it("should return an empty object when value is empty", () => {
    const value = new MeshValue();
    value.value = {};
    expect(value.units()).toEqual({});
  });

  it("should return the correct structure for a single asset", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n };
    expect(value.units()).toEqual({
      ADA: [{ unit: "ADA", quantity: BigInt(20) }],
    });
  });

  it("should return the correct structure for multiple assets", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n, BTC: 10n };
    expect(value.units()).toEqual({
      ADA: [{ unit: "ADA", quantity: BigInt(20) }],
      BTC: [{ unit: "BTC", quantity: BigInt(10) }],
    });
  });

  it("should handle both positive and negative quantities correctly", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n, BTC: -10n };
    expect(value.units()).toEqual({
      ADA: [{ unit: "ADA", quantity: BigInt(20) }],
      BTC: [{ unit: "BTC", quantity: BigInt(-10) }],
    });
  });
});
})