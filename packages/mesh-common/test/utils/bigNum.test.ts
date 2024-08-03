import { BigNum } from "@meshsdk/common";

describe("BigNum class", () => {
  describe("constructor", () => {
    it("should get correct new BigNum with number", () => {
      const bigNum = new BigNum(100);
      expect(bigNum.value).toBe(BigInt(100));
    });
    it("should get correct new BigNum with string", () => {
      const bigNum = new BigNum("100");
      expect(bigNum.value).toBe(BigInt(100));
    });
    it("should get correct new BigNum with bigint", () => {
      const bigNum = new BigNum(BigInt(100));
      expect(bigNum.value).toBe(BigInt(100));
    });
    it("should get correct new BigNum without param", () => {
      const bigNum = new BigNum();
      expect(bigNum.value).toBe(BigInt(0));
    });
  });
  describe("new", () => {
    it("should get correct new BigNum with number", () => {
      const bigNum = BigNum.new(100);
      expect(bigNum.value).toBe(BigInt(100));
    });
    it("should get correct new BigNum with string", () => {
      const bigNum = BigNum.new("100");
      expect(bigNum.value).toBe(BigInt(100));
    });
    it("should get correct new BigNum with bigint", () => {
      const bigNum = BigNum.new(BigInt(100));
      expect(bigNum.value).toBe(BigInt(100));
    });
    it("should get correct new BigNum without param", () => {
      const bigNum = BigNum.new(undefined);
      expect(bigNum.value).toBe(BigInt(0));
    });
  });
  describe("divFloor", () => {
    it("should get correct divFloor", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(10);
      const result = bigNum.divFloor(other);
      expect(result.value).toBe(BigInt(10));
    });
    it("should get correct divFloor with remainder", () => {
      const bigNum = new BigNum(101);
      const other = new BigNum(10);
      const result = bigNum.divFloor(other);
      expect(result.value).toBe(BigInt(10));
    });
  });
  describe("checkedMul", () => {
    it("should get correct checkedMul", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(10);
      const result = bigNum.checkedMul(other);
      expect(result.value).toBe(BigInt(1000));
    });
    it("should get correct checkedMul with negative", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(-10);
      const result = bigNum.checkedMul(other);
      expect(result.value).toBe(BigInt(-1000));
    });
  });
  describe("checkedAdd", () => {
    it("should get correct checkedAdd", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(10);
      const result = bigNum.checkedAdd(other);
      expect(result.value).toBe(BigInt(110));
    });
    it("should get correct checkedAdd with negative", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(-10);
      const result = bigNum.checkedAdd(other);
      expect(result.value).toBe(BigInt(90));
    });
  });
  describe("checkedSub", () => {
    it("should get correct checkedSub", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(10);
      const result = bigNum.checkedSub(other);
      expect(result.value).toBe(BigInt(90));
    });
    it("should get correct checkedSub with negative", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(110);
      const result = bigNum.checkedSub(other);
      expect(result.value).toBe(BigInt(-10));
    });
  });
  describe("clampedSub", () => {
    it("should get correct clampedSub", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(10);
      const result = bigNum.clampedSub(other);
      expect(result.value).toBe(BigInt(90));
    });
    it("should get correct clampedSub with negative", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(110);
      const result = bigNum.clampedSub(other);
      expect(result.value).toBe(BigInt(0));
    });
  });
  describe("lessThan", () => {
    it("should get correct lessThan", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(110);
      const result = bigNum.lessThan(other);
      expect(result).toBe(true);
    });
    it("should get correct lessThan with equal", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(100);
      const result = bigNum.lessThan(other);
      expect(result).toBe(false);
    });
    it("should get correct lessThan with greater", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(90);
      const result = bigNum.lessThan(other);
      expect(result).toBe(false);
    });
  });
  describe("compare", () => {
    it("should get correct compare", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(110);
      const result = bigNum.compare(other);
      expect(result).toBe(-1);
    });
    it("should get correct compare with equal", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(100);
      const result = bigNum.compare(other);
      expect(result).toBe(0);
    });
    it("should get correct compare with greater", () => {
      const bigNum = new BigNum(100);
      const other = new BigNum(90);
      const result = bigNum.compare(other);
      expect(result).toBe(1);
    });
  });
  describe("toString", () => {
    it("should get correct toString", () => {
      const bigNum = new BigNum(100);
      const result = bigNum.toString();
      expect(result).toBe("100");
    });
  });
});
