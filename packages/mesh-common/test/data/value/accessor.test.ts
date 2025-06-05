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

  describe("getPolicyAssets", () => {
    const policyId1 =
      "7da4e62157841dc60fbe9ace95ec5b2bcd239cb59c0c7d1c58eea6fb";
    const policyId2 =
      "7da4e62157841dc60fbe9ace95ec5b2baaaaaaaaaaaaaaaaaaaaaaaa";
    const assetName1 = "neil";
    const assetName2 = "the legend";
    const fullAsset1 = `${policyId1}${assetName1}`;
    const fullAsset2 = `${policyId1}${assetName2}`;
    const fullAsset3 = `${policyId2}${assetName1}`;

    it("should return an empty array when no assets match the policy ID", () => {
      const value = new MeshValue({
        lovelace: 100n,
        [fullAsset3]: 10n,
      });

      const result = value.getPolicyAssets(policyId1);
      expect(result).toEqual([]);
    });

    it("should return all assets that match the policy ID", () => {
      const value = new MeshValue({
        lovelace: 100n,
        [fullAsset1]: 10n,
        [fullAsset2]: 20n,
        [fullAsset3]: 30n,
      });

      const result = value.getPolicyAssets(policyId1);
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { unit: fullAsset1, quantity: "10" },
          { unit: fullAsset2, quantity: "20" },
        ]),
      );
    });

    it("should handle multiple policy IDs correctly", () => {
      const value = new MeshValue({
        lovelace: 100n,
        [fullAsset1]: 10n,
        [fullAsset2]: 20n,
        [fullAsset3]: 30n,
      });

      const result1 = value.getPolicyAssets(policyId1);
      expect(result1).toHaveLength(2);

      const result2 = value.getPolicyAssets(policyId2);
      expect(result2).toHaveLength(1);
      expect(result2[0]).toEqual({ unit: fullAsset3, quantity: "30" });
    });

    it("should return an empty array when value is empty", () => {
      const value = new MeshValue();
      const result = value.getPolicyAssets(policyId1);
      expect(result).toEqual([]);
    });
  });
});
