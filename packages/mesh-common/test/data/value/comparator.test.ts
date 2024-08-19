import { MeshValue } from "@meshsdk/common";

import { mockUnit } from "./common";

describe("MeshValue class", () => {
  describe("geq", () => {
    it("should return true if the value is greater than or equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 10n, [mockUnit]: 5n });
      expect(value.geq(target)).toBe(true);
    });

    it("should return false if the value is less than the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 30n, [mockUnit]: 15n });
      expect(value.geq(target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.geq(target)).toBe(true);
    });

    it("should return false if there is missing unit in the target value", () => {
      const value = new MeshValue({ lovelace: 20n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.geq(target)).toBe(false);
    });

    it("should return false if there is missing unit in the value.value", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n });
      expect(value.geq(target)).toBe(true);
    });

    it("should return false if there is missing unit in both value.value and target.value", () => {
      const value = new MeshValue({ lovelace: 20n, somethingelse: 10n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.geq(target)).toBe(false);
    });
  });
  describe("geqUnit", () => {
    it("should return true if the value is greater than or equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 10n, [mockUnit]: 5n });
      expect(value.geqUnit("lovelace", target)).toBe(true);
      expect(value.geqUnit(mockUnit, target)).toBe(true);
    });

    it("should return false if the value is less than the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 30n, [mockUnit]: 15n });
      expect(value.geqUnit("lovelace", target)).toBe(false);
      expect(value.geqUnit(mockUnit, target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.geqUnit("lovelace", target)).toBe(true);
      expect(value.geqUnit(mockUnit, target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n });
      expect(value.geqUnit(mockUnit, target)).toBe(false);
    });

    it("should return false if the unit does not exist in other.value", () => {
      const value = new MeshValue({ lovelace: 20n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.geqUnit(mockUnit, target)).toBe(false);
    });
  });
  describe("leq", () => {
    it("should return true if the value is less than or equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 30n, [mockUnit]: 15n });
      expect(value.leq(target)).toBe(true);
    });

    it("should return false if the value is greater than the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 10n, [mockUnit]: 5n });
      expect(value.leq(target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.leq(target)).toBe(true);
    });

    it("should return false if there is missing unit in the target value", () => {
      const value = new MeshValue({ lovelace: 20n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.leq(target)).toBe(true);
    });

    it("should return false if there is missing unit in the value.value", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n });
      expect(value.leq(target)).toBe(false);
    });

    it("should return false if there is missing unit in both value.value and target.value", () => {
      const value = new MeshValue({ lovelace: 20n, somethingelse: 10n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.leq(target)).toBe(false);
    });
  });
  describe("leqUnit", () => {
    it("should return true if the value is less than or equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 30n, [mockUnit]: 15n });
      expect(value.leqUnit("lovelace", target)).toBe(true);
      expect(value.leqUnit(mockUnit, target)).toBe(true);
    });

    it("should return false if the value is greater than the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 10n, [mockUnit]: 5n });
      expect(value.leqUnit("lovelace", target)).toBe(false);
      expect(value.leqUnit(mockUnit, target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      expect(value.leqUnit("lovelace", target)).toBe(true);
      expect(value.leqUnit(mockUnit, target)).toBe(true);
    });

    it("should return false if the unit does not exist in other.value", () => {
      const value = new MeshValue({ lovelace: 20n });
      const target = new MeshValue({ lovelace: 5n, [mockUnit]: 10n });
      expect(value.leqUnit(mockUnit, target)).toBe(false);
    });

    it("should return false if the unit does not exist in this.value", () => {
      const value = new MeshValue({ lovelace: 20n, [mockUnit]: 10n });
      const target = new MeshValue({ lovelace: 20n });
      expect(value.leqUnit(mockUnit, target)).toBe(false);
    });
  });
  describe("isEmpty", () => {
    it("should return true if the value is empty", () => {
      const value = new MeshValue();
      expect(value.isEmpty()).toBe(true);
    });

    it("should return false if the value is not empty", () => {
      const value = new MeshValue({ lovelace: 20n });
      expect(value.isEmpty()).toBe(false);
    });
  });
});
