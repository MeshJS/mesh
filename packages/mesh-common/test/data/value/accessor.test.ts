import { MeshValue } from "@meshsdk/common";

import { mockUnit } from "./common";

describe("MeshValue class", () => {
  describe("get", () => {
    it("should return the quantity of an existing asset", () => {
      const value = new MeshValue({
        lovelace: 20n,
        [mockUnit]: 10n,
      });
      expect(value.get("lovelace")).toEqual(BigInt(20));
      expect(value.get(mockUnit)).toEqual(BigInt(10));
    });

    it("should return 0 for a non-existing asset", () => {
      const value = new MeshValue({ lovelace: 20n });
      expect(value.get(mockUnit)).toEqual(BigInt(0));
    });

    it("should handle an empty value object", () => {
      const value = new MeshValue();
      expect(value.get("lovelace")).toEqual(BigInt(0));
    });

    it("should return the correct quantity after adding assets", () => {
      const value = new MeshValue({ lovelace: 20n });
      value.addAsset({
        unit: mockUnit,
        quantity: "10",
      });
      expect(value.get(mockUnit)).toEqual(BigInt(10));
    });

    it("should return the correct quantity after subtracting assets", () => {
      const value = new MeshValue({
        lovelace: 20n,
        [mockUnit]: 10n,
      });
      value.negateAssets([
        {
          unit: mockUnit,
          quantity: "5",
        },
      ]);
      expect(value.get(mockUnit)).toEqual(BigInt(5));
    });
  });
  describe("units", () => {
    it("should return an empty object when value is empty", () => {
      const value = new MeshValue();
      expect(value.units()).toEqual([]);
    });

    it("should return the correct structure for a single asset", () => {
      const value = new MeshValue({ lovelace: 20n });
      expect(value.units()).toEqual(["lovelace"]);
    });

    it("should return the correct structure for multiple assets", () => {
      const value = new MeshValue({
        lovelace: 20n,
        [mockUnit]: 10n,
      });
      expect(value.units()).toEqual(["lovelace", mockUnit]);
    });
  });
});
