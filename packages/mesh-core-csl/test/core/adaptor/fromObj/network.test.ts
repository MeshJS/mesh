import { Network } from "@meshsdk/common";

import { networkFromObj } from "../../../../src/core/adaptor/fromObj/network";
import { networkToObj } from "../../../../src/core/adaptor/toObj/network";

describe("network.ts Round Trip Tests", () => {
  describe("Standard Networks", () => {
    it("should maintain mainnet network type in round trip", () => {
      const originalNetwork: Network = "mainnet";
      const serialized = networkToObj(originalNetwork);
      const deserialized = networkFromObj(serialized);
      expect(deserialized).toBe(originalNetwork);
    });

    it("should maintain testnet network type in round trip", () => {
      const originalNetwork: Network = "testnet";
      const serialized = networkToObj(originalNetwork);
      const deserialized = networkFromObj(serialized);
      expect(deserialized).toBe(originalNetwork);
    });
  });

  describe("Custom Networks", () => {
    it("should maintain custom network array data in round trip", () => {
      const originalNetwork: number[][] = [
        [1, 2],
        [3, 4],
      ];
      const serialized = networkToObj(originalNetwork);
      const deserialized = networkFromObj(serialized);
      expect(deserialized).toEqual(originalNetwork);
    });

    it("should handle empty custom network array in round trip", () => {
      const originalNetwork: number[][] = [];
      const serialized = networkToObj(originalNetwork);
      const deserialized = networkFromObj(serialized);
      expect(deserialized).toEqual(originalNetwork);
    });

    it("should maintain nested array structure in round trip", () => {
      const originalNetwork: number[][] = [[1], [2, 3], [4, 5, 6]];
      const serialized = networkToObj(originalNetwork);
      const deserialized = networkFromObj(serialized);
      expect(deserialized).toEqual(originalNetwork);
    });
  });

  describe("Multiple Conversions", () => {
    it("should maintain data integrity through multiple conversions", () => {
      const originalNetwork: Network = "mainnet";
      const firstConversion = networkToObj(originalNetwork);
      const secondConversion = networkFromObj(firstConversion);
      const thirdConversion = networkToObj(secondConversion);
      const finalConversion = networkFromObj(thirdConversion);

      expect(finalConversion).toBe(originalNetwork);
    });

    it("should maintain custom network data through multiple conversions", () => {
      const originalNetwork: number[][] = [
        [1, 2],
        [3, 4],
      ];
      const firstConversion = networkToObj(originalNetwork);
      const secondConversion = networkFromObj(firstConversion);
      const thirdConversion = networkToObj(secondConversion);
      const finalConversion = networkFromObj(thirdConversion);

      expect(finalConversion).toEqual(originalNetwork);
    });
  });
});
