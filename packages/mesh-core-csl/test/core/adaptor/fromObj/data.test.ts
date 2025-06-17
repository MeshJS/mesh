import {
  byteString,
  conStr0,
  mConStr0,
  Redeemer,
  stringToHex,
} from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import {
  builderDataToCbor,
  cborToBuilderData,
  dataFromObj,
  redeemerFromObj,
  redeemerToObj,
} from "@meshsdk/core-csl";

describe("Data Adaptor - fromObj", () => {
  describe("cborToBuilderData", () => {
    test("should convert CBOR hex to Mesh type BuilderData", () => {
      const originalData = mConStr0([stringToHex("Neil is legend")]);
      const cbor = serializeData(originalData);
      const result = cborToBuilderData(cbor);
      const resultCbor = builderDataToCbor(result);

      expect(result.type).toBe("CBOR");
      expect(resultCbor).toBe(cbor);
    });

    test("should convert to CBOR type when data cannot be parsed as a JS object", () => {
      const complexCbor = "deadbeef";
      const result = cborToBuilderData(complexCbor);

      expect(result.type).toBe("CBOR");
      expect(result.content).toBe(complexCbor);
    });
  });

  describe("redeemerFromObj", () => {
    test("should convert object representation back to Redeemer", () => {
      const originalContent = mConStr0([stringToHex("Neil is legend")]);
      const cbor = serializeData(originalContent);

      const objRepresentation = {
        data: cbor,
        exUnits: {
          mem: 7000000,
          steps: 3000000000,
        },
      };

      const result = redeemerFromObj(objRepresentation);
      expect(result.exUnits).toEqual(objRepresentation.exUnits);
      expect(result.data.type).toBe("CBOR");

      const resultCbor = builderDataToCbor(result.data);
      expect(resultCbor).toBe(cbor);
    });

    test("should handle complex CBOR data in object representation", () => {
      const json = conStr0([byteString(stringToHex("Neil is legend"))]);
      const cbor = serializeData(json, "JSON");

      const objRepresentation = {
        data: cbor,
        exUnits: {
          mem: 1234567,
          steps: 9876543,
        },
      };

      const result = redeemerFromObj(objRepresentation);
      expect(result.exUnits).toEqual(objRepresentation.exUnits);

      const resultCbor = builderDataToCbor(result.data);
      expect(resultCbor).toBe(cbor);
    });
  });

  describe("dataFromObj", () => {
    test("should handle null values", () => {
      expect(dataFromObj(null)).toBeNull();
    });

    test("should convert int values to BigInt", () => {
      const intObj = { int: "123456789012345678901234567890" };

      const result = dataFromObj(intObj);

      expect(result).toEqual(BigInt("123456789012345678901234567890"));
    });

    test("should handle bytes values", () => {
      const bytesObj = { bytes: "deadbeef" };

      const result = dataFromObj(bytesObj);

      expect(result).toEqual("deadbeef");
    });

    test("should handle constructor objects", () => {
      const constructorObj = {
        constructor: 0,
        fields: [{ int: "42" }, "string", { list: ["a", "b", "c"] }],
      };

      const result = dataFromObj(constructorObj);

      expect(result).toEqual({
        constructor: 0,
        fields: [BigInt("42"), "string", ["a", "b", "c"]],
      });
    });

    test("should pass through primitive values", () => {
      expect(dataFromObj("string")).toBe("string");
      expect(dataFromObj(42)).toBe(42);
      expect(dataFromObj(true)).toBe(true);
    });

    test("should handle complex nested structures", () => {
      const complexObj = {
        map: [
          {
            k: "outer",
            v: {
              constructor: 1,
              fields: [
                { int: "42" },
                {
                  list: [
                    { bytes: "deadbeef" },
                    { map: [{ k: "inner", v: "value" }] },
                  ],
                },
              ],
            },
          },
        ],
      };

      const result = dataFromObj(complexObj);

      expect(result).toEqual({
        outer: {
          constructor: 1,
          fields: [BigInt("42"), ["deadbeef", { inner: "value" }]],
        },
      });
    });
  });

  describe("Round trip conversion", () => {
    test("should get back the original Redeemer after converting to object and back", () => {
      const original: Redeemer = {
        data: {
          type: "Mesh",
          content: mConStr0([stringToHex("Neil is legend")]),
        },
        exUnits: {
          mem: 7000000,
          steps: 3000000000,
        },
      };

      const objRepresentation = redeemerToObj(original);
      const roundTrip = redeemerFromObj(objRepresentation);
      expect(roundTrip.exUnits).toEqual(original.exUnits);

      const originalCbor = builderDataToCbor(original.data);
      const roundTripCbor = builderDataToCbor(roundTrip.data);
      expect(roundTripCbor).toBe(originalCbor);
    });
  });
});
