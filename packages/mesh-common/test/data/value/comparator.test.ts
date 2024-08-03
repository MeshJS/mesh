import { MeshValue } from "@meshsdk/common";

import { mockUnit } from "./common";

describe("MeshValue class", () => {
  describe("geq", () => {
    it("should return true if the value is greater than or equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { lovelace: 10n, [mockUnit]: 5n };
      expect(value.geq("lovelace", target)).toBe(true);
      expect(value.geq(mockUnit, target)).toBe(true);
    });

    it("should return false if the value is less than the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { lovelace: 30n, [mockUnit]: 15n };
      expect(value.geq("lovelace", target)).toBe(false);
      expect(value.geq(mockUnit, target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { lovelace: 20n, [mockUnit]: 10n };
      expect(value.geq("lovelace", target)).toBe(true);
      expect(value.geq(mockUnit, target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { ETH: 5n };
      expect(value.geq("ETH", target)).toBe(false);
    });
  });
  describe("leq", () => {
    it("should return true if the value is less than or equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { lovelace: 30n, [mockUnit]: 15n };
      expect(value.leq("lovelace", target)).toBe(true);
      expect(value.leq(mockUnit, target)).toBe(true);
    });

    it("should return false if the value is greater than the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { lovelace: 10n, [mockUnit]: 5n };
      expect(value.leq("lovelace", target)).toBe(false);
      expect(value.leq(mockUnit, target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
      const target = new MeshValue();
      target.value = { lovelace: 20n, [mockUnit]: 10n };
      expect(value.leq("lovelace", target)).toBe(true);
      expect(value.leq(mockUnit, target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new MeshValue();
      value.value = { lovelace: 20n, [mockUnit]: 10n };
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
      value.value = { lovelace: 20n };
      expect(value.isEmpty()).toBe(false);
    });
  });
});
