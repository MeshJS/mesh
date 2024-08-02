import { conStr, conStr0, conStr1, conStr2 } from "../../../src";

const testByteString = { bytes: "abcd" };

describe("Plutus data type", () => {
  describe("constructor", () => {
    test("conStr", () => {
      const result = conStr(0, [testByteString]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 0, fields: [testByteString] }),
      );
    });
    test("conStr0", () => {
      const result = conStr0([testByteString]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 0, fields: [testByteString] }),
      );
    });
    test("conStr1", () => {
      const result = conStr1([testByteString]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 1, fields: [testByteString] }),
      );
    });
    test("conStr2", () => {
      const result = conStr2([testByteString]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ constructor: 2, fields: [testByteString] }),
      );
    });
  });

  describe("Input validation", () => {
    test("Non array fields", () => {
      expect(() => conStr(0, testByteString)).toThrow();
    });
  });
});
