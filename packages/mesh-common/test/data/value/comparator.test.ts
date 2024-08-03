import { MeshValue } from "@meshsdk/common";

describe("MeshValue class", () => {
  describe("geq", () => {
    it("should return true if the value is greater than or equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ADA: 10n, BTC: 5n };
      expect(value.geq("ADA", target)).toBe(true);
      expect(value.geq("BTC", target)).toBe(true);
    });

    it("should return false if the value is less than the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ADA: 30n, BTC: 15n };
      expect(value.geq("ADA", target)).toBe(false);
      expect(value.geq("BTC", target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ADA: 20n, BTC: 10n };
      expect(value.geq("ADA", target)).toBe(true);
      expect(value.geq("BTC", target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ETH: 5n };
      expect(value.geq("ETH", target)).toBe(false);
    });
  });
  describe("leq", () => {
    it("should return true if the value is less than or equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ADA: 30n, BTC: 15n };
      expect(value.leq("ADA", target)).toBe(true);
      expect(value.leq("BTC", target)).toBe(true);
    });

    it("should return false if the value is greater than the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ADA: 10n, BTC: 5n };
      expect(value.leq("ADA", target)).toBe(false);
      expect(value.leq("BTC", target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ADA: 20n, BTC: 10n };
      expect(value.leq("ADA", target)).toBe(true);
      expect(value.leq("BTC", target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new MeshValue();
      target.value = { ETH: 5n };
      expect(value.leq("ETH", target)).toBe(false);
    });
  });
  describe("isEmpty", () => {
    it("should return true if the value is empty", () => {
      const value = new MeshValue();
      value.value = {};
      expect(value.isEmpty()).toBe(true);
    });

    it("should return false if the value is not empty", () => {
      const value = new MeshValue();
      value.value = { ADA: 20n };
      expect(value.isEmpty()).toBe(false);
    });
  });
})