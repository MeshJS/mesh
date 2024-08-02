import {
  bool,
  mBool,
  mPlutusBSArrayToString,
  mStringToPlutusBSArray,
} from "@meshsdk/common";

import { serializeData } from "./common";

describe("Plutus data type", () => {
  describe("bool", () => {
    test("bool - true", () => {
      const [meshCbor, jsonCbor] = serializeData(mBool(true), bool(true));
      expect(meshCbor).toBe(jsonCbor);
    });
    test("bool - false", () => {
      const [meshCbor, jsonCbor] = serializeData(mBool(false), bool(false));
      expect(meshCbor).toBe(jsonCbor);
    });
  });
});

describe("String List of byte array conversion", () => {
  const testString =
    "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e657777616c2e616461";
  const testList: string[] = [
    "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374",
    "696e676e657777616c2e616461baefdc6c5b191be372a794cd8d40d839ec0dbd",
    "d3c28957267dc8170074657374696e676e657777616c2e616461baefdc6c5b19",
    "1be372a794cd8d40d839ec0dbdd3c28957267dc8170074657374696e676e6577",
    "77616c2e616461",
  ];

  test("stringToPlutusBSArray", () => {
    const result = mStringToPlutusBSArray(testString);
    expect(JSON.stringify(testList)).toBe(JSON.stringify(result));
  });
  test("plutusBSArrayToString", () => {
    const result = mPlutusBSArrayToString(testList);
    expect(result).toBe(testString);
  });
});
