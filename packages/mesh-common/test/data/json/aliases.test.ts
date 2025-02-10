import {
  assetClass,
  assetName,
  assocMap,
  byteString,
  conStr0,
  currencySymbol,
  dict,
  integer,
  outputReference,
  policyId,
  posixTime,
  pubKeyHash,
  scriptHash,
  tokenName,
  tuple,
  txOutRef,
} from "../../../src";

const testHash = "baefdc6c5b191be372a794cd8d40d839ec0dbdd3c28957267dc81700";
const testTxHash =
  "a0bd47e8938e7c41d4c1d7c22033892319d28f86fdace791d45c51946553791b";

describe("Plutus byte hash types", () => {
  describe("hashByteString", () => {
    test("hashByteString - valid", () => {
      const result = byteString(testHash);
      expect(JSON.stringify(result)).toBe(JSON.stringify({ bytes: testHash }));
    });
    test("hashByteString - invalid string", () => {
      expect(() => byteString("invalid string")).toThrow();
    });
  });
  describe("scriptHash", () => {
    test("scriptHash", () => {
      const result = scriptHash(testHash);
      expect(JSON.stringify(result)).toBe(JSON.stringify(byteString(testHash)));
    });
  });
  describe("pubKeyHash", () => {
    test("pubKeyHash", () => {
      const result = pubKeyHash(testHash);
      expect(JSON.stringify(result)).toBe(JSON.stringify(byteString(testHash)));
    });
  });
});

describe("Plutus data type", () => {
  describe("policyId", () => {
    test("policyId", () => {
      const result = policyId(testHash);
      expect(JSON.stringify(result)).toBe(JSON.stringify(byteString(testHash)));
    });
  });
  describe("currencySymbol", () => {
    test("currencySymbol", () => {
      const result = currencySymbol(testHash);
      expect(JSON.stringify(result)).toBe(JSON.stringify(byteString(testHash)));
    });
  });
  describe("assetName", () => {
    test("assetName", () => {
      const result = assetName("abcd");
      expect(JSON.stringify(result)).toBe(JSON.stringify(byteString("abcd")));
    });
  });
  describe("tokenName", () => {
    test("tokenName", () => {
      const result = tokenName("abcd");
      expect(JSON.stringify(result)).toBe(JSON.stringify(byteString("abcd")));
    });
  });
  describe("assetClass", () => {
    test("assetClass", () => {
      const result = assetClass(testHash, "abcd");
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(conStr0([currencySymbol(testHash), tokenName("abcd")])),
      );
    });
  });
  describe("outputReference", () => {
    test("outputReference", () => {
      const result = outputReference(testTxHash, 1);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([byteString(testTxHash), integer(1)]),
        ),
      );
    });
    test("outputReference - invalid length", () => {
      expect(() => outputReference(testHash, 1)).toThrow;
    });
  });
  describe("txOutRef", () => {
    test("txOutRef", () => {
      const result = txOutRef(testTxHash, 1);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          conStr0([conStr0([byteString(testTxHash)]), integer(1)]),
        ),
      );
    });
  });
  describe("posixTime", () => {
    test("posixTime", () => {
      const result = posixTime(123456789000000);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(integer(123456789000000)),
      );
    });
  });
  describe("dict", () => {
    test("dict", () => {
      const result = dict([
        [byteString("aaaa"), byteString("aaaaaaaa")],
        [byteString("bbbb"), byteString("bbbbbbbb")],
      ]);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify(
          assocMap([
            [byteString("aaaa"), byteString("aaaaaaaa")],
            [byteString("bbbb"), byteString("bbbbbbbb")],
          ]),
        ),
      );
    });
  });
  describe("tuple", () => {
    test("tuple", () => {
      const result = tuple({ bytes: "1234" }, { bytes: "abcd" });
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ list: [{ bytes: "1234" }, { bytes: "abcd" }] }),
      );
    });
  });
});
