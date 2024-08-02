import JSONBig from "json-bigint";

import {
  assocMap,
  bool,
  ByteString,
  byteString,
  integer,
  List,
  list,
  plutusBSArrayToString,
  stringToBSArray,
} from "../../../src";

const testByteString = { bytes: "abcd" };

describe("Plutus data type", () => {
  describe("bool", () => {
    test("bool - true", () => {
      const result = bool(true);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 1, fields: [] }),
      );
    });
    test("bool - false", () => {
      const result = bool(false);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 0, fields: [] }),
      );
    });
  });

  describe("byteString", () => {
    test("byteString - valid hex", () => {
      const hexString = "00112233445566aabbccddeeff";
      const result = byteString(hexString);
      expect(JSON.stringify(result)).toBe(JSON.stringify({ bytes: hexString }));
    });
    test("byteString - invalid hex - odd length", () => {
      const hexString = "00112233445566aabbccddeef";
      expect(() => byteString(hexString)).toThrow();
    });
    test("byteString - invalid hex - non hex string", () => {
      const hexString = "00112233445566aabbccddeeffgg";
      expect(() => byteString(hexString)).toThrow();
    });
  });

  describe("integer", () => {
    test("integer - number", () => {
      const testNumber = 1234567890;
      const result = integer(testNumber);
      expect(JSON.stringify(result)).toBe(JSON.stringify({ int: testNumber }));
    });
    test("integer - bigint", () => {
      const testBigInt = 1234567890123456789012345678901234567890n;
      const result = integer(testBigInt);
      expect(JSONBig.stringify(result)).toBe(
        JSONBig.stringify({ int: testBigInt }),
      );
    });
  });

  describe("list", () => {
    test("list - valid", () => {
      const result = list([testByteString, testByteString, testByteString]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({
          list: [testByteString, testByteString, testByteString],
        }),
      );
    });
    test("list - invalid non-JSON items", () => {
      expect(() =>
        list([testByteString, testByteString, testByteString.bytes]),
      ).toThrow();
    });
  });

  describe("assocMap", () => {
    test("assocMap", () => {
      const result = assocMap([
        [byteString("aaaa"), byteString("aaaaaaaa")],
        [byteString("bbbb"), byteString("bbbbbbbb")],
      ]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({
          map: [
            { k: { bytes: "aaaa" }, v: { bytes: "aaaaaaaa" } },
            { k: { bytes: "bbbb" }, v: { bytes: "bbbbbbbb" } },
          ],
        }),
      );
    });
  });
});

describe("String List of byte array conversion", () => {
  const testString =
    "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461";
  const testList: List<ByteString> = {
    list: [
      {
        bytes:
          "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374",
      },
      {
        bytes:
          "696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbd",
      },
      {
        bytes:
          "d3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b19",
      },
      {
        bytes:
          "1be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e6577",
      },
      {
        bytes: "77616c2e616461",
      },
    ],
  };

  test("stringToPlutusBSArray", () => {
    const result = stringToBSArray(testString);
    expect(JSON.stringify(testList)).toBe(JSON.stringify(result));
  });
  test("plutusBSArrayToString", () => {
    const result = plutusBSArrayToString(testList);
    expect(result).toBe(testString);
  });
});
