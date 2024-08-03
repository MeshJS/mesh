// import {
//   Asset,
//   byteString,
//   ByteString,
//   dict,
//   Dict,
//   Integer,
//   integer,
//   parsePlutusValueToAssets,
//   Value,
//   value,
// } from "@meshsdk/common";

// describe("value", () => {
//   test("Simple ADA Value", () => {
//     const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
//     const datum: Value = value(val);

//     const nameMap = dict<Integer>([[byteString(""), integer(1000000)]]);
//     const valMap = dict<Dict<Integer>>([[byteString(""), nameMap]]);
//     expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
//   });
//   test("Simple token Value", () => {
//     const val: Asset[] = [
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
//         quantity: "345",
//       },
//     ];
//     const datum: Value = value(val);

//     const nameMap = dict<Integer>([
//       [byteString("74657374696e676e657777616c2e616461"), integer(345)],
//     ]);
//     const valMap = dict<Dict<Integer>>([
//       [
//         byteString("baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700"),
//         nameMap,
//       ],
//     ]);
//     expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
//   });
//   test("Complex Value", () => {
//     const val: Asset[] = [
//       { unit: "lovelace", quantity: "1000000" },
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
//         quantity: "345",
//       },
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
//         quantity: "567",
//       },
//     ];
//     const datum: Value = value(val);

//     const nameMap = dict<Integer>([
//       [byteString("1234"), integer(567)],
//       [byteString("74657374696e676e657777616c2e616461"), integer(345)],
//     ]);
//     const valMap = dict<Dict<Integer>>([
//       [byteString(""), dict([[byteString(""), integer(1000000)]])],
//       [
//         byteString("baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700"),
//         nameMap,
//       ],
//     ]);
//     expect(JSON.stringify(datum)).toBe(JSON.stringify(valMap));
//   });
// });

// describe("Value", () => {
//   test("Simple ADA Value", () => {
//     const val: Asset[] = [{ unit: "lovelace", quantity: "1000000" }];
//     const plutusValue: Value = value(val);
//     const assets: Asset[] = parsePlutusValueToAssets(plutusValue);

//     expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
//   });
//   test("Simple token Value", () => {
//     const val: Asset[] = [
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
//         quantity: "345",
//       },
//     ];
//     const plutusValue: Value = value(val);
//     const assets: Asset[] = parsePlutusValueToAssets(plutusValue);

//     expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
//   });
//   test("Complex Value", () => {
//     const val: Asset[] = [
//       { unit: "lovelace", quantity: "1000000" },
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc817001234",
//         quantity: "567",
//       },
//       {
//         unit: "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461",
//         quantity: "345",
//       },
//     ];
//     const plutusValue: Value = value(val);
//     const assets: Asset[] = parsePlutusValueToAssets(plutusValue);
//     expect(JSON.stringify(val)).toBe(JSON.stringify(assets));
//   });
// });

// tests/value.test.ts
import { Asset, Value } from "@meshsdk/common";

describe("Value class", () => {
  describe("addAsset", () => {
    it("should add a new asset correctly", () => {
      const value = new Value();
      const singleAsset: Asset = { unit: "USDM", quantity: "100" };
      value.addAsset(singleAsset);
      // Assertions to verify the behavior of addAsset...
      expect(value.value).toEqual({ USDM: BigInt(100) });
    });
    it("should add to an existing asset correctly", () => {
      const value = new Value();
      const singleAsset: Asset = { unit: "USDM", quantity: "100" };
      value.addAsset(singleAsset);
      value.addAsset(singleAsset);
      // Assertions to verify the behavior of addAsset...
      expect(value.value).toEqual({ USDM: BigInt(200) });
    });
    it("should add multiple assets correctly", () => {
      const value = new Value();
      const assets: Asset[] = [
        { unit: "USDM", quantity: "100" },
        { unit: "ADA", quantity: "10" },
      ];
      value.addAsset(assets[0]).addAsset(assets[1]);
      // Assertions to verify the behavior of addAsset...
      expect(value.value).toEqual({ USDM: BigInt(100), ADA: BigInt(10) });
    });
  });
  describe("addAssets", () => {
    it("should add multiple assets correctly", () => {
      const value = new Value();
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
      const value = new Value();
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
        const value = new Value();
        value.value = { ADA: 10n };
        value.negateAsset({ unit: "ADA", quantity: "5" });
        expect(value.value).toEqual({ ADA: BigInt(5) });
      });

      it("should remove the asset if the resulting quantity is zero", () => {
        const value = new Value();
        value.value = { ADA: 10n };
        value.negateAsset({ unit: "ADA", quantity: "10" });
        expect(value.value.ADA).toBeUndefined();
      });

      it("should allow negative quantity if the subtraction results in negative value", () => {
        const value = new Value();
        value.value = { ADA: 10n };
        value.negateAsset({ unit: "ADA", quantity: "15" });
        expect(value.value).toEqual({ ADA: BigInt(-5) });
      });

      it("should add a new asset with negative quantity if the asset does not exist", () => {
        const value = new Value();
        value.negateAsset({ unit: "ADA", quantity: "5" });
        expect(value.value).toEqual({ ADA: BigInt(-5) });
      });
    });
  });
  describe("negateAssets", () => {
    it("should subtract quantities from existing assets", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      value.negateAssets([
        { unit: "ADA", quantity: "5" },
        { unit: "BTC", quantity: "3" },
      ]);
      expect(value.value).toEqual({ ADA: BigInt(15), BTC: BigInt(7) });
    });

    it("should remove the asset if the resulting quantity is zero", () => {
      const value = new Value();
      value.value = { ADA: 10n, BTC: 5n };
      value.negateAssets([
        { unit: "ADA", quantity: "10" },
        { unit: "BTC", quantity: "5" },
      ]);
      expect(value.value.ADA).toBeUndefined();
      expect(value.value.BTC).toBeUndefined();
    });

    it("should allow negative quantity if the subtraction results in negative value", () => {
      const value = new Value();
      value.value = { ADA: 10n, BTC: 5n };
      value.negateAssets([
        { unit: "ADA", quantity: "15" },
        { unit: "BTC", quantity: "10" },
      ]);
      expect(value.value).toEqual({ ADA: BigInt(-5), BTC: BigInt(-5) });
    });

    it("should add new assets with negative quantities if the assets do not exist", () => {
      const value = new Value();
      value.negateAssets([
        { unit: "ADA", quantity: "5" },
        { unit: "BTC", quantity: "3" },
      ]);
      expect(value.value).toEqual({ ADA: BigInt(-5), BTC: BigInt(-3) });
    });

    it("should handle a mix of existing and non-existing assets", () => {
      const value = new Value();
      value.value = { ADA: 10n };
      value.negateAssets([
        { unit: "ADA", quantity: "5" },
        { unit: "BTC", quantity: "3" },
      ]);
      expect(value.value).toEqual({ ADA: BigInt(5), BTC: BigInt(-3) });
    });
  });
  describe("get", () => {
    it("should return the quantity of an existing asset", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      expect(value.get("ADA")).toEqual(BigInt(20));
      expect(value.get("BTC")).toEqual(BigInt(10));
    });

    it("should return 0 for a non-existing asset", () => {
      const value = new Value();
      value.value = { ADA: 20n };
      expect(value.get("BTC")).toEqual(BigInt(0));
    });

    it("should handle an empty value object", () => {
      const value = new Value();
      expect(value.get("ADA")).toEqual(BigInt(0));
    });

    it("should return the correct quantity after adding assets", () => {
      const value = new Value();
      value.value = { ADA: 20n };
      value.addAsset({ unit: "BTC", quantity: "10" });
      expect(value.get("BTC")).toEqual(BigInt(10));
    });

    it("should return the correct quantity after subtracting assets", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      value.negateAssets([{ unit: "BTC", quantity: "5" }]);
      expect(value.get("BTC")).toEqual(BigInt(5));
    });
  });
  describe("units", () => {
    it("should return an empty object when value is empty", () => {
      const value = new Value();
      value.value = {};
      expect(value.units()).toEqual({});
    });

    it("should return the correct structure for a single asset", () => {
      const value = new Value();
      value.value = { ADA: 20n };
      expect(value.units()).toEqual({
        ADA: [{ unit: "ADA", quantity: BigInt(20) }],
      });
    });

    it("should return the correct structure for multiple assets", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      expect(value.units()).toEqual({
        ADA: [{ unit: "ADA", quantity: BigInt(20) }],
        BTC: [{ unit: "BTC", quantity: BigInt(10) }],
      });
    });

    it("should handle both positive and negative quantities correctly", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: -10n };
      expect(value.units()).toEqual({
        ADA: [{ unit: "ADA", quantity: BigInt(20) }],
        BTC: [{ unit: "BTC", quantity: BigInt(-10) }],
      });
    });
  });
  describe("geq", () => {
    it("should return true if the value is greater than or equal to the target value for a specific unit", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ADA: 10n, BTC: 5n };
      expect(value.geq("ADA", target)).toBe(true);
      expect(value.geq("BTC", target)).toBe(true);
    });

    it("should return false if the value is less than the target value for a specific unit", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ADA: 30n, BTC: 15n };
      expect(value.geq("ADA", target)).toBe(false);
      expect(value.geq("BTC", target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ADA: 20n, BTC: 10n };
      expect(value.geq("ADA", target)).toBe(true);
      expect(value.geq("BTC", target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ETH: 5n };
      expect(value.geq("ETH", target)).toBe(false);
    });
  });
  describe("leq", () => {
    it("should return true if the value is less than or equal to the target value for a specific unit", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ADA: 30n, BTC: 15n };
      expect(value.leq("ADA", target)).toBe(true);
      expect(value.leq("BTC", target)).toBe(true);
    });

    it("should return false if the value is greater than the target value for a specific unit", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ADA: 10n, BTC: 5n };
      expect(value.leq("ADA", target)).toBe(false);
      expect(value.leq("BTC", target)).toBe(false);
    });

    it("should return true if the value is equal to the target value for a specific unit", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ADA: 20n, BTC: 10n };
      expect(value.leq("ADA", target)).toBe(true);
      expect(value.leq("BTC", target)).toBe(true);
    });

    it("should return false if the unit does not exist in value.value", () => {
      const value = new Value();
      value.value = { ADA: 20n, BTC: 10n };
      const target = new Value();
      target.value = { ETH: 5n };
      expect(value.leq("ETH", target)).toBe(false);
    });
  });
  describe("isEmpty", () => {
    it("should return true if the value is empty", () => {
      const value = new Value();
      value.value = {};
      expect(value.isEmpty()).toBe(true);
    });

    it("should return false if the value is not empty", () => {
      const value = new Value();
      value.value = { ADA: 20n };
      expect(value.isEmpty()).toBe(false);
    });
  });
  describe("merge", () => {
    it("should merge two values correctly", () => {
      const value1 = new Value();
      value1.value = { ADA: 20n, BTC: 10n };
      const value2 = new Value();
      value2.value = { ADA: 10n, BTC: 5n };
      expect(value1.merge(value2).value).toEqual({ ADA: 30n, BTC: 15n });
    });

    it("should merge two values correctly with different units", () => {
      const value1 = new Value();
      value1.value = { ADA: 20n, BTC: 10n };
      const value2 = new Value();
      value2.value = { ETH: 10n, BTC: 5n };
      expect(value1.merge(value2).value).toEqual({
        ADA: 20n,
        BTC: 15n,
        ETH: 10n,
      });
    });

    it("should merge two values correctly with negative quantities", () => {
      const value1 = new Value();
      value1.value = { ADA: 20n, BTC: -10n };
      const value2 = new Value();
      value2.value = { ADA: 10n, BTC: 5n };
      expect(value1.merge(value2).value).toEqual({ ADA: 30n, BTC: -5n });
    });
  });
});
