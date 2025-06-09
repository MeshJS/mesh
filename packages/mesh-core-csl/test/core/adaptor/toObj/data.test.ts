import {
  BuilderData,
  conStr0,
  mConStr,
  mConStr0,
  Redeemer,
  stringToHex,
} from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import {
  builderDataToCbor,
  csl,
  redeemerToObj,
  toPlutusData,
} from "@meshsdk/core-csl";

describe("Data Adaptor - toObj", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("builderDataToCbor", () => {
    test("should convert Mesh type BuilderData to CBOR hex", () => {
      const builderData: BuilderData = {
        type: "Mesh",
        content: mConStr0([stringToHex("Neil is legend")]),
      };
      const cbor = serializeData(builderData.content);

      const result = builderDataToCbor(builderData);
      expect(result).toBe(cbor);
    });

    test("should handle CBOR type BuilderData", () => {
      const cbor = serializeData(mConStr0([stringToHex("Neil is legend")]));
      const builderData: BuilderData = {
        type: "CBOR",
        content: cbor,
      };

      const result = builderDataToCbor(builderData);
      expect(result).toBe("deadbeef");
    });

    test("should handle JSON type BuilderData", () => {
      const builderData: BuilderData = {
        type: "JSON",
        content: conStr0([stringToHex("Neil is legend")]),
      };
      const cbor = serializeData(builderData.content, "JSON");

      const result = builderDataToCbor(builderData);
      expect(result).toBe(cbor);
    });
  });

  describe("redeemerToObj", () => {
    test("should convert a Redeemer to object representation", () => {
      const redeemer: Redeemer = {
        data: {
          type: "Mesh",
          content: mConStr0([stringToHex("Neil is legend")]),
        },
        exUnits: {
          mem: 7000000,
          steps: 3000000000,
        },
      };
      const cbor = serializeData(redeemer.data.content);
      const result = redeemerToObj(redeemer);

      // Verify
      expect(result).toEqual({
        data: cbor,
        exUnits: {
          mem: 7000000,
          steps: 3000000000,
        },
      });
    });

    test("should handle CBOR data in Redeemer", () => {
      const cbor = serializeData(mConStr0([stringToHex("Neil is legend")]));
      const redeemer: Redeemer = {
        data: {
          type: "CBOR",
          content: cbor,
        },
        exUnits: {
          mem: 1234567,
          steps: 9876543,
        },
      };

      // Execute
      const result = redeemerToObj(redeemer);

      // Verify
      expect(result).toEqual({
        data: cbor,
        exUnits: {
          mem: 1234567,
          steps: 9876543,
        },
      });
    });

    test("should handle JSON data in Redeemer", () => {
      const redeemer: Redeemer = {
        data: {
          type: "JSON",
          content: conStr0([stringToHex("Neil is legend")]),
        },
        exUnits: {
          mem: 1000000,
          steps: 2000000,
        },
      };

      // Execute
      const cbor = serializeData(redeemer.data.content, "JSON");
      const result = redeemerToObj(redeemer);

      // Verify
      expect(result).toEqual({
        data: cbor,
        exUnits: {
          mem: 1000000,
          steps: 2000000,
        },
      });
    });
  });
});
