import { Asset, MeshValue } from "@meshsdk/common";

describe("MeshValue class", () => {
describe("addAsset", () => {
  it("should add a new asset correctly", () => {
    const value = new MeshValue();
    const singleAsset: Asset = { unit: "USDM", quantity: "100" };
    value.addAsset(singleAsset);
    // Assertions to verify the behavior of addAsset...
    expect(value.value).toEqual({ USDM: BigInt(100) });
  });
  it("should add to an existing asset correctly", () => {
    const value = new MeshValue();
    const singleAsset: Asset = { unit: "USDM", quantity: "100" };
    value.addAsset(singleAsset);
    value.addAsset(singleAsset);
    // Assertions to verify the behavior of addAsset...
    expect(value.value).toEqual({ USDM: BigInt(200) });
  });
  it("should add multiple assets correctly", () => {
    const value = new MeshValue();
    const assets: Asset[] = [
      { unit: "USDM", quantity: "100" },
      { unit: "ADA", quantity: "10" },
    ];
    value.addAsset(assets[0]!).addAsset(assets[1]!);
    // Assertions to verify the behavior of addAsset...
    expect(value.value).toEqual({ USDM: BigInt(100), ADA: BigInt(10) });
  });
});
describe("addAssets", () => {
  it("should add multiple assets correctly", () => {
    const value = new MeshValue();
    const assets: Asset[] = [
      { unit: "USDM", quantity: "100" },
      { unit: "ADA", quantity: "10" },
      { unit: "USDM", quantity: "100" },
      { unit: "ADA", quantity: "10" },
    ];
    value.addAssets(assets);
    // Assertions to verify the behavior of addAssets...
    expect(value.value).toEqual({ USDM: BigInt(200), ADA: BigInt(20) });
  });
  it("should add multiple assets correctly with different units", () => {
    const value = new MeshValue();
    const assets: Asset[] = [
      { unit: "USDM", quantity: "100" },
      { unit: "ADA", quantity: "10" },
      { unit: "USDC", quantity: "100" },
      { unit: "ADA", quantity: "10" },
    ];
    value.addAssets(assets);
    // Assertions to verify the behavior of addAssets...
    expect(value.value).toEqual({
      USDM: BigInt(100),
      ADA: BigInt(20),
      USDC: BigInt(100),
    });
  });
});
describe("negateAsset", () => {
  describe("negateAsset", () => {
    it("should subtract quantity from an existing asset", () => {
      const value = new MeshValue();
      value.value = { ADA: 10n };
      value.negateAsset({ unit: "ADA", quantity: "5" });
      expect(value.value).toEqual({ ADA: BigInt(5) });
    });

    it("should remove the asset if the resulting quantity is zero", () => {
      const value = new MeshValue();
      value.value = { ADA: 10n };
      value.negateAsset({ unit: "ADA", quantity: "10" });
      expect(value.value.ADA).toBeUndefined();
    });

    it("should allow negative quantity if the subtraction results in negative value", () => {
      const value = new MeshValue();
      value.value = { ADA: 10n };
      value.negateAsset({ unit: "ADA", quantity: "15" });
      expect(value.value).toEqual({ ADA: BigInt(-5) });
    });

    it("should add a new asset with negative quantity if the asset does not exist", () => {
      const value = new MeshValue();
      value.negateAsset({ unit: "ADA", quantity: "5" });
      expect(value.value).toEqual({ ADA: BigInt(-5) });
    });
  });
});
describe("negateAssets", () => {
  it("should subtract quantities from existing assets", () => {
    const value = new MeshValue();
    value.value = { ADA: 20n, BTC: 10n };
    value.negateAssets([
      { unit: "ADA", quantity: "5" },
      { unit: "BTC", quantity: "3" },
    ]);
    expect(value.value).toEqual({ ADA: BigInt(15), BTC: BigInt(7) });
  });

  it("should remove the asset if the resulting quantity is zero", () => {
    const value = new MeshValue();
    value.value = { ADA: 10n, BTC: 5n };
    value.negateAssets([
      { unit: "ADA", quantity: "10" },
      { unit: "BTC", quantity: "5" },
    ]);
    expect(value.value.ADA).toBeUndefined();
    expect(value.value.BTC).toBeUndefined();
  });

  it("should allow negative quantity if the subtraction results in negative value", () => {
    const value = new MeshValue();
    value.value = { ADA: 10n, BTC: 5n };
    value.negateAssets([
      { unit: "ADA", quantity: "15" },
      { unit: "BTC", quantity: "10" },
    ]);
    expect(value.value).toEqual({ ADA: BigInt(-5), BTC: BigInt(-5) });
  });

  it("should add new assets with negative quantities if the assets do not exist", () => {
    const value = new MeshValue();
    value.negateAssets([
      { unit: "ADA", quantity: "5" },
      { unit: "BTC", quantity: "3" },
    ]);
    expect(value.value).toEqual({ ADA: BigInt(-5), BTC: BigInt(-3) });
  });

  it("should handle a mix of existing and non-existing assets", () => {
    const value = new MeshValue();
    value.value = { ADA: 10n };
    value.negateAssets([
      { unit: "ADA", quantity: "5" },
      { unit: "BTC", quantity: "3" },
    ]);
    expect(value.value).toEqual({ ADA: BigInt(5), BTC: BigInt(-3) });
  });
});

describe("merge", () => {
  it("should merge two values correctly", () => {
    const value1 = new MeshValue();
    value1.value = { ADA: 20n, BTC: 10n };
    const value2 = new MeshValue();
    value2.value = { ADA: 10n, BTC: 5n };
    expect(value1.merge(value2).value).toEqual({ ADA: 30n, BTC: 15n });
  });

  it("should merge two values correctly with different units", () => {
    const value1 = new MeshValue();
    value1.value = { ADA: 20n, BTC: 10n };
    const value2 = new MeshValue();
    value2.value = { ETH: 10n, BTC: 5n };
    expect(value1.merge(value2).value).toEqual({
      ADA: 20n,
      BTC: 15n,
      ETH: 10n,
    });
  });

  it("should merge two values correctly with negative quantities", () => {
    const value1 = new MeshValue();
    value1.value = { ADA: 20n, BTC: -10n };
    const value2 = new MeshValue();
    value2.value = { ADA: 10n, BTC: 5n };
    expect(value1.merge(value2).value).toEqual({ ADA: 30n, BTC: -5n });
  });
});
})