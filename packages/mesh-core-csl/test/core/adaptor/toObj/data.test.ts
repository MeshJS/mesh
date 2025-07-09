import JSONBig from "json-bigint";

import {
  BuilderData,
  byteString,
  conStr0,
  mConStr0,
  Redeemer,
  stringToHex,
} from "@meshsdk/common";
import { serializeData } from "@meshsdk/core";
import { builderDataToCbor, redeemerToObj } from "@meshsdk/core-csl";

describe("Data Adaptor - toObj", () => {
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
      expect(result).toBe(cbor);
    });

    test("should handle JSON type BuilderData", () => {
      const json = conStr0([byteString(stringToHex("Neil is legend"))]);
      const builderData: BuilderData = {
        type: "JSON",
        content: JSONBig.stringify(json),
      };
      const cbor = serializeData(json, "JSON");

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
      const json = conStr0([byteString(stringToHex("Neil is legend"))]);
      const redeemer: Redeemer = {
        data: {
          type: "JSON",
          content: JSONBig.stringify(json),
        },
        exUnits: {
          mem: 1000000,
          steps: 2000000,
        },
      };

      // Execute
      const cbor = serializeData(json, "JSON");
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
