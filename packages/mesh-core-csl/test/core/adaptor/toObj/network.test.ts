import { Network } from "@meshsdk/common";
import { networkToObj } from "@meshsdk/core-csl";

describe("network.ts", () => {
  describe("networkToObj", () => {
    it("should handle mainnet network string", () => {
      const network: Network = "mainnet";
      expect(networkToObj(network)).toBe("mainnet");
    });

    it("should handle testnet network string", () => {
      const network: Network = "testnet";
      expect(networkToObj(network)).toBe("testnet");
    });

    it("should handle custom network array", () => {
      const customNetwork: number[][] = [
        [1, 2],
        [3, 4],
      ];
      expect(networkToObj(customNetwork)).toEqual({
        custom: [
          [1, 2],
          [3, 4],
        ],
      });
    });

    it("should handle empty custom network array", () => {
      const customNetwork: number[][] = [];
      expect(networkToObj(customNetwork)).toEqual({
        custom: [],
      });
    });
  });

  describe("Round Trip Tests", () => {
    it("should maintain network type when converting back and forth with fromObj", () => {
      const originalNetwork: Network = "mainnet";
      const serialized = networkToObj(originalNetwork);

      // Import networkFromObj dynamically since it's in a different file
      const {
        networkFromObj,
      } = require("../../../../src/core/adaptor/fromObj/network");
      const deserialized = networkFromObj(serialized);

      expect(deserialized).toBe(originalNetwork);
    });

    it("should maintain custom network data when converting to object", () => {
      const originalNetwork: number[][] = [
        [1, 2],
        [3, 4],
      ];
      const serialized = networkToObj(originalNetwork);
      expect(serialized).toEqual({
        custom: originalNetwork,
      });
    });
  });
});
